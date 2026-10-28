// ============================================================
// ✍️ SIGNATURE EN LIGNE DES DEVIS (sans DocuSign)
// ============================================================
// Le client clique « Accepter et signer » dans l'email du devis, signe sur la
// page Delta VO (/devis/{numero}/{jeton}). Ici : la signature est apposée dans
// l'encadré « Bon pour accord » du PDF d'origine + une page « Certificat de
// signature » (signataire, date, adresse IP, navigateur, empreinte SHA-256 du
// devis d'origine) — signature électronique simple au sens du règlement eIDAS.
// ============================================================

import crypto from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface ZoneSignature { page: number; x: number; y: number; w: number; h: number } // mm, origine en haut à gauche

export interface Signataire {
  nom: string;
  fonction?: string;
  email?: string;
  societe?: string;
  ip: string;
  navigateur: string;
  date: Date;
}

type Lg = "fr" | "en" | "es";
const TXT: Record<Lg, Record<string, string>> = {
  fr: { bpa: "Bon pour accord", signe: "Signé électroniquement par", le: "le", cert: "Certificat de signature électronique", devis: "Devis", signataire: "Signataire", fonction: "Fonction", societe: "Société", email: "Email du destinataire du devis", date: "Date et heure (UTC)", ip: "Adresse IP", nav: "Navigateur", hash: "Empreinte SHA-256 du devis d'origine", methode: "Méthode", methodeTxt: "Lien personnel envoyé par email, acceptation des conditions (« Bon pour accord ») et signature manuscrite tracée à l'écran — signature électronique simple (règlement UE n° 910/2014 « eIDAS »)." },
  en: { bpa: "Approved and accepted", signe: "Electronically signed by", le: "on", cert: "Electronic signature certificate", devis: "Quotation", signataire: "Signatory", fonction: "Position", societe: "Company", email: "Email of the quotation recipient", date: "Date and time (UTC)", ip: "IP address", nav: "Browser", hash: "SHA-256 fingerprint of the original quotation", methode: "Method", methodeTxt: "Personal link sent by email, acceptance of the terms (“Approved and accepted”) and handwritten signature drawn on screen — simple electronic signature (EU Regulation No 910/2014 “eIDAS”)." },
  es: { bpa: "Conforme", signe: "Firmado electrónicamente por", le: "el", cert: "Certificado de firma electrónica", devis: "Presupuesto", signataire: "Firmante", fonction: "Cargo", societe: "Empresa", email: "Email del destinatario del presupuesto", date: "Fecha y hora (UTC)", ip: "Dirección IP", nav: "Navegador", hash: "Huella SHA-256 del presupuesto original", methode: "Método", methodeTxt: "Enlace personal enviado por email, aceptación de las condiciones («Conforme») y firma manuscrita trazada en pantalla — firma electrónica simple (Reglamento UE n.º 910/2014 «eIDAS»)." },
};

const MM = 72 / 25.4;

/** Texte compatible avec la police PDF standard (accents latins OK, le reste translittéré) */
function propre(f: PDFFont, t: string): string {
  const s = String(t ?? "").replace(/[\u00a0\u202f\u2007]/g, " ");
  try { f.encodeText(s); return s; } catch { /* caractère hors WinAnsi : traité un par un */ }
  const SPECIAUX: Record<string, string> = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "ı": "i", "ß": "ss", "Ø": "O", "ø": "o" };
  return [...s].map((ch) => {
    try { f.encodeText(ch); return ch; } catch { /* suite */ }
    if (SPECIAUX[ch]) return SPECIAUX[ch];
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    try { f.encodeText(base); return base; } catch { return "?"; }
  }).join("");
}

function coupe(f: PDFFont, t: string, taille: number, largeur: number): string[] {
  const mots = propre(f, t).split(/\s+/);
  const lignes: string[] = [];
  let l = "";
  for (const m of mots) {
    const essai = l ? `${l} ${m}` : m;
    if (f.widthOfTextAtSize(essai, taille) > largeur && l) { lignes.push(l); l = m; } else l = essai;
  }
  if (l) lignes.push(l);
  return lignes;
}

const dateUtc = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
const dateCourte = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

export const sha256 = (b: Buffer | Uint8Array) => crypto.createHash("sha256").update(b).digest("hex");

