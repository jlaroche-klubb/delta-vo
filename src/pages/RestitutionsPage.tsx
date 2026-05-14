import { useState, useMemo } from "react";
import { Machine } from "../types/machine";
import { useMachinesFiltered } from "../contexts/MachinesContext";
import MachineCard from "../components/MachineCard";
import FiltersBar, { FilterState, EMPTY_FILTERS, applyFilters } from "../components/FiltersBar";
import { exportMachinesToExcel } from "../utils/exportExcel";
import { useAuth } from "../AuthContext";

interface NewMachineForm {
  immat: string;
  modele_porteur: string;
  type_nacelle: string;
  annee_circulation: string;
  client_precedent: string;
  contrat: string;
  date_retour: string;
}

const EMPTY_FORM: NewMachineForm = {
  immat: "",
  modele_porteur: "",
  type_nacelle: "",
  annee_circulation: "",
  client_precedent: "",
  contrat: "",
  date_retour: new Date().toISOString().slice(0, 10),
};

export default function RestitutionsPage() {
  // 🆕 Toggle "Voir archivées"
  const [showArchived, setShowArchived] = useState(false);

  // === STATE GLOBAL via useMachinesFiltered (fusion + filtrage archivées) ===
  const {
    machines: allMachines,
    toggleEtapeRestitution,
    setDateDemandeRecup,
    createMachineRestitution,
  } = useMachinesFiltered(showArchived);

  // Pour le compteur total des archivées (cache toujours, hors filtre)
  const { machines: allMachinesUnfiltered } = useMachinesFiltered(true);

  const { profile } = useAuth();
  const isAdmin = !profile || profile.role === "admin";

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewMachineForm>(EMPTY_FORM);

  // === Filtrage par statut restitution puis search + filtres avancés ===
  const restitutionMachines = useMemo(
    () => allMachines.filter((m) => m.statut === "restitution"),
    [allMachines]
  );

  // Compteur des archivées (pour info dans la barre)
  const totalArchived = useMemo(
    () =>
      allMachinesUnfiltered.filter(
        (m) => m.archived && m.statut === "restitution"
      ).length,
    [allMachinesUnfiltered]
  );

  const filtered = useMemo(() => {
    let result = restitutionMachines;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          (m.immat || "").toLowerCase().includes(q) ||
          (m.modele_porteur || "").toLowerCase().includes(q) ||
          (m.type_nacelle || "").toLowerCase().includes(q) ||
          (m.client_precedent || "").toLowerCase().includes(q) ||
          (m.contrat || "").toLowerCase().includes(q)
      );
    }
    result = applyFilters(result, filters);
    return result;
  }, [restitutionMachines, search, filters]);

  const total = filtered.length;
  const voCreated = filtered.filter((m) => m.fiche_vo_creee).length;
  const finalizing = filtered.filter(
    (m) => m.fiche_vo_creee && m.facture_ok && !m.facture_reglee_ok
  ).length;

  // === Handlers ===
  function setDate(id: string, date: string) {
    setDateDemandeRecup(id, date);
  }

  function toggleField(
    id: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) {
    toggleEtapeRestitution(id, field);
  }

  function createMachine() {
    if (!form.immat.trim()) {
      alert("L'immatriculation est obligatoire");
      return;
    }
    const newMachine: Machine = {
      id: "M" + Date.now().toString().slice(-6),
      immat: form.immat.toUpperCase(),
      modele_porteur: form.modele_porteur,
      type_nacelle: form.type_nacelle,
      annee_circulation: form.annee_circulation,
      client_precedent: form.client_precedent,
      contrat: form.contrat,
      date_retour: form.date_retour,
      statut: "restitution",
      recuperation_ok: false,
      expertise_ok: false,
      facture_ok: false,
      facture_reglee_ok: false,
      fiche_vo_creee: false,
      createdAt: new Date().toISOString(),
    };
    createMachineRestitution(newMachine);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  function handleExport() {
    if (filtered.length === 0) {
      alert("Aucune machine à exporter avec les filtres actuels");
      return;
    }
    exportMachinesToExcel(filtered);
  }

  return (
    <div className="page-restitutions">
      <div className="page-header">
        <div>
          <h1>Restitutions</h1>
          <p className="subtitle">
            Suivi des nacelles en retour de location · Workflow ADV
          </p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{total}</span>
            <span className="stat-label">en cours</span>
          </div>
          <div className="stat stat-vo">
            <span className="stat-value">{voCreated}</span>
            <span className="stat-label">fiches VO</span>
          </div>
          <div className="stat stat-ready">
            <span className="stat-value">{finalizing}</span>
            <span className="stat-label">à régler</span>
          </div>
        </div>
      </div>

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Rechercher par immatriculation, modèle, client, contrat..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-export" onClick={handleExport} title="Télécharger en Excel">
          ⬇ Export Excel
        </button>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          + Créer un retour
        </button>
        {isAdmin && (
          <button
            className={`toggle-archived ${showArchived ? "active" : ""}`}
            onClick={() => setShowArchived(!showArchived)}
            title="Voir les machines archivées"
          >
            🗑️ {showArchived ? "Masquer archivées" : "Voir archivées"}
            {totalArchived > 0 && !showArchived && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>({totalArchived})</span>
            )}
          </button>
        )}
      </div>

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        machines={restitutionMachines}
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen(!filtersOpen)}
      />

      {/* Modal de création */}
      {showForm && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowForm(false);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <h2>Nouveau retour</h2>
              <button className="btn-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label>Immatriculation *</label>
                <input
                  type="text"
                  placeholder="FR-123-AB"
                  value={form.immat}
                  onChange={(e) => setForm({ ...form, immat: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="form-field">
                <label>Type nacelle</label>
                <input
                  type="text"
                  placeholder="K20, K26, K32, K46…"
                  value={form.type_nacelle}
                  onChange={(e) => setForm({ ...form, type_nacelle: e.target.value })}
                />
              </div>
              <div className="form-field form-field-wide">
                <label>Modèle porteur</label>
                <input
                  type="text"
                  placeholder="Renault Master, Iveco Daily…"
                  value={form.modele_porteur}
                  onChange={(e) => setForm({ ...form, modele_porteur: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Mise en circulation</label>
                <input
                  type="text"
                  placeholder="JJ/MM/AAAA"
                  value={form.annee_circulation}
                  onChange={(e) => setForm({ ...form, annee_circulation: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>N° contrat</label>
                <input
                  type="text"
                  placeholder="CTR-2024-XXX"
                  value={form.contrat}
                  onChange={(e) => setForm({ ...form, contrat: e.target.value })}
                />
              </div>
              <div className="form-field form-field-wide">
                <label>Client précédent</label>
                <input
                  type="text"
                  placeholder="Société / nom client"
                  value={form.client_precedent}
                  onChange={(e) => setForm({ ...form, client_precedent: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Date retour</label>
                <input
                  type="date"
                  value={form.date_retour}
                  onChange={(e) => setForm({ ...form, date_retour: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={createMachine}>
                Créer le retour
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="machines-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            {search ||
            filters.etape !== "tous" ||
            filters.client ||
            filters.typeNacelle ||
            filters.dateDebut ||
            filters.dateFin
              ? "Aucune machine ne correspond à vos critères"
              : showArchived
              ? "Aucune machine archivée"
              : "Aucun retour en cours · Cliquez sur « + Créer un retour » pour commencer"}
          </div>
        ) : (
          filtered.map((m) => (
            <MachineCard
              key={m.id}
              machine={m}
              onSetDate={setDate}
              onToggleField={toggleField}
            />
          ))
        )}
      </div>
    </div>
  );
}