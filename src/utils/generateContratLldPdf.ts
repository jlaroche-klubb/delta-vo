import jsPDF from "jspdf";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import type { ConfigLLD, ContratLLD } from "../types/lld";
import { ANNEXE_CONTACTS_DEFAUT, ANNEXE_SINISTRES_DEFAUT, ANNEXE_TARIFS_DEFAUT, ANNEXE_VETUSTE_DEFAUT, CG_LLD_DEFAUT, CP_FULL_SERVICES_DEFAUT, CP_SANS_ENTRETIEN_DEFAUT } from "../data/contratLldTextes";

/**
 * 📑 PDF du CONTRAT DE LOCATION LLD (A4, ~25 pages) — mise en page reprise du
 * contrat DS2026LD-08-01 (MB CONNECT, août 2026) avec le nouveau logo :
 *  couverture (parties) · sommaire · 1. conditions particulières (matériel,
 *  prestations) · 2. conditions financières · signatures · 3. conditions
 *  générales (art. 1 à 16) · 4. mandat SEPA · 5. fiche locataire (préremplie)
 *  · 6. annexes (vétusté, tarifs de remise en état, sinistres, contacts).
 * Les textes viennent d'Admin → Paramètres LLD → Textes du contrat (sinon les
 * textes par défaut). Retourne la zone « LE LOCATAIRE » où la signature en
 * ligne est apposée (lot 4).
 */

const ROUGE: [number, number, number] = [200, 16, 46];
const BLEU: [number, number, number] = [51, 98, 121];
const ANTHRACITE: [number, number, number] = [58, 58, 58];
const TEXTE: [number, number, number] = [40, 40, 40];
const GRIS: [number, number, number] = [120, 120, 120];
const GRIS_CLAIR: [number, number, number] = [200, 200, 200];
const W = 210, H = 297, M = 18;
const Y_MAX = H - 28; // au-dessus du pied de page

