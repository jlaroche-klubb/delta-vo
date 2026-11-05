import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import SignaturePad, { type SignaturePadHandle } from "../components/SignaturePad";
import { CG_LLD_DEFAUT } from "../data/contratLldTextes";
import { bicValide, ibanValide } from "../services/lldService";
import { deposerPiecePublique, lireContratPublique, signerContratPublique, type ContratPublic, type SignatureContratSaisie } from "../services/contratsLldService";

/**
 * ✍️ Page PUBLIQUE de signature d'un CONTRAT LLD : /contrat-lld/{numero}/{jeton}.
 * Remplace DocuSign : le client relit le contrat (PDF), remplit ou vérifie sa
 * fiche locataire et son mandat SEPA, lit et accepte les conditions générales,
 * dépose CNI + RIB (obligatoires pour un nouveau client), signe au doigt.
 * Le serveur imprime ses données dans les pages SEPA / fiche locataire, appose
 * la signature et le certificat, et lui envoie le contrat signé.
 */
const BLEU = "#1f4282";
const VERT = "#1e8e3e";
const ROUGE = "#c0392b";
const eur = (n?: number) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dateFr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const emailOk = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const telOk = (t: string) => !t || t.replace(/\D/g, "").length >= 9;
const siretOk = (s: string) => s.replace(/\D/g, "").length === 14;

type Fiche = SignatureContratSaisie["fiche"];
type Sepa = SignatureContratSaisie["sepa"];
type Contact = { nom: string; fonction: string; email: string; tel: string };
const contact = (c?: { nom?: string; fonction?: string; email?: string; tel?: string } | null): Contact => ({ nom: c?.nom || "", fonction: c?.fonction || "", email: c?.email || "", tel: c?.tel || "" });

/** Image → JPEG ≤ 1800 px (base64) ; PDF tel quel (≤ 3 Mo) */
async function preparerFichier(f: File): Promise<{ base64: string; content_type: string; nom: string }> {
  if (f.type === "application/pdf") {
    if (f.size > 3_000_000) throw new Error("PDF trop lourd (3 Mo maximum)");
    const b64 = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = () => ko(new Error("lecture")); r.readAsDataURL(f); });
    return { base64: b64, content_type: "application/pdf", nom: f.name };
  }
  if (!/^image\/(jpeg|png|heic|heif|webp)$/i.test(f.type) && !/\.(jpe?g|png|heic|webp)$/i.test(f.name)) throw new Error("Format accepté : photo (JPG, PNG) ou PDF");
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("Image illisible (si HEIC, prenez une capture ou exportez en JPG)")); i.src = url; });
    const k = Math.min(1, 1800 / Math.max(img.width, img.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return { base64: cv.toDataURL("image/jpeg", 0.82).split(",")[1], content_type: "image/jpeg", nom: f.name.replace(/\.[^.]+$/, "") + ".jpg" };
  } finally { URL.revokeObjectURL(url); }
}

