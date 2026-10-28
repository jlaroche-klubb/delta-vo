// ============================================================
// ✍️ DOCUSIGN — signature électronique des devis de vente Delta VO
// ============================================================
// Authentification « JWT Grant » (serveur à serveur, aucun mot de passe) :
// l'appli agit au nom de l'utilisateur DocuSign de Jonathan (compte
// Business Pro, plateforme EU).
//
// Variables Vercel :
//   DOCUSIGN_INTEGRATION_KEY  clé d'intégration (Apps & Keys)          — obligatoire
//   DOCUSIGN_USER_ID          « API Username » / User ID (GUID)          — obligatoire
//   DOCUSIGN_PRIVATE_KEY      clé privée RSA (texte PEM complet)         — obligatoire
//   DOCUSIGN_ACCOUNT_ID       défaut : compte 668f48de-… (Jonathan Laroche)
//   DOCUSIGN_BASE_PATH        défaut : https://eu.docusign.net/restapi (production EU)
//                             test : https://demo.docusign.net/restapi
//   DOCUSIGN_OAUTH_HOST       défaut : account.docusign.com (test : account-d.docusign.com)
//
// Les PDF des devis portent deux ancres invisibles dans l'encadré « Bon pour
// accord » : \s1\ (signature) et \d1\ (date) — voir utils/generateDevisPdf.ts.
// ============================================================

import crypto from "node:crypto";
import { fetchAvecReessai } from "./auth.js";

export const ANCRE_SIGNATURE = "\\s1\\";
export const ANCRE_DATE = "\\d1\\";

export function docusignConfigure(): boolean {
  return !!(process.env.DOCUSIGN_INTEGRATION_KEY && process.env.DOCUSIGN_USER_ID && process.env.DOCUSIGN_PRIVATE_KEY);
}

const basePath = () => (process.env.DOCUSIGN_BASE_PATH || "https://eu.docusign.net/restapi").replace(/\/$/, "");
const accountId = () => process.env.DOCUSIGN_ACCOUNT_ID || "668f48de-28c7-402f-91f7-a90af8b3bcf0";
const oauthHost = () => process.env.DOCUSIGN_OAUTH_HOST || (basePath().includes("demo.") ? "account-d.docusign.com" : "account.docusign.com");

/** Clé privée : accepte le PEM collé tel quel, avec des « \n » littéraux, ou encodé en base64 */
function clePrivee(): string {
  let k = String(process.env.DOCUSIGN_PRIVATE_KEY || "").trim();
  if (!k.includes("BEGIN")) {
    try { k = Buffer.from(k, "base64").toString("utf8"); } catch { /* tel quel */ }
  }
  return k.replace(/\\n/g, "\n");
}

/** Secret du webhook, dérivé de la clé privée (aucune variable de plus à créer) */
export function secretWebhook(): string {
  return crypto.createHash("sha256").update("delta-vo-docusign:" + clePrivee()).digest("hex").slice(0, 32);
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

let jeton: { valeur: string; expire: number } | null = null;

export class ErreurDocusign extends Error {
  constructor(message: string, public detail = "", public consentementUrl = "") { super(message); }
}

/** URL à ouvrir UNE fois (connecté à DocuSign) pour autoriser l'appli à signer au nom de l'utilisateur */
export function urlConsentement(): string {
  return `https://${oauthHost()}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${encodeURIComponent(process.env.DOCUSIGN_INTEGRATION_KEY || "")}&redirect_uri=${encodeURIComponent("https://delta-vo.vercel.app/")}`;
}

async function jetonAcces(): Promise<string> {
  if (jeton && Date.now() < jeton.expire) return jeton.valeur;
  const now = Math.floor(Date.now() / 1000);
  const entete = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corps = b64url(JSON.stringify({
    iss: process.env.DOCUSIGN_INTEGRATION_KEY,
    sub: process.env.DOCUSIGN_USER_ID,
    aud: oauthHost(),
    iat: now,
    exp: now + 3600,
    scope: "signature impersonation",
  }));
  const signature = b64url(crypto.createSign("RSA-SHA256").update(`${entete}.${corps}`).sign(clePrivee()));
  const r = await fetchAvecReessai(`https://${oauthHost()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${entete}.${corps}.${signature}`,
  }, { timeoutMs: 15_000, essais: 1 });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    if (j.error === "consent_required") {
      throw new ErreurDocusign("DocuSign : autorisation à donner une fois (lien ci-dessous, connecté avec votre compte DocuSign)", j.error, urlConsentement());
    }
    throw new ErreurDocusign(`DocuSign : connexion refusée (${j.error || r.status})`, JSON.stringify(j).slice(0, 300));
  }
  jeton = { valeur: j.access_token, expire: Date.now() + (Number(j.expires_in || 3600) - 300) * 1000 };
  return jeton.valeur;
}

