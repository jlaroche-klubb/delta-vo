import { useState } from "react";
import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

interface LldModalProps {
  machine: Machine;
  onClose: () => void;
  onConfirm: (machineId: string, clientLld: string, dateMiseDispo: string) => void;
}

export default function LldModal({ machine, onClose, onConfirm }: LldModalProps) {
  const { t } = useTranslation();
  const [clientLld, setClientLld] = useState("");
  const [dateMiseDispo, setDateMiseDispo] = useState("");

  function handleConfirm() {
    if (!clientLld.trim()) {
      alert("Le client LLD est obligatoire");
      return;
    }
    if (!dateMiseDispo) {
      alert("La date de mise à disposition est obligatoire");
      return;
    }
    onConfirm(machine.id, clientLld.trim(), dateMiseDispo);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-lld">
        <div className="modal-header">
          <div>
            <h2>🔁 {t("modals.lldTitle")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="lld-body">
          <div className="lld-info-box">
            <div className="lld-icon-large">🔁</div>
            <div>
              <strong>{t("modals.lldHeading")}</strong>
              <div className="info-text">
                {t("modals.lldInfo")}
              </div>
            </div>
          </div>

          <div className="lld-field">
            <label>
              {t("modals.lldClient")} <span className="required">*</span>
            </label>
            <input
              type="text"
              placeholder="ex : BTP Construction SAS"
              value={clientLld}
              onChange={(e) => setClientLld(e.target.value)}
              autoFocus
            />
          </div>

          <div className="lld-field">
            <label>
              {t("modals.lldDate")} <span className="required">*</span>
            </label>
            <input
              type="date"
              value={dateMiseDispo}
              onChange={(e) => setDateMiseDispo(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <div className="config-hint">
              💡 {t("modals.lldHint")}
            </div>
          </div>

          <div className="confirm-warning">
            ⚠ {t("modals.lldWarn1")} <strong>{t("modals.lldWarnAvail")}</strong> {t("modals.lldWarn2")} <strong>{t("modals.lldWarnInProgress")}</strong> {t("modals.lldWarn3")}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary btn-lld-confirm" onClick={handleConfirm}>
            🔁 {t("modals.lldConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
