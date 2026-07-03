import { useState } from "react";
import MachineThumb from "./MachineThumb";
import {
  Machine,
  EtapePrepa,
  prepaTerminee,
  isLivraisonEnRetard,
  isMiseDispoEnRetard,
} from "../types/machine";
import { useTranslation } from "react-i18next";

interface EnCoursCardProps {
  machine: Machine;
  canEditPrepa: boolean;
  canConfigure: boolean;
  canFacturer: boolean;
  canCancel?: boolean;
  canManageDocuments?: boolean;
  onToggleEtape?: (machineId: string, etapeId: string) => void;
  onSetNonNecessaire?: (machineId: string, etapeId: string) => void;
  onConfigure?: (machine: Machine) => void;
  onFacturer?: (machine: Machine) => void;
  onCancel?: (machineId: string) => void;
  onOpenDocuments?: (machine: Machine) => void;
  onAddEtape?: (machineId: string, label: string) => void;
  onRemoveEtape?: (machineId: string, etapeId: string) => void;
}

export default function EnCoursCard({
  machine,
  canEditPrepa,
  canConfigure,
  canFacturer,
  canCancel = false,
  canManageDocuments = false,
  onToggleEtape,
  onSetNonNecessaire,
  onConfigure,
  onFacturer,
  onCancel,
  onOpenDocuments,
  onAddEtape,
  onRemoveEtape,
}: EnCoursCardProps) {
  const [newEtapeLabel, setNewEtapeLabel] = useState("");
  const { t } = useTranslation();
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
  const labelAcheteur = isLld ? t("encard.lldClient") : t("encard.buyer");
  const valAcheteur = isLld ? machine.client_lld : machine.acheteur;
  const labelDateLivraison = isLld ? t("encard.availExpected") : t("encard.deliveryExpected");
  const valDateLivraison = isLld ? machine.date_mise_dispo_lld : machine.date_livraison_prevue;
  const labelBtnFacturer = isLld
    ? t("encard.btnAvail")
    : t("encard.btnInvoice");

  return (
    <div
      className={`encours-card ${pretAFacturer ? "ready" : ""} ${enRetard ? "late" : ""} ${!isConfigured ? "unconfigured" : ""} ${isLld ? "is-lld" : ""}`}
    >
      <div className="encours-header">
        <div className="machine-thumb-row">
          <MachineThumb machine={machine} size={56} />
        <div>
          <div className="encours-immat">{machine.immat}</div>
          <div className="encours-modele">
            {machine.type_nacelle} · {machine.modele_porteur}
            <span className="encours-annee"> · {machine.annee_circulation}</span>
          </div>
        </div>
        </div>
        <div className="encours-badges">
          {isLld && <span className="badge-lld">🔁 LLD</span>}
          {!isConfigured && (
            <span className="badge-unconfigured">⚙️ {t("encard.toConfigure")}</span>
          )}
          {isConfigured && isEnEtat && !isLld && (
            <span className="badge-enetat">📦 {t("encard.soldAsIs")}</span>
          )}
          {isConfigured && !isEnEtat && !isLld && (
            <span className="badge-prepa">🔧 {t("encard.prepNormal")}</span>
          )}
          {enRetard && (
            <span className="badge-late">
              ⚠ {isLld ? t("encard.lateAvail") : t("encard.lateDelivery")}
            </span>
          )}
          {pretAFacturer && (
            <span className="badge-ready">
              {isLld ? t("encard.readyLld") : t("encard.readyInvoice")}
            </span>
          )}
        </div>
      </div>

      {onOpenDocuments && (
        <div style={{ padding: "0 0 4px" }}>
          <button
            type="button"
            onClick={() => onOpenDocuments(machine)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              border: "1px solid #d0d0d0",
              background: "#fff",
              color: "#1a2a6e",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📎 {t("encard.documents")}
            {machine.documents_vo && machine.documents_vo.length > 0 && (
              <span
                style={{
                  background: "#1a2a6e",
                  color: "#fff",
                  borderRadius: 10,
                  padding: "1px 7px",
                  fontSize: 11,
                }}
              >
                {machine.documents_vo.length}
              </span>
            )}
            {canManageDocuments ? "" : t("encard.readOnly")}
          </button>
        </div>
      )}

      {!isConfigured && (
        <div className="unconfigured-banner">
          <div className="unconfigured-icon">⚙️</div>
          <div className="unconfigured-text">
            <strong>{t("encard.unconfiguredTitle")}</strong>
            <div className="unconfigured-sub">
              {isLld
                ? t("encard.unconfiguredSubLld")
                : t("encard.unconfiguredSubSale")}
            </div>
          </div>
          {canConfigure && onConfigure && (
            <button
              className="btn-configure"
              onClick={() => onConfigure(machine)}
            >
              ⚙️ {t("encard.configure")}
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
                <span className="sale-label">{t("encard.salesperson")}</span>
                <span className="sale-value">{machine.commercial_vendeur || "—"}</span>
              </div>
            )}
            {!isLld && (
              <div className="sale-info">
                <span className="sale-label">{t("encard.salePrice")}</span>
                <span className="sale-value sale-price">
                  {machine.prix_vente_final !== undefined ? (
                    machine.prix_vente_final.toLocaleString("fr-FR") + " €"
                  ) : (
                    <span className="sync-pending">⏳ {t("encard.syncHubspot")}</span>
                  )}
                </span>
              </div>
            )}
            {!isLld && (
              <div className="sale-info">
                <span className="sale-label">{t("encard.saleDate")}</span>
                <span className="sale-value">{formatDate(machine.date_vente)}</span>
              </div>
            )}
            <div className="sale-info">
              <span className="sale-label">{labelDateLivraison}</span>
              <span className={`sale-value ${enRetard ? "late-date" : ""}`}>
                {valDateLivraison
                  ? formatDate(valDateLivraison)
                  : <span className="sync-pending">{t("encard.notSet")}</span>}
              </span>
            </div>
          </div>

          {!isEnEtat && machine.etapes_prepa && machine.etapes_prepa.length > 0 && (
            <div className="prepa-section">
              <div className="prepa-progress-bar">
                <div className="prepa-progress-header">
                  <span className="prepa-title">{t("encard.prepProgress")}</span>
                  <span className="prepa-count">
                    {etapesDone} / {etapesTotal} {t("encard.steps")}
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
                    onRemove={
                      canEditPrepa && onRemoveEtape && etape.custom
                        ? () => onRemoveEtape(machine.id, etape.id)
                        : undefined
                    }
                  />
                ))}

                {canEditPrepa && onAddEtape && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    type="text"
                    value={newEtapeLabel}
                    onChange={(e) => setNewEtapeLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newEtapeLabel.trim()) {
                        onAddEtape(machine.id, newEtapeLabel);
                        setNewEtapeLabel("");
                      }
                    }}
                    placeholder={t("encard.addStepPlaceholder")}
                    style={{
                      flex: 1,
                      border: "1px solid #d0d0d0",
                      borderRadius: 6,
                      padding: "7px 10px",
                      fontSize: 13,
                    }}
                  />
                  <button
                    type="button"
                    disabled={!newEtapeLabel.trim()}
                    onClick={() => {
                      onAddEtape(machine.id, newEtapeLabel);
                      setNewEtapeLabel("");
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: newEtapeLabel.trim() ? "#1a2a6e" : "#bbb",
                      color: "#fff",
                      cursor: newEtapeLabel.trim() ? "pointer" : "default",
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    ➕ {t("encard.addStep")}
                  </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {isEnEtat && !isLld && (
            <div className="en-etat-banner">
              📦 {t("encard.asIsBanner")}
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
            ❌ {t("encard.cancelPrep")}
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
  onRemove,
}: {
  etape: EtapePrepa;
  canEdit: boolean;
  onToggle?: () => void;
  onSetNA?: () => void;
  onRemove?: () => void;
}) {
  // État visuel de l'étape
  const isDone = etape.done;
  const isNA = etape.non_necessaire;
  const validated = isDone || isNA;
  const { t } = useTranslation();

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
          {isNA && <em style={{ color: "#888", marginLeft: 6 }}>{t("encard.stepNA")}</em>}
        </span>
        {isDone && etape.done_by && (
          <span className="etape-tracking">
            {t("encard.stepBy")} <strong>{etape.done_by}</strong> {t("encard.stepOn")} {formatDate(etape.done_at)}
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
            {isDone ? t("encard.stepDone") : t("encard.markDone")}
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
              ⊘ {t("encard.notNeeded")}
            </button>
          )}

          {/* Bouton Supprimer (uniquement pour les étapes ajoutées à la main) */}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              title={t("encard.removeStepTitle")}
              style={{
                padding: "4px 9px",
                borderRadius: 4,
                border: "1px solid #f0c0c5",
                background: "white",
                color: "#c8102e",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              🗑
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
