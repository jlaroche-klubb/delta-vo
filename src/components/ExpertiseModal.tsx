import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

interface ExpertiseModalProps {
  machine: Machine;
  onClose: () => void;
}

export default function ExpertiseModal({ machine, onClose }: ExpertiseModalProps) {
  const { t } = useTranslation();
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
            <div className="expertise-eyebrow">{t("modals.expEyebrow")}</div>
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
          <div className="section-label">{t("modals.expIdentification")}</div>
          <div className="info-grid">
            <InfoCell label={t("modals.expClient")} value={machine.client_precedent} />
            <InfoCell label={t("modals.expContract")} value={machine.contrat} />
            <InfoCell label={t("modals.expReturnDate")} value={formatDate(machine.date_retour)} />
            <InfoCell label={t("modals.expDate")} value={formatDate(rapport.date_expertise || "")} />
            <InfoCell label={t("modals.expAgent")} value={rapport.agent || "—"} />
            {rapport.duree_location_jours && (
              <InfoCell
                label={t("modals.expRentalDuration")}
                value={`${rapport.duree_location_jours} ${t("modals.expDays")}`}
              />
            )}
          </div>
        </div>

        {/* Compteurs */}
        <div className="expertise-section">
          <div className="section-label">{t("modals.expCounters")}</div>
          <div className="info-grid">
            <InfoCell
              label={t("modals.expHours")}
              value={`${(rapport.heures_nacelle || 0).toLocaleString("fr-FR")} h`}
              highlight
            />
            <InfoCell
              label={t("modals.expKm")}
              value={`${(rapport.km_porteur || 0).toLocaleString("fr-FR")} km`}
              highlight
            />
            <InfoCell
              label={t("modals.expWear")}
              value={rapport.taux_vetuste === 0 ? t("modals.expNone") : `${rapport.taux_vetuste}%`}
              highlight={rapport.taux_vetuste !== 0}
            />
          </div>
        </div>

        {/* Dégâts */}
        <div className="expertise-section">
          <div className="section-label">
            {t("modals.expDamages")}
            {rapport.degats.length > 0 && (
              <span className="section-count">
                {rapport.degats.length} {t("modals.expItems")}
              </span>
            )}
          </div>
          {rapport.degats.length === 0 ? (
            <div className="no-damage">
              ✓ {t("modals.expNoDamage")}
            </div>
          ) : (
            <table className="damage-table">
              <thead>
                <tr>
                  <th>{t("modals.expZone")}</th>
                  <th>{t("modals.expDescription")}</th>
                  <th>{t("modals.expAmountHt")}</th>
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
                        <span className="devis">{t("modals.expOnQuote")}</span>
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
            <span className="total-label">{t("modals.expTotalRetained")}</span>
            <span className="total-value">
              {rapport.total_retenue_ht.toLocaleString("fr-FR")} €
            </span>
          </div>
        )}

        {/* Notes */}
        {rapport.notes && (
          <div className="expertise-section">
            <div className="section-label">{t("modals.expNotes")}</div>
            <div className="notes-box">{rapport.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
      
          <button className="btn-primary" onClick={onClose}>
            {t("modals.close")}
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
