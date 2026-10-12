// ============================================================
// 🤖 FOURNISSEUR D'IA — Delta VO (décision Jonathan, 12/10/2026 : Gemini via Google Cloud)
// ============================================================
// Un seul point d'entrée pour les trois usages IA de l'appli :
//   - photo-orientation (photo couchée ?)        → modèle « rapide »
//   - lire-devis (PDF / image de devis)          → modèle « rapide »
//   - etude-marche (recherche web + synthèse)    → modèle « fort » + recherche Google
//
// Fournisseur par défaut : **Gemini sur Vertex AI**, authentifié avec le compte
// de service Firebase déjà présent dans Vercel (FIREBASE_SERVICE_ACCOUNT, projet
// Google Cloud delta-vo) : aucune clé supplémentaire, facturation sur le projet
// Google Cloud. PRÉREQUIS côté Google Cloud (une fois) :
//   1. Facturation activée sur le projet delta-vo
//   2. API « Vertex AI » activée (aiplatform.googleapis.com)
//   3. Rôle « Vertex AI User » (roles/aiplatform.user) donné au compte de service
//      firebase-adminsdk-…@delta-vo.iam.gserviceaccount.com
//
// Variables Vercel optionnelles :
//   IA_FOURNISSEUR = gemini (défaut) | anthropic (retour arrière : ANTHROPIC_API_KEY)
//   GEMINI_MODEL_RAPIDE (défaut gemini-2.5-flash), GEMINI_MODEL_FORT (défaut gemini-2.5-pro)
//   GEMINI_LOCATION (défaut global)
// ============================================================

import { fetchAvecReessai } from "./auth.js";

export type PartieIA =
  | { texte: string }
  | { image: { mediaType: string; data: string } }
  | { pdf: { data: string } };

export interface DemandeIA {
  /** rapide = vision / extraction ; fort = raisonnement + recherche */
  modele: "rapide" | "fort";
  parties: PartieIA[];
  maxTokens?: number;
  /** Réponse attendue en JSON strict (Gemini : responseMimeType) */
  json?: boolean;
  /** Recherche web (Gemini : Google Search grounding ; Anthropic : web_search) */
  rechercheWeb?: boolean;
  /** Raisonnement interne (Gemini thinking) : 0 = désactivé (défaut pour le modèle rapide) */
  reflexion?: number;
  timeoutMs?: number;
  essais?: number;
}

export type ReponseIA = { ok: true; texte: string; fournisseur: string } | { ok: false; status: number; detail: string; fournisseur: string };

export function fournisseurIA(): "gemini" | "anthropic" {
  return (process.env.IA_FOURNISSEUR || "gemini").toLowerCase() === "anthropic" ? "anthropic" : "gemini";
}

export async function demanderIA(d: DemandeIA): Promise<ReponseIA> {
  return fournisseurIA() === "anthropic" ? viaAnthropic(d) : viaGemini(d);
}

// ─────────────────────────────────────────────────────────────
// Gemini (Vertex AI, compte de service Firebase)
// ─────────────────────────────────────────────────────────────
let jetonGoogle: { token: string; expire: number } | null = null;

