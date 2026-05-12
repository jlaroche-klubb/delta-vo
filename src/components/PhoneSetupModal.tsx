import { useState } from "react";

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
          <h2>👤 Compléter votre profil</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="phone-setup-body">
          <div className="phone-setup-icon">📞</div>
          <h3 className="phone-setup-title">
            Bonjour {userName} !
          </h3>
          <p className="phone-setup-text">
            Pour générer des fiches commerciales, nous avons besoin de votre <strong>numéro de téléphone professionnel</strong>.
          </p>
          <p className="phone-setup-text">
            Il apparaîtra sur les fiches que vous générerez pour que vos clients puissent vous contacter directement.
          </p>

          <div className="phone-field">
            <label>
              Téléphone professionnel <span className="required">*</span>
            </label>
            <input
              type="tel"
              placeholder="ex : 06 12 34 56 78"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
            <div className="phone-hint">
              💡 Cette information n'est demandée qu'une seule fois
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Plus tard
          </button>
          <button className="btn-primary" onClick={handleSave}>
            💾 Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}