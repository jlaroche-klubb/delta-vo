import { Machine } from "../types/machine";

interface ExpertiseModalProps {
  machine: Machine;
  onClose: () => void;
}

export default function ExpertiseModal({ machine, onClose }: ExpertiseModalProps) {
  const rapport = machine.rapport_expertise;
  if (!rapport) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-expertise">
        {/* Header */}
        <div className="expertise-header">
          <div>
            <div className="expertise-eyebrow">EXPERTISE NACELLE · DELTA SERVICES</div>
            <h2 className="expertise-title">{machine.immat}</h2>
            <div className="expertise-subtitle">
              {machine.type_nacelle} · {machine.modele_porteur} · {machine.annee_circulation}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Identification */}
        <div className="expertise-section">
          <div className="section-label">Identification</div>
          <div className="info-grid">
            <InfoCell label="Client" value={machine.client_precedent} />
            <InfoCell label="N° Contrat" value={machine.contrat} />
            <InfoCell label="Date retour" value={formatDate(machine.date_retour)} />
            <InfoCell label="Date expertise" value={formatDate(rapport.date_expertise)} />
            <InfoCell label="Agent expert" value={rapport.agent} />
            {rapport.duree_location_jours && (
              <InfoCell
                label="Durée location"
                value={`${rapport.duree_location_jours} jours`}
              />
            )}
          </div>
        </div>

        {/* Compteurs */}
        <div className="expertise-section">
          <div className="section-label">Compteurs</div>
          <div className="info-grid">
            <InfoCell
              label="Heures nacelle"
              value={`${rapport.heures_nacelle.toLocaleString("fr-FR")} h`}
              highlight
            />
            <InfoCell
              label="Km porteur"
              value={`${rapport.km_porteur.toLocaleString("fr-FR")} km`}
              highlight
            />
            <InfoCell
              label="Vétusté appliquée"
              value={rapport.taux_vetuste === 0 ? "Aucune" : `${rapport.taux_vetuste}%`}
              highlight={rapport.taux_vetuste !== 0}
            />
          </div>
        </div>

        {/* Dégâts */}
        <div className="expertise-section">
          <div className="section-label">
            Dégâts constatés
            {rapport.degats.length > 0 && (
              <span className="section-count">
                {rapport.degats.length} poste{rapport.degats.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {rapport.degats.length === 0 ? (
            <div className="no-damage">
              ✓ Aucun dégât constaté — nacelle rendue conforme
            </div>
          ) : (
            <table className="damage-table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Description</th>
                  <th>Montant HT</th>
                </tr>
              </thead>
              <tbody>
                {rapport.degats.map((d, i) => (
                  <tr key={i}>
                    <td>
                      <span className="zone-tag">{d.zone}</span>
                    </td>
                    <td>{d.description}</td>
                    <td className="amount">
                      {d.sur_devis ? (
                        <span className="devis">Sur devis</span>
                      ) : (
                        `${d.montant} €`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Total retenue */}
        {rapport.total_retenue_ht > 0 && (
          <div className="total-strip">
            <span className="total-label">TOTAL RETENUE HT</span>
            <span className="total-value">
              {rapport.total_retenue_ht.toLocaleString("fr-FR")} €
            </span>
          </div>
        )}

        {/* Notes */}
        {rapport.notes && (
          <div className="expertise-section">
            <div className="section-label">Notes de l'expert</div>
            <div className="notes-box">{rapport.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
      
          <button className="btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`info-cell ${highlight ? "highlight" : ""}`}>
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}