// ============================================================
// 🔧 MISE EN PRÉPARATION AUTOMATIQUE À LA SIGNATURE D'UN DEVIS
// ============================================================
// Décision Jonathan (28/10/2026) : un devis signé (en ligne ou DocuSign) fait
// passer ses nacelles en préparation — vente, client = société du devis,
// commercial = auteur du devis, type de préparation et date de livraison
// choisis à la création du devis. Mêmes champs que l'appli (configureEnCours)
// et que le connecteur (mettre_en_preparation) ; produit HubSpot archivé
// (même fonction serveur que l'appli, best-effort).
// Une VENTE ne déclenche jamais de départ Nacelle Expert.
// ============================================================

import admin from "firebase-admin";

const ETAPES_NORMALE = [
  { label: "Lavage / nettoyage", has_na: false }, { label: "Contrôle technique", has_na: true },
  { label: "VGP", has_na: true }, { label: "Remise en état carrosserie", has_na: true },
  { label: "Révision mécanique", has_na: true }, { label: "Photos commerciales", has_na: false },
];
const ETAPES_EN_ETAT = [
  { label: "Lavage / nettoyage", has_na: false }, { label: "Photos commerciales", has_na: false },
];
const creerEtapesPrepa = (type: "normale" | "en_etat") =>
  (type === "normale" ? ETAPES_NORMALE : ETAPES_EN_ETAT).map((e, i) => ({ id: `etape-${i + 1}`, label: e.label, done: false, non_necessaire: false, has_na: e.has_na }));

const DELTA_VO_URL = "https://delta-vo.vercel.app";
const DELTA_VO_WEB_KEY = "AIzaSyD9BhTym5Rjm-UK2-F2ES4PV5NUjxJR8HY"; // clé web publique (même que le front)
const UID_SERVICE = "service-signature-devis";
let jeton: { valeur: string; expire: number } | null = null;

/** Jeton Delta VO d'un utilisateur technique (pour appeler hubspot-sync-product comme l'appli) */
async function jetonService(app: admin.app.App): Promise<string> {
  if (jeton && Date.now() < jeton.expire) return jeton.valeur;
  const uref = admin.firestore(app).collection("users").doc(UID_SERVICE);
  if (!(await uref.get()).exists) {
    await uref.set({ role: "admin", prenom: "Signature", nom: "(devis)", email: "signature-devis@delta-vo.local", service: true, createdAt: new Date().toISOString() });
  }
  const custom = await admin.auth(app).createCustomToken(UID_SERVICE, { service: "signature-devis" });
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${DELTA_VO_WEB_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.idToken) throw new Error(`jeton service indisponible (${r.status})`);
  jeton = { valeur: j.idToken, expire: Date.now() + 50 * 60 * 1000 };
  return jeton.valeur;
}

