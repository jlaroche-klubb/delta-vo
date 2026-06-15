import { useState } from "react";
import { Machine } from "../types/machine";

interface EditPriceModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (id: string, prixFr: number | undefined, prixDealer: number | undefined, numeroDossier?: string) => void;
}

export default function EditPriceModal({ machine, userName, onClose, onSave }: EditPriceModalProps) {
  const [prixFr, setPrixFr] = useState<string>(
    machine.prix_fr !== undefined ? String(machine.prix_fr) : ""
  );
  const [prixDealer, setPrixDealer] = useState<string>(
    machine.prix_dealer !== undefined ? String(machine.prix_dealer) : ""
  );
  const [numeroDossier, setNumeroDossier] = useState<string>(
    machine.numero_dossier || ""
  );

  function handleSave() {
    const fr = prixFr.trim() ? parseInt(prixFr.replace(/\s/g, ""), 10) : undefined;
    const dealer = prixDealer.trim() ? parseInt(prixDealer.replace(/\s/g, ""), 10) : undefined;

    if (fr !== undefined && isNaN(fr)) {
      alert("Le prix FR doit être un nombre");
      return;
    }
    if (dealer !== undefined && isNaN(dealer)) {
      alert("Le prix Dealer doit être un nombre");
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
            <h2>Modifier les prix</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="edit-price-body">
          <div className="warning-banner">
            ⚠️ Modification manuelle hors workflow Excel.<br />
            Tracée dans l'historique avec ton nom : <strong>{userName}</strong>
          </div>

          <div className="price-fields">
            <div className="price-field">
              <label>Prix FR (en €)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="38 500"
                value={prixFr}
                onChange={(e) => setPrixFr(e.target.value)}
                autoFocus
              />
              {machine.prix_fr !== undefined && (
                <div className="price-current">
                  Actuel : {machine.prix_fr.toLocaleString("fr-FR")} €
                </div>
              )}
            </div>

            <div className="price-field">
              <label>Prix Dealer (en €)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="42 000"
                value={prixDealer}
                onChange={(e) => setPrixDealer(e.target.value)}
              />
              {machine.prix_dealer !== undefined && (
                <div className="price-current">
                  Actuel : {machine.prix_dealer.toLocaleString("fr-FR")} €
                </div>
              )}
            </div>
          </div>

          <div className="hint-box">
            💡 Laisse un champ vide pour effacer ce prix
          </div>

          <div className="price-field" style={{ marginTop: 14 }}>
            <label>Numéro de dossier (interne)</label>
            <input
              type="text"
              placeholder="Ex. 1956KF"
              value={numeroDossier}
              onChange={(e) => setNumeroDossier(e.target.value)}
            />
            {machine.numero_dossier && (
              <div className="price-current">Actuel : {machine.numero_dossier}</div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
