// ============================================================
// PROXY DÉTOURAGE remove.bg pour Delta VO (fiches export)
// ============================================================
// Le front envoie une image en base64 ; la clé remove.bg reste
// côté serveur (variable Vercel REMOVE_BG_KEY, jamais dans le bundle).
// Mêmes réglages que la fiche FR : type=car, ombre portée.
// ============================================================

import { cors, exigerUtilisateur, fetchAvecReessai } from "./_lib/auth";

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // 🔐 Jeton Firebase obligatoire (voir api/_lib/auth.ts)
  const user = await exigerUtilisateur(req, res, { accepterNE: true });
  if (!user) return;

  const key = process.env.REMOVE_BG_KEY;
  if (!key) {
    console.error("❌ REMOVE_BG_KEY manquant (à ajouter dans les variables Vercel de delta-vo)");
    return res.status(500).json({ error: "Server misconfigured: REMOVE_BG_KEY manquant" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const imageBase64: string | undefined = body.imageBase64;
  if (!imageBase64) {
    return res.status(400).json({ error: "imageBase64 manquant" });
  }

  try {
    const rb = await fetchAvecReessai("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        image_file_b64: imageBase64,
        size: "auto",
        // "auto" (et non "car") : sur une nacelle sur porteur, le profil
        // voiture amputait parfois la cabine ou le plateau (cas DS2294)
        type: "auto",
        shadow_type: "drop",
        shadow_opacity: "55",
      }),
    }, { timeoutMs: 40_000, essais: 2 });

    if (!rb.ok) {
      const detail = await rb.text();
      console.error("❌ remove.bg", rb.status, detail);
      return res.status(rb.status).json({ error: "remove.bg error", detail });
    }

    const arrayBuf = await rb.arrayBuffer();
    const out = Buffer.from(arrayBuf).toString("base64");
    return res.status(200).json({ imageBase64: out });
  } catch (e: any) {
    console.error("❌ Proxy détourage:", e);
    return res.status(500).json({ error: e?.message || "Erreur proxy détourage" });
  }
}
