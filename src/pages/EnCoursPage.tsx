import { useState, useMemo } from "react";
import {
  Machine,
  prepaTerminee,
  isLivraisonEnRetard,
  isMiseDispoEnRetard,
} from "../types/machine";
import { useMachines } from "../contexts/MachinesContext";
import EnCoursCard from "../components/EnCoursCard";
import DocumentsModal from "../components/DocumentsModal";
import { useTranslation } from "react-i18next";
import ConfigEnCoursModal, {
  ConfigEnCoursPayload,
} from "../components/ConfigEnCoursModal";
import ConfirmFactureModal from "../components/ConfirmFactureModal";
import EnCoursFilters, {
  EnCoursFilterState,
  EMPTY_ENCOURS_FILTERS,
  applyEnCoursFilters,
} from "../components/EnCoursFilters";
import { canEditEtapesPreparation } from "../utils/permissions";

interface EnCoursPageProps {
  userRole: string;
  userName: string;
}

export default function EnCoursPage({ userRole, userName }: EnCoursPageProps) {
  const { machines, toggleEtapePrepa, setEtapeNonNecessaire, addEtapePrepa, removeEtapePrepa, configureEnCours, cancelEnCours, marquerFacturee, updateDocumentsVO } = useMachines();
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const [filters, setFilters] = useState<EnCoursFilterState>(EMPTY_ENCOURS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [configMachine, setConfigMachine] = useState<Machine | null>(null);
  const [factureMachine, setFactureMachine] = useState<Machine | null>(null);
  const [docsMachine, setDocsMachine] = useState<Machine | null>(null);

  const canEditPrepa = canEditEtapesPreparation(userRole as any);
  const canConfigure = userRole === "secretaire" || userRole === "admin";
  const canFacturer = userRole === "secretaire" || userRole === "admin";
  const canCancel = userRole === "admin";  // ✅ Admin only
  const canManageDocuments = canEditPrepa || canConfigure; // atelier + secrétaire + admin

  const baseEnCours = useMemo(
    () => machines.filter((m) => m.statut === "en_cours"),
    [machines]
  );

  const filtered = useMemo(() => {
    let result = baseEnCours;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.immat.toLowerCase().includes(q) ||
          m.modele_porteur.toLowerCase().includes(q) ||
          m.type_nacelle.toLowerCase().includes(q) ||
          (m.acheteur && m.acheteur.toLowerCase().includes(q)) ||
          (m.client_lld && m.client_lld.toLowerCase().includes(q)) ||
          (m.commercial_vendeur && m.commercial_vendeur.toLowerCase().includes(q))
      );
    }
    result = applyEnCoursFilters(result, filters);
    return result;
  }, [baseEnCours, search, filters]);

  const nonConfigurees = filtered.filter((m) => !m.type_prepa);
  const enPrepa = filtered.filter(
    (m) => m.type_prepa === "normale" && !prepaTerminee(m.etapes_prepa)
  );
  const pretes = filtered.filter(
    (m) =>
      m.type_prepa &&
      (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa))
  );

  const nonConfigureesSorted = [...nonConfigurees].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const enPrepaSorted = [...enPrepa].sort((a, b) => {
    const pctA =
      (a.etapes_prepa?.filter((e) => e.done).length || 0) /
      (a.etapes_prepa?.length || 1);
    const pctB =
      (b.etapes_prepa?.filter((e) => e.done).length || 0) /
      (b.etapes_prepa?.length || 1);
    return pctB - pctA;
  });

  const pretesSorted = [...pretes].sort((a, b) => {
    const dateA = a.date_vente || a.date_mise_en_cours || a.createdAt;
    const dateB = b.date_vente || b.date_mise_en_cours || b.createdAt;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  const totalEnCours = baseEnCours.length;
  const totalNonConfigurees = baseEnCours.filter((m) => !m.type_prepa).length;
  const totalPretes = baseEnCours.filter(
    (m) =>
      m.type_prepa &&
      (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa))
  ).length;
  const totalEnRetard = baseEnCours.filter((m) => {
    if (m.type_sortie === "lld") return isMiseDispoEnRetard(m.date_mise_dispo_lld);
    return isLivraisonEnRetard(m.date_livraison_prevue);
  }).length;

  const machinesAvecPrepa = baseEnCours.filter(
    (m) =>
      m.type_prepa === "normale" &&
      prepaTerminee(m.etapes_prepa) &&
      m.date_mise_en_cours &&
      m.etapes_prepa
  );
  const delaiMoyenPrepa =
    machinesAvecPrepa.length > 0
      ? Math.round(
          machinesAvecPrepa.reduce((acc, m) => {
            const lastDoneStr = m.etapes_prepa
              ?.filter((e) => e.done_at)
              .map((e) => e.done_at!)
              .sort()
              .pop();
            if (!lastDoneStr || !m.date_mise_en_cours) return acc;
            const debut = new Date(m.date_mise_en_cours);
            const fin = new Date(lastDoneStr);
            const jours = Math.floor(
              (fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)
            );
            return acc + jours;
          }, 0) / machinesAvecPrepa.length
        )
      : null;

  function handleToggleEtape(machineId: string, etapeId: string) {
    toggleEtapePrepa(machineId, etapeId, userName);
  }

  function handleConfigure(machineId: string, config: ConfigEnCoursPayload) {
    configureEnCours(
      machineId,
      config.type_prepa,
      config.acheteur,
      config.commercial_vendeur,
      config.date_vente,
      config.date_livraison_prevue
    );
  }

  function handleCancel(machineId: string) {
    cancelEnCours(machineId);
  }

  function handleFacturer(machineId: string, numeroFacture: string, dateFacturation: string) {
    marquerFacturee(machineId, numeroFacture, dateFacturation);
  }

  function clickUrgence() {
    setFilters({ ...EMPTY_ENCOURS_FILTERS, statut: "en_retard" });
    setFiltersOpen(true);
  }

  return (
    <div className="page-encours">
      <div className="page-header">
        <div>
        <h1>{t("encours.title")}</h1>
          <p className="subtitle">{t("encours.subtitle")}</p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{totalEnCours}</span>
            <span className="stat-label">{t("encours.statInProgress")}</span>
          </div>
          <div className="stat stat-pending">
            <span className="stat-value">{totalNonConfigurees}</span>
            <span className="stat-label">{t("encours.statToConfigure")}</span>
          </div>
          <div className="stat stat-ready">
            <span className="stat-value">{totalPretes}</span>
            <span className="stat-label">{t("encours.statToInvoice")}</span>
          </div>
          <div className="stat stat-warn">
            <span className="stat-value">{totalEnRetard}</span>
            <span className="stat-label">{t("encours.statLate")}</span>
          </div>
          {delaiMoyenPrepa !== null && (
            <div className="stat stat-info">
              <span className="stat-value">{delaiMoyenPrepa}{t("card.daysShort")}</span>
              <span className="stat-label">{t("encours.statAvgDelay")}</span>
            </div>
          )}
        </div>
      </div>

      {totalEnRetard > 0 && (
        <div className="urgent-banner" onClick={clickUrgence}>
          <div className="urgent-icon">⚠</div>
          <div className="urgent-text">
            <strong>
              {totalEnRetard} {t("encours.urgentLate")}
            </strong>
            <span className="urgent-sub">
              {t("encours.urgentSub")}
            </span>
          </div>
          <div className="urgent-action">→</div>
        </div>
      )}

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder={t("encours.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <EnCoursFilters
        filters={filters}
        onChange={setFilters}
        machines={baseEnCours}
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen(!filtersOpen)}
      />

      {nonConfigureesSorted.length > 0 && (
        <section className="encours-section section-unconfigured">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-pending"></span>
              {t("encours.sectionToConfigure")}
              <span className="section-count">{nonConfigureesSorted.length}</span>
            </h2>
            <p className="section-desc">{t("encours.sectionToConfigureDesc")}</p>
          </div>
          <div className="encours-list">
            {nonConfigureesSorted.map((m) => (
              <EnCoursCard
                key={m.id}
                machine={m}
                canEditPrepa={canEditPrepa}
                canConfigure={canConfigure}
                canFacturer={false}
                onToggleEtape={handleToggleEtape}
                onSetNonNecessaire={setEtapeNonNecessaire}
                onAddEtape={addEtapePrepa}
                onRemoveEtape={removeEtapePrepa}
                onConfigure={setConfigMachine}
                canManageDocuments={canManageDocuments}
                onOpenDocuments={setDocsMachine}
                canCancel={canCancel}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </section>
      )}

      {enPrepaSorted.length > 0 && (
        <section className="encours-section section-prepa">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-prepa"></span>
              {t("encours.sectionInPrep")}
              <span className="section-count">{enPrepaSorted.length}</span>
            </h2>
            <p className="section-desc">{t("encours.sectionInPrepDesc")}</p>
          </div>
          <div className="encours-list">
            {enPrepaSorted.map((m) => (
              <EnCoursCard
                key={m.id}
                machine={m}
                canEditPrepa={canEditPrepa}
                canConfigure={canConfigure}
                canFacturer={canFacturer}
                onToggleEtape={handleToggleEtape}
                onSetNonNecessaire={setEtapeNonNecessaire}
                onAddEtape={addEtapePrepa}
                onRemoveEtape={removeEtapePrepa}
                onConfigure={setConfigMachine}
                canManageDocuments={canManageDocuments}
                onOpenDocuments={setDocsMachine}
                onFacturer={setFactureMachine}
                canCancel={canCancel}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </section>
      )}

      {pretesSorted.length > 0 && (
        <section className="encours-section section-pretes">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-ok"></span>
              {t("encours.sectionReady")}
              <span className="section-count">{pretesSorted.length}</span>
            </h2>
            <p className="section-desc">{t("encours.sectionReadyDesc")}</p>
          </div>
          <div className="encours-list">
            {pretesSorted.map((m) => (
              <EnCoursCard
                key={m.id}
                machine={m}
                canEditPrepa={canEditPrepa}
                canConfigure={canConfigure}
                canFacturer={canFacturer}
                onToggleEtape={handleToggleEtape}
                onSetNonNecessaire={setEtapeNonNecessaire}
                onAddEtape={addEtapePrepa}
                onRemoveEtape={removeEtapePrepa}
                onConfigure={setConfigMachine}
                canManageDocuments={canManageDocuments}
                onOpenDocuments={setDocsMachine}
                onFacturer={setFactureMachine}
                canCancel={canCancel}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          {search
            ? t("encours.emptyNoMatch")
            : t("encours.emptyNone")}
        </div>
      )}

      {configMachine && (
        <ConfigEnCoursModal
          machine={configMachine}
          onClose={() => setConfigMachine(null)}
          onSave={handleConfigure}
        />
      )}

      {factureMachine && (
        <ConfirmFactureModal
          machine={factureMachine}
          onClose={() => setFactureMachine(null)}
          onConfirm={handleFacturer}
        />
      )}

      {docsMachine && (
        <DocumentsModal
          machine={docsMachine}
          canManage={canManageDocuments}
          userName={userName}
          onClose={() => setDocsMachine(null)}
          onSave={updateDocumentsVO}
        />
      )}
    </div>
  );
}
