import { useState } from "react";
import { Machine } from "../types/machine";

interface LldModalProps {
  machine: Machine;
  onClose: () => void;
  onConfirm: (machineId: string, clientLld: string, dateMiseDispo: string) => void;
}

export default function LldModal({ machine, onClose, onConfirm }: LldModalProps) {
  const [clientLld, setClientLld] = useState("");
  const [dateMiseDispo, setDateMiseDispo] = useState("");

  function handleConfirm() {
    if (!clientLld.trim()) {
      alert("Le client LLD est obligatoire");
      return;
    }
    if (!dateMiseDispo) {
      alert("La date de mise à disposition est obligatoire");
      return;
    }
    onConfirm(machine.id, clientLld.trim(), dateMiseDispo);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-lld">
        <div className="modal-header">
          <div>
            <h2>🔁 Mise en location longue durée</h2>
            <div className="modal-subtitle">
              {machine.immat} · {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="lld-body">
          <div className="lld-info-box">
            <div className="lld-icon-large">🔁</div>
            <div>
              <strong>Cette machine va être basculée en location longue durée</strong>
              <div className="info-text">
                Elle ira directement en préparation atelier (mêmes 6 étapes que pour la vente).
                Une fois la prépa terminée, elle sera marquée mise à disposition au client et sortira du circuit Delta VO.
              </div>
            </div>
          </div>

          <div className="lld-field">
            <label>
              Client LLD <span className="required">*</span>
            </label>
            <input
              type="text"
              placeholder="ex : BTP Construction SAS"
              value={clientLld}
              onChange={(e) => setClientLld(e.target.value)}
              autoFocus
            />
          </div>

          <div className="lld-field">
            <label>
              Date de mise à disposition prévue <span className="required">*</span>
            </label>
            <input
              type="date"
              value={dateMiseDispo}
              onChange={(e) => setDateMiseDispo(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <div className="config-hint">
              💡 Cette date servira à alerter l'atelier si la prépa prend du retard
            </div>
          </div>

          <div className="confirm-warning">
            ⚠ Une fois basculée en LLD, la machine quittera l'écran <strong>Disponibles</strong> et apparaîtra dans <strong>En cours</strong> avec un badge orange « 🔁 LLD ».
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary btn-lld-confirm" onClick={handleConfirm}>
            🔁 Confirmer la mise en location
          </button>
        </div>
      </div>
    </div>
  );
}