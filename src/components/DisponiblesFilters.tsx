import { Machine, calculAgeStock } from "../types/machine";

export type PriceType = "fr" | "dealer" | "both";
export type StatutPrix = "tous" | "avec_prix" | "sans_prix" | "a_repricer";

export interface DispoFilterState {
  typeNacelle: string;
  priceType: PriceType;
  prixMin: string;
  prixMax: string;
  statutPrix: StatutPrix;
  ageMin: string;
  ageMax: string;
}

export const EMPTY_DISPO_FILTERS: DispoFilterState = {
  typeNacelle: "",
  priceType: "both",
  prixMin: "",
  prixMax: "",
  statutPrix: "tous",
  ageMin: "",
  ageMax: "",
};

interface DisponiblesFiltersProps {
  filters: DispoFilterState;
  onChange: (filters: DispoFilterState) => void;
  machines: Machine[];
  userRole: string;
  isOpen: boolean;
  onToggle: () => void;
  seuilRepricer: number;
}

export default function DisponiblesFilters({
  filters,
  onChange,
  machines,
  userRole,
  isOpen,
  onToggle,
  seuilRepricer,
}: DisponiblesFiltersProps) {
  // Types dynamiques : uniquement ceux présents dans le stock
  const typesDispo = Array.from(
    new Set(machines.map((m) => m.type_nacelle).filter(Boolean))
  ).sort();

  // Min/max dynamiques pour les prix (selon le type de prix sélectionné)
  const prixValues = machines
    .map((m) => {
      if (filters.priceType === "fr") return m.prix_fr;
      if (filters.priceType === "dealer") return m.prix_dealer;
      // both : prend le minimum des 2
      return Math.min(m.prix_fr ?? Infinity, m.prix_dealer ?? Infinity);
    })
    .filter((v): v is number => v !== undefined && v !== Infinity && !isNaN(v));

  const prixMinReal = prixValues.length > 0 ? Math.min(...prixValues) : 0;
  const prixMaxReal = prixValues.length > 0 ? Math.max(...prixValues) : 0;

  // Min/max dynamiques pour les âges
  const ages = machines
    .map((m) => (m.date_mise_stock ? calculAgeStock(m.date_mise_stock) : null))
    .filter((v): v is number => v !== null);

  const ageMinReal = ages.length > 0 ? Math.min(...ages) : 0;
  const ageMaxReal = ages.length > 0 ? Math.max(...ages) : 0;

  // Rôle : les commerciaux sont verrouillés sur leur type de prix
  const isVendeurFr = userRole === "vendeur_fr";
  const isVendeurDealer = userRole === "dealer";
  const lockedPriceType = isVendeurFr || isVendeurDealer;

  // Si le commercial est verrouillé, forcer priceType
  const effectivePriceType = isVendeurFr
    ? "fr"
    : isVendeurDealer
    ? "dealer"
    : filters.priceType;

  const activeCount = countActiveFilters(filters, lockedPriceType);

  function reset() {
    onChange({
      ...EMPTY_DISPO_FILTERS,
      priceType: lockedPriceType ? effectivePriceType : "both",
    });
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
          <div className="filters-grid filters-grid-dispo">
            {/* Type de nacelle (dynamique) */}
            <div className="filter-field">
              <label>Type de nacelle</label>
              <select
                value={filters.typeNacelle}
                onChange={(e) => onChange({ ...filters, typeNacelle: e.target.value })}
              >
                <option value="">
                  Tous types ({typesDispo.length})
                </option>
                {typesDispo.map((t) => {
                  const count = machines.filter((m) => m.type_nacelle === t).length;
                  return (
                    <option key={t} value={t}>
                      {t} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Statut de prix */}
            <div className="filter-field">
              <label>Statut de prix</label>
              <select
                value={filters.statutPrix}
                onChange={(e) =>
                  onChange({ ...filters, statutPrix: e.target.value as StatutPrix })
                }
              >
                <option value="tous">Toutes</option>
                <option value="avec_prix">✓ Avec prix</option>
                <option value="sans_prix">⏳ Sans prix</option>
                <option value="a_repricer">⚠ À repricer (&gt; {seuilRepricer}j)</option>
              </select>
            </div>

            {/* Toggle Prix FR/Dealer (admin/chef uniquement) */}
            {!lockedPriceType && (
              <div className="filter-field">
                <label>Filtrer le prix sur</label>
                <div className="price-toggle">
                  <button
                    type="button"
                    className={`toggle-btn ${effectivePriceType === "both" ? "active" : ""}`}
                    onClick={() => onChange({ ...filters, priceType: "both" })}
                  >
                    Les 2
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${effectivePriceType === "fr" ? "active" : ""}`}
                    onClick={() => onChange({ ...filters, priceType: "fr" })}
                  >
                    Prix FR
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${effectivePriceType === "dealer" ? "active" : ""}`}
                    onClick={() => onChange({ ...filters, priceType: "dealer" })}
                  >
                    Dealer
                  </button>
                </div>
              </div>
            )}

            {/* Verrou visuel pour vendeurs */}
            {lockedPriceType && (
              <div className="filter-field">
                <label>Filtre prix verrouillé</label>
                <div className="price-locked">
                  🔒 {isVendeurFr ? "Prix FR" : "Prix Dealer"}
                </div>
              </div>
            )}

            {/* Prix Min */}
            <div className="filter-field">
              <label>Prix min (€)</label>
              <input
                type="number"
                placeholder={
                  prixMinReal > 0
                    ? prixMinReal.toLocaleString("fr-FR")
                    : "Aucun prix défini"
                }
                value={filters.prixMin}
                onChange={(e) => onChange({ ...filters, prixMin: e.target.value })}
                min="0"
              />
            </div>

            {/* Prix Max */}
            <div className="filter-field">
              <label>Prix max (€)</label>
              <input
                type="number"
                placeholder={
                  prixMaxReal > 0
                    ? prixMaxReal.toLocaleString("fr-FR")
                    : "Aucun prix défini"
                }
                value={filters.prixMax}
                onChange={(e) => onChange({ ...filters, prixMax: e.target.value })}
                min="0"
              />
            </div>

            {/* Âge stock min */}
            <div className="filter-field">
              <label>Âge stock min (j)</label>
              <input
                type="number"
                placeholder={ageMinReal > 0 ? String(ageMinReal) : "0"}
                value={filters.ageMin}
                onChange={(e) => onChange({ ...filters, ageMin: e.target.value })}
                min="0"
              />
            </div>

            {/* Âge stock max */}
            <div className="filter-field">
              <label>Âge stock max (j)</label>
              <input
                type="number"
                placeholder={ageMaxReal > 0 ? String(ageMaxReal) : "0"}
                value={filters.ageMax}
                onChange={(e) => onChange({ ...filters, ageMax: e.target.value })}
                min="0"
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

          {/* Info bornes réelles */}
          {(prixValues.length > 0 || ages.length > 0) && (
            <div className="filters-info">
              {prixValues.length > 0 && (
                <span>
                  💰 Prix dans le stock :{" "}
                  <strong>{prixMinReal.toLocaleString("fr-FR")} €</strong> à{" "}
                  <strong>{prixMaxReal.toLocaleString("fr-FR")} €</strong>
                </span>
              )}
              {ages.length > 0 && (
                <span>
                  📅 Âge stock : <strong>{ageMinReal} j</strong> à{" "}
                  <strong>{ageMaxReal} j</strong>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function countActiveFilters(f: DispoFilterState, lockedPriceType: boolean): number {
  let n = 0;
  if (f.typeNacelle) n++;
  if (!lockedPriceType && f.priceType !== "both") n++;
  if (f.prixMin) n++;
  if (f.prixMax) n++;
  if (f.statutPrix !== "tous") n++;
  if (f.ageMin) n++;
  if (f.ageMax) n++;
  return n;
}

// Fonction de filtrage exportée
export function applyDispoFilters(
  machines: Machine[],
  f: DispoFilterState,
  userRole: string,
  seuilRepricer: number
): Machine[] {
  // Type de prix effectif
  const effectivePriceType =
    userRole === "vendeur_fr"
      ? "fr"
      : userRole === "dealer"
      ? "dealer"
      : f.priceType;

  const prixMinNum = f.prixMin ? parseInt(f.prixMin, 10) : null;
  const prixMaxNum = f.prixMax ? parseInt(f.prixMax, 10) : null;
  const ageMinNum = f.ageMin ? parseInt(f.ageMin, 10) : null;
  const ageMaxNum = f.ageMax ? parseInt(f.ageMax, 10) : null;

  return machines.filter((m) => {
    // Type
    if (f.typeNacelle && m.type_nacelle !== f.typeNacelle) return false;

    // Statut prix
    const hasPrice = m.prix_fr !== undefined || m.prix_dealer !== undefined;
    const age = m.date_mise_stock ? calculAgeStock(m.date_mise_stock) : 0;

    if (f.statutPrix === "avec_prix" && !hasPrice) return false;
    if (f.statutPrix === "sans_prix" && hasPrice) return false;
    if (f.statutPrix === "a_repricer" && (!hasPrice || age <= seuilRepricer)) return false;

    // Fourchette prix
    if (prixMinNum !== null || prixMaxNum !== null) {
      const priceToCheck = getPriceToCheck(m, effectivePriceType);
      if (priceToCheck === null) return false;
      if (prixMinNum !== null && priceToCheck < prixMinNum) return false;
      if (prixMaxNum !== null && priceToCheck > prixMaxNum) return false;
    }

    // Âge stock
    if (ageMinNum !== null && age < ageMinNum) return false;
    if (ageMaxNum !== null && age > ageMaxNum) return false;

    return true;
  });
}

function getPriceToCheck(m: Machine, priceType: PriceType): number | null {
  if (priceType === "fr") {
    return m.prix_fr ?? null;
  }
  if (priceType === "dealer") {
    return m.prix_dealer ?? null;
  }
  // both : prend le minimum disponible
  const fr = m.prix_fr ?? Infinity;
  const dealer = m.prix_dealer ?? Infinity;
  const min = Math.min(fr, dealer);
  return min === Infinity ? null : min;
}