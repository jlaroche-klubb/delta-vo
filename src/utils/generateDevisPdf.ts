import jsPDF from "jspdf";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import type { ConfigDevis, DevisVente } from "../services/devisVenteService";
import { TEXTES_DEVIS, eurDevis, langueDevis } from "./devisLangues";

/**
 * 🧾 PDF du devis de vente Delta VO (A4, texte vectoriel — pas de capture
 * d'écran). Mise en page reprise du modèle de devis Delta Services :
 * bandeau bleu (client / références), tableau des nacelles, totaux,
 * acompte, conditions, bloc « Bon pour accord ». Page CGV si renseignées.
 */

const BLEU: [number, number, number] = [31, 66, 130];
const GRIS: [number, number, number] = [90, 90, 90];
const dateFr = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/** Espaces insécables / fines (format numérique français) → espace simple : la police PDF ne les connaît pas */
const nettoie = (t: string) => String(t ?? "").replace(/[\u00a0\u2007\u202f]/g, " ");

/** Emplacement de l'encadré « Bon pour accord » (mm, origine en haut à gauche) : la signature en ligne y est apposée */
export interface ZoneSignature { page: number; x: number; y: number; w: number; h: number }

export function genererDevisPdf(dv: DevisVente, cfg: ConfigDevis): { base64: string; blob: Blob; filename: string; zoneSignature: ZoneSignature } {
  const lg = langueDevis(dv.langue);
  const T = TEXTES_DEVIS[lg];
  const eur = (n: number) => eurDevis(n, lg);
  const cgv = (lg === "fr" ? cfg.cgv : lg === "en" ? cfg.cgv_en : cfg.cgv_es) || "";
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16;
  let y = 12;

  // ── En-tête : logo + coordonnées société ──
  try { pdf.addImage(DELTA_LOGO_BASE64, "PNG", M, y, 52, 18); } catch { /* logo optionnel */ }
  pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GRIS);
  const soc = [cfg.raison_sociale, ...cfg.adresse.split("\n"), cfg.telephone, cfg.site_web].filter(Boolean);
  soc.forEach((l, i) => pdf.text(l, W - M, y + 3 + i * 4, { align: "right" }));
  y += 26;

  // ── Bandeau bleu : titre, client, références (hauteur ajustée au contenu) ──
  const c = dv.client;
  const cl: string[] = [c.adresse || "", [c.cp, c.ville].filter(Boolean).join(" "), c.siren ? `${T.siren} ${c.siren}${c.tva_intra ? `   ${T.tva} ${c.tva_intra}` : ""}` : "", "",
    c.contact_nom || "", c.contact_email || "", c.contact_tel || ""].filter((l, i, a) => l || (i === 3 && a.slice(4).some(Boolean)));
  if (cl[0] === "") cl.shift(); // pas d'adresse : pas de ligne vide en tête
  const sep = lg === "fr" ? " : " : ": ";
  const refs = [
    `${T.date}${sep}${dateFr(dv.date)}`,
    `${T.valable}${sep}${dateFr(dv.date_expiration)}`,
    `${T.etabli}${sep}${dv.commercial.nom}`,
    dv.commercial.email,
    dv.commercial.tel || "",
  ].filter(Boolean);
  const hBand = Math.max(20 + (cl.length + 1) * 4.3, 20 + refs.length * 4.3) + 6;
  pdf.setFillColor(...BLEU).rect(0, y, W, hBand, "F");
  pdf.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(18);
  pdf.text(`${T.devis} ${dv.numero}`, M, y + 11);
  pdf.setFontSize(9.5).setFont("helvetica", "bold");
  pdf.text(pdf.splitTextToSize(c.raison_sociale, 100)[0], M, y + 20);
  pdf.setFont("helvetica", "normal");
  cl.forEach((l, i) => pdf.text(l, M, y + 24.3 + i * 4.3));
  refs.forEach((l, i) => pdf.text(l, W - M, y + 20 + i * 4.3, { align: "right" }));
  y += hBand + 10;

  // ── Tableau des nacelles ──
  const colRef = M, colDes = M + 30, colPrix = W - M;
  pdf.setTextColor(40, 40, 40).setFont("helvetica", "bold").setFontSize(9);
  pdf.text(T.reference, colRef, y);
  pdf.text(T.designation, colDes, y);
  pdf.text(T.prixHt, colPrix, y, { align: "right" });
  y += 2.5;
  pdf.setDrawColor(...BLEU).setLineWidth(0.4).line(M, y, W - M, y);
  y += 5;
  pdf.setFont("helvetica", "normal").setFontSize(9);
  for (const l of dv.lignes) {
    const des = pdf.splitTextToSize(nettoie(l.designation) || "—", colPrix - colDes - 30);
    if (y + des.length * 4.2 > 265) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold").text(nettoie(l.reference) || "—", colRef, y);
    pdf.setFont("helvetica", "normal").text(des, colDes, y);
    if (!dv.lot) pdf.text(eur(l.prix_ht), colPrix, y, { align: "right" });
    y += Math.max(des.length * 4.2, 5) + 3;
    pdf.setDrawColor(225, 225, 225).setLineWidth(0.2).line(M, y - 2, W - M, y - 2);
  }
  // 📦 Vente en lot : un seul prix pour l'ensemble
  if (dv.lot) {
    y += 2.5;
    if (y > 262) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold").setFontSize(9.5).text(T.lot(dv.lignes.length), colDes, y);
    pdf.text(eur(dv.total_ht), colPrix, y, { align: "right" });
    pdf.setFont("helvetica", "normal").setFontSize(9);
    y += 7;
  }

  // ── Totaux ──
  y += 3;
  const xL = W - M - 70;
  const ligneTot = (lib: string, val: string, gras = false) => {
    pdf.setFont("helvetica", gras ? "bold" : "normal").setFontSize(gras ? 10.5 : 9.5);
    pdf.text(lib, xL, y);
    pdf.text(val, W - M, y, { align: "right" });
    y += gras ? 7 : 5.5;
  };
  ligneTot(T.totalHt, eur(dv.total_ht));
  if (dv.tva_taux > 0) ligneTot(`${T.tva} ${dv.tva_taux} %`, eur(dv.tva));
  ligneTot(dv.tva_taux > 0 ? T.totalTtc : T.total, eur(dv.total_ttc), true);
  if (dv.tva_taux === 0) {
    pdf.setFont("helvetica", "italic").setFontSize(8).setTextColor(...GRIS);
    const exo = pdf.splitTextToSize(dv.exoneration || T.exonerationCourte, 120);
    pdf.text(exo, W - M, y - 2, { align: "right" });
    pdf.setTextColor(40, 40, 40);
    y += 3 + (exo.length - 1) * 3.5;
  }
  // Encadré acompte élargi si le libellé est long (anglais / espagnol)
  pdf.setFont("helvetica", "bold").setFontSize(9.5);
  const libAcompte = dv.acompte_pct === 0 ? T.financement : T.acompte(dv.acompte_pct);
  const largAcompte = pdf.getTextWidth(libAcompte) + (dv.acompte_pct === 0 ? 0 : pdf.getTextWidth(eur(dv.acompte_ttc)) + 6);
  const xA = Math.min(xL, W - M - largAcompte);
  pdf.setFillColor(238, 243, 251).rect(xA - 3, y - 4, W - M - xA + 3, 9, "F");
  if (dv.acompte_pct === 0) {
    pdf.text(T.financement, W - M, y + 1.5, { align: "right" });
  } else {
    pdf.text(libAcompte, xA, y + 1.5);
    pdf.text(eur(dv.acompte_ttc), W - M, y + 1.5, { align: "right" });
  }
  y += 14;

  // ── Conditions + règlement ──
  const bloc = (titre: string, texte: string) => {
    if (!texte.trim()) return;
    const lignes = pdf.splitTextToSize(nettoie(texte), W - 2 * M);
    if (y + 6 + lignes.length * 4 > 262) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...BLEU).text(titre, M, y);
    pdf.setFont("helvetica", "normal").setFontSize(8.8).setTextColor(40, 40, 40).text(lignes, M, y + 5);
    y += 7 + lignes.length * 4;
  };
  const reglement = [
    dv.acompte_pct === 0
      ? T.reglementFinancement
      : dv.acompte_pct === 100
        ? T.reglement100
        : T.reglementAcompte(dv.acompte_pct),
    cfg.iban ? `IBAN${sep}${cfg.iban}${cfg.bic ? `   BIC${sep}${cfg.bic}` : ""}` : "",
  ].filter(Boolean).join("\n");
  bloc(T.reglementTitre, reglement);
  bloc(T.conditions, nettoie(dv.conditions || ""));

  // ── Bon pour accord ──
  if (y + 38 > 275) { pdf.addPage(); y = 20; }
  y += 2;
  pdf.setDrawColor(...BLEU).setLineWidth(0.3).rect(W - M - 85, y, 85, 32);
  const zoneSignature: ZoneSignature = { page: pdf.getNumberOfPages(), x: W - M - 85, y, w: 85, h: 32 };
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BLEU).text(T.bonPourAccord, W - M - 82, y + 6);
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
  pdf.text(T.signature1, W - M - 82, y + 11);
  pdf.text(T.signature2, W - M - 82, y + 15);
  // Ancres invisibles (texte blanc) : emplacement de la signature et de la date DocuSign
  pdf.setFontSize(6).setTextColor(255, 255, 255);
  pdf.text("\\s1\\", W - M - 82, y + 26);
  pdf.text("\\d1\\", W - M - 30, y + 30);

  // ── Pied de page : mentions légales + pagination ──
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont("helvetica", "normal").setFontSize(7).setTextColor(...GRIS);
    const pied = [cfg.raison_sociale, cfg.adresse.replace(/\n/g, ", "), cfg.mentions_legales].filter(Boolean).join(" · ");
    pdf.text(pdf.splitTextToSize(pied, W - 2 * M - 20), M, 287);
    pdf.text(`${dv.numero} — ${p}/${pages}`, W - M, 287, { align: "right" });
  }

  // ── CGV (page à part si renseignées) ──
  if (cgv.trim()) {
    pdf.addPage();
    pdf.setFont("helvetica", "bold").setFontSize(11).setTextColor(...BLEU).text(T.cgv, M, 18);
    pdf.setFont("helvetica", "normal").setFontSize(7.2).setTextColor(40, 40, 40);
    const l = pdf.splitTextToSize(cgv, W - 2 * M);
    let yy = 25;
    for (const ligne of l) {
      if (yy > 282) { pdf.addPage(); yy = 18; }
      pdf.text(ligne, M, yy);
      yy += 3.2;
    }
  }

  const dataUri = pdf.output("datauristring");
  return {
    zoneSignature,
    base64: dataUri.split(",")[1] || "",
    blob: pdf.output("blob"),
    filename: `${lg === "en" ? "Quotation" : lg === "es" ? "Presupuesto" : "Devis"}_${dv.numero}.pdf`,
  };
}
