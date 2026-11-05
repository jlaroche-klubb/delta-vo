// ============================================================
// 📑 Contrats LLD — service côté navigateur (lot 3)
// Lecture temps réel Firestore ; écritures via /api/devis (Jonathan seul).
// ============================================================
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { apiFetch } from "./apiFetch";
import type { ContratLLD, ControleContratLLD } from "../types/lld";

async function appel(corps: Record<string, any>): Promise<any> {
  const r = await apiFetch("/api/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { details: j });
  return j;
}

/** Liste temps réel des contrats (les plus récents d'abord) */
export function ecouterContratsLLD(cb: (contrats: ContratLLD[]) => void): () => void {
  const q = query(collection(db, "contrats_lld"), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as ContratLLD)), (e) => { console.error("❌ contrats LLD :", e); cb([]); });
}

/** Champs saisis dans le formulaire (le serveur recalcule totaux, TVA et caution par défaut) */
export type ContratLLDSaisie = Pick<ContratLLD, "client_id" | "client" | "commercial" | "full_services" | "materiel" | "modele" | "immat" | "duree_mois" | "loyer_ht" | "assurance" | "assurance_ht" | "options" | "km_an" | "prix_km_sup" | "transport" | "date_livraison_souhaitee" | "jour_prelevement"> & { caution_ttc?: number };

/** Création manuelle (client sous tarif) */
export function creerContratLLD(c: ContratLLDSaisie): Promise<{ numero: string }> {
  return appel({ action: "contrat_creer", ...c });
}
export function modifierContratLLD(numero: string, c: ContratLLDSaisie): Promise<void> {
  return appel({ action: "contrat_modifier", numero, ...c });
}
/** Contrôle bloquant : renvoie erreurs / avertissements ; si ok, le contrat passe en « contrôlé » */
export async function controlerContratLLD(numero: string): Promise<ControleContratLLD> {
  return (await appel({ action: "contrat_controler", numero })).controle;
}
export function enregistrerPdfContratLLD(numero: string, pdfBase64: string, zone: ContratLLD["zone_signature"], champs?: ContratLLD["champs_pdf"]): Promise<{ pdf_url: string }> {
  return appel({ action: "contrat_pdf", numero, pdfBase64, zone_signature: zone, champs_pdf: champs });
}
export function annulerContratLLD(numero: string, motif = ""): Promise<void> {
  return appel({ action: "contrat_annuler", numero, motif });
}

// ───────── Lot 4 : lien, pièces, page publique ─────────
export function genererLienContratLLD(numero: string): Promise<{ lien: string }> {
  return appel({ action: "contrat_lien", numero });
}
/** Pièce du dossier (CNI, RIB, contrat signé) — Jonathan + assistantes ; renvoyée en base64, jamais d'URL publique */
export async function lirePieceContratLLD(numero: string, piece: "cni" | "rib" | "contrat"): Promise<{ base64: string; content_type: string; nom: string }> {
  return appel({ action: "contrat_piece", numero, piece });
}
export async function ouvrirPieceContratLLD(numero: string, piece: "cni" | "rib" | "contrat"): Promise<void> {
  const p = await lirePieceContratLLD(numero, piece);
  const bin = atob(p.base64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u8], { type: p.content_type }));
  const a = document.createElement("a"); a.href = url; a.download = p.nom; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ───────── Lot 5 : affectation (Jonathan + assistantes) ─────────
export function affecterContratLLD(numero: string, d: { machine_id: string; type_prepa: "normale" | "en_etat"; date_livraison?: string }): Promise<{ immat: string; detail: string }> {
  return appel({ action: "contrat_affecter", numero, ...d });
}
export function desaffecterContratLLD(numero: string, motif = ""): Promise<void> {
  return appel({ action: "contrat_desaffecter", numero, motif });
}
export function livrerContratLLD(numero: string, date_livraison = ""): Promise<void> {
  return appel({ action: "contrat_livrer", numero, date_livraison });
}

export interface ContactPublic { nom?: string; fonction?: string; email?: string; tel?: string }
export interface ContratPublic {
  numero: string; statut: "a_signer" | "signe" | "annule" | "indisponible"; date: string; rum: string; nouveau_client: boolean;
  client: { raison_sociale: string; siret: string; siren: string; adresse: string; cp: string; ville: string; tva_intra: string; naf: string; telephone: string; fax: string; email: string; contact_nom: string; contact_email: string; contact_tel: string; facturation_societe: string; facturation_email: string; facturation_adresse: string; contact_compta: ContactPublic | null; contact_maintenance: ContactPublic | null; commande_obligatoire: boolean | null; contact_commande: ContactPublic | null };
  commercial: { nom: string; email: string; tel: string };
  full_services: boolean; materiel: "vo" | "neuf"; modele: string; immat: string; duree_mois: number; loyer_ht: number; assurance: boolean; assurance_ht: number;
  options: { libelle: string; prix_mensuel_ht: number }[]; total_mensuel_ht: number; tva_ht: number; total_mensuel_ttc: number; caution_ttc: number; km_an: number; prix_km_sup: number;
  transport: { mode: "offert" | "chiffre"; prix_ht?: number; adresse?: string }; date_livraison_souhaitee: string; jour_prelevement: number;
  sepa: { creancier: string; ics: string; adresse_creancier: string };
  cg_version: string; cg_texte: string | null; pdf_url?: string; signe_le: string | null; signataire: string | null; pieces: { cni: boolean; rib: boolean };
}
async function appelPublic(corps: Record<string, any>): Promise<any> {
  const r = await fetch("/api/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { details: j });
  return j;
}
export async function lireContratPublique(numero: string, jeton: string): Promise<ContratPublic> {
  return (await appelPublic({ action: "public_contrat_lire", numero, jeton })).contrat;
}
/** Dépôt d'une pièce ; pour le RIB, le serveur renvoie les coordonnées bancaires lues par l'IA (préremplissage du mandat, à vérifier par le client) */
export async function deposerPiecePublique(numero: string, jeton: string, piece: "cni" | "rib", fichier: { base64: string; content_type: string; nom: string }): Promise<{ titulaire: string; iban: string; bic: string } | null> {
  return (await appelPublic({ action: "public_contrat_piece", numero, jeton, piece, ...fichier })).banque || null;
}
export interface SignatureContratSaisie {
  nom: string; fonction: string; email: string; tel: string; accepte_cg: boolean; signature: string;
  fiche: Omit<ContratPublic["client"], "siren" | "contact_nom" | "contact_email" | "contact_tel">;
  sepa: { titulaire: string; adresse_titulaire: string; cp: string; ville: string; iban: string; bic: string; lieu: string };
}
export async function signerContratPublique(numero: string, jeton: string, d: SignatureContratSaisie): Promise<ContratPublic> {
  return (await appelPublic({ action: "public_contrat_signer", numero, jeton, ...d })).contrat;
}
