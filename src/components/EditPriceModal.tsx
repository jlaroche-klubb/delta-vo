import { useState } from "react";
import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

interface EditPriceModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (id: string, prixFr: number | undefined, prixDealer: number | undefined, numeroDossier?: string) => void;
}

export default function EditPriceModal({ machine, userName, onClose, onSave }: EditPriceModalProps) {
  const { t } = useTranslation();
  const [prixFr, setPrixFr] = useState<string>(
    machine.prix_fr != null ? String(machine.prix_fr) : ""
  );
  const [prixDealer, setPrixDealer] = useState<string>(
    machine.prix_dealer != null ? String(machine.prix_dealer) : ""
  );
  const [numeroDossier, setNumeroDossier] = useState<string>(
    machine.numero_dossier || ""
  );

  function handleSave() {
    const fr = prixFr.trim() ? parseInt(prixFr.replace(/\s/g, ""), 10) : undefined;
    const dealer = prixDealer.trim() ? parseInt(prixDealer.replace(/\s/g, ""), 10) : undefined;

    if (fr != null && isNaN(fr)) {
      alert(t("modals.errPriceFrNum"));
      return;
    }
    if (dealer != null && isNaN(dealer)) {
      alert(t("modals.errPriceDealerNum"));
      return;
    }

    onSave(machine.id, fr, dealer, numeroDossier);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-edit-price">
        <div className="modal-header">
          <div>
            <h2>{t("modals.editPriceTitle")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="edit-price-body">
          <div className="warning-banner">
            ⚠️ {t("modals.editPriceWarn1")}<br />
            {t("modals.editPriceWarn2")} <strong>{userName}</strong>
          </div>

          <div className="price-fields">
            <div className="price-field">
              <label>{t("modals.priceFr")}</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="38 500"
                value={prixFr}
                onChange={(e) => setPrixFr(e.target.value)}
                autoFocus
              />
              {machine.prix_fr != null && (
                <div className="price-current">
                  {t("modals.current")} {machine.prix_fr.toLocaleString("fr-FR")} €
                </div>
              )}
            </div>

            <div className="price-field">
              <label>{t("modals.priceDealer")}</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="42 000"
                value={prixDealer}
                onChange={(e) => setPrixDealer(e.target.value)}
              />
              {machine.prix_dealer != null && (
                <div className="price-current">
                  {t("modals.current")} {machine.prix_dealer.toLocaleString("fr-FR")} €
                </div>
              )}
            </div>
          </div>

          <div className="hint-box">
            💡 {t("modals.priceHint")}
          </div>

          <div className="price-field" style={{ marginTop: 14 }}>
            <label>{t("modals.fileNumber")}</label>
            <input
              type="text"
              placeholder="Ex. 1956KF"
              value={numeroDossier}
              onChange={(e) => setNumeroDossier(e.target.value)}
            />
            {machine.numero_dossier && (
              <div className="price-current">{t("modals.current")} {machine.numero_dossier}</div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {t("modals.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