export default function SignerContratPage() {
  const { numero = "", jeton = "" } = useParams<{ numero: string; jeton: string }>();
  const [etat, setEtat] = useState<"charge" | "invalide" | "ok">("charge");
  const [c, setC] = useState<ContratPublic | null>(null);
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [compta, setCompta] = useState<Contact>(contact());
  const [maint, setMaint] = useState<Contact>(contact());
  const [cmd, setCmd] = useState<Contact>(contact());
  const [cmdOblig, setCmdOblig] = useState<boolean | null>(null);
  const [sepa, setSepa] = useState<Sepa>({ titulaire: "", adresse_titulaire: "", cp: "", ville: "", iban: "", bic: "", lieu: "" });
  const [sepaMemeAdresse, setSepaMemeAdresse] = useState(true);
  const [nom, setNom] = useState(""); const [fonction, setFonction] = useState(""); const [email, setEmail] = useState(""); const [tel, setTel] = useState("");
  const [cgLues, setCgLues] = useState(false); const [cgOuvertes, setCgOuvertes] = useState(false);
  const [pieces, setPieces] = useState<{ cni: boolean; rib: boolean }>({ cni: false, rib: false });
  const [envoiPiece, setEnvoiPiece] = useState<"" | "cni" | "rib">("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const pad = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    document.title = "Delta Services — contrat de location";
    lireContratPublique(numero, jeton).then((d) => {
      setC(d); setEtat("ok");
      const cl = d.client;
      setFiche({ raison_sociale: cl.raison_sociale, siret: cl.siret, adresse: cl.adresse, cp: cl.cp, ville: cl.ville, tva_intra: cl.tva_intra, naf: cl.naf, telephone: cl.telephone, fax: cl.fax, email: cl.email, facturation_societe: cl.facturation_societe, facturation_email: cl.facturation_email, facturation_adresse: cl.facturation_adresse, contact_compta: null, contact_maintenance: null, commande_obligatoire: null, contact_commande: null });
      setCompta(contact(cl.contact_compta)); setMaint(contact(cl.contact_maintenance)); setCmd(contact(cl.contact_commande)); setCmdOblig(cl.commande_obligatoire);
      setSepa((s) => ({ ...s, titulaire: cl.raison_sociale, adresse_titulaire: cl.adresse, cp: cl.cp, ville: cl.ville }));
      setNom(cl.contact_nom || ""); setEmail(cl.contact_email || ""); setTel(cl.contact_tel || "");
      setPieces(d.pieces);
    }).catch(() => setEtat("invalide"));
  }, [numero, jeton]);

  const setF = <K extends keyof Fiche>(k: K, v: Fiche[K]) => setFiche((f) => (f ? { ...f, [k]: v } : f));
  const sepaEff: Sepa = useMemo(() => (sepaMemeAdresse && fiche ? { ...sepa, titulaire: sepa.titulaire || fiche.raison_sociale, adresse_titulaire: fiche.adresse, cp: fiche.cp, ville: fiche.ville } : sepa), [sepa, sepaMemeAdresse, fiche]);

  /** Contrôles en direct (mêmes règles que le serveur) */
  const manques = useMemo(() => {
    const e: string[] = [];
    if (!fiche) return e;
    if (fiche.raison_sociale.trim().length < 2) e.push("Raison sociale");
    if (!fiche.adresse.trim() || !fiche.cp.trim() || !fiche.ville.trim()) e.push("Adresse complète (rue, code postal, ville)");
    if (!siretOk(fiche.siret)) e.push("SIRET à 14 chiffres");
    if (!fiche.telephone.trim() || !telOk(fiche.telephone)) e.push("Téléphone de la société");
    if (!fiche.email.trim() || !emailOk(fiche.email)) e.push("Email de la société");
    if (!emailOk(fiche.facturation_email)) e.push("Email de facturation invalide");
    if (!compta.nom.trim() || !compta.tel.trim() || !compta.email.trim() || !emailOk(compta.email) || !telOk(compta.tel)) e.push("Contact comptabilité (nom, téléphone, email)");
    if (!maint.nom.trim() || !maint.tel.trim() || !maint.email.trim() || !emailOk(maint.email) || !telOk(maint.tel)) e.push("Contact maintenance (nom, téléphone, email)");
    if (cmdOblig === null) e.push("N° de commande obligatoire : oui ou non");
    if (cmdOblig && (!cmd.email.trim() || !cmd.tel.trim() || !emailOk(cmd.email))) e.push("Contact pour le n° de commande (email, téléphone)");
    if (!sepaEff.titulaire.trim()) e.push("SEPA : nom du titulaire du compte");
    if (!sepaEff.adresse_titulaire.trim() || !sepaEff.cp.trim() || !sepaEff.ville.trim()) e.push("SEPA : adresse du titulaire");
    if (!ibanValide(sepaEff.iban)) e.push("SEPA : IBAN valide");
    if (!bicValide(sepaEff.bic)) e.push("SEPA : BIC valide");
    if (!sepaEff.lieu.trim()) e.push("Lieu de signature");
    if (c?.nouveau_client && (!pieces.cni || !pieces.rib)) e.push("Pièce d'identité du signataire et RIB");
    if (!cgLues) e.push("Acceptation des conditions générales");
    if (nom.trim().length < 3) e.push("Nom et prénom du signataire");
    if (!emailOk(email)) e.push("Email du signataire invalide");
    return e;
  }, [fiche, compta, maint, cmd, cmdOblig, sepaEff, pieces, cgLues, nom, email, c]);

  async function deposer(piece: "cni" | "rib", f: File | null) {
    if (!f) return;
    setErreur(""); setEnvoiPiece(piece);
    try { await deposerPiecePublique(numero, jeton, piece, await preparerFichier(f)); setPieces((p) => ({ ...p, [piece]: true })); }
    catch (e: any) { setErreur(e?.message === "taille" ? "Fichier trop lourd (3 Mo max.)" : e?.message === "format" ? "Format accepté : JPG, PNG ou PDF" : e?.message || "Dépôt impossible"); }
    finally { setEnvoiPiece(""); }
  }

  async function signer() {
    setErreur(""); setDetails([]);
    if (!fiche) return;
    if (manques.length) { setDetails(manques); return setErreur("Complétez les points suivants avant de signer :"); }
    const sig = pad.current?.png() || "";
    if (!sig) return setErreur("Signez dans le cadre.");
    setEnvoi(true);
    try {
      const d = await signerContratPublique(numero, jeton, {
        nom: nom.trim(), fonction: fonction.trim(), email: email.trim(), tel: tel.trim(), accepte_cg: true, signature: sig,
        fiche: { ...fiche, siret: fiche.siret.replace(/\D/g, ""), contact_compta: compta, contact_maintenance: maint, commande_obligatoire: cmdOblig === true, contact_commande: cmd },
        sepa: { ...sepaEff, iban: sepaEff.iban.replace(/\s/g, "").toUpperCase(), bic: sepaEff.bic.replace(/\s/g, "").toUpperCase() },
      });
      setC(d); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      if (e?.details?.contrat) setC(e.details.contrat);
      else if (e?.details?.details?.length) { setDetails(e.details.details); setErreur("Le serveur a relevé des points à corriger :"); }
      else if (e?.message === "pieces_requises") setErreur("Déposez votre pièce d'identité et votre RIB.");
      else setErreur("La signature n'a pas pu être enregistrée. Réessayez ou contactez votre interlocuteur.");
    } finally { setEnvoi(false); }
  }

  const carte: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "20px 22px", marginBottom: 16 };
  const champ: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 6, border: "1px solid #c8cdd8", fontSize: 16, fontFamily: "inherit" };
  const lab: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: "block" };
  const grille: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
  const h2: React.CSSProperties = { marginTop: 0, fontSize: 19, color: BLEU };
  const h3: React.CSSProperties = { fontSize: 15, color: BLEU, margin: "16px 0 8px" };
  const okStyle = (ok: boolean): React.CSSProperties => (ok ? {} : { border: `1px solid ${ROUGE}`, background: "#fff7f6" });
  const input = (k: keyof Fiche, label: string, o: { type?: string; obligatoire?: boolean; ok?: boolean; auto?: string; aide?: string } = {}) => fiche && (
    <label style={lab}>{label}{o.obligatoire ? " *" : ""}
      <input style={{ ...champ, marginTop: 4, ...okStyle(o.ok ?? true) }} type={o.type || "text"} value={String(fiche[k] ?? "")} onChange={(e) => setF(k, e.target.value as any)} autoComplete={o.auto} />
      {o.aide && <span style={{ fontSize: 11.5, color: "#777", fontWeight: 400 }}>{o.aide}</span>}
    </label>
  );
  const contactForm = (v: Contact, set: (c: Contact) => void, obligatoire: boolean) => (
    <div style={grille}>
      <label style={lab}>Nom{obligatoire ? " *" : ""}<input style={{ ...champ, marginTop: 4, ...okStyle(!obligatoire || !!v.nom.trim()) }} value={v.nom} onChange={(e) => set({ ...v, nom: e.target.value })} /></label>
      <label style={lab}>Téléphone{obligatoire ? " *" : ""}<input style={{ ...champ, marginTop: 4, ...okStyle((!obligatoire || !!v.tel.trim()) && telOk(v.tel)) }} type="tel" value={v.tel} onChange={(e) => set({ ...v, tel: e.target.value })} /></label>
      <label style={lab}>Email{obligatoire ? " *" : ""}<input style={{ ...champ, marginTop: 4, ...okStyle((!obligatoire || !!v.email.trim()) && emailOk(v.email)) }} type="email" value={v.email} onChange={(e) => set({ ...v, email: e.target.value })} /></label>
    </div>
  );
  const cg = (c?.cg_texte || CG_LLD_DEFAUT).split("\n");

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1f2733" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <img src={DELTA_LOGO_BASE64} alt="Delta Services" style={{ height: 40 }} />
          {c && <span style={{ fontWeight: 700, color: BLEU }}>Contrat {c.numero}</span>}
        </div>
        {etat === "charge" && <div style={carte}>Chargement du contrat…</div>}
        {etat === "invalide" && <div style={carte}><h2 style={{ marginTop: 0, color: ROUGE }}>Ce lien n'est pas valide.</h2><p>Vérifiez que vous avez ouvert le lien complet, ou contactez votre interlocuteur Delta Services.</p></div>}
        {etat === "ok" && c && fiche && (
          <>
            {c.statut === "signe" && (
              <div style={{ ...carte, borderLeft: `5px solid ${VERT}` }}>
                <h2 style={{ marginTop: 0, color: VERT }}>✅ Contrat signé — merci !</h2>
                <p>Votre contrat de location <b>{c.numero}</b> est signé. Le document signé (contrat, mandat SEPA et fiche locataire remplis, certificat de signature) vous a été envoyé par email ; votre interlocuteur vous recontacte pour organiser la mise à disposition.</p>
                {c.signataire && <p style={{ color: "#555" }}>Signé par {c.signataire} le {dateFr(c.signe_le)}</p>}
                {c.pdf_url && <a href={c.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>📄 Télécharger le contrat signé (PDF)</a>}
              </div>
            )}
            {(c.statut === "annule" || c.statut === "indisponible") && (
              <div style={{ ...carte, borderLeft: `5px solid ${ROUGE}` }}>
                <h2 style={{ marginTop: 0, color: ROUGE }}>Ce contrat n'est plus disponible à la signature</h2>
                <p>Contactez votre interlocuteur Delta Services.</p>
              </div>
            )}

            <div style={carte}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{c.client.raison_sociale}</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Contrat de location longue durée {c.full_services ? "Full services" : "Sans entretien"} · {dateFr(c.date)}</div>
              <div style={{ background: "#f5f8fe", borderRadius: 8, padding: "12px 14px", fontSize: 15 }}>
                <b>{c.modele}</b>{c.immat ? ` — ${c.immat}` : ""} — {c.materiel === "neuf" ? "véhicule neuf" : "véhicule rétrofité (occasion)"}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 3, fontSize: 14, marginTop: 8 }}>
                  <span>Durée d'engagement</span><b style={{ textAlign: "right" }}>{c.duree_mois} mois</b>
                  <span>Loyer mensuel HT{c.assurance ? " (assurance incluse)" : ""}{c.options.length ? ` + options (${c.options.map((o) => o.libelle).join(", ")})` : ""}</span><b style={{ textAlign: "right" }}>{eur(c.total_mensuel_ht)}</b>
                  <span>Loyer mensuel TTC, prélevé le {c.jour_prelevement} du mois</span><b style={{ textAlign: "right" }}>{eur(c.total_mensuel_ttc)}</b>
                  <span>Caution (1 mois de loyer TTC)</span><span style={{ textAlign: "right" }}>{eur(c.caution_ttc)}</span>
                  <span>Kilométrage</span><span style={{ textAlign: "right" }}>{c.km_an.toLocaleString("fr-FR")} km / an · km sup. {eur(c.prix_km_sup)} HT</span>
                  <span>Transport</span><span style={{ textAlign: "right" }}>{c.transport.mode === "chiffre" ? `${eur(c.transport.prix_ht)} HT` : "offert"}</span>
                </div>
              </div>
              {c.pdf_url && c.statut !== "signe" && <div style={{ marginTop: 12 }}><a href={c.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>📄 Lire le contrat complet (PDF)</a> <span style={{ fontSize: 13, color: "#666" }}>— conditions particulières, financières et générales, annexes</span></div>}
            </div>

            {c.statut === "a_signer" && (
              <>
                <div style={carte}>
                  <h2 style={h2}>1. Fiche locataire {c.nouveau_client ? "" : <span style={{ fontSize: 13, color: "#666", fontWeight: 400 }}>— préremplie, vérifiez et corrigez si besoin</span>}</h2>
                  <h3 style={{ ...h3, marginTop: 4 }}>Entreprise</h3>
                  <div style={grille}>
                    {input("raison_sociale", "Raison sociale", { obligatoire: true, ok: fiche.raison_sociale.trim().length >= 2, auto: "organization" })}
                    {input("siret", "SIRET (14 chiffres)", { obligatoire: true, ok: siretOk(fiche.siret), aide: fiche.siret.replace(/\D/g, "").length === 9 ? "9 chiffres = SIREN ; indiquez le SIRET de l'établissement (14 chiffres)." : undefined })}
                  </div>
                  <div style={{ ...grille, marginTop: 12, gridTemplateColumns: "2fr 1fr 1.4fr" }}>
                    {input("adresse", "Adresse", { obligatoire: true, ok: !!fiche.adresse.trim(), auto: "street-address" })}
                    {input("cp", "Code postal", { obligatoire: true, ok: !!fiche.cp.trim(), auto: "postal-code" })}
                    {input("ville", "Ville", { obligatoire: true, ok: !!fiche.ville.trim(), auto: "address-level2" })}
                  </div>
                  <div style={{ ...grille, marginTop: 12 }}>
                    {input("telephone", "Téléphone", { obligatoire: true, type: "tel", ok: !!fiche.telephone.trim() && telOk(fiche.telephone), auto: "tel" })}
                    {input("email", "Email", { obligatoire: true, type: "email", ok: !!fiche.email.trim() && emailOk(fiche.email), auto: "email" })}
                    {input("tva_intra", "N° de TVA intracommunautaire")}
                    {input("naf", "Code NAF")}
                    {input("fax", "Fax")}
                  </div>
                  <h3 style={h3}>Adresse de facturation (si différente)</h3>
                  <div style={grille}>
                    {input("facturation_societe", "Société")}
                    {input("facturation_email", "Email de facturation", { type: "email", ok: emailOk(fiche.facturation_email) })}
                    {input("facturation_adresse", "Adresse postale")}
                  </div>
                  <h3 style={h3}>Contact comptabilité fournisseur *</h3>
                  {contactForm(compta, setCompta, true)}
                  <h3 style={h3}>Contact pour la maintenance du véhicule *</h3>
                  <div style={{ fontSize: 12.5, color: "#666", marginBottom: 6 }}>Révisions, visites périodiques de la nacelle, relevés kilométriques.</div>
                  {contactForm(maint, setMaint, true)}
                  <h3 style={h3}>Numéro de commande *</h3>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                    {[true, false].map((v) => (
                      <label key={String(v)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px", borderRadius: 8, cursor: "pointer", border: `2px solid ${cmdOblig === v ? BLEU : "#dde2ea"}`, background: cmdOblig === v ? "#eef3fb" : "white" }}>
                        <input type="radio" name="cmd" checked={cmdOblig === v} onChange={() => setCmdOblig(v)} style={{ width: 18, height: 18 }} />{v ? "Un n° de commande est obligatoire sur nos factures" : "Pas de n° de commande"}
                      </label>
                    ))}
                  </div>
                  {cmdOblig && <><div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Personne à contacter pour obtenir le numéro</div>{contactForm(cmd, setCmd, true)}</>}
                </div>

                <div style={carte}>
                  <h2 style={h2}>2. Mandat de prélèvement SEPA</h2>
                  <div style={{ fontSize: 13.5, color: "#444", background: "#f5f8fe", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                    Créancier : <b>{c.sepa.creancier}</b> · ICS {c.sepa.ics} · référence unique du mandat <b>{c.rum}</b> · paiement récurrent, prélèvement le {c.jour_prelevement} du mois.<br />
                    En signant ce contrat, vous autorisez {c.sepa.creancier} à envoyer des instructions à votre banque pour débiter votre compte, et votre banque à débiter votre compte conformément à ces instructions. Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions décrites dans votre convention de compte ; toute demande de remboursement doit être présentée dans les 8 semaines suivant la date de débit.
                  </div>
                  <div style={grille}>
                    <label style={lab}>Titulaire du compte *<input style={{ ...champ, marginTop: 4, ...okStyle(!!sepaEff.titulaire.trim()) }} value={sepa.titulaire} onChange={(e) => setSepa({ ...sepa, titulaire: e.target.value })} /></label>
                    <label style={lab}>IBAN *<input style={{ ...champ, marginTop: 4, fontFamily: "ui-monospace, monospace", ...okStyle(!sepa.iban || ibanValide(sepa.iban)) }} value={sepa.iban} onChange={(e) => setSepa({ ...sepa, iban: e.target.value.toUpperCase() })} placeholder="FR76 …" autoComplete="off" />{sepa.iban && !ibanValide(sepa.iban) && <span style={{ fontSize: 11.5, color: ROUGE }}>IBAN invalide (clé de contrôle)</span>}</label>
                    <label style={lab}>BIC *<input style={{ ...champ, marginTop: 4, fontFamily: "ui-monospace, monospace", ...okStyle(!sepa.bic || bicValide(sepa.bic)) }} value={sepa.bic} onChange={(e) => setSepa({ ...sepa, bic: e.target.value.toUpperCase() })} placeholder="BNPAFRPP" autoComplete="off" /></label>
                  </div>
                  <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, margin: "12px 0 8px", cursor: "pointer" }}>
                    <input type="checkbox" checked={sepaMemeAdresse} onChange={(e) => setSepaMemeAdresse(e.target.checked)} style={{ width: 18, height: 18 }} />Adresse du titulaire identique à l'adresse de la société
                  </label>
                  {!sepaMemeAdresse && (
                    <div style={{ ...grille, gridTemplateColumns: "2fr 1fr 1.4fr" }}>
                      <label style={lab}>Adresse *<input style={{ ...champ, marginTop: 4 }} value={sepa.adresse_titulaire} onChange={(e) => setSepa({ ...sepa, adresse_titulaire: e.target.value })} /></label>
                      <label style={lab}>Code postal *<input style={{ ...champ, marginTop: 4 }} value={sepa.cp} onChange={(e) => setSepa({ ...sepa, cp: e.target.value })} /></label>
                      <label style={lab}>Ville *<input style={{ ...champ, marginTop: 4 }} value={sepa.ville} onChange={(e) => setSepa({ ...sepa, ville: e.target.value })} /></label>
                    </div>
                  )}
                  <div style={{ ...grille, marginTop: 8 }}>
                    <label style={lab}>Signé à (lieu) *<input style={{ ...champ, marginTop: 4, ...okStyle(!!sepa.lieu.trim()) }} value={sepa.lieu} onChange={(e) => setSepa({ ...sepa, lieu: e.target.value })} placeholder={fiche.ville || "Ville"} /></label>
                  </div>
                  <p style={{ fontSize: 11.5, color: "#777", margin: "10px 0 0" }}>Vos coordonnées bancaires sont imprimées dans le mandat (page SEPA du contrat) et conservées de façon confidentielle par Delta Services pour la gestion des prélèvements.</p>
                </div>

                <div style={carte}>
                  <h2 style={h2}>3. Pièces justificatives {c.nouveau_client ? <span style={{ fontSize: 13, color: ROUGE, fontWeight: 600 }}>— obligatoires (nouveau client)</span> : <span style={{ fontSize: 13, color: "#666", fontWeight: 400 }}>— facultatives, vos pièces sont déjà dans votre dossier</span>}</h2>
                  <div style={grille}>
                    {(["cni", "rib"] as const).map((p) => (
                      <div key={p} style={{ border: `2px dashed ${pieces[p] ? VERT : c.nouveau_client ? ROUGE : "#c8cdd8"}`, borderRadius: 8, padding: 14, background: pieces[p] ? "#f1faf3" : "white" }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{p === "cni" ? "Pièce d'identité du signataire" : "RIB du compte à prélever"}{pieces[p] ? " ✅" : ""}</div>
                        <div style={{ fontSize: 12.5, color: "#666", marginBottom: 8 }}>{p === "cni" ? "Carte d'identité ou passeport, recto. " : "Relevé d'identité bancaire. "}Photo (JPG, PNG) ou PDF, 3 Mo max.</div>
                        <input type="file" accept="image/*,application/pdf" disabled={envoiPiece === p} onChange={(e) => deposer(p, e.target.files?.[0] || null)} style={{ fontSize: 14 }} />
                        {envoiPiece === p && <div style={{ fontSize: 13, color: BLEU, marginTop: 6 }}>⏳ Envoi…</div>}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={carte}>
                  <h2 style={h2}>4. Conditions générales de location <span style={{ fontSize: 13, color: "#666", fontWeight: 400 }}>— version {c.cg_version}</span></h2>
                  <div style={{ maxHeight: cgOuvertes ? "none" : 260, overflowY: "auto", border: "1px solid #dde2ea", borderRadius: 8, padding: "12px 14px", fontSize: 13, lineHeight: 1.45, background: "#fafbfd" }}>
                    {cg.map((l, i) => /^Article\s+\d+/i.test(l) ? <div key={i} style={{ fontWeight: 700, color: BLEU, margin: "12px 0 4px" }}>{l}</div> : l.trim() ? <p key={i} style={{ margin: "0 0 6px", paddingLeft: /^[-•o]\s/.test(l) ? 14 : 0 }}>{l}</p> : null)}
                  </div>
                  <button type="button" onClick={() => setCgOuvertes((v) => !v)} style={{ marginTop: 8, background: "none", border: "none", color: BLEU, fontWeight: 600, cursor: "pointer", padding: 0 }}>{cgOuvertes ? "Réduire" : "Afficher en entier"}</button>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14.5, marginTop: 12, cursor: "pointer", fontWeight: 600 }}>
                    <input type="checkbox" checked={cgLues} onChange={(e) => setCgLues(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
                    <span>J'ai lu et j'accepte les conditions générales de location (version {c.cg_version}) ainsi que les conditions particulières et financières du contrat {c.numero}. *</span>
                  </label>
                </div>

                <div style={carte}>
                  <h2 style={h2}>5. Signer le contrat</h2>
                  <div style={{ ...grille, marginBottom: 14 }}>
                    <label style={lab}>Nom et prénom du signataire *<input style={{ ...champ, marginTop: 4, ...okStyle(nom.trim().length >= 3) }} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
                    <label style={lab}>Fonction<input style={{ ...champ, marginTop: 4 }} value={fonction} onChange={(e) => setFonction(e.target.value)} autoComplete="organization-title" /></label>
                    <label style={lab}>Email (pour recevoir le contrat signé)<input style={{ ...champ, marginTop: 4, ...okStyle(emailOk(email)) }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                    <label style={lab}>Téléphone<input style={{ ...champ, marginTop: 4 }} type="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" /></label>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Signez dans le cadre ci-dessous (doigt ou souris) *</div>
                  <SignaturePad ref={pad} />
                  <div style={{ fontSize: 12.5, color: "#666", marginTop: 6 }}>Votre signature est apposée sur la page « Signatures » du contrat et sur le mandat SEPA.</div>
                  {manques.length > 0 && <div style={{ marginTop: 12, fontSize: 13, color: "#8a5a00", background: "#fff8e6", borderRadius: 8, padding: "8px 12px" }}>Il reste {manques.length} point{manques.length > 1 ? "s" : ""} à compléter : {manques.slice(0, 3).join(" · ")}{manques.length > 3 ? " · …" : ""}</div>}
                  {erreur && <div style={{ color: ROUGE, fontWeight: 600, marginTop: 12 }}>⚠ {erreur}{details.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontWeight: 400 }}>{details.map((d, i) => <li key={i}>{d}</li>)}</ul>}</div>}
                  <button type="button" onClick={signer} disabled={envoi || manques.length > 0} style={{ marginTop: 16, width: "100%", padding: "14px 18px", fontSize: 17, fontWeight: 700, border: "none", borderRadius: 8, background: envoi || manques.length ? "#9db5a5" : VERT, color: "white", cursor: envoi || manques.length ? "default" : "pointer" }}>
                    {envoi ? "⏳ Signature en cours…" : "✍️ Signer le contrat"}
                  </button>
                  <p style={{ fontSize: 11.5, color: "#777", marginBottom: 0 }}>Signature électronique simple (règlement UE eIDAS) : votre nom, la date, l'heure, l'adresse IP, la version des conditions générales acceptées et l'empreinte du document sont enregistrés dans un certificat joint au contrat signé.</p>
                </div>
              </>
            )}

            <div style={{ fontSize: 13, color: "#555", textAlign: "center" }}>
              Une question ? Votre interlocuteur : <b>{c.commercial.nom}</b>
              {c.commercial.tel ? <> · <a href={`tel:${c.commercial.tel.replace(/\s/g, "")}`}>{c.commercial.tel}</a></> : null}
              {c.commercial.email ? <> · <a href={`mailto:${c.commercial.email}`}>{c.commercial.email}</a></> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
