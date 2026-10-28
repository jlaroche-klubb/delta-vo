// ============================================================
// 🧾 DEVIS DE VENTE — Delta VO (décision Jonathan, 28/10/2026)
// ============================================================
// Les devis de vente se font DANS Delta VO (plus de devis HubSpot) :
// HubSpot ne reçoit les informations qu'à la LIVRAISON de la commande.
//
// Actions (POST { action, ... }) :
//   - creer    : attribue le numéro (DV-AAAA-NNNN, compteur transactionnel),
//                enregistre le devis (collection `devis_vente`)
//   - envoyer  : reçoit le PDF généré par le navigateur, le range dans
//                Storage (devis_vente/{numero}.pdf) et l'envoie au client
//                par email (Brevo), commercial en copie
//   - annuler  : statut « annulé » (offre retirée des machines ; enveloppe DocuSign annulée)
//   - public_lire / public_signer : page publique « Accepter et signer »
//                (lien personnel dans l'email du devis, sans compte ni DocuSign)
//   - config   : { docusign: true|false } (bouton « signature » actif ou non)
//   - signer   : PDF rangé dans Storage puis envoyé au client via DocuSign
//                (signature électronique ; le client reçoit l'email DocuSign)
// Webhook DocuSign : POST /api/devis?action=docusign&cle=… (notification
//   d'enveloppe signée / refusée / annulée → PDF signé rangé, statut, email
//   au commercial). À venir : envoi à HubSpot à la livraison.
//
// Écritures côté serveur (compte de service) : la numérotation ne peut pas
// être faite de façon fiable depuis deux navigateurs à la fois.
// PRÉREQUIS Vercel : FIREBASE_SERVICE_ACCOUNT, BREVO_API_KEY, BREVO_SENDER_EMAIL.
// ============================================================

import crypto from "node:crypto";
import admin from "firebase-admin";
import { cors, exigerUtilisateur, fetchAvecReessai } from "./_lib/auth.js";
import {
  ErreurDocusign, annulerEnveloppe, docusignConfigure, envelopeIdDepuisNotification,
  envoyerPourSignature, pdfSigne, secretWebhook, statutEnveloppe,
} from "./_lib/docusign.js";
import { signerPdf } from "./_lib/signatureDevis.js";
import { mettreEnPreparationDevis } from "./_lib/preparationAuto.js";
import { collecterVentes, construireRapport, semainePrecedente } from "./_lib/rapportVentes.js";

export const maxDuration = 30;

const BUCKET = "delta-vo.firebasestorage.app";
const ROLES = ["superadmin", "admin", "vendeur_fr", "dealer"];

function appAdmin(): admin.app.App {
  const existante = admin.apps.find((a) => a?.name === "[DEFAULT]");
  if (existante) return existante;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: "delta-vo" });
}

