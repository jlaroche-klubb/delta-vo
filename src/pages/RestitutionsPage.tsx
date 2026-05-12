import { useState, useMemo } from "react";
import { Machine } from "../types/machine";
import { MOCK_MACHINES } from "../data/mockMachines";
import MachineCard from "../components/MachineCard";
import FiltersBar, { FilterState, EMPTY_FILTERS, applyFilters } from "../components/FiltersBar";
import { exportMachinesToExcel } from "../utils/exportExcel";

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
  const [machines, setMachines] = useState<Machine[]>(MOCK_MACHINES);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewMachineForm>(EMPTY_FORM);

  const filtered = useMemo(() => {
    let result = machines.filter((m) => m.statut === "restitution");
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.immat.toLowerCase().includes(q) ||
          m.modele_porteur.toLowerCase().includes(q) ||
          m.type_nacelle.toLowerCase().includes(q) ||
          m.client_precedent.toLowerCase().includes(q) ||
          m.contrat.toLowerCase().includes(q)
      );
    }
    result = applyFilters(result, filters);
    return result;
  }, [machines, search, filters]);

  const total = filtered.length;
  const voCreated = filtered.filter((m) => m.fiche_vo_creee).length;
  const finalizing = filtered.filter(
    (m) => m.fiche_vo_creee && m.facture_ok && !m.facture_reglee_ok
  ).length;

  function setDate(id: string, date: string) {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, date_demande_recuperation: date, updatedAt: new Date().toISOString() }
          : m
      )
    );
  }

  function toggleField(
    id: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated: Machine = {
          ...m,
          [field]: !m[field],
          updatedAt: new Date().toISOString(),
        };
        updated.fiche_vo_creee = updated.recuperation_ok && updated.expertise_ok;

        if (
          updated.date_demande_recuperation &&
          updated.recuperation_ok &&
          updated.expertise_ok &&
          updated.facture_ok &&
          updated.facture_reglee_ok
        ) {
          setTimeout(() => {
            setMachines((cur) =>
              cur.map((x) =>
                x.id === id ? { ...x, statut: "disponible" as const } : x
              )
            );
          }, 1500);
        }
        return updated;
      })
    );
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
    setMachines((prev) => [newMachine, ...prev]);
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
      </div>

      <FiltersBar
        filters={filters}
        onChange={setFilters}
        machines={machines.filter((m) => m.statut === "restitution")}
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