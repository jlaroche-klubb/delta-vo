import { auth } from "../firebase";

/**
 * Validation du devis par la secrétaire : appelle la fonction serveur de
 * Nacelle Expert qui envoie l'expertise COMPLÈTE au client (avec copie
 * assistanat) et clôt l'attente de devis.
 *
 * L'identité Delta VO de la secrétaire (jeton Firebase) est vérifiée côté
 * serveur, ainsi que son rôle (secretaire/admin).
 */
const NACELLE_EXPERT_URL = "https://nacelle-expert2.vercel.app";

export async function validerDevisEtEnvoyer(
  immat: string,
  corrections?: { montant_global?: number; reference?: string }
): Promise<{ ok: boolean; error?: string; email_envoye?: boolean; client?: string | null }> {
  return appelValiderDevis(immat, corrections);
}

/** 🔔 Relance de Nacelle Assistance : renvoie l'email « Devis à chiffrer » (marqué relance). */
export async function relancerDevis(immat: string): Promise<{ ok: boolean; error?: string; relances?: number }> {
  return appelValiderDevis(immat, { action: "relancer" }) as any;
}

/** 🚫 Annulation de la demande de devis (société liquidée…) : débloque la facturation, aucun email. */
export async function annulerDemandeDevis(immat: string, motif: string): Promise<{ ok: boolean; error?: string }> {
  return appelValiderDevis(immat, { action: "annuler", motif });
}

async function appelValiderDevis(
  immat: string,
  corps?: Record<string, any>
): Promise<{ ok: boolean; error?: string; email_envoye?: boolean; client?: string | null; relances?: number }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: "Utilisateur non authentifié" };

    const resp = await fetch(`${NACELLE_EXPERT_URL}/api/valider-devis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ immat, ...(corps || {}) }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: j.error || `Erreur ${resp.status}` };
    return { ok: true, email_envoye: j.email_envoye, client: j.client, relances: j.relances };
  } catch (e: any) {
    console.error("validerDevisEtEnvoyer:", e);
    return { ok: false, error: e?.message || "Erreur réseau" };
  }
}
