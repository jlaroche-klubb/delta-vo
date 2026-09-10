// ============================================================
// 🔐 AUTHENTIFICATION DES FONCTIONS SERVEUR — Delta VO
// ============================================================
// Jusqu'ici, /api/* était appelable par n'importe qui sur Internet (crédits
// Anthropic / remove.bg, envoi d'emails, écritures HubSpot). Désormais chaque
// appel du front porte le jeton Firebase de l'utilisateur connecté
// (`Authorization: Bearer <idToken>`) et la fonction le vérifie ici.
//
// - Jetons acceptés : projet Firebase **delta-vo** (l'appli) et, quand la
//   fonction l'autorise, projet **nacelle-expert** (l'appli NE appelle
//   /api/photo-orientation et /api/removebg).
// - La vérification d'un jeton ne demande PAS de compte de service : le SDK
//   Admin télécharge les clés publiques Google et contrôle l'audience
//   (= projectId). Le compte de service (FIREBASE_SERVICE_ACCOUNT) n'est
//   utilisé que pour lire le rôle dans Firestore (users/{uid}).
// - Aucune donnée d'un utilisateur n'est renvoyée au client : juste 401/403.
// ============================================================

import admin from "firebase-admin";

export interface Utilisateur {
  uid: string;
  email: string;
  projet: "delta-vo" | "nacelle-expert";
  role?: string;
}

const PROJET_DELTA_VO = "delta-vo";
const PROJET_NE = "nacelle-expert";

function appDeltaVo(): admin.app.App {
  const existante = admin.apps.find((a) => a?.name === "[DEFAULT]");
  if (existante) return existante;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (raw) {
    return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: PROJET_DELTA_VO });
  }
  // Sans compte de service : vérification de jeton possible, lecture Firestore non
  return admin.initializeApp({ projectId: PROJET_DELTA_VO });
}

function appNE(): admin.app.App {
  const existante = admin.apps.find((a) => a?.name === "ne-verify");
  if (existante) return existante;
  return admin.initializeApp({ projectId: PROJET_NE }, "ne-verify");
}

function jetonDepuisRequete(req: any): string | null {
  const h = String(req.headers?.authorization || req.headers?.Authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

/**
 * Vérifie le jeton et renvoie l'utilisateur, ou envoie 401/403 et renvoie null.
 * @param opts.roles  rôles Delta VO acceptés (lus dans users/{uid}) — omis = tout utilisateur connecté
 * @param opts.accepterNE  accepter aussi un jeton du projet Nacelle Expert
 */
export async function exigerUtilisateur(
  req: any,
  res: any,
  opts: { roles?: string[]; accepterNE?: boolean } = {}
): Promise<Utilisateur | null> {
  const token = jetonDepuisRequete(req);
  if (!token) {
    res.status(401).json({ error: "Connexion requise" });
    return null;
  }

  let user: Utilisateur | null = null;
  try {
    const d = await admin.auth(appDeltaVo()).verifyIdToken(token);
    user = { uid: d.uid, email: d.email || "", projet: "delta-vo" };
  } catch {
    if (opts.accepterNE) {
      try {
        const d = await admin.auth(appNE()).verifyIdToken(token);
        user = { uid: d.uid, email: d.email || "", projet: "nacelle-expert" };
      } catch {
        /* jeton invalide pour les deux projets */
      }
    }
  }
  if (!user) {
    res.status(401).json({ error: "Jeton invalide ou expiré — reconnectez-vous" });
    return null;
  }

  if (opts.roles?.length) {
    if (user.projet !== "delta-vo") {
      res.status(403).json({ error: "Accès réservé aux utilisateurs Delta VO" });
      return null;
    }
    try {
      const snap = await admin.firestore(appDeltaVo()).collection("users").doc(user.uid).get();
      user.role = snap.exists ? String(snap.data()?.role || "") : "";
    } catch (e) {
      console.error("❌ Lecture du rôle impossible (FIREBASE_SERVICE_ACCOUNT ?)", e);
      res.status(500).json({ error: "Vérification du rôle impossible" });
      return null;
    }
    if (!opts.roles.includes(user.role || "")) {
      res.status(403).json({ error: "Droits insuffisants" });
      return null;
    }
  }
  return user;
}

/** En-têtes CORS communs (l'en-tête Authorization doit être autorisé en pré-vol). */
export function cors(req: any, res: any): boolean {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * fetch avec délai maximal et réessais sur 429 / 5xx / erreurs réseau
 * (Anthropic renvoie régulièrement 529 « overloaded » : un 2e essai suffit).
 */
export async function fetchAvecReessai(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; essais?: number } = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const essais = opts.essais ?? 3;
  let derniere: any = null;
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (r.status === 429 || r.status === 529 || (r.status >= 500 && r.status < 600)) {
        derniere = r;
        if (i < essais - 1) {
          const retryAfter = Number(r.headers.get("retry-after")) || 0;
          await new Promise((ok) => setTimeout(ok, Math.max(retryAfter * 1000, 1500 * (i + 1))));
          continue;
        }
      }
      return r;
    } catch (e) {
      derniere = e;
      if (i < essais - 1) await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
  if (derniere instanceof Response) return derniere;
  throw derniere;
}
