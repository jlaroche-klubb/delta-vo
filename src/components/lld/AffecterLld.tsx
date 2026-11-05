import { useMemo, useState } from "react";
import type { ContratLLD } from "../../types/lld";
import type { Machine } from "../../types/machine";
import { useMachines } from "../../contexts/MachinesContext";
import { affecterContratLLD, ouvrirPieceContratLLD } from "../../services/contratsLldService";

/**
 * 🚚 À affecter (lot 5) — Jonathan et les assistantes. Les contrats LLD signés
 * attendent ici une nacelle : stock Delta VO filtré sur le modèle du contrat
 * (disponibles, expertise reçue), nacelle pré-affectée proposée d'office si
 * l'immat était sur le contrat. « Mettre en préparation » : même circuit que
 * les ventes (fiche de préparation, préparateurs prévenus, sortie LLD, client
 * et n° de contrat sur la fiche machine, prochain départ dans Nacelle Expert).
 */
interface Props { contrats: ContratLLD[]; userName: string }

const CARTE: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 1px 3px rgba(20,30,60,.08)", padding: 16 };
const CHAMP: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccd", fontSize: 14, fontFamily: "inherit" };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 4 };
const BTN: React.CSSProperties = { padding: "9px 14px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const BTN2: React.CSSProperties = { ...BTN, background: "white", color: "#1a73e8", border: "1px solid #1a73e8" };
const eur = (n?: number) => (n || n === 0 ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "—");
const dateFr = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const norm = (s?: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Machines louables : disponibles (ou en restitution avec expertise reçue), non archivées */
function louable(m: Machine): boolean {
  if (m.archived) return false;
  const st = m.statut || "restitution";
  if (st === "disponible") return true;
  return st === "restitution" && (m.expertise_recue ?? true) === true;
}

export default function AffecterLld({ contrats, userName }: Props) {
  const { machines } = useMachines();
  const aAffecter = useMemo(() => contrats.filter((c) => c.statut === "signe").sort((a, b) => (a.signe_le || "").localeCompare(b.signe_le || "")), [contrats]);
  const [ouvert, setOuvert] = useState<string>("");
  void userName;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: "#555" }}>Contrats LLD signés en attente d'une nacelle. Choisissez la machine, le type de préparation et la date de livraison : la fiche passe en préparation (sortie LLD), les préparateurs du site sont prévenus et le prochain départ est pré-rempli dans Nacelle Expert.</div>
      {aAffecter.length === 0 && <div style={{ ...CARTE, color: "#888" }}>Aucun contrat à affecter.</div>}
      {aAffecter.map((c) => (
        <Dossier key={c.numero} c={c} machines={machines} ouvert={ouvert === c.numero} onOuvrir={() => setOuvert(ouvert === c.numero ? "" : c.numero)} />
      ))}
    </div>
  );
}

