import { useState } from "react";
import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

interface MarkPaidModalProps {
  machine: Machine;
  onClose: () => void;
  onConfirm: (machineId: string, dateReglement: string) => void;
}

export default function MarkPaidModal({
  machine,
  onClose,
  onConfirm,
}: MarkPaidModalProps) {
  const { t } = useTranslation();
  const [dateReglement, setDateReglement] = useState(
    new Date().toISOString().slice(0, 10)
  );

  function handleConfirm() {
    if (!dateReglement) {
      alert("La date de règlement est obligatoire");
      return;
    }
    onConfirm(machine.id, dateReglement);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-mark-paid">
        <div className="modal-header">
          <h2>{t("modals.paidTitle")}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="paid-body">
          <div className="paid-icon">💰</div>
          <p className="paid-question">
            {t("modals.paidQuestion")} <strong>{machine.numero_facture}</strong>
          </p>

          <div className="paid-info">
            <div className="paid-info-row">
              <span>{t("modals.buyer")}</span>
              <strong>{machine.acheteur}</strong>
            </div>
            <div className="paid-info-row">
              <span>{t("modals.amount")}</span>
              <strong className="paid-amount">
                {machine.prix_vente_final?.toLocaleString("fr-FR")} €
              </strong>
            </div>
          </div>

          <div className="paid-field">
            <label>
              {t("modals.settlementDate")} <span className="required">*</span>
            </label>
            <input
              type="date"
              value={dateReglement}
              onChange={(e) => setDateReglement(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary btn-success" onClick={handleConfirm}>
            ✓ {t("modals.markPaidBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
