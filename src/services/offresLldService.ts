// ============================================================
// 📄 Offres LLD — service côté navigateur (lot 2)
// ============================================================
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { apiFetch } from "./apiFetch";
import type { ChoixOffreLLD, OffreLLD, OptionOffreLLD } from "../types/lld";

async function appel(corps: Record<string, any>): Promise<any> {
  const r = await apiFetch("/api/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { details: j });
  return j;
}

/** Liste temps réel des offres (les plus récentes d'abord) */
export function ecouterOffresLLD(cb: (offres: OffreLLD[]) => void): () => void {
  const q = query(collection(db, "offres_lld"), orderBy("date", "desc"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as OffreLLD)), (e) => { console.error("❌ offres LLD :", e); cb([]); });
}

export type OffreLLDSaisie = Omit<OffreLLD, "numero" | "statut" | "date" | "date_expiration">;

export function creerOffreLLD(o: OffreLLDSaisie): Promise<{ numero: string; date: string; date_expiration: string }> {
  return appel({ action: "offre_creer", ...o });
}
export function modifierOffreLLD(numero: string, o: OffreLLDSaisie): Promise<{ date_expiration: string }> {
  return appel({ action: "offre_modifier", numero, ...o });
}
export function genererLienOffreLLD(numero: string, pdfBase64: string, zone: OffreLLD["zone_signature"]): Promise<{ pdf_url: string; lien: string }> {
  return appel({ action: "offre_generer", numero, pdfBase64, zone_signature: zone });
}
/** 📧 Envoie le lien de signature au client (email de l'offre), avec le PDF en pièce jointe */
export function envoyerLienOffreLLD(numero: string): Promise<{ envoye_a: string }> {
  return appel({ action: "offre_envoyer", numero });
}
export function changerStatutOffreLLD(numero: string, statut: "refusee" | "annulee", motif = ""): Promise<void> {
  return appel({ action: "offre_statut", numero, statut, motif });
}

// ───────── Page publique ─────────
export interface OffrePublique {
  numero: string; statut: "a_signer" | "signee" | "expiree" | "annulee"; date: string; date_expiration: string;
  client: { raison_sociale: string; contact_nom: string };
  commercial: { nom: string; email: string; tel: string };
  materiel: "vo" | "neuf"; courte_duree: boolean; avec_assurance: boolean; full_services: boolean;
  modele: string; quantite: number; durees: { mois: number; loyer_ht: number; loyer_assurance_ht?: number }[]; options: OptionOffreLLD[];
  transport: { mode: "offert" | "chiffre"; prix_ht?: number; adresse?: string };
  km_an: number; heures: string; prix_km_sup: number; caution_mois: number;
  pdf_url?: string; choix?: ChoixOffreLLD | null; signe_le?: string | null; signataire?: string | null;
}

async function appelPublic(corps: Record<string, any>): Promise<any> {
  const r = await fetch("/api/devis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Erreur ${r.status}`), { details: j });
  return j;
}
export interface ContactFiche { nom: string; fonction: string; email: string; tel: string }
/** Coordonnées société demandées à la signature de l'offre (pour rédiger le contrat) */
export interface FicheOffre {
  raison_sociale: string; siret: string; siren: string; adresse: string; cp: string; ville: string; tva_intra: string; naf: string; forme_juridique: string; telephone: string; fax: string; email: string;
  facturation_societe: string; facturation_email: string; facturation_adresse: string;
  contact_compta: ContactFiche | null; contact_maintenance: ContactFiche | null; commande_obligatoire: boolean | null; contact_commande: ContactFiche | null;
  signataire: ContactFiche; deja_complete: boolean;
}
export async function lireOffrePublique(numero: string, jeton: string): Promise<{ offre: OffrePublique; fiche: FicheOffre }> {
  const r = await appelPublic({ action: "public_offre_lire", numero, jeton });
  return { offre: r.offre, fiche: r.fiche };
}
export async function signerOffrePublique(numero: string, jeton: string, d: { nom: string; fonction: string; email: string; tel: string; accepte: boolean; signature: string; duree_mois: number; avec_assurance: boolean; options: string[]; fiche: Omit<FicheOffre, "signataire" | "deja_complete" | "siren"> }): Promise<OffrePublique> {
  return (await appelPublic({ action: "public_offre_signer", numero, jeton, ...d })).offre;
}
