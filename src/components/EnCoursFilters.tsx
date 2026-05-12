import { Machine, prepaTerminee, isLivraisonEnRetard } from "../types/machine";

export type TypePrepaFilter = "tous" | "normale" | "en_etat";
export type StatutEnCoursFilter =
  | "tous"
  | "a_configurer"
  | "en_prepa"
  | "pretes"
  | "en_retard";
export type LivraisonRapide =
  | "toutes"
  | "cette_semaine"
  | "ce_mois"
  | "en_retard"
  | "depassees_7j";

export interface EnCoursFilterState {
  commercial: string;
  acheteur: string;
  typeNacelle: string;
  typePrepa: TypePrepaFilter;
  statut: StatutEnCoursFilter;
  livraisonRapide: LivraisonRapide;
  livraisonDe: string;
  livraisonA: string;
}

export const EMPTY_ENCOURS_FILTERS: EnCoursFilterState = {
  commercial: "",
  acheteur: "",
  typeNacelle: "",
  typePrepa: "tous",
  statut: "tous",
  livraisonRapide: "toutes",
  livraisonDe: "",
  livraisonA: "",
};

interface EnCoursFiltersProps {
  filters: EnCoursFilterState;
  onChange: (filters: EnCoursFilterState) => void;
  machines: Machine[];
  isOpen: boolean;
  onToggle: () => void;
}

