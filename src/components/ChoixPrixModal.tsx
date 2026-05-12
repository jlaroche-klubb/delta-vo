import { useState } from "react";
import { Machine } from "../types/machine";

interface ChoixPrixModalProps {
  machine: Machine;
  onClose: () => void;
  onConfirm: (prixChoisi: "fr" | "export") => void;
}

export default function ChoixPrixModal({ machine, onClose, onConfirm }: ChoixPrixModalProps) {
  const [choix, setChoix] = useState<"fr" | "export">("fr");

  const hasPrixFr = machine.prix_fr !== undefined;
  const hasPrixExport = machine.prix_export !== undefined;

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
            <h2>📄 Quelle version générer ?</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="choix-prix-body">
          <p className="choix-prix-question">
            Choisissez le prix qui apparaîtra sur la fiche envoyée au client :
          </p>

          <div className="choix-prix-grid">
            {hasPrixFr && (
              <button
                className={`choix-prix-btn ${choix === "fr" ? "active" : ""}`}
                onClick={() => setChoix("fr")}
              >
                <div className="choix-prix-flag">🇫🇷</div>
                <div className="choix-prix-label">Version France</div>
                <div className="choix-prix-value">
                  {machine.prix_fr!.toLocaleString("fr-FR")} €
                </div>
                <div className="choix-prix-sub">Prix FR</div>
              </button>
            )}

            {hasPrixExport && (
              <button
                className={`choix-prix-btn ${choix === "export" ? "active" : ""}`}
                onClick={() => setChoix("export")}
              >
                <div className="choix-prix-flag">🌍</div>
                <div className="choix-prix-label">Version Export</div>
                <div className="choix-prix-value">
                  {machine.prix_export!.toLocaleString("fr-FR")} €
                </div>
                <div className="choix-prix-sub">Prix Export</div>
              </button>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={handleConfirm}>
            📄 Générer le PDF
          </button>
        </div>
      </div>
    </div>
  );
}