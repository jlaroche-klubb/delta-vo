import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { apiFetch } from "./apiFetch";
import type { LangueDevis } from "../utils/devisLangues";
import type { ZoneSignature } from "../utils/generateDevisPdf";

/**
 * 🧾 Devis de vente faits dans Delta VO (plus de devis HubSpot — décision
 * Jonathan, 28/10/2026). Numérotation et enregistrement côté serveur
 * (/api/devis), PDF généré dans le navigateur (utils/generateDevisPdf).
 */

export type AcompteDevis = 30 | 100 | 0;

export interface ClientDevis {
  raison_sociale: string;
  siren?: string;
  tva_intra?: string; // n° TVA intracommunautaire (rempli par l'annuaire des entreprises)
  adresse?: string;
  cp?: string;
  ville?: string;
  contact_nom?: string;
  contact_email?: string;
  contact_tel?: string;
}

export interface LigneDevis {
  machine_id: string;
  immat: string;
  reference: string;
  designation: string;
  prix_ht: number;
}

export interface DevisVente {
  numero: string;
  date: string;
  date_expiration: string;
  client: ClientDevis;
  lignes: LigneDevis[];
  tva_taux: number;
  exoneration?: string;
  total_ht: number;
  tva: number;
  total_ttc: number;
  acompte_pct: AcompteDevis;
  acompte_ttc: number;
  conditions: string;
  commercial: { nom: string; email: string; tel?: string };
  /** Langue du devis (PDF + email au client) — défaut fr */
  langue?: LangueDevis;
}

/** Paramètres société affichés sur les devis (Admin → Paramètres des devis) */
export interface ConfigDevis {
  raison_sociale: string;
  adresse: string;
  telephone: string;
  site_web: string;
  mentions_legales: string; // SIREN, RCS, TVA intracom, capital…
  iban: string;
  bic: string;
  conditions_defaut: string; // texte « Conditions » pré-rempli
  cgv: string; // conditions générales de vente (page 2 du PDF si renseignées)
  // Versions anglaise / espagnole (devis EN / ES). Vides → texte par défaut traduit (conditions) / pas de page CGV
  conditions_defaut_en?: string;
  conditions_defaut_es?: string;
  cgv_en?: string;
  cgv_es?: string;
  validite_jours: number;
}

export const CONFIG_DEVIS_DEFAUT: ConfigDevis = {
  raison_sociale: "DELTA SERVICES",
  adresse: "12 avenue James de Rothschild\n77164 Ferrières-en-Brie",
  telephone: "+33 (0)1 60 95 47 80",
  site_web: "www.delta-services.fr",
  mentions_legales: "SIREN 512 252 792",
  iban: "",
  bic: "",
  conditions_defaut:
    "Matériel d'occasion vendu en l'état, visible sur site avant enlèvement. " +
    "Livraison ou enlèvement après encaissement de la totalité du prix. " +
    "Le transfert de propriété intervient au paiement intégral.",
  cgv: "",
  conditions_defaut_en: "",
  conditions_defaut_es: "",
  cgv_en: "",
  cgv_es: "",
  validite_jours: 30,
};

export async function chargerConfigDevis(): Promise<ConfigDevis> {
  try {
    const snap = await getDoc(doc(db, "config", "devis"));
    return { ...CONFIG_DEVIS_DEFAUT, ...(snap.exists() ? (snap.data() as Partial<ConfigDevis>) : {}) };
  } catch {
    return { ...CONFIG_DEVIS_DEFAUT };
  }
}

export async function enregistrerConfigDevis(cfg: ConfigDevis): Promise<void> {
  await setDoc(doc(db, "config", "devis"), { ...cfg, maj: new Date().toISOString() }, { merge: true });
}

async function appel(corps: Record<string, any>): Promise<any> {
  const r = await apiFetch("/api/devis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { details: j });
  return j;
}

export function creerDevisVente(d: {
  client: ClientDevis;
  lignes: LigneDevis[];
  tva_taux: number;
  exoneration?: string;
  acompte_pct: AcompteDevis;
  validite_jours: number;
  conditions: string;
  langue: LangueDevis;
  type_prepa: "normale" | "en_etat";
  date_livraison: string;
}): Promise<{ numero: string; commercial: DevisVente["commercial"]; total_ht: number; tva: number; total_ttc: number }> {
  return appel({ action: "creer", ...d });
}

export function envoyerDevisVente(numero: string, pdfBase64: string, envoyerEmail: boolean, zoneSignature?: ZoneSignature): Promise<{ pdf_url: string; email_envoye: boolean; to?: string; lien_signature?: string }> {
  return appel({ action: "envoyer", numero, pdfBase64, envoyer_email: envoyerEmail, zone_signature: zoneSignature });
}

// ───────── Page publique « Accepter et signer » (lien de l'email, sans compte) ─────────
export interface DevisPublic {
  numero: string; date: string; date_expiration: string; langue: LangueDevis;
  statut: "a_signer" | "signe" | "expire" | "annule";
  client: { raison_sociale: string; contact_nom: string };
  lignes: { reference: string; designation: string; prix_ht: number }[];
  tva_taux: number; total_ht: number; tva: number; total_ttc: number;
  acompte_pct: number; acompte_ttc: number; conditions: string;
  commercial: { nom: string; email: string; tel: string };
  pdf_url?: string; signe_le?: string | null; signataire?: string | null;
}

async function appelPublic(corps: Record<string, any>): Promise<any> {
  const r = await fetch("/api/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { code: j.error, details: j });
  return j;
}

export async function lireDevisPublic(numero: string, jeton: string): Promise<DevisPublic> {
  return (await appelPublic({ action: "public_lire", numero, jeton })).devis;
}

export async function signerDevisPublic(numero: string, jeton: string, d: { nom: string; fonction: string; accepte: boolean; signature: string }): Promise<DevisPublic> {
  return (await appelPublic({ action: "public_signer", numero, jeton, ...d })).devis;
}

/** Signature électronique disponible ? (variables DocuSign renseignées dans Vercel) */
export async function signatureDisponible(): Promise<boolean> {
  try { return !!(await appel({ action: "config" })).docusign; } catch { return false; }
}

/** Envoi pour signature électronique DocuSign (le client reçoit l'email DocuSign) */
export function signerDevisVente(numero: string, pdfBase64: string): Promise<{ pdf_url: string; envelope_id: string; to: string }> {
  return appel({ action: "signer", numero, pdfBase64 });
}

export function annulerDevisVente(numero: string, motif?: string): Promise<void> {
  return appel({ action: "annuler", numero, motif });
}
