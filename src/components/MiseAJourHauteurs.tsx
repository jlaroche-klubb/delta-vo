import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import { useMachines } from "../contexts/MachinesContext";
import type { Machine } from "../types/machine";
import { normalizeTypeNacelle } from "../utils/nacelles";
import { referencePourMachine, ReferenceNacelle } from "../utils/referenceNacelles";

/**
 * 📐 OUTIL SUPER ADMIN — « Mettre à jour les hauteurs (fiches techniques) ».
 *
 * Compare hauteur / déport de la fiche commerciale de chaque machine (hors
 * archivées et clôturées) au référentiel des brochures KLUBB :
 *  - vide      → complété automatiquement ;
 *  - différent → listé, remplacé seulement si l'option est cochée ;
 *  - type inconnu du référentiel → listé pour information.
 * Aperçu avant toute écriture ; rien d'autre de la fiche n'est modifié.
 */

type Ligne = { m: Machine; ref: ReferenceNacelle; h?: number; d?: number };

export default function MiseAJourHauteurs({ variant }: { variant?: "menu" } = {}) {
  const { profile } = useAuth();
  const { machines, updateFicheCommerciale } = useMachines();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [remplacer, setRemplacer] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  const analyse = useMemo(() => {
    const aCompleter: Ligne[] = [];
    const differentes: Ligne[] = [];
    const conformes: Ligne[] = [];
    const inconnues = new Map<string, number>();
    for (const m of machines) {
      if (m.archived || m.statut === "cloturee") continue;
      const ref = referencePourMachine(m);
      if (!ref) {
        const type = normalizeTypeNacelle(m.type_nacelle || "") || "(sans type)";
        if (type !== "Sans nacelle") inconnues.set(type, (inconnues.get(type) || 0) + 1);
        continue;
      }
      const h = m.fiche_commerciale?.hauteur_travail_m;
      const d = m.fiche_commerciale?.deport_travail_m;
      const ligne = { m, ref, h, d };
      if (!h || !d) aCompleter.push(ligne);
      else if (Math.abs(h - ref.hauteur_travail_m) > 0.01 || Math.abs(d - ref.deport_m) > 0.01) differentes.push(ligne);
      else conformes.push(ligne);
    }
    return { aCompleter, differentes, conformes, inconnues };
  }, [machines]);

  if (profile?.role !== "superadmin") return null;

  async function appliquer() {
    const cibles = [...analyse.aCompleter, ...(remplacer ? analyse.differentes : [])];
    if (!cibles.length) return;
    let ok = 0;
    const erreurs: string[] = [];
    for (let i = 0; i < cibles.length; i++) {
      const { m, ref } = cibles[i];
      setProgress(`${i + 1}/${cibles.length}`);
      try {
        await updateFicheCommerciale(m.id, {
          ...(m.fiche_commerciale || {}),
          hauteur_travail_m: ref.hauteur_travail_m,
          deport_travail_m: ref.deport_m,
        });
        ok++;
      } catch (e: any) {
        erreurs.push(`${m.immat} (${e?.message || e})`);
      }
    }
    setProgress(null);
    setBilan(t("hauteurs.bilan", { ok, erreurs: erreurs.length ? ` — ⚠ ${erreurs.join(", ")}` : "" }));
  }

  const fmt = (n?: number) => (n == null ? "—" : n.toLocaleString("fr-FR"));
  const total = analyse.aCompleter.length + analyse.differentes.length;

  return (
    <>
      <button
        type="button"
        className={variant === "menu" ? "action-menu-item" : "btn-import"}
        onClick={() => {
          setBilan(null);
          setOpen(true);
        }}
        title={t("hauteurs.btnTitle")}
      >
        📐 {t("hauteurs.btn")}
        {total > 0 ? <span className="tb-badge">{total}</span> : null}
      </button>

      {open && (
        <div
          className="modal-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !progress) setOpen(false);
          }}
        >
          <div className="modal" style={{ maxWidth: 820 }}>
            <div className="modal-header">
              <div>
                <h2>📐 {t("hauteurs.title")}</h2>
                <div className="modal-subtitle">{t("hauteurs.subtitle")}</div>
              </div>
              <button className="btn-close" onClick={() => !progress && setOpen(false)}>✕</button>
            </div>

            <div className="lld-body">
              <div className="hauteurs-stats">
                <div className="hauteurs-stat ok"><strong>{analyse.conformes.length}</strong><span>{t("hauteurs.conformes")}</span></div>
                <div className="hauteurs-stat fill"><strong>{analyse.aCompleter.length}</strong><span>{t("hauteurs.aCompleter")}</span></div>
                <div className="hauteurs-stat diff"><strong>{analyse.differentes.length}</strong><span>{t("hauteurs.differentes")}</span></div>
                <div className="hauteurs-stat unk"><strong>{Array.from(analyse.inconnues.values()).reduce((a, b) => a + b, 0)}</strong><span>{t("hauteurs.inconnues")}</span></div>
              </div>

              {analyse.differentes.length > 0 && (
                <>
                  <h4 className="hauteurs-h4">⚠ {t("hauteurs.listeDiff")}</h4>
                  <div className="hauteurs-table-wrap">
                    <table className="hauteurs-table">
                      <thead>
                        <tr>
                          <th>{t("hauteurs.colImmat")}</th>
                          <th>{t("hauteurs.colType")}</th>
                          <th>{t("hauteurs.colActuel")}</th>
                          <th>{t("hauteurs.colRef")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyse.differentes.map(({ m, ref, h, d }) => (
                          <tr key={m.id}>
                            <td><strong>{m.immat}</strong></td>
                            <td>{normalizeTypeNacelle(m.type_nacelle || "")}{m.modele_porteur ? ` · ${m.modele_porteur}` : ""}</td>
                            <td>{fmt(h)} m / {fmt(d)} m</td>
                            <td>
                              {fmt(ref.hauteur_travail_m)} m / {fmt(ref.deport_m)} m
                              {ref.assimile ? <span className="hauteurs-note"> ({ref.assimile})</span> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="hauteurs-check">
                    <input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} />
                    {t("hauteurs.remplacer", { n: analyse.differentes.length })}
                  </label>
                </>
              )}

              {analyse.aCompleter.length > 0 && (
                <>
                  <h4 className="hauteurs-h4">✏️ {t("hauteurs.listeFill")}</h4>
                  <div className="hauteurs-chips">
                    {analyse.aCompleter.map(({ m, ref }) => (
                      <span key={m.id} className="hauteurs-chip" title={`${ref.hauteur_travail_m} m / ${ref.deport_m} m — ${ref.source}`}>
                        {m.immat} <em>{normalizeTypeNacelle(m.type_nacelle || "")}</em> → {fmt(ref.hauteur_travail_m)} / {fmt(ref.deport_m)} m
                      </span>
                    ))}
                  </div>
                </>
              )}

              {analyse.inconnues.size > 0 && (
                <>
                  <h4 className="hauteurs-h4">❔ {t("hauteurs.listeUnk")}</h4>
                  <div className="hauteurs-chips">
                    {Array.from(analyse.inconnues.entries()).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                      <span key={type} className="hauteurs-chip unk">{type} <em>× {n}</em></span>
                    ))}
                  </div>
                </>
              )}

              {bilan && <div className="hauteurs-bilan">✅ {bilan}</div>}

              <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={!!progress}>
                  {t("card.cancel")}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={appliquer}
                  disabled={!!progress || (analyse.aCompleter.length === 0 && !(remplacer && analyse.differentes.length))}
                >
                  {progress
                    ? `⏳ ${progress}`
                    : t("hauteurs.appliquer", { n: analyse.aCompleter.length + (remplacer ? analyse.differentes.length : 0) })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
