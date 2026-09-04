import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { calculerSyntheseMarche, type LigneMarche } from "../utils/syntheseMarche";
import type { Machine } from "../types/machine";

/**
 * 📊 SYNTHÈSE MARCHÉ INTERNET — ADMIN / SUPER ADMIN UNIQUEMENT.
 *
 * Ligne de synthèse toujours visible sous la barre d'outils de la page
 * Disponibles (machines étudiées · min · moyen · max · écart de nos prix) ;
 * un clic déplie le tableau : une ligne par type de nacelle (gras, toutes
 * années) puis les sous-lignes par tranche d'âge, et « Toutes nacelles » en
 * pied. Les chiffres viennent des études de marché IA déjà enregistrées
 * (aucun appel IA ici).
 */
export default function SyntheseMarche({ machines, isAdmin }: { machines: Machine[]; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const synthese = useMemo(() => calculerSyntheseMarche(machines), [machines]);

  if (!isAdmin) return null;
  const g = synthese.global;

  const eur = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("fr-FR")} €`);
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v} %`);
  const pctColor = (v: number | null) => (v == null ? "#666" : v > 10 ? "#c0392b" : v < -10 ? "#1a7f37" : "#1a2a6e");
  const dateFr = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "—");

  const boxStyle: CSSProperties = {
    margin: "0 0 12px",
    background: "#f3f6fd",
    border: "1px solid #c9d4ee",
    borderRadius: 8,
    fontSize: 13,
    color: "#1a2a6e",
  };

  if (!g) {
    return (
      <div style={{ ...boxStyle, padding: "8px 14px" }}>
        📊 <b>{t("marche.titre")}</b> — {t("marche.aucune", { jours: synthese.joursMax })}
      </div>
    );
  }

  const cell: CSSProperties = { padding: "5px 10px", textAlign: "right", whiteSpace: "nowrap" };
  const head: CSSProperties = { ...cell, fontWeight: 700, borderBottom: "2px solid #c9d4ee", background: "#e8edf9" };

  const renderLigne = (l: LigneMarche, key: string) => {
    const isType = l.niveau === 1;
    const isGlobal = l.niveau === 0;
    return (
      <tr
        key={key}
        style={{
          fontWeight: isType || isGlobal ? 700 : 400,
          background: isGlobal ? "#e8edf9" : isType ? "#fff" : "transparent",
          borderTop: isType || isGlobal ? "1px solid #c9d4ee" : "none",
          color: isType || isGlobal ? "#1a2a6e" : "#444",
        }}
      >
        <td style={{ ...cell, textAlign: "left", paddingLeft: l.niveau === 2 ? 28 : 10 }}>
          {l.niveau === 2 ? "↳ " : ""}{isGlobal ? t("marche.toutes") : l.libelle}
        </td>
        <td style={cell}>{l.nbMachines}</td>
        <td style={cell}>{l.nbAnnonces}</td>
        <td style={cell}>{eur(l.min)}</td>
        <td style={cell}>{eur(l.moyen)}</td>
        <td style={cell}>{eur(l.max)}</td>
        <td style={cell}>{eur(l.prixDeltaMoyen)}</td>
        <td style={{ ...cell, color: pctColor(l.ecartPct) }}>{pct(l.ecartPct)}</td>
        <td style={cell}>{dateFr(l.derniereEtude)}</td>
      </tr>
    );
  };

  return (
    <div style={boxStyle}>
      <div
        role="button"
        onClick={() => setOpen(!open)}
        title={t("marche.toggleTitle")}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 14px", padding: "8px 14px", cursor: "pointer" }}
      >
        <span style={{ fontWeight: 700 }}>📊 {t("marche.titre")}</span>
        <span>{t("marche.machines", { count: g.nbMachines })}</span>
        <span>{t("marche.min")} <b>{eur(g.min)}</b></span>
        <span>{t("marche.moyen")} <b>{eur(g.moyen)}</b></span>
        <span>{t("marche.max")} <b>{eur(g.max)}</b></span>
        {g.ecartPct != null && (
          <span>
            {t("marche.nosPrix")} <b style={{ color: pctColor(g.ecartPct) }}>{pct(g.ecartPct)}</b> {t("marche.vsMarche")}
          </span>
        )}
        <span style={{ color: "#666" }}>{t("marche.derniere", { date: dateFr(g.derniereEtude) })}</span>
        {synthese.nbSansEtude > 0 && (
          <span style={{ color: "#8a6a12" }}>{t("marche.sansEtude", { count: synthese.nbSansEtude })}</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12 }}>{open ? "▲" : "▼"} {open ? t("marche.replier") : t("marche.detail")}</span>
      </div>

      {open && (
        <div style={{ overflowX: "auto", padding: "0 6px 8px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: "left" }}>{t("marche.colType")}</th>
                <th style={head}>{t("marche.colMachines")}</th>
                <th style={head}>{t("marche.colAnnonces")}</th>
                <th style={head}>{t("marche.min")}</th>
                <th style={head}>{t("marche.moyen")}</th>
                <th style={head}>{t("marche.max")}</th>
                <th style={head}>{t("marche.colPrixDelta")}</th>
                <th style={head}>{t("marche.colEcart")}</th>
                <th style={head}>{t("marche.colEtude")}</th>
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
          <div style={{ fontSize: 11, color: "#666", padding: "6px 10px 0" }}>{t("marche.legende", { jours: synthese.joursMax })}</div>
        </div>
      )}
    </div>
  );
}
