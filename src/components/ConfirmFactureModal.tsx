import { useState } from "react";
import { Machine } from "../types/machine";

interface ConfirmFactureModalProps {
  machine: Machine;
  onClose: () => void;
  onConfirm: (machineId: string, numeroFacture: string, dateFacturation: string) => void;
}

export default function ConfirmFactureModal({
  machine,
  onClose,
  onConfirm,
}: ConfirmFactureModalProps) {
  const [numeroFacture, setNumeroFacture] = useState("");
  const [dateFacturation, setDateFacturation] = useState(
    new Date().toISOString().slice(0, 10)
  );

  function handleConfirm() {
    if (!numeroFacture.trim()) {
      alert("Le numéro de facture est obligatoire");
      return;
    }
    if (!dateFacturation) {
      alert("La date de facturation est obligatoire");
      return;
    }
    onConfirm(machine.id, numeroFacture.trim(), dateFacturation);
    onClose();
  }

  function formatDate(iso: string | undefined): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("fr-FR");
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-confirm-facture">
        <div className="modal-header">
          <h2>Marquer comme facturée</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="confirm-body">
          <div className="confirm-icon">📄</div>
          <p className="confirm-question">
            Saisir les informations de facturation
          </p>

          <div className="confirm-recap">
            <div className="recap-row">
              <span className="recap-label">Immatriculation</span>
              <span className="recap-value recap-immat">{machine.immat}</span>
            </div>
            <div className="recap-row">
              <span className="recap-label">Modèle</span>
              <span className="recap-value">
                {machine.type_nacelle} · {machine.modele_porteur}
              </span>
            </div>
            <div className="recap-row">
              <span className="recap-label">Acheteur</span>
              <span className="recap-value">{machine.acheteur || "—"}</span>
            </div>
            <div className="recap-row">
              <span className="recap-label">Commercial</span>
              <span className="recap-value">{machine.commercial_vendeur || "—"}</span>
            </div>
            <div className="recap-row">
              <span className="recap-label">Date de vente</span>
              <span className="recap-value">{formatDate(machine.date_vente)}</span>
            </div>
          </div>

          {/* Champs à remplir */}
          <div className="facture-fields">
            <div className="facture-field">
              <label>
                N° de facture <span className="required">*</span>
              </label>
              <input
                type="text"
                placeholder="ex : FACT-2026-042"
                value={numeroFacture}
                onChange={(e) => setNumeroFacture(e.target.value)}
                autoFocus
              />
              <div className="facture-hint">
                💡 Le numéro qui correspond à votre logiciel de compta
              </div>
            </div>
            <div className="facture-field">
              <label>
                Date de facturation <span className="required">*</span>
              </label>
              <input
                type="date"
                value={dateFacturation}
                onChange={(e) => setDateFacturation(e.target.value)}
              />
            </div>
          </div>

          <div className="confirm-warning">
            ⚠ Cette action est <strong>irréversible</strong>. La machine basculera
            automatiquement dans les <strong>Clôturées</strong>. Le suivi du
            paiement client se fera ensuite depuis cet écran.
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary btn-success" onClick={handleConfirm}>
            ✓ Confirmer la facturation
          </button>
        </div>
      </div>
    </div>
  );
}