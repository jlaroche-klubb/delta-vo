import { useState } from "react";
import { Machine } from "../types/machine";
import { useMachines } from "../contexts/MachinesContext";
import { useTranslation } from "react-i18next";
import TypeNacelleSelect from "./TypeNacelleSelect";

/**
 * ✏️ Modal d'édition des infos ADMINISTRATIVES d'une fiche machine
 * (secrétaire/ADV/admin) : client, n° de contrat, email, modèle...
 *
 * Fonctionne aussi sur les fiches arrivées par la synchro d'expertise
 * Nacelle-Expert. Les corrections sont répercutées vers Nacelle Expert
 * (bloc info du dossier) pour que les deux applis restent alignées.
 *
 * ⚠️ Les photos et le contenu d'expertise (zones, dégâts, signatures)
 * ne sont volontairement PAS éditables ici.
 */
interface EditInfosAdminModalProps {
  machine: Machine;
  onClose: () => void;
}

export default function EditInfosAdminModal({ machine, onClose }: EditInfosAdminModalProps) {
  const { t } = useTranslation();
  const { updateInfosAdmin } = useMachines();

  const [client, setClient] = useState(machine.client_precedent || "");
  const [contrat, setContrat] = useState(machine.contrat || "");
  const [email, setEmail] = useState(machine.email_client || "");
  const [modele, setModele] = useState(machine.modele_porteur || "");
  const [typeNacelle, setTypeNacelle] = useState(machine.type_nacelle || "");
  const [annee, setAnnee] = useState(machine.annee_circulation || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    const ok = await updateInfosAdmin(machine.id, {
      client_precedent: client,
      contrat,
      email_client: email,
      modele_porteur: modele,
      type_nacelle: typeNacelle,
      annee_circulation: annee,
    });
    setSaving(false);
    if (!ok) {
      alert(t("editInfos.saveError"));
      return;
    }
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-header">
          <div>
            <h2>✏️ {t("editInfos.title")}</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-grid">
          <div className="form-field form-field-wide">
            <label>{t("editInfos.fieldClient")}</label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder={t("resti.placeholderCompany")}
            />
          </div>
          <div className="form-field">
            <label>{t("editInfos.fieldContract")}</label>
            <input
              type="text"
              value={contrat}
              onChange={(e) => setContrat(e.target.value)}
              placeholder="CTR-2024-XXX"
            />
          </div>
          <div className="form-field">
            <label>{t("editInfos.fieldEmail")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@email.com"
            />
          </div>
          <div className="form-field">
            <label>{t("editInfos.fieldType")}</label>
            <TypeNacelleSelect
              value={typeNacelle}
              onChange={setTypeNacelle}
            />
          </div>
          <div className="form-field">
            <label>{t("editInfos.fieldCarrier")}</label>
            <input
              type="text"
              value={modele}
              onChange={(e) => setModele(e.target.value)}
              placeholder="Renault Master…"
            />
          </div>
          <div className="form-field">
            <label>{t("editInfos.fieldRegDate")}</label>
            <input
              type="text"
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
              placeholder={t("resti.placeholderDate")}
            />
          </div>
        </div>

        <div className="modal-note" style={{ fontSize: 12, color: "var(--muted, #888)", padding: "4px 0 8px" }}>
          {t("editInfos.note")}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            {t("editInfos.cancel")}
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "⏳ " : ""}{t("editInfos.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