const str = (v: any, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: any) => {
  const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
type Langue = "fr" | "en" | "es";
const langueOk = (v: any): Langue => (v === "en" || v === "es" ? v : "fr");
const LOCALE: Record<Langue, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };
const eur = (n: number, lg: Langue = "fr") =>
  (Number(n) || 0).toLocaleString(LOCALE[lg], { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Textes de l'email au client, dans la langue du devis
const MAIL: Record<Langue, {
  sujet: (n: string) => string; bonjour: string; joint: (n: string, nb: number) => string; ht: string; ttc: string;
  total: string; financement: string; acompte: (p: number, m: string) => string; valable: (d: string) => string;
  accepter: string; cordialement: string; fichier: string;
  signerMessage: string; signeSujet: (n: string, c: string) => string;
  bouton: string; ouBien: string; lot: (n: number) => string; confirmeSujet: (n: string) => string; confirmeTexte: (n: string) => string;
}> = {
  fr: {
    sujet: (n) => `Devis ${n} — Delta Services`,
    bonjour: "Bonjour",
    joint: (n, nb) => `Veuillez trouver ci-joint notre devis <b>${n}</b> pour ${nb > 1 ? `${nb} nacelles` : "la nacelle"} :`,
    ht: "HT", ttc: "TTC", total: "Total",
    financement: "Financement bancaire : aucun acompte demandé.",
    acompte: (p, m) => `Acompte à la commande : ${p} % (${m} TTC).`,
    valable: (d) => `Devis valable jusqu'au ${d}.`,
    accepter: "Pour l'accepter, retournez-le daté et signé avec la mention « Bon pour accord » en réponse à cet email.",
    cordialement: "Cordialement,",
    fichier: "Devis",
    signerMessage: "Veuillez trouver ci-joint notre devis. Vous pouvez le signer électroniquement en cliquant sur le bouton ci-dessus.",
    signeSujet: (n, c) => `✍️ Devis ${n} signé par ${c}`,
    bouton: "✍️ Accepter et signer le devis",
    lot: (n) => `Vente en lot : prix global pour les ${n} nacelles`,
    ouBien: "Pour l'accepter, cliquez sur le bouton ci-dessous et signez en ligne (ou retournez-le daté et signé avec la mention « Bon pour accord » en réponse à cet email) :",
    confirmeSujet: (n) => `Devis ${n} signé — Delta Services`,
    confirmeTexte: (n) => `Merci ! Nous avons bien reçu votre accord sur le devis <b>${n}</b>. Vous trouverez ci-joint le devis signé. Votre interlocuteur vous recontacte rapidement pour la suite.`,
  },
  en: {
    sujet: (n) => `Quotation ${n} — Delta Services`,
    bonjour: "Dear",
    joint: (n, nb) => `Please find attached our quotation <b>${n}</b> for ${nb > 1 ? `${nb} aerial platforms` : "the aerial platform"}:`,
    ht: "excl. VAT", ttc: "incl. VAT", total: "Total",
    financement: "Bank financing: no deposit required.",
    acompte: (p, m) => `Deposit on order: ${p} % (${m} incl. VAT).`,
    valable: (d) => `This quotation is valid until ${d}.`,
    accepter: "To accept it, please return it dated and signed with the words “Approved and accepted” in reply to this email.",
    cordialement: "Kind regards,",
    fichier: "Quotation",
    signerMessage: "Please find attached our quotation. You can sign it electronically by clicking the button above.",
    signeSujet: (n, c) => `✍️ Devis ${n} signé par ${c}`,
    bouton: "✍️ Accept and sign the quotation",
    lot: (n) => `Lot sale: one total price for the ${n} aerial platforms`,
    ouBien: "To accept it, click the button below and sign online (or return it dated and signed with the words “Approved and accepted” in reply to this email):",
    confirmeSujet: (n) => `Quotation ${n} signed — Delta Services`,
    confirmeTexte: (n) => `Thank you! We have received your acceptance of quotation <b>${n}</b>. Please find the signed quotation attached. Your contact will get back to you shortly about the next steps.`,
  },
  es: {
    sujet: (n) => `Presupuesto ${n} — Delta Services`,
    bonjour: "Estimado/a",
    joint: (n, nb) => `Le adjuntamos nuestro presupuesto <b>${n}</b> para ${nb > 1 ? `${nb} plataformas elevadoras` : "la plataforma elevadora"}:`,
    ht: "sin IVA", ttc: "IVA incl.", total: "Total",
    financement: "Financiación bancaria: no se requiere anticipo.",
    acompte: (p, m) => `Anticipo al realizar el pedido: ${p} % (${m} IVA incl.).`,
    valable: (d) => `Presupuesto válido hasta el ${d}.`,
    accepter: "Para aceptarlo, devuélvanoslo fechado y firmado con la mención «Conforme» en respuesta a este correo.",
    cordialement: "Atentamente,",
    fichier: "Presupuesto",
    signerMessage: "Le adjuntamos nuestro presupuesto. Puede firmarlo electrónicamente haciendo clic en el botón de arriba.",
    signeSujet: (n, c) => `✍️ Devis ${n} signé par ${c}`,
    bouton: "✍️ Aceptar y firmar el presupuesto",
    lot: (n) => `Venta en lote: precio global para las ${n} plataformas`,
    ouBien: "Para aceptarlo, haga clic en el botón de abajo y firme en línea (o devuélvanoslo fechado y firmado con la mención «Conforme» en respuesta a este correo):",
    confirmeSujet: (n) => `Presupuesto ${n} firmado — Delta Services`,
    confirmeTexte: (n) => `¡Gracias! Hemos recibido su conformidad con el presupuesto <b>${n}</b>. Adjuntamos el presupuesto firmado. Su interlocutor se pondrá en contacto con usted en breve.`,
  },
};

/** Range un PDF dans Storage et renvoie son lien de téléchargement */
async function sauverPdf(chemin: string, contenu: Buffer): Promise<string> {
  const bucket = admin.storage(appAdmin()).bucket(BUCKET);
  const token = (globalThis.crypto as any).randomUUID();
  await bucket.file(chemin).save(contenu, {
    contentType: "application/pdf",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chemin)}?alt=media&token=${token}`;
}

async function emailBrevo(to: { email: string; name?: string }, sujet: string, html: string, extra: Record<string, any> = {}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender || !to.email) return false;
  const r = await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta VO" }, to: [to], subject: sujet, htmlContent: html, ...extra }),
  }, { timeoutMs: 15_000, essais: 1 }).catch(() => null);
  return !!r?.ok;
}

/** 📧 Email du devis au client (Brevo) : PDF joint, bouton « Accepter et signer », commercial en copie */
async function envoyerEmailClient(dv: any, numero: string, pdf: string, lien: string, dest: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) return { ok: false, status: 500, error: "Brevo non configuré" };
  const lg = langueOk(dv.langue);
  const T = MAIL[lg];
  const sepFr = lg === "fr" ? " " : "";
  const lf = dv.type === "locfi" ? dv.locfi || {} : null;
  const acompteTxt = lf
    ? `1er loyer majoré à la signature : ${eur(lf.premier_loyer_ht, lg)} HT (${eur(lf.premier_loyer_ht * 1.2, lg)} TTC)${lf.duree_mois > 1 ? `, puis ${lf.duree_mois - 1} loyer${lf.duree_mois > 2 ? "s" : ""} mensuel${lf.duree_mois > 2 ? "s" : ""} de ${eur(lf.loyer_mensuel_ht, lg)} HT (${eur(lf.loyer_mensuel_ht * 1.2, lg)} TTC) par prélèvement le 20 du mois` : ""}. Valeur de rachat au terme des ${lf.duree_mois} mois : offerte.`
    : dv.acompte_pct === 0 ? T.financement : T.acompte(dv.acompte_pct, eur(dv.acompte_ttc, lg));
  const html =
    `<p>${T.bonjour}${dv.client?.contact_nom ? " " + esc(dv.client.contact_nom) : ""},</p>` +
    `<p>${lf ? `Veuillez trouver ci-joint notre <b>contrat de location financière N°${esc(lf.numero_contrat)}</b> (${lf.duree_mois} mois) pour ${dv.lignes.length > 1 ? `${dv.lignes.length} nacelles` : "la nacelle"} :` : T.joint(esc(numero), dv.lignes.length)}</p>` +
    `<ul>${dv.lignes.map((l: any) => `<li>${esc(l.reference)} — ${esc(l.designation)}${dv.lot ? "" : `${sepFr}: <b>${eur(l.prix_ht, lg)} ${T.ht}</b>`}</li>`).join("")}</ul>` +
    `<p>${dv.lot ? `<b>${esc(T.lot(dv.lignes.length))}</b><br/>` : ""}${T.total}${sepFr}: <b>${eur(dv.total_ht, lg)} ${T.ht}</b>${dv.tva_taux ? ` · ${eur(dv.total_ttc, lg)} ${T.ttc}` : ""}<br/>${esc(acompteTxt)}<br/>` +
    `${esc(T.valable(String(dv.date_expiration).split("-").reverse().join("/")).replace(lf ? "Devis valable" : "§", "Offre valable"))}</p>` +
    `<p>${esc(lf ? "Pour l'accepter, cliquez sur le bouton ci-dessous et signez en ligne (ou retournez-le daté, paraphé et signé en réponse à cet email) :" : T.ouBien)}</p>` +
    `<p style="margin:18px 0"><a href="${lien}" style="background:#1e8e3e;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;display:inline-block">${esc(lf ? "✍️ Accepter et signer le contrat" : T.bouton)}</a></p>` +
    `<p>${T.cordialement}<br/>${esc(dv.commercial?.nom || "")}<br/>Delta Services${dv.commercial?.tel ? "<br/>" + esc(dv.commercial.tel) : ""}<br/>${esc(dv.commercial?.email || "")}</p>`;
  const r = await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta Services" },
      to: [{ email: dest, ...(dv.client?.contact_nom ? { name: dv.client.contact_nom } : {}) }],
      cc: dv.commercial?.email && dv.commercial.email !== dest ? [{ email: dv.commercial.email }] : undefined,
      replyTo: dv.commercial?.email ? { email: dv.commercial.email, name: dv.commercial.nom } : undefined,
      subject: lf ? `Contrat de location financière N°${lf.numero_contrat} — Delta Services` : T.sujet(numero),
      htmlContent: html,
      attachment: [{ name: lf ? `Contrat_location_financiere_${lf.numero_contrat}.pdf` : `${T.fichier}_${numero}.pdf`, content: pdf }],
    }),
  }, { timeoutMs: 20_000, essais: 1 });
  if (!r.ok) {
    console.error("❌ Brevo devis", r.status, (await r.text()).slice(0, 300));
    return { ok: false, status: 502, error: "Envoi de l'email impossible — le PDF est enregistré, réessayez l'envoi" };
  }
  return { ok: true, status: 200 };
}

/** ✍️ Envoi DocuSign (signature électronique) */
async function lancerDocusign(dv: any, numero: string, pdf: string, hote: string): Promise<{ envelopeId: string; email: string }> {
  const email = str(dv.client?.contact_email, 120);
  const lg = langueOk(dv.langue);
  const T = MAIL[lg];
  const joursRestants = Math.ceil((new Date(String(dv.date_expiration) + "T23:59:59").getTime() - Date.now()) / 86400000);
  const { envelopeId } = await envoyerPourSignature({
    numero,
    pdfBase64: pdf,
    nomFichier: `${T.fichier}_${numero}.pdf`,
    langue: lg,
    client: { nom: dv.client?.contact_nom || dv.client?.raison_sociale || email, email },
    commercial: { nom: dv.commercial?.nom || "", email: dv.commercial?.email || "" },
    sujet: T.sujet(numero),
    message: `${T.bonjour}${dv.client?.contact_nom ? " " + dv.client.contact_nom : ""},\n\n${T.signerMessage}\n\n${T.cordialement}\n${dv.commercial?.nom || ""}\nDelta Services${dv.commercial?.tel ? "\n" + dv.commercial.tel : ""}`,
    webhookUrl: `https://${hote}/api/devis?action=docusign&cle=${secretWebhook()}`,
    expireJours: Math.min(Math.max(joursRestants, 1), 120),
  });
  return { envelopeId, email };
}

// ─────────────────────────────────────────────────────────────
// 🔒 VALIDATION DES REMISES (décision Jonathan 28/10/2026)
// Hors admin / super admin, le prix d'une nacelle ne peut baisser que de
// 1 000 € HT max sous le prix catalogue (vente en lot : 1 000 € × nb de
// nacelles sous le total catalogue). Au-delà : validation par Jonathan OU
// Nathalie (Admin → Paramètres des devis → valideurs), avant tout envoi.
// ─────────────────────────────────────────────────────────────
const SEUIL_REMISE = 1000;
const VALIDEURS_DEFAUT = "jlaroche@klubb.com, nneguy@klubb.com";

// 📄 Location financière : 1er loyer majoré ≥ 30 % du prix HT et 4 loyers mensuels max après le 1er
// (au-delà : dérogation Jonathan ou Nathalie, même circuit que les remises)
const LOCFI_PREMIER_MIN_PCT = 30;
const LOCFI_LOYERS_SUIVANTS_MAX = 4;

