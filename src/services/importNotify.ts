/**
 * 🔔 ALERTE IMPORT (validée avec Jonathan) : à chaque import fait par un
 * admin (Parc VOG, VNC compta, Pricing PDG), un email récapitulatif part
 * au super admin — qui a importé, combien de machines, et les erreurs.
 *
 * - Les imports faits par Jonathan lui-même ne déclenchent pas d'email.
 * - Best-effort : un échec d'envoi n'interrompt JAMAIS l'import.
 */
export async function notifyImportAdmin(params: {
  type: "Parc VOG" | "VNC compta" | "Pricing PDG";
  par: string;
  email: string;
  resume: string[];
  erreurs: string[];
}): Promise<void> {
  try {
    // Jonathan n'a pas besoin d'être prévenu de ses propres imports
    if ((params.email || "").toLowerCase() === "jlaroche@klubb.com") return;
    await fetch("/api/notify-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (e) {
    console.warn("⚠️ Alerte import non envoyée :", e);
  }
}
