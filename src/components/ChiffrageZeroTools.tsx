import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { useMachines } from "../contexts/MachinesContext";
import { getDossierNE } from "../services/nacelleExpertService";
import { calculerChiffrageDossier } from "../utils/tarifsNacelleExpert";
import type { Machine } from "../types/machine";

/**
 * 💶 OUTIL SUPER ADMIN — « chiffrage à zéro » (validé avec Jonathan).
 *
 * Opération de rattrapage ponctuelle : certaines machines en Disponibles /
 * Restitutions ont un montant d'expertise à 0 € (postes « sur devis » jamais
 * chiffrés par l'ancien circuit). Deux voies pour poser le montant :
 *  - 🔄 Recalcul : relit le dossier Nacelle Expert et applique le barème
 *    actuel (1re tranche pour les postes carrosserie non chiffrés) ;
 *  - ✏ Saisie : le super admin tape directement le montant HT connu.
 * Visible UNIQUEMENT en super admin, uniquement quand le chiffrage est à 0.
 */
export default function ChiffrageZeroTools({ machine }: { machine: Machine }) {
  const { profile } = useAuth();
  const { enregistrerChiffrageCorrige } = useMachines();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const isSuperAdmin = profile?.role === "superadmin";
  const total = machine.rapport_expertise?.total_retenue_ht;
  if (!isSuperAdmin) return null;
  if (total != null && total > 0) return null;
  if (machine.statut !== "restitution" && machine.statut !== "disponible") return null;

  const par = profile ? `${profile.prenom} ${profile.nom}`.trim() : "";

  async function recalculer() {
    if (busy) return;
    setBusy(true);
    try {
      const d = await getDossierNE(machine.immat);
      if (!d || !d.retour) {
        alert(t("chiffrage.aucuneExpertise", { immat: machine.immat }));
        return;
      }
      const r = calculerChiffrageDossier(d);
      if (!r.degats.length) {
        alert(t("chiffrage.aucunDegat", { immat: machine.immat }));
        return;
      }
      const apercu = r.degats
        .map((dg) => `• ${dg.description} : ${dg.montant.toLocaleString("fr-FR")} €`)
        .join("\n");
      const ok = window.confirm(
        t("chiffrage.confirmRecalc", { immat: machine.immat }) +
          "\n\n" + apercu +
          `\n\nTOTAL : ${r.total_retenue_ht.toLocaleString("fr-FR")} € HT` +
          (r.nb_attente ? `\n⏳ ${r.nb_attente} poste(s) resteront en attente de devis atelier` : "")
      );
      if (!ok) return;
      await enregistrerChiffrageCorrige(
        machine.id,
        {
          ...(machine.rapport_expertise || {}),
          total_retenue_ht: r.total_retenue_ht,
          degats: r.degats,
        },
        "recalcul",
        par
      );
    } catch (e: any) {
      alert("Erreur : " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function saisir() {
    if (busy) return;
    const v = window.prompt(t("chiffrage.promptMontant", { immat: machine.immat }));
    if (v == null) return;
    const montant = Math.round(Number(String(v).replace(",", ".").replace(/[^\d.]/g, "")));
    if (!montant || montant <= 0) {
      alert(t("chiffrage.montantInvalide"));
      return;
    }
    setBusy(true);
    try {
      await enregistrerChiffrageCorrige(
        machine.id,
        {
          ...(machine.rapport_expertise || { degats: [] }),
          total_retenue_ht: montant,
        },
        "manuel",
        par
      );
    } catch (e: any) {
      alert("Erreur : " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "7px 10px",
        margin: "6px 0",
        background: "#fdf6e8",
        border: "1px dashed #d0a943",
        borderRadius: 6,
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 700, color: "#8a6a12" }}>💶 {t("chiffrage.zeroLabel")}</span>
      <button
        type="button"
        disabled={busy}
        onClick={recalculer}
        style={{ border: "1px solid #c8a13a", background: "#fff", color: "#1a2a6e", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
      >
        {busy ? "…" : `🔄 ${t("chiffrage.btnRecalc")}`}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={saisir}
        style={{ border: "1px solid #c8a13a", background: "#fff", color: "#1a2a6e", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, fontWeight: 600 }}
      >
        ✏ {t("chiffrage.btnSaisir")}
      </button>
    </div>
  );
}
