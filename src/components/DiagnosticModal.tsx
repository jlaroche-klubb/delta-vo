import { useTranslation } from "react-i18next";
import type { Machine } from "../types/machine";
import { LIBELLES_SOURCE, type SourceHistorique } from "../utils/historique";

/**
 * 🔎 DIAGNOSTIC (super admin) — vue brute d'une machine : statut, drapeaux du
 * cycle restitution, cycle Nacelle Expert, dates, et l'HISTORIQUE des
 * changements de statut (qui / quoi / quand). Bouton « Copier » pour coller le
 * tout dans une conversation d'analyse.
 */
export default function DiagnosticModal({ machine, onClose }: { machine: Machine; onClose: () => void }) {
  const { t } = useTranslation();
  const m: any = machine;
  const oui = (v: any) => (v === true ? "✅ oui" : v === false ? "❌ non" : "—");
  const dateFr = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  };

  const lignes: [string, string][] = [
    ["Statut", m.statut || "—"],
    ["Type de sortie", m.type_sortie || "—"],
    ["Archivée", oui(!!m.archived)],
    ["Disponibilité VOG", m.disponibilite_vog || "—"],
    ["Import VOG", oui(m.import_vog)],
    ["1 · Demande récup.", oui(m.recuperation_ok) + (m.date_demande_recuperation ? ` (${m.date_demande_recuperation})` : "")],
    ["2 · Expertise reçue (NE)", oui(m.expertise_recue)],
    ["3 · Expertise OK (étape)", oui(m.expertise_ok)],
    ["4 · Facturé", oui(m.facture_ok) + (m.facture_resti_numero ? ` (${m.facture_resti_numero})` : "")],
    ["5 · Réglé", oui(m.facture_reglee_ok)],
    ["Fiche VO créée", oui(m.fiche_vo_creee)],
    ["Stock depuis", m.date_mise_stock || "—"],
    ["Cycle NE (id)", m.dossier_nacelle_expert?.cycle_id || "—"],
    ["Départ NE", m.dossier_nacelle_expert?.date_depart || "—"],
    ["Retour NE", m.dossier_nacelle_expert?.date_retour || "—"],
    ["Client NE", m.dossier_nacelle_expert?.client || m.client_precedent || "—"],
    ["Départ constaté NE", m.depart_constate_ne || "—"],
    ["Devis en attente", (m.devis_pending_labels || []).length ? m.devis_pending_labels.join(", ") : "—"],
    ["Devis complet / validé", `${oui(m.devis_complet)} / ${m.devis_valide ? "✅ " + (m.devis_valide.par || "") : "❌ non"}`],
    ["Montant expertise", m.rapport_expertise?.total_retenue_ht != null ? `${m.rapport_expertise.total_retenue_ht} € HT` : "—"],
    ["Prix FR / Dealer", `${m.prix_fr ?? "—"} / ${m.prix_dealer ?? "—"}`],
    ["Client LLD", m.client_lld || "—"],
    ["Acheteur", m.acheteur || "—"],
    ["Mise en préparation", dateFr(m.date_mise_en_cours)],
    ["Dernière modification", dateFr(m.updatedAt || m.date_modification)],
  ];

  const historique = [...(m.historique || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const copier = () => {
    const txt =
      `DIAGNOSTIC ${machine.immat} (${new Date().toLocaleString("fr-FR")})\n` +
      lignes.map(([k, v]) => `${k}: ${v}`).join("\n") +
      `\n\nHISTORIQUE\n` +
      (historique.length
        ? historique.map((h: any) => `${dateFr(h.date)} · ${h.de} → ${h.vers} · ${LIBELLES_SOURCE[h.source as SourceHistorique] || h.source} · ${h.par}${h.note ? " · " + h.note : ""}`).join("\n")
        : "(aucune entrée — historique activé le 07/09/2026)");
    navigator.clipboard?.writeText(txt).then(() => alert(t("diag.copie")), () => alert(txt));
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h2>🔎 {t("diag.titre")} — {machine.immat}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: "16px 24px", maxHeight: "70vh", overflowY: "auto", fontSize: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "6px 18px" }}>
            {lignes.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #eef0f4", padding: "4px 0" }}>
                <span style={{ color: "#6a7488" }}>{k}</span>
                <b style={{ color: "#1a2a6e", textAlign: "right" }}>{v}</b>
              </div>
            ))}
          </div>

          <h3 style={{ margin: "18px 0 8px", color: "#1a2a6e", fontSize: 14 }}>🧾 {t("diag.historique")}</h3>
          {historique.length === 0 ? (
            <div style={{ color: "#6a7488" }}>{t("diag.aucunHistorique")}</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#e8edf9", color: "#1a2a6e" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Quand</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>De → vers</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Origine</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Par</th>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((h: any, i: number) => (
                  <tr key={i} style={{ borderBottom: "1px solid #eef0f4" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{dateFr(h.date)}</td>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}><b>{h.de}</b> → <b>{h.vers}</b></td>
                    <td style={{ padding: "6px 8px" }}>{LIBELLES_SOURCE[h.source as SourceHistorique] || h.source}</td>
                    <td style={{ padding: "6px 8px" }}>{h.par}</td>
                    <td style={{ padding: "6px 8px", color: "#4a5468" }}>{h.note || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-footer" style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "12px 24px" }}>
          <button type="button" className="tb-btn" onClick={copier}>📋 {t("diag.copier")}</button>
          <button type="button" className="tb-btn active" onClick={onClose}>{t("common.close", "Fermer")}</button>
        </div>
      </div>
    </div>
  );
}