async function calculerValidation(db: admin.firestore.Firestore, lignes: any[], lot: boolean, totalHt: number, role: string, locfi?: { duree_mois: number; premier_loyer_ht: number } | null) {
  const dealer = role === "dealer";
  const details: { reference: string; catalogue: number | null; propose: number; remise: number | null }[] = [];
  for (const l of lignes) {
    const d: any = l.machine_id ? (await db.collection("machines_vo").doc(l.machine_id).get()).data() : null;
    const cat = Number(dealer ? d?.prix_dealer ?? d?.prix_fr : d?.prix_fr ?? d?.prix_dealer) || 0;
    details.push({ reference: l.reference, catalogue: cat > 0 ? cat : null, propose: l.prix_ht, remise: cat > 0 ? Math.round((cat - l.prix_ht) * 100) / 100 : null });
  }
  const totalCatalogue = details.reduce((t, x) => t + (x.catalogue || 0), 0);
  const remiseTotale = Math.round((totalCatalogue - totalHt) * 100) / 100;
  const admin_ = role === "admin" || role === "superadmin";
  const sansPrix = details.filter((x) => x.catalogue === null).map((x) => x.reference);
  const depassements = lot
    ? (remiseTotale > SEUIL_REMISE * lignes.length ? [`lot : ${eur(remiseTotale)} de remise (max ${eur(SEUIL_REMISE * lignes.length)})`] : [])
    : details.filter((x) => x.remise !== null && x.remise > SEUIL_REMISE).map((x) => `${x.reference} : ${eur(x.remise as number)} de remise`);
  if (locfi) {
    const pct = totalHt > 0 ? (locfi.premier_loyer_ht / totalHt) * 100 : 0;
    if (pct < LOCFI_PREMIER_MIN_PCT) depassements.push(`location financière : 1er loyer majoré à ${pct.toFixed(1).replace(".", ",")} % du prix (minimum ${LOCFI_PREMIER_MIN_PCT} %)`);
    if (locfi.duree_mois - 1 > LOCFI_LOYERS_SUIVANTS_MAX) depassements.push(`location financière : ${locfi.duree_mois - 1} loyers mensuels après le 1er (maximum ${LOCFI_LOYERS_SUIVANTS_MAX})`);
  }
  const requise = !admin_ && (sansPrix.length > 0 || depassements.length > 0);
  return {
    requise,
    statut: requise ? "a_demander" : "non_requise",
    seuil_par_nacelle: SEUIL_REMISE,
    total_catalogue: totalCatalogue,
    remise_totale: remiseTotale,
    motifs: [...depassements, ...sansPrix.map((r) => `${r} : pas de prix catalogue`)],
    details,
  };
}

/** Envoie la demande de validation aux valideurs (un lien personnel chacun) */
async function demanderValidation(db: admin.firestore.Firestore, ref: admin.firestore.DocumentReference, dv: any, numero: string, envoiPrevu: "email" | "pdf" | "signature", hote: string, par: string, extra: Record<string, any> = {}) {
  const cfg: any = (await db.collection("config").doc("devis").get()).data() || {};
  const valideurs = String(cfg.valideurs_emails || VALIDEURS_DEFAUT).split(/[\s,;]+/).map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 10);
  const jetons: Record<string, string> = {};
  for (const e of valideurs) jetons[crypto.randomBytes(16).toString("hex")] = e;
  const now = new Date().toISOString();
  await ref.update({
    ...extra,
    pdf_url: dv.pdf_url,
    statut: "a_valider",
    "validation.statut": "en_attente",
    "validation.demande_le": now,
    "validation.envoi_prevu": envoiPrevu,
    "validation.jetons": jetons,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `remise à valider (${(dv.validation?.motifs || []).join(" ; ")}) — demande envoyée à ${valideurs.join(", ")}`, par }),
  });
  for (const l of dv.lignes || []) {
    if (l.machine_id) await db.collection("machines_vo").doc(l.machine_id).update({ devis_vente_validation: "en_attente" }).catch(() => undefined);
  }
  const v = dv.validation || {};
  const lignesHtml = (v.details || []).map((x: any) =>
    `<tr><td style="padding:5px 8px;border-bottom:1px solid #eee"><b>${esc(x.reference)}</b></td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right">${x.catalogue ? eur(x.catalogue) : "—"}</td>` +
    `<td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right">${dv.lot ? "lot" : eur(x.propose)}</td><td style="padding:5px 8px;border-bottom:1px solid #eee;text-align:right;color:${(x.remise || 0) > SEUIL_REMISE ? "#c0392b" : "#333"}">${x.remise !== null && !dv.lot ? eur(x.remise) : "—"}</td></tr>`).join("");
  for (const [jeton, email] of Object.entries(jetons)) {
    const lien = `https://${hote}/devis-validation/${encodeURIComponent(numero)}/${jeton}`;
    await emailBrevo({ email }, `🔒 Dérogation à valider — ${dv.type === "locfi" ? `location financière ${dv.locfi?.numero_contrat || numero}` : `devis ${numero}`} (${dv.client?.raison_sociale || ""}) par ${dv.commercial?.nom || ""}`,
      `<p>Bonjour,</p><p><b>${esc(dv.commercial?.nom || "")}</b> demande votre validation pour ${dv.type === "locfi" ? `la <b>location financière ${esc(dv.locfi?.numero_contrat || numero)}</b>` : `le devis <b>${esc(numero)}</b>`} à <b>${esc(dv.client?.raison_sociale || "")}</b> :</p><ul>${(v.motifs || []).map((m: string) => `<li>${esc(m)}</li>`).join("")}</ul>` +
      `${dv.type === "locfi" && dv.locfi ? `<p>Location financière ${dv.locfi.duree_mois} mois : 1er loyer majoré ${eur(dv.locfi.premier_loyer_ht)} HT${dv.locfi.duree_mois > 1 ? `, puis ${dv.locfi.duree_mois - 1} × ${eur(dv.locfi.loyer_mensuel_ht)} HT` : ""}.</p>` : ""}` +
      `<table style="border-collapse:collapse;font-size:13px"><tr style="background:#1f4282;color:#fff"><th style="padding:5px 8px;text-align:left">Réf.</th><th style="padding:5px 8px">Prix catalogue HT</th><th style="padding:5px 8px">Prix proposé HT</th><th style="padding:5px 8px">Remise</th></tr>${lignesHtml}</table>` +
      `<p>Total catalogue : ${eur(v.total_catalogue || 0)} HT · <b>Total proposé : ${eur(dv.total_ht)} HT</b>${dv.lot ? ` (vente en lot, ${dv.lignes.length} nacelles)` : ""} · <b style="color:#c0392b">remise ${eur(v.remise_totale || 0)}</b></p>` +
      `<p>Après validation, le devis part ${envoiPrevu === "email" ? "automatiquement par email au client" : envoiPrevu === "signature" ? "automatiquement au client pour signature DocuSign" : "chez le commercial, qui pourra le télécharger et l'envoyer"}.</p>` +
      `<p style="margin:18px 0"><a href="${lien}" style="background:#1f4282;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:6px;display:inline-block">Voir et valider / refuser</a></p>` +
      `${dv.pdf_url ? `<p>📄 <a href="${dv.pdf_url}">Devis PDF</a></p>` : ""}<p style="font-size:11px;color:#888">Le premier valideur qui répond décide. — Delta VO</p>`);
  }
  console.log(`🔒 Devis ${numero} : validation demandée à ${valideurs.join(", ")}`);
  return { valideurs };
}