async function api(chemin: string, init: RequestInit = {}): Promise<Response> {
  const token = await jetonAcces();
  return fetchAvecReessai(`${basePath()}/v2.1/accounts/${accountId()}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  }, { timeoutMs: 25_000, essais: 1 });
}

export interface EnvoiSignature {
  numero: string;
  pdfBase64: string;
  nomFichier: string;
  langue: "fr" | "en" | "es";
  client: { nom: string; email: string };
  commercial: { nom: string; email: string };
  sujet: string;
  message: string;
  webhookUrl: string;
  expireJours: number;
}

/** Crée et envoie l'enveloppe : le client reçoit l'email DocuSign, le commercial une copie du signé */
export async function envoyerPourSignature(e: EnvoiSignature): Promise<{ envelopeId: string }> {
  const enveloppe = {
    emailSubject: e.sujet.slice(0, 100),
    emailBlurb: e.message.slice(0, 2000),
    status: "sent",
    documents: [{ documentBase64: e.pdfBase64, name: e.nomFichier, fileExtension: "pdf", documentId: "1" }],
    recipients: {
      signers: [{
        email: e.client.email,
        name: e.client.nom,
        recipientId: "1",
        routingOrder: "1",
        emailNotification: { emailSubject: e.sujet.slice(0, 100), emailBody: e.message.slice(0, 2000), supportedLanguage: e.langue },
        tabs: {
          signHereTabs: [{ anchorString: ANCRE_SIGNATURE, anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-6", anchorIgnoreIfNotPresent: "false" }],
          dateSignedTabs: [{ anchorString: ANCRE_DATE, anchorUnits: "pixels", anchorXOffset: "0", anchorYOffset: "-4", anchorIgnoreIfNotPresent: "true" }],
        },
      }],
      carbonCopies: e.commercial.email && e.commercial.email.toLowerCase() !== e.client.email.toLowerCase()
        ? [{ email: e.commercial.email, name: e.commercial.nom || e.commercial.email, recipientId: "2", routingOrder: "2" }]
        : [],
    },
    customFields: { textCustomFields: [{ name: "devis_delta_vo", value: e.numero, show: "false" }] },
    notification: { useAccountDefaults: "false", reminders: { reminderEnabled: "true", reminderDelay: "3", reminderFrequency: "3" }, expirations: { expireEnabled: "true", expireAfter: String(Math.max(e.expireJours, 1)), expireWarn: "2" } },
    eventNotification: {
      url: e.webhookUrl,
      requireAcknowledgment: "true",
      loggingEnabled: "true",
      includeDocuments: "false",
      eventData: { version: "restv2.1", format: "json", includeData: [] },
      envelopeEvents: [
        { envelopeEventStatusCode: "completed" },
        { envelopeEventStatusCode: "declined" },
        { envelopeEventStatusCode: "voided" },
      ],
    },
  };
  const r = await api("/envelopes", { method: "POST", body: JSON.stringify(enveloppe) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.envelopeId) throw new ErreurDocusign(`DocuSign : envoi refusé (${j.errorCode || r.status})`, j.message || JSON.stringify(j).slice(0, 300));
  return { envelopeId: j.envelopeId };
}

/** Statut de l'enveloppe + motif de refus éventuel */
export async function statutEnveloppe(envelopeId: string): Promise<{ statut: string; motifRefus?: string; signataire?: string; date?: string }> {
  const r = await api(`/envelopes/${encodeURIComponent(envelopeId)}?include=recipients`);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErreurDocusign(`DocuSign : enveloppe illisible (${r.status})`, JSON.stringify(j).slice(0, 300));
  const s = j.recipients?.signers?.[0] || {};
  return { statut: String(j.status || ""), motifRefus: s.declinedReason || j.voidedReason || "", signataire: s.name, date: j.completedDateTime || j.declinedDateTime || j.voidedDateTime };
}

/** PDF signé (document + certificat de signature) */
export async function pdfSigne(envelopeId: string): Promise<Buffer> {
  const r = await api(`/envelopes/${encodeURIComponent(envelopeId)}/documents/combined?certificate=true`, { headers: { Accept: "application/pdf" } });
  if (!r.ok) throw new ErreurDocusign(`DocuSign : PDF signé indisponible (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/** Annule une enveloppe en cours (devis annulé dans Delta VO) */
export async function annulerEnveloppe(envelopeId: string, motif: string): Promise<void> {
  await api(`/envelopes/${encodeURIComponent(envelopeId)}`, { method: "PUT", body: JSON.stringify({ status: "voided", voidedReason: (motif || "Devis annulé").slice(0, 200) }) }).catch(() => undefined);
}

/** ID d'enveloppe dans une notification (JSON Connect v2.1 ou ancien XML) */
export function envelopeIdDepuisNotification(body: any): string {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
    return String(body.data?.envelopeId || body.envelopeId || body.EnvelopeStatus?.EnvelopeID || "");
  }
  const t = Buffer.isBuffer(body) ? body.toString("utf8") : String(body || "");
  try { const j = JSON.parse(t); return String(j.data?.envelopeId || j.envelopeId || ""); } catch { /* XML */ }
  return t.match(/<EnvelopeID>([^<]+)<\/EnvelopeID>/i)?.[1] || "";
}