const nettoie = (t: string) => String(t ?? "").replace(/[\u00A0\u202F\u2009]/g, " ");
const eur = (n: number, dec = 2) => nettoie((Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec })) + " €";
const dateFr = (iso?: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const espaceSiret = (s?: string) => (s || "").replace(/\s/g, "").replace(/^(\d{3})(\d{3})(\d{3})(\d{0,5})$/, (_m, a, b, c, d) => `${a} ${b} ${c}${d ? " " + d : ""}`);

export interface ZoneSignatureContrat { page: number; x: number; y: number; w: number; h: number }

type Style = "normal" | "bold" | "italic" | "bolditalic";

export function genererContratLldPdf(c: ContratLLD, cfg: ConfigLLD): { base64: string; blob: Blob; filename: string; zoneSignature: ZoneSignatureContrat; pages: number } {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const img = (data: string, x: number, y: number, w: number, h: number) => { try { pdf.addImage(data, data.startsWith("data:image/png") ? "PNG" : "JPEG", x, y, w, h); } catch { /* image optionnelle */ } };
  const police = (style: Style, taille: number, couleur: [number, number, number] = TEXTE) => pdf.setFont("helvetica", style).setFontSize(taille).setTextColor(...couleur);
  const texte = (t: string, x: number, y: number, o: { align?: "left" | "center" | "right"; maxW?: number } = {}) => {
    const lignes = o.maxW ? (pdf.splitTextToSize(nettoie(t), o.maxW) as string[]) : nettoie(t).split("\n");
    pdf.text(lignes, x, y, { align: o.align || "left" });
    return lignes.length;
  };
  const tx = cfg.textes_contrat || {};
  const soc = cfg.societe;
  const adresseSoc = (soc.adresse || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const fourn = cfg.fournisseur;
  const adresseFourn = (fourn.adresse || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const formule = c.full_services ? "FULL SERVICES" : "SANS ENTRETIEN";
  const cl = c.client;
  const sepa = cfg.sepa;

  // ───────── chrome commun : barre grise, onglet n° de page, pied avec paraphes ─────────
  let numPage = 0; // numéro imprimé (la couverture n'en a pas)
  const entete = () => {
    numPage += 1;
    pdf.setFillColor(...GRIS_CLAIR).rect(0, 8, 32, 1.8, "F");
    pdf.setFillColor(...ANTHRACITE);
    // onglet biseauté en haut à droite
    (pdf as any).triangle(W - 34, 0, W - 30, 10, W - 34, 10, "F");
    pdf.rect(W - 30, 0, 30, 10, "F");
    police("bold", 11, [255, 255, 255]);
    texte(String(numPage), W - 15, 7, { align: "center" });
  };
  const pied = () => {
    police("bold", 7, ROUGE); texte(soc.raison_sociale || "DELTA SERVICES", M, H - 14);
    const wSoc = pdf.getTextWidth(soc.raison_sociale || "DELTA SERVICES");
    police("normal", 7, TEXTE);
    texte(` / ${adresseSoc.join(" / ")}${soc.telephone ? ` / Tel. ${soc.telephone}` : ""}`, M + wSoc + 0.5, H - 14);
    texte(`Siren : ${soc.siren}${soc.siren ? ` / N° TVA intracommunautaire FR ${tvaDepuisSiren(soc.siren)}` : ""}`, M, H - 10.5);
    pdf.setFillColor(...ROUGE).rect(W - 70, H - 20, 1.2, 12, "F");
    police("normal", 7.5, TEXTE); texte("PARAPHES :", W - 65, H - 12);
    pdf.setDrawColor(...ANTHRACITE).setLineWidth(0.3).rect(W - 43, H - 20, 27, 11);
  };
  const nouvellePage = () => { pdf.addPage(); entete(); pied(); return 22; };
  const titreSection = (t: string, y: number) => { police("bold", 13, ROUGE); texte(t, M, y); return y + 10; };

  // ───────── moteur de texte au fil de l'eau (saut de page automatique) ─────────
  const flux = { y: 0 };
  const assure = (h: number) => { if (flux.y + h > Y_MAX) flux.y = nouvellePage(); };
  const para = (t: string, o: { style?: Style; taille?: number; couleur?: [number, number, number]; indent?: number; puce?: string; apres?: number; avant?: number } = {}) => {
    const taille = o.taille ?? 8.5, inter = taille * 0.42, indent = o.indent ?? 0;
    police(o.style || "normal", taille, o.couleur || TEXTE);
    const largeur = W - 2 * M - indent - (o.puce ? 5 : 0);
    const lignes = pdf.splitTextToSize(nettoie(t), largeur) as string[];
    if (o.avant) { flux.y += o.avant; }
    assure(Math.min(lignes.length, 3) * inter + 2);
    lignes.forEach((l, i) => {
      assure(inter);
      if (i === 0 && o.puce) { police(o.style || "normal", taille, o.couleur || TEXTE); pdf.text(o.puce, M + indent, flux.y); }
      pdf.text(l, M + indent + (o.puce ? 5 : 0), flux.y);
      flux.y += inter;
    });
    flux.y += o.apres ?? 1.6;
  };
  /** Texte structuré : une ligne = un paragraphe ; « - » « o » « • » = puces ; MAJUSCULES / « Article n » = titres */
  const blocTexte = (brut: string, opts: { articles?: boolean } = {}) => {
    const lignes = String(brut || "").split("\n");
    for (const brute of lignes) {
      const l = brute.trim();
      if (!l) { flux.y += 1.5; continue; }
      if (opts.articles && /^Article\s+\d+/i.test(l)) { para(l.replace(/\s+-\s+/, " – "), { style: "bold", taille: 9.5, couleur: ROUGE, avant: 3, apres: 2.5 }); continue; }
      if (/^[-–]\s+/.test(l)) { para(l.replace(/^[-–]\s+/, ""), { puce: "-", indent: 6 }); continue; }
      if (/^o\s+/.test(l)) { para(l.replace(/^o\s+/, ""), { puce: "o", indent: 12 }); continue; }
      if (/^•\s+/.test(l)) { para(l.replace(/^•\s+/, ""), { puce: "•", indent: 4, style: /^•\s+[A-ZÉÈ][^.]{0,60}$/.test(l) ? "bold" : "normal" }); continue; }
      if (l.length > 8 && l === l.toUpperCase() && /[A-Z]/.test(l)) { para(l, { style: "bold", taille: 8.5, couleur: ROUGE, avant: 2, apres: 2.5 }); continue; }
      para(l);
    }
  };
  const caseCochee = (x: number, y: number, ok: boolean) => {
    pdf.setDrawColor(...TEXTE).setLineWidth(0.3).rect(x, y - 2.6, 3, 3);
    if (ok) { pdf.setLineWidth(0.6).line(x + 0.6, y - 1.2, x + 1.3, y - 0.3); pdf.line(x + 1.3, y - 0.3, x + 2.6, y - 2.3); }
  };
  const champ = (lib: string, val: string | undefined, y: number, o: { x?: number; w?: number; lignes?: number } = {}) => {
    const x = o.x ?? M + 4, w = o.w ?? W - 2 * M - 8;
    police("bold", 8, TEXTE); texte(lib, x, y);
    const lx = x + Math.max(pdf.getTextWidth(lib) + 2, 38);
    police("normal", 9, BLEU);
    const n = o.lignes ?? 1;
    const lignes = val ? (pdf.splitTextToSize(nettoie(val), w - (lx - x)) as string[]).slice(0, n) : [];
    for (let i = 0; i < n; i++) {
      if (lignes[i]) pdf.text(lignes[i], lx, y + i * 5.5);
      pdf.setDrawColor(...GRIS_CLAIR).setLineWidth(0.25).line(lx, y + 1 + i * 5.5, x + w, y + 1 + i * 5.5);
    }
    return y + n * 5.5 + 3;
  };

  // ═════════ COUVERTURE (parties) ═════════
  pdf.setFillColor(...ANTHRACITE);
  pdf.rect(0, 12, 118, 56, "F");
  (pdf as any).triangle(118, 12, 128, 12, 118, 68, "F");
  police("bold", 20, [255, 255, 255]);
  texte("CONTRAT DE LOCATION", 10, 30);
  texte(formule, 10, 41);
  police("bold", 10, [255, 255, 255]);
  texte(`Référence du Contrat : N°${c.numero}`, 10, 52);
  if (c.rang && c.rang_total && c.rang_total > 1) { police("normal", 8.5, [255, 255, 255]); texte(`Contrat ${c.rang} / ${c.rang_total} — offre ${c.offre_numero || ""}`, 10, 60); }
  img(DELTA_LOGO_BASE64, 138, 16, 62, 23);

  const bloc = (titre: string, sous: string, lignes: string[], y: number) => {
    police("bold", 13, ANTHRACITE); texte(titre, M, y);
    const wTitre = pdf.getTextWidth(titre);
    police("normal", 8.5, ANTHRACITE); texte(sous, M + wTitre + 2, y);
    pdf.setDrawColor(...ANTHRACITE).setLineWidth(0.5).line(M, y + 2.5, W - M, y + 2.5);
    police("normal", 9, TEXTE);
    let yy = y + 9;
    lignes.filter(Boolean).forEach((l) => { texte(l, M, yy); yy += 4.8; });
    pdf.setDrawColor(...GRIS_CLAIR).setLineWidth(0.4).line(M, yy + 1, W - M, yy + 1);
    return yy + 12;
  };
  let y = 92;
  y = bloc("NOM ET ADRESSE DU LOCATAIRE", "(ci-après le « Locataire »)", [
    `Locataire : ${cl.raison_sociale}`, cl.adresse || "", [cl.cp, cl.ville].filter(Boolean).join(" "),
    cl.siret ? `SIRET : ${espaceSiret(cl.siret)}` : cl.siren ? `SIREN : ${espaceSiret(cl.siren)}` : "",
    cl.email || cl.contact_email ? `Mail : ${cl.email || cl.contact_email}` : "",
  ], y);
  y = bloc("DESIGNATION DU FOURNISSEUR", "(ci-après le « Fournisseur »)", [fourn.raison_sociale, ...adresseFourn, "", fourn.siren ? `SIREN : ${fourn.siren}` : ""], y);
  y = bloc("DESIGNATION DU BAILLEUR", "(ci-après le « Bailleur »)", [soc.raison_sociale, ...adresseSoc, "", `SIREN : ${soc.siren}`], y);
  police("normal", 9, TEXTE);
  texte("Le Locataire et le Bailleur étant ci-après individuellement désignés comme la « Partie » et collectivement comme les « Parties ».", M, y + 2, { maxW: W - 2 * M });
  pdf.setFillColor(...ROUGE).rect(0, H - 30, W, 2, "F");
  img(DELTA_LOGO_BASE64, W / 2 - 30, H - 25, 60, 22);

  // ═════════ SOMMAIRE (rempli à la fin, quand les numéros de page sont connus) ═════════
  const pageSommaire = 2;
  nouvellePage();
  const sommaire: { titre: string; page: number }[] = [];

  // ═════════ 1. CONDITIONS PARTICULIÈRES ═════════
  flux.y = nouvellePage();
  sommaire.push({ titre: "1. CONDITIONS PARTICULIERES", page: numPage });
  flux.y = titreSection("1. CONDITIONS PARTICULIERES", flux.y + 2);
  para("Le locataire reconnaît que le matériel loué a bien un rapport direct avec son activité principale et que ce faisant le Code de la Consommation ne trouvera pas à s'appliquer.", { style: "bold", apres: 6 });
  para(`- LOCATION ${formule} –`, { style: "italic", apres: 4 });
  para("DESIGNATION DU MATERIEL LOUE :", { couleur: ROUGE, apres: 3 });
  para(`Matériel : ${c.immat ? c.immat : `${c.modele} (immatriculation attribuée à la livraison)`}${c.immat ? ` — ${c.modele}` : ""}`, { indent: 8, apres: 3 });
  caseCochee(M + 14, flux.y, c.materiel === "neuf"); police("normal", 8.5, TEXTE); pdf.text("Véhicule Neuf", M + 19, flux.y); flux.y += 5;
  caseCochee(M + 14, flux.y, c.materiel === "vo"); pdf.text("Véhicule Rétrofité", M + 19, flux.y); flux.y += 6;
  para("(Ci-après le « Matériel Loué »)", { apres: 5 });
  blocTexte(c.full_services ? (tx.cp_full || CP_FULL_SERVICES_DEFAUT) : (tx.cp_sans || CP_SANS_ENTRETIEN_DEFAUT));

  // ═════════ 2. CONDITIONS FINANCIÈRES ═════════
  flux.y = nouvellePage();
  sommaire.push({ titre: "2. CONDITIONS FINANCIERES", page: numPage });
  y = titreSection("2. CONDITIONS FINANCIERES", flux.y + 2);
  const bx = M, bw = W - 2 * M;
  pdf.setFillColor(...ROUGE).rect(bx, y, bw, 24, "F");
  police("bold", 12, [255, 255, 255]); texte(c.modele, bx + 6, y + 10);
  police("bold", 10, [255, 255, 255]); texte(c.materiel === "neuf" ? "Véhicule neuf" : "Véhicule rétrofit", bx + 6, y + 18);
  const lignesFin: { t: string; g?: boolean; taille?: number; esp?: number }[] = [
    { t: `Durée d'Engagement : ${c.duree_mois} MOIS`, g: true, taille: 11, esp: 8 },
    { t: "Terme à échoir", g: true, taille: 8, esp: 7 },
    { t: `      >  Paiement des loyers par prélèvement le ${c.jour_prelevement} du mois`, g: true, taille: 8, esp: 7 },
    { t: "Périodicité : mensuelle", g: true, taille: 8, esp: 8 },
    { t: `Loyer Mensuel HT : ${eur(c.loyer_ht)} HT`, g: true, taille: 11, esp: 7 },
    ...(c.assurance ? [{ t: `Montant assurance : ${eur(c.assurance_ht)} HT`, g: true, taille: 11, esp: 7 }] : []),
    ...c.options.map((o) => ({ t: `Option ${o.libelle} : ${eur(o.prix_mensuel_ht)} HT`, g: true, taille: 9.5, esp: 6 })),
    { t: `TOTAL HT : ${eur(c.total_mensuel_ht)}`, g: true, taille: 11, esp: 6 },
    { t: `TVA : ${eur(c.tva_ht)}`, g: true, taille: 11, esp: 6 },
    { t: `LOYER TTC : ${eur(c.total_mensuel_ttc)}`, g: true, taille: 11, esp: 10 },
    { t: `Assurance Tout Risque :  ${c.assurance ? "OUI" : "NON"}`, g: true, taille: 11, esp: 5 },
    { t: "(RC circulation, dommages divers, et bris de machine)", g: true, taille: 7.5, esp: 9 },
    { t: `Kilométrage : ${c.km_an.toLocaleString("fr-FR")} km / an — km supplémentaire ${eur(c.prix_km_sup)} HT`, g: true, taille: 8, esp: 6 },
    { t: `Transport / livraison : ${c.transport.mode === "offert" ? "offert" : `${eur(c.transport.prix_ht || 0)} HT`}${c.transport.adresse ? ` — ${c.transport.adresse}` : ""}`, g: true, taille: 8, esp: 9 },
    { t: `Date de livraison souhaitée : ${c.date_livraison_souhaitee ? dateFr(c.date_livraison_souhaitee) : "Rapide"}`, g: true, taille: 8, esp: 7 },
    { t: `Montant de la caution : ${eur(c.caution_ttc)} TTC`, g: true, taille: 11, esp: 6 },
  ];
  const hBox = 16 + lignesFin.reduce((s, l) => s + (l.esp || 6), 0);
  pdf.setFillColor(...BLEU).rect(bx, y + 24, bw, hBox, "F");
  let yy = y + 24 + 12;
  for (const l of lignesFin) { police(l.g ? "bold" : "normal", l.taille || 9, [255, 255, 255]); texte(l.t, bx + 6, yy, { maxW: bw - 12 }); yy += l.esp || 6; }
  police("italic", 7.5, GRIS);
  texte(`Caution = 1 mois de loyer TTC, restituée en fin de contrat après état des lieux. Loyers payables d'avance par prélèvement SEPA (mandat page ${0}).`, M, yy + 12, { maxW: bw });
  const yCautionNote = yy + 12; // réécrit à la fin avec le bon n° de page

  // ═════════ SIGNATURES ═════════
  y = nouvellePage() + 4;
  police("normal", 9.5, TEXTE);
  texte("Le Locataire déclare accepter toutes les conditions du présent contrat de location, établi en autant d'exemplaires que de Parties.", M, y, { maxW: W - 2 * M });
  y += 18;
  police("normal", 9.5, TEXTE);
  texte("FAIT LE  _______________________________", M, y); y += 9;
  texte("A  ____________________________________", M, y); y += 20;
  const zoneSignature: ZoneSignatureContrat = { page: numPage + 1, x: M, y, w: 85, h: 52 };
  pdf.setDrawColor(...ANTHRACITE).setLineWidth(0.4).rect(M, y, 85, 52);
  police("bold", 9.5, TEXTE); texte("LE LOCATAIRE", M + 3, y + 6);
  police("normal", 8, TEXTE); texte("TAMPON & SIGNATURE :", M + 3, y + 11);
  pdf.setDrawColor(...ANTHRACITE).setLineWidth(0.4).rect(W - M - 85, y, 85, 52);
  police("bold", 9.5, TEXTE); texte("LE BAILLEUR", W - M - 82, y + 6);
  police("normal", 8, TEXTE); texte("TAMPON & SIGNATURE :", W - M - 82, y + 11);
  police("normal", 8, GRIS); texte(`${soc.raison_sociale}${c.commercial?.nom ? ` — ${c.commercial.nom}` : ""}`, W - M - 82, y + 47);

  // ═════════ 3. CONDITIONS GÉNÉRALES ═════════
  flux.y = nouvellePage();
  sommaire.push({ titre: "3. CONDITIONS GENERALES", page: numPage });
  flux.y = titreSection("3. CONDITIONS GENERALES", flux.y + 2);
  police("italic", 7.5, GRIS); texte(`Version ${c.cg_version || tx.cg_version || ""}`, W - M, flux.y - 8, { align: "right" });
  blocTexte(tx.cg || CG_LLD_DEFAUT, { articles: true });

  // ═════════ 4. MANDAT SEPA ═════════
  y = nouvellePage();
  sommaire.push({ titre: "4. MANDAT DE PRELEVEMENT SEPA (A COMPLETER)", page: numPage });
  y = titreSection("4. MANDAT DE PRELEVEMENT SEPA (A COMPLETER)", y + 2);
  pdf.setDrawColor(...ANTHRACITE).setLineWidth(0.3).rect(M, y, W - 2 * M, 200);
  police("bold", 11, ROUGE); texte("MANDAT de Prélèvement SEPA", W / 2 - 15, y + 8, { align: "center" });
  img(DELTA_LOGO_BASE64, W - M - 42, y + 2, 40, 15);
  police("bold", 7, ROUGE); texte("Référence Unique du Mandat", M + 2, y + 15);
  police("normal", 8, TEXTE); texte(`${c.numero}  (RUM attribuée par ${sepa.creancier || soc.raison_sociale})`, M + 48, y + 15);
  pdf.line(M, y + 19, W - M, y + 19);
  police("normal", 6.5, TEXTE);
  texte(`En signant ce formulaire de mandat, vous autorisez (A) ${sepa.creancier || soc.raison_sociale} à envoyer des instructions à votre banque pour débiter votre compte, et (B) votre banque à débiter votre compte conformément aux instructions de ${sepa.creancier || soc.raison_sociale}. Vous bénéficiez du droit d'être remboursé par votre banque selon les conditions décrites dans la convention que vous avez passée avec elle. Une demande de remboursement doit être présentée dans les 8 semaines suivant la date de débit de votre compte pour un prélèvement autorisé.`, M + 2, y + 24, { maxW: W - 2 * M - 4 });
  let ys = y + 40;
  const ligneSepa = (lib: string, val: string, sous: string, cases?: number) => {
    police("normal", 8, ROUGE); texte(lib, M + 2, ys);
    const x0 = M + 48;
    if (cases) {
      pdf.setDrawColor(...GRIS).setLineWidth(0.2);
      for (let i = 0; i < cases; i++) pdf.rect(x0 + i * 4.2, ys - 3.5, 4.2, 4.5);
      police("bold", 8, TEXTE);
      val.replace(/\s/g, "").split("").slice(0, cases).forEach((ch, i) => pdf.text(ch, x0 + i * 4.2 + 1.1, ys));
    } else {
      police("bold", 8.5, TEXTE); texte(val, x0, ys);
      pdf.setDrawColor(...GRIS).setLineWidth(0.2).line(x0, ys + 1, W - M - 4, ys + 1);
    }
    police("normal", 6, GRIS); texte(sous, x0, ys + 4.5);
    ys += 10;
  };
  ligneSepa("Votre Nom *", cl.raison_sociale, "Nom / Prénoms du débiteur");
  ligneSepa("Votre adresse *", cl.adresse || "", "Numéro et nom de la rue");
  ligneSepa("", `${cl.cp || ""}  ${cl.ville || ""}`.trim(), "Code postal / Ville");
  ligneSepa("", "FRANCE", "Pays");
  ligneSepa("Les coordonnées de votre compte *", "", "Numéro d'identification international du compte bancaire - IBAN", 27);
  ligneSepa("", "", "Code international d'identification de votre banque - BIC", 11);
  ligneSepa("Nom du créancier *", sepa.creancier || soc.raison_sociale, "Nom du créancier");
  ligneSepa("I.C.S *", sepa.ics || "", "Identifiant Créancier SEPA", 13);
  const adrCre = (sepa.adresse_creancier || soc.adresse || "").split("\n").map((l) => l.trim()).filter(Boolean);
  ligneSepa("", adrCre[0] || "", "Numéro et nom de la rue");
  ligneSepa("", `${adrCre.slice(1).join(" ")}  —  FRANCE`, "Code postal / Ville / Pays");
  police("normal", 8, ROUGE); texte("Type de paiement *", M + 2, ys);
  police("normal", 8, TEXTE); texte("Paiement récurrent/répétitif", M + 48, ys); caseCochee(M + 90, ys, true); texte("Paiement ponctuel", M + 100, ys); caseCochee(M + 128, ys, false); ys += 10;
  ligneSepa("Signé à *", "", "Lieu / Date");
  police("normal", 8, ROUGE); texte("Signature(s) *", M + 2, ys);
  pdf.setDrawColor(...GRIS).setLineWidth(0.3).rect(M + 48, ys - 4, W - M - 4 - (M + 48), 26);
  police("normal", 6.5, GRIS); texte("Veuillez tamponner et signer ici", M + 50, ys);
  ys += 28;
  police("normal", 6, GRIS);
  texte("Note : vos droits concernant le présent mandat sont expliqués dans un document que vous pouvez obtenir auprès de votre banque. Les informations contenues dans le présent mandat sont destinées à n'être utilisées par le créancier que pour la gestion de sa relation avec son client.", M + 2, ys, { maxW: W - 2 * M - 4 });
  ys += 9;
  police("bold", 7, TEXTE); texte("Contrat concerné :", M + 2, ys); police("normal", 7, TEXTE); texte(`Contrat de location ${formule.toLowerCase()} n° ${c.numero} — ${c.modele}${c.immat ? ` (${c.immat})` : ""}`, M + 30, ys);
  ys += 6;
  police("bold", 7, TEXTE); texte("A retourner à :", M + 2, ys); police("normal", 7, ROUGE); texte(`${soc.raison_sociale}${soc.email ? ` — ${soc.email}` : ""}`, M + 30, ys);

  // ═════════ 5. FICHE LOCATAIRE ═════════
  y = nouvellePage();
  sommaire.push({ titre: "5. FORMULAIRE FICHE LOCATAIRE (A COMPLETER)", page: numPage });
  y = titreSection("5. FORMULAIRE FICHE LOCATAIRE (A COMPLETER)", y + 2);
  police("normal", 8.5, TEXTE); texte("NB : Tous les champs sont obligatoires", M, y); y += 10;
  const sousTitre = (t: string, yy2: number, sous?: string) => { police("bold", 10, ANTHRACITE); texte(t, M + 4, yy2); if (sous) { police("normal", 7.5, GRIS); texte(sous, M + 4, yy2 + 4); } return yy2 + (sous ? 11 : 8); };
  y = sousTitre("ENTREPRISE", y);
  y = champ("SOCIETE :", cl.raison_sociale, y);
  y = champ("ADRESSE POSTALE :", [cl.adresse, [cl.cp, cl.ville].filter(Boolean).join(" ")].filter(Boolean).join("\n"), y, { lignes: 2 });
  y = champ("SIRET :", espaceSiret(cl.siret || cl.siren), y);
  y = champ("N° DE TVA :", cl.tva_intra, y);
  y = champ("CODE NAF :", cl.naf, y);
  y = champ("TELEPHONE :", cl.telephone || cl.contact_tel, y);
  y = champ("FAX :", cl.fax, y);
  y = champ("EMAIL :", cl.email || cl.contact_email, y);
  y += 4;
  y = sousTitre("ADRESSE DE FACTURATION (SI DIFFERENTE)", y);
  y = champ("SOCIETE :", cl.facturation_societe, y);
  y = champ("Adresse email :", cl.facturation_email, y);
  y = champ("ADRESSE POSTALE :", cl.facturation_adresse, y, { lignes: 2 });
  y += 4;
  y = sousTitre("SIGNATAIRE DU CONTRAT", y);
  y = champ("NOM :", cl.contact_nom, y);
  y = champ("TELEPHONE :", cl.contact_tel, y);
  y = champ("EMAIL :", cl.contact_email, y);

  y = nouvellePage() + 4;
  y = sousTitre("CONTACT COMPTABILITE FOURNISSEUR", y);
  y = champ("NOM :", cl.contact_compta?.nom, y);
  y = champ("TELEPHONE :", cl.contact_compta?.tel, y);
  y = champ("EMAIL :", cl.contact_compta?.email, y);
  y += 6;
  y = sousTitre("CONTACT POUR LA MAINTENANCE DU VEHICULE", y, "(Révision, visite périodique nacelle, demande de relevé kilométrique)");
  y = champ("NOM :", cl.contact_maintenance?.nom, y);
  y = champ("TELEPHONE :", cl.contact_maintenance?.tel, y);
  y = champ("EMAIL :", cl.contact_maintenance?.email, y);
  y += 6;
  y = sousTitre("N° DE COMMANDE", y);
  police("bold", 8, TEXTE); texte("OBLIGATOIRE :", M + 4, y);
  caseCochee(M + 44, y, cl.commande_obligatoire === true); police("normal", 8.5, TEXTE); texte("OUI", M + 49, y);
  caseCochee(M + 74, y, cl.commande_obligatoire === false); texte("NON", M + 79, y);
  y += 9;
  police("bold", 8, TEXTE); texte("SI OUI, PERSONNE A CONTACTER POUR L'OBTENTION DU NUMERO :", M + 4, y); y += 7;
  y = champ("NOM :", cl.contact_commande?.nom, y);
  y = champ("EMAIL :", cl.contact_commande?.email, y);
  y = champ("TELEPHONE :", cl.contact_commande?.tel, y);
  y += 6;
  police("italic", 7.5, GRIS);
  texte("Pour un nouveau client, une copie de la pièce d'identité du signataire et un RIB sont joints au dossier lors de la signature en ligne.", M + 4, y, { maxW: W - 2 * M - 8 });

  // ═════════ 6. ANNEXES ═════════
  flux.y = nouvellePage();
  sommaire.push({ titre: "6. ANNEXES", page: numPage });
  flux.y = titreSection("6. ANNEXES", flux.y + 2);
  // Annexe 1 — vétusté : texte + tableau des taux
  const vet = (tx.annexe_vetuste || ANNEXE_VETUSTE_DEFAUT).split("\n");
  const iTaux = vet.findIndex((l) => /^Taux de vétusté\s*\/\s*âge/i.test(l));
  blocTexte((iTaux >= 0 ? vet.slice(0, iTaux) : vet).join("\n"));
  if (iTaux >= 0 && vet[iTaux + 1] && vet[iTaux + 2]) {
    const ages = vet[iTaux + 1].split(/\s+(?=\d|et)/).map((s) => s.trim()).filter(Boolean);
    const taux = vet[iTaux + 2].split(/\s+/).filter(Boolean);
    const n = Math.max(ages.length, taux.length), cw = (W - 2 * M - 30) / Math.max(n, 1);
    assure(16);
    const y0 = flux.y;
    pdf.setFillColor(...ANTHRACITE).rect(M, y0, 30, 6, "F"); pdf.setFillColor(...ANTHRACITE).rect(M, y0 + 6, 30, 6, "F");
    police("bold", 7, [255, 255, 255]); texte("Âge (années)", M + 2, y0 + 4.2); texte("Taux de vétusté", M + 2, y0 + 10.2);
    pdf.setDrawColor(...GRIS).setLineWidth(0.2);
    for (let i = 0; i < n; i++) {
      pdf.rect(M + 30 + i * cw, y0, cw, 6); pdf.rect(M + 30 + i * cw, y0 + 6, cw, 6);
      police("bold", 7.5, TEXTE); texte(ages[i] || "", M + 30 + i * cw + cw / 2, y0 + 4.2, { align: "center" });
      police("normal", 7.5, ROUGE); texte(taux[i] || "", M + 30 + i * cw + cw / 2, y0 + 10.2, { align: "center" });
    }
    flux.y = y0 + 16;
  }
  // Annexe 2 — tarifs de remise en état (tableau libellé / montant)
  flux.y = nouvellePage();
  const tar = (tx.annexe_tarifs || ANNEXE_TARIFS_DEFAUT).split("\n");
  para(tar[0] || "TARIFS DES FRAIS DE REMISE EN ETAT", { style: "bold", taille: 9.5, couleur: ROUGE, apres: 3 });
  if (tar[1]) para(tar[1], { apres: 4 });
  for (const brute of tar.slice(2)) {
    const l = brute.trim();
    if (!l) continue;
    if (/Montant HT facturé$/i.test(l) || (l === l.toUpperCase() && !/\d/.test(l) && l.length < 40)) {
      assure(8); flux.y += 1.5;
      pdf.setFillColor(...ANTHRACITE).rect(M, flux.y - 4, W - 2 * M, 5.5, "F");
      police("bold", 7.5, [255, 255, 255]); texte(l.replace(/\s*Montant HT facturé$/i, ""), M + 2, flux.y); texte("Montant HT facturé", W - M - 2, flux.y, { align: "right" });
      flux.y += 5; continue;
    }
    const m = l.match(/^(.*?)\s*(?:Facturé\s*)?((?:Sur devis)|(?:[\d\s]+,\d{2}\s*€))$/i);
    const lib = m ? m[1].trim() : l, montant = m ? m[2].trim() : "";
    police("normal", 7.5, TEXTE);
    const lignes = pdf.splitTextToSize(nettoie(lib), W - 2 * M - 40) as string[];
    assure(lignes.length * 3.6 + 1.5);
    pdf.text(lignes, M + 2, flux.y);
    police("bold", 7.5, TEXTE); if (montant) texte(montant, W - M - 2, flux.y, { align: "right" });
    pdf.setDrawColor(...GRIS_CLAIR).setLineWidth(0.15).line(M, flux.y + 1.2, W - M, flux.y + 1.2);
    flux.y += lignes.length * 3.6 + 1.5;
  }
  // Annexe 3 — sinistres · Annexe 4 — contacts
  flux.y = nouvellePage();
  blocTexte(tx.annexe_sinistres || ANNEXE_SINISTRES_DEFAUT);
  flux.y += 4;
  assure(40);
  para("LISTE DES CONTACTS " + (soc.raison_sociale || "DELTA SERVICES").toUpperCase(), { style: "bold", taille: 9.5, couleur: ROUGE, avant: 3, apres: 3 });
  blocTexte((tx.annexe_contacts || ANNEXE_CONTACTS_DEFAUT).split("\n").slice(1).join("\n"));

  // ═════════ SOMMAIRE (retour page 2) + renvoi SEPA page conditions financières ═════════
  const total = pdf.getNumberOfPages();
  pdf.setPage(pageSommaire);
  let ySom = 30;
  police("bold", 13, ANTHRACITE); texte("SOMMAIRE", M, ySom); ySom += 12;
  for (const s of sommaire) {
    police("normal", 10, TEXTE);
    texte(s.titre, M, ySom);
    const wT = pdf.getTextWidth(s.titre), wP = pdf.getTextWidth(String(s.page));
    const nPts = Math.max(0, Math.floor((W - 2 * M - wT - wP - 4) / pdf.getTextWidth(".")));
    police("normal", 10, GRIS); pdf.text(".".repeat(nPts), M + wT + 2, ySom);
    police("bold", 10, TEXTE); texte(String(s.page), W - M, ySom, { align: "right" });
    ySom += 8;
  }
  const pSepa = sommaire.find((s) => s.titre.startsWith("4."))?.page || 0;
  pdf.setPage(zoneSignature.page - 1);
  pdf.setFillColor(255, 255, 255).rect(M, yCautionNote - 4, bw, 10, "F");
  police("italic", 7.5, GRIS);
  texte(`Caution = 1 mois de loyer TTC, restituée en fin de contrat après état des lieux. Loyers payables d'avance par prélèvement SEPA (mandat page ${pSepa}).`, M, yCautionNote, { maxW: bw });

  pdf.setProperties({ title: `Contrat de location LLD ${c.numero} — ${cl.raison_sociale}`, author: soc.raison_sociale });
  const base64 = pdf.output("datauristring").split(",")[1];
  return { base64, blob: pdf.output("blob"), filename: `Contrat_LLD_${c.numero}_${cl.raison_sociale.replace(/[^\w-]+/g, "_")}.pdf`, zoneSignature, pages: total };
}

/** Clé TVA intracommunautaire FR depuis le SIREN (clé = (12 + 3 × (SIREN mod 97)) mod 97) */
function tvaDepuisSiren(siren: string): string {
  const s = (siren || "").replace(/\D/g, "");
  if (s.length !== 9) return siren;
  const cle = (12 + 3 * (Number(s) % 97)) % 97;
  return `${String(cle).padStart(2, "0")} ${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6)}`;
}