async function archiverHubspot(app: admin.app.App, immat: string): Promise<void> {
  try {
    await fetch(`${DELTA_VO_URL}/api/hubspot-sync-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await jetonService(app)}` },
      body: JSON.stringify({ action: "archive", immat }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e: any) {
    console.warn(`HubSpot archive ${immat} non synchronisé :`, e?.message || e);
  }
}

const CANON_LOCALITE: Record<string, string> = {
  egi: "EGI", egi08: "EGI", ferriere: "Ferrières", ferrieres: "Ferrières", croissy: "Croissy",
  avignon: "Avignon", stalban: "St Alban", saintalban: "St Alban", stalbanleysse: "St Alban",
};
function site(raw?: string | null): string {
  if (!raw) return "";
  const k = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s.\-_']/g, "");
  return CANON_LOCALITE[k] || raw.trim();
}

/** 📧 Préparateurs du site prévenus — même fonction serveur que l'appli (best-effort) */
async function notifierPreparateurs(app: admin.app.App, d: any, typePrepa: "normale" | "en_etat", acheteur: string, commercial: string, livraison: string, par: string): Promise<string> {
  const s = site(d.localite);
  if (!s) return "site inconnu : préparateurs non prévenus";
  try {
    const r = await fetch(`${DELTA_VO_URL}/api/notify-preparation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await jetonService(app)}` },
      body: JSON.stringify({
        immat: d.immat, site: s, reference: d.numero_dossier || "", type_nacelle: d.type_nacelle || "", modele_porteur: d.modele_porteur || "",
        annee: d.annee_circulation || "", type_prepa: typePrepa, type_sortie: "vente", acheteur, commercial, date_livraison_prevue: livraison, par,
        etapes: creerEtapesPrepa(typePrepa).map((e) => e.label),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 404) return `aucun préparateur configuré pour ${s}`;
    if (!r.ok) return `préparateurs non prévenus (${j.error || r.status})`;
    const to: string[] = Array.isArray(j.to) ? j.to : [];
    await admin.firestore(app).collection("machines_vo").doc(d._id || d.immat).update({ notif_prepa: { date: new Date().toISOString(), to, site: s, par } }).catch(() => undefined);
    return `préparateurs de ${s} prévenus (${to.length})`;
  } catch (e: any) {
    return `préparateurs non prévenus (${e?.message || e})`;
  }
}

export interface ResultatPrepa { reference: string; ok: boolean; detail: string }

/**
 * Passe en préparation les nacelles d'un devis signé.
 * Ne touche une machine que si elle porte encore CE devis et qu'elle est vendable.
 */
export async function mettreEnPreparationDevis(app: admin.app.App, dv: any, dateSignature: string, par: string): Promise<ResultatPrepa[]> {
  const db = admin.firestore(app);
  const typePrepa: "normale" | "en_etat" = dv.preparation?.type_prepa === "en_etat" ? "en_etat" : "normale";
  const jour = dateSignature.slice(0, 10);
  const livraison = /^\d{4}-\d{2}-\d{2}$/.test(String(dv.preparation?.date_livraison || "")) ? dv.preparation.date_livraison : jour;
  const acheteur = String(dv.client?.raison_sociale || "").trim();
  const commercial = String(dv.commercial?.nom || "").trim();
  const out: ResultatPrepa[] = [];

  for (const l of dv.lignes || []) {
    const reference = l.reference || l.immat || "?";
    if (!l.machine_id) { out.push({ reference, ok: false, detail: "fiche introuvable" }); continue; }
    const ref = db.collection("machines_vo").doc(l.machine_id);
    try {
      const resultat = await db.runTransaction(async (tx) => {
        const d: any = (await tx.get(ref)).data();
        if (!d) return { ok: false, detail: "fiche introuvable" };
        const st = d.statut || "restitution";
        if (d.archived) return { ok: false, detail: "fiche archivée" };
        if (d.devis_vente_numero !== dv.numero) return { ok: false, detail: "l'offre a été retirée de la fiche" };
        if (st === "en_cours" || st === "cloturee" || st === "louee_lld") return { ok: false, detail: `déjà ${st === "en_cours" ? "en préparation" : st === "cloturee" ? "vendue" : "louée"}` };
        if (st === "restitution" && !(d.expertise_recue ?? true)) return { ok: false, detail: "expertise Nacelle Expert pas encore reçue (machine non vendable)" };
        const now = new Date().toISOString();
        tx.update(ref, {
          historique: admin.firestore.FieldValue.arrayUnion({ date: now, de: st, vers: "en_cours", source: "devis_signe", par, note: `vente — ${acheteur} (devis ${dv.numero} signé)` }),
          statut: "en_cours",
          type_sortie: "vente",
          type_prepa: typePrepa,
          acheteur,
          commercial_vendeur: commercial,
          date_vente: jour,
          date_livraison_prevue: livraison,
          date_mise_en_cours: now,
          etapes_prepa: creerEtapesPrepa(typePrepa),
          ...(dv.client?.contact_email ? { email_sortie: dv.client.contact_email } : {}),
          updatedAt: now,
        });
        return { ok: true, detail: `en préparation (${typePrepa === "normale" ? "préparation normale" : "en l'état"}, livraison ${livraison.split("-").reverse().join("/")})`, machine: { ...d, _id: l.machine_id, immat: d.immat || l.machine_id } };
      });
      let detail = resultat.detail;
      if (resultat.ok) {
        const m = (resultat as any).machine;
        await archiverHubspot(app, m.immat);
        detail += ` — ${await notifierPreparateurs(app, m, typePrepa, acheteur, commercial, livraison, par)}`;
      }
      out.push({ reference, ok: resultat.ok, detail });
    } catch (e: any) {
      out.push({ reference, ok: false, detail: `erreur (${e?.message || e})` });
    }
  }
  return out;
}
