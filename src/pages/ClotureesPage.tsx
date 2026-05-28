import { useState, useMemo } from "react";
import {
  Machine,
  getStatutPaiement,
  joursDepuisFacturation,
  getAnneeFacturation,
} from "../types/machine";
import { useMachinesFiltered } from "../contexts/MachinesContext";
import MarkPaidModal from "../components/MarkPaidModal";

interface ClotureesPageProps {
  userRole: string;
  userName: string;
}

type SortKey =
  | "immat"
  | "type"
  | "acheteur"
  | "commercial"
  | "prix"
  | "date_facturation"
  | "date_reglement"
  | "statut_paiement";

type StatutPaiementFilter = "tous" | "payee" | "en_attente" | "retard";
type MarcheFilter = "tous" | "fr" | "dealer";

export default function ClotureesPage({ userRole, userName }: ClotureesPageProps) {
  // 🆕 Toggle "Voir archivées"
  const [showArchived, setShowArchived] = useState(false);

  const { machines, marquerPayee, annulerCloture } = useMachinesFiltered(showArchived);

  // Pour le compteur des archivées
  const { machines: allMachinesUnfiltered } = useMachinesFiltered(true);

  const [search, setSearch] = useState("");
  const [filterAnnee, setFilterAnnee] = useState<number>(new Date().getFullYear());
  const [filterCommercial, setFilterCommercial] = useState("");
  const [filterAcheteur, setFilterAcheteur] = useState("");
  const [filterMarche, setFilterMarche] = useState<MarcheFilter>("tous");
  const [filterStatutPaiement, setFilterStatutPaiement] = useState<StatutPaiementFilter>("tous");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date_facturation");
  const [sortDesc, setSortDesc] = useState(true);
  const [markingPaid, setMarkingPaid] = useState<Machine | null>(null);

  const isAdmin = userRole === "admin";
  const canEdit = userRole === "secretaire" || userRole === "admin";

  // ⚠ IMPORTANT : on filtre uniquement les machines avec statut "cloturee"
  // Les machines en LLD ont le statut "louee_lld" et n'apparaissent PAS ici
  const allCloturees = useMemo(
    () => machines.filter((m) => m.statut === "cloturee"),
    [machines]
  );

  // Compteur des archivées clôturées (pour info)
  const totalArchived = useMemo(
    () =>
      allMachinesUnfiltered.filter(
        (m) => m.archived && m.statut === "cloturee"
      ).length,
    [allMachinesUnfiltered]
  );

  const anneesDispo = useMemo(() => {
    const set = new Set<number>();
    allCloturees.forEach((m) => {
      const annee = getAnneeFacturation(m);
      if (annee > 0) set.add(annee);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [allCloturees]);

  const commerciaux = Array.from(
    new Set(allCloturees.map((m) => m.commercial_vendeur).filter(Boolean) as string[])
  ).sort();
  const acheteurs = Array.from(
    new Set(allCloturees.map((m) => m.acheteur).filter(Boolean) as string[])
  ).sort();

  const filtered = useMemo(() => {
    let result = allCloturees.filter((m) => getAnneeFacturation(m) === filterAnnee);

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.immat.toLowerCase().includes(q) ||
          (m.acheteur && m.acheteur.toLowerCase().includes(q)) ||
          (m.commercial_vendeur && m.commercial_vendeur.toLowerCase().includes(q)) ||
          (m.numero_facture && m.numero_facture.toLowerCase().includes(q))
      );
    }

    if (filterCommercial) {
      result = result.filter((m) => m.commercial_vendeur === filterCommercial);
    }
    if (filterAcheteur) {
      result = result.filter((m) => m.acheteur === filterAcheteur);
    }
    if (filterMarche !== "tous") {
      result = result.filter((m) => m.marche === filterMarche);
    }
    if (filterStatutPaiement !== "tous") {
      result = result.filter((m) => getStatutPaiement(m) === filterStatutPaiement);
    }

    return result;
  }, [
    allCloturees,
    filterAnnee,
    search,
    filterCommercial,
    filterAcheteur,
    filterMarche,
    filterStatutPaiement,
  ]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "immat":
          cmp = a.immat.localeCompare(b.immat);
          break;
        case "type":
          cmp = a.type_nacelle.localeCompare(b.type_nacelle);
          break;
        case "acheteur":
          cmp = (a.acheteur || "").localeCompare(b.acheteur || "");
          break;
        case "commercial":
          cmp = (a.commercial_vendeur || "").localeCompare(b.commercial_vendeur || "");
          break;
        case "prix":
          cmp = (a.prix_vente_final || 0) - (b.prix_vente_final || 0);
          break;
        case "date_facturation":
          cmp = (a.date_facturation || "").localeCompare(b.date_facturation || "");
          break;
        case "date_reglement":
          cmp = (a.date_reglement || "").localeCompare(b.date_reglement || "");
          break;
        case "statut_paiement":
          cmp = getStatutPaiement(a).localeCompare(getStatutPaiement(b));
          break;
      }
      return sortDesc ? -cmp : cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDesc]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const ca = filtered.reduce((sum, m) => sum + (m.prix_vente_final || 0), 0);
    const enRetard = filtered.filter((m) => getStatutPaiement(m) === "retard");
    const impayes = enRetard.reduce((sum, m) => sum + (m.prix_vente_final || 0), 0);
    const enAttente = filtered.filter(
      (m) => getStatutPaiement(m) === "en_attente"
    ).length;
    return { total, ca, impayes, nbEnRetard: enRetard.length, nbEnAttente: enAttente };
  }, [filtered]);

  const activeFiltersCount = countActiveFilters({
    filterCommercial,
    filterAcheteur,
    filterMarche,
    filterStatutPaiement,
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function handleMarkPaid(machineId: string, dateReglement: string) {
    marquerPayee(machineId, dateReglement);
  }

  function handleAnnulerCloture(machine: Machine) {
    if (window.confirm(
      `⚠️ Annuler la clôture de ${machine.immat} ?\n\n` +
      `La machine repassera en "En cours de préparation" et la facture/règlement seront effacés.`
    )) {
      annulerCloture(machine.id);
    }
  }

  function clickUrgenceImpayes() {
    setFilterStatutPaiement("retard");
    setFiltersOpen(true);
  }

  function resetFilters() {
    setFilterCommercial("");
    setFilterAcheteur("");
    setFilterMarche("tous");
    setFilterStatutPaiement("tous");
  }

  return (
    <div className="page-cloturees">
      <div className="page-header">
        <div>
          <h1>Clôturées</h1>
          <p className="subtitle">Historique des ventes finalisées · Suivi des paiements</p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">machines</span>
          </div>
          <div className="stat stat-ok">
            <span className="stat-value">
              {Math.round(stats.ca / 1000).toLocaleString("fr-FR")} k€
            </span>
            <span className="stat-label">CA</span>
          </div>
          <div className="stat stat-pending">
            <span className="stat-value">{stats.nbEnAttente}</span>
            <span className="stat-label">en attente</span>
          </div>
          <div className="stat stat-warn">
            <span className="stat-value">{stats.nbEnRetard}</span>
            <span className="stat-label">en retard</span>
          </div>
          {stats.impayes > 0 && (
            <div className="stat stat-warn">
              <span className="stat-value">
                {Math.round(stats.impayes / 1000).toLocaleString("fr-FR")} k€
              </span>
              <span className="stat-label">impayés</span>
            </div>
          )}
        </div>
      </div>

      {stats.nbEnRetard > 0 && filterStatutPaiement !== "retard" && (
        <div className="urgent-banner" onClick={clickUrgenceImpayes}>
          <div className="urgent-icon">💸</div>
          <div className="urgent-text">
            <strong>
              {stats.nbEnRetard} paiement{stats.nbEnRetard > 1 ? "s" : ""} en retard
              {" "}({Math.round(stats.impayes / 1000).toLocaleString("fr-FR")} k€ impayés)
            </strong>
            <span className="urgent-sub">
              Clique pour filtrer et voir les factures en retard de paiement
            </span>
          </div>
          <div className="urgent-action">→</div>
        </div>
      )}

      <div className="year-selector">
        <span className="year-label">📅 Année :</span>
        {anneesDispo.map((annee) => (
          <button
            key={annee}
            className={`year-btn ${filterAnnee === annee ? "active" : ""}`}
            onClick={() => setFilterAnnee(annee)}
          >
            {annee}
            <span className="year-count">
              {allCloturees.filter((m) => getAnneeFacturation(m) === annee).length}
            </span>
          </button>
        ))}
      </div>

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Rechercher par immat, acheteur, commercial, n° facture..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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

      <div className={`filters-wrap ${filtersOpen ? "open" : ""}`}>
        <button className="filters-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>
          <span className="filter-icon">▾</span>
          <span>Filtres</span>
          {activeFiltersCount > 0 && (
            <span className="filters-count">{activeFiltersCount}</span>
          )}
        </button>

        {filtersOpen && (
          <div className="filters-panel">
            <div className="filters-grid filters-grid-cloturees">
              <div className="filter-field">
                <label>Statut paiement</label>
                <select
                  value={filterStatutPaiement}
                  onChange={(e) => setFilterStatutPaiement(e.target.value as StatutPaiementFilter)}
                >
                  <option value="tous">Tous</option>
                  <option value="payee">✓ Payée</option>
                  <option value="en_attente">⏳ En attente</option>
                  <option value="retard">⚠ En retard</option>
                </select>
              </div>
              <div className="filter-field">
                <label>Marché</label>
                <select
                  value={filterMarche}
                  onChange={(e) => setFilterMarche(e.target.value as MarcheFilter)}
                >
                  <option value="tous">Tous</option>
                  <option value="fr">🇫🇷 France</option>
                  <option value="dealer">🌍 Dealer</option>
                </select>
              </div>
              <div className="filter-field">
                <label>Commercial</label>
                <select
                  value={filterCommercial}
                  onChange={(e) => setFilterCommercial(e.target.value)}
                >
                  <option value="">Tous</option>
                  {commerciaux.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="filter-field">
                <label>Acheteur</label>
                <select
                  value={filterAcheteur}
                  onChange={(e) => setFilterAcheteur(e.target.value)}
                >
                  <option value="">Tous</option>
                  {acheteurs.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              {activeFiltersCount > 0 && (
                <div className="filter-field filter-reset">
                  <button className="btn-reset" onClick={resetFilters}>
                    ✕ Réinitialiser
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {sorted.length > 0 ? (
        <div className="cloturees-table-wrap">
          <table className="cloturees-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("immat")} className="sortable">
                  Immat {renderSortIcon("immat", sortKey, sortDesc)}
                </th>
                <th onClick={() => handleSort("type")} className="sortable">
                  Type {renderSortIcon("type", sortKey, sortDesc)}
                </th>
                <th onClick={() => handleSort("acheteur")} className="sortable">
                  Acheteur {renderSortIcon("acheteur", sortKey, sortDesc)}
                </th>
                <th onClick={() => handleSort("commercial")} className="sortable">
                  Commercial {renderSortIcon("commercial", sortKey, sortDesc)}
                </th>
                <th onClick={() => handleSort("prix")} className="sortable col-num">
                  Prix {renderSortIcon("prix", sortKey, sortDesc)}
                </th>
                <th onClick={() => handleSort("date_facturation")} className="sortable">
                  Date facture {renderSortIcon("date_facturation", sortKey, sortDesc)}
                </th>
                <th>N° facture</th>
                <th onClick={() => handleSort("statut_paiement")} className="sortable">
                  Paiement {renderSortIcon("statut_paiement", sortKey, sortDesc)}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <ClotureeRow
                  key={m.id}
                  machine={m}
                  canEdit={canEdit}
                  isAdmin={isAdmin}
                  onMarkPaid={setMarkingPaid}
                  onAnnulerCloture={handleAnnulerCloture}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          {search || activeFiltersCount > 0
            ? "Aucune machine ne correspond à vos critères"
            : showArchived
            ? "Aucune machine archivée"
            : `Aucune machine clôturée en ${filterAnnee}`}
        </div>
      )}

      {markingPaid && (
        <MarkPaidModal
          machine={markingPaid}
          onClose={() => setMarkingPaid(null)}
          onConfirm={handleMarkPaid}
        />
      )}
    </div>
  );
}

function ClotureeRow({
  machine,
  canEdit,
  isAdmin,
  onMarkPaid,
  onAnnulerCloture,
}: {
  machine: Machine;
  canEdit: boolean;
  isAdmin: boolean;
  onMarkPaid: (m: Machine) => void;
  onAnnulerCloture: (m: Machine) => void;
}) {
  const statut = getStatutPaiement(machine);
  const jours = joursDepuisFacturation(machine.date_facturation);

  return (
    <tr className={`row-${statut} ${machine.archived ? "row-archived" : ""}`}>
      <td className="cell-immat">
        {machine.immat}
        {machine.archived && (
          <span style={{ marginLeft: 8, fontSize: 11, color: "#999" }}>🗑️ archivée</span>
        )}
      </td>
      <td>
        <div className="cell-type">{machine.type_nacelle}</div>
        <div className="cell-modele">{machine.modele_porteur}</div>
      </td>
      <td>
        <div>{machine.acheteur}</div>
        {machine.marche === "dealer" && <span className="dealer-tag">🌍 Dealer</span>}
      </td>
      <td>{machine.commercial_vendeur}</td>
      <td className="col-num cell-prix">
        {machine.prix_vente_final?.toLocaleString("fr-FR")} €
      </td>
      <td>{formatDate(machine.date_facturation)}</td>
      <td className="cell-facture">{machine.numero_facture || "—"}</td>
      <td>
        <PaiementBadge statut={statut} jours={jours} dateReglement={machine.date_reglement} />
      </td>
      <td className="col-actions">
        {statut !== "payee" && canEdit && !machine.archived && (
          <button className="btn-mark-paid" onClick={() => onMarkPaid(machine)}>
            ✓ Marquer payée
          </button>
        )}
        {isAdmin && !machine.archived && (
          <button
            className="btn-annuler-cloture"
            onClick={() => onAnnulerCloture(machine)}
            title="Annuler la clôture et revenir en préparation"
            style={{
              background: "#dc3545",
              color: "white",
              border: "none",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
              marginLeft: 6,
            }}
          >
            ↩️ Annuler clôture
          </button>
        )}
      </td>
    </tr>
  );
}

function PaiementBadge({
  statut,
  jours,
  dateReglement,
}: {
  statut: "payee" | "en_attente" | "retard";
  jours: number;
  dateReglement: string | undefined;
}) {
  if (statut === "payee") {
    return (
      <div className="paiement-cell">
        <span className="badge-paid">✓ Payée</span>
        {dateReglement && (
          <span className="paiement-date">le {formatDate(dateReglement)}</span>
        )}
      </div>
    );
  }
  if (statut === "retard") {
    return (
      <div className="paiement-cell">
        <span className="badge-retard">⚠ En retard</span>
        <span className="paiement-date">depuis {jours} j</span>
      </div>
    );
  }
  return (
    <div className="paiement-cell">
      <span className="badge-attente">⏳ En attente</span>
      <span className="paiement-date">depuis {jours} j</span>
    </div>
  );
}

function renderSortIcon(key: SortKey, current: SortKey, desc: boolean) {
  if (current !== key) return <span className="sort-icon">⇅</span>;
  return <span className="sort-icon active">{desc ? "▼" : "▲"}</span>;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}

function countActiveFilters(f: {
  filterCommercial: string;
  filterAcheteur: string;
  filterMarche: string;
  filterStatutPaiement: string;
}): number {
  let n = 0;
  if (f.filterCommercial) n++;
  if (f.filterAcheteur) n++;
  if (f.filterMarche !== "tous") n++;
  if (f.filterStatutPaiement !== "tous") n++;
  return n;
}