/** 🔒 Page de validation (lien personnel du valideur) */
async function actionValidation(req: any, res: any, body: any) {
  const db = admin.firestore(appAdmin());
  const numero = str(body.numero, 20);
  const jeton = str(body.jeton, 40).toLowerCase();
  if (!/^DV-\d{4}-\d{4}$/.test(numero) || !/^[a-f0-9]{32}$/.test(jeton)) return res.status(404).json({ error: "lien_invalide" });
  const ref = db.collection("devis_vente").doc(numero);
  const dv: any = (await ref.get()).data();
  const valideur = dv?.validation?.jetons?.[jeton];
  if (!dv || !valideur) return res.status(404).json({ error: "lien_invalide" });
  const vue = () => ({
    numero, statut: dv.statut, client: dv.client?.raison_sociale || "", commercial: dv.commercial?.nom || "", lot: !!dv.lot,
    type: dv.type === "locfi" ? "locfi" : "vente", locfi: dv.type === "locfi" ? dv.locfi || null : null,
    lignes: (dv.validation?.details || []).map((x: any, i: number) => ({ ...x, designation: dv.lignes?.[i]?.designation || "" })),
    total_ht: dv.total_ht, total_catalogue: dv.validation?.total_catalogue, remise_totale: dv.validation?.remise_totale, motifs: dv.validation?.motifs || [],
    acompte_pct: dv.acompte_pct, pdf_url: dv.pdf_url, envoi_prevu: dv.validation?.envoi_prevu,
    validation: { statut: dv.validation?.statut, par: dv.validation?.par || null, le: dv.validation?.le || null, motif: dv.validation?.motif || "" },
    valideur,
  });
  if (body.action === "public_validation_lire") return res.status(200).json({ ok: true, devis: vue() });

  const decision = body.decision === "valider" ? "valider" : body.decision === "refuser" ? "refuser" : "";
  if (!decision) return res.status(400).json({ error: "decision" });
  const motif = str(body.motif, 500);
  const now = new Date().toISOString();
  const deja = await db.runTransaction(async (tx) => {
    const cur: any = (await tx.get(ref)).data();
    if (cur?.validation?.statut !== "en_attente" || cur?.statut !== "a_valider") return cur?.validation?.statut || "deja";
    tx.update(ref, {
      "validation.statut": decision === "valider" ? "validee" : "refusee",
      "validation.par": valideur, "validation.le": now, "validation.motif": motif,
      statut: decision === "valider" ? "valide" : "refuse_interne",
      historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `remise ${decision === "valider" ? "validée" : "refusée"} par ${valideur}${motif ? " — " + motif : ""}`, par: valideur }),
    });
    return "";
  });
  if (deja) {
    const d2: any = (await ref.get()).data();
    Object.assign(dv, d2);
    return res.status(409).json({ error: "deja_traite", devis: vue() });
  }

  const hote = String(req.headers["x-forwarded-host"] || req.headers.host || "delta-vo.vercel.app");
  let resultat = "";
  if (decision === "valider") {
    for (const l of dv.lignes || []) {
      if (l.machine_id) await db.collection("machines_vo").doc(l.machine_id).update({ devis_vente_validation: null, ...(dv.pdf_url ? { devis_vente_url: dv.pdf_url } : {}) }).catch(() => undefined);
    }
    const prevu = dv.validation?.envoi_prevu || "pdf";
    try {
      if (prevu === "email" || prevu === "signature") {
        const [buf] = await admin.storage(appAdmin()).bucket(BUCKET).file(`devis_vente/${numero}.pdf`).download();
        const pdf = buf.toString("base64");
        if (prevu === "signature" && docusignConfigure()) {
          const { envelopeId, email } = await lancerDocusign(dv, numero, pdf, hote);
          await ref.update({ statut: "signature", envoye_le: now, envoye_a: email, docusign: { envelope_id: envelopeId, statut: "sent", envoye_le: now },
            historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `envoyé pour signature électronique à ${email} (DocuSign) après validation`, par: valideur }) });
          resultat = `envoyé au client pour signature (${email})`;
        } else {
          const dest = str(dv.client?.contact_email, 120);
          const jetonSig = /^[a-f0-9]{32}$/.test(String(dv.signature_jeton || "")) ? dv.signature_jeton : crypto.randomBytes(16).toString("hex");
          const e = await envoyerEmailClient(dv, numero, pdf, lienSignature(hote, numero, jetonSig), dest);
          if (!e.ok) throw new Error(e.error || "envoi impossible");
          await ref.update({ statut: "envoye", envoye_le: now, envoye_a: dest, signature_jeton: jetonSig,
            historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `envoyé à ${dest} après validation`, par: valideur }) });
          resultat = `envoyé par email au client (${dest})`;
        }
      } else {
        await ref.update({ statut: "genere" });
        resultat = "prêt : vous pouvez le télécharger depuis la carte de la nacelle et l'envoyer";
      }
    } catch (e: any) {
      console.error("❌ envoi après validation:", e);
      resultat = `⚠ validé mais l'envoi au client a échoué (${e?.message || e}) — renvoyez-le depuis Delta VO`;
    }
  } else {
    // Refus : l'offre est retirée des nacelles
    for (const l of dv.lignes || []) {
      if (!l.machine_id) continue;
      const mref = db.collection("machines_vo").doc(l.machine_id);
      const m: any = (await mref.get()).data();
      if (m?.devis_vente_numero === numero) {
        await mref.update({ offre_en_cours: false, client_offre: null, montant_offre: null, date_offre: null, devis_vente_numero: null, devis_vente_url: null, devis_vente_validation: null, devis_vente_signe_le: null, updatedAt: now });
      }
    }
    resultat = "le devis n'est pas envoyé et l'offre est retirée des nacelles";
  }
  await emailBrevo({ email: dv.commercial?.email, name: dv.commercial?.nom },
    `${decision === "valider" ? "✅ Remise validée" : "❌ Remise refusée"} — devis ${numero} (${dv.client?.raison_sociale || ""})`,
    `<p>Bonjour,</p><p>La remise du devis <b>${esc(numero)}</b> (${esc(dv.client?.raison_sociale || "")}, ${eur(dv.total_ht)} HT) a été <b>${decision === "valider" ? "validée" : "refusée"}</b> par ${esc(valideur)}.</p>` +
    `${motif ? `<p>Commentaire : <i>${esc(motif)}</i></p>` : ""}<p>${esc(resultat)}.</p><p><a href="https://delta-vo.vercel.app">Delta VO</a></p>`);
  const d3: any = (await ref.get()).data();
  Object.assign(dv, d3);
  return res.status(200).json({ ok: true, resultat, devis: vue() });
}

/** Après une signature (DocuSign ou en ligne) : fiches machines + email au commercial */
// 👩‍💼 Assistante commerciale de chaque commercial (Admin → Paramètres des devis), prévenue à la signature
const ASSISTANTES_DEFAUT = [
  "flarronde@klubb.com = anebotsaudin@delta-services.fr",
  "flouis@klubb.com = bzucchi@delta-services.fr",
  "lpotier@klubb.com = bzucchi@delta-services.fr",
  "fmailleret@klubb.com = gcloarec@delta-services.fr",
  "dcoulet@klubb.com = gcloarec@delta-services.fr",
].join("\n");

function assistantesDe(cfg: any, emailCommercial: string): string[] {
  const e = String(emailCommercial || "").trim().toLowerCase();
  const out: string[] = [];
  for (const ligne of String(cfg?.assistantes_commerciaux || ASSISTANTES_DEFAUT).split(/\n+/)) {
    const [com, ass] = ligne.split(/=|→|->|:/).map((x) => x.trim().toLowerCase());
    if (com && ass && com === e) out.push(...ass.split(/[\s,;]+/).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)));
  }
  return [...new Set(out)];
}

