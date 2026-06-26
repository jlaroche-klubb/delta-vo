import { Machine } from "../types/machine";
import { useTranslation } from "react-i18next";

export interface FilterState {
  etape: "tous" | "demande" | "recuperation" | "expertise" | "facture" | "reglee";
  client: string;
  typeNacelle: string;
  dateDebut: string;
  dateFin: string;
}

export const EMPTY_FILTERS: FilterState = {
  etape: "tous",
  client: "",
  typeNacelle: "",
  dateDebut: "",
  dateFin: "",
};

interface FiltersBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  machines: Machine[];
  isOpen: boolean;
  onToggle: () => void;
}

export default function FiltersBar({
  filters,
  onChange,
  machines,
  isOpen,
  onToggle,
}: FiltersBarProps) {
  // Liste unique des clients dans les machines
  const clients = Array.from(
    new Set(machines.map((m) => m.client_precedent).filter(Boolean))
  ).sort();

  // Liste unique des types de nacelle
  const types = Array.from(
    new Set(machines.map((m) => m.type_nacelle).filter(Boolean))
  ).sort();

  const activeCount = countActiveFilters(filters);
  const { t: tr } = useTranslation();

  function reset() {
    onChange(EMPTY_FILTERS);
  }

  return (
    <div className={`filters-wrap ${isOpen ? "open" : ""}`}>
      <button className="filters-toggle" onClick={onToggle}>
        <span className="filter-icon">▾</span>
        <span>{tr("filters.title")}</span>
        {activeCount > 0 && (
          <span className="filters-count">{activeCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="filters-panel">
          <div className="filters-grid">
            <div className="filter-field">
              <label>{tr("filters.blockedAtStep")}</label>
              <select
                value={filters.etape}
                onChange={(e) =>
                  onChange({ ...filters, etape: e.target.value as FilterState["etape"] })
                }
              >
                <option value="tous">{tr("filters.allSteps")}</option>
                <option value="demande">{tr("filters.stepDemande")}</option>
                <option value="recuperation">{tr("filters.stepRecup")}</option>
                <option value="expertise">{tr("filters.stepExpertise")}</option>
                <option value="facture">{tr("filters.stepFactureEmettre")}</option>
                <option value="reglee">{tr("filters.stepFactureRegler")}</option>
              </select>
            </div>

            <div className="filter-field">
              <label>{tr("filters.client")}</label>
              <select
                value={filters.client}
                onChange={(e) => onChange({ ...filters, client: e.target.value })}
              >
                <option value="">{tr("filters.allClients")}</option>
                {clients.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label>{tr("filters.typeNacelle")}</label>
              <select
                value={filters.typeNacelle}
                onChange={(e) => onChange({ ...filters, typeNacelle: e.target.value })}
              >
                <option value="">{tr("filters.allTypes")}</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label>{tr("filters.returnFrom")}</label>
              <input
                type="date"
                value={filters.dateDebut}
                onChange={(e) => onChange({ ...filters, dateDebut: e.target.value })}
              />
            </div>

            <div className="filter-field">
              <label>{tr("filters.returnTo")}</label>
              <input
                type="date"
                value={filters.dateFin}
                onChange={(e) => onChange({ ...filters, dateFin: e.target.value })}
              />
            </div>

            {activeCount > 0 && (
              <div className="filter-field filter-reset">
                <button className="btn-reset" onClick={reset}>
                  ✕ {tr("filters.reset")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function countActiveFilters(f: FilterState): number {
  let n = 0;
  if (f.etape !== "tous") n++;
  if (f.client) n++;
  if (f.typeNacelle) n++;
  if (f.dateDebut) n++;
  if (f.dateFin) n++;
  return n;
}

// Fonction de filtrage exportée — utilisée par RestitutionsPage
export function applyFilters(machines: Machine[], f: FilterState): Machine[] {
  return machines.filter((m) => {
    // Filtre étape de blocage
    if (f.etape !== "tous") {
      const step1 = !!m.date_demande_recuperation;
      const step2 = m.recuperation_ok;
      const step3 = m.expertise_ok;
      const step4 = m.facture_ok;
      const step5 = m.facture_reglee_ok;

      if (f.etape === "demande" && step1) return false;
      if (f.etape === "recuperation" && (!step1 || step2)) return false;
      if (f.etape === "expertise" && (!step2 || step3)) return false;
      if (f.etape === "facture" && (!step3 || step4)) return false;
      if (f.etape === "reglee" && (!step4 || step5)) return false;
    }

    // Filtre client
    if (f.client && m.client_precedent !== f.client) return false;

    // Filtre type
    if (f.typeNacelle && m.type_nacelle !== f.typeNacelle) return false;

    // Filtre dates
    if (f.dateDebut && m.date_retour < f.dateDebut) return false;
    if (f.dateFin && m.date_retour > f.dateFin) return false;

    return true;
  });
}
