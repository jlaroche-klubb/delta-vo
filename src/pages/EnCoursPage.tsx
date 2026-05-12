import { useState, useMemo } from "react";
import {
  Machine,
  prepaTerminee,
  isLivraisonEnRetard,
  isMiseDispoEnRetard,
} from "../types/machine";
import { useMachines } from "../contexts/MachinesContext";
import EnCoursCard from "../components/EnCoursCard";
import ConfigEnCoursModal, {
  ConfigEnCoursPayload,
} from "../components/ConfigEnCoursModal";
import ConfirmFactureModal from "../components/ConfirmFactureModal";
import EnCoursFilters, {
  EnCoursFilterState,
  EMPTY_ENCOURS_FILTERS,
  applyEnCoursFilters,
} from "../components/EnCoursFilters";

interface EnCoursPageProps {
  userRole: string;
  userName: string;
}

export default function EnCoursPage({ userRole, userName }: EnCoursPageProps) {
  const { machines, toggleEtapePrepa, configureEnCours, marquerFacturee } = useMachines();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EnCoursFilterState>(EMPTY_ENCOURS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [configMachine, setConfigMachine] = useState<Machine | null>(null);
  const [factureMachine, setFactureMachine] = useState<Machine | null>(null);

  const canEditPrepa = userRole === "atelier" || userRole === "admin";
  const canConfigure = userRole === "secretaire" || userRole === "admin";
  const canFacturer = userRole === "secretaire" || userRole === "admin";

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
          <h1>En cours</h1>
          <p className="subtitle">Machines vendues ou en LLD en attente de livraison</p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{totalEnCours}</span>
            <span className="stat-label">en cours</span>
          </div>
          <div className="stat stat-pending">
            <span className="stat-value">{totalNonConfigurees}</span>
            <span className="stat-label">à configurer</span>
          </div>
          <div className="stat stat-ready">
            <span className="stat-value">{totalPretes}</span>
            <span className="stat-label">à facturer</span>
          </div>
          <div className="stat stat-warn">
            <span className="stat-value">{totalEnRetard}</span>
            <span className="stat-label">en retard</span>
          </div>
          {delaiMoyenPrepa !== null && (
            <div className="stat stat-info">
              <span className="stat-value">{delaiMoyenPrepa}j</span>
              <span className="stat-label">délai moyen prépa</span>
            </div>
          )}
        </div>
      </div>

      {totalEnRetard > 0 && (
        <div className="urgent-banner" onClick={clickUrgence}>
          <div className="urgent-icon">⚠</div>
          <div className="urgent-text">
            <strong>
              {totalEnRetard} livraison{totalEnRetard > 1 ? "s" : ""} / mise{totalEnRetard > 1 ? "s" : ""} à dispo en retard
            </strong>
            <span className="urgent-sub">
              Clique pour filtrer et voir uniquement les machines en retard
            </span>
          </div>
          <div className="urgent-action">→</div>
        </div>
      )}

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Rechercher par immat, modèle, acheteur, client LLD, commercial..."
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
              À configurer
              <span className="section-count">{nonConfigureesSorted.length}</span>
            </h2>
            <p className="section-desc">
              Machines qui viennent d'arriver — l'ADV doit choisir le type de prépa et renseigner les infos de vente
            </p>
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
                onConfigure={setConfigMachine}
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
              Prépa en cours
              <span className="section-count">{enPrepaSorted.length}</span>
            </h2>
            <p className="section-desc">
              Triées par avancement décroissant — les plus proches de la fin en haut
            </p>
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
                onConfigure={setConfigMachine}
                onFacturer={setFactureMachine}
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
              Prêtes à facturer
              <span className="section-count">{pretesSorted.length}</span>
            </h2>
            <p className="section-desc">
              Prépa terminée ou vendue en l'état — en attente de facturation
            </p>
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
                onConfigure={setConfigMachine}
                onFacturer={setFactureMachine}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          {search
            ? "Aucune machine ne correspond à votre recherche"
            : "Aucune machine en cours"}
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
    </div>
  );
}