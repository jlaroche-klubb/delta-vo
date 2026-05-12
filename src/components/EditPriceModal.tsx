import { useState } from "react";
import { Machine } from "../types/machine";

interface EditPriceModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (id: string, prixFr: number | undefined, prixExport: number | undefined) => void;
}

export default function EditPriceModal({ machine, userName, onClose, onSave }: EditPriceModalProps) {
  const [prixFr, setPrixFr] = useState<string>(
    machine.prix_fr !== undefined ? String(machine.prix_fr) : ""
  );
  const [prixExport, setPrixExport] = useState<string>(
    machine.prix_export !== undefined ? String(machine.prix_export) : ""
  );

  function handleSave() {
    const fr = prixFr.trim() ? parseInt(prixFr.replace(/\s/g, ""), 10) : undefined;
    const exp = prixExport.trim() ? parseInt(prixExport.replace(/\s/g, ""), 10) : undefined;

    if (fr !== undefined && isNaN(fr)) {
      alert("Le prix FR doit être un nombre");
      return;
    }
    if (exp !== undefined && isNaN(exp)) {
      alert("Le prix Export doit être un nombre");
      return;
    }

    onSave(machine.id, fr, exp);
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
            ⚠️ Modification manuelle hors workflow Excel.
            <br />
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
              <label>Prix Export (en €)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="42 000"
                value={prixExport}
                onChange={(e) => setPrixExport(e.target.value)}
              />
              {machine.prix_export !== undefined && (
                <div className="price-current">
                  Actuel : {machine.prix_export.toLocaleString("fr-FR")} €
                </div>
              )}
            </div>
          </div>

          <div className="hint-box">
            💡 Laisse un champ vide pour effacer ce prix
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