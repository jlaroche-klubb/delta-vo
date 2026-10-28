import jsPDF from "jspdf";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import type { ConfigDevis, DevisVente } from "../services/devisVenteService";

/**
 * 🧾 PDF du devis de vente Delta VO (A4, texte vectoriel — pas de capture
 * d'écran). Mise en page reprise du modèle de devis Delta Services :
 * bandeau bleu (client / références), tableau des nacelles, totaux,
 * acompte, conditions, bloc « Bon pour accord ». Page CGV si renseignées.
 */

const BLEU: [number, number, number] = [31, 66, 130];
const GRIS: [number, number, number] = [90, 90, 90];
const eur = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, " ") + " €";
const dateFr = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function genererDevisPdf(dv: DevisVente, cfg: ConfigDevis): { base64: string; blob: Blob; filename: string } {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 16;
  let y = 12;

  // ── En-tête : logo + coordonnées société ──
  try { pdf.addImage(DELTA_LOGO_BASE64, "PNG", M, y, 52, 18); } catch { /* logo optionnel */ }
  pdf.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GRIS);
  const soc = [cfg.raison_sociale, ...cfg.adresse.split("\n"), cfg.telephone, cfg.site_web].filter(Boolean);
  soc.forEach((l, i) => pdf.text(l, W - M, y + 3 + i * 4, { align: "right" }));
  y += 26;

  // ── Bandeau bleu : titre, client, références ──
  const hBand = 52;
  pdf.setFillColor(...BLEU).rect(0, y, W, hBand, "F");
  pdf.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(18);
  pdf.text(`Devis ${dv.numero}`, M, y + 11);
  pdf.setFontSize(9.5).setFont("helvetica", "bold");
  const c = dv.client;
  pdf.text(c.raison_sociale, M, y + 20);
  pdf.setFont("helvetica", "normal");
  const cl: string[] = [c.adresse || "", [c.cp, c.ville].filter(Boolean).join(" "), c.siren ? `SIREN ${c.siren}` : "", "",
    c.contact_nom || "", c.contact_email || "", c.contact_tel || ""].filter((l, i, a) => l || (i === 3 && a.slice(4).some(Boolean)));
  cl.forEach((l, i) => pdf.text(l, M, y + 25 + i * 4.3));
  const refs = [
    `Date : ${dateFr(dv.date)}`,
    `Valable jusqu'au : ${dateFr(dv.date_expiration)}`,
    `Établi par : ${dv.commercial.nom}`,
    dv.commercial.email,
    dv.commercial.tel || "",
  ].filter(Boolean);
  refs.forEach((l, i) => pdf.text(l, W - M, y + 20 + i * 4.3, { align: "right" }));
  y += hBand + 10;

  // ── Tableau des nacelles ──
  const colRef = M, colDes = M + 30, colPrix = W - M;
  pdf.setTextColor(40, 40, 40).setFont("helvetica", "bold").setFontSize(9);
  pdf.text("Référence", colRef, y);
  pdf.text("Désignation", colDes, y);
  pdf.text("Prix HT", colPrix, y, { align: "right" });
  y += 2.5;
  pdf.setDrawColor(...BLEU).setLineWidth(0.4).line(M, y, W - M, y);
  y += 5;
  pdf.setFont("helvetica", "normal").setFontSize(9);
  for (const l of dv.lignes) {
    const des = pdf.splitTextToSize(l.designation || "—", colPrix - colDes - 30);
    if (y + des.length * 4.2 > 265) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold").text(l.reference || "—", colRef, y);
    pdf.setFont("helvetica", "normal").text(des, colDes, y);
    pdf.text(eur(l.prix_ht), colPrix, y, { align: "right" });
    y += Math.max(des.length * 4.2, 5) + 3;
    pdf.setDrawColor(225, 225, 225).setLineWidth(0.2).line(M, y - 2, W - M, y - 2);
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
  ligneTot("Total HT", eur(dv.total_ht));
  if (dv.tva_taux > 0) ligneTot(`TVA ${dv.tva_taux} %`, eur(dv.tva));
  ligneTot(dv.tva_taux > 0 ? "TOTAL TTC" : "TOTAL", eur(dv.total_ttc), true);
  if (dv.tva_taux === 0) {
    pdf.setFont("helvetica", "italic").setFontSize(8).setTextColor(...GRIS);
    pdf.text(dv.exoneration || "Exonération de TVA", W - M, y - 2, { align: "right" });
    pdf.setTextColor(40, 40, 40);
    y += 3;
  }
  pdf.setFillColor(238, 243, 251).rect(xL - 3, y - 4, 70 + 3, 9, "F");
  pdf.setFont("helvetica", "bold").setFontSize(9.5);
  if (dv.acompte_pct === 0) {
    pdf.text("Financement bancaire — sans acompte", W - M, y + 1.5, { align: "right" });
  } else {
    pdf.text(`Acompte à la commande (${dv.acompte_pct} %)`, xL, y + 1.5);
    pdf.text(eur(dv.acompte_ttc), W - M, y + 1.5, { align: "right" });
  }
  y += 14;

  // ── Conditions + règlement ──
  const bloc = (titre: string, texte: string) => {
    if (!texte.trim()) return;
    const lignes = pdf.splitTextToSize(texte, W - 2 * M);
    if (y + 6 + lignes.length * 4 > 262) { pdf.addPage(); y = 20; }
    pdf.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...BLEU).text(titre, M, y);
    pdf.setFont("helvetica", "normal").setFontSize(8.8).setTextColor(40, 40, 40).text(lignes, M, y + 5);
    y += 7 + lignes.length * 4;
  };
  const reglement = [
    dv.acompte_pct === 0
      ? "Financement bancaire : aucun acompte demandé, règlement de la totalité par l'organisme de financement avant livraison."
      : dv.acompte_pct === 100
        ? "Règlement de la totalité à la commande, par virement."
        : `Acompte de ${dv.acompte_pct} % à la commande par virement, solde avant livraison ou enlèvement.`,
    cfg.iban ? `IBAN : ${cfg.iban}${cfg.bic ? `   BIC : ${cfg.bic}` : ""}` : "",
  ].filter(Boolean).join("\n");
  bloc("Règlement", reglement);
  bloc("Conditions", dv.conditions || "");

  // ── Bon pour accord ──
  if (y + 38 > 275) { pdf.addPage(); y = 20; }
  y += 2;
  pdf.setDrawColor(...BLEU).setLineWidth(0.3).rect(W - M - 85, y, 85, 32);
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BLEU).text("Bon pour accord", W - M - 82, y + 6);
  pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
  pdf.text("Date, nom, signature et cachet du client", W - M - 82, y + 11);
  pdf.text("précédés de la mention « Bon pour accord »", W - M - 82, y + 15);

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
  if (cfg.cgv.trim()) {
    pdf.addPage();
    pdf.setFont("helvetica", "bold").setFontSize(11).setTextColor(...BLEU).text("Conditions générales de vente", M, 18);
    pdf.setFont("helvetica", "normal").setFontSize(7.2).setTextColor(40, 40, 40);
    const l = pdf.splitTextToSize(cfg.cgv, W - 2 * M);
    let yy = 25;
    for (const ligne of l) {
      if (yy > 282) { pdf.addPage(); yy = 18; }
      pdf.text(ligne, M, yy);
      yy += 3.2;
    }
  }

  const dataUri = pdf.output("datauristring");
  return {
    base64: dataUri.split(",")[1] || "",
    blob: pdf.output("blob"),
    filename: `Devis_${dv.numero}.pdf`,
  };
}
