import { useState, useMemo } from "react";
import { Machine, getStatutPaiement } from "../types/machine";
import { useMachines } from "../contexts/MachinesContext";
import { exportStatsToExcel } from "../utils/exportStats";

type PeriodeType = "mois" | "mois_dernier" | "trimestre" | "annee" | "annee_derniere" | "perso";

const MOIS_LABELS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

export default function StatsPage() {
  const { machines: allMachines } = useMachines();
  const [periode, setPeriode] = useState<PeriodeType>("annee");
  const [persoDe, setPersoDe] = useState("");
  const [persoA, setPersoA] = useState("");

  // ⚠ On ne prend que les machines de VENTE (statut "cloturee"), pas les LLD
  const machines = useMemo(
    () => allMachines.filter((m) => m.statut === "cloturee"),
    [allMachines]
  );

  // Compteur de machines en LLD (statut "louee_lld")
  const totalLld = useMemo(
    () => allMachines.filter((m) => m.statut === "louee_lld").length,
    [allMachines]
  );

  const { dateDebut, dateFin, periodeLabel } = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    let debut: Date;
    let fin: Date;
    let label: string;

    switch (periode) {
      case "mois":
        debut = new Date(year, month, 1);
        fin = new Date(year, month + 1, 0);
        label = `${MOIS_LABELS[month]} ${year}`;
        break;
      case "mois_dernier":
        debut = new Date(year, month - 1, 1);
        fin = new Date(year, month, 0);
        label = `${MOIS_LABELS[(month - 1 + 12) % 12]} ${month === 0 ? year - 1 : year}`;
        break;
      case "trimestre":
        const trim = Math.floor(month / 3);
        debut = new Date(year, trim * 3, 1);
        fin = new Date(year, trim * 3 + 3, 0);
        label = `T${trim + 1} ${year}`;
        break;
      case "annee":
        debut = new Date(year, 0, 1);
        fin = new Date(year, 11, 31);
        label = `Année ${year}`;
        break;
      case "annee_derniere":
        debut = new Date(year - 1, 0, 1);
        fin = new Date(year - 1, 11, 31);
        label = `Année ${year - 1}`;
        break;
      case "perso":
        debut = persoDe ? new Date(persoDe) : new Date(year, 0, 1);
        fin = persoA ? new Date(persoA) : new Date(year, 11, 31);
        label =
          persoDe && persoA
            ? `Du ${formatDate(persoDe)} au ${formatDate(persoA)}`
            : "Période personnalisée";
        break;
    }

    return {
      dateDebut: debut.toISOString().slice(0, 10),
      dateFin: fin.toISOString().slice(0, 10),
      periodeLabel: label,
    };
  }, [periode, persoDe, persoA]);

  const machinesPeriode = useMemo(() => {
    return machines.filter((m) => {
      if (!m.date_facturation) return false;
      return m.date_facturation >= dateDebut && m.date_facturation <= dateFin;
    });
  }, [machines, dateDebut, dateFin]);

  const stats = useMemo(() => {
    const total = machinesPeriode.length;
    const ca = machinesPeriode.reduce((s, m) => s + (m.prix_vente_final || 0), 0);
    const prixMoyen = total > 0 ? Math.round(ca / total) : 0;
    const payees = machinesPeriode.filter((m) => m.date_reglement);
    const tauxPaiement = total > 0 ? Math.round((payees.length / total) * 100) : 0;
    const impayes = machinesPeriode
      .filter((m) => !m.date_reglement && getStatutPaiement(m) === "retard")
      .reduce((s, m) => s + (m.prix_vente_final || 0), 0);

    const delais = payees
      .filter((m) => m.date_vente && m.date_reglement)
      .map((m) => {
        const v = new Date(m.date_vente!);
        const p = new Date(m.date_reglement!);
        return Math.floor((p.getTime() - v.getTime()) / (1000 * 60 * 60 * 24));
      });
    const delaiMoyen = delais.length > 0
      ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length)
      : 0;

    return { total, ca, prixMoyen, tauxPaiement, impayes, delaiMoyen };
  }, [machinesPeriode]);

  const topCommerciaux = useMemo(() => {
    const map = new Map<string, { ca: number; nb: number }>();
    machinesPeriode.forEach((m) => {
      const com = m.commercial_vendeur || "Non renseigné";
      if (!map.has(com)) map.set(com, { ca: 0, nb: 0 });
      const s = map.get(com)!;
      s.ca += m.prix_vente_final || 0;
      s.nb += 1;
    });
    return Array.from(map.entries())
      .map(([nom, s]) => ({ nom, ca: s.ca, nb: s.nb }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 3);
  }, [machinesPeriode]);

  const tableauCroise = useMemo(() => {
    const commerciaux = Array.from(
      new Set(machinesPeriode.map((m) => m.commercial_vendeur || "Non renseigné"))
    ).sort();

    const moisDispo = Array.from(
      new Set(machinesPeriode.map((m) => m.date_facturation?.slice(0, 7) || "").filter(Boolean))
    ).sort();

    const lignes = commerciaux.map((com) => {
      const cellules = moisDispo.map((mois) => {
        const machsMois = machinesPeriode.filter(
          (m) => m.commercial_vendeur === com && m.date_facturation?.slice(0, 7) === mois
        );
        const ca = machsMois.reduce((s, m) => s + (m.prix_vente_final || 0), 0);
        return { ca, nb: machsMois.length };
      });
      const totalCA = cellules.reduce((s, c) => s + c.ca, 0);
      const totalNb = cellules.reduce((s, c) => s + c.nb, 0);
      return { commercial: com, cellules, totalCA, totalNb };
    });

    const totauxCol = moisDispo.map((mois) => {
      const machsMois = machinesPeriode.filter(
        (m) => m.date_facturation?.slice(0, 7) === mois
      );
      const ca = machsMois.reduce((s, m) => s + (m.prix_vente_final || 0), 0);
      return { ca, nb: machsMois.length };
    });

    return { commerciaux, moisDispo, lignes, totauxCol };
  }, [machinesPeriode]);

  const evolutionMensuelle = useMemo(() => {
    const map = new Map<string, number>();
    machinesPeriode.forEach((m) => {
      if (!m.date_facturation) return;
      const mois = m.date_facturation.slice(0, 7);
      map.set(mois, (map.get(mois) || 0) + (m.prix_vente_final || 0));
    });
    const arr = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mois, ca]) => ({ mois, ca }));
    const maxCA = Math.max(...arr.map((x) => x.ca), 1);
    return { data: arr, maxCA };
  }, [machinesPeriode]);

  function handleExport() {
    exportStatsToExcel({ machines: machinesPeriode, periodeLabel });
  }

  function formatMois(yyyymm: string): string {
    const [y, m] = yyyymm.split("-");
    return `${MOIS_LABELS[parseInt(m, 10) - 1]} ${y.slice(2)}`;
  }

  return (
    <div className="stats-page-wrap">
      <div className="page-header">
        <div>
          <h1>📊 Statistiques de vente</h1>
          <p className="subtitle">Pilotage commercial · {periodeLabel}</p>
        </div>
        <div>
          <button className="btn-pricing" onClick={handleExport} disabled={stats.total === 0}>
            📥 Export Excel
            {stats.total > 0 && <span className="pricing-count">{stats.total}</span>}
          </button>
        </div>
      </div>

      <div className="periode-selector">
        <button className={`periode-btn ${periode === "mois" ? "active" : ""}`} onClick={() => setPeriode("mois")}>Mois en cours</button>
        <button className={`periode-btn ${periode === "mois_dernier" ? "active" : ""}`} onClick={() => setPeriode("mois_dernier")}>Mois dernier</button>
        <button className={`periode-btn ${periode === "trimestre" ? "active" : ""}`} onClick={() => setPeriode("trimestre")}>Trimestre</button>
        <button className={`periode-btn ${periode === "annee" ? "active" : ""}`} onClick={() => setPeriode("annee")}>Année en cours</button>
        <button className={`periode-btn ${periode === "annee_derniere" ? "active" : ""}`} onClick={() => setPeriode("annee_derniere")}>Année dernière</button>
        <button className={`periode-btn ${periode === "perso" ? "active" : ""}`} onClick={() => setPeriode("perso")}>Personnalisée</button>
      </div>

      {periode === "perso" && (
        <div className="perso-dates">
          <div className="perso-field">
            <label>Du</label>
            <input type="date" value={persoDe} onChange={(e) => setPersoDe(e.target.value)} />
          </div>
          <div className="perso-field">
            <label>Au</label>
            <input type="date" value={persoA} onChange={(e) => setPersoA(e.target.value)} />
          </div>
        </div>
      )}

      {stats.total === 0 ? (
        <div className="empty-state">Aucune vente sur la période sélectionnée</div>
      ) : (
        <>
          <div className="stats-cards">
            <div className="stat-card stat-card-primary">
              <div className="stat-card-label">Chiffre d'affaires</div>
              <div className="stat-card-value">
                {(stats.ca / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€
              </div>
              <div className="stat-card-sub">{stats.total} machines vendues</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">Prix moyen</div>
              <div className="stat-card-value">{stats.prixMoyen.toLocaleString("fr-FR")} €</div>
              <div className="stat-card-sub">par machine</div>
            </div>
            <div className="stat-card stat-card-ok">
              <div className="stat-card-label">Taux de paiement</div>
              <div className="stat-card-value">{stats.tauxPaiement}%</div>
              <div className="stat-card-sub">factures réglées</div>
            </div>
            {stats.impayes > 0 && (
              <div className="stat-card stat-card-warn">
                <div className="stat-card-label">Impayés en retard</div>
                <div className="stat-card-value">
                  {(stats.impayes / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€
                </div>
                <div className="stat-card-sub">à relancer</div>
              </div>
            )}
            {stats.delaiMoyen > 0 && (
              <div className="stat-card">
                <div className="stat-card-label">Délai paiement moyen</div>
                <div className="stat-card-value">{stats.delaiMoyen} j</div>
                <div className="stat-card-sub">vente → règlement</div>
              </div>
            )}
            {totalLld > 0 && (
              <div className="stat-card stat-card-lld">
                <div className="stat-card-label">🔁 Machines en LLD</div>
                <div className="stat-card-value">{totalLld}</div>
                <div className="stat-card-sub">en location longue durée</div>
              </div>
            )}
          </div>

          {topCommerciaux.length > 0 && (
            <section className="stats-section">
              <h2>🏆 Top 3 commerciaux</h2>
              <div className="podium">
                {topCommerciaux[1] && <PodiumCard rank={2} data={topCommerciaux[1]} />}
                {topCommerciaux[0] && <PodiumCard rank={1} data={topCommerciaux[0]} />}
                {topCommerciaux[2] && <PodiumCard rank={3} data={topCommerciaux[2]} />}
              </div>
            </section>
          )}

          {evolutionMensuelle.data.length > 0 && (
            <section className="stats-section">
              <h2>📈 Évolution mensuelle</h2>
              <div className="evolution-chart">
                {evolutionMensuelle.data.map(({ mois, ca }) => {
                  const pct = (ca / evolutionMensuelle.maxCA) * 100;
                  return (
                    <div key={mois} className="evolution-bar-wrap">
                      <div className="evolution-bar-value">{(ca / 1000).toFixed(0)}k</div>
                      <div className="evolution-bar-container">
                        <div className="evolution-bar" style={{ height: `${pct}%` }}></div>
                      </div>
                      <div className="evolution-bar-label">{formatMois(mois)}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {tableauCroise.commerciaux.length > 0 && tableauCroise.moisDispo.length > 0 && (
            <section className="stats-section">
              <h2>📋 Tableau croisé · Commercial × Mois</h2>
              <div className="croise-wrap">
                <table className="croise-table">
                  <thead>
                    <tr>
                      <th className="croise-th-com">Commercial</th>
                      {tableauCroise.moisDispo.map((mois) => (
                        <th key={mois}>{formatMois(mois)}</th>
                      ))}
                      <th className="croise-th-total">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableauCroise.lignes.map((ligne) => (
                      <tr key={ligne.commercial}>
                        <td className="croise-td-com">{ligne.commercial}</td>
                        {ligne.cellules.map((c, idx) => (
                          <td key={idx} className="croise-td-cell">
                            {c.nb > 0 ? (
                              <>
                                <div className="croise-ca">{(c.ca / 1000).toFixed(1)}k€</div>
                                <div className="croise-nb">{c.nb} vente{c.nb > 1 ? "s" : ""}</div>
                              </>
                            ) : (
                              <span className="croise-empty">—</span>
                            )}
                          </td>
                        ))}
                        <td className="croise-td-total">
                          <div className="croise-ca">{(ligne.totalCA / 1000).toFixed(1)}k€</div>
                          <div className="croise-nb">{ligne.totalNb} vente{ligne.totalNb > 1 ? "s" : ""}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="croise-td-com">Total</td>
                      {tableauCroise.totauxCol.map((c, idx) => (
                        <td key={idx} className="croise-td-total">
                          <div className="croise-ca">{(c.ca / 1000).toFixed(1)}k€</div>
                          <div className="croise-nb">{c.nb}</div>
                        </td>
                      ))}
                      <td className="croise-td-total croise-td-grand">
                        <div className="croise-ca">{(stats.ca / 1000).toFixed(1)}k€</div>
                        <div className="croise-nb">{stats.total}</div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PodiumCard({ rank, data }: { rank: number; data: { nom: string; ca: number; nb: number } }) {
  const medals = ["🥇", "🥈", "🥉"];
  const heights = ["podium-1", "podium-2", "podium-3"];

  return (
    <div className={`podium-card ${heights[rank - 1]}`}>
      <div className="podium-medal">{medals[rank - 1]}</div>
      <div className="podium-rank">#{rank}</div>
      <div className="podium-name">{data.nom}</div>
      <div className="podium-ca">
        {(data.ca / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k€
      </div>
      <div className="podium-nb">{data.nb} vente{data.nb > 1 ? "s" : ""}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR");
}