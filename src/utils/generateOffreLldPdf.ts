import jsPDF from "jspdf";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import { LLD_CARTE_FRANCE, LLD_CARTE_MONDE, LLD_CLES, LLD_COUVERTURE, LLD_NACELLE } from "../assets/lldImages";
import type { ConfigLLD, OffreLLD } from "../types/lld";

/**
 * 📄 PDF de la PROPOSITION COMMERCIALE LLD (A4, 9 pages) — mise en page reprise
 * du modèle Delta Services (offre Hexavolt / Guintoli), avec les corrections du
 * cahier des charges : nouveau logo, une seule adresse, sommaire juste,
 * caution d'un mois, email du commercial exact.
 *  1 couverture · 2 client et responsable commercial · 3 sommaire · 4 votre
 *  agence · 5 notre offre de prix + « Bon pour accord » · 6 prestations ✓/✗ ·
 *  7 Klubb Group · 8 l'assurance · 9 dos de couverture.
 * Retourne la zone « Bon pour accord » (page 5) où la signature en ligne est apposée.
 */

const ROUGE: [number, number, number] = [200, 16, 46];
const ARDOISE: [number, number, number] = [74, 104, 128];
const ANTHRACITE: [number, number, number] = [58, 58, 58];
const TEXTE: [number, number, number] = [40, 40, 40];
const GRIS: [number, number, number] = [120, 120, 120];
const W = 210, H = 297, M = 18;

const nettoie = (t: string) => String(t ?? "").replace(/[   ]/g, " ");
const eur = (n: number, dec = 2) => nettoie((Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })) + " €";
const dateFr = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export interface ZoneSignatureOffre { page: number; x: number; y: number; w: number; h: number }

