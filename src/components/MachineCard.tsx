import { useState } from "react";
import MachineThumb from "./MachineThumb";
import { Machine } from "../types/machine";
import ExpertiseModal from "./ExpertiseModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import EditInfosAdminModal from "./EditInfosAdminModal";
import { useMachines } from "../contexts/MachinesContext";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";
import { canEditInfosAdmin } from "../utils/permissions";
import { validerDevisEtEnvoyer } from "../services/devisService";

interface MachineCardProps {
  machine: Machine;
  onSetDate: (id: string, date: string) => void;
  onToggleField: (
    id: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) => void;
  canValidate?: boolean;
  canDelete?: boolean;
  onDelete?: (id: string) => void;
}

export default function MachineCard({ 
  machine, 
  onSetDate, 
  onToggleField,
  canValidate = true,
  canDelete = false,
  onDelete 
}: MachineCardProps) {
  const [showExpertise, setShowExpertise] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showEditInfos, setShowEditInfos] = useState(false);
  const [validatingDevis, setValidatingDevis] = useState(false);

  // const { archiveMachine, unarchiveMachine } = useMachines();
  const { profile } = useAuth();
  // En DEV_MODE (profile null) → tout le monde est admin pour pouvoir tester
  const isAdmin = !profile || profile.role === "admin" || profile.role === "superadmin";
  // ✏️ Édition des infos administratives (client, contrat, email...) —
  // admin + secrétaire/ADV. Jamais les photos ni le contenu d'expertise.
  const canEditInfos = !profile || canEditInfosAdmin(profile.role);

  const step1Done = !!machine.date_demande_recuperation;
  const step2Done = machine.recuperation_ok;
  const step3Done = machine.expertise_ok;
  const step4Done = machine.facture_ok;
  const step5Done = machine.facture_reglee_ok;

  const activeStep =
    !step1Done ? 1 :
    !step2Done ? 2 :
    !step3Done ? 3 :
    !step4Done ? 4 :
    !step5Done ? 5 : 6;

  const hasExpertise = !!machine.rapport_expertise;
  const expertiseRecue = !!(machine as any).expertise_recue;
  const photosCount = machine.photos_commerciales 
  ? Object.values(machine.photos_commerciales).filter(p => p).length 
  : 0;
  const agentExpert = (machine as any).agent_expert as string | undefined;
  const { t } = useTranslation();

  const cardClasses = [
    "machine-card",
    machine.fiche_vo_creee ? "vo-created" : "",
    expertiseRecue ? "expertise-recue" : "",
    machine.archived ? "archived" : "",
  ]
    .filter(Boolean)
    .join(" ");

    function handleConfirmArchive() {
      const userName = profile
        ? `${profile.prenom || ""} ${profile.nom || ""}`.trim() || profile.email
        : "Admin (DEV)";
     // archiveMachine(machine.id, userName);
      setShowConfirmDelete(false);
    }

  return (
    <>
      <div className={cardClasses}>
        {/* Bandeau machine archivée */}
        {machine.archived && (
          <div className="archived-banner">
            <span className="archived-banner-icon">🗑️</span>
            <div className="archived-banner-content">
              <strong>{t("mcard.archived")}</strong>
              <small>
                {t("mcard.archivedBy")} {machine.archived_by || "—"} {t("mcard.archivedOn")}{" "}
                {machine.archived_at
                  ? new Date(machine.archived_at).toLocaleDateString("fr-FR")
                  : "—"}
              </small>
            </div>
            {isAdmin && (
              <button
                className="btn-unarchive"
               // onClick={() => unarchiveMachine(machine.id)}
              >
                ↩ {t("mcard.restore")}
              </button>
            )}
          </div>
        )}

        {/* ⏳ Bandeau devis en attente / devis reçu (postes sur devis Nacelle Expert) */}
        {!machine.archived && (machine.devis_pending_labels?.length || (machine.devis_complet && !machine.devis_valide)) ? (
          machine.devis_pending_labels?.length ? (
            <div style={{ background: "#fdf3ec", border: "1px solid #e8c9a8", borderRadius: 6, padding: "8px 12px", marginBottom: 8 }}>
              <strong style={{ color: "#b3541e" }}>⏳ {t("mcard.devisPending", { count: machine.devis_pending_labels.length })}</strong>
              <div style={{ fontSize: 12, color: "#8a5a30", marginTop: 2 }}>
                {machine.devis_pending_labels.join(" · ")}
              </div>
              <div style={{ fontSize: 11, color: "#8a5a30", marginTop: 2 }}>{t("mcard.devisPendingNote")}</div>
              {/* 💶 Postes déjà chiffrés par l'atelier (chiffrage partiel) */}
              {machine.devis_recu_items?.length ? (
                <div style={{ fontSize: 12, color: "#1e7e46", marginTop: 4 }}>
                  ✓ {t("mcard.devisPartial")}{" "}
                  {machine.devis_recu_items.map((it) => `${it.label} : ${it.montant.toLocaleString("fr-FR")} € HT`).join(" · ")}
                </div>
              ) : null}
              {/* 💶 Montant global de l'expertise (provisoire tant que des postes sont en attente) */}
              {machine.rapport_expertise?.total_retenue_ht != null && (
                <div style={{ fontSize: 12, fontWeight: 700, color: "#b3541e", marginTop: 4 }}>
                  {t("mcard.expTotalProvisoire", { total: machine.rapport_expertise.total_retenue_ht.toLocaleString("fr-FR") })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: "#eefaf2", border: "1px solid #b5dfc4", borderRadius: 6, padding: "8px 12px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ color: "#1e7e46" }}>✓ {t("mcard.devisReceived")}</strong>
                {/* 💶 Détail du chiffrage de l'atelier : montant HT (+ référence) par poste */}
                {machine.devis_recu_items?.length ? (
                  <div style={{ fontSize: 12, color: "#2a6a44", marginTop: 4 }}>
                    {machine.devis_recu_items.map((it, i) => (
                      <div key={i}>
                        {it.label} : <b>{it.montant.toLocaleString("fr-FR")} € HT</b>
                        {it.reference ? <span style={{ color: "#5a8a6c" }}> — {t("mcard.devisRef")} {it.reference}</span> : null}
                      </div>
                    ))}
                    <div style={{ marginTop: 3, fontWeight: 700, borderTop: "1px solid #b5dfc4", paddingTop: 3 }}>
                      {t("mcard.devisTotal", { total: machine.devis_recu_items.reduce((s, it) => s + (it.montant || 0), 0).toLocaleString("fr-FR") })}
                    </div>
                    {/* 💶 Montant GLOBAL de l'expertise (postes fixes + devis) */}
                    {machine.rapport_expertise?.total_retenue_ht != null && (
                      <div style={{ marginTop: 2, fontWeight: 700, color: "#14532d" }}>
                        {t("mcard.expTotal", { total: machine.rapport_expertise.total_retenue_ht.toLocaleString("fr-FR") })}
                      </div>
                    )}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: "#3a7a52", marginTop: 2 }}>{t("mcard.devisReceivedNote")}</div>
              </div>
              {canEditInfos && (
                <button
                  className="btn-primary"
                  disabled={validatingDevis}
                  style={{ fontSize: 13 }}
                  onClick={async () => {
                    if (!window.confirm(t("mcard.devisValidateConfirm", { immat: machine.immat }))) return;
                    setValidatingDevis(true);
                    const r = await validerDevisEtEnvoyer(machine.immat);
                    setValidatingDevis(false);
                    if (r.ok) alert(r.email_envoye ? t("mcard.devisValidatedSent", { client: r.client }) : t("mcard.devisValidatedNoEmail"));
                    else alert(t("mcard.devisValidateError", { error: r.error }));
                  }}
                >
                  {validatingDevis ? "⏳" : "📧"} {t("mcard.devisValidateBtn")}
                </button>
              )}
            </div>
          )
        ) : null}

        {/* Bandeau expertise reçue */}
        {expertiseRecue && !machine.archived && (
          <div className="expertise-banner">
            <span className="expertise-banner-icon">✅</span>
            <div className="expertise-banner-content">
              <strong>{t("mcard.expertiseReceived")}</strong>
              <span className="expertise-banner-sub">
                {photosCount > 0 && `${photosCount} ${t("mcard.photosCutout")}`}
                {photosCount > 0 && agentExpert && " · "}
                {agentExpert && `${t("mcard.expertPrefix")} ${agentExpert}`}
                {photosCount === 0 && !agentExpert && t("mcard.expertiseSynced")}
              </span>
            </div>
          </div>
        )}

        {/* En-tête */}
        <div className="machine-header">
          <div className="machine-thumb-row">
          <MachineThumb machine={machine} size={56} />
          <div className="machine-id">
            <span className="immat">
              {machine.immat}
              {expertiseRecue && !machine.archived && (
                <span className="badge-expertise" title={t("mcard.badgeExpertiseTitle")}>
                  ✅ {t("mcard.badgeExpertise")}
                </span>
              )}
            </span>
            <span className="modele">
              {/* 🏷️ N° occasion : référence commerciale (documents externes) */}
              {machine.numero_occasion && (
                <span style={{ fontWeight: 700, color: "#1a2a6e" }}>{t("card.occasionShort")} {machine.numero_occasion} · </span>
              )}
              {machine.type_nacelle} · {machine.modele_porteur}
              {machine.annee_circulation && (
                <span className="annee"> · {machine.annee_circulation}</span>
              )}
            </span>
          </div>
          </div>
          <div className="machine-meta">
            <MetaItem label={t("mcard.metaClient")} value={machine.client_precedent} />
            <MetaItem label={t("mcard.metaReturn")} value={formatDate(machine.date_retour)} />
            <MetaItem label={t("mcard.metaContract")} value={machine.contrat} />
            {machine.localite && (
              <MetaItem label={`📍 ${t("mcard.metaSite")}`} value={machine.localite} />
            )}
            {canEditInfos && !machine.archived && (
              <button
                className="btn-edit-infos"
                onClick={() => setShowEditInfos(true)}
                title={t("mcard.editInfosTitle")}
                style={{ background: "none", border: "1px solid var(--border, #d8dbe6)", borderRadius: 6, cursor: "pointer", padding: "4px 8px", fontSize: 13 }}
              >
                ✏️
              </button>
            )}
            {canDelete && !machine.archived && (
              <button
                className="btn-delete-machine"
                onClick={() => onDelete?.(machine.id)}
                title={t("mcard.deleteTitle")}
              >
                🗑️
              </button>
            )}
            {isAdmin && !machine.archived && !canDelete && (
              <button
                className="btn-archive"
                onClick={() => setShowConfirmDelete(true)}
                title={t("mcard.archiveTitle")}
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* Bandeau infos techniques */}
        {(machine.heures_nacelle != null ||
          machine.km_porteur != null ||
          machine.agent_expertise) && (
          <div className="tech-bar">
            <div className="tech-items">
              {machine.heures_nacelle != null && (
                <span className="tech-item">
                  <span className="tech-icon">⏱</span>
                  <strong>{machine.heures_nacelle.toLocaleString("fr-FR")} h</strong> {t("mcard.platformSuffix")}
                </span>
              )}
              {machine.km_porteur != null && (
                <span className="tech-item">
                  <span className="tech-icon">🛣</span>
                  <strong>{machine.km_porteur.toLocaleString("fr-FR")} km</strong> {t("mcard.carrierSuffix")}
                </span>
              )}
              {machine.agent_expertise && (
                <span className="tech-item">
                  <span className="tech-icon">👤</span>
                  {t("mcard.expertPrefix")} <strong>{machine.agent_expertise}</strong>
                </span>
              )}
            </div>
            {hasExpertise && (
              <button
                className="btn-view-expertise"
                onClick={() => setShowExpertise(true)}
              >
                📄 {t("mcard.viewExpertise")}
              </button>
            )}
          </div>
        )}

        {/* Lien vers le rapport complet Nacelle-Expert envoyé au client.
            Priorité au rapport dynamique (toujours à jour après chiffrage devis) ;
            repli sur le PDF historique pour les anciens dossiers. */}
        {(machine.rapport_expertise?.rapport_url || machine.dossier_nacelle_expert?.rapport_url) && (
          <div style={{ padding: "2px 0 6px" }}>
            <a
              href={machine.rapport_expertise?.rapport_url || machine.dossier_nacelle_expert?.rapport_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1a2a6e", fontWeight: 600, fontSize: 13, textDecoration: "underline" }}
            >
              📄 {t("mcard.fullReport")}
            </a>
            {machine.rapport_expertise?.total_retenue_ht != null && (
              <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: "#1a2a6e" }}>
                {machine.rapport_expertise.total_retenue_ht.toLocaleString("fr-FR")} € HT
              </span>
            )}
          </div>
        )}

        {/* Stepper (caché si archivée) */}
        {!machine.archived && (
          <div className="stepper">
            <Step
              number={1}
              label={t("mcard.step1")}
              state={step1Done ? "done" : activeStep === 1 ? "active" : "todo"}
              customContent={
                step1Done ? (
                  <input
                    type="date"
                    className="stepper-date"
                    value={machine.date_demande_recuperation}
                    onChange={(e) => onSetDate(machine.id, e.target.value)}
                    disabled={!canValidate}
                  />
                ) : activeStep === 1 ? (
                  <input
                    type="date"
                    className="stepper-date stepper-date-empty"
                    onChange={(e) => onSetDate(machine.id, e.target.value)}
                    disabled={!canValidate}
                  />
                ) : null
              }
            />
            <Connector active={step1Done} />

            <Step
              number={2}
              label={t("mcard.step2")}
              state={step2Done ? "done" : activeStep === 2 ? "active" : "todo"}
              onClick={
                canValidate && (activeStep === 2 || step2Done)
                  ? () => onToggleField(machine.id, "recuperation_ok")
                  : undefined
              }
              disabled={!canValidate}
            />
            <Connector active={step2Done} />

            <Step
              number={3}
              label={t("mcard.step3")}
              state={step3Done ? "done" : activeStep === 3 ? "active" : "todo"}
              onClick={
                canValidate && (activeStep === 3 || step3Done)
                  ? () => onToggleField(machine.id, "expertise_ok")
                  : undefined
              }
              disabled={!canValidate}
            />
            <Connector active={step3Done} />

            <Step
              number={4}
              label={t("mcard.step4")}
              state={step4Done ? "done" : activeStep === 4 ? "active" : "todo"}
              onClick={
                canValidate && (activeStep === 4 || step4Done)
                  ? () => onToggleField(machine.id, "facture_ok")
                  : undefined
              }
              disabled={!canValidate}
            />
            <Connector active={step4Done} />

            <Step
              number={5}
              label={t("mcard.step5")}
              state={step5Done ? "done" : activeStep === 5 ? "active" : "todo"}
              onClick={
                canValidate && (activeStep === 5 || step5Done)
                  ? () => onToggleField(machine.id, "facture_reglee_ok")
                  : undefined
              }
              disabled={!canValidate}
            />
          </div>
        )}

        {/* 🧾 Facture de remise en état : n°, date et nom (comme les étapes de
            prépa) + suivi du règlement avec alerte clignotante > 60 j */}
        {machine.facture_ok && !machine.archived && (
          <div className="facture-resti-bloc">
            {(machine.facture_resti_numero || machine.facture_resti_date) && (
              <div className="facture-resti-info">
                📄 {t("mcard.factLine", {
                  num: machine.facture_resti_numero || "—",
                  date: machine.facture_resti_date
                    ? new Date(machine.facture_resti_date).toLocaleDateString("fr-FR")
                    : "—",
                })}
                {machine.facture_resti_par && <> · {machine.facture_resti_par}</>}
              </div>
            )}
            {!machine.facture_reglee_ok && machine.facture_resti_date && (() => {
              const jours = Math.max(
                0,
                Math.floor(
                  (Date.now() - new Date(machine.facture_resti_date).getTime()) / 86400000
                )
              );
              return (
                <span className={`facture-jours${jours > 60 ? " blink-red" : ""}`}>
                  💶 {t("mcard.factDepuis", { j: jours })}
                </span>
              );
            })()}
          </div>
        )}

        {machine.fiche_vo_creee && !machine.archived && (
          <div className="vo-banner">
            📄 {t("mcard.voCreated")} <strong>{t("nav.disponibles")}</strong>
          </div>
        )}
      </div>

      {showExpertise && (
        <ExpertiseModal
          machine={machine}
          onClose={() => setShowExpertise(false)}
        />
      )}

      {showEditInfos && (
        <EditInfosAdminModal
          machine={machine}
          onClose={() => setShowEditInfos(false)}
        />
      )}

      {showConfirmDelete && (
        <ConfirmDeleteModal
          machine={machine}
          onConfirm={handleConfirmArchive}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span className="meta-item">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{value}</span>
    </span>
  );
}

function Step({
  number,
  label,
  state,
  onClick,
  customContent,
  disabled = false,
}: {
  number: number;
  label: string;
  state: "done" | "active" | "todo";
  onClick?: () => void;
  customContent?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={`step step-${state}`}>
      <button
        className="step-circle"
        onClick={onClick}
        disabled={disabled || state === "todo"}
        type="button"
      >
        {state === "done" ? "✓" : number}
      </button>
      <span className="step-label">{label}</span>
      {customContent}
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return <div className={`step-connector ${active ? "active" : ""}`} />;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
