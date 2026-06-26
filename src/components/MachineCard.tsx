import { useState } from "react";
import { Machine } from "../types/machine";
import ExpertiseModal from "./ExpertiseModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { useMachines } from "../contexts/MachinesContext";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

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

  // const { archiveMachine, unarchiveMachine } = useMachines();
  const { profile } = useAuth();
  // En DEV_MODE (profile null) → tout le monde est admin pour pouvoir tester
  const isAdmin = !profile || profile.role === "admin";

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
              {machine.type_nacelle} · {machine.modele_porteur}
              {machine.annee_circulation && (
                <span className="annee"> · {machine.annee_circulation}</span>
              )}
            </span>
          </div>
          <div className="machine-meta">
            <MetaItem label={t("mcard.metaClient")} value={machine.client_precedent} />
            <MetaItem label={t("mcard.metaReturn")} value={formatDate(machine.date_retour)} />
            <MetaItem label={t("mcard.metaContract")} value={machine.contrat} />
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

        {/* Lien vers le rapport complet Nacelle-Expert envoyé au client */}
        {machine.dossier_nacelle_expert?.rapport_url && (
          <div style={{ padding: "2px 0 6px" }}>
            <a
              href={machine.dossier_nacelle_expert.rapport_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#1a2a6e", fontWeight: 600, fontSize: 13, textDecoration: "underline" }}
            >
              📄 {t("mcard.fullReport")}
            </a>
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
