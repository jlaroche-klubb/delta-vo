import { useState } from "react";
import { Machine, FicheCommerciale } from "../types/machine";
import { useTranslation } from "react-i18next";

interface FicheCommercialeModalProps {
  machine: Machine;
  onClose: () => void;
  onSave: (machineId: string, fiche: FicheCommerciale) => void;
}

export default function FicheCommercialeModal({
  machine,
  onClose,
  onSave,
}: FicheCommercialeModalProps) {
  const { t } = useTranslation();
  const existing = machine.fiche_commerciale || {};

  const [hauteur, setHauteur] = useState<string>(
    existing.hauteur_travail_m?.toString() || ""
  );
  const [deport, setDeport] = useState<string>(
    existing.deport_travail_m?.toString() || ""
  );
  const [nbPersonnes, setNbPersonnes] = useState<number>(
    existing.nb_personnes_panier || 1
  );
  const [puissance, setPuissance] = useState<string>(
    existing.puissance_porteur || ""
  );
  const [options, setOptions] = useState<string[]>(existing.options || []);
  const [newOption, setNewOption] = useState("");
  const [amenagement, setAmenagement] = useState<string>(
    existing.amenagement_interieur || ""
  );

  function handleAddOption() {
    if (newOption.trim()) {
      setOptions([...options, newOption.trim()]);
      setNewOption("");
    }
  }

  function handleRemoveOption(idx: number) {
    setOptions(options.filter((_, i) => i !== idx));
  }

  function handleSave() {
    const h = parseFloat(hauteur.replace(",", "."));
    const d = parseFloat(deport.replace(",", "."));

    if (isNaN(h) || h <= 0) {
      alert(t("modals.errHeightInvalid"));
      return;
    }
    if (isNaN(d) || d <= 0) {
      alert(t("modals.errOutreachInvalid"));
      return;
    }
    if (!puissance.trim()) {
      alert(t("modals.errPowerReq"));
      return;
    }

    // ✅ Construire l'objet sans undefined (Firebase n'accepte pas undefined)
    const ficheData: any = {
      ...existing,
      hauteur_travail_m: h,
      deport_travail_m: d,
      nb_personnes_panier: nbPersonnes,
      puissance_porteur: puissance.trim(),
      options: options.filter((o) => o.trim() !== ""),
    };
    
    // Ajouter amenagement_interieur uniquement s'il est rempli
    const amenagementValue = amenagement.trim();
    if (amenagementValue) {
      ficheData.amenagement_interieur = amenagementValue;
    } else {
      delete ficheData.amenagement_interieur;
    }
    
    // Nettoyer toutes les valeurs undefined avant l'envoi
    Object.keys(ficheData).forEach(key => {
      if (ficheData[key] === undefined) {
        delete ficheData[key];
      }
    });
    
    onSave(machine.id, ficheData);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-fiche-commerciale">
        <div className="modal-header">
          <div>
            <h2>📝 {t("modals.ficheTitle")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="fiche-body">
          {/* Section caractéristiques nacelle */}
          <div className="fiche-section">
            <h3 className="fiche-section-title">🔧 {t("modals.ficheSpecs")}</h3>
            <div className="fiche-row">
              <div className="fiche-field">
                <label>
                  {t("modals.ficheHeight")} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex : 13.80"
                  value={hauteur}
                  onChange={(e) => setHauteur(e.target.value)}
                />
              </div>
              <div className="fiche-field">
                <label>
                  {t("modals.ficheOutreach")} <span className="required">*</span>
                </label>
                <input
                  type="text"
                  placeholder="ex : 7.30"
                  value={deport}
                  onChange={(e) => setDeport(e.target.value)}
                />
              </div>
            </div>
            <div className="fiche-field">
              <label>
                {t("modals.fichePersons")} <span className="required">*</span>
              </label>
              <div className="fiche-radio-group">
                <label className="fiche-radio">
                  <input
                    type="radio"
                    checked={nbPersonnes === 1}
                    onChange={() => setNbPersonnes(1)}
                  />
                  <span>{t("modals.fiche1Person")}</span>
                </label>
                <label className="fiche-radio">
                  <input
                    type="radio"
                    checked={nbPersonnes === 2}
                    onChange={() => setNbPersonnes(2)}
                  />
                  <span>{t("modals.fiche2Persons")}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Section porteur */}
          <div className="fiche-section">
            <h3 className="fiche-section-title">🚐 {t("modals.ficheCarrier")}</h3>
            <div className="fiche-field">
              <label>
                {t("modals.fichePower")} <span className="required">*</span>
              </label>
              <input
                type="text"
                placeholder="ex : 145Cv"
                value={puissance}
                onChange={(e) => setPuissance(e.target.value)}
              />
              <div className="fiche-hint">
                💡 {t("modals.ficheHint")}
              </div>
            </div>
          </div>

          {/* Section options */}
          <div className="fiche-section">
            <h3 className="fiche-section-title">⚙️ {t("modals.ficheOptions")}</h3>
            <div className="options-add">
              <input
                type="text"
                placeholder="ex : Panier isolé basse tension"
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddOption();
                  }
                }}
              />
              <button className="btn-add-option" onClick={handleAddOption}>
                + {t("modals.ficheAdd")}
              </button>
            </div>
            {options.length > 0 && (
              <ul className="options-list">
                {options.map((opt, idx) => (
                  <li key={idx} className="option-item">
                    <span>{opt}</span>
                    <button
                      className="btn-remove-option"
                      onClick={() => handleRemoveOption(idx)}
                      title={t("modals.deleteTitle")}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {options.length === 0 && (
              <div className="options-empty">{t("modals.ficheNoOption")}</div>
            )}
          </div>

          {/* Section aménagement intérieur */}
          <div className="fiche-section">
            <h3 className="fiche-section-title">📦 {t("modals.ficheInterior")}</h3>
            <textarea
              className="fiche-textarea"
              placeholder="ex : 1 meuble 3 étagères 21 bacs"
              value={amenagement}
              onChange={(e) => setAmenagement(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            💾 {t("modals.ficheSave")}
          </button>
        </div>
      </div>
    </div>
  );
}
