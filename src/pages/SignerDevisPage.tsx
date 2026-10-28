import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import { lireDevisPublic, signerDevisPublic, type DevisPublic } from "../services/devisVenteService";
import { TEXTES_DEVIS, eurDevis, langueDevis, type LangueDevis } from "../utils/devisLangues";

/**
 * ✍️ Page PUBLIQUE « Accepter et signer » — ouverte depuis le bouton de l'email
 * du devis (/devis/{numero}/{jeton}). Aucun compte : le jeton personnel du
 * lien suffit. Le client relit le devis, coche « Bon pour accord » et signe
 * au doigt ou à la souris ; le PDF signé lui est renvoyé par email.
 */

const BLEU = "#1f4282";
const VERT = "#1e8e3e";

const TXT: Record<LangueDevis, Record<string, string>> = {
  fr: {
    titre: "Devis", charge: "Chargement du devis…", invalide: "Ce lien de signature n'est pas valide.", invalide2: "Vérifiez que vous avez ouvert le lien complet reçu par email, ou contactez votre interlocuteur Delta Services.",
    expire: "Ce devis a expiré", expire2: "La date de validité est dépassée. Contactez votre interlocuteur pour recevoir un devis à jour.",
    annule: "Ce devis n'est plus valable", annule2: "Il a été annulé ou remplacé. Contactez votre interlocuteur pour plus d'informations.",
    signe: "Devis signé — merci !", signe2: "Votre accord a bien été enregistré. Le devis signé vous a été envoyé par email.", signePar: "Signé par", le: "le",
    pdf: "📄 Voir le devis complet (PDF)", pdfSigne: "📄 Télécharger le devis signé (PDF)", ref: "Référence", des: "Désignation", prix: "Prix HT", totalHt: "Total HT", tva: "TVA", ttc: "Total TTC", total: "Total",
    acompte: "Acompte à la commande", financement: "Financement bancaire — sans acompte", valable: "Valable jusqu'au", conditions: "Conditions",
    accord: "Accepter et signer le devis", nom: "Nom et prénom du signataire *", fonction: "Fonction", coche: "J'ai lu le devis et ses conditions, et je l'accepte : « Bon pour accord ». *",
    signez: "Signez dans le cadre ci-dessous (doigt ou souris) *", effacer: "Effacer", bouton: "✍️ Signer le devis", envoi: "⏳ Signature en cours…",
    errNom: "Indiquez votre nom et prénom.", errCoche: "Cochez la case « Bon pour accord ».", errSig: "Signez dans le cadre.", errServeur: "La signature n'a pas pu être enregistrée. Réessayez ou contactez votre interlocuteur.",
    contact: "Une question ? Votre interlocuteur :", legal: "Signature électronique simple (règlement UE eIDAS) : votre nom, la date, l'heure et l'adresse IP sont enregistrés dans un certificat joint au devis signé.",
  },
  en: {
    titre: "Quotation", charge: "Loading the quotation…", invalide: "This signing link is not valid.", invalide2: "Make sure you opened the full link received by email, or contact your Delta Services representative.",
    expire: "This quotation has expired", expire2: "The validity date has passed. Contact your representative to receive an updated quotation.",
    annule: "This quotation is no longer valid", annule2: "It has been cancelled or replaced. Contact your representative for more information.",
    signe: "Quotation signed — thank you!", signe2: "Your acceptance has been recorded. The signed quotation has been sent to you by email.", signePar: "Signed by", le: "on",
    pdf: "📄 View the full quotation (PDF)", pdfSigne: "📄 Download the signed quotation (PDF)", ref: "Reference", des: "Description", prix: "Price excl. VAT", totalHt: "Total excl. VAT", tva: "VAT", ttc: "Total incl. VAT", total: "Total",
    acompte: "Deposit on order", financement: "Bank financing — no deposit", valable: "Valid until", conditions: "Terms",
    accord: "Accept and sign the quotation", nom: "Signatory's full name *", fonction: "Position", coche: "I have read the quotation and its terms and I accept it: “Approved and accepted”. *",
    signez: "Sign in the box below (finger or mouse) *", effacer: "Clear", bouton: "✍️ Sign the quotation", envoi: "⏳ Signing…",
    errNom: "Enter your full name.", errCoche: "Tick the “Approved and accepted” box.", errSig: "Sign in the box.", errServeur: "The signature could not be recorded. Please try again or contact your representative.",
    contact: "Any question? Your representative:", legal: "Simple electronic signature (EU eIDAS regulation): your name, the date, time and IP address are recorded in a certificate attached to the signed quotation.",
  },
  es: {
    titre: "Presupuesto", charge: "Cargando el presupuesto…", invalide: "Este enlace de firma no es válido.", invalide2: "Compruebe que ha abierto el enlace completo recibido por email o contacte con su interlocutor de Delta Services.",
    expire: "Este presupuesto ha caducado", expire2: "La fecha de validez ha pasado. Contacte con su interlocutor para recibir un presupuesto actualizado.",
    annule: "Este presupuesto ya no es válido", annule2: "Ha sido anulado o sustituido. Contacte con su interlocutor para más información.",
    signe: "Presupuesto firmado — ¡gracias!", signe2: "Su conformidad ha quedado registrada. Le hemos enviado el presupuesto firmado por email.", signePar: "Firmado por", le: "el",
    pdf: "📄 Ver el presupuesto completo (PDF)", pdfSigne: "📄 Descargar el presupuesto firmado (PDF)", ref: "Referencia", des: "Descripción", prix: "Precio sin IVA", totalHt: "Total sin IVA", tva: "IVA", ttc: "Total IVA incl.", total: "Total",
    acompte: "Anticipo al realizar el pedido", financement: "Financiación bancaria — sin anticipo", valable: "Válido hasta", conditions: "Condiciones",
    accord: "Aceptar y firmar el presupuesto", nom: "Nombre y apellidos del firmante *", fonction: "Cargo", coche: "He leído el presupuesto y sus condiciones y lo acepto: «Conforme». *",
    signez: "Firme en el recuadro de abajo (dedo o ratón) *", effacer: "Borrar", bouton: "✍️ Firmar el presupuesto", envoi: "⏳ Firmando…",
    errNom: "Indique su nombre y apellidos.", errCoche: "Marque la casilla «Conforme».", errSig: "Firme en el recuadro.", errServeur: "No se ha podido registrar la firma. Inténtelo de nuevo o contacte con su interlocutor.",
    contact: "¿Alguna pregunta? Su interlocutor:", legal: "Firma electrónica simple (reglamento UE eIDAS): su nombre, la fecha, la hora y la dirección IP se registran en un certificado adjunto al presupuesto firmado.",
  },
};

