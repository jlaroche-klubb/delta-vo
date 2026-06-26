import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
          <span>{t("modals.delTitle")}</span>
        </div>

        <div className="confirm-delete-text">
          {t("modals.delIntro")}{" "}
          <strong>{machine.immat}</strong>{" "}
          <span style={{ color: "#6a7488" }}>
            ({machine.type_nacelle} · {machine.modele_porteur})
          </span>
          .
          <br />
          <br />
          {t("modals.delHint")}{" "}
          <strong>{t("modals.delArchivedFilter")}</strong>.
        </div>

        <div className="confirm-delete-actions">
          <button className="btn-cancel-delete" onClick={onCancel}>
            {t("modals.cancel")}
          </button>
          <button className="btn-confirm-delete" onClick={onConfirm}>
            🗑️ {t("modals.archive")}
          </button>
        </div>
      </div>
    </div>
  );
}
