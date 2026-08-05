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
  immat: string
): Promise<{ ok: boolean; error?: string; email_envoye?: boolean; client?: string | null }> {
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: "Utilisateur non authentifié" };

    const resp = await fetch(`${NACELLE_EXPERT_URL}/api/valider-devis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ immat }),
    });
    const j = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: j.error || `Erreur ${resp.status}` };
    return { ok: true, email_envoye: j.email_envoye, client: j.client };
  } catch (e: any) {
    console.error("validerDevisEtEnvoyer:", e);
    return { ok: false, error: e?.message || "Erreur réseau" };
  }
}