/** 📧 Email à l'assistante : contrat signé → dossier à monter (facturation, livraison…) */
async function prevenirAssistante(db: admin.firestore.Firestore, dv: any, url: string, signataire: string, date: string, prepa: { reference: string; ok: boolean; detail: string }[]) {
  const cfg: any = (await db.collection("config").doc("devis").get()).data() || {};
  const to = assistantesDe(cfg, dv.commercial?.email);
  if (!to.length) return;
  const lf = dv.type === "locfi" ? dv.locfi || {} : null;
  const c = dv.client || {};
  const quoi = lf ? `Contrat de location financière N°${lf.numero_contrat}` : `Devis ${dv.numero}`;
  const html =
    `<p>Bonjour,</p><p><b>${esc(quoi)}</b> signé le ${esc(String(date).slice(0, 10).split("-").reverse().join("/"))} par ${esc(signataire || c.contact_nom || "le client")} — commercial : <b>${esc(dv.commercial?.nom || "")}</b>.</p>` +
    `<table style="border-collapse:collapse;font-size:13px">` +
    [["Client", c.raison_sociale], ["SIREN", c.siren], ["TVA intracom", c.tva_intra], ["Adresse", [c.adresse, [c.cp, c.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ")],
      ["Contact", [c.contact_nom, c.contact_email, c.contact_tel].filter(Boolean).join(" · ")]]
      .filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:3px 10px 3px 0;color:#666">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("") +
    `</table>` +
    `<ul>${(dv.lignes || []).map((l: any) => `<li><b>${esc(l.reference)}</b> (${esc(l.immat || "")}) — ${esc(l.designation)}${dv.lot ? "" : ` : ${eur(l.prix_ht)} HT`}</li>`).join("")}</ul>` +
    `<p>Total : <b>${eur(dv.total_ht)} HT</b>${dv.tva_taux ? ` · ${eur(dv.total_ttc)} TTC` : ""}${dv.lot ? " (vente en lot)" : ""}<br/>` +
    (lf
      ? `Location financière ${lf.duree_mois} mois : <b>1er loyer majoré ${eur(lf.premier_loyer_ht)} HT</b> à encaisser à la signature${lf.duree_mois > 1 ? `, puis ${lf.duree_mois - 1} × ${eur(lf.loyer_mensuel_ht)} HT par prélèvement le 20 du mois` : ""} — rachat offert.`
      : dv.acompte_pct ? `Acompte ${dv.acompte_pct} % à encaisser : <b>${eur(dv.acompte_ttc)} TTC</b>` : "Financement bancaire (sans acompte)") +
    `${dv.preparation?.date_livraison ? `<br/>Livraison souhaitée : ${esc(String(dv.preparation.date_livraison).split("-").reverse().join("/"))}` : ""}</p>` +
    `${prepa.length ? `<p>Préparation : ${prepa.map((p) => `${esc(p.reference)} ${p.ok ? "✅" : "⚠ " + esc(p.detail)}`).join(" · ")}</p>` : ""}` +
    `<p>📄 <a href="${url}">${esc(quoi)} signé (PDF)</a></p>` +
    `<p style="font-size:12px;color:#666">${lf ? "À faire : facture du 1er loyer majoré, mandat de prélèvement SEPA, attestation d'assurance du locataire avant livraison." : "À faire : facture d'acompte / de vente et organisation de la livraison."}</p>`;
  await emailBrevo({ email: to[0] }, `✍️ ${quoi} signé — ${c.raison_sociale || ""} (${dv.commercial?.nom || ""})`, html,
    { ...(to.length > 1 ? { cc: to.slice(1).map((email) => ({ email })) } : {}), ...(dv.commercial?.email ? { replyTo: { email: dv.commercial.email, name: dv.commercial.nom } } : {}) });
}

async function apresSignature(db: admin.firestore.Firestore, dv: any, url: string, signataire: string, date: string, source: string) {
  const numero = dv.numero;
  const now = new Date().toISOString();
  // Fiches machines encore rattachées à ce devis : lien vers le PDF signé
  for (const l of dv.lignes || []) {
    if (!l.machine_id) continue;
    const mref = db.collection("machines_vo").doc(l.machine_id);
    const m = (await mref.get()).data();
    if (m?.devis_vente_numero === numero) await mref.update({ devis_vente_url: url, devis_vente_signe_le: date, updatedAt: now });
  }
  // 🔧 Mise en préparation automatique (décision Jonathan 28/10/2026)
  const prepa = await mettreEnPreparationDevis(appAdmin(), dv, date, `Devis ${numero} signé (${source})`);
  await db.collection("devis_vente").doc(numero).update({
    preparation_auto: prepa,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `mise en préparation : ${prepa.map((p) => `${p.reference} ${p.ok ? "✅" : "⚠ " + p.detail}`).join(", ")}`, par: "Delta VO" }),
  }).catch(() => undefined);
  const enEchec = prepa.filter((p) => !p.ok);
  await prevenirAssistante(db, dv, url, signataire, date, prepa).catch((e) => console.warn("Email assistante :", e?.message || e));
  const T = MAIL[langueOk(dv.langue)];
  await emailBrevo({ email: dv.commercial?.email, name: dv.commercial?.nom }, T.signeSujet(numero, dv.client?.raison_sociale || "le client"),
    `<p>Bonjour,</p><p>Le devis <b>${esc(numero)}</b> a été <b>signé électroniquement</b> (${esc(source)}) par ${esc(signataire || dv.client?.contact_nom || "le client")} (${esc(dv.client?.raison_sociale || "")}).</p>` +
    `<ul>${(dv.lignes || []).map((l: any) => `<li>${esc(l.reference)} — ${esc(l.designation)} : <b>${eur(l.prix_ht)} HT</b></li>`).join("")}</ul>` +
    `<p>Total : <b>${eur(dv.total_ht)} HT</b>${dv.acompte_pct ? ` · acompte ${dv.acompte_pct} % : ${eur(dv.acompte_ttc)} TTC` : " · financement bancaire"}</p>` +
    `<p>📄 <a href="${url}">Devis signé (PDF + certificat de signature)</a></p><p><b>🔧 Mise en préparation automatique :</b></p><ul>${prepa.map((p) => `<li>${esc(p.reference)} : ${p.ok ? "✅ " : "⚠ <b>non basculée</b> — "}${esc(p.detail)}</li>`).join("")}</ul>` +
    `${enEchec.length ? `<p>⚠ Pour ${enEchec.length > 1 ? "ces nacelles" : "cette nacelle"}, faites la mise en préparation à la main dans <a href="https://delta-vo.vercel.app">Delta VO</a>.</p>` : `<p>La nacelle est dans l'onglet « En préparation » de <a href="https://delta-vo.vercel.app">Delta VO</a> : il reste à valider la fiche de préparation (les préparateurs sont prévenus à ce moment-là, comme d'habitude).</p>`}`);
}

/** Lien public « Accepter et signer » */
const lienSignature = (hote: string, numero: string, jeton: string) => `https://${hote}/devis/${encodeURIComponent(numero)}/${jeton}`;

/** Lecture du devis par le jeton (page publique) — renvoie l'erreur à afficher, sinon le devis */
async function devisParJeton(db: admin.firestore.Firestore, numero: string, jeton: string): Promise<{ ref?: admin.firestore.DocumentReference; dv?: any; erreur?: string }> {
  if (!/^DV-\d{4}-\d{4}$/.test(numero) || !/^[a-f0-9]{32}$/.test(jeton)) return { erreur: "lien_invalide" };
  const ref = db.collection("devis_vente").doc(numero);
  const snap = await ref.get();
  const dv: any = snap.data();
  if (!snap.exists || String(dv?.signature_jeton || "").length !== 32 || !crypto.timingSafeEqual(Buffer.from(String(dv.signature_jeton)), Buffer.from(jeton))) return { erreur: "lien_invalide" };
  return { ref, dv };
}

/** Partie du devis montrée au client (rien d'interne : ni immat, ni historique) */
function devisPublic(dv: any) {
  const expire = String(dv.date_expiration || "") < new Date().toISOString().slice(0, 10);
  return {
    numero: dv.numero, date: dv.date, date_expiration: dv.date_expiration, langue: langueOk(dv.langue),
    statut: dv.statut === "signe" ? "signe" : ["annule", "refuse", "refuse_interne", "a_valider"].includes(dv.statut) ? "annule" : expire ? "expire" : "a_signer",
    client: { raison_sociale: dv.client?.raison_sociale || "", contact_nom: dv.client?.contact_nom || "" },
    lot: !!dv.lot,
    type: dv.type === "locfi" ? "locfi" : "vente",
    locfi: dv.type === "locfi" ? dv.locfi || null : null,
    lignes: (dv.lignes || []).map((l: any) => ({ reference: l.reference, designation: l.designation, prix_ht: dv.lot ? null : l.prix_ht })),
    tva_taux: dv.tva_taux, total_ht: dv.total_ht, tva: dv.tva, total_ttc: dv.total_ttc,
    acompte_pct: dv.acompte_pct, acompte_ttc: dv.acompte_ttc, conditions: dv.conditions || "",
    commercial: { nom: dv.commercial?.nom || "", email: dv.commercial?.email || "", tel: dv.commercial?.tel || "" },
    pdf_url: dv.statut === "signe" ? dv.pdf_signe_url || dv.pdf_url : dv.pdf_url,
    signe_le: dv.signe_le || null,
    signataire: dv.signature_en_ligne?.nom || null,
  };
}

