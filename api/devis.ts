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

import admin from "firebase-admin";
import { cors, exigerUtilisateur, fetchAvecReessai } from "./_lib/auth.js";
import {
  ErreurDocusign, annulerEnveloppe, docusignConfigure, envelopeIdDepuisNotification,
  envoyerPourSignature, pdfSigne, secretWebhook, statutEnveloppe,
} from "./_lib/docusign.js";

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

async function emailBrevo(to: { email: string; name?: string }, sujet: string, html: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender || !to.email) return false;
  const r = await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta VO" }, to: [to], subject: sujet, htmlContent: html }),
  }, { timeoutMs: 15_000, essais: 1 }).catch(() => null);
  return !!r?.ok;
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
    // Fiches machines encore rattachées à ce devis : lien vers le PDF signé
    for (const l of dv.lignes || []) {
      if (!l.machine_id) continue;
      const mref = db.collection("machines_vo").doc(l.machine_id);
      const m = (await mref.get()).data();
      if (m?.devis_vente_numero === numero) await mref.update({ devis_vente_url: url, devis_vente_signe_le: st.date || now, updatedAt: now });
    }
    const T = MAIL[langueOk(dv.langue)];
    await emailBrevo({ email: dv.commercial?.email, name: dv.commercial?.nom }, T.signeSujet(numero, dv.client?.raison_sociale || "le client"),
      `<p>Bonjour,</p><p>Le devis <b>${esc(numero)}</b> a été <b>signé électroniquement</b> par ${esc(st.signataire || dv.client?.contact_nom || "le client")} (${esc(dv.client?.raison_sociale || "")}).</p>` +
      `<ul>${(dv.lignes || []).map((l: any) => `<li>${esc(l.reference)} — ${esc(l.designation)} : <b>${eur(l.prix_ht)} HT</b></li>`).join("")}</ul>` +
      `<p>Total : <b>${eur(dv.total_ht)} HT</b>${dv.acompte_pct ? ` · acompte ${dv.acompte_pct} % : ${eur(dv.acompte_ttc)} TTC` : " · financement bancaire"}</p>` +
      `<p>📄 <a href="${url}">Devis signé (PDF + certificat DocuSign)</a></p><p>Prochaine étape : passer la ou les nacelles en préparation dans <a href="${appli}">Delta VO</a>.</p>`);
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

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // Webhook DocuSign : pas d'utilisateur Delta VO, protégé par une clé dans l'URL
  if (String(req.query?.action || "") === "docusign") {
    try { return await webhookDocusign(req, res); }
    catch (e: any) { console.error("❌ webhook DocuSign:", e?.message, e?.detail || ""); return res.status(500).json({ error: e?.message || "erreur" }); }
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

      const annee = now.getFullYear();
      const compteurRef = db.collection("config").doc("compteur_devis_vente");
      const numero = await db.runTransaction(async (tx) => {
        const snap = await tx.get(compteurRef);
        const d = snap.exists ? snap.data() || {} : {};
        const suivant = d.annee === annee ? (Number(d.dernier) || 0) + 1 : 1;
        tx.set(compteurRef, { annee, dernier: suivant, maj: now.toISOString() });
        const n = `DV-${annee}-${String(suivant).padStart(4, "0")}`;
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
          langue: langueOk(body.langue),
          commercial,
          cree_par_uid: user.uid,
          historique: [{ date: now.toISOString(), action: "création", par: commercial.nom }],
        });
        return n;
      });
      console.log(`🧾 Devis ${numero} créé par ${commercial.nom} — ${client.raison_sociale}, ${lignes.length} nacelle(s), ${eur(totalHt)} HT`);
      return res.status(200).json({ ok: true, numero, commercial, total_ht: totalHt, tva, total_ttc: totalTtc });
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

      // 2) Email au client (si demandé)
      let emailEnvoye = false;
      const dest = str(body.email || dv.client?.contact_email, 120);
      if (body.envoyer_email !== false) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return res.status(400).json({ error: "Email du client manquant ou invalide" });
        const apiKey = process.env.BREVO_API_KEY;
        const sender = process.env.BREVO_SENDER_EMAIL;
        if (!apiKey || !sender) return res.status(500).json({ error: "Brevo non configuré" });
        const lg = langueOk(dv.langue);
        const T = MAIL[lg];
        const sepFr = lg === "fr" ? " " : "";
        const acompteTxt = dv.acompte_pct === 0 ? T.financement : T.acompte(dv.acompte_pct, eur(dv.acompte_ttc, lg));
        const html =
          `<p>${T.bonjour}${dv.client?.contact_nom ? " " + esc(dv.client.contact_nom) : ""},</p>` +
          `<p>${T.joint(esc(numero), dv.lignes.length)}</p>` +
          `<ul>${dv.lignes.map((l: any) => `<li>${esc(l.reference)} — ${esc(l.designation)}${sepFr}: <b>${eur(l.prix_ht, lg)} ${T.ht}</b></li>`).join("")}</ul>` +
          `<p>${T.total}${sepFr}: <b>${eur(dv.total_ht, lg)} ${T.ht}</b>${dv.tva_taux ? ` · ${eur(dv.total_ttc, lg)} ${T.ttc}` : ""}<br/>${esc(acompteTxt)}<br/>` +
          `${esc(T.valable(String(dv.date_expiration).split("-").reverse().join("/")))}</p>` +
          `<p>${esc(T.accepter)}</p>` +
          `<p>${T.cordialement}<br/>${esc(dv.commercial?.nom || "")}<br/>Delta Services${dv.commercial?.tel ? "<br/>" + esc(dv.commercial.tel) : ""}<br/>${esc(dv.commercial?.email || "")}</p>`;
        const r = await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
          body: JSON.stringify({
            sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta Services" },
            to: [{ email: dest, ...(dv.client?.contact_nom ? { name: dv.client.contact_nom } : {}) }],
            cc: dv.commercial?.email && dv.commercial.email !== dest ? [{ email: dv.commercial.email }] : undefined,
            replyTo: dv.commercial?.email ? { email: dv.commercial.email, name: dv.commercial.nom } : undefined,
            subject: T.sujet(numero),
            htmlContent: html,
            attachment: [{ name: `${T.fichier}_${numero}.pdf`, content: pdf }],
          }),
        }, { timeoutMs: 20_000, essais: 1 });
        if (!r.ok) {
          console.error("❌ Brevo devis", r.status, (await r.text()).slice(0, 300));
          return res.status(502).json({ error: "Envoi de l'email impossible — le PDF est enregistré, réessayez l'envoi", pdf_url: pdfUrl });
        }
        emailEnvoye = true;
      }
      const now = new Date().toISOString();
      await ref.update({
        pdf_url: pdfUrl,
        statut: emailEnvoye ? "envoye" : dv.statut === "brouillon" ? "genere" : dv.statut,
        ...(emailEnvoye ? { envoye_le: now, envoye_a: dest } : {}),
        historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: emailEnvoye ? `envoyé à ${dest}` : "PDF généré", par: commercial.nom }),
      });
      console.log(`📧 Devis ${numero} ${emailEnvoye ? `envoyé à ${dest}` : "PDF enregistré"}`);
      return res.status(200).json({ ok: true, pdf_url: pdfUrl, email_envoye: emailEnvoye, to: dest });
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
      const lg = langueOk(dv.langue);
      const T = MAIL[lg];
      const pdfUrl = await sauverPdf(`devis_vente/${numero}.pdf`, Buffer.from(pdf, "base64"));
      const hote = req.headers["x-forwarded-host"] || req.headers.host || "delta-vo.vercel.app";
      const joursRestants = Math.ceil((new Date(String(dv.date_expiration) + "T23:59:59").getTime() - Date.now()) / 86400000);
      let envelopeId = "";
      try {
        ({ envelopeId } = await envoyerPourSignature({
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
        }));
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
