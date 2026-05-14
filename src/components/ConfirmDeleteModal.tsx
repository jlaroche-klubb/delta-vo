import { Machine } from "../types/machine";

interface ConfirmDeleteModalProps {
  machine: Machine;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDeleteModal({
  machine,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <div
      className="confirm-delete-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="confirm-delete-modal">
        <div className="confirm-delete-title">
          <span>🗑️</span>
          <span>Archiver la machine ?</span>
        </div>

        <div className="confirm-delete-text">
          Vous êtes sur le point d'archiver la nacelle{" "}
          <strong>{machine.immat}</strong>{" "}
          <span style={{ color: "#6a7488" }}>
            ({machine.type_nacelle} · {machine.modele_porteur})
          </span>
          .
          <br />
          <br />
          Elle sera cachée des listes mais reste récupérable via le filtre{" "}
          <strong>« Voir archivées »</strong>.
        </div>

        <div className="confirm-delete-actions">
          <button className="btn-cancel-delete" onClick={onCancel}>
            Annuler
          </button>
          <button className="btn-confirm-delete" onClick={onConfirm}>
            🗑️ Archiver
          </button>
        </div>
      </div>
    </div>
  );
}