export async function signerPdf(
  original: Buffer,
  signaturePng: Buffer,
  zone: ZoneSignature | null | undefined,
  s: Signataire,
  numero: string,
  lg: Lg,
  /** Libellé du document (défaut : « Devis ») — ex. « Contrat de location financière » */
  libelleDoc?: string,
): Promise<{ pdf: Buffer; hashOriginal: string; hashSigne: string }> {
  const T = TXT[lg];
  const hashOriginal = sha256(original);
  const doc = await PDFDocument.load(original);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = await doc.embedPng(signaturePng);
  const bleu = rgb(31 / 255, 66 / 255, 130 / 255);
  const gris = rgb(0.35, 0.35, 0.35);

  // 1) Signature dans l'encadré « Bon pour accord » (zone mémorisée à la génération du PDF)
  const pages = doc.getPages();
  const z = zone && zone.page >= 1 && zone.page <= pages.length ? zone : { page: pages.length, x: 109, y: 230, w: 85, h: 32 };
  const page = pages[z.page - 1];
  const H = page.getHeight();
  const x0 = z.x * MM, yHaut = H - z.y * MM, largeur = z.w * MM, hauteur = z.h * MM;
  // fond blanc sous la zone de signature (sous les 3 lignes d'en-tête de l'encadré)
  const ySousEntete = yHaut - 17 * MM;
  page.drawRectangle({ x: x0 + 1, y: yHaut - hauteur + 1, width: largeur - 2, height: ySousEntete - (yHaut - hauteur + 1), color: rgb(1, 1, 1) });
  const bas = yHaut - hauteur;
  const imgBas = bas + 5.5 * MM;
  const echelle = Math.min((largeur - 6 * MM) / img.width, (ySousEntete - 0.5 * MM - imgBas) / img.height);
  page.drawImage(img, { x: x0 + 3 * MM, y: imgBas, width: img.width * echelle, height: img.height * echelle });
  const legende = `${T.signe} ${s.nom}${s.fonction ? ` (${s.fonction})` : ""} ${T.le} ${dateCourte(s.date)}`;
  coupe(police, legende, 6.5, largeur - 6 * MM).slice(0, 2).forEach((l, i) =>
    page.drawText(l, { x: x0 + 3 * MM, y: bas + 3.2 * MM - i * 7.5, size: 6.5, font: police, color: gris }));

  // 2) Page « Certificat de signature »
  const c = doc.addPage([595.28, 841.89]);
  let y = 841.89 - 60;
  c.drawText(propre(gras, T.cert), { x: 50, y, size: 16, font: gras, color: bleu });
  y -= 14;
  c.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.8, color: bleu });
  y -= 30;
  const ligne = (lib: string, val: string) => {
    if (!val) return;
    c.drawText(propre(gras, lib), { x: 50, y, size: 9.5, font: gras, color: rgb(0.15, 0.15, 0.15) });
    const vs = coupe(police, val, 9.5, 300);
    vs.forEach((v, i) => c.drawText(v, { x: 245, y: y - i * 13, size: 9.5, font: police, color: rgb(0.15, 0.15, 0.15) }));
    y -= 13 * Math.max(vs.length, 1) + 9;
  };
  ligne(libelleDoc || T.devis, `${numero} — ${T.bpa}`);
  ligne(T.signataire, s.nom);
  ligne(T.fonction, s.fonction || "");
  ligne(T.societe, s.societe || "");
  ligne(T.email, s.email || "");
  ligne(T.date, dateUtc(s.date));
  ligne(T.ip, s.ip);
  ligne(T.nav, s.navigateur.slice(0, 220));
  ligne(T.hash, `${hashOriginal.slice(0, 32)} ${hashOriginal.slice(32)}`);
  ligne(T.methode, T.methodeTxt);
  y -= 6;
  c.drawText(propre(gras, T.signataire), { x: 50, y, size: 9.5, font: gras });
  const e2 = Math.min(260 / img.width, 60 / img.height);
  const ls = img.width * e2, hs = img.height * e2;
  c.drawRectangle({ x: 245, y: y - hs - 8, width: ls + 16, height: hs + 16, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.6 });
  c.drawImage(img, { x: 253, y: y - hs, width: ls, height: hs });
  c.drawText(propre(police, `Delta VO · Delta Services — ${numero}`), { x: 50, y: 40, size: 7.5, font: police, color: gris });

  doc.setTitle(`${libelleDoc || T.devis} ${numero} — ${T.bpa}`);
  doc.setModificationDate(s.date);
  const pdf = Buffer.from(await doc.save());
  return { pdf, hashOriginal, hashSigne: sha256(pdf) };
}
