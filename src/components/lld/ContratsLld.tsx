import { Fragment, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import type { ClientLLD, ConfigLLD, ContratLLD, OptionOffreLLD, TarifNegocieLLD } from "../../types/lld";
import { chargerConfigLLD, ecouterClientsLLD, loyerGrille } from "../../services/lldService";
import { annulerContratLLD, controlerContratLLD, creerContratLLD, desaffecterContratLLD, ecouterContratsLLD, enregistrerPdfContratLLD, genererLienContratLLD, livrerContratLLD, modifierContratLLD, ouvrirPieceContratLLD, type ContratLLDSaisie } from "../../services/contratsLldService";
import { genererContratLldPdf } from "../../utils/generateContratLldPdf";

/**
 * 📑 Contrats LLD (lot 3). Un contrat = une nacelle. Il naît soit d'une offre
 * signée (un brouillon par nacelle, créé par le serveur), soit à la main pour
 * un client « sous tarif ». Jonathan seul crée, modifie, contrôle et génère le
 * PDF (25 pages) ; le contrôle est bloquant : tout doit être vert avant le PDF
 * et l'envoi. Lot 4 : lien personnel de signature (copié, envoyé par Jonathan),
 * page publique client, pièces (CNI, RIB, contrat signé) téléchargeables par
 * Jonathan et les assistantes. Commerciaux : leurs contrats en lecture.
 */
interface Props { userName: string; userEmail: string; peutGerer: boolean; voitTout: boolean }

const CHAMP: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccd", fontSize: 14, fontFamily: "inherit" };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 4 };
const CARTE: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 1px 3px rgba(20,30,60,.08)", padding: 16 };
const TITRE: React.CSSProperties = { fontWeight: 700, color: "#1a2a6e", fontSize: 15, margin: "0 0 10px" };
const BTN: React.CSSProperties = { padding: "9px 14px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const BTN2: React.CSSProperties = { ...BTN, background: "white", color: "#1a73e8", border: "1px solid #1a73e8" };
const PETIT: React.CSSProperties = { padding: "6px 10px", fontSize: 13 };
const eur = (n?: number) => (n || n === 0 ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €" : "—");
const dateFr = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const num = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export const STATUT_CONTRAT: Record<string, { lib: string; bg: string; fg: string }> = {
  brouillon: { lib: "Brouillon", bg: "#eceff3", fg: "#3c4452" }, controle: { lib: "Contrôlé ✓", bg: "#e6effd", fg: "#174ea6" },
  envoye: { lib: "Envoyé / à signer", bg: "#fff3d6", fg: "#7a5400" }, signe: { lib: "Signé — à affecter", bg: "#e3f4e8", fg: "#1e6b35" },
  affecte: { lib: "Nacelle affectée", bg: "#e3f4e8", fg: "#1e6b35" }, en_preparation: { lib: "En préparation", bg: "#e6effd", fg: "#174ea6" },
  livre: { lib: "Livré", bg: "#e3f4e8", fg: "#1e6b35" }, annule: { lib: "Annulé", bg: "#eceff3", fg: "#6b7280" },
};

interface Commercial { nom: string; email: string; tel?: string }

export default function ContratsLld({ userName, userEmail, peutGerer, voitTout }: Props) {
  const [contrats, setContrats] = useState<ContratLLD[]>([]);
  const [clients, setClients] = useState<ClientLLD[]>([]);
  const [cfg, setCfg] = useState<ConfigLLD | null>(null);
  const [commerciaux, setCommerciaux] = useState<Commercial[]>([]);
  const [edition, setEdition] = useState<ContratLLD | "nouveau" | null>(null);
  const [filtre, setFiltre] = useState("");
  const [enCours, setEnCours] = useState("");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    const s1 = ecouterContratsLLD(setContrats);
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
    const moi = userEmail.toLowerCase();
    return contrats
      .filter((c) => peutGerer || voitTout || (c.commercial?.email || "").toLowerCase() === moi)
      .filter((c) => !q || c.numero.toLowerCase().includes(q) || c.client.raison_sociale.toLowerCase().includes(q) || c.modele.toLowerCase().includes(q) || (c.immat || "").toLowerCase().includes(q) || (c.offre_numero || "").toLowerCase().includes(q));
  }, [contrats, filtre, peutGerer, voitTout, userEmail]);

  async function controler(c: ContratLLD) {
    setEnCours(c.numero);
    try {
      const r = await controlerContratLLD(c.numero);
      setDetail(c.numero);
      if (r.ok) alert(`✅ Contrat ${c.numero} : contrôle validé${r.avertissements.length ? `\n\nAvertissements :\n- ${r.avertissements.join("\n- ")}` : ""}.\n\nVous pouvez générer le PDF.`);
      else alert(`⛔ Contrat ${c.numero} : ${r.erreurs.length} point(s) bloquant(s)\n\n- ${r.erreurs.join("\n- ")}${r.avertissements.length ? `\n\nAvertissements :\n- ${r.avertissements.join("\n- ")}` : ""}`);
    } catch (e: any) { alert(`❌ ${e?.message || "Contrôle impossible"}`); }
    finally { setEnCours(""); }
  }
  async function genererPdf(c: ContratLLD) {
    if (!cfg) return;
    setEnCours(c.numero);
    try {
      const pdf = genererContratLldPdf(c, cfg);
      await enregistrerPdfContratLLD(c.numero, pdf.base64, pdf.zoneSignature, pdf.champs);
      alert(`✅ Contrat ${c.numero} : PDF généré (${pdf.pages} pages) et archivé. Créez maintenant le lien de signature (🔗) et envoyez-le au client.`);
    } catch (e: any) { alert(`❌ ${e?.message || "Génération impossible"}`); }
    finally { setEnCours(""); }
  }
  function apercu(c: ContratLLD) {
    if (!cfg) return;
    const pdf = genererContratLldPdf(c, cfg);
    const url = URL.createObjectURL(pdf.blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  async function lien(c: ContratLLD) {
    setEnCours(c.numero);
    try {
      const r = await genererLienContratLLD(c.numero);
      try { await navigator.clipboard.writeText(r.lien); } catch { window.prompt("Copiez le lien :", r.lien); }
      alert(`🔗 Lien de signature du contrat ${c.numero} copié dans le presse-papiers :\n\n${r.lien}\n\nEnvoyez-le vous-même au client. Il remplira sa fiche locataire et son mandat SEPA, acceptera les CG${c.nouveau_client !== false ? ", déposera CNI + RIB" : ""} et signera en ligne.`);
    } catch (e: any) { alert(`❌ ${e?.message || "Lien impossible"}`); }
    finally { setEnCours(""); }
  }
  async function piece(c: ContratLLD, p: "cni" | "rib" | "contrat") {
    try { await ouvrirPieceContratLLD(c.numero, p); } catch (e: any) { alert(`❌ ${e?.message || "Pièce introuvable"}`); }
  }
  async function livrer(c: ContratLLD) {
    const d = window.prompt(`Date de livraison de ${c.immat || "la nacelle"} au client ${c.client.raison_sociale} (AAAA-MM-JJ) :`, new Date().toISOString().slice(0, 10));
    if (d === null) return;
    try { await livrerContratLLD(c.numero, d); } catch (e: any) { alert(`❌ ${e?.message}`); }
  }
  async function desaffecter(c: ContratLLD) {
    const motif = window.prompt(`Retirer ${c.immat || "la nacelle"} du contrat ${c.numero} ? Le contrat repasse « à affecter » ; pensez à remettre la machine en disponible dans En préparation. Motif :`);
    if (motif === null) return;
    try { await desaffecterContratLLD(c.numero, motif); } catch (e: any) { alert(`❌ ${e?.message}`); }
  }
  async function annuler(c: ContratLLD) {
    const motif = window.prompt(`Annuler le contrat ${c.numero} ? Motif (facultatif) :`);
    if (motif === null) return;
    try { await annulerContratLLD(c.numero, motif); } catch (e: any) { alert(`❌ ${e?.message}`); }
  }

  if (edition) {
    return <ContratForm contrat={edition === "nouveau" ? null : edition} cfg={cfg} clients={clients} commerciaux={commerciaux} userName={userName} userEmail={userEmail} onFermer={() => setEdition(null)} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Rechercher : n°, client, modèle, immat, offre…" style={{ ...CHAMP, maxWidth: 360 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#777" }}>Les contrats issus d'une offre signée arrivent ici automatiquement (un par nacelle).</span>
          {peutGerer && <button type="button" style={BTN} onClick={() => setEdition("nouveau")}>+ Contrat client sous tarif</button>}
        </div>
      </div>
      <div style={{ ...CARTE, padding: 0, overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <thead><tr style={{ background: "#f7f9fc", textAlign: "left" }}>{["N°", "Client", "Nacelle", "Durée / loyer", "Commercial", "Origine", "Statut", ""].map((h) => <th key={h} style={{ padding: "10px 12px", fontSize: 12, color: "#5b6575", textTransform: "uppercase", letterSpacing: ".04em" }}>{h}</th>)}</tr></thead>
          <tbody>
            {liste.map((c) => {
              const st = STATUT_CONTRAT[c.statut] || STATUT_CONTRAT.brouillon;
              const modifiable = peutGerer && (c.statut === "brouillon" || c.statut === "controle");
              const envoyable = peutGerer && c.controle?.ok && !!c.pdf_url && (c.statut === "controle" || c.statut === "envoye");
              const signe = ["signe", "affecte", "en_preparation", "livre"].includes(c.statut);
              const ctrl = c.controle;
              return (
                <Fragment key={c.numero}>
                  <tr style={{ borderTop: "1px solid #edf0f5" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, whiteSpace: "nowrap" }}>{c.numero}</td>
                    <td style={{ padding: "10px 12px" }}>{c.client.raison_sociale}<div style={{ fontSize: 12, color: "#777" }}>{c.client.ville || ""}</div></td>
                    <td style={{ padding: "10px 12px" }}>{c.modele}{c.immat ? <b> · {c.immat}</b> : <span style={{ color: "#999" }}> · immat à affecter</span>}<div style={{ fontSize: 12, color: "#777" }}>{c.materiel === "neuf" ? "Neuf" : "VO"} · {c.full_services ? "Full services" : "Sans entretien"}{c.assurance ? " · assurance" : ""}</div></td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}><b>{c.duree_mois} mois</b> — {eur(c.total_mensuel_ht)} HT<div style={{ fontSize: 12, color: "#777" }}>caution {eur(c.caution_ttc)} TTC</div></td>
                    <td style={{ padding: "10px 12px" }}>{c.commercial?.nom}</td>
                    <td style={{ padding: "10px 12px", fontSize: 13 }}>{c.offre_numero ? <>Offre {c.offre_numero}{c.rang_total && c.rang_total > 1 ? ` (${c.rang}/${c.rang_total})` : ""}</> : <span style={{ color: "#8a5a00" }}>Client sous tarif</span>}<div style={{ fontSize: 12, color: "#777" }}>{dateFr(c.date)}</div></td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ display: "inline-block", borderRadius: 12, padding: "3px 10px", fontSize: 12, fontWeight: 700, background: st.bg, color: st.fg }}>{st.lib}</span>
                      {ctrl && !ctrl.ok && <div style={{ fontSize: 12, color: "#b3261e", marginTop: 4 }}>⛔ {ctrl.erreurs.length} bloquant(s)</div>}
                      {ctrl && ctrl.ok && ctrl.avertissements.length > 0 && <div style={{ fontSize: 12, color: "#8a5a00", marginTop: 4 }}>⚠ {ctrl.avertissements.length} avertissement(s)</div>}
                    </td>
                    <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {modifiable && <button type="button" style={{ ...BTN2, ...PETIT }} disabled={enCours === c.numero} onClick={() => controler(c)} title="Vérifie SIRET, montants, cohérence avec l'offre ou le tarif, immat">{enCours === c.numero ? "⏳" : "🔒 Contrôler"}</button>}
                        {modifiable && c.controle?.ok && <button type="button" style={{ ...BTN, ...PETIT }} disabled={enCours === c.numero} onClick={() => genererPdf(c)}>{c.pdf_url ? "📄 Régénérer le PDF" : "📄 Générer le PDF"}</button>}
                        {envoyable && <button type="button" style={{ ...BTN, ...PETIT, background: c.statut === "envoye" ? "#5f6b7a" : "#1a73e8" }} disabled={enCours === c.numero} onClick={() => lien(c)} title="Crée le lien personnel de signature et le copie">{c.statut === "envoye" ? "🔗 Recopier le lien" : "🔗 Lien de signature"}</button>}
                        {voitTout && c.pieces?.cni && <button type="button" style={{ ...BTN2, ...PETIT }} onClick={() => piece(c, "cni")}>🪪 CNI</button>}
                        {voitTout && c.pieces?.rib && <button type="button" style={{ ...BTN2, ...PETIT }} onClick={() => piece(c, "rib")}>🏦 RIB</button>}
                        {signe && c.signature?.nom && <span style={{ fontSize: 12, color: "#1e6b35", alignSelf: "center" }}>signé par {c.signature.nom} le {dateFr(c.signe_le)}{c.affecte_le ? ` · ${c.immat} affectée le ${dateFr(c.affecte_le)}` : ""}{c.livre_le ? ` · livré le ${dateFr(c.livre_le)}` : ""}</span>}
                        {voitTout && (c.statut === "affecte" || c.statut === "en_preparation") && <button type="button" style={{ ...BTN, ...PETIT, background: "#1e8e3e" }} onClick={() => livrer(c)}>✓ Livré</button>}
                        {voitTout && (c.statut === "affecte" || c.statut === "en_preparation") && <button type="button" style={{ ...BTN2, ...PETIT, color: "#8a5a00", borderColor: "#e0b45c" }} onClick={() => desaffecter(c)} title="Retirer la nacelle du contrat">↩</button>}
                        {peutGerer && <button type="button" style={{ ...BTN2, ...PETIT }} onClick={() => apercu(c)} disabled={!cfg}>👁 Aperçu</button>}
                        {c.pdf_url && <a href={c.pdf_url} target="_blank" rel="noopener noreferrer" style={{ ...BTN2, ...PETIT, textDecoration: "none" }}>⬇ Contrat PDF</a>}
                        {c.pdf_signe_url && <a href={c.pdf_signe_url} target="_blank" rel="noopener noreferrer" style={{ ...BTN2, ...PETIT, textDecoration: "none", background: "#e3f4e8", color: "#1e6b35", borderColor: "#1e6b35" }}>✍️ Contrat signé</a>}
                        {ctrl && <button type="button" style={{ ...BTN2, ...PETIT, color: "#555", borderColor: "#ccc" }} onClick={() => setDetail(detail === c.numero ? "" : c.numero)}>{detail === c.numero ? "▲" : "▼ contrôle"}</button>}
                        {modifiable && <button type="button" style={{ ...BTN2, ...PETIT, color: "#555", borderColor: "#ccc" }} onClick={() => setEdition(c)} title="Modifier (le contrôle et le PDF seront à refaire)">✏️</button>}
                        {(modifiable || (peutGerer && c.statut === "envoye")) && <button type="button" style={{ ...BTN2, ...PETIT, color: "#b3261e", borderColor: "#b3261e" }} onClick={() => annuler(c)} title="Annuler le contrat">✕</button>}
                      </div>
                    </td>
                  </tr>
                  {ctrl && detail === c.numero && (
                    <tr style={{ background: ctrl.ok ? "#f4fbf6" : "#fdf3f2" }}>
                      <td colSpan={8} style={{ padding: "10px 16px", fontSize: 13 }}>
                        <b>{ctrl.ok ? "✅ Contrôle validé" : "⛔ Contrôle bloquant"}</b> <span style={{ color: "#777" }}>— {dateFr(ctrl.le)} {ctrl.par ? `par ${ctrl.par}` : ""}</span>
                        {ctrl.erreurs.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 20, color: "#b3261e" }}>{ctrl.erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                        {ctrl.avertissements.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 20, color: "#8a5a00" }}>{ctrl.avertissements.map((e, i) => <li key={i}>⚠ {e}</li>)}</ul>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!liste.length && <tr><td colSpan={8} style={{ padding: 16, color: "#888" }}>Aucun contrat{filtre ? " ne correspond" : " pour l'instant"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────── Formulaire (création manuelle / modification) ─────────────────────────

function clientDepuisFiche(c: ClientLLD): ContratLLDSaisie["client"] {
  return {
    raison_sociale: c.raison_sociale, siren: c.siren, siret: c.siret, adresse: c.adresse, cp: c.cp, ville: c.ville, tva_intra: c.tva_intra, naf: c.naf, telephone: c.telephone, fax: c.fax, email: c.email,
    contact_nom: c.signataire?.nom || "", contact_email: c.signataire?.email || "", contact_tel: c.signataire?.tel || "",
    facturation_societe: c.facturation_societe, facturation_email: c.facturation_email, facturation_adresse: c.facturation_adresse,
    contact_compta: c.contact_compta, contact_maintenance: c.contact_maintenance, commande_obligatoire: c.commande_obligatoire, contact_commande: c.contact_commande,
  };
}
/** « libellé = prix ; libellé = prix » → options */
function optionsDepuisTexte(t?: string): OptionOffreLLD[] {
  return (t || "").split(/[;\n]/).map((s) => s.trim()).filter(Boolean).map((s) => { const [lib, prix] = s.split("="); return { libelle: (lib || "").trim(), prix_mensuel_ht: num(prix || "0") }; }).filter((o) => o.libelle);
}

function ContratForm({ contrat, cfg, clients, commerciaux, userName, userEmail, onFermer }: { contrat: ContratLLD | null; cfg: ConfigLLD | null; clients: ClientLLD[]; commerciaux: Commercial[]; userName: string; userEmail: string; onFermer: () => void }) {
  const base = (): ContratLLDSaisie => contrat ? {
    client_id: contrat.client_id, client: contrat.client, commercial: contrat.commercial, full_services: contrat.full_services, materiel: contrat.materiel, modele: contrat.modele, immat: contrat.immat || "",
    duree_mois: contrat.duree_mois, loyer_ht: contrat.loyer_ht, assurance: contrat.assurance, assurance_ht: contrat.assurance_ht, options: contrat.options, km_an: contrat.km_an, prix_km_sup: contrat.prix_km_sup,
    transport: contrat.transport, date_livraison_souhaitee: contrat.date_livraison_souhaitee || "", jour_prelevement: contrat.jour_prelevement, caution_ttc: contrat.caution_ttc,
  } : {
    client_id: undefined, client: { raison_sociale: "" }, commercial: { nom: userName, email: userEmail }, full_services: true, materiel: "vo", modele: cfg?.modeles[0] || "", immat: "",
    duree_mois: 36, loyer_ht: 0, assurance: false, assurance_ht: 0, options: [], km_an: cfg?.km_an_defaut || 30000, prix_km_sup: cfg?.prix_km_sup_defaut || 0.18,
    transport: { mode: "offert", adresse: "" }, date_livraison_souhaitee: "", jour_prelevement: cfg?.sepa.jour_prelevement || 20, caution_ttc: 0,
  };
  const [f, setF] = useState<ContratLLDSaisie>(base);
  const [clientRech, setClientRech] = useState("");
  const [optionLibre, setOptionLibre] = useState({ libelle: "", prix: "" });
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  useEffect(() => { if (!contrat && cfg) setF(base()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [cfg]);
  const set = <K extends keyof ContratLLDSaisie>(k: K, v: ContratLLDSaisie[K]) => setF((x) => ({ ...x, [k]: v }));

  const clientChoisi = useMemo(() => clients.find((c) => c.id === f.client_id), [clients, f.client_id]);
  const tarifs = useMemo(() => (clientChoisi?.tarifs_negocies || []).filter((t) => !t.fin || t.fin >= new Date().toISOString().slice(0, 10)), [clientChoisi]);
  const clientsFiltres = useMemo(() => {
    const q = clientRech.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => c.raison_sociale.toLowerCase().includes(q) || (c.siren || "").includes(q)).sort((a, b) => Number(!!b.sous_tarif) - Number(!!a.sous_tarif)).slice(0, 8);
  }, [clients, clientRech]);

  function choisirClient(c: ClientLLD) { setF((x) => ({ ...x, client_id: c.id, client: clientDepuisFiche(c) })); setClientRech(""); }
  /** Tarif négocié du client → préremplit tout le volet financier */
  function appliquerTarif(t: TarifNegocieLLD) {
    const g = cfg ? loyerGrille(cfg, t.modele, t.duree_mois, f.materiel === "neuf") : undefined;
    setF((x) => ({ ...x, modele: t.modele, duree_mois: t.duree_mois, loyer_ht: t.loyer_ht, full_services: t.full_services, km_an: t.km_an || x.km_an, prix_km_sup: t.prix_km_sup ?? x.prix_km_sup, caution_ttc: t.caution_ttc || 0, options: t.options ? optionsDepuisTexte(t.options) : x.options, assurance_ht: g?.assurance_ht || x.assurance_ht }));
  }
  /** Grille (modèle × durée × neuf/VO) → loyer et assurance par défaut */
  function appliquerGrille(modele = f.modele, duree = f.duree_mois, neuf = f.materiel === "neuf") {
    if (!cfg) return;
    const g = loyerGrille(cfg, modele, duree, neuf);
    if (g) setF((x) => ({ ...x, loyer_ht: g.loyer_ht, assurance_ht: g.assurance_ht || x.assurance_ht }));
  }
  const toggleOption = (op: OptionOffreLLD) => set("options", f.options.some((o) => o.libelle === op.libelle) ? f.options.filter((o) => o.libelle !== op.libelle) : [...f.options, op]);

  const totalHt = r2(f.loyer_ht + (f.assurance ? f.assurance_ht : 0) + f.options.reduce((s, o) => s + o.prix_mensuel_ht, 0));
  const tva = r2(totalHt * 0.2), ttc = r2(totalHt + tva);
  const cautionDefaut = ttc;

  const manquants: string[] = [];
  if (!f.client.raison_sociale.trim()) manquants.push("le client");
  if (!f.modele.trim()) manquants.push("le modèle");
  if (!(f.duree_mois > 0)) manquants.push("la durée");
  if (!(f.loyer_ht > 0)) manquants.push("le loyer HT");
  if (f.assurance && !(f.assurance_ht > 0)) manquants.push("le montant de l'assurance");
  if (f.transport.mode === "chiffre" && !(f.transport.prix_ht! > 0)) manquants.push("le prix du transport");

  async function enregistrer() {
    setErreur("");
    if (manquants.length) return setErreur(`Indiquez ${manquants.join(", ")}.`);
    setEnCours(true);
    try {
      const donnees = { ...f, caution_ttc: f.caution_ttc && f.caution_ttc > 0 ? f.caution_ttc : cautionDefaut };
      if (contrat) { await modifierContratLLD(contrat.numero, donnees); alert(`💾 Contrat ${contrat.numero} modifié : relancez le contrôle puis le PDF.`); }
      else { const r = await creerContratLLD(donnees); alert(`✅ Contrat ${r.numero} créé en brouillon. Lancez le contrôle depuis la liste.`); }
      onFermer();
    } catch (e: any) { setErreur(e?.message || "Enregistrement impossible"); }
    finally { setEnCours(false); }
  }
  function apercu() {
    if (!cfg) return;
    const c: ContratLLD = { ...f, numero: contrat?.numero || "DSAAAALD-MM-NN", statut: "brouillon", date: contrat?.date || new Date().toISOString(), total_mensuel_ht: totalHt, tva_ht: tva, total_mensuel_ttc: ttc, caution_ttc: f.caution_ttc || cautionDefaut, cg_version: contrat?.cg_version || cfg.textes_contrat?.cg_version || "" };
    const pdf = genererContratLldPdf(c, cfg);
    const url = URL.createObjectURL(pdf.blob); window.open(url, "_blank"); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  const radio = (on: boolean, lib: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ flex: "1 1 120px", padding: "9px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 700, border: `2px solid ${on ? "#1a73e8" : "#ddd"}`, background: on ? "#eef4fd" : "white", color: on ? "#1a2a6e" : "#555" }}>{lib}</button>
  );
  const depuisOffre = !!contrat?.offre_numero;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#1a2a6e" }}>{contrat ? `Modifier le contrat ${contrat.numero}` : "Nouveau contrat — client sous tarif"}</h2>
        <button type="button" style={{ ...BTN2, color: "#555", borderColor: "#ccc" }} onClick={onFermer}>← Retour à la liste</button>
      </div>
      {depuisOffre && <div style={{ ...CARTE, background: "#fff8e6", fontSize: 13 }}>Ce contrat vient de l'offre signée <b>{contrat!.offre_numero}</b> ({contrat!.rang}/{contrat!.rang_total}). Le contrôle vérifie qu'il reste cohérent avec l'offre (durée, loyer, assurance, modèle, formule).</div>}

      <div style={CARTE}>
        <div style={TITRE}>Client et commercial</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <label style={LABEL}>Client (mémoire client) *</label>
            {f.client.raison_sociale ? (
              <div style={{ ...CHAMP, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f5f9fd" }}>
                <span><b>{f.client.raison_sociale}</b>{f.client.ville ? ` · ${f.client.ville}` : ""}{f.client.siret ? ` · SIRET ${f.client.siret}` : f.client.siren ? ` · SIREN ${f.client.siren}` : ""}{clientChoisi?.sous_tarif ? " · sous tarif" : ""}</span>
                {!depuisOffre && <button type="button" onClick={() => setF((x) => ({ ...x, client_id: undefined, client: { raison_sociale: "" } }))} style={{ border: "none", background: "transparent", color: "#c0392b", cursor: "pointer" }}>✕</button>}
              </div>
            ) : (
              <>
                <input style={CHAMP} value={clientRech} onChange={(e) => setClientRech(e.target.value)} placeholder="Tapez le nom ou le SIREN du client (créé dans LLD → Clients)…" autoFocus />
                {clientsFiltres.length > 0 && (
                  <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, background: "white", border: "1px solid #ccd", borderRadius: 6, boxShadow: "0 6px 18px rgba(0,0,0,.15)" }}>
                    {clientsFiltres.map((c) => <div key={c.id} onMouseDown={(e) => { e.preventDefault(); choisirClient(c); }} style={{ padding: "8px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f2f2f2" }}><b>{c.raison_sociale}</b>{c.ville ? ` · ${c.ville}` : ""}{c.sous_tarif ? <span style={{ color: "#8a5a00" }}> · sous tarif</span> : ""}</div>)}
                  </div>
                )}
                {clientRech.length > 1 && !clientsFiltres.length && <div style={{ fontSize: 12, color: "#8a5a00", marginTop: 4 }}>Aucun client : créez-le d'abord dans LLD → Clients.</div>}
              </>
            )}
            {tarifs.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label style={LABEL}>Tarifs négociés du client — cliquez pour préremplir</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tarifs.map((t, i) => <button key={i} type="button" onClick={() => appliquerTarif(t)} style={{ ...BTN2, ...PETIT, background: "#fff8e6", borderColor: "#e0b45c", color: "#6b4a00" }}>{t.modele} · {t.duree_mois} mois · {eur(t.loyer_ht)} HT · {t.full_services ? "full" : "sans entretien"}{t.fin ? ` (jusqu'au ${dateFr(t.fin)})` : ""}</button>)}
                </div>
              </div>
            )}
          </div>
          <div>
            <label style={LABEL}>Commercial local</label>
            <select style={CHAMP} value={f.commercial.email} onChange={(e) => { const c = commerciaux.find((x) => x.email === e.target.value); if (c) set("commercial", c); }}>
              {!commerciaux.some((c) => c.email === f.commercial.email) && <option value={f.commercial.email}>{f.commercial.nom}</option>}
              {commerciaux.map((c) => <option key={c.email} value={c.email}>{c.nom}</option>)}
            </select>
            <div style={{ fontSize: 12, color: "#777", marginTop: 8 }}>La fiche locataire (p. 16-17) est préremplie depuis la mémoire client ; le client la complète à la signature.</div>
          </div>
        </div>
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Nacelle et formule</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <div><label style={LABEL}>Matériel</label><div style={{ display: "flex", gap: 6 }}>{radio(f.materiel === "vo", "Occasion (VO) · rétrofité", () => { set("materiel", "vo"); appliquerGrille(f.modele, f.duree_mois, false); })}{radio(f.materiel === "neuf", "Neuf Klubb", () => { set("materiel", "neuf"); appliquerGrille(f.modele, f.duree_mois, true); })}</div></div>
          <div><label style={LABEL}>Formule</label><div style={{ display: "flex", gap: 6 }}>{radio(f.full_services, "Full services", () => set("full_services", true))}{radio(!f.full_services, "Sans entretien", () => set("full_services", false))}</div></div>
          <div><label style={LABEL}>Modèle de nacelle *</label><select style={CHAMP} value={f.modele} onChange={(e) => { set("modele", e.target.value); appliquerGrille(e.target.value); }}>{(cfg?.modeles || []).map((m) => <option key={m} value={m}>{m}</option>)}{f.modele && !(cfg?.modeles || []).includes(f.modele) && <option value={f.modele}>{f.modele}</option>}</select></div>
          <div><label style={LABEL}>Immatriculation (si la nacelle est déjà choisie)</label><input style={CHAMP} value={f.immat || ""} onChange={(e) => set("immat", e.target.value.toUpperCase())} placeholder="Sinon, affectée après signature" /></div>
        </div>
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Conditions financières <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— loyer prérempli par la grille ou le tarif négocié</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
          <div><label style={LABEL}>Durée (mois) *</label><input style={CHAMP} type="number" min={1} max={84} value={f.duree_mois || ""} onChange={(e) => { const m = Number(e.target.value) || 0; set("duree_mois", m); appliquerGrille(f.modele, m); }} /></div>
          <div><label style={LABEL}>Loyer mensuel HT *</label><input style={CHAMP} value={f.loyer_ht || ""} onChange={(e) => set("loyer_ht", num(e.target.value))} /></div>
          <div><label style={LABEL}>Assurance tout risque</label><div style={{ display: "flex", gap: 6 }}>{radio(!f.assurance, "Non", () => set("assurance", false))}{radio(f.assurance, "Oui", () => set("assurance", true))}</div></div>
          <div><label style={LABEL}>Assurance HT / mois</label><input style={CHAMP} disabled={!f.assurance} value={f.assurance ? f.assurance_ht || "" : ""} onChange={(e) => set("assurance_ht", num(e.target.value))} /></div>
          <div><label style={LABEL}>Kilométrage / an</label><input style={CHAMP} type="number" value={f.km_an || ""} onChange={(e) => set("km_an", Number(e.target.value) || 0)} /></div>
          <div><label style={LABEL}>Km supplémentaire (€ HT)</label><input style={CHAMP} value={f.prix_km_sup ?? ""} onChange={(e) => set("prix_km_sup", num(e.target.value))} /></div>
          <div><label style={LABEL}>Prélèvement le (jour du mois)</label><input style={CHAMP} type="number" min={1} max={28} value={f.jour_prelevement} onChange={(e) => set("jour_prelevement", Number(e.target.value) || 20)} /></div>
          <div><label style={LABEL}>Date de livraison souhaitée</label><input style={CHAMP} type="date" value={f.date_livraison_souhaitee || ""} onChange={(e) => set("date_livraison_souhaitee", e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label style={LABEL}>Options mensuelles</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {(cfg?.options || []).map((op) => {
              const on = f.options.some((o) => o.libelle === op.libelle);
              return <button key={op.libelle} type="button" onClick={() => toggleOption(op)} style={{ padding: "8px 12px", borderRadius: 16, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `2px solid ${on ? "#1a73e8" : "#ddd"}`, background: on ? "#eef4fd" : "white", color: on ? "#1a2a6e" : "#555" }}>{on ? "✓ " : ""}{op.libelle} · {eur(op.prix_mensuel_ht)}</button>;
            })}
            {f.options.filter((o) => !(cfg?.options || []).some((x) => x.libelle === o.libelle)).map((o) => (
              <button key={o.libelle} type="button" onClick={() => toggleOption(o)} style={{ padding: "8px 12px", borderRadius: 16, cursor: "pointer", fontSize: 13, fontWeight: 600, border: "2px solid #1a73e8", background: "#eef4fd", color: "#1a2a6e" }}>✓ {o.libelle} · {eur(o.prix_mensuel_ht)}</button>
            ))}
            <input style={{ ...CHAMP, width: 200 }} placeholder="Autre option…" value={optionLibre.libelle} onChange={(e) => setOptionLibre({ ...optionLibre, libelle: e.target.value })} />
            <input style={{ ...CHAMP, width: 90 }} placeholder="€ HT" value={optionLibre.prix} onChange={(e) => setOptionLibre({ ...optionLibre, prix: e.target.value })} />
            <button type="button" style={{ ...BTN2, ...PETIT }} disabled={!optionLibre.libelle.trim()} onClick={() => { toggleOption({ libelle: optionLibre.libelle.trim(), prix_mensuel_ht: num(optionLibre.prix) }); setOptionLibre({ libelle: "", prix: "" }); }}>+ Ajouter</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1.6fr", gap: 10, alignItems: "end", marginTop: 14 }}>
          <div><label style={LABEL}>Transport (livraison)</label><div style={{ display: "flex", gap: 6 }}>{radio(f.transport.mode === "offert", "Offert", () => set("transport", { ...f.transport, mode: "offert", prix_ht: 0 }))}{radio(f.transport.mode === "chiffre", "Chiffré", () => set("transport", { ...f.transport, mode: "chiffre" }))}</div></div>
          <div><label style={LABEL}>Prix HT (une fois)</label><input style={CHAMP} disabled={f.transport.mode !== "chiffre"} value={f.transport.mode === "chiffre" ? f.transport.prix_ht || "" : ""} onChange={(e) => set("transport", { ...f.transport, prix_ht: num(e.target.value) })} /></div>
          <div><label style={LABEL}>Adresse de livraison</label><input style={CHAMP} value={f.transport.adresse || ""} onChange={(e) => set("transport", { ...f.transport, adresse: e.target.value })} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 14, padding: 12, background: "#f7f9fc", borderRadius: 8, fontSize: 13 }}>
          <div>Total mensuel HT<br /><b style={{ fontSize: 16 }}>{eur(totalHt)}</b></div>
          <div>TVA 20 %<br /><b>{eur(tva)}</b></div>
          <div>Loyer mensuel TTC<br /><b style={{ fontSize: 16 }}>{eur(ttc)}</b></div>
          <div><label style={LABEL}>Caution TTC (1 mois par défaut)</label><input style={CHAMP} value={f.caution_ttc || ""} placeholder={eur(cautionDefaut)} onChange={(e) => set("caution_ttc", num(e.target.value))} />{f.caution_ttc && Math.abs(f.caution_ttc - cautionDefaut) > 1 ? <div style={{ fontSize: 11, color: "#8a5a00" }}>≠ 1 loyer TTC : le contrôle le signalera.</div> : null}</div>
        </div>
      </div>

      {erreur && <div style={{ color: "#c0392b", fontWeight: 600 }}>⚠ {erreur}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" onClick={apercu} disabled={!cfg} style={{ ...BTN2, color: "#555", borderColor: "#ccc" }}>👁 Aperçu du PDF</button>
        <button type="button" onClick={enregistrer} disabled={enCours} style={BTN}>{enCours ? "⏳ …" : contrat ? "💾 Enregistrer les modifications" : "💾 Créer le contrat (brouillon)"}</button>
      </div>
    </div>
  );
}
