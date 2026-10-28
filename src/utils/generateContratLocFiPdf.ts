import jsPDF from "jspdf";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import type { DevisVente } from "../services/devisVenteService";
import type { ZoneSignature } from "./generateDevisPdf";
import {
  ANNEXE_SINISTRES, BAILLEUR_DEFAUT, CONDITIONS_GENERALES, CONDITIONS_PARTICULIERES_INTRO, CONTACTS_DELTA,
  FOURNISSEUR_DEFAUT, PIED_CONTRAT, type ArticleContrat,
} from "./contratLocFiTextes";

/**
 * 📄 CONTRAT DE LOCATION FINANCIÈRE (PDF, A4) — même structure que le modèle
 * Delta Services DSLOCFI : page de garde (locataire / fournisseur / bailleur),
 * conditions particulières et financières, page de signature, conditions
 * générales, annexes, contacts. La signature en ligne du locataire est
 * apposée dans l'encadré « LE LOCATAIRE » (zoneSignature).
 */

const ROUGE: [number, number, number] = [192, 0, 0];
const GRIS_FONCE: [number, number, number] = [70, 70, 70];
const BLEU_PETROLE: [number, number, number] = [49, 104, 128];
const TEXTE: [number, number, number] = [30, 30, 30];

const espaces = (t: string) => String(t ?? "").replace(/[   ]/g, " ");
const eur = (n: number) => espaces((Math.round((Number(n) || 0) * 100) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + " €";
const tva = (ht: number) => Math.round(ht * 20) / 100;

export interface ConditionsLocFi { numero_contrat: string; duree_mois: number; premier_loyer_ht: number; loyer_mensuel_ht: number }

export function calculerLocFi(prixHt: number, premierLoyerHt: number, dureeMois: number): { loyer_mensuel_ht: number; nb_loyers_suivants: number; pct_premier: number } {
  const n = Math.max(1, Math.round(dureeMois));
  const suivants = n - 1;
  const loyer = suivants > 0 ? Math.round(((prixHt - premierLoyerHt) / suivants) * 100) / 100 : 0;
  return { loyer_mensuel_ht: loyer, nb_loyers_suivants: suivants, pct_premier: prixHt > 0 ? (premierLoyerHt / prixHt) * 100 : 0 };
}

export function genererContratLocFiPdf(dv: DevisVente & { locfi: ConditionsLocFi }, machines: { reference: string; type?: string; immat?: string }[]):
  { base64: string; blob: Blob; filename: string; zoneSignature: ZoneSignature } {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18, H = 297;
  const lf = dv.locfi;
  const c = dv.client;

  // ── PAGE DE GARDE ──
  pdf.setFillColor(...GRIS_FONCE);
  pdf.lines([[118, 0], [0, 40], [-22, 22], [-96, 0]], 0, 24, [1, 1], "F", true);
  pdf.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(20);
  pdf.text("CONTRAT DE LOCATION", 12, 38);
  pdf.text("FINANCIERE", 12, 48);
  pdf.text(`N°${lf.numero_contrat}`, 12, 58);
  try { pdf.addImage(DELTA_LOGO_BASE64, "PNG", 128, 28, 70, 24); } catch { /* logo optionnel */ }

  let y = 98;
  const bloc = (titre: string, sous: string, lignes: string[], grisTitre = false) => {
    pdf.setTextColor(...GRIS_FONCE).setFont("helvetica", "bold").setFontSize(14).text(titre, M, y);
    const lt = pdf.getTextWidth(titre);
    pdf.setFontSize(9).text(sous, M + lt + 2, y);
    y += 2;
    pdf.setDrawColor(200, 200, 200).setLineWidth(0.4).line(M, y, W - M, y);
    y += 5;
    pdf.setFontSize(9.5).setTextColor(...(grisTitre ? ([110, 110, 110] as [number, number, number]) : TEXTE));
    lignes.forEach((l, i) => {
      if (!l) { y += 2; return; }
      pdf.setFont("helvetica", i === 0 && grisTitre ? "bold" : "italic").text(espaces(l), M, y);
      y += 4.6;
    });
    y += 2;
    pdf.setDrawColor(...ROUGE).setLineWidth(0.6).line(M, y, W - M, y);
    y += 12;
  };
  bloc("NOM ET ADRESSE DU LOCATAIRE", "(ci-après le « Locataire »)", [
    c.raison_sociale.toUpperCase(), ...(c.adresse ? [c.adresse.toUpperCase()] : []), [c.cp, (c.ville || "").toUpperCase()].filter(Boolean).join(" "), "",
    ...(c.siren ? [`SIREN ${c.siren}`] : []),
  ], true);
  bloc("DESIGNATION DU FOURNISSEUR", "(ci-après le « Fournisseur »)", [FOURNISSEUR_DEFAUT.nom, ...FOURNISSEUR_DEFAUT.adresse.split("\n"), "", `SIREN : ${FOURNISSEUR_DEFAUT.siren}`]);
  bloc("DESIGNATION DU BAILLEUR", "(ci-après le « Bailleur »)", [BAILLEUR_DEFAUT.nom, ...BAILLEUR_DEFAUT.adresse.split("\n"), "", `SIREN : ${BAILLEUR_DEFAUT.siren}`]);
  pdf.setFont("helvetica", "italic").setFontSize(9.5).setTextColor(...TEXTE);
  pdf.text(pdf.splitTextToSize("Le Locataire et le Bailleur étant ci-après individuellement désignés comme une « Partie » et collectivement comme les « Parties ».", 105), M, y);
  pdf.setFillColor(...ROUGE).rect(0, 262, W, 3, "F");

  // ── CONDITIONS PARTICULIÈRES / FINANCIÈRES ──
  pdf.addPage();
  y = 24;
  const titreSection = (t: string) => {
    pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(...ROUGE).text(t, M, y);
    y += 9;
  };
  titreSection("1.  CONDITIONS PARTICULIERES");
  pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...TEXTE);
  const intro = pdf.splitTextToSize(CONDITIONS_PARTICULIERES_INTRO, W - 2 * M);
  pdf.text(intro, M, y);
  y += intro.length * 4.4 + 4;
  pdf.setFont("helvetica", "italic").text("- LOCATION FINANCIERE –", M, y);
  y += 7;
  pdf.setFont("helvetica", "normal").setTextColor(...ROUGE).setFontSize(8.5).text("DESIGNATION DU MATERIEL LOUE :", M, y);
  y += 6;
  pdf.setFont("helvetica", "italic").setTextColor(110, 110, 110).setFontSize(9.5);
  for (const m of machines) { pdf.text(`-   Nacelle élévatrice ${m.reference}`, M + 4, y); y += 5; }
  y += 4;
  titreSection("2.  CONDITIONS FINANCIERES");

  const prix = dv.total_ht;
  const n = Math.max(1, lf.duree_mois);
  const xB = M, lB = W - 2 * M - 10, cx = xB + lB / 2;
  const modeles = machines.map((m) => [m.type ? `Modèle ${m.type}` : "Nacelle", m.immat].filter(Boolean).join(" – ")).join(" / ");
  pdf.setFillColor(...ROUGE).rect(xB, y, lB, 10, "F");
  pdf.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(machines.length > 1 ? 10 : 13).text(pdf.splitTextToSize(modeles, lB - 6)[0], cx, y + 7, { align: "center" });
  y += 10;
  const lignesBox: [string, boolean][] = [
    ["", false], ["DUREE IRREVOCABLE DE LA LOCATION :", true], [`${n} MOIS`, true], ["Paiement des loyers par prélèvement le 20 du mois", false], ["Périodicité : mensuelle", false], ["", false],
  ];
  const hHaut = lignesBox.length * 4.8 + 2;
  pdf.setFillColor(...BLEU_PETROLE).rect(xB, y, lB, hHaut, "F");
  let yy = y + 2;
  pdf.setTextColor(255, 255, 255);
  for (const [t, g] of lignesBox) { if (t) pdf.setFont("helvetica", g ? "bold" : "normal").setFontSize(g ? 10.5 : 9).text(t, cx, yy + 3.5, { align: "center" }); yy += 4.8; }
  y += hHaut + 2;
  const fin: [string, "titre" | "souligne" | "gras" | "vide"][] = [
    ["", "vide"], ["Location financière composée de la manière suivante :", "titre"], ["", "vide"],
    [machines.length > 1 ? "Prix d'achat des véhicules :" : "Prix d'achat du véhicule :", "souligne"], [`Montant HT : ${eur(prix)}`, "gras"], [`TVA : ${eur(tva(prix))}`, "gras"], [`Montant TTC : ${eur(prix + tva(prix))}`, "gras"], ["", "vide"],
    ["1er loyer majoré à verser à la signature du présent contrat", "souligne"], [`Montant HT : ${eur(lf.premier_loyer_ht)}`, "gras"], [`TVA : ${eur(tva(lf.premier_loyer_ht))}`, "gras"], [`Montant TTC : ${eur(lf.premier_loyer_ht + tva(lf.premier_loyer_ht))}`, "gras"], ["", "vide"],
    ...(n > 1 ? ([
      [`Montant des loyers mensuels sur ${n - 1} mois déduction faite du 1er loyer majoré :`, "souligne"], [`LOYER HT : ${eur(lf.loyer_mensuel_ht)}`, "gras"], [`TVA : ${eur(tva(lf.loyer_mensuel_ht))}`, "gras"], [`LOYER TTC : ${eur(lf.loyer_mensuel_ht + tva(lf.loyer_mensuel_ht))}`, "gras"], ["", "vide"],
    ] as [string, "souligne" | "gras" | "vide"][]) : []),
    [`Valeur de rachat à terme des ${n} mois : Offerte`, "souligne"], ["", "vide"],
  ];
  const hBas = fin.length * 4.9;
  pdf.setFillColor(...BLEU_PETROLE).rect(xB, y, lB, hBas, "F");
  yy = y;
  for (const [t, st] of fin) {
    if (st !== "vide") {
      pdf.setFont("helvetica", "bold").setFontSize(st === "titre" ? 10.5 : 9.8).setTextColor(255, 255, 255).text(t, cx, yy + 3.6, { align: "center" });
      if (st === "souligne") { const w = pdf.getTextWidth(t); pdf.setDrawColor(255, 255, 255).setLineWidth(0.25).line(cx - w / 2, yy + 4.4, cx + w / 2, yy + 4.4); }
    }
    yy += 4.9;
  }
  y += hBas;
  pdf.setDrawColor(40, 40, 40).setLineWidth(0.3).rect(xB, y - hBas - hHaut - 12, lB, hBas + hHaut + 12);

  // ── PAGE DE SIGNATURE ──
  pdf.addPage();
  y = 26;
  pdf.setFont("helvetica", "normal").setFontSize(10).setTextColor(...TEXTE);
  pdf.text(pdf.splitTextToSize("Le Locataire déclare accepter toutes les conditions du présent contrat de location, établi en autant d'exemplaires que de Parties.", W - 2 * M), M, y);
  y += 18;
  pdf.setFont("helvetica", "bolditalic").text("FAIT LE ______________________________", M, y);
  y += 10;
  pdf.text("A ____________________________________", M, y);
  y += 22;
  const zoneSignature: ZoneSignature = { page: pdf.getNumberOfPages(), x: M - 2, y, w: W - 2 * M - 6, h: 52 };
  for (const [titre, yBox] of [["LE LOCATAIRE", y], ["LE BAILLEUR", y + 64]] as [string, number][]) {
    pdf.setDrawColor(230, 190, 200).setLineWidth(0.3).rect(M - 2, yBox, W - 2 * M - 6, 52);
    pdf.setFont("helvetica", "bolditalic").setFontSize(11).setTextColor(...TEXTE).text(titre, M + 1, yBox + 5.5);
    pdf.setFontSize(8.5).text("TAMPON & SIGNATURE :", M + 1, yBox + 10);
  }

  // ── CONDITIONS GÉNÉRALES + ANNEXES ──
  pdf.addPage();
  y = 24;
  titreSection("3.  CONDITIONS GENERALES");
  const ecrireArticle = (a: ArticleContrat) => {
    if (y > 262) { pdf.addPage(); y = 22; }
    pdf.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(...ROUGE).text(a.titre, M, y);
    y += 6;
    for (const p of a.texte) {
      const puce = p.startsWith("- ");
      const sousTitre = /^\d+\.\d+ /.test(p);
      pdf.setFont("helvetica", sousTitre ? "bold" : "normal").setFontSize(8.3).setTextColor(...(sousTitre ? ([120, 40, 40] as [number, number, number]) : TEXTE));
      const lignes = pdf.splitTextToSize(puce ? p.slice(2) : p, W - 2 * M - (puce ? 8 : 0));
      for (let i = 0; i < lignes.length; i++) {
        if (y > 272) { pdf.addPage(); y = 22; pdf.setFont("helvetica", sousTitre ? "bold" : "normal").setFontSize(8.3).setTextColor(...TEXTE); }
        if (puce && i === 0) { pdf.setTextColor(...ROUGE).text("-", M + 3, y); pdf.setTextColor(...TEXTE); }
        pdf.text(lignes[i], M + (puce ? 8 : 0), y);
        y += 3.7;
      }
      y += puce ? 0.8 : 2.4;
    }
    y += 2.5;
  };
  CONDITIONS_GENERALES.forEach(ecrireArticle);

  pdf.addPage();
  y = 24;
  titreSection("4.  ANNEXES");
  pdf.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...TEXTE).text(ANNEXE_SINISTRES.titre, M, y);
  y += 7;
  ecrireArticle({ titre: "", texte: ANNEXE_SINISTRES.texte });
  y += 8;
  pdf.setFont("helvetica", "bolditalic").setFontSize(12).setTextColor(...TEXTE).text("Liste des contacts DELTA SERVICES", W / 2, y, { align: "center" });
  const wt = pdf.getTextWidth("Liste des contacts DELTA SERVICES");
  pdf.setDrawColor(...TEXTE).setLineWidth(0.3).line(W / 2 - wt / 2, y + 1, W / 2 + wt / 2, y + 1);
  y += 9;
  pdf.setFont("helvetica", "normal").setFontSize(9);
  for (const ct of CONTACTS_DELTA) {
    const l = pdf.splitTextToSize(ct, W - 2 * M - 8);
    if (y + l.length * 4 > 270) { pdf.addPage(); y = 22; }
    pdf.text("•", M + 2, y);
    pdf.text(l, M + 8, y);
    y += l.length * 4 + 4;
  }

  // ── En-têtes / pieds de page (numéro, mentions, paraphes) ──
  const pages = pdf.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFillColor(...GRIS_FONCE);
    pdf.lines([[28, 0], [0, 10], [-24, 0], [-4, -4]], W - 28, 6, [1, 1], "F", true);
    pdf.setFont("helvetica", "bold").setFontSize(11).setTextColor(255, 255, 255).text(String(p - 1), W - 12, 13, { align: "center" });
    pdf.setFillColor(150, 150, 150).rect(0, 9, 30, 1.2, "F");
    pdf.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...TEXTE);
    pdf.text(pdf.splitTextToSize(PIED_CONTRAT, 120), M - 10, 285);
    pdf.setDrawColor(...ROUGE).setLineWidth(0.6).line(138, 281, 138, H);
    pdf.setFont("helvetica", "italic").setFontSize(7).text("PARAPHES :", 142, 291);
    pdf.setDrawColor(120, 120, 120).setLineWidth(0.2).rect(160, 279, 34, 14);
  }

  const dataUri = pdf.output("datauristring");
  return {
    base64: dataUri.split(",")[1] || "",
    blob: pdf.output("blob"),
    filename: `Contrat_location_financiere_${lf.numero_contrat}.pdf`,
    zoneSignature,
  };
}
