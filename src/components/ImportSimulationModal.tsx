import { useState } from "react";
import { VogSimulation, VogSimulationLine } from "../utils/importVogMerge";
import { useTranslation } from "react-i18next";

// ============================================================
// SIMULATION D'IMPORT VOG — rapport « à blanc » AVANT écriture.
// Montre exactement ce que l'import fera (logique partagée avec
// l'import réel dans utils/importVogMerge.ts). Rien n'est écrit
// tant que l'utilisateur n'a pas cliqué « Confirmer l'import ».
// ============================================================

interface ImportSimulationModalProps {
  sim: VogSimulation;
  importing: boolean;
  /** purgeIds : ids des machines à ARCHIVER (vide si la purge n'est pas cochée) */
  onConfirm: (purgeIds: string[]) => void;
  onCancel: () => void;
}

function Section({ title, color, lines }: { title: string; color: string; lines: VogSimulationLine[] }) {
  if (!lines.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color, marginBottom: 6 }}>
        {title} ({lines.length})
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ padding: "6px 10px", borderLeft: `3px solid ${color}`, background: "#f8f9fb", marginBottom: 4, fontSize: 13 }}>
          <b>{l.ref}</b> <span style={{ color: "#666" }}>— {l.label}</span>
          {l.detail.length > 0 && (
            <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
              {l.detail.map((d, j) => (
                <div key={j}>· {d}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ImportSimulationModal({ sim, importing, onConfirm, onCancel }: ImportSimulationModalProps) {
  const { t } = useTranslation();
  // 🗄️ Purge exceptionnelle : case à cocher EXPLICITE, décochée par défaut
  const [purgeChecked, setPurgeChecked] = useState(false);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onCancel();
      }}
    >
      <div className="modal modal-import-result" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2>{t("importVog.simTitle")}</h2>
          <button className="btn-close" onClick={onCancel} disabled={importing}>✕</button>
        </div>

        <div className="import-result-body" style={{ maxHeight: "58vh", overflowY: "auto" }}>
          <div className="import-stats">
            <div className="import-stat import-stat-ok">
              <div className="import-stat-value">{sim.aCreer.length}</div>
              <div className="import-stat-label">{t("importVog.simCreate")}</div>
            </div>
            <div className="import-stat">
              <div className="import-stat-value">{sim.aMettreAJour.length}</div>
              <div className="import-stat-label">{t("importVog.simUpdate")}</div>
            </div>
            <div className="import-stat">
              <div className="import-stat-value">{sim.nbPrixModifies}</div>
              <div className="import-stat-label">{t("importVog.simPrices")}</div>
            </div>
            <div className="import-stat import-stat-err">
              <div className="import-stat-value">{sim.ignorees.length}</div>
              <div className="import-stat-label">{t("importVog.simSkipped")}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: "#666", margin: "10px 0 14px" }}>
            {t("importVog.simNote")}
          </div>

          <Section title={t("importVog.simCreate")} color="#1e7e46" lines={sim.aCreer} />
          <Section title={t("importVog.simUpdate")} color="#1a2a6e" lines={sim.aMettreAJour} />
          {sim.ignorees.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#c0392b", marginBottom: 6 }}>
                {t("importVog.simSkipped")} ({sim.ignorees.length})
              </div>
              {sim.ignorees.map((l, i) => (
                <div key={i} style={{ padding: "6px 10px", borderLeft: "3px solid #c0392b", background: "#fdf4f2", marginBottom: 4, fontSize: 13 }}>
                  <b>{l.ref}</b> <span style={{ color: "#666" }}>— {l.raison}</span>
                </div>
              ))}
            </div>
          )}
          <Section title={t("importVog.simUnchanged")} color="#999" lines={sim.inchangees} />

          {/* 🗄️ Purge exceptionnelle : archivage des machines hors périmètre */}
          {sim.aArchiver.length > 0 && (
            <div style={{ marginTop: 8, padding: "12px 14px", background: "#fdf3ec", border: "1px solid #e8c9a8", borderRadius: 6 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#8a4a10" }}>
                <input
                  type="checkbox"
                  checked={purgeChecked}
                  onChange={(e) => setPurgeChecked(e.target.checked)}
                  disabled={importing}
                  style={{ width: "auto", marginTop: 2 }}
                />
                <span>{t("importVog.purgeCheck", { count: sim.aArchiver.length })}</span>
              </label>
              <div style={{ fontSize: 12, color: "#8a5a30", margin: "6px 0 10px 24px" }}>
                {t("importVog.purgeNote")}
              </div>
              {purgeChecked && (
                <div style={{ maxHeight: 180, overflowY: "auto" }}>
                  {sim.aArchiver.map((l, i) => (
                    <div key={i} style={{ padding: "4px 10px", borderLeft: "3px solid #b3541e", background: "#fff", marginBottom: 3, fontSize: 12.5 }}>
                      <b>{l.ref}</b> <span style={{ color: "#666" }}>— {l.label} · {l.detail.join(", ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button className="btn-secondary" onClick={onCancel} disabled={importing}>
            {t("importVog.simCancel")}
          </button>
          <button
            className="btn-primary"
            onClick={() => onConfirm(purgeChecked ? sim.aArchiver.map((l) => l.id) : [])}
            disabled={importing || (sim.aCreer.length + sim.aMettreAJour.length === 0 && !purgeChecked)}
          >
            {importing
              ? `⏳ ${t("importVog.simImporting")}`
              : `✓ ${purgeChecked ? t("importVog.simConfirmPurge", { count: sim.aArchiver.length }) : t("importVog.simConfirm")}`}
          </button>
        </div>
      </div>
    </div>
  );
}