/** ✍️ Page publique : lecture et signature du devis par le client */
async function actionPublique(req: any, res: any, body: any) {
  const db = admin.firestore(appAdmin());
  const numero = str(body.numero, 20);
  const jeton = str(body.jeton, 40).toLowerCase();
  const { ref, dv, erreur } = await devisParJeton(db, numero, jeton);
  if (erreur || !ref || !dv) return res.status(404).json({ error: erreur || "lien_invalide" });

  if (body.action === "public_lire") return res.status(200).json({ ok: true, devis: devisPublic(dv) });

  // public_signer
  const etat = devisPublic(dv).statut;
  if (etat !== "a_signer") return res.status(409).json({ error: etat, devis: devisPublic(dv) });
  const nom = str(body.nom, 80);
  const fonction = str(body.fonction, 80);
  if (nom.length < 3) return res.status(400).json({ error: "nom_requis" });
  if (body.accepte !== true) return res.status(400).json({ error: "accord_requis" });
  const png = Buffer.from(String(body.signature || "").replace(/^data:image\/png;base64,/, ""), "base64");
  if (png.length < 300 || png.length > 600_000 || png.readUInt32BE(0) !== 0x89504e47) return res.status(400).json({ error: "signature_requise" });

  const bucket = admin.storage(appAdmin()).bucket(BUCKET);
  const [original] = await bucket.file(`devis_vente/${numero}.pdf`).download();
  const date = new Date();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const navigateur = str(req.headers["user-agent"], 300);
  const lg = langueOk(dv.langue);
  const signe = await signerPdf(original, png, dv.zone_signature, {
    nom, fonction, email: dv.client?.contact_email || "", societe: dv.client?.raison_sociale || "", ip, navigateur, date,
  }, dv.type === "locfi" ? dv.locfi?.numero_contrat || numero : numero, lg, dv.type === "locfi" ? "Contrat de location financière" : undefined);
  const url = await sauverPdf(`devis_vente/${numero}_signe.pdf`, signe.pdf);
  const now = date.toISOString();
  // Transaction : pas de double signature si le client clique deux fois
  const dejaSigne = await db.runTransaction(async (tx) => {
    const cur: any = (await tx.get(ref)).data();
    if (cur?.statut === "signe") return true;
    tx.update(ref, {
      statut: "signe", signe_le: now, pdf_signe_url: url,
      signature_en_ligne: { nom, fonction, email: dv.client?.contact_email || "", ip, navigateur, date: now, empreinte_original: signe.hashOriginal, empreinte_signe: signe.hashSigne },
      historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `accepté et signé en ligne par ${nom}${fonction ? ` (${fonction})` : ""} — IP ${ip}`, par: "Client (lien de signature)" }),
    });
    return false;
  });
  if (dejaSigne) return res.status(409).json({ error: "signe" });
  // Annule une éventuelle demande DocuSign parallèle
  if (dv.docusign?.envelope_id && dv.docusign.statut === "sent" && docusignConfigure()) {
    await annulerEnveloppe(dv.docusign.envelope_id, "Devis signé en ligne dans Delta VO");
  }
  await apresSignature(db, dv, url, nom, now, "signature en ligne");
  // Confirmation au client avec le devis signé
  const T = MAIL[lg];
  if (dv.client?.contact_email) {
    await emailBrevo({ email: dv.client.contact_email, name: dv.client.contact_nom || undefined }, T.confirmeSujet(numero),
      `<p>${T.bonjour}${dv.client?.contact_nom ? " " + esc(dv.client.contact_nom) : ""},</p><p>${T.confirmeTexte(esc(numero))}</p>` +
      `<p>${T.cordialement}<br/>${esc(dv.commercial?.nom || "")}<br/>Delta Services${dv.commercial?.tel ? "<br/>" + esc(dv.commercial.tel) : ""}<br/>${esc(dv.commercial?.email || "")}</p>`,
      {
        sender: { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "Delta Services" },
        replyTo: dv.commercial?.email ? { email: dv.commercial.email, name: dv.commercial.nom } : undefined,
        attachment: [{ name: `${T.fichier}_${numero}_${lg === "fr" ? "signe" : lg === "en" ? "signed" : "firmado"}.pdf`, content: signe.pdf.toString("base64") }],
      });
  }
  console.log(`✍️ Devis ${numero} signé en ligne par ${nom} (IP ${ip})`);
  return res.status(200).json({ ok: true, devis: devisPublic({ ...dv, statut: "signe", signe_le: now, pdf_signe_url: url, signature_en_ligne: { nom } }) });
}

/**
 * ✍️ Notification DocuSign (enveloppe signée / refusée / annulée).
 * On ne fait pas confiance au contenu : on relit l'enveloppe chez DocuSign.
 */
async function webhookDocusign(req: any, res: any) {
  if (String(req.query?.cle || "") !== secretWebhook()) return res.status(401).json({ error: "clé invalide" });
  const envelopeId = envelopeIdDepuisNotification(req.body);
  if (!envelopeId) return res.status(200).json({ ok: true, ignore: "pas d'enveloppe" });
  const db = admin.firestore(appAdmin());
  const q = await db.collection("devis_vente").where("docusign.envelope_id", "==", envelopeId).limit(1).get();
  if (q.empty) return res.status(200).json({ ok: true, ignore: "enveloppe inconnue" });
  const ref = q.docs[0].ref;
  const dv: any = q.docs[0].data();
  const numero = dv.numero;
  const st = await statutEnveloppe(envelopeId);
  const now = new Date().toISOString();
  const appli = "https://delta-vo.vercel.app";

  if (st.statut === "completed") {
    if (dv.statut === "signe") return res.status(200).json({ ok: true, deja: true });
    const url = await sauverPdf(`devis_vente/${numero}_signe.pdf`, await pdfSigne(envelopeId));
    await ref.update({
      statut: "signe", signe_le: st.date || now, pdf_signe_url: url,
      "docusign.statut": "completed",
      historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `signé électroniquement${st.signataire ? ` par ${st.signataire}` : ""} (DocuSign)`, par: "DocuSign" }),
    });
    await apresSignature(db, dv, url, st.signataire || "", st.date || now, "DocuSign");
    console.log(`✍️ Devis ${numero} signé (enveloppe ${envelopeId})`);
    return res.status(200).json({ ok: true, statut: "signe" });
  }

  if (st.statut === "declined" || st.statut === "voided") {
    const refuse = st.statut === "declined";
    await ref.update({
      statut: refuse ? "refuse" : dv.statut === "annule" ? "annule" : "signature_annulee",
      "docusign.statut": st.statut,
      ...(refuse ? { refuse_le: st.date || now, motif_refus: st.motifRefus || "" } : {}),
      historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `${refuse ? "signature refusée" : "signature annulée / expirée"}${st.motifRefus ? " — " + st.motifRefus : ""} (DocuSign)`, par: "DocuSign" }),
    });
    if (dv.statut !== "annule") {
      await emailBrevo({ email: dv.commercial?.email, name: dv.commercial?.nom }, `${refuse ? "❌ Devis refusé" : "⌛ Signature expirée / annulée"} — ${numero} (${dv.client?.raison_sociale || ""})`,
        `<p>Bonjour,</p><p>${refuse ? "Le client a <b>refusé de signer</b>" : "La demande de signature a été <b>annulée ou a expiré</b> pour"} le devis <b>${esc(numero)}</b> (${esc(dv.client?.raison_sociale || "")}).</p>` +
        `${st.motifRefus ? `<p>Motif : <i>${esc(st.motifRefus)}</i></p>` : ""}<p>L'offre est toujours affichée sur les nacelles dans <a href="${appli}">Delta VO</a> : retirez-la ou renvoyez un devis.</p>`);
    }
    return res.status(200).json({ ok: true, statut: st.statut });
  }
  return res.status(200).json({ ok: true, statut: st.statut });
}

