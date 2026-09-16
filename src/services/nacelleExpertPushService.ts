import { doc, getDoc, setDoc } from "firebase/firestore";
import { dbNacelleExpert } from "../firebase";
import { normalizeImmat } from "../utils/immat";

/**
 * Synchro inverse Delta VO → Nacelle Expert (infos administratives uniquement).
 *
 * Quand une secrétaire/ADV crée ou corrige une restitution dans Delta VO
 * (client, n° de contrat, email...), ces infos sont poussées dans le bloc
 * `info` du dossier Nacelle Expert correspondant (dossiers/{IMMAT}).
 * Résultat : l'expert retrouve les champs pré-remplis quand il tape
 * l'immatriculation, même sans expertise départ.
 *
 * ⚠️ Règles de sécurité :
 * - Écriture en MERGE : on ne touche JAMAIS aux données d'expertise
 *   (depart, retour, photos, zones, signatures...).
 * - On ne touche PAS au marqueur `synced_to_delta_vo` : un dossier pré-créé
 *   sans ce champ n'est jamais capté par la synchro NE → VO (qui filtre sur
 *   `synced_to_delta_vo == false`), donc aucune boucle possible. Et si une
 *   expertise est en attente de synchro (false), elle le reste.
 */
export interface InfosAdminNacelleExpert {
  immat: string;
  client?: string;
  contrat?: string;
  email?: string;
  modele?: string;
  type_nacelle?: string;
  annee_fab?: string;
}

export async function pushInfosAdminToNacelleExpert(
  infos: InfosAdminNacelleExpert
): Promise<boolean> {
  // ⚠️ Même normalisation que Nacelle Expert (format SIV AB-123-CD) :
  // garantit de retomber sur le MÊME dossier, jamais un doublon.
  const immat = normalizeImmat((infos.immat || "").trim());
  if (!immat) return false;

  // Ne pousser que les champs réellement renseignés (pas d'écrasement par du vide)
  const info: Record<string, string> = { immat };
  if (infos.client) info.client = infos.client;
  if (infos.contrat) info.contrat = infos.contrat;
  if (infos.email) info.email = infos.email;
  if (infos.modele) info.modele = infos.modele;
  if (infos.type_nacelle) info.type_nacelle = infos.type_nacelle;
  if (infos.annee_fab) info.annee_fab = infos.annee_fab;

  try {
    const dossierRef = doc(dbNacelleExpert, "dossiers", immat);

    // createdAt uniquement à la création (ne jamais écraser celui d'un dossier existant)
    const existing = await getDoc(dossierRef);
    const payload: Record<string, unknown> = {
      immat,
      info,
      infos_admin_source: "delta-vo",
      infos_admin_updatedAt: new Date().toISOString(),
    };
    if (!existing.exists()) {
      payload.createdAt = new Date().toISOString();
    }

    await setDoc(dossierRef, payload, { merge: true });
    console.log(`📤 Infos admin poussées vers Nacelle Expert pour ${immat}`);
    return true;
  } catch (e) {
    console.error(`❌ Push infos admin vers Nacelle Expert (${immat}):`, e);
    return false;
  }
}

/**
 * 🔁 PROCHAIN DÉPART (mise en location / configuration d'une location).
 * Le dossier Nacelle Expert de l'immat porte encore la RESTITUTION en cours
 * (client qui doit les frais) : on ne touche PAS à son bloc `info` client /
 * contrat / email. Le nouveau client est rangé dans `info_prochain_depart`,
 * que l'écran « Nouveau départ » de Nacelle Expert utilise pour pré-remplir
 * et qui devient le client du nouveau cycle à la validation du départ.
 * Seule l'identité de la machine (modèle, type, année) est complétée dans `info`.
 */
export async function pushProchainDepartToNacelleExpert(infos: InfosAdminNacelleExpert): Promise<boolean> {
  const immat = normalizeImmat((infos.immat || "").trim());
  if (!immat) return false;
  const prochain: Record<string, string> = {};
  if (infos.client) prochain.client = infos.client;
  if (infos.contrat) prochain.contrat = infos.contrat;
  if (infos.email) prochain.email = infos.email;
  const identite: Record<string, string> = { immat };
  if (infos.modele) identite.modele = infos.modele;
  if (infos.type_nacelle) identite.type_nacelle = infos.type_nacelle;
  if (infos.annee_fab) identite.annee_fab = infos.annee_fab;
  try {
    const dossierRef = doc(dbNacelleExpert, "dossiers", immat);
    const existing = await getDoc(dossierRef);
    const payload: Record<string, unknown> = {
      immat,
      info: identite,
      info_prochain_depart: { ...prochain, updatedAt: new Date().toISOString(), source: "delta-vo" },
      infos_admin_source: "delta-vo",
      infos_admin_updatedAt: new Date().toISOString(),
    };
    if (!existing.exists()) {
      payload.createdAt = new Date().toISOString();
      // Dossier neuf (aucun cycle) : le prochain client EST le client du dossier
      payload.info = { ...identite, ...prochain };
    }
    await setDoc(dossierRef, payload, { merge: true });
    console.log(`📤 Prochain départ poussé vers Nacelle Expert pour ${immat} (${prochain.client || "—"})`);
    return true;
  } catch (e) {
    console.error(`❌ Push prochain départ vers Nacelle Expert (${immat}):`, e);
    return false;
  }
}
