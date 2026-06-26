import { useState } from "react";
import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

interface ChoixPrixModalProps {
  machine: Machine;
  onClose: () => void;
  onConfirm: (prixChoisi: "fr" | "dealer") => void;
}

export default function ChoixPrixModal({ machine, onClose, onConfirm }: ChoixPrixModalProps) {
  const { t } = useTranslation();
  const [choix, setChoix] = useState<"fr" | "dealer">("fr");

  const hasPrixFr = machine.prix_fr !== undefined;
  const hasPrixDealer = machine.prix_dealer !== undefined;

  function handleConfirm() {
    onConfirm(choix);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-choix-prix">
        <div className="modal-header">
          <div>
            <h2>📄 {t("modals.choixTitle")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="choix-prix-body">
          <p className="choix-prix-question">
            {t("modals.choixQuestion")}
          </p>

          <div className="choix-prix-grid">
            {hasPrixFr && (
              <button
                className={`choix-prix-btn ${choix === "fr" ? "active" : ""}`}
                onClick={() => setChoix("fr")}
              >
                <div className="choix-prix-flag">🇫🇷</div>
                <div className="choix-prix-label">{t("modals.versionFrance")}</div>
                <div className="choix-prix-value">
                  {machine.prix_fr!.toLocaleString("fr-FR")} €
                </div>
                <div className="choix-prix-sub">{t("modals.priceFrShort")}</div>
              </button>
            )}
{hasPrixDealer && (
  <button
    className={`choix-prix-btn ${choix === "dealer" ? "active" : ""}`}
    onClick={() => setChoix("dealer")}
  >
    <div className="choix-prix-label">{t("modals.versionDealer")}</div>
    <div className="choix-prix-value">
      {machine.prix_dealer!.toLocaleString("fr-FR")} €
    </div>
    <div className="choix-prix-sub">{t("modals.priceDealerShort")}</div>
  </button>
)}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary" onClick={handleConfirm}>
            📄 {t("modals.generatePdf")}
          </button>
        </div>
      </div>
    </div>
  );
}
