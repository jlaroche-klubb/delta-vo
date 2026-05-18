import { useState } from "react";
import { Machine } from "../types/machine";
import ExpertiseModal from "./ExpertiseModal";
import ConfirmDeleteModal from "./ConfirmDeleteModal";
import { useMachines } from "../contexts/MachinesContext";
import { useAuth } from "../AuthContext";

interface MachineCardProps {
  machine: Machine;
  onSetDate: (id: string, date: string) => void;
  onToggleField: (
    id: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) => void;
}

export default function MachineCard({ machine, onSetDate, onToggleField }: MachineCardProps) {
  const [showExpertise, setShowExpertise] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const { archiveMachine, unarchiveMachine } = useMachines();
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
      archiveMachine(machine.id, userName);
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
              <strong>Machine archivée</strong>
              <small>
                par {machine.archived_by || "—"} le{" "}
                {machine.archived_at
                  ? new Date(machine.archived_at).toLocaleDateString("fr-FR")
                  : "—"}
              </small>
            </div>
            {isAdmin && (
              <button
                className="btn-unarchive"
                onClick={() => unarchiveMachine(machine.id)}
              >
                ↩ Restaurer
              </button>
            )}
          </div>
        )}

        {/* Bandeau expertise reçue */}
        {expertiseRecue && !machine.archived && (
          <div className="expertise-banner">
            <span className="expertise-banner-icon">✅</span>
            <div className="expertise-banner-content">
              <strong>Expertise reçue depuis nacelle-expert</strong>
              <span className="expertise-banner-sub">
                {photosCount > 0 && `${photosCount} photo${photosCount > 1 ? "s" : ""} détourée${photosCount > 1 ? "s" : ""}`}
                {photosCount > 0 && agentExpert && " · "}
                {agentExpert && `Expert : ${agentExpert}`}
                {photosCount === 0 && !agentExpert && "Données expertise synchronisées"}
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
                <span className="badge-expertise" title="Expertise nacelle-expert reçue">
                  ✅ Expertise
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
            <MetaItem label="Client" value={machine.client_precedent} />
            <MetaItem label="Retour" value={formatDate(machine.date_retour)} />
            <MetaItem label="Contrat" value={machine.contrat} />
            {isAdmin && !machine.archived && (
              <button
                className="btn-archive"
                onClick={() => setShowConfirmDelete(true)}
                title="Archiver cette machine"
              >
                🗑️
              </button>
            )}
          </div>
        </div>

        {/* Bandeau infos techniques */}
        {(machine.heures_nacelle !== undefined ||
          machine.km_porteur !== undefined ||
          machine.agent_expertise) && (
          <div className="tech-bar">
            <div className="tech-items">
              {machine.heures_nacelle !== undefined && (
                <span className="tech-item">
                  <span className="tech-icon">⏱</span>
                  <strong>{machine.heures_nacelle.toLocaleString("fr-FR")} h</strong> nacelle
                </span>
              )}
              {machine.km_porteur !== undefined && (
                <span className="tech-item">
                  <span className="tech-icon">🛣</span>
                  <strong>{machine.km_porteur.toLocaleString("fr-FR")} km</strong> porteur
                </span>
              )}
              {machine.agent_expertise && (
                <span className="tech-item">
                  <span className="tech-icon">👤</span>
                  Expert : <strong>{machine.agent_expertise}</strong>
                </span>
              )}
            </div>
            {hasExpertise && (
              <button
                className="btn-view-expertise"
                onClick={() => setShowExpertise(true)}
              >
                📄 Voir l'expertise
              </button>
            )}
          </div>
        )}

        {/* Stepper (caché si archivée) */}
        {!machine.archived && (
          <div className="stepper">
            <Step
              number={1}
              label="Demande récup."
              state={step1Done ? "done" : activeStep === 1 ? "active" : "todo"}
              customContent={
                step1Done ? (
                  <input
                    type="date"
                    className="stepper-date"
                    value={machine.date_demande_recuperation}
                    onChange={(e) => onSetDate(machine.id, e.target.value)}
                  />
                ) : activeStep === 1 ? (
                  <input
                    type="date"
                    className="stepper-date stepper-date-empty"
                    onChange={(e) => onSetDate(machine.id, e.target.value)}
                  />
                ) : null
              }
            />
            <Connector active={step1Done} />

            <Step
              number={2}
              label="Récupération"
              state={step2Done ? "done" : activeStep === 2 ? "active" : "todo"}
              onClick={
                activeStep === 2 || step2Done
                  ? () => onToggleField(machine.id, "recuperation_ok")
                  : undefined
              }
            />
            <Connector active={step2Done} />

            <Step
              number={3}
              label="Expertise"
              state={step3Done ? "done" : activeStep === 3 ? "active" : "todo"}
              onClick={
                activeStep === 3 || step3Done
                  ? () => onToggleField(machine.id, "expertise_ok")
                  : undefined
              }
            />
            <Connector active={step3Done} />

            <Step
              number={4}
              label="Facture"
              state={step4Done ? "done" : activeStep === 4 ? "active" : "todo"}
              onClick={
                activeStep === 4 || step4Done
                  ? () => onToggleField(machine.id, "facture_ok")
                  : undefined
              }
            />
            <Connector active={step4Done} />

            <Step
              number={5}
              label="Réglée"
              state={step5Done ? "done" : activeStep === 5 ? "active" : "todo"}
              onClick={
                activeStep === 5 || step5Done
                  ? () => onToggleField(machine.id, "facture_reglee_ok")
                  : undefined
              }
            />
          </div>
        )}

        {machine.fiche_vo_creee && !machine.archived && (
          <div className="vo-banner">
            📄 Fiche VO créée — visible dans <strong>Disponibles</strong>
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
}: {
  number: number;
  label: string;
  state: "done" | "active" | "todo";
  onClick?: () => void;
  customContent?: React.ReactNode;
}) {
  return (
    <div className={`step step-${state}`}>
      <button
        className="step-circle"
        onClick={onClick}
        disabled={state === "todo"}
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
