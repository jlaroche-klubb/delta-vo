import { useTranslation } from "react-i18next";
import type { LigneMarche, SyntheseMarche } from "../utils/syntheseMarche";

/**
 * 📊 SYNTHÈSE MARCHÉ INTERNET — ADMIN / SUPER ADMIN UNIQUEMENT.
 *
 * Deux morceaux (refonte esthétique validée avec Jonathan) :
 *  - <MarcheTile>  : 4e tuile de l'en-tête Disponibles (marché moyen + écart
 *                    de nos prix), cliquable ;
 *  - <MarchePanel> : le tableau détaillé — une ligne par type de nacelle
 *                    (gras, toutes années), sous-lignes par tranche d'âge,
 *                    « Toutes nacelles » en pied.
 * Les chiffres viennent des études de marché IA déjà enregistrées (aucun
 * appel IA ici). Le calcul (calculerSyntheseMarche) est fait par la page.
 */

const eur = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("fr-FR")} €`);
const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v} %`);
const pctClass = (v: number | null) => (v == null ? "" : v > 10 ? "ecart-haut" : v < -10 ? "ecart-bas" : "");
const dateFr = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

export function MarcheTile({
  synthese,
  active,
  onClick,
}: {
  synthese: SyntheseMarche;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const g = synthese.global;
  return (
    <button
      type="button"
      className={`stat stat-market ${active ? "active" : ""}`}
      onClick={onClick}
      title={t("marche.toggleTitle")}
    >
      <span className="stat-value">{g ? eur(g.moyen) : "—"}</span>
      <span className="stat-label">📊 {t("marche.tileLabel")}</span>
      <span className={`stat-sub ${g ? pctClass(g.ecartPct) : ""}`}>
        {g && g.ecartPct != null
          ? `${t("marche.nosPrix")} ${pct(g.ecartPct)}`
          : g
          ? t("marche.machines", { count: g.nbMachines })
          : t("marche.tileVide")}
      </span>
    </button>
  );
}

export function MarchePanel({ synthese, onClose }: { synthese: SyntheseMarche; onClose: () => void }) {
  const { t } = useTranslation();
  const g = synthese.global;

  const renderLigne = (l: LigneMarche, key: string) => (
    <tr key={key} className={`marche-row niveau-${l.niveau}`}>
      <td className="left">
        {l.niveau === 2 ? "↳ " : ""}
        {l.niveau === 0 ? t("marche.toutes") : l.libelle}
      </td>
      <td>{l.nbMachines}</td>
      <td>{l.nbAnnonces}</td>
      <td>{eur(l.min)}</td>
      <td>{eur(l.moyen)}</td>
      <td>{eur(l.max)}</td>
      <td>{eur(l.prixDeltaMoyen)}</td>
      <td className={pctClass(l.ecartPct)}>{pct(l.ecartPct)}</td>
      <td>{dateFr(l.derniereEtude)}</td>
    </tr>
  );

  return (
    <div className="marche-panel">
      <div className="marche-panel-head">
        <div className="marche-panel-title">📊 {t("marche.titre")}</div>
        {g && (
          <div className="marche-panel-summary">
            <span>{t("marche.machines", { count: g.nbMachines })}</span>
            <span>{t("marche.min")} <b>{eur(g.min)}</b></span>
            <span>{t("marche.moyen")} <b>{eur(g.moyen)}</b></span>
            <span>{t("marche.max")} <b>{eur(g.max)}</b></span>
            {g.ecartPct != null && (
              <span>
                {t("marche.nosPrix")} <b className={pctClass(g.ecartPct)}>{pct(g.ecartPct)}</b> {t("marche.vsMarche")}
              </span>
            )}
            <span className="muted">{t("marche.derniere", { date: dateFr(g.derniereEtude) })}</span>
            {synthese.nbSansEtude > 0 && (
              <span className="warn">{t("marche.sansEtude", { count: synthese.nbSansEtude })}</span>
            )}
          </div>
        )}
        <button type="button" className="marche-close" onClick={onClose} title={t("marche.replier")}>
          ✕
        </button>
      </div>

      {!g ? (
        <div className="marche-empty">{t("marche.aucune", { jours: synthese.joursMax })}</div>
      ) : (
        <div className="marche-table-wrap">
          <table className="marche-table">
            <thead>
              <tr>
                <th className="left">{t("marche.colType")}</th>
                <th>{t("marche.colMachines")}</th>
                <th>{t("marche.colAnnonces")}</th>
                <th>{t("marche.min")}</th>
                <th>{t("marche.moyen")}</th>
                <th>{t("marche.max")}</th>
                <th>{t("marche.colPrixDelta")}</th>
                <th>{t("marche.colEcart")}</th>
                <th>{t("marche.colEtude")}</th>
              </tr>
            </thead>
            <tbody>
              {synthese.types.map((bloc) => [
                renderLigne(bloc.type, `t-${bloc.type.libelle}`),
                ...bloc.tranches.map((tr) => renderLigne(tr, `t-${bloc.type.libelle}-${tr.libelle}`)),
              ])}
              {renderLigne(g, "global")}
            </tbody>
          </table>
          <div className="marche-legende">{t("marche.legende", { jours: synthese.joursMax })}</div>
        </div>
      )}
    </div>
  );
}
