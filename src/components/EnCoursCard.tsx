import {
  Machine,
  EtapePrepa,
  prepaTerminee,
  isLivraisonEnRetard,
  isMiseDispoEnRetard,
} from "../types/machine";

interface EnCoursCardProps {
  machine: Machine;
  canEditPrepa: boolean;
  canConfigure: boolean;
  canFacturer: boolean;
  canCancel?: boolean;
  onToggleEtape?: (machineId: string, etapeId: string) => void;
  onSetNonNecessaire?: (machineId: string, etapeId: string) => void;
  onConfigure?: (machine: Machine) => void;
  onFacturer?: (machine: Machine) => void;
  onCancel?: (machineId: string) => void;
}

export default function EnCoursCard({
  machine,
  canEditPrepa,
  canConfigure,
  canFacturer,
  canCancel = false,
  onToggleEtape,
  onSetNonNecessaire,
  onConfigure,
  onFacturer,
  onCancel,
}: EnCoursCardProps) {
  const isLld = machine.type_sortie === "lld";
  const isConfigured = !!machine.type_prepa;
  const isEnEtat = machine.type_prepa === "en_etat";
  const prepaOK = prepaTerminee(machine.etapes_prepa);

  const enRetardLivraison = !isLld && isLivraisonEnRetard(machine.date_livraison_prevue);
  const enRetardMiseDispo = isLld && isMiseDispoEnRetard(machine.date_mise_dispo_lld);
  const enRetard = enRetardLivraison || enRetardMiseDispo;

  const pretAFacturer = isConfigured && (isEnEtat || prepaOK);

  const etapesDone = machine.etapes_prepa?.filter((e) => e.done).length || 0;
  const etapesTotal = machine.etapes_prepa?.length || 0;
  const progressPct = etapesTotal > 0 ? (etapesDone / etapesTotal) * 100 : 0;

  // Labels adaptés selon LLD ou vente
  const labelAcheteur = isLld ? "Client LLD" : "Acheteur";
  const valAcheteur = isLld ? machine.client_lld : machine.acheteur;
  const labelDateLivraison = isLld ? "Mise à dispo prévue" : "Livraison prévue";
  const valDateLivraison = isLld ? machine.date_mise_dispo_lld : machine.date_livraison_prevue;
  const labelBtnFacturer = isLld
    ? "🔁 Marquer mise à disposition"
    : "✓ Marquer facturée → Clôturer";

  return (
    <div
      className={`encours-card ${pretAFacturer ? "ready" : ""} ${enRetard ? "late" : ""} ${!isConfigured ? "unconfigured" : ""} ${isLld ? "is-lld" : ""}`}
    >
      <div className="encours-header">
        <div>
          <div className="encours-immat">{machine.immat}</div>
          <div className="encours-modele">
            {machine.type_nacelle} · {machine.modele_porteur}
            <span className="encours-annee"> · {machine.annee_circulation}</span>
          </div>
        </div>
        <div className="encours-badges">
          {isLld && <span className="badge-lld">🔁 LLD</span>}
          {!isConfigured && (
            <span className="badge-unconfigured">⚙️ À configurer</span>
          )}
          {isConfigured && isEnEtat && !isLld && (
            <span className="badge-enetat">📦 Vendue en l'état</span>
          )}
          {isConfigured && !isEnEtat && !isLld && (
            <span className="badge-prepa">🔧 Prépa normale</span>
          )}
          {enRetard && (
            <span className="badge-late">
              ⚠ {isLld ? "Mise à dispo en retard" : "Livraison en retard"}
            </span>
          )}
          {pretAFacturer && (
            <span className="badge-ready">
              {isLld ? "✓ Prête à mettre en LLD" : "✓ Prête à facturer"}
            </span>
          )}
        </div>
      </div>

      {!isConfigured && (
        <div className="unconfigured-banner">
          <div className="unconfigured-icon">⚙️</div>
          <div className="unconfigured-text">
            <strong>Cette machine attend d'être configurée</strong>
            <div className="unconfigured-sub">
              {isLld 
                ? "L'ADV doit choisir le type de préparation pour cette mise en location"
                : "L'ADV doit choisir prépa normale / en l'état + renseigner l'acheteur et le commercial"}
            </div>
          </div>
          {canConfigure && onConfigure && (
            <button
              className="btn-configure"
              onClick={() => onConfigure(machine)}
            >
              ⚙️ Configurer
            </button>
          )}
        </div>
      )}

      {isConfigured && (
        <>
          <div className="encours-sale-bar">
            <div className="sale-info">
              <span className="sale-label">{labelAcheteur}</span>
              <span className="sale-value">{valAcheteur || "—"}</span>
            </div>
            {!isLld && (
              <div className="sale-info">
                <span className="sale-label">Commercial</span>
                <span className="sale-value">{machine.commercial_vendeur || "—"}</span>
              </div>
            )}
            {!isLld && (
              <div className="sale-info">
                <span className="sale-label">Prix vente</span>
                <span className="sale-value sale-price">
                  {machine.prix_vente_final !== undefined ? (
                    machine.prix_vente_final.toLocaleString("fr-FR") + " €"
                  ) : (
                    <span className="sync-pending">⏳ Sync HubSpot</span>
                  )}
                </span>
              </div>
            )}
            {!isLld && (
              <div className="sale-info">
                <span className="sale-label">Date vente</span>
                <span className="sale-value">{formatDate(machine.date_vente)}</span>
              </div>
            )}
            <div className="sale-info">
              <span className="sale-label">{labelDateLivraison}</span>
              <span className={`sale-value ${enRetard ? "late-date" : ""}`}>
                {valDateLivraison
                  ? formatDate(valDateLivraison)
                  : <span className="sync-pending">Non définie</span>}
              </span>
            </div>
          </div>

          {!isEnEtat && machine.etapes_prepa && machine.etapes_prepa.length > 0 && (
            <div className="prepa-section">
              <div className="prepa-progress-bar">
                <div className="prepa-progress-header">
                  <span className="prepa-title">Avancement de la prépa</span>
                  <span className="prepa-count">
                    {etapesDone} / {etapesTotal} étapes
                  </span>
                </div>
                <div className="prepa-bar">
                  <div
                    className={`prepa-bar-fill ${prepaOK ? "done" : ""}`}
                    style={{ width: progressPct + "%" }}
                  ></div>
                </div>
              </div>

              <div className="prepa-etapes">
                {machine.etapes_prepa.map((etape) => (
                  <EtapeRow
                    key={etape.id}
                    etape={etape}
                    canEdit={canEditPrepa}
                    onToggle={
                      canEditPrepa && onToggleEtape
                        ? () => onToggleEtape(machine.id, etape.id)
                        : undefined
                    }
                    onSetNA={
                      canEditPrepa && onSetNonNecessaire
                        ? () => onSetNonNecessaire(machine.id, etape.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {isEnEtat && !isLld && (
            <div className="en-etat-banner">
              📦 Cette machine est vendue en l'état — aucune préparation requise. Prête à être facturée.
            </div>
          )}

          {pretAFacturer && canFacturer && onFacturer && (
            <div className="encours-actions">
              <button
                className={isLld ? "btn-facturer btn-facturer-lld" : "btn-facturer"}
                onClick={() => onFacturer(machine)}
              >
                {labelBtnFacturer}
              </button>
            </div>
          )}
        </>
      )}
      
      {/* ✅ Bouton Admin : Annuler la mise en préparation */}
      {canCancel && onCancel && (
        <div className="encours-admin-actions" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e5e5' }}>
          <button
            onClick={() => {
              if (window.confirm(`⚠️ Annuler la mise en préparation de ${machine.immat} ?\n\nLa machine retournera dans les "Disponibles" et toutes les données de vente/LLD seront effacées.`)) {
                onCancel(machine.id);
              }
            }}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold'
            }}
          >
            ❌ Annuler la mise en préparation
          </button>
        </div>
      )}
    </div>
  );
}

function EtapeRow({
  etape,
  canEdit,
  onToggle,
  onSetNA,
}: {
  etape: EtapePrepa;
  canEdit: boolean;
  onToggle?: () => void;
  onSetNA?: () => void;
}) {
  // État visuel de l'étape
  const isDone = etape.done;
  const isNA = etape.non_necessaire;
  const validated = isDone || isNA;

  return (
    <div className={`etape-row ${validated ? "etape-done" : ""}`}>
      <div className="etape-check">
        {isDone ? (
          <span className="check-icon-done">✓</span>
        ) : isNA ? (
          <span className="check-icon-done" style={{ color: "#888" }}>⊘</span>
        ) : (
          <span className="check-icon-todo">○</span>
        )}
      </div>
      <div className="etape-info" style={{ flex: 1 }}>
        <span className="etape-label">
          {etape.label}
          {isNA && <em style={{ color: "#888", marginLeft: 6 }}>(non nécessaire)</em>}
        </span>
        {isDone && etape.done_by && (
          <span className="etape-tracking">
            par <strong>{etape.done_by}</strong> le {formatDate(etape.done_at)}
          </span>
        )}
      </div>

      {/* Boutons d'action (si édition autorisée) */}
      {canEdit && (
        <div className="etape-actions" style={{ display: "flex", gap: 6 }}>
          {/* Bouton OK / Fait */}
          <button
            type="button"
            onClick={onToggle}
            style={{
              padding: "4px 10px",
              borderRadius: 4,
              border: "1px solid",
              borderColor: isDone ? "#28a745" : "#ccc",
              background: isDone ? "#28a745" : "white",
              color: isDone ? "white" : "#444",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {isDone ? "✓ Fait" : "Marquer fait"}
          </button>

          {/* Bouton Non nécessaire (uniquement pour CT et VGP) */}
          {etape.has_na && onSetNA && (
            <button
              type="button"
              onClick={onSetNA}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid",
                borderColor: isNA ? "#6c757d" : "#ccc",
                background: isNA ? "#6c757d" : "white",
                color: isNA ? "white" : "#444",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ⊘ Non nécessaire
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}