const dateCourte = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export default function SignerDevisPage() {
  const { numero = "", jeton = "" } = useParams<{ numero: string; jeton: string }>();
  const [etat, setEtat] = useState<"charge" | "invalide" | "ok">("charge");
  const [dv, setDv] = useState<DevisPublic | null>(null);
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");
  const [accepte, setAccepte] = useState(false);
  const [aSigne, setASigne] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessin = useRef(false);

  const navLg = langueDevis(typeof navigator !== "undefined" ? navigator.language : "fr");
  const lg: LangueDevis = dv?.langue || navLg;
  const T = TXT[lg];

  useEffect(() => {
    document.title = "Delta Services";
    lireDevisPublic(numero, jeton)
      .then((d) => { setDv(d); setNom(d.client.contact_nom || ""); setEtat("ok"); })
      .catch(() => setEtat("invalide"));
  }, [numero, jeton]);

  // Zone de signature : taille réelle × densité de l'écran (trait net sur mobile)
  useEffect(() => {
    const c = canvas.current;
    if (!c || dv?.statut !== "a_signer") return;
    let largeur = 0;
    const ajuster = () => {
      const r = c.getBoundingClientRect();
      if (Math.round(r.width) === largeur) return; // barre d'adresse mobile : pas d'effacement
      largeur = Math.round(r.width);
      const d = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * d);
      c.height = Math.round(r.height * d);
      const ctx = c.getContext("2d")!;
      ctx.scale(d, d);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0b1f4d";
      setASigne(false);
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
  }, [dv?.statut, etat]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const debut = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dessin.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };
  const trait = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dessin.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setASigne(true);
  };
  const fin = () => { dessin.current = false; };
  const effacer = () => {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setASigne(false);
  };

  /** Signature recadrée sur le trait, fond transparent */
  function signaturePng(): string {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    const { width: w, height: h } = c;
    const px = ctx.getImageData(0, 0, w, h).data;
    let x1 = w, y1 = h, x2 = 0, y2 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 10) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    }
    if (x2 <= x1 || y2 <= y1) return "";
    const m = 6;
    x1 = Math.max(0, x1 - m); y1 = Math.max(0, y1 - m); x2 = Math.min(w - 1, x2 + m); y2 = Math.min(h - 1, y2 + m);
    const out = document.createElement("canvas");
    const echelle = Math.min(1, 900 / (x2 - x1));
    out.width = Math.round((x2 - x1) * echelle);
    out.height = Math.round((y2 - y1) * echelle);
    out.getContext("2d")!.drawImage(c, x1, y1, x2 - x1, y2 - y1, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  async function signer() {
    setErreur("");
    if (nom.trim().length < 3) return setErreur(T.errNom);
    if (!accepte) return setErreur(T.errCoche);
    const sig = aSigne ? signaturePng() : "";
    if (!sig) return setErreur(T.errSig);
    setEnvoi(true);
    try {
      const d = await signerDevisPublic(numero, jeton, { nom: nom.trim(), fonction: fonction.trim(), accepte: true, signature: sig });
      setDv(d);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      if (e?.details?.devis) setDv(e.details.devis);
      else setErreur(T.errServeur);
    } finally {
      setEnvoi(false);
    }
  }

  const carte: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "20px 22px", marginBottom: 16 };
  const champ: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 6, border: "1px solid #c8cdd8", fontSize: 16, fontFamily: "inherit" };
  const eur = (n: number) => eurDevis(n, lg);

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1f2733" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <img src={DELTA_LOGO_BASE64} alt="Delta Services" style={{ height: 40 }} />
          {dv && <span style={{ fontWeight: 700, color: BLEU }}>{T.titre} {dv.numero}</span>}
        </div>

        {etat === "charge" && <div style={carte}>{T.charge}</div>}

        {etat === "invalide" && (
          <div style={carte}><h2 style={{ marginTop: 0, color: "#c0392b" }}>{T.invalide}</h2><p>{T.invalide2}</p></div>
        )}

        {etat === "ok" && dv && (
          <>
            {dv.statut === "signe" && (
              <div style={{ ...carte, borderLeft: `5px solid ${VERT}` }}>
                <h2 style={{ marginTop: 0, color: VERT }}>✅ {T.signe}</h2>
                <p>{T.signe2}</p>
                {dv.signataire && <p style={{ color: "#555" }}>{T.signePar} {dv.signataire} {T.le} {dateCourte(dv.signe_le)}</p>}
                {dv.pdf_url && <a href={dv.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>{T.pdfSigne}</a>}
              </div>
            )}
            {(dv.statut === "expire" || dv.statut === "annule") && (
              <div style={{ ...carte, borderLeft: "5px solid #c0392b" }}>
                <h2 style={{ marginTop: 0, color: "#c0392b" }}>{dv.statut === "expire" ? T.expire : T.annule}</h2>
                <p>{dv.statut === "expire" ? T.expire2 : T.annule2}</p>
              </div>
            )}

            {/* Récapitulatif du devis */}
            <div style={carte}>
              {dv.type === "locfi" && dv.locfi && <div style={{ fontWeight: 700, color: BLEU, marginBottom: 4 }}>📄 Contrat de location financière N°{dv.locfi.numero_contrat}</div>}
              <div style={{ fontWeight: 700, fontSize: 17 }}>{dv.client.raison_sociale}</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 14 }}>{T.valable} {dateCourte(dv.date_expiration)}</div>
              {dv.lignes.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderTop: "1px solid #eef0f4", alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, minWidth: 64 }}>{l.reference}</div>
                  <div style={{ flex: 1, fontSize: 14 }}>{l.designation}</div>
                  {l.prix_ht != null && <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{eur(l.prix_ht)}</div>}
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${BLEU}`, paddingTop: 10, marginTop: 4, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, fontSize: 14 }}>
                {dv.lot && <b style={{ gridColumn: "1 / span 2" }}>📦 {TEXTES_DEVIS[lg].lot(dv.lignes.length)}</b>}
                <span>{T.totalHt}</span><span style={{ textAlign: "right" }}>{eur(dv.total_ht)}</span>
                {dv.tva_taux > 0 && <><span>{T.tva} {dv.tva_taux} %</span><span style={{ textAlign: "right" }}>{eur(dv.tva)}</span></>}
                <b style={{ fontSize: 16 }}>{dv.tva_taux > 0 ? T.ttc : T.total}</b><b style={{ fontSize: 16, textAlign: "right" }}>{eur(dv.total_ttc)}</b>
                {dv.type === "locfi" && dv.locfi
                  ? <>
                      <span style={{ color: BLEU, fontWeight: 600 }}>1er loyer majoré à la signature</span><span style={{ color: BLEU, fontWeight: 600, textAlign: "right" }}>{eur(dv.locfi.premier_loyer_ht * 1.2)} TTC</span>
                      {dv.locfi.duree_mois > 1 && <><span>Puis {dv.locfi.duree_mois - 1} loyer{dv.locfi.duree_mois > 2 ? "s" : ""} mensuel{dv.locfi.duree_mois > 2 ? "s" : ""} (prélèvement le 20)</span><span style={{ textAlign: "right" }}>{eur(dv.locfi.loyer_mensuel_ht * 1.2)} TTC</span></>}
                      <span style={{ gridColumn: "1 / span 2", fontSize: 13, color: "#555" }}>Location financière de {dv.locfi.duree_mois} mois — valeur de rachat au terme : offerte</span>
                    </>
                  : dv.acompte_pct > 0
                  ? <><span style={{ color: BLEU, fontWeight: 600 }}>{T.acompte} ({dv.acompte_pct} %)</span><span style={{ color: BLEU, fontWeight: 600, textAlign: "right" }}>{eur(dv.acompte_ttc)}</span></>
                  : <span style={{ color: BLEU, fontWeight: 600, gridColumn: "1 / span 2" }}>{T.financement}</span>}
              </div>
              {dv.conditions && <div style={{ marginTop: 14, fontSize: 12.5, color: "#555" }}><b>{T.conditions} : </b>{dv.conditions}</div>}
              {dv.pdf_url && dv.statut !== "signe" && (
                <div style={{ marginTop: 14 }}><a href={dv.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>{T.pdf}</a></div>
              )}
            </div>

            {/* Signature */}
            {dv.statut === "a_signer" && (
              <div style={carte}>
                <h2 style={{ marginTop: 0, fontSize: 19, color: BLEU }}>✍️ {dv.type === "locfi" ? "Accepter et signer le contrat" : T.accord}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>{T.nom}<input style={{ ...champ, marginTop: 4 }} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>{T.fonction}<input style={{ ...champ, marginTop: 4 }} value={fonction} onChange={(e) => setFonction(e.target.value)} autoComplete="organization-title" /></label>
                </div>
                <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginBottom: 14, cursor: "pointer" }}>
                  <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
                  <span>{T.coche}</span>
                </label>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>{T.signez}</span>
                  <button type="button" onClick={effacer} style={{ background: "none", border: "none", color: BLEU, cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>{T.effacer}</button>
                </div>
                <canvas
                  ref={canvas}
                  onPointerDown={debut} onPointerMove={trait} onPointerUp={fin} onPointerCancel={fin} onPointerLeave={fin}
                  style={{ width: "100%", height: 170, border: "2px dashed #b8c0d0", borderRadius: 8, background: "#fbfcfe", touchAction: "none", cursor: "crosshair", display: "block" }}
                />
                {erreur && <div style={{ color: "#c0392b", fontWeight: 600, marginTop: 12 }}>⚠ {erreur}</div>}
                <button type="button" onClick={signer} disabled={envoi}
                  style={{ marginTop: 16, width: "100%", padding: "14px 18px", fontSize: 17, fontWeight: 700, border: "none", borderRadius: 8, background: envoi ? "#7fb893" : VERT, color: "white", cursor: envoi ? "wait" : "pointer" }}>
                  {envoi ? T.envoi : dv.type === "locfi" ? "✍️ Signer le contrat" : T.bouton}
                </button>
                <p style={{ fontSize: 11.5, color: "#777", marginBottom: 0 }}>{T.legal}</p>
              </div>
            )}

            <div style={{ fontSize: 13, color: "#555", textAlign: "center" }}>
              {T.contact} <b>{dv.commercial.nom}</b>
              {dv.commercial.tel ? <> · <a href={`tel:${dv.commercial.tel.replace(/\s/g, "")}`}>{dv.commercial.tel}</a></> : null}
              {dv.commercial.email ? <> · <a href={`mailto:${dv.commercial.email}`}>{dv.commercial.email}</a></> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
