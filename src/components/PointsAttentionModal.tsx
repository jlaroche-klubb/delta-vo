import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Machine, PointsAttention } from "../types/machine";
import { MOTIFS_ATTENTION } from "../utils/pointsAttention";

interface Props {
  machine: Machine;
  par: string;
  onClose: () => void;
  onSave: (machineId: string, points: PointsAttention | null) => Promise<void> | void;
}

/**
 * 🚩 Saisie des points d'attention vendeurs (motifs cochables + texte libre).
 * Enregistrer sans rien cocher ni écrire = effacer le signalement.
 */
export default function PointsAttentionModal({ machine, par, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const existant = machine.points_attention;
  const [motifs, setMotifs] = useState<string[]>(existant?.motifs || []);
  const [texte, setTexte] = useState(existant?.texte || "");
  const [busy, setBusy] = useState(false);

  function toggle(key: string) {
    setMotifs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    setBusy(true);
    try {
      const vide = motifs.length === 0 && !texte.trim();
      await onSave(
        machine.id,
        vide ? null : { motifs, texte: texte.trim() || undefined, date: new Date().toISOString(), par }
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-lld">
        <div className="modal-header">
          <div>
            <h2>🚩 {t("attention.title")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="lld-body">
          <div className="lld-info-box">
            <div className="lld-icon-large">🚩</div>
            <div>
              <strong>{t("attention.heading")}</strong>
              <div className="info-text">{t("attention.info")}</div>
            </div>
          </div>

          <div className="lld-field">
            <label>{t("attention.motifs")}</label>
            <div className="attention-grid">
              {MOTIFS_ATTENTION.map((m) => {
                const on = motifs.includes(m.key);
                return (
                  <label key={m.key} className={`attention-choice ${on ? "on" : ""} ${m.gravite}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(m.key)} />
                    <span>{m.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="lld-field">
            <label>{t("attention.texte")}</label>
            <textarea
              className="attention-textarea"
              rows={3}
              maxLength={300}
              placeholder={t("attention.textePlaceholder")}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
            />
          </div>

          {existant && (
            <div className="attention-meta">
              {t("attention.lastEdit", { date: new Date(existant.date).toLocaleDateString("fr-FR"), par: existant.par })}
            </div>
          )}

          <div className="modal-footer" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || (motifs.length === 0 && !texte.trim())}
              onClick={() => {
                setMotifs([]);
                setTexte("");
              }}
            >
              {t("attention.clear")}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                {t("card.cancel")}
              </button>
              <button type="button" className="btn-primary" onClick={handleSave} disabled={busy}>
                {busy ? "…" : t("attention.save")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