export function genererOffreLldPdf(o: OffreLLD, cfg: ConfigLLD): { base64: string; blob: Blob; filename: string; zoneSignature: ZoneSignatureOffre } {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const img = (data: string, x: number, y: number, w: number, h: number) => { try { pdf.addImage(data, data.startsWith("data:image/png") ? "PNG" : "JPEG", x, y, w, h); } catch { /* image optionnelle */ } };
  const texte = (t: string, x: number, y: number, o2: { align?: "left" | "center" | "right"; maxW?: number } = {}) => {
    const lignes = o2.maxW ? (pdf.splitTextToSize(nettoie(t), o2.maxW) as string[]) : nettoie(t).split("\n");
    pdf.text(lignes, x, y, { align: o2.align || "left" });
    return lignes.length;
  };
  const police = (style: "normal" | "bold" | "italic" | "bolditalic", taille: number, couleur: [number, number, number] = TEXTE) => pdf.setFont("helvetica", style).setFontSize(taille).setTextColor(...couleur);
  const soc = cfg.societe;
  const adresseSoc = soc.adresse.split("\n").map((l) => l.trim()).filter(Boolean);
  const commercialEmail = o.commercial.email.replace(/^rjlaroche@/i, "jlaroche@");
  const formule = o.full_services ? "Full services" : "Sans entretien";
  const materiel = o.materiel === "neuf" ? "Neuf Klubb" : "VO";

  /** Pied de page commun : mention Klubb + n° de page (onglet gris foncé) */
  const pied = (n: number) => {
    police("italic", 6.5, GRIS);
    texte("Dans un souci constant de qualité et de sécurité, KLUBB Group se réserve le droit de modifier les caractéristiques de ses produits.", W / 2, H - 7, { align: "center" });
    pdf.setFillColor(...ANTHRACITE).rect(W - 30, 0, 30, 8, "F");
    police("bold", 9, [255, 255, 255]);
    texte(String(n), W - 15, 5.7, { align: "center" });
  };
  /** ✓ verte ou ✗ rouge dessinées (la police PDF standard n'a pas ces glyphes) */
  const coche = (cx: number, cy: number, ok: boolean) => {
    pdf.setLineWidth(0.7);
    if (ok) { pdf.setDrawColor(30, 126, 60).line(cx - 1.8, cy, cx - 0.5, cy + 1.4); pdf.line(cx - 0.5, cy + 1.4, cx + 2, cy - 1.6); }
    else { pdf.setDrawColor(...ROUGE).line(cx - 1.6, cy - 1.6, cx + 1.6, cy + 1.6); pdf.line(cx - 1.6, cy + 1.6, cx + 1.6, cy - 1.6); }
  };
  const titreSection = (t: string, y: number) => { police("bold", 15, ROUGE); texte(t, M, y); pdf.setDrawColor(...ROUGE).setLineWidth(0.6).line(M, y + 2.5, M + 60, y + 2.5); };

  // ───────── 1. COUVERTURE ─────────
  img(LLD_COUVERTURE, 0, 0, W, 92);
  pdf.setFillColor(...ROUGE).rect(26, 92, 110, 48, "F");
  pdf.setFillColor(...ANTHRACITE).rect(0, 128, 118, 34, "F");
  police("bold", 24, [255, 255, 255]);
  texte("PROPOSITION", M, 142);
  texte("COMMERCIALE", M, 154);
  police("bold", 13, TEXTE);
  texte(soc.raison_sociale.toUpperCase(), M, 196);
  pdf.setDrawColor(...TEXTE).setLineWidth(0.4).line(M, 199, 150, 199);
  police("normal", 9.5, TEXTE);
  [adresseSoc.join(" - ") + " – FR", soc.telephone ? `Tél. : ${soc.telephone}` : "", soc.site_web ? `Site web : ${soc.site_web}` : "", soc.email ? `E-mail : ${soc.email}` : ""].filter(Boolean).forEach((l, i) => texte(l, M, 207 + i * 5.5));
  img(DELTA_LOGO_BASE64, W - M - 64, 236, 64, 23);
  pied(1);

  // ───────── 2. CLIENT / RESPONSABLE COMMERCIAL ─────────
  pdf.addPage();
  pdf.setFillColor(...ROUGE).rect(42, 12, 70, 270, "F");
  pdf.setFillColor(...ANTHRACITE).rect(112, 12, 58, 270, "F");
  police("bold", 22, [255, 255, 255]);
  const nomClient = pdf.splitTextToSize(nettoie(o.client.raison_sociale.toUpperCase()), 62) as string[];
  nomClient.slice(0, 4).forEach((l, i) => texte(l, 77, 150 + i * 10, { align: "center" }));
  police("bold", 8, [255, 255, 255]);
  texte("RESPONSABLE COMMERCIAL", 117, 150);
  police("normal", 8.5, [255, 255, 255]);
  [o.commercial.nom.toUpperCase(), o.commercial.tel || "", commercialEmail].filter(Boolean).forEach((l, i) => texte(l, 117, 156 + i * 4.5, { maxW: 50 }));
  police("bold", 8.5, [255, 255, 255]);
  texte(`DATE : ${dateFr(o.date)}`, 117, 178);
  pied(2);

  // ───────── 3. SOMMAIRE ─────────
  pdf.addPage();
  pdf.setFillColor(...ROUGE).rect(0, 22, 150, 14, "F");
  police("bold", 15, [255, 255, 255]);
  texte("SOMMAIRE", M, 31.5);
  const sommaire: [string, number][] = [["1 . VOTRE AGENCE", 4], ["2 . NOTRE OFFRE DE PRIX", 5], ["3 . PRESTATIONS INCLUSES", 6], ["4 . KLUBB GROUP", 7], ["5 . L'ASSURANCE", 8]];
  police("italic", 10, TEXTE);
  sommaire.forEach(([t, p], i) => {
    const y = 50 + i * 9;
    texte(t, M, y);
    texte(String(p), W - M, y, { align: "right" });
    pdf.setDrawColor(...GRIS).setLineWidth(0.2).line(M + pdf.getTextWidth(t) + 2, y, W - M - 6, y);
  });
  pied(3);

  // ───────── 4. VOTRE AGENCE ─────────
  pdf.addPage();
  img(LLD_NACELLE, 128, 0, 82, 190);
  titreSection("1 . VOTRE AGENCE", 28);
  police("italic", 9.5, TEXTE);
  texte("- Une équipe à vos côtés –", M, 38);
  let y = 48;
  const equipe = cfg.agence.length ? cfg.agence : [{ nom: o.commercial.nom, fonction: "Responsable commercial", email: commercialEmail, tel: o.commercial.tel }];
  for (const m of equipe.slice(0, 7)) {
    pdf.setFillColor(...ARDOISE).rect(M, y, 92, 15, "F");
    police("bold", 7.5, [255, 255, 255]);
    texte((m.fonction || "").toUpperCase(), M + 46, y + 4.5, { align: "center" });
    police("bold", 8.5, [255, 255, 255]);
    texte(m.nom, M + 46, y + 9, { align: "center" });
    police("normal", 7.5, [255, 255, 255]);
    texte([m.email, m.tel].filter(Boolean).join(" · "), M + 46, y + 13, { align: "center" });
    y += 19;
  }
  pied(4);

  // ───────── 5. NOTRE OFFRE DE PRIX ─────────
  pdf.addPage();
  titreSection("2 . NOTRE OFFRE DE PRIX", 28);
  const bx = M, bw = W - 2 * M;
  y = 38;
  pdf.setFillColor(...ROUGE).rect(bx, y, bw, 8, "F");
  police("bold", 10, [255, 255, 255]);
  texte(`${o.modele} — ${materiel} — ${formule}${o.quantite > 1 ? ` — ${o.quantite} nacelles` : ""}`, W / 2, y + 5.5, { align: "center" });
  y += 8;
  // Durées et loyers
  const lignesPrix: string[][] = [];
  if (o.courte_duree) {
    for (const d of o.durees) lignesPrix.push([`${d.mois} mois`, `${eur(d.loyer_ht)} HT / mois`, o.avec_assurance && d.loyer_assurance_ht ? `avec assurance : ${eur(d.loyer_assurance_ht)} HT / mois` : ""]);
  } else {
    for (const d of o.durees) lignesPrix.push([`${d.mois} mois`, `${eur(d.loyer_ht)} HT / mois`, o.avec_assurance && d.loyer_assurance_ht ? `avec assurance : ${eur(d.loyer_assurance_ht)} HT / mois` : ""]);
  }
  const hPrix = 10 + lignesPrix.length * 9;
  pdf.setFillColor(...ARDOISE).rect(bx, y, bw, hPrix, "F");
  police("italic", 9, [255, 255, 255]);
  texte(o.courte_duree ? "Courte durée — loyer par mois" : o.durees.length > 1 ? "Loyer mensuel selon la durée choisie (cochez votre choix)" : "Loyer mensuel", W / 2, y + 6, { align: "center" });
  lignesPrix.forEach((l, i) => {
    const yy = y + 12 + i * 9;
    pdf.setDrawColor(255, 255, 255).setLineWidth(0.4).rect(bx + 6, yy - 3.2, 4, 4);
    police("bold", 10, [255, 255, 255]);
    texte(`${l[0]} : ${l[1]}`, bx + 13, yy);
    if (l[2]) { police("normal", 8.5, [255, 255, 255]); texte(l[2], W - M - 6, yy, { align: "right" }); }
  });
  y += hPrix + 3;
  // Options + transport
  const opts = o.options.map((op) => `${op.libelle} : ${eur(op.prix_mensuel_ht)} HT / mois`);
  const transport = o.transport.mode === "offert" ? `Livraison de la nacelle${o.transport.adresse ? ` à ${o.transport.adresse}` : ""} : offerte` : `Livraison de la nacelle${o.transport.adresse ? ` à ${o.transport.adresse}` : ""} : ${eur(o.transport.prix_ht || 0)} HT (une fois)`;
  const lignesOpt = [transport, ...opts];
  const hOpt = 9 + lignesOpt.length * 6;
  pdf.setFillColor(...ARDOISE).rect(bx, y, bw, hOpt, "F");
  police("italic", 9, [255, 255, 255]);
  texte("Options", W / 2, y + 5.5, { align: "center" });
  lignesOpt.forEach((l, i) => {
    const yy = y + 11 + i * 6;
    if (i > 0) pdf.setDrawColor(255, 255, 255).setLineWidth(0.4).rect(bx + 6, yy - 3, 3.6, 3.6);
    police(i === 0 ? "normal" : "bold", 8.5, [255, 255, 255]);
    texte(l, bx + (i > 0 ? 12 : 6), yy, { maxW: bw - 16 });
  });
  y += hOpt + 3;
  // Kilométrage / heures / km sup
  pdf.setFillColor(...ARDOISE).rect(bx, y, bw, 24, "F");
  police("bold", 9, [255, 255, 255]);
  texte("KILOMÉTRAGE :", W / 2 - 2, y + 6, { align: "right" }); police("normal", 9, [255, 255, 255]); texte(`${nettoie(o.km_an.toLocaleString("fr-FR"))} km / an`, W / 2 + 2, y + 6);
  police("bold", 9, [255, 255, 255]); texte("HEURES NACELLE :", W / 2 - 2, y + 12, { align: "right" }); police("normal", 9, [255, 255, 255]); texte(o.heures, W / 2 + 2, y + 12);
  police("italic", 8, [255, 255, 255]);
  texte(`Tarification du kilomètre supplémentaire : ${eur(o.prix_km_sup)} HT — hors carburant.`, W / 2, y + 19, { align: "center" });
  y += 27;
  // Caution + validité + commentaire
  pdf.setFillColor(...ARDOISE).rect(bx, y, bw, 22, "F");
  police("bold", 8.5, [255, 255, 255]);
  texte(`CAUTION D'UN MOIS DE LOYER TTC AVANT LA MISE À DISPOSITION DU VÉHICULE`, W / 2, y + 6, { align: "center" });
  police("italic", 8.5, [255, 255, 255]);
  texte("La restitution des véhicules devra se faire dans un bon état de fonctionnement.", W / 2, y + 12, { align: "center" });
  police("bold", 8.5, [255, 255, 255]);
  texte(`- OFFRE VALABLE ${o.validite_jours} JOURS (jusqu'au ${dateFr(o.date_expiration)}) -`, W / 2, y + 18, { align: "center" });
  y += 25;
  if (o.commentaire) {
    police("normal", 8.5, TEXTE);
    const n = texte(o.commentaire, bx + 3, y + 5, { maxW: bw - 6 });
    pdf.setDrawColor(...GRIS).setLineWidth(0.3).rect(bx, y, bw, n * 4 + 6);
    y += n * 4 + 9;
  }
  // Bon pour accord (zone de signature en ligne)
  const yBpa = Math.min(Math.max(y + 6, 150), 240);
  const zoneSignature: ZoneSignatureOffre = { page: 5, x: bx, y: yBpa, w: bw, h: 44 };
  pdf.setDrawColor(...TEXTE).setLineWidth(0.4).rect(bx, yBpa, bw, 44);
  police("bold", 9, TEXTE);
  texte("BON POUR ACCORD", bx + 3, yBpa + 5.5);
  police("normal", 8, TEXTE);
  texte("Durée retenue : ________ mois", bx + 3, yBpa + 11);
  if (o.avec_assurance) {
    pdf.setDrawColor(...TEXTE).setLineWidth(0.3).rect(bx + 62, yBpa + 8, 3.2, 3.2); texte("sans assurance", bx + 67, yBpa + 11);
    pdf.rect(bx + 95, yBpa + 8, 3.2, 3.2); texte("avec assurance", bx + 100, yBpa + 11);
  }
  texte("DATE :                                   TAMPON & SIGNATURE :", bx + 3, yBpa + 16.5);
  pied(5);

  // ───────── 6. PRESTATIONS ✓ / ✗ ─────────
  pdf.addPage();
  titreSection("3 . PRESTATIONS INCLUSES", 28);
  const colonnes: [number, number][] = [[M, 82], [M + 92, 82]];
  const items = o.prestations;
  // répartition : on coupe la liste en deux à un titre de groupe proche du milieu
  let coupure = Math.ceil(items.length / 2);
  for (let i = coupure; i < items.length && i < coupure + 6; i++) if (items[i].libelle.startsWith("#")) { coupure = i; break; }
  const moities = [items.slice(0, coupure), items.slice(coupure)];
  moities.forEach((liste, ci) => {
    const [cx, cw] = colonnes[ci];
    let yy = 40;
    pdf.setFillColor(...ROUGE).rect(cx, yy, cw - 14, 6, "F");
    pdf.setFillColor(...ANTHRACITE).rect(cx + cw - 14, yy, 14, 6, "F");
    police("bold", 7.5, [255, 255, 255]);
    texte("PRESTATIONS", cx + (cw - 14) / 2, yy + 4.2, { align: "center" });
    texte("INCLUS", cx + cw - 7, yy + 4.2, { align: "center" });
    yy += 8;
    for (const p of liste) {
      if (p.libelle.startsWith("#")) {
        pdf.setFillColor(...ARDOISE).rect(cx, yy, cw, 5, "F");
        police("bold", 7, [255, 255, 255]);
        texte(p.libelle.replace(/^#\s*/, ""), cx + 2, yy + 3.6);
        yy += 6;
        continue;
      }
      police("italic", 7.5, TEXTE);
      const lignes = pdf.splitTextToSize(nettoie(p.libelle), cw - 20) as string[];
      const h = Math.max(5, lignes.length * 3.4 + 1.6);
      pdf.setFillColor(238, 238, 238).rect(cx, yy, cw - 14, h, "F");
      pdf.setFillColor(248, 248, 248).rect(cx + cw - 14, yy, 14, h, "F");
      texte(lignes.join("\n"), cx + 2, yy + 3.4);
      coche(cx + cw - 7, yy + h / 2, p.inclus);
      yy += h + 1;
    }
  });
  police("italic", 7, GRIS);
  texte("* sauf en cas de sinistre ou mauvaise utilisation", M, 262);
  pied(6);

  // ───────── 7. KLUBB GROUP ─────────
  pdf.addPage();
  titreSection("4 . KLUBB GROUP", 28);
  img(LLD_CARTE_FRANCE, M, 40, W - 2 * M, 93);
  img(LLD_CARTE_MONDE, M, 142, W - 2 * M, 95);
  pied(7);

  // ───────── 8. L'ASSURANCE ─────────
  pdf.addPage();
  titreSection("5 . L'ASSURANCE", 28);
  police("italic", 9.5, TEXTE);
  texte("Toutes vos démarches sont prises en charge par notre équipe.", M, 38);
  img(LLD_CLES, 128, 48, 54, 55);
  const blocs: [string, string[]][] = [
    ["ASSURANCE RC CIRCULATION ET GARANTIE DOMMAGE AU VÉHICULE CONFIÉ", ["Responsabilité civile circulation (dommages au tiers) et défense – recours.", "Dommages au véhicule confié dont bris de glace, vol, épave."]],
    ["GESTION ADMINISTRATIVE", ["Gestion des sinistres pour le compte du client.", "Relations avec les compagnies, convocation des experts.", "Négociations avec les réparateurs."]],
    ["PARTICIPATION FORFAITAIRE / CONTRIBUTION AUX FRAIS", ["Sinistre avec tiers en responsabilité totale ou partagée : facturation de la participation forfaitaire, soit 1 500 € HT / sinistre.", "Sinistre sans tiers identifié, vol, bris de glace et épave : facturation de la remise en état du véhicule au coût réel, plafonnée au montant de la contribution aux frais (1 500 € HT)."]],
    ["ACCOMPAGNEMENT", ["Analyses détaillées de votre sinistralité.", "Sensibilisation à la conduite sécuritaire."]],
  ];
  y = 48;
  for (const [titre, lignes] of blocs) {
    const tl = pdf.splitTextToSize(nettoie(titre), 90) as string[];
    pdf.setFillColor(...ROUGE).rect(M, y, 100, 4 + tl.length * 4, "F");
    police("bold", 7.5, [255, 255, 255]);
    texte(tl.join("\n"), M + 2, y + 3.8);
    y += 6 + tl.length * 4;
    for (const l of lignes) {
      police("italic", 8, TEXTE);
      const n = pdf.splitTextToSize(nettoie(l), 94).length;
      pdf.setFillColor(238, 238, 238).rect(M, y, 100, n * 3.6 + 2.5, "F");
      texte(l, M + 2, y + 3.4, { maxW: 94 });
      y += n * 3.6 + 4;
    }
    y += 4;
  }
  pied(8);

  // ───────── 9. DOS DE COUVERTURE ─────────
  pdf.addPage();
  pdf.setFillColor(...ARDOISE).rect(0, 0, W, 190, "F");
  pdf.setFillColor(96, 124, 146).triangle(0, 190, 140, 0, 210, 0, "F");
  pdf.setFillColor(...ROUGE).rect(0, 188, W, 2.5, "F");
  img(DELTA_LOGO_BASE64, W / 2 - 40, 205, 80, 29);
  police("italic", 10, ROUGE);
  if (soc.telephone) texte(soc.telephone, W / 2, 246, { align: "center" });
  if (soc.site_web) texte(soc.site_web, W / 2, 252, { align: "center" });
  police("normal", 8.5, TEXTE);
  adresseSoc.forEach((l, i) => texte(l, W / 2, 262 + i * 4.5, { align: "center" }));
  pied(9);

  pdf.setProperties({ title: `Proposition commerciale LLD ${o.numero} — ${o.client.raison_sociale}`, author: soc.raison_sociale });
  const base64 = pdf.output("datauristring").split(",")[1];
  return { base64, blob: pdf.output("blob"), filename: `Proposition_LLD_${o.numero}_${o.client.raison_sociale.replace(/[^\w-]+/g, "_")}.pdf`, zoneSignature };
}
