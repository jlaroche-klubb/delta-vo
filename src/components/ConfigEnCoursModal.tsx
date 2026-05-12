import { useState } from "react";
import { Machine, TypePrepa, creerEtapesPrepa } from "../types/machine";

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
      alert("L'acheteur est obligatoire");
      return;
    }
    if (!commercial.trim()) {
      alert("Le commercial vendeur est obligatoire");
      return;
    }
    if (!dateVente) {
      alert("La date de vente est obligatoire");
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
            <h2>Configurer la machine</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="config-body">
          {/* Type de prépa */}
          <div className="config-field">
            <label className="config-label-strong">Type de mise en cours</label>
            <div className="prepa-choice">
              <button
                type="button"
                className={`choice-btn ${typePrepa === "normale" ? "active" : ""}`}
                onClick={() => setTypePrepa("normale")}
              >
                <div className="choice-icon">🔧</div>
                <div className="choice-title">Prépa normale</div>
                <div className="choice-desc">
                  Préparation atelier requise avant livraison
                </div>
              </button>
              <button
                type="button"
                className={`choice-btn ${typePrepa === "en_etat" ? "active" : ""}`}
                onClick={() => setTypePrepa("en_etat")}
              >
                <div className="choice-icon">📦</div>
                <div className="choice-title">Vendue en l'état</div>
                <div className="choice-desc">
                  Pas de prépa, livraison directe
                </div>
              </button>
            </div>
          </div>

          {/* Acheteur */}
          <div className="config-field">
            <label>
              Acheteur <span className="required">*</span>
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
              Commercial vendeur <span className="required">*</span>
            </label>
            <input
              type="text"
              placeholder="ex : Sophie Bernard"
              value={commercial}
              onChange={(e) => setCommercial(e.target.value)}
            />
            <div className="config-hint">
              💡 Champ libre pour l'instant — sera remplacé par une liste déroulante quand la liste des commerciaux sera configurée dans le panel admin
            </div>
          </div>

          {/* Dates */}
          <div className="config-row">
            <div className="config-field">
              <label>
                Date de vente <span className="required">*</span>
              </label>
              <input
                type="date"
                value={dateVente}
                onChange={(e) => setDateVente(e.target.value)}
              />
            </div>
            <div className="config-field">
              <label>Date de livraison prévue</label>
              <input
                type="date"
                value={dateLivraison}
                onChange={(e) => setDateLivraison(e.target.value)}
                min={dateVente}
              />
              <div className="config-hint">
                Facultatif — peut être renseigné plus tard
              </div>
            </div>
          </div>

          {/* Info prix HubSpot */}
          <div className="config-info-box">
            <div className="info-icon-large">💰</div>
            <div>
              <strong>Prix de vente final</strong>
              <div className="info-text">
                Le prix sera synchronisé automatiquement depuis HubSpot (à venir).
                Pour l'instant le prix affiché reste celui défini par le PDG.
              </div>
            </div>
          </div>

          {/* Récap étapes prépa */}
          {typePrepa === "normale" && (
            <div className="config-info-box config-info-box-success">
              <div className="info-icon-large">📋</div>
              <div>
                <strong>6 étapes de prépa seront créées automatiquement</strong>
                <div className="info-text">
                  Nettoyage · Réparations · CT · VGP · Marquage · Vérification finale
                  <br />
                  L'atelier pourra cocher chaque étape au fur et à mesure.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Valider et créer la fiche
          </button>
        </div>
      </div>
    </div>
  );
}