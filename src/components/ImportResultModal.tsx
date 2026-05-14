import { ImportResult } from "../utils/importPricing";

interface ImportResultModalProps {
  result: ImportResult;
  onClose: () => void;
}

export default function ImportResultModal({ result, onClose }: ImportResultModalProps) {
  const successCount = result.success.length;
  const errorCount = result.errors.length;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-import-result">
        <div className="modal-header">
          <h2>Résultat de l'import</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="import-result-body">
          {/* Stats */}
          <div className="import-stats">
            <div className="import-stat import-stat-ok">
              <div className="import-stat-value">{successCount}</div>
              <div className="import-stat-label">Mises à jour</div>
            </div>
            <div className="import-stat import-stat-err">
              <div className="import-stat-value">{errorCount}</div>
              <div className="import-stat-label">Ignorées</div>
            </div>
            <div className="import-stat">
              <div className="import-stat-value">{result.totalRows}</div>
              <div className="import-stat-label">Total lignes</div>
            </div>
          </div>

          {/* Succès */}
          {successCount > 0 && (
            <div className="import-section">
              <h3 className="import-section-title import-section-title-ok">
                ✓ Prix mis à jour ({successCount})
              </h3>
              <div className="import-list">
                {result.success.map((s, i) => (
                  <div key={i} className="import-item import-item-ok">
                    <span className="import-immat">{s.immat}</span>
                    <span className="import-source-tag">{s.source}</span>
                    <span className="import-prices">
                      {s.prixFr !== undefined && (
                        <span>FR: <strong>{s.prixFr.toLocaleString("fr-FR")} €</strong></span>
                      )}
                      {s.prixDealer !== undefined && (
                        <span>Dealer: <strong>{s.prixDealer.toLocaleString("fr-FR")} €</strong></span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Erreurs */}
          {errorCount > 0 && (
            <div className="import-section">
              <h3 className="import-section-title import-section-title-err">
                ⚠ Lignes ignorées ({errorCount})
              </h3>
              <div className="import-list">
                {result.errors.map((e, i) => (
                  <div key={i} className="import-item import-item-err">
                    <span className="import-immat">{e.immat}</span>
                    <span className="import-source-tag">{e.source}</span>
                    <span className="import-reason">{e.raison}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}