function Dossier({ c, machines, ouvert, onOuvrir }: { c: ContratLLD; machines: Machine[]; ouvert: boolean; onOuvrir: () => void }) {
  const cibles = useMemo(() => {
    const modele = norm(c.modele);
    const l = machines.filter(louable);
    const score = (m: Machine) => (c.immat && norm(m.immat) === norm(c.immat) ? 3 : modele && norm(m.type_nacelle) === modele ? 2 : modele && (norm(m.type_nacelle).includes(modele) || modele.includes(norm(m.type_nacelle)) && norm(m.type_nacelle).length >= 3) ? 1 : 0);
    return l.map((m) => ({ m, s: score(m) })).sort((a, b) => b.s - a.s || (a.m.immat || "").localeCompare(b.m.immat || ""));
  }, [machines, c.modele, c.immat]);
  const compatibles = cibles.filter((x) => x.s > 0);
  const [tout, setTout] = useState(false);
  const [machineId, setMachineId] = useState<string>(() => cibles.find((x) => x.s === 3)?.m.id || "");
  const [typePrepa, setTypePrepa] = useState<"normale" | "en_etat">("normale");
  const [livraison, setLivraison] = useState(c.date_livraison_souhaitee || "");
  const [enCours, setEnCours] = useState(false);
  const [filtre, setFiltre] = useState("");
  const choisie = machines.find((m) => m.id === machineId);
  const liste = (tout ? cibles : compatibles).filter((x) => !filtre || norm(x.m.immat).includes(norm(filtre)) || norm(x.m.type_nacelle).includes(norm(filtre)) || norm(x.m.localite).includes(norm(filtre)));

  async function affecter() {
    if (!choisie) return;
    if (!window.confirm(`Affecter ${choisie.immat} (${choisie.type_nacelle || "?"}, ${choisie.localite || "site ?"}) au contrat ${c.numero} — ${c.client.raison_sociale} — et la mettre en préparation (${typePrepa === "normale" ? "préparation normale" : "en l'état"}, livraison ${livraison ? dateFr(livraison) : "au plus vite"}) ?`)) return;
    setEnCours(true);
    try {
      const r = await affecterContratLLD(c.numero, { machine_id: choisie.id, type_prepa: typePrepa, date_livraison: livraison });
      alert(`✅ ${r.immat} affectée au contrat ${c.numero} et mise en préparation.\n\n${r.detail}`);
    } catch (e: any) { alert(`❌ ${e?.message || "Affectation impossible"}`); }
    finally { setEnCours(false); }
  }

  return (
    <div style={{ ...CARTE, borderLeft: `4px solid ${c.immat ? "#1e8e3e" : "#e0b45c"}` }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={onOuvrir}>
        <div>
          <b style={{ fontSize: 15 }}>{c.numero}</b> — <b>{c.client.raison_sociale}</b>{c.client.ville ? ` (${c.client.ville})` : ""}
          <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>
            {c.modele}{c.immat ? <> · pré-affectée <b>{c.immat}</b></> : " · nacelle à choisir"} · {c.full_services ? "Full services" : "Sans entretien"} · {c.duree_mois} mois · {eur(c.total_mensuel_ht)} HT/mois · caution {eur(c.caution_ttc)} TTC
            · signé le {dateFr(c.signe_le)} par {c.signature?.nom || "?"} · commercial {c.commercial?.nom} · livraison souhaitée {c.date_livraison_souhaitee ? dateFr(c.date_livraison_souhaitee) : "rapide"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {c.pdf_signe_url && <a href={c.pdf_signe_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ ...BTN2, padding: "6px 10px", fontSize: 13, textDecoration: "none", background: "#e3f4e8", color: "#1e6b35", borderColor: "#1e6b35" }}>✍️ Contrat signé</a>}
          {c.pieces?.cni && <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); ouvrirPieceContratLLD(c.numero, "cni").catch((x) => alert(`❌ ${x?.message}`)); }}>🪪 CNI</button>}
          {c.pieces?.rib && <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); ouvrirPieceContratLLD(c.numero, "rib").catch((x) => alert(`❌ ${x?.message}`)); }}>🏦 RIB</button>}
          <button type="button" style={{ ...BTN, padding: "6px 12px", fontSize: 13 }} onClick={(e) => { e.stopPropagation(); onOuvrir(); }}>{ouvert ? "▲ Fermer" : "🚚 Choisir la nacelle"}</button>
        </div>
      </div>
      {ouvert && (
        <div style={{ marginTop: 14, borderTop: "1px solid #edf0f5", paddingTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <input style={{ ...CHAMP, maxWidth: 260 }} value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Filtrer : immat, type, site…" />
            <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={tout} onChange={(e) => setTout(e.target.checked)} /> Afficher tout le stock louable ({cibles.length}), pas seulement les {c.modele} ({compatibles.length})</label>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #e3e7ee", borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
              <thead><tr style={{ background: "#f7f9fc", textAlign: "left", position: "sticky", top: 0 }}>{["", "Immat", "Nacelle", "Porteur", "Année", "Km", "Heures", "Site", "Statut"].map((h) => <th key={h} style={{ padding: "8px 10px", fontSize: 11, color: "#5b6575", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>
                {liste.map(({ m, s }) => (
                  <tr key={m.id} onClick={() => setMachineId(m.id)} style={{ cursor: "pointer", background: machineId === m.id ? "#eef4fd" : s === 3 ? "#f1faf3" : "white", borderTop: "1px solid #edf0f5" }}>
                    <td style={{ padding: "6px 10px" }}><input type="radio" name={`m-${c.numero}`} checked={machineId === m.id} onChange={() => setMachineId(m.id)} /></td>
                    <td style={{ padding: "6px 10px", fontWeight: 700 }}>{m.immat}{s === 3 ? " ★" : ""}</td>
                    <td style={{ padding: "6px 10px" }}>{m.type_nacelle || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{m.modele_porteur || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{m.annee_circulation || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{m.km_porteur ? Number(m.km_porteur).toLocaleString("fr-FR") : "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{m.heures_nacelle || "—"}</td>
                    <td style={{ padding: "6px 10px" }}>{m.localite || "—"}</td>
                    <td style={{ padding: "6px 10px", color: m.statut === "disponible" ? "#1e6b35" : "#8a5a00" }}>{m.statut === "disponible" ? "disponible" : "restitution (expertise reçue)"}</td>
                  </tr>
                ))}
                {!liste.length && <tr><td colSpan={9} style={{ padding: 12, color: "#888" }}>Aucune machine {tout ? "louable" : `${c.modele} disponible — cochez « tout le stock »`}.</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 12, alignItems: "end" }}>
            <div><label style={LABEL}>Nacelle choisie</label><div style={{ ...CHAMP, background: "#f5f9fd", fontWeight: 700 }}>{choisie ? `${choisie.immat} — ${choisie.type_nacelle || ""} (${choisie.localite || "site ?"})` : "—"}</div></div>
            <div><label style={LABEL}>Type de préparation</label>
              <div style={{ display: "flex", gap: 6 }}>
                {(["normale", "en_etat"] as const).map((t) => <button key={t} type="button" onClick={() => setTypePrepa(t)} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `2px solid ${typePrepa === t ? "#1a73e8" : "#ddd"}`, background: typePrepa === t ? "#eef4fd" : "white", color: typePrepa === t ? "#1a2a6e" : "#555" }}>{t === "normale" ? "Normale (lavage, CT, VGP, carrosserie, révision, photos)" : "En l'état (lavage + photos)"}</button>)}
              </div>
            </div>
            <div><label style={LABEL}>Date de livraison prévue</label><input style={CHAMP} type="date" value={livraison} onChange={(e) => setLivraison(e.target.value)} /></div>
            <button type="button" style={{ ...BTN, background: "#1e8e3e" }} disabled={!choisie || enCours} onClick={affecter}>{enCours ? "⏳ …" : "🔧 Affecter et mettre en préparation"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
