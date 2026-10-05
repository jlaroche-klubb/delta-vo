import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SimulationParc, LigneSim, OptionsParc } from "../utils/importEtatParc";

/**
 * 📋 Simulation de l'import « État de parc » — rien n'est écrit tant que
 * l'utilisateur n'a pas cliqué « Appliquer ». Les conflits (machines en
 * préparation, mentions VOG, machines en vente que le site dit vendues) ne
 * sont appliqués que si leur case est cochée explicitement.
 */
interface Props {
  sim: SimulationParc;
  applying: boolean;
  onConfirm: (options: OptionsParc) => void;
  onCancel: () => void;
}

function Bloc({ title, color, lines, bg }: { title: string; color: string; lines: LigneSim[]; bg?: string }) {
  if (!lines.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color, marginBottom: 6 }}>
        {title} ({lines.length})
      </div>
      {lines.map((l) => (
        <div key={l.immat} style={{ padding: "6px 10px", borderLeft: `3px solid ${color}`, background: bg || "#f8f9fb", marginBottom: 4, fontSize: 13 }}>
          <b>{l.immat}</b> <span style={{ color: "#666" }}>— {l.label}</span>
          {l.detail.map((d, j) => (
            <div key={j} style={{ fontSize: 12, color: "#555", marginTop: 2 }}>· {d}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function ImportEtatParcModal({ sim, applying, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<OptionsParc>({ remettreEnVentePrepa: false, leverVog: false, retirerDeLaVente: false });
  const nbAuto = sim.aCreer.length + sim.aReactiver.length + sim.sitesACorriger.length;
  const nbConflits =
    (opts.remettreEnVentePrepa ? sim.conflitsPrepa.length : 0) +
    (opts.leverVog ? sim.conflitsVog.length : 0) +
    (opts.retirerDeLaVente ? sim.conflitsVente.length : 0);
  const total = nbAuto + nbConflits;

  const Case = ({ k, lines, label }: { k: keyof OptionsParc; lines: LigneSim[]; label: string }) =>
    lines.length ? (
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#8a4a10", marginBottom: 8 }}>
        <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} disabled={applying} style={{ width: "auto", marginTop: 2 }} />
        <span>{label} ({lines.length})</span>
      </label>
    ) : null;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !applying) onCancel(); }}>
      <div className="modal modal-import-result" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <h2>📋 {t("etatParc.title")}</h2>
            <div className="modal-subtitle">{sim.sources.join(" · ")} — {t("etatParc.lignes", { n: sim.totalLignes })}</div>
          </div>
          <button className="btn-close" onClick={onCancel} disabled={applying}>✕</button>
        </div>

        <div className="import-result-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <div className="import-stats">
            <div className="import-stat import-stat-ok"><div className="import-stat-value">{sim.aCreer.length}</div><div className="import-stat-label">{t("etatParc.aCreer")}</div></div>
            <div className="import-stat"><div className="import-stat-value">{sim.aReactiver.length + sim.sitesACorriger.length}</div><div className="import-stat-label">{t("etatParc.aCorriger")}</div></div>
            <div className="import-stat" style={{ borderColor: "#f0c37a" }}><div className="import-stat-value" style={{ color: "#b7791f" }}>{sim.conflitsPrepa.length + sim.conflitsVog.length + sim.conflitsVente.length}</div><div className="import-stat-label">{t("etatParc.conflits")}</div></div>
            <div className="import-stat"><div className="import-stat-value" style={{ color: "#1e7e46" }}>{sim.dejaOk.length}</div><div className="import-stat-label">{t("etatParc.dejaOk")}</div></div>
          </div>
          <div style={{ fontSize: 12, color: "#666", margin: "10px 0 14px" }}>{t("etatParc.note")}</div>

          <Bloc title={t("etatParc.aCreer")} color="#1e7e46" lines={sim.aCreer} />
          <Bloc title={t("etatParc.aReactiver")} color="#1a2a6e" lines={sim.aReactiver} />
          <Bloc title={t("etatParc.sites")} color="#1a2a6e" lines={sim.sitesACorriger} />

          {(sim.conflitsPrepa.length || sim.conflitsVog.length || sim.conflitsVente.length) ? (
            <div style={{ marginBottom: 16, padding: "12px 14px", background: "#fff7e6", border: "1px solid #f0c37a", borderRadius: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#b7791f", marginBottom: 8 }}>⚠ {t("etatParc.conflitsTitre")}</div>
              <div style={{ fontSize: 12, color: "#7a4a00", marginBottom: 10 }}>{t("etatParc.conflitsNote")}</div>
              <Case k="remettreEnVentePrepa" lines={sim.conflitsPrepa} label={t("etatParc.optPrepa")} />
              <Bloc title={t("etatParc.conflitsPrepa")} color="#b7791f" lines={sim.conflitsPrepa} bg="#fffdf7" />
              <Case k="leverVog" lines={sim.conflitsVog} label={t("etatParc.optVog")} />
              <Bloc title={t("etatParc.conflitsVog")} color="#b7791f" lines={sim.conflitsVog} bg="#fffdf7" />
              <Case k="retirerDeLaVente" lines={sim.conflitsVente} label={t("etatParc.optVente")} />
              <Bloc title={t("etatParc.conflitsVente")} color="#b7791f" lines={sim.conflitsVente} bg="#fffdf7" />
            </div>
          ) : null}

          {sim.ignorees.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#999", marginBottom: 6 }}>{t("etatParc.ignorees")} ({sim.ignorees.length})</div>
              {sim.ignorees.map((l, i) => (
                <div key={i} style={{ padding: "4px 10px", borderLeft: "3px solid #ccc", background: "#fafafa", marginBottom: 3, fontSize: 12, color: "#666" }}>
                  <b>{l.ref}</b> — {l.raison}
                </div>
              ))}
            </div>
          )}
          <Bloc title={t("etatParc.dejaOk")} color="#999" lines={sim.dejaOk} />
        </div>

        <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn-secondary" onClick={onCancel} disabled={applying}>{t("card.cancel")}</button>
          <button className="btn-primary" onClick={() => onConfirm(opts)} disabled={applying || total === 0}>
            {applying ? "⏳" : "✓"} {t("etatParc.appliquer", { n: total })}
          </button>
        </div>
      </div>
    </div>
  );
}
