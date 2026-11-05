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
export function enregistrerPdfContratLLD(numero: string, pdfBase64: string, zone: ContratLLD["zone_signature"]): Promise<{ pdf_url: string }> {
  return appel({ action: "contrat_pdf", numero, pdfBase64, zone_signature: zone });
}
export function annulerContratLLD(numero: string, motif = ""): Promise<void> {
  return appel({ action: "contrat_annuler", numero, motif });
}