/** 📊 Rapport hebdo des ventes : calcule la semaine précédente et l'envoie (programmé à 8 h Paris si possible) */
async function envoyerRapportHebdo(opts: { force: boolean; destinataires?: string[] }): Promise<{ ok: boolean; detail: string; to?: string[]; ventes?: number }> {
  const db = admin.firestore(appAdmin());
  const sem = semainePrecedente();
  const cfgRef = db.collection("config").doc("devis");
  const cfg: any = (await cfgRef.get()).data() || {};
  const to = (opts.destinataires?.length ? opts.destinataires : String(cfg.rapport_ventes_destinataires || "jlaroche@klubb.com").split(/[\s,;]+/))
    .map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 20);
  if (!to.length) return { ok: false, detail: "aucun destinataire" };
  // Une seule fois par semaine (le planificateur peut relancer)
  if (!opts.force) {
    const deja = await db.runTransaction(async (tx) => {
      const c: any = (await tx.get(cfgRef)).data() || {};
      if (c.rapport_ventes_derniere_semaine === sem.debut) return true;
      tx.set(cfgRef, { rapport_ventes_derniere_semaine: sem.debut, rapport_ventes_envoye_le: new Date().toISOString() }, { merge: true });
      return false;
    });
    if (deja) return { ok: true, detail: `déjà envoyé pour la semaine du ${sem.debut}` };
  }
  const r = construireRapport(sem, await collecterVentes(db, sem));
  const programme = !opts.force && sem.lundi8hUtc.getTime() > Date.now() + 2 * 60000;
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) return { ok: false, detail: "Brevo non configuré" };
  const envoi = (planifie: boolean) => fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta VO" },
      to: to.map((email) => ({ email })),
      subject: r.sujet,
      htmlContent: r.html,
      attachment: [{ name: r.nomCsv, content: Buffer.from(r.csv, "utf8").toString("base64") }],
      ...(planifie ? { scheduledAt: sem.lundi8hUtc.toISOString() } : {}),
    }),
  }, { timeoutMs: 20_000, essais: 1 });
  let resp = await envoi(programme);
  // Programmation refusée par Brevo → envoi immédiat plutôt que pas de rapport
  if (!resp.ok && programme && resp.status === 400) resp = await envoi(false);
  if (!resp.ok) {
    const t = (await resp.text()).slice(0, 300);
    console.error("❌ Rapport hebdo Brevo", resp.status, t);
    if (!opts.force) await cfgRef.set({ rapport_ventes_derniere_semaine: null }, { merge: true }); // retentera
    return { ok: false, detail: `envoi refusé (${resp.status})` };
  }
  const ventes = (r.sujet.match(/: (\d+) nacelle/) || [])[1];
  console.log(`📊 Rapport ventes semaine ${sem.debut} → ${to.join(", ")}${programme ? ` (programmé ${sem.lundi8hUtc.toISOString()})` : ""}`);
  return { ok: true, detail: programme ? `programmé pour lundi 8 h (${to.join(", ")})` : `envoyé à ${to.join(", ")}`, to, ventes: Number(ventes) || 0 };
}

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  // ⏰ Tâche planifiée Vercel (lundi matin) : rapport hebdomadaire des ventes
  if (req.method === "GET" && String(req.query?.action || "") === "rapport_hebdo") {
    const secret = process.env.CRON_SECRET;
    const autorise = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(String(req.headers["user-agent"] || ""));
    if (!autorise) return res.status(401).json({ error: "non autorisé" });
    try { return res.status(200).json(await envoyerRapportHebdo({ force: false })); }
    catch (e: any) { console.error("❌ rapport hebdo:", e); return res.status(500).json({ error: e?.message || "erreur" }); }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Webhook DocuSign : pas d'utilisateur Delta VO, protégé par une clé dans l'URL
  if (String(req.query?.action || "") === "docusign") {
    try { return await webhookDocusign(req, res); }
    catch (e: any) { console.error("❌ webhook DocuSign:", e?.message, e?.detail || ""); return res.status(500).json({ error: e?.message || "erreur" }); }
  }
  // Page publique « Accepter et signer » : pas de compte, protégée par le jeton personnel du lien
  {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (b.action === "public_lire" || b.action === "public_signer") {
      try { return await actionPublique(req, res, b); }
      catch (e: any) { console.error("❌ signature en ligne:", e); return res.status(500).json({ error: "erreur_serveur" }); }
    }
    if (b.action === "public_validation_lire" || b.action === "public_valider") {
      try { return await actionValidation(req, res, b); }
      catch (e: any) { console.error("❌ validation remise:", e); return res.status(500).json({ error: "erreur_serveur" }); }
    }
  }
  const user = await exigerUtilisateur(req, res, { roles: ROLES });
  if (!user) return;

  try {
    const db = admin.firestore(appAdmin());
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const action = String(body.action || "");

    // Nom / email du commercial connecté (profil Delta VO)
    const profil = (await db.collection("users").doc(user.uid).get()).data() || {};
    const commercial = {
      nom: `${profil.prenom || ""} ${profil.nom || ""}`.trim() || user.email,
      email: user.email,
      tel: str(profil.telephone || profil.tel || "", 40),
    };

    // ───────────── CRÉER ─────────────
    if (action === "creer") {
      const c = body.client || {};
      const client = {
        raison_sociale: str(c.raison_sociale, 120),
        siren: str(c.siren, 20),
        tva_intra: str(c.tva_intra, 20),
        adresse: str(c.adresse, 200),
        cp: str(c.cp, 10),
        ville: str(c.ville, 80),
        contact_nom: str(c.contact_nom, 80),
        contact_email: str(c.contact_email, 120).toLowerCase(),
        contact_tel: str(c.contact_tel, 40),
      };
      if (!client.raison_sociale) return res.status(400).json({ error: "Raison sociale du client requise" });
      const lignes = (Array.isArray(body.lignes) ? body.lignes : []).slice(0, 50).map((l: any) => ({
        machine_id: str(l.machine_id, 40),
        immat: str(l.immat, 20),
        reference: str(l.reference, 40),
        designation: str(l.designation, 300),
        prix_ht: num(l.prix_ht),
      }));
      if (!lignes.length) return res.status(400).json({ error: "Aucune nacelle sur le devis" });
      const tvaTaux = [0, 20].includes(Number(body.tva_taux)) ? Number(body.tva_taux) : 20;
      const acompte = [0, 30, 100].includes(Number(body.acompte_pct)) ? Number(body.acompte_pct) : 30;
      const validiteJours = Math.min(Math.max(Number(body.validite_jours) || 30, 1), 180);
      const totalHt = Math.round(lignes.reduce((s: number, l: any) => s + l.prix_ht, 0) * 100) / 100;
      const tva = Math.round(totalHt * tvaTaux) / 100;
      const totalTtc = Math.round((totalHt + tva) * 100) / 100;
      const now = new Date();
      const expire = new Date(now.getTime() + validiteJours * 86400000);
      const estLot = body.lot === true && lignes.length > 1;
      // 📄 Location financière : durée (mois), 1er loyer majoré HT, loyers mensuels calculés ici
      const estLocFi = body.type === "locfi";
      const dureeMois = Math.min(Math.max(Math.round(Number(body.locfi?.duree_mois) || 3), 1), 60);
      const premierLoyer = Math.min(Math.max(num(body.locfi?.premier_loyer_ht), 0), totalHt);
      const loyerMensuel = dureeMois > 1 ? Math.round(((totalHt - premierLoyer) / (dureeMois - 1)) * 100) / 100 : 0;
      if (estLocFi && tvaTaux !== 20) return res.status(400).json({ error: "Location financière : TVA 20 % (client en France) obligatoire" });
      const validation = await calculerValidation(db, lignes, estLot, totalHt, String(profil.role || ""), estLocFi ? { duree_mois: dureeMois, premier_loyer_ht: premierLoyer } : null);

      const annee = now.getFullYear();
      const compteurRef = db.collection("config").doc("compteur_devis_vente");
      const compteurLocFiRef = db.collection("config").doc("compteur_locfi");
      const moisCourant = now.toISOString().slice(0, 7);
      let numeroContrat = "";
      const numero = await db.runTransaction(async (tx) => {
        const snap = await tx.get(compteurRef);
        const snapLf = estLocFi ? await tx.get(compteurLocFiRef) : null;
        const d = snap.exists ? snap.data() || {} : {};
        const suivant = d.annee === annee ? (Number(d.dernier) || 0) + 1 : 1;
        tx.set(compteurRef, { annee, dernier: suivant, maj: now.toISOString() });
        const n = `DV-${annee}-${String(suivant).padStart(4, "0")}`;
        if (estLocFi && snapLf) {
          const dl: any = snapLf.exists ? snapLf.data() || {} : {};
          const suivantLf = dl.mois === moisCourant ? (Number(dl.dernier) || 0) + 1 : 1;
          tx.set(compteurLocFiRef, { mois: moisCourant, dernier: suivantLf, maj: now.toISOString() });
          numeroContrat = `DSLOCFI${moisCourant}-${String(suivantLf).padStart(2, "0")}`;
        }
        tx.set(db.collection("devis_vente").doc(n), {
          numero: n,
          statut: "brouillon",
          date: now.toISOString(),
          date_expiration: expire.toISOString().slice(0, 10),
          validite_jours: validiteJours,
          client,
          lignes,
          tva_taux: tvaTaux,
          exoneration: tvaTaux === 0 ? str(body.exoneration, 200) || "Exonération de TVA" : "",
          total_ht: totalHt,
          tva,
          total_ttc: totalTtc,
          acompte_pct: acompte,
          acompte_ttc: Math.round(totalTtc * acompte) / 100,
          conditions: str(body.conditions, 3000),
          langue: estLocFi ? "fr" : langueOk(body.langue),
          lot: estLot,
          validation,
          type: estLocFi ? "locfi" : "vente",
          ...(estLocFi ? { locfi: { numero_contrat: numeroContrat, duree_mois: dureeMois, premier_loyer_ht: premierLoyer, loyer_mensuel_ht: loyerMensuel } } : {}),
          preparation: {
            type_prepa: body.type_prepa === "en_etat" ? "en_etat" : "normale",
            date_livraison: /^\d{4}-\d{2}-\d{2}$/.test(String(body.date_livraison || "")) ? String(body.date_livraison) : "",
          },
          commercial,
          cree_par_uid: user.uid,
          historique: [{ date: now.toISOString(), action: "création", par: commercial.nom }],
        });
        return n;
      });
      console.log(`🧾 Devis ${numero} créé par ${commercial.nom} — ${client.raison_sociale}, ${lignes.length} nacelle(s), ${eur(totalHt)} HT`);
      return res.status(200).json({ ok: true, numero, commercial, total_ht: totalHt, tva, total_ttc: totalTtc, validation_requise: validation.requise, motifs_validation: validation.motifs, ...(estLocFi ? { locfi: { numero_contrat: numeroContrat, duree_mois: dureeMois, premier_loyer_ht: premierLoyer, loyer_mensuel_ht: loyerMensuel } } : {}) });
    }

    // ───────────── ENVOYER ─────────────
    if (action === "envoyer") {
      const numero = str(body.numero, 20);
      const ref = db.collection("devis_vente").doc(numero);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: `Devis ${numero} introuvable` });
      const dv: any = snap.data();
      const pdf = String(body.pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
      if (!pdf || pdf.length > 8_000_000) return res.status(400).json({ error: "PDF manquant ou trop volumineux" });

      // 1) PDF dans Storage (lien conservé sur le devis et les fiches machines)
      const bucket = admin.storage(appAdmin()).bucket(BUCKET);
      const token = (globalThis.crypto as any).randomUUID();
      const chemin = `devis_vente/${numero}.pdf`;
      await bucket.file(chemin).save(Buffer.from(pdf, "base64"), {
        contentType: "application/pdf",
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
      const pdfUrl = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chemin)}?alt=media&token=${token}`;
      // Lien personnel « Accepter et signer » (même lien si le devis est renvoyé)
      const jeton: string = /^[a-f0-9]{32}$/.test(String(dv.signature_jeton || "")) ? dv.signature_jeton : crypto.randomBytes(16).toString("hex");
      const z = body.zone_signature || {};
      const zone = [z.page, z.x, z.y, z.w, z.h].every((v: any) => Number.isFinite(Number(v)))
        ? { page: Number(z.page), x: Number(z.x), y: Number(z.y), w: Number(z.w), h: Number(z.h) } : null;
      const hote = req.headers["x-forwarded-host"] || req.headers.host || "delta-vo.vercel.app";
      const lien = lienSignature(String(hote), numero, jeton);

      // 🔒 Remise > 1 000 € / nacelle (hors admin) : validation Jonathan / Nathalie avant tout envoi
      if (dv.validation?.requise && dv.validation.statut !== "validee") {
        const v = await demanderValidation(db, ref, { ...dv, pdf_url: pdfUrl }, numero, body.envoyer_email !== false ? "email" : "pdf", String(hote), commercial.nom, { signature_jeton: jeton, ...(zone ? { zone_signature: zone } : {}) });
        return res.status(200).json({ ok: true, pdf_url: pdfUrl, email_envoye: false, validation: "en_attente", valideurs: v.valideurs });
      }

      // 2) Email au client (si demandé)
      let emailEnvoye = false;
      const dest = str(body.email || dv.client?.contact_email, 120);
      if (body.envoyer_email !== false) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return res.status(400).json({ error: "Email du client manquant ou invalide" });
        const e = await envoyerEmailClient(dv, numero, pdf, lien, dest);
        if (!e.ok) return res.status(e.status).json({ error: e.error, pdf_url: pdfUrl });
        emailEnvoye = true;
      }
      const now = new Date().toISOString();
      await ref.update({
        pdf_url: pdfUrl,
        signature_jeton: jeton,
        ...(zone ? { zone_signature: zone } : {}),
        statut: emailEnvoye ? "envoye" : dv.statut === "brouillon" ? "genere" : dv.statut,
        ...(emailEnvoye ? { envoye_le: now, envoye_a: dest } : {}),
        historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: emailEnvoye ? `envoyé à ${dest}` : "PDF généré", par: commercial.nom }),
      });
      console.log(`📧 Devis ${numero} ${emailEnvoye ? `envoyé à ${dest}` : "PDF enregistré"}`);
      return res.status(200).json({ ok: true, pdf_url: pdfUrl, email_envoye: emailEnvoye, to: dest, lien_signature: lien });
    }

    // ───────────── RAPPORT HEBDO : envoi immédiat (Admin → bouton « Envoyer maintenant ») ─────────────
    if (action === "rapport_test") {
      if (!["admin", "superadmin"].includes(String(profil.role || ""))) return res.status(403).json({ error: "Réservé aux administrateurs" });
      const r = await envoyerRapportHebdo({ force: true, destinataires: body.moi ? [user.email] : undefined });
      return res.status(r.ok ? 200 : 502).json(r);
    }

    // ───────────── CONFIG ─────────────
    if (action === "config") {
      return res.status(200).json({ ok: true, docusign: docusignConfigure() });
    }

    // ───────────── SIGNER (DocuSign) ─────────────
    if (action === "signer") {
      if (!docusignConfigure()) return res.status(503).json({ error: "Signature électronique pas encore configurée (DocuSign)" });
      const numero = str(body.numero, 20);
      const ref = db.collection("devis_vente").doc(numero);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: `Devis ${numero} introuvable` });
      const dv: any = snap.data();
      const pdf = String(body.pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
      if (!pdf || pdf.length > 8_000_000) return res.status(400).json({ error: "PDF manquant ou trop volumineux" });
      const email = str(dv.client?.contact_email, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email du client manquant ou invalide" });
      const pdfUrl = await sauverPdf(`devis_vente/${numero}.pdf`, Buffer.from(pdf, "base64"));
      const hote = String(req.headers["x-forwarded-host"] || req.headers.host || "delta-vo.vercel.app");
      if (dv.validation?.requise && dv.validation.statut !== "validee") {
        const v = await demanderValidation(db, ref, { ...dv, pdf_url: pdfUrl }, numero, "signature", hote, commercial.nom);
        return res.status(200).json({ ok: true, pdf_url: pdfUrl, validation: "en_attente", valideurs: v.valideurs, to: email });
      }
      let envelopeId = "";
      try {
        ({ envelopeId } = await lancerDocusign(dv, numero, pdf, hote));
      } catch (e: any) {
        if (e instanceof ErreurDocusign) {
          console.error("❌ DocuSign:", e.message, e.detail);
          return res.status(502).json({ error: e.message, consentement_url: e.consentementUrl || undefined, pdf_url: pdfUrl });
        }
        throw e;
      }
      const now = new Date().toISOString();
      await ref.update({
        pdf_url: pdfUrl,
        statut: "signature",
        envoye_le: now,
        envoye_a: email,
        docusign: { envelope_id: envelopeId, statut: "sent", envoye_le: now },
        historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `envoyé pour signature électronique à ${email} (DocuSign)`, par: commercial.nom }),
      });
      console.log(`✍️ Devis ${numero} envoyé pour signature à ${email} (enveloppe ${envelopeId})`);
      return res.status(200).json({ ok: true, pdf_url: pdfUrl, envelope_id: envelopeId, to: email });
    }

    // ───────────── ANNULER ─────────────
    if (action === "annuler") {
      const numero = str(body.numero, 20);
      const ref = db.collection("devis_vente").doc(numero);
      const snapA = await ref.get();
      if (!snapA.exists) return res.status(404).json({ error: `Devis ${numero} introuvable` });
      // ✍️ Un devis SIGNÉ ne s'annule pas en retirant l'offre : il reste signé (trace seulement)
      if (snapA.data()?.statut === "signe") {
        const t = new Date().toISOString();
        await ref.update({ historique: admin.firestore.FieldValue.arrayUnion({ date: t, action: `offre retirée après signature${body.motif ? " — " + str(body.motif, 200) : ""} (devis conservé signé)`, par: commercial.nom }) });
        return res.status(200).json({ ok: true, signe: true });
      }
      const env = snapA.data()?.docusign;
      if (env?.envelope_id && env.statut === "sent" && docusignConfigure()) {
        await annulerEnveloppe(env.envelope_id, `Devis annulé${body.motif ? " — " + str(body.motif, 150) : ""}`);
      }
      const now = new Date().toISOString();
      await ref.update({
        statut: "annule",
        annule_le: now,
        historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `annulé${body.motif ? " — " + str(body.motif, 200) : ""}`, par: commercial.nom }),
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "action inconnue (creer | envoyer | signer | annuler | config)" });
  } catch (e: any) {
    console.error("❌ devis:", e);
    return res.status(500).json({ error: e?.message || "Erreur serveur" });
  }
}
