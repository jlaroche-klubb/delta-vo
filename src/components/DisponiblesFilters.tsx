import { Machine, calculAgeStock } from "../types/machine";

export type PriceType = "fr" | "dealer" | "both";
export type StatutPrix = "tous" | "avec_prix" | "sans_prix" | "a_repricer";

export interface DispoFilterState {
  typeNacelle: string[]; // multi-sélection
  priceType: PriceType;
  prixMin: string;
  prixMax: string;
  statutPrix: StatutPrix;
  kmMin: string;
  kmMax: string;
  anneeMin: string;
  anneeMax: string;
  ageMin: string;
  ageMax: string;
}

export const EMPTY_DISPO_FILTERS: DispoFilterState = {
  typeNacelle: [],
  priceType: "both",
  prixMin: "",
  prixMax: "",
  statutPrix: "tous",
  kmMin: "",
  kmMax: "",
  anneeMin: "",
  anneeMax: "",
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
  const isAdmin = userRole === "admin";
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
            {/* Type de nacelle (multi-sélection) */}
            <div className="filter-field">
              <label>
                Type de nacelle
                {filters.typeNacelle.length > 0 && ` (${filters.typeNacelle.length})`}
              </label>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 120,
                  overflowY: "auto",
                  padding: "4px 0",
                }}
              >
                {typesDispo.length === 0 && <span style={{ fontSize: 12, color: "#888" }}>—</span>}
                {typesDispo.map((t) => {
                  const count = machines.filter((m) => m.type_nacelle === t).length;
                  const checked = filters.typeNacelle.includes(t);
                  return (
                    <label
                      key={t}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        border: "1px solid " + (checked ? "#1a2a6e" : "#d0d4da"),
                        background: checked ? "#e8edff" : "#fff",
                        color: checked ? "#1a2a6e" : "#4a5468",
                        borderRadius: 4,
                        padding: "3px 8px",
                        cursor: "pointer",
                        fontWeight: checked ? 700 : 400,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? filters.typeNacelle.filter((x) => x !== t)
                            : [...filters.typeNacelle, t];
                          onChange({ ...filters, typeNacelle: next });
                        }}
                      />
                      {t} ({count})
                    </label>
                  );
                })}
              </div>
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

            {/* KM min */}
            <div className="filter-field">
              <label>KM min</label>
              <input
                type="number"
                placeholder="0"
                value={filters.kmMin}
                onChange={(e) => onChange({ ...filters, kmMin: e.target.value })}
                min="0"
              />
            </div>

            {/* KM max */}
            <div className="filter-field">
              <label>KM max</label>
              <input
                type="number"
                placeholder="—"
                value={filters.kmMax}
                onChange={(e) => onChange({ ...filters, kmMax: e.target.value })}
                min="0"
              />
            </div>

            {/* Année MEC min */}
            <div className="filter-field">
              <label>Année MEC min</label>
              <input
                type="number"
                placeholder="ex. 2010"
                value={filters.anneeMin}
                onChange={(e) => onChange({ ...filters, anneeMin: e.target.value })}
                min="0"
              />
            </div>

            {/* Année MEC max */}
            <div className="filter-field">
              <label>Année MEC max</label>
              <input
                type="number"
                placeholder="ex. 2024"
                value={filters.anneeMax}
                onChange={(e) => onChange({ ...filters, anneeMax: e.target.value })}
                min="0"
              />
            </div>

            {/* Âge stock — admin uniquement */}
            {isAdmin && (
              <>
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
              </>
            )}

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
              {isAdmin && ages.length > 0 && (
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
  if (f.typeNacelle.length > 0) n++;
  if (!lockedPriceType && f.priceType !== "both") n++;
  if (f.prixMin) n++;
  if (f.prixMax) n++;
  if (f.statutPrix !== "tous") n++;
  if (f.kmMin) n++;
  if (f.kmMax) n++;
  if (f.anneeMin) n++;
  if (f.anneeMax) n++;
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
  const kmMinNum = f.kmMin ? parseInt(f.kmMin, 10) : null;
  const kmMaxNum = f.kmMax ? parseInt(f.kmMax, 10) : null;
  const anneeMinNum = f.anneeMin ? parseInt(f.anneeMin, 10) : null;
  const anneeMaxNum = f.anneeMax ? parseInt(f.anneeMax, 10) : null;
  const isAdmin = userRole === "admin";
  const ageMinNum = isAdmin && f.ageMin ? parseInt(f.ageMin, 10) : null;
  const ageMaxNum = isAdmin && f.ageMax ? parseInt(f.ageMax, 10) : null;

  return machines.filter((m) => {
    // Type (multi-sélection : OK si vide OU si le type est coché)
    if (f.typeNacelle.length > 0 && !f.typeNacelle.includes(m.type_nacelle)) return false;

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

    // Kilométrage (porteur)
    if (kmMinNum !== null || kmMaxNum !== null) {
      const km = m.km_porteur;
      if (km == null) return false;
      if (kmMinNum !== null && km < kmMinNum) return false;
      if (kmMaxNum !== null && km > kmMaxNum) return false;
    }

    // Année de mise en circulation
    if (anneeMinNum !== null || anneeMaxNum !== null) {
      const annee = parseInt(m.annee_circulation, 10);
      if (isNaN(annee)) return false;
      if (anneeMinNum !== null && annee < anneeMinNum) return false;
      if (anneeMaxNum !== null && annee > anneeMaxNum) return false;
    }

    // Âge stock (admin uniquement)
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
