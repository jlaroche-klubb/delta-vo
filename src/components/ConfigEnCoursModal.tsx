import { useState } from "react";
import { Machine, TypePrepa, creerEtapesPrepa } from "../types/machine";
import { useTranslation } from "react-i18next";

interface ConfigEnCoursModalProps {
  machine: Machine;
  onClose: () => void;
  onSave: (machineId: string, config: ConfigEnCoursPayload) => void;
}

export interface ConfigEnCoursPayload {
  type_prepa: TypePrepa;
  acheteur: string;
  commercial_vendeur: string;
  date_vente: string;
  date_livraison_prevue: string;
}

export default function ConfigEnCoursModal({
  machine,
  onClose,
  onSave,
}: ConfigEnCoursModalProps) {
  const { t } = useTranslation();
  const [typePrepa, setTypePrepa] = useState<TypePrepa>(
    machine.type_prepa || "normale"
  );
  const [acheteur, setAcheteur] = useState(machine.acheteur || "");
  const [commercial, setCommercial] = useState(machine.commercial_vendeur || "");
  const [dateVente, setDateVente] = useState(
    machine.date_vente || new Date().toISOString().slice(0, 10)
  );
  const [dateLivraison, setDateLivraison] = useState(
    machine.date_livraison_prevue || ""
  );

  function handleSave() {
    if (!acheteur.trim()) {
      alert(t("modals.errBuyerReq"));
      return;
    }
    if (!commercial.trim()) {
      alert(t("modals.errSalespersonReq"));
      return;
    }
    if (!dateVente) {
      alert(t("modals.errSaleDateReq"));
      return;
    }

    onSave(machine.id, {
      type_prepa: typePrepa,
      acheteur: acheteur.trim(),
      commercial_vendeur: commercial.trim(),
      date_vente: dateVente,
      date_livraison_prevue: dateLivraison || "",
    });
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-config">
        <div className="modal-header">
          <div>
            <h2>{t("modals.cfgTitle")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="config-body">
          {/* Type de prépa */}
          <div className="config-field">
            <label className="config-label-strong">{t("modals.cfgType")}</label>
            <div className="prepa-choice">
              <button
                type="button"
                className={`choice-btn ${typePrepa === "normale" ? "active" : ""}`}
                onClick={() => setTypePrepa("normale")}
              >
                <div className="choice-icon">🔧</div>
                <div className="choice-title">{t("encard.prepNormal")}</div>
                <div className="choice-desc">
                  {t("modals.cfgNormalDesc")}
                </div>
              </button>
              <button
                type="button"
                className={`choice-btn ${typePrepa === "en_etat" ? "active" : ""}`}
                onClick={() => setTypePrepa("en_etat")}
              >
                <div className="choice-icon">📦</div>
                <div className="choice-title">{t("encard.soldAsIs")}</div>
                <div className="choice-desc">
                  {t("modals.cfgAsIsDesc")}
                </div>
              </button>
            </div>
          </div>

          {/* Acheteur */}
          <div className="config-field">
            <label>
              {t("modals.buyer")} <span className="required">*</span>
            </label>
            <input
              type="text"
              placeholder="ex : BTP Construction SAS"
              value={acheteur}
              onChange={(e) => setAcheteur(e.target.value)}
              autoFocus
            />
          </div>

          {/* Commercial */}
          <div className="config-field">
            <label>
              {t("modals.cfgSalesperson")} <span className="required">*</span>
            </label>
            <input
              type="text"
              placeholder="ex : Sophie Bernard"
              value={commercial}
              onChange={(e) => setCommercial(e.target.value)}
            />
            <div className="config-hint">
              💡 {t("modals.cfgSalesHint")}
            </div>
          </div>

          {/* Dates */}
          <div className="config-row">
            <div className="config-field">
              <label>
                {t("modals.saleDate")} <span className="required">*</span>
              </label>
              <input
                type="date"
                value={dateVente}
                onChange={(e) => setDateVente(e.target.value)}
              />
            </div>
            <div className="config-field">
              <label>{t("modals.cfgDeliveryDate")}</label>
              <input
                type="date"
                value={dateLivraison}
                onChange={(e) => setDateLivraison(e.target.value)}
                min={dateVente}
              />
              <div className="config-hint">
                {t("modals.cfgOptional")}
              </div>
            </div>
          </div>

          {/* Info prix HubSpot */}
          <div className="config-info-box">
            <div className="info-icon-large">💰</div>
            <div>
              <strong>{t("modals.cfgFinalPrice")}</strong>
              <div className="info-text">
                {t("modals.cfgPriceInfo")}
              </div>
            </div>
          </div>

          {/* Récap étapes prépa */}
          {typePrepa === "normale" && (
            <div className="config-info-box config-info-box-success">
              <div className="info-icon-large">📋</div>
              <div>
                <strong>{t("modals.cfgStepsTitle")}</strong>
                <div className="info-text">
                  {t("modals.cfgStepsList")}
                  <br />
                  {t("modals.cfgStepsHint")}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {t("modals.cfgConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