async function jetonAccesGoogle(): Promise<{ token: string; projet: string }> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant (variables Vercel)");
  const cred = JSON.parse(raw);
  const projet = process.env.GEMINI_PROJECT || cred.project_id || "delta-vo";
  if (jetonGoogle && Date.now() < jetonGoogle.expire) return { token: jetonGoogle.token, projet };
  const { GoogleAuth } = await import("google-auth-library");
  const auth = new GoogleAuth({ credentials: cred, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const t = await client.getAccessToken();
  const token = typeof t === "string" ? t : t?.token || "";
  if (!token) throw new Error("jeton Google Cloud indisponible");
  jetonGoogle = { token, expire: Date.now() + 45 * 60 * 1000 };
  return { token, projet };
}

async function viaGemini(d: DemandeIA): Promise<ReponseIA> {
  const fournisseur = "gemini";
  let token = "", projet = "";
  try {
    ({ token, projet } = await jetonAccesGoogle());
  } catch (e: any) {
    return { ok: false, status: 500, detail: e?.message || String(e), fournisseur };
  }
  const model = d.modele === "fort"
    ? process.env.GEMINI_MODEL_FORT || "gemini-2.5-pro"
    : process.env.GEMINI_MODEL_RAPIDE || "gemini-2.5-flash";
  const location = process.env.GEMINI_LOCATION || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${projet}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const parts = d.parties.map((p) =>
    "texte" in p ? { text: p.texte }
      : "image" in p ? { inlineData: { mimeType: p.image.mediaType, data: p.image.data } }
      : { inlineData: { mimeType: "application/pdf", data: p.pdf.data } }
  );
  const generationConfig: any = { maxOutputTokens: d.maxTokens ?? 1024, temperature: 0 };
  // JSON strict incompatible avec la recherche Google : on parse le texte dans ce cas
  if (d.json && !d.rechercheWeb) generationConfig.responseMimeType = "application/json";
  const reflexion = d.reflexion ?? (d.modele === "rapide" ? 0 : undefined);
  if (reflexion !== undefined) generationConfig.thinkingConfig = { thinkingBudget: reflexion };
  const body: any = { contents: [{ role: "user", parts }], generationConfig };
  if (d.rechercheWeb) body.tools = [{ googleSearch: {} }];

  const resp = await fetchAvecReessai(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { timeoutMs: d.timeoutMs ?? 30_000, essais: d.essais ?? 2 });

  if (!resp.ok) {
    const detail = (await resp.text()).slice(0, 400);
    // Messages clairs pour les causes classiques (visibles dans les logs Vercel)
    const aide =
      resp.status === 403 ? " — API Vertex AI non activée ou rôle « Vertex AI User » manquant sur le compte de service"
      : resp.status === 404 ? ` — modèle ${model} introuvable dans la région ${location}`
      : resp.status === 429 ? " — quota Vertex AI dépassé"
      : "";
    return { ok: false, status: resp.status, detail: detail + aide, fournisseur };
  }
  const out: any = await resp.json().catch(() => null);
  const cand = out?.candidates?.[0];
  const texte = (cand?.content?.parts || []).map((p: any) => p.text || "").join("");
  if (!texte) {
    const raison = cand?.finishReason || out?.promptFeedback?.blockReason || "réponse vide";
    return { ok: false, status: 502, detail: `Gemini : ${raison}`, fournisseur };
  }
  return { ok: true, texte, fournisseur };
}

// ─────────────────────────────────────────────────────────────
// Anthropic (retour arrière : IA_FOURNISSEUR=anthropic + ANTHROPIC_API_KEY)
// ─────────────────────────────────────────────────────────────
async function viaAnthropic(d: DemandeIA): Promise<ReponseIA> {
  const fournisseur = "anthropic";
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, status: 500, detail: "ANTHROPIC_API_KEY manquante", fournisseur };
  const model = d.modele === "fort"
    ? process.env.ANTHROPIC_MODEL_FORT || "claude-sonnet-4-5"
    : process.env.ANTHROPIC_MODEL_RAPIDE || "claude-haiku-4-5";
  const content = d.parties.map((p) =>
    "texte" in p ? { type: "text", text: p.texte }
      : "image" in p ? { type: "image", source: { type: "base64", media_type: p.image.mediaType, data: p.image.data } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.pdf.data } }
  );
  const body: any = { model, max_tokens: d.maxTokens ?? 1024, messages: [{ role: "user", content }] };
  if (d.rechercheWeb) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }];
  const resp = await fetchAvecReessai("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { timeoutMs: d.timeoutMs ?? 30_000, essais: d.essais ?? 2 });
  if (!resp.ok) return { ok: false, status: resp.status, detail: (await resp.text()).slice(0, 400), fournisseur };
  const out: any = await resp.json().catch(() => null);
  const texte = (out?.content || []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  return texte ? { ok: true, texte, fournisseur } : { ok: false, status: 502, detail: "réponse vide", fournisseur };
}

/** Extrait le premier objet JSON d'un texte (le modèle peut entourer de prose ou de ```json) */
export function extraireJSON(texte: string): any | null {
  const start = texte.indexOf("{");
  const end = texte.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(texte.slice(start, end + 1)); } catch { return null; }
}
