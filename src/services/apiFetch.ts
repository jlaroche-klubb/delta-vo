import { auth } from "../firebase";

/**
 * 🔐 Appel des fonctions serveur (/api/*) avec le jeton Firebase de
 * l'utilisateur connecté. Toutes les fonctions exigent désormais ce jeton
 * (voir api/_lib/auth.ts) : un appel sans jeton reçoit 401.
 *
 * Usage : `apiFetch("/api/etude-marche", { method: "POST", body: JSON.stringify(x) })`
 * — mêmes paramètres que fetch, l'en-tête Authorization est ajouté.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch (e) {
    console.warn("⚠️ Jeton Firebase indisponible :", e);
  }
  return fetch(input, { ...init, headers });
}