export default function EnCoursFilters({
  filters,
  onChange,
  machines,
  isOpen,
  onToggle,
}: EnCoursFiltersProps) {
  // Listes dynamiques
  const commerciaux = Array.from(
    new Set(machines.map((m) => m.commercial_vendeur).filter(Boolean) as string[])
  ).sort();
  const acheteurs = Array.from(
    new Set(machines.map((m) => m.acheteur).filter(Boolean) as string[])
  ).sort();
  const types = Array.from(
    new Set(machines.map((m) => m.type_nacelle).filter(Boolean))
  ).sort();

  const activeCount = countActiveFilters(filters);

  function reset() {
    onChange(EMPTY_ENCOURS_FILTERS);
  }

  return (
    <div className={`filters-wrap ${isOpen ? "open" : ""}`}>
      <button className="filters-toggle" onClick={onToggle}>
        <span className="filter-icon">▾</span>
        <span>Filtres</span>
        {activeCount > 0 && <span className="filters-count">{activeCount}</span>}
      </button>

      {isOpen && (
        <div className="filters-panel">
          <div className="filters-grid filters-grid-encours">
            {/* Statut */}
            <div className="filter-field">
              <label>Statut</label>
              <select
                value={filters.statut}
                onChange={(e) =>
                  onChange({ ...filters, statut: e.target.value as StatutEnCoursFilter })
                }
              >
                <option value="tous">Toutes</option>
                <option value="a_configurer">⚙️ À configurer</option>
                <option value="en_prepa">🔧 En prépa</option>
                <option value="pretes">✓ Prêtes à facturer</option>
                <option value="en_retard">⚠ En retard</option>
              </select>
            </div>

            {/* Type de prépa */}
            <div className="filter-field">
              <label>Type de prépa</label>
              <select
                value={filters.typePrepa}
                onChange={(e) =>
                  onChange({ ...filters, typePrepa: e.target.value as TypePrepaFilter })
                }
              >
                <option value="tous">Tous</option>
                <option value="normale">🔧 Prépa normale</option>
                <option value="en_etat">📦 Vendue en l'état</option>
              </select>
            </div>

            {/* Type nacelle */}
            <div className="filter-field">
              <label>Type de nacelle</label>
              <select
                value={filters.typeNacelle}
                onChange={(e) => onChange({ ...filters, typeNacelle: e.target.value })}
              >
                <option value="">Tous types ({types.length})</option>
                {types.map((t) => {
                  const count = machines.filter((m) => m.type_nacelle === t).length;
                  return (
                    <option key={t} value={t}>
                      {t} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Commercial */}
            <div className="filter-field">
              <label>Commercial vendeur</label>
              <select
                value={filters.commercial}
                onChange={(e) => onChange({ ...filters, commercial: e.target.value })}
              >
                <option value="">Tous commerciaux</option>
                {commerciaux.map((c) => {
                  const count = machines.filter((m) => m.commercial_vendeur === c).length;
                  return (
                    <option key={c} value={c}>
                      {c} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Acheteur */}
            <div className="filter-field">
              <label>Acheteur</label>
              <select
                value={filters.acheteur}
                onChange={(e) => onChange({ ...filters, acheteur: e.target.value })}
              >
                <option value="">Tous acheteurs</option>
                {acheteurs.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* Livraison rapide */}
            <div className="filter-field">
              <label>Livraison (rapide)</label>
              <select
                value={filters.livraisonRapide}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    livraisonRapide: e.target.value as LivraisonRapide,
                    // Reset dates si on choisit un rapide
                    livraisonDe: "",
                    livraisonA: "",
                  })
                }
              >
                <option value="toutes">Toutes</option>
                <option value="cette_semaine">📅 Cette semaine</option>
                <option value="ce_mois">📅 Ce mois</option>
                <option value="en_retard">⚠ En retard</option>
                <option value="depassees_7j">⚠ Dépassées de + de 7 jours</option>
              </select>
            </div>

            {/* Livraison de */}
            <div className="filter-field">
              <label>Livraison du</label>
              <input
                type="date"
                value={filters.livraisonDe}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    livraisonDe: e.target.value,
                    livraisonRapide: "toutes",
                  })
                }
              />
            </div>

            {/* Livraison à */}
            <div className="filter-field">
              <label>Livraison au</label>
              <input
                type="date"
                value={filters.livraisonA}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    livraisonA: e.target.value,
                    livraisonRapide: "toutes",
                  })
                }
              />
            </div>

            {/* Reset */}
            {activeCount > 0 && (
              <div className="filter-field filter-reset">
                <button className="btn-reset" onClick={reset}>
                  ✕ Réinitialiser
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function countActiveFilters(f: EnCoursFilterState): number {
  let n = 0;
  if (f.commercial) n++;
  if (f.acheteur) n++;
  if (f.typeNacelle) n++;
  if (f.typePrepa !== "tous") n++;
  if (f.statut !== "tous") n++;
  if (f.livraisonRapide !== "toutes") n++;
  if (f.livraisonDe) n++;
  if (f.livraisonA) n++;
  return n;
}

// Fonction de filtrage exportée
export function applyEnCoursFilters(
  machines: Machine[],
  f: EnCoursFilterState
): Machine[] {
  return machines.filter((m) => {
    // Commercial
    if (f.commercial && m.commercial_vendeur !== f.commercial) return false;

    // Acheteur
    if (f.acheteur && m.acheteur !== f.acheteur) return false;

    // Type nacelle
    if (f.typeNacelle && m.type_nacelle !== f.typeNacelle) return false;

    // Type prépa
    if (f.typePrepa !== "tous") {
      if (f.typePrepa === "normale" && m.type_prepa !== "normale") return false;
      if (f.typePrepa === "en_etat" && m.type_prepa !== "en_etat") return false;
    }

    // Statut
    if (f.statut !== "tous") {
      const isConfigured = !!m.type_prepa;
      const isPret =
        isConfigured &&
        (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa));
      const enRetard = isLivraisonEnRetard(m.date_livraison_prevue);

      if (f.statut === "a_configurer" && isConfigured) return false;
      if (
        f.statut === "en_prepa" &&
        (!isConfigured || m.type_prepa !== "normale" || prepaTerminee(m.etapes_prepa))
      )
        return false;
      if (f.statut === "pretes" && !isPret) return false;
      if (f.statut === "en_retard" && !enRetard) return false;
    }

    // Livraison rapide
    if (f.livraisonRapide !== "toutes" && m.date_livraison_prevue) {
      const today = new Date();
      const livraison = new Date(m.date_livraison_prevue);

      if (f.livraisonRapide === "cette_semaine") {
        const finSemaine = new Date(today);
        finSemaine.setDate(today.getDate() + 7);
        if (livraison < today || livraison > finSemaine) return false;
      }
      if (f.livraisonRapide === "ce_mois") {
        const finMois = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        if (livraison < today || livraison > finMois) return false;
      }
      if (f.livraisonRapide === "en_retard") {
        if (!isLivraisonEnRetard(m.date_livraison_prevue)) return false;
      }
      if (f.livraisonRapide === "depassees_7j") {
        const seuil = new Date(today);
        seuil.setDate(today.getDate() - 7);
        if (livraison >= seuil) return false;
      }
    } else if (f.livraisonRapide !== "toutes" && !m.date_livraison_prevue) {
      return false;
    }

    // Livraison de/à
    if (f.livraisonDe && m.date_livraison_prevue) {
      if (m.date_livraison_prevue < f.livraisonDe) return false;
    } else if (f.livraisonDe && !m.date_livraison_prevue) {
      return false;
    }

    if (f.livraisonA && m.date_livraison_prevue) {
      if (m.date_livraison_prevue > f.livraisonA) return false;
    } else if (f.livraisonA && !m.date_livraison_prevue) {
      return false;
    }

    return true;
  });
}