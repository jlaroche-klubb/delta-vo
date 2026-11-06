import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import type { ClientLLD, ConfigLLD, DureeOffreLLD, OffreLLD, OptionOffreLLD, PrestationLLD } from "../../types/lld";
import { chargerConfigLLD, creerClientLLD, ecouterClientsLLD, loyerGrille } from "../../services/lldService";
import { changerStatutOffreLLD, creerOffreLLD, ecouterOffresLLD, envoyerLienOffreLLD, genererLienOffreLLD, modifierOffreLLD, type OffreLLDSaisie } from "../../services/offresLldService";
import { genererOffreLldPdf } from "../../utils/generateOffreLldPdf";
import ChampModele from "./ChampModele";

/**
 * 📄 Offres LLD (lot 2) — réservé à Jonathan. Une offre = un client, un modèle
 * (× quantité), une durée fixe ou plusieurs au choix, options, transport
 * (offert ou chiffré), PDF 9 pages et lien de signature : copié, ou envoyé par
 * email depuis Delta VO. Côté client : juste la société, l'email et le
 * commercial ; le client donne ses coordonnées (SIRET, adresse…) en signant.
 */
interface Props { userName: string; userEmail: string }

const CHAMP: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccd", fontSize: 14, fontFamily: "inherit" };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 4 };
const CARTE: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 1px 3px rgba(20,30,60,.08)", padding: 16 };
const TITRE: React.CSSProperties = { fontWeight: 700, color: "#1a2a6e", fontSize: 15, margin: "0 0 10px" };
const BTN: React.CSSProperties = { padding: "9px 14px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const BTN2: React.CSSProperties = { ...BTN, background: "white", color: "#1a73e8", border: "1px solid #1a73e8" };
const eur = (n?: number) => (n || n === 0 ? n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " €" : "—");
const dateFr = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;

const STATUT: Record<string, { lib: string; bg: string; fg: string }> = {
  brouillon: { lib: "Brouillon", bg: "#eceff3", fg: "#3c4452" }, generee: { lib: "Lien envoyé / à signer", bg: "#e6effd", fg: "#174ea6" },
  signee: { lib: "Signée", bg: "#e3f4e8", fg: "#1e6b35" }, refusee: { lib: "Refusée", bg: "#fbe9e7", fg: "#a3261b" }, expiree: { lib: "Expirée", bg: "#fff3d6", fg: "#7a5400" }, annulee: { lib: "Annulée", bg: "#eceff3", fg: "#6b7280" },
};
const estExpiree = (o: OffreLLD) => (o.statut === "brouillon" || o.statut === "generee") && o.date_expiration < new Date().toISOString().slice(0, 10);

interface Commercial { nom: string; email: string; tel?: string }

export default function OffresLld({ userName, userEmail }: Props) {
  const [offres, setOffres] = useState<OffreLLD[]>([]);
  const [clients, setClients] = useState<ClientLLD[]>([]);
  const [cfg, setCfg] = useState<ConfigLLD | null>(null);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [edition, setEdition] = useState<OffreLLD | "nouvelle" | null>(null);
  const [filtre, setFiltre] = useState("");
  const [enCours, setEnCours] = useState("");

  useEffect(() => {
    const s1 = ecouterOffresLLD(setOffres);
    const s2 = ecouterClientsLLD(setClients);
    chargerConfigLLD().then(setCfg);
    Promise.resolve().then(() => getDocs(collection(db, "users"))).then((snap) => {
      const l = snap.docs.map((d) => d.data() as any).filter((u) => ["vendeur_fr", "admin", "superadmin"].includes(u.role) && u.email && !u.service)
        .map((u) => ({ nom: `${u.prenom || ""} ${u.nom || ""}`.trim() || u.email, email: String(u.email).toLowerCase(), tel: u.telephone || u.tel || "" }))
        .sort((a, b) => a.nom.localeCompare(b.nom));
      setCommerciaux(l);
    }).catch(() => setCommerciaux([]));
    return () => { s1(); s2(); };
  }, []);

  const liste = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return offres.filter((o) => !q || o.numero.toLowerCase().includes(q) || o.client.raison_sociale.toLowerCase().includes(q) || o.modele.toLowerCase().includes(q));
  }, [offres, filtre]);

  async function genererEtLien(o: OffreLLD) {
    if (!cfg) return;
    setEnCours(o.numero);
    try {
      const pdf = genererOffreLldPdf(o, cfg);
      const r = await genererLienOffreLLD(o.numero, pdf.base64, pdf.zoneSignature);
      await copier(r.lien);
      alert(`✅ Offre ${o.numero} : PDF généré et lien de signature copié dans le presse-papiers.\n\n${r.lien}\n\nEnvoyez-le vous-même au client (email, SMS…). Il choisira sa durée et signera en ligne.`);
    } catch (e: any) { alert(`❌ ${e?.message || "Génération impossible"}`); }
    finally { setEnCours(""); }
  }
  async function copier(t: string) { try { await navigator.clipboard.writeText(t); } catch { window.prompt("Copiez le lien :", t); } }
  async function envoyer(o: OffreLLD) {
    if (!window.confirm(`Envoyer la proposition ${o.numero} (PDF + lien de signature) à ${o.client.contact_email} ?`)) return;
    setEnCours(o.numero);
    try { const r = await envoyerLienOffreLLD(o.numero); alert(`📧 Proposition ${o.numero} envoyée à ${r.envoye_a}.`); }
    catch (e: any) { alert(`❌ ${e?.message || "Envoi impossible"}`); }
    finally { setEnCours(""); }
  }
  function apercu(o: OffreLLD) {
    if (!cfg) return;
    const pdf = genererOffreLldPdf(o, cfg);
    const url = URL.createObjectURL(pdf.blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function statut(o: OffreLLD, s: "refusee" | "annulee") {
    const motif = window.prompt(s === "refusee" ? "Motif du refus (facultatif) :" : "Motif de l'annulation (facultatif) :") ?? null;
    if (motif === null) return;
    try { await changerStatutOffreLLD(o.numero, s, motif); } catch (e: any) { alert(`❌ ${e?.message}`); }
  }
  const lienDe = (o: OffreLLD) => `${window.location.origin}/offre-lld/${encodeURIComponent(o.numero)}/${o.signature_jeton}`;

  if (edition) {
    return (
      <OffreForm offre={edition === "nouvelle" ? null : edition} cfg={cfg} clients={clients} commerciaux={commerciaux} userName={userName} userEmail={userEmail}
        onFermer={() => setEdition(null)} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Rechercher : n°, client, modèle…" style={{ ...CHAMP, maxWidth: 340 }} />
        <button type="button" style={BTN} onClick={() => setEdition("nouvelle")}>+ Nouvelle offre</button>
      </div>
      <div style={{ ...CARTE, padding: 0, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead><tr style={{ background: "#f7f9fc", textAlign: "left" }}>{["N°", "Client", "Modèle × qté", "Durées", "Commercial", "Validité", "Statut", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 12, color: "#5b6575", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>
            {liste.map((o) => {
              const st = STATUT[estExpiree(o) ? "expiree" : o.statut] || STATUT.brouillon;
              const modifiable = o.statut === "brouillon" || o.statut === "generee";
              return (
                <tr key={o.numero} style={{ borderTop: "1px solid #edf0f5" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 700 }}>{o.numero}</td>
                  <td style={{ padding: "10px 12px" }}>{o.client.raison_sociale}</td>
                  <td style={{ padding: "10px 12px" }}>{o.modele}{o.quantite > 1 ? ` × ${o.quantite}` : ""}<div style={{ fontSize: 12, color: "#777" }}>{o.materiel === "neuf" ? "Neuf" : "VO"} · {o.full_services ? "Full services" : "Sans entretien"}{o.courte_duree ? " · courte durée" : ""}{o.avec_assurance ? " · assurance" : ""}</div></td>
                  <td style={{ padding: "10px 12px" }}>{o.choix ? <b>{o.choix.duree_mois} mois — {eur(o.choix.total_mensuel_ht)} HT</b> : o.durees.map((d) => `${d.mois} m`).join(" / ")}</td>
                  <td style={{ padding: "10px 12px" }}>{o.commercial.nom}</td>
                  <td style={{ padding: "10px 12px" }}>{dateFr(o.date_expiration)}</td>
                  <td style={{ padding: "10px 12px" }}><span style={{ display: "inline-block", borderRadius: 12, padding: "3px 10px", fontSize: 12, fontWeight: 700, background: st.bg, color: st.fg }}>{st.lib}</span></td>
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {modifiable && <button type="button" style={{ ...BTN, padding: "6px 10px", fontSize: 13 }} disabled={enCours === o.numero} onClick={() => genererEtLien(o)}>{enCours === o.numero ? "⏳" : o.statut === "generee" ? "🔗 Régénérer + copier le lien" : "📄 Générer PDF + lien"}</button>}
                    {o.statut === "generee" && o.signature_jeton && <button type="button" style={{ ...BTN, padding: "6px 10px", fontSize: 13, background: "#1e8e3e" }} disabled={enCours === o.numero} onClick={() => envoyer(o)} title={`Email à ${o.client.contact_email}`}>{o.envoye_le ? "📧 Renvoyer" : "📧 Envoyer par email"}</button>}
                    {o.statut === "generee" && o.signature_jeton && <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} onClick={() => copier(lienDe(o)).then(() => alert("Lien copié."))}>📋 Copier le lien</button>}
                    <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} onClick={() => apercu(o)}>👁 Aperçu PDF</button>
                    {o.pdf_signe_url && <a href={o.pdf_signe_url} target="_blank" rel="noopener noreferrer" style={{ ...BTN2, padding: "6px 10px", fontSize: 13, textDecoration: "none", background: "#e3f4e8", color: "#1e6b35", borderColor: "#1e6b35" }}>✍️ PDF signé</a>}
                    {modifiable && <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13, color: "#555", borderColor: "#ccc" }} onClick={() => setEdition(o)}>✏️</button>}
                    {modifiable && <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13, color: "#b3261e", borderColor: "#b3261e" }} onClick={() => statut(o, "refusee")} title="Le client a refusé">Refusée</button>}
                    {modifiable && <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13, color: "#555", borderColor: "#ccc" }} onClick={() => statut(o, "annulee")} title="Annuler l'offre">✕</button>}
                  </td>
                </tr>
              );
            })}
            {!liste.length && <tr><td colSpan={8} style={{ padding: 16, color: "#888" }}>Aucune offre{filtre ? " ne correspond" : " pour l'instant"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Formulaire ─────────────────────────

function OffreForm({ offre, cfg, clients, commerciaux, userName, userEmail, onFermer }: { offre: OffreLLD | null; cfg: ConfigLLD | null; clients: ClientLLD[]; commerciaux: Commercial[]; userName: string; userEmail: string; onFermer: () => void }) {
  const base = (): OffreLLDSaisie => offre ? { ...offre } : {
    client_id: undefined, client: { raison_sociale: "" }, commercial: { nom: userName, email: userEmail },
    materiel: "vo", courte_duree: false, avec_assurance: false, full_services: true, modele: cfg?.modeles[0] || "", quantite: 1,
    durees: [{ mois: 36, loyer_ht: 0 }], options: [], transport: { mode: "offert", adresse: "" },
    km_an: cfg?.km_an_defaut || 30000, heures: cfg?.heures_defaut || "illimitées", prix_km_sup: cfg?.prix_km_sup_defaut || 0.18, caution_mois: 1,
    prestations: cfg?.prestations_full || [], commentaire: "", validite_jours: cfg?.validite_offre_jours || 30,
  };
  const [f, setF] = useState<OffreLLDSaisie>(base);
  const [clientRech, setClientRech] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  useEffect(() => { if (!offre && cfg) setF(base()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cfg]);
  // Modèle / matériel / type de durée changé : les loyers encore vides sont repris de la grille (les loyers saisis ne bougent pas)
  useEffect(() => {
    if (!cfg) return;
    setF((x) => {
      const durees = x.durees.map((d) => {
        if (d.loyer_ht > 0) return d;
        const g = x.courte_duree ? null : loyerGrille(cfg, x.modele, d.mois, x.materiel === "neuf");
        const c = x.courte_duree ? cfg.courte_duree.find((l) => l.modele.toLowerCase() === x.modele.toLowerCase() && l.mois === d.mois) : null;
        return { ...d, loyer_ht: g?.loyer_ht || c?.loyer_ht || 0, ...(g?.assurance_ht ? { loyer_assurance_ht: d.loyer_assurance_ht || g.loyer_ht + g.assurance_ht } : {}) };
      });
      return JSON.stringify(durees) === JSON.stringify(x.durees) ? x : { ...x, durees };
    });
  }, [cfg, f.modele, f.materiel, f.courte_duree]);
  const set = <K extends keyof OffreLLDSaisie>(k: K, v: OffreLLDSaisie[K]) => setF((x) => ({ ...x, [k]: v }));

  const clientsFiltres = useMemo(() => { const q = clientRech.trim().toLowerCase(); return q ? clients.filter((c) => c.raison_sociale.toLowerCase().includes(q) || (c.siren || "").includes(q)).slice(0, 8) : []; }, [clients, clientRech]);
  const [creation, setCreation] = useState(false);
  async function creerClientRapide() {
    const nom = clientRech.trim();
    if (nom.length < 2) return;
    setCreation(true);
    try {
      const id = await creerClientLLD({ raison_sociale: nom }, userName);
      setF((x) => ({ ...x, client_id: id, client: { raison_sociale: nom, contact_email: x.client.contact_email || "" } }));
      setClientRech("");
    } catch (e: any) { setErreur(e?.message || "Création impossible"); }
    finally { setCreation(false); }
  }
  function choisirClient(c: ClientLLD) {
    setF((x) => ({ ...x, client_id: c.id, client: { raison_sociale: c.raison_sociale, siren: c.siren, adresse: c.adresse, cp: c.cp, ville: c.ville, contact_nom: c.signataire?.nom || "", contact_email: c.signataire?.email || c.email || "", contact_tel: c.signataire?.tel || c.telephone || "" } }));
    setClientRech("");
  }
  /** Formule : prestations préremplies depuis l'admin (modifiables ensuite) */
  function choisirFormule(full: boolean) { setF((x) => ({ ...x, full_services: full, prestations: cfg ? (full ? cfg.prestations_full : cfg.prestations_sans_entretien) : x.prestations })); }
  /** Loyer prérempli par la grille (modèle × durée × neuf/VO) */
  function loyerDefaut(mois: number): DureeOffreLLD {
    if (!cfg) return { mois, loyer_ht: 0 };
    if (f.courte_duree) { const c = cfg.courte_duree.find((l) => l.modele.toLowerCase() === f.modele.toLowerCase() && l.mois === mois); return { mois, loyer_ht: c?.loyer_ht || 0 }; }
    const g = loyerGrille(cfg, f.modele, mois, f.materiel === "neuf");
    return { mois, loyer_ht: g?.loyer_ht || 0, ...(g?.assurance_ht ? { loyer_assurance_ht: g.loyer_ht + g.assurance_ht } : {}) };
  }
  const setDuree = (i: number, k: keyof DureeOffreLLD, v: number) => set("durees", f.durees.map((d, j) => (j === i ? { ...d, [k]: v } : d)));
  const toggleOption = (op: OptionOffreLLD) => set("options", f.options.some((o) => o.libelle === op.libelle) ? f.options.filter((o) => o.libelle !== op.libelle) : [...f.options, op]);
  const setPresta = (i: number, p: Partial<PrestationLLD>) => set("prestations", f.prestations.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const manquants: string[] = [];
  if (!f.client.raison_sociale.trim()) manquants.push("le client");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.client.contact_email || "")) manquants.push("l'email du client (pour lui envoyer la proposition)");
  if (!f.modele.trim()) manquants.push("le modèle");
  if (!f.durees.length || f.durees.some((d) => !(d.mois > 0) || !(d.loyer_ht > 0))) manquants.push("au moins une durée avec un loyer HT");
  if (f.avec_assurance && f.durees.some((d) => !(d.loyer_assurance_ht! > 0))) manquants.push("le loyer avec assurance de chaque durée");
  if (f.courte_duree && f.durees.some((d) => d.mois > 11)) manquants.push("courte durée : 11 mois maximum");
  if (f.transport.mode === "chiffre" && !(f.transport.prix_ht! > 0)) manquants.push("le prix du transport");

  async function enregistrer(puisGenerer: boolean) {
    setErreur("");
    if (manquants.length) return setErreur(`Indiquez ${manquants.join(", ")}.`);
    setEnCours(true);
    try {
      let numero = offre?.numero || "";
      let date = offre?.date || new Date().toISOString();
      let expiration = offre?.date_expiration || "";
      if (offre) { const r = await modifierOffreLLD(offre.numero, f); expiration = r.date_expiration; }
      else { const r = await creerOffreLLD(f); numero = r.numero; date = r.date; expiration = r.date_expiration; }
      if (puisGenerer && cfg) {
        const pdf = genererOffreLldPdf({ ...f, numero, statut: "brouillon", date, date_expiration: expiration }, cfg);
        const r = await genererLienOffreLLD(numero, pdf.base64, pdf.zoneSignature);
        try { await navigator.clipboard.writeText(r.lien); } catch { /* presse-papiers indisponible */ }
        alert(`✅ Offre ${numero} créée, PDF généré.\n\nLien de signature (copié) :\n${r.lien}\n\nEnvoyez-le au client : il choisira sa durée et signera en ligne.`);
      } else {
        alert(`💾 Offre ${numero} enregistrée en brouillon. Générez le PDF et le lien depuis la liste quand elle est prête.`);
      }
      onFermer();
    } catch (e: any) { setErreur(e?.message || "Enregistrement impossible"); }
    finally { setEnCours(false); }
  }
  function apercu() {
    if (!cfg) return;
    const pdf = genererOffreLldPdf({ ...f, numero: offre?.numero || "OF-AAAA-MM-NN", statut: "brouillon", date: offre?.date || new Date().toISOString(), date_expiration: offre?.date_expiration || new Date(Date.now() + f.validite_jours * 86400000).toISOString().slice(0, 10) }, cfg);
    const url = URL.createObjectURL(pdf.blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const radio = (on: boolean, lib: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ flex: "1 1 120px", padding: "9px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `2px solid ${on ? "#1a73e8" : "#ddd"}`, background: on ? "#eef4fd" : "white", color: on ? "#1a73e8" : "#444" }}>{lib}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#1a2a6e" }}>{offre ? `Modifier l'offre ${offre.numero}` : "Nouvelle offre LLD"}</h2>
        <button type="button" style={{ ...BTN2, color: "#555", borderColor: "#ccc" }} onClick={onFermer}>← Retour à la liste</button>
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Client et commercial</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <label style={LABEL}>Client *</label>
            {f.client.raison_sociale ? (
              <div style={{ ...CHAMP, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f9fd" }}>
                <span><b>{f.client.raison_sociale}</b>{f.client.ville ? ` · ${f.client.ville}` : ""}{f.client.contact_nom ? ` · ${f.client.contact_nom}` : ""}</span>
                <button type="button" onClick={() => set("client", { raison_sociale: "" })} style={{ border: "none", background: "transparent", color: "#c0392b", cursor: "pointer" }}>✕</button>
              </div>
            ) : (
              <>
                <input style={CHAMP} value={clientRech} onChange={(e) => setClientRech(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !clientsFiltres.length) { e.preventDefault(); creerClientRapide(); } }} placeholder="Nom de la société du client…" autoFocus />
                {clientsFiltres.length > 0 && (
                  <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, background: "white", border: "1px solid #ccd", borderRadius: 6, boxShadow: "0 6px 18px rgba(0,0,0,.15)" }}>
                    {clientsFiltres.map((c) => <div key={c.id} onMouseDown={(e) => { e.preventDefault(); choisirClient(c); }} style={{ padding: "8px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f2f2f2" }}><b>{c.raison_sociale}</b> <span style={{ color: "#777" }}>{[c.ville, c.siren].filter(Boolean).join(" · ")}{c.sous_tarif ? " · sous tarif" : ""}</span></div>)}
                  </div>
                )}
                {clientRech.trim().length > 1 && !clientsFiltres.length && (
                  <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} disabled={creation} onClick={creerClientRapide}>{creation ? "⏳" : `+ Créer « ${clientRech.trim()} »`}</button>
                    <span style={{ fontSize: 12, color: "#777" }}>Juste le nom : le client complétera SIRET, adresse et contacts en signant la proposition.</span>
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: 10 }}>
              <label style={LABEL}>Email du client * <span style={{ fontWeight: 400, color: "#777" }}>— reçoit la proposition et le lien de signature</span></label>
              <input style={CHAMP} type="email" value={f.client.contact_email || ""} onChange={(e) => set("client", { ...f.client, contact_email: e.target.value.trim() })} placeholder="prenom.nom@societe.fr" />
            </div>
          </div>
          <div>
            <label style={LABEL}>Commercial local</label>
            <select style={CHAMP} value={f.commercial.email} onChange={(e) => { const c = commerciaux.find((x) => x.email === e.target.value); if (c) set("commercial", c); }}>
              {!commerciaux.some((c) => c.email === f.commercial.email) && <option value={f.commercial.email}>{f.commercial.nom}</option>}
              {commerciaux.map((c) => <option key={c.email} value={c.email}>{c.nom}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Matériel et formule</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          <div><label style={LABEL}>Matériel</label><div style={{ display: "flex", gap: 6 }}>{radio(f.materiel === "vo", "Occasion (VO)", () => set("materiel", "vo"))}{radio(f.materiel === "neuf", "Neuf Klubb", () => set("materiel", "neuf"))}</div></div>
          <div><label style={LABEL}>Formule</label><div style={{ display: "flex", gap: 6 }}>{radio(f.full_services, "Full services", () => choisirFormule(true))}{radio(!f.full_services, "Sans entretien", () => choisirFormule(false))}</div></div>
          <div><label style={LABEL}>Durée</label><div style={{ display: "flex", gap: 6 }}>{radio(!f.courte_duree, "Longue durée", () => { set("courte_duree", false); set("durees", [loyerDefaut(36)]); })}{radio(f.courte_duree, "Courte durée (1 à 11 mois)", () => { set("courte_duree", true); set("durees", [loyerDefaut(1)]); })}</div></div>
          <div><label style={LABEL}>Assurance</label><div style={{ display: "flex", gap: 6 }}>{radio(!f.avec_assurance, "Sans", () => set("avec_assurance", false))}{radio(f.avec_assurance, "Loyer sans et avec assurance", () => set("avec_assurance", true))}</div></div>
          <div><label style={LABEL}>Modèle de nacelle * <span style={{ fontWeight: 400, color: "#777" }}>— liste de l'admin ou saisie manuelle (neuf)</span></label><ChampModele style={CHAMP} valeur={f.modele} modeles={cfg?.modeles || []} onChange={(m) => { set("modele", m); }} /></div>
          <div><label style={LABEL}>Quantité (un contrat par nacelle à la signature)</label><input style={CHAMP} type="number" min={1} max={50} value={f.quantite} onChange={(e) => set("quantite", Math.max(1, Number(e.target.value) || 1))} /></div>
        </div>
      </div>

      <div style={CARTE}>
        <div style={{ ...TITRE, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>{f.courte_duree ? "Durées proposées (mois) et loyer HT / mois" : "Durées proposées — une fixe, ou plusieurs au choix du client"} <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— loyers préremplis par la grille, modifiables</span></span>
          <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} onClick={() => { const prochain = f.courte_duree ? Math.min(11, (f.durees[f.durees.length - 1]?.mois || 0) + 1) : (f.durees[f.durees.length - 1]?.mois || 24) + 12; set("durees", [...f.durees, loyerDefaut(prochain)]); }}>+ Ajouter une durée</button>
        </div>
        {f.durees.map((d, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: f.avec_assurance ? "120px 1fr 1fr auto" : "120px 1fr auto", gap: 10, alignItems: "end", padding: "6px 0" }}>
            <div><label style={LABEL}>Mois</label><input style={CHAMP} type="number" min={1} max={f.courte_duree ? 11 : 84} value={d.mois || ""} onChange={(e) => { const m = Number(e.target.value) || 0; const def = loyerDefaut(m); set("durees", f.durees.map((x, j) => (j === i ? { ...def, loyer_ht: x.loyer_ht || def.loyer_ht, ...(x.loyer_assurance_ht ? { loyer_assurance_ht: x.loyer_assurance_ht } : {}) } : x))); }} /></div>
            <div><label style={LABEL}>Loyer HT / mois{f.avec_assurance ? " (sans assurance)" : ""}</label><input style={CHAMP} value={d.loyer_ht || ""} onChange={(e) => setDuree(i, "loyer_ht", num(e.target.value))} /></div>
            {f.avec_assurance && <div><label style={LABEL}>Loyer HT / mois avec assurance</label><input style={CHAMP} value={d.loyer_assurance_ht || ""} onChange={(e) => setDuree(i, "loyer_assurance_ht", num(e.target.value))} /></div>}
            <button type="button" disabled={f.durees.length < 2} onClick={() => set("durees", f.durees.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", color: f.durees.length < 2 ? "#ccc" : "#c0392b", fontSize: 18, cursor: "pointer", padding: "8px 4px" }}>✕</button>
          </div>
        ))}
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Options, transport, kilométrage</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {(cfg?.options || []).map((op) => {
            const on = f.options.some((o) => o.libelle === op.libelle);
            return <button key={op.libelle} type="button" onClick={() => toggleOption(op)} style={{ padding: "8px 12px", borderRadius: 16, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `2px solid ${on ? "#1a73e8" : "#ddd"}`, background: on ? "#eef4fd" : "white", color: on ? "#1a73e8" : "#444" }}>{on ? "☑" : "☐"} {op.libelle} — {eur(op.prix_mensuel_ht)} HT/mois</button>;
          })}
          {!cfg?.options.length && <span style={{ fontSize: 12, color: "#888" }}>Aucune option dans Admin → Paramètres LLD.</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1.6fr", gap: 10, alignItems: "end", marginBottom: 12 }}>
          <div><label style={LABEL}>Transport (livraison)</label><div style={{ display: "flex", gap: 6 }}>{radio(f.transport.mode === "offert", "Offert", () => set("transport", { ...f.transport, mode: "offert", prix_ht: 0 }))}{radio(f.transport.mode === "chiffre", "Chiffré", () => set("transport", { ...f.transport, mode: "chiffre" }))}</div></div>
          <div><label style={LABEL}>Prix HT (une fois)</label><input style={CHAMP} disabled={f.transport.mode !== "chiffre"} value={f.transport.mode === "chiffre" ? f.transport.prix_ht || "" : ""} onChange={(e) => set("transport", { ...f.transport, prix_ht: num(e.target.value) })} /></div>
          <div><label style={LABEL}>Adresse de livraison</label><input style={CHAMP} value={f.transport.adresse || ""} onChange={(e) => set("transport", { ...f.transport, adresse: e.target.value })} placeholder="ex. 3 rue de la Scierie 76530 Grand-Couronne" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div><label style={LABEL}>Kilométrage / an</label><input style={CHAMP} type="number" value={f.km_an || ""} onChange={(e) => set("km_an", Number(e.target.value) || 0)} /></div>
          <div><label style={LABEL}>Heures nacelle</label><input style={CHAMP} value={f.heures} onChange={(e) => set("heures", e.target.value)} /></div>
          <div><label style={LABEL}>Km supplémentaire (€ HT)</label><input style={CHAMP} value={f.prix_km_sup ?? ""} onChange={(e) => set("prix_km_sup", num(e.target.value))} /></div>
          <div><label style={LABEL}>Validité (jours)</label><input style={CHAMP} type="number" min={1} max={180} value={f.validite_jours} onChange={(e) => set("validite_jours", Number(e.target.value) || 30)} /></div>
        </div>
        <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>Caution : 1 mois de loyer TTC, calculée à la signature selon la durée et les options choisies par le client.</div>
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Prestations incluses (page 6 du PDF) <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— préremplies selon la formule, cochez / décochez</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "2px 16px" }}>
          {f.prestations.map((p, i) => p.libelle.startsWith("#")
            ? <div key={i} style={{ gridColumn: "1 / -1", fontWeight: 700, fontSize: 12, color: "#1a2a6e", marginTop: 8 }}>{p.libelle.replace(/^#\s*/, "")}</div>
            : <label key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer", padding: "3px 0" }}><input type="checkbox" checked={p.inclus} onChange={(e) => setPresta(i, { inclus: e.target.checked })} style={{ width: "auto", margin: 0 }} /><span style={{ color: p.inclus ? "#1e7a3c" : "#b3261e", fontWeight: 700, width: 14 }}>{p.inclus ? "✓" : "✗"}</span>{p.libelle}</label>)}
        </div>
      </div>

      <div style={CARTE}>
        <label style={LABEL}>Commentaire (encadré sous l'offre de prix)</label>
        <textarea style={{ ...CHAMP, resize: "vertical" }} rows={3} value={f.commentaire || ""} onChange={(e) => set("commentaire", e.target.value)} />
      </div>

      {erreur && <div style={{ color: "#c0392b", fontWeight: 600 }}>⚠ {erreur}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" onClick={apercu} disabled={!cfg} style={{ ...BTN2, color: "#555", borderColor: "#ccc" }}>👁 Aperçu du PDF</button>
        <button type="button" onClick={() => enregistrer(false)} disabled={enCours} style={BTN2}>{enCours ? "⏳ …" : "💾 Enregistrer en brouillon"}</button>
        <button type="button" onClick={() => enregistrer(true)} disabled={enCours} style={BTN}>{enCours ? "⏳ …" : "📄 Enregistrer, générer le PDF et copier le lien"}</button>
      </div>
    </div>
  );
}
