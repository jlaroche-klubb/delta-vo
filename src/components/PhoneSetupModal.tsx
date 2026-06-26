import { useState } from "react";
import { useTranslation } from "react-i18next";

interface PhoneSetupModalProps {
  userName: string;
  onClose: () => void;
  onSave: (phone: string) => void;
}

export default function PhoneSetupModal({
  userName,
  onClose,
  onSave,
}: PhoneSetupModalProps) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");

  function handleSave() {
    const cleaned = phone.trim();
    if (!cleaned) {
      alert("Le téléphone est obligatoire");
      return;
    }
    // Validation simple : au moins 10 chiffres
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length < 10) {
      alert("Numéro de téléphone invalide (10 chiffres minimum)");
      return;
    }
    onSave(cleaned);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-phone-setup">
        <div className="modal-header">
          <h2>👤 {t("modals.phoneTitle")}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="phone-setup-body">
          <div className="phone-setup-icon">📞</div>
          <h3 className="phone-setup-title">
            {t("modals.phoneHello")} {userName} !
          </h3>
          <p className="phone-setup-text">
            {t("modals.phoneText1a")} <strong>{t("modals.phoneText1b")}</strong>.
          </p>
          <p className="phone-setup-text">
            {t("modals.phoneText2")}
          </p>

          <div className="phone-field">
            <label>
              {t("modals.phoneLabel")} <span className="required">*</span>
            </label>
            <input
              type="tel"
              placeholder="ex : 06 12 34 56 78"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
            <div className="phone-hint">
              💡 {t("modals.phoneHint")}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.later")}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            💾 {t("modals.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
