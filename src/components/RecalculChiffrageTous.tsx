import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { useMachines } from "../contexts/MachinesContext";
import { getDossierNE } from "../services/nacelleExpertService";
import { calculerChiffrageDossier, chiffrageIncomplet } from "../utils/tarifsNacelleExpert";

/**
 * 💶 BOUTON SUPER ADMIN — « Recalculer tous les chiffrages à 0 ».
 *
 * Parcourt TOUTES les machines Disponibles + Restitutions dont le montant
 * d'expertise est à 0 € (ou absent), relit chaque dossier Nacelle Expert et
 * applique le barème actuel (1re tranche pour les postes carrosserie non
 * chiffrés). Une seule confirmation au départ, bilan détaillé à la fin.
 * Les machines sans expertise NE ou rendues conformes (0 € justifié) sont
 * laissées telles quelles et listées dans le bilan.
 */
export default function RecalculChiffrageTous() {
  const { profile } = useAuth();
  const { machines, enregistrerChiffrageCorrige } = useMachines();
  const { t } = useTranslation();
  const [progress, setProgress] = useState<string | null>(null);

  if (profile?.role !== "superadmin") return null;

  const cibles = machines.filter(
    (m) =>
      (m.statut === "disponible" || m.statut === "restitution") &&
      !m.archived &&
      m.immat &&
      chiffrageIncomplet(m) &&
      !m.chiffrage_corrige
  );
  if (!cibles.length && !progress) return null;

  const par = profile ? `${profile.prenom} ${profile.nom}`.trim() : "";

  async function recalculerTout() {
    if (progress) return;
    const ok = window.confirm(t("chiffrage.confirmTous", { count: cibles.length }));
    if (!ok) return;

    let recalculees = 0;
    let totalPose = 0;
    const sansExpertise: string[] = [];
    const conformes: string[] = [];
    const enAttente: string[] = [];
    const erreurs: string[] = [];

    for (let i = 0; i < cibles.length; i++) {
      const m = cibles[i];
      setProgress(`${i + 1}/${cibles.length}`);
      try {
        const d = await getDossierNE(m.immat);
        if (!d || !d.retour) {
          sansExpertise.push(m.immat);
          continue;
        }
        const r = calculerChiffrageDossier(d);
        if (!r.degats.length || r.total_retenue_ht <= 0) {
          // Expertise sans dégât (nacelle conforme) ou uniquement des postes
          // nacelle en attente de devis : 0 € justifié, on ne touche pas.
          (r.nb_attente ? enAttente : conformes).push(m.immat);
          continue;
        }
        await enregistrerChiffrageCorrige(
          m.id,
          {
            ...(m.rapport_expertise || {}),
            total_retenue_ht: r.total_retenue_ht,
            degats: r.degats,
          },
          "recalcul",
          par
        );
        recalculees++;
        totalPose += r.total_retenue_ht;
        if (r.nb_attente) enAttente.push(m.immat);
      } catch (e: any) {
        erreurs.push(`${m.immat} (${e?.message || e})`);
      }
    }
    setProgress(null);

    alert(
      `✅ Recalcul terminé sur ${cibles.length} machine(s) à 0 € :\n\n` +
        `• ${recalculees} chiffrage(s) posé(s) — total ${totalPose.toLocaleString("fr-FR")} € HT\n` +
        (conformes.length ? `• ${conformes.length} conforme(s), 0 € justifié : ${conformes.join(", ")}\n` : "") +
        (enAttente.length ? `• ⏳ postes nacelle encore en attente de devis : ${enAttente.join(", ")}\n` : "") +
        (sansExpertise.length ? `• ${sansExpertise.length} sans expertise Nacelle Expert (à saisir à la main) : ${sansExpertise.join(", ")}\n` : "") +
        (erreurs.length ? `• ⚠ erreurs : ${erreurs.join(", ")}` : "")
    );
  }

  return (
    <button
      className="btn-import"
      onClick={recalculerTout}
      disabled={!!progress}
      title={t("chiffrage.btnTousTitle")}
    >
      {progress ? `⏳ ${progress}` : `🔄 ${t("chiffrage.btnTous", { count: cibles.length })}`}
    </button>
  );
}
