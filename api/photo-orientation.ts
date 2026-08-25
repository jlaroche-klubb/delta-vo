// ============================================================
// 🤖 CONTRÔLE IA D'ORIENTATION DES PHOTOS
// ============================================================
// Certains téléphones (Samsung notamment) écrivent une étiquette
// d'orientation EXIF qui ment : la correction automatique classique
// couche alors des photos qui étaient droites. Ici, une IA de vision
// REGARDE l'image (ciel, roues, horizon...) et répond de combien de
// degrés la faire pivoter pour qu'elle soit droite.
//
// Appelé par Nacelle Expert (et Delta VO) juste avant l'upload d'une
// photo, avec une MINIATURE (≈384 px) pour un coût de quelques
// centièmes de centime par photo.
//
// PRÉREQUIS Vercel (projet delta-vo) : ANTHROPIC_API_KEY.
// Optionnel : ORIENTATION_MODEL (défaut claude-haiku-4-5).
// ============================================================

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // appelé depuis nacelle-expert2
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("❌ ANTHROPIC_API_KEY manquante (variables Vercel du projet delta-vo)");
    return res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY manquante" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    // Contexte optionnel (immat/zone/origine) — uniquement pour les journaux
    const ctx = String(body.ctx || "").slice(0, 120);
    let data: string | undefined = body.imageBase64;
    if (!data) return res.status(400).json({ error: "imageBase64 manquant" });
    // Accepte les data-URL comme le base64 brut
    const m = String(data).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
    const mediaType = m ? (m[1] === "jpg" ? "image/jpeg" : `image/${m[1]}`) : "image/jpeg";
    data = m ? m[2] : String(data);
    if (data.length > 2_000_000) {
      return res.status(413).json({ error: "Image trop grande — envoyez une miniature" });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ORIENTATION_MODEL || "claude-haiku-4-5",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data } },
              {
                type: "text",
                text:
                  "Photo de chantier (camion nacelle, véhicule, extérieur ou habitacle). " +
                  "De combien de degrés faut-il la faire pivoter DANS LE SENS HORAIRE pour " +
                  "qu'elle soit droite (ciel/plafond en haut, sol en bas) ? " +
                  "Réponds UNIQUEMENT par un de ces nombres : 0, 90, 180, 270.",
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("❌ Anthropic", resp.status, detail.slice(0, 300));
      return res.status(502).json({ error: "IA indisponible", status: resp.status });
    }
    const out: any = await resp.json();
    const text: string = out?.content?.[0]?.text || "";
    const found = text.match(/\b(0|90|180|270)\b/);
    const rotation = found ? Number(found[1]) : 0;
    // 📋 Journalisé SYSTÉMATIQUEMENT : permet de vérifier après coup ce que
    // l'IA a répondu photo par photo (diagnostic GQ-115-JH)
    console.log(`🤖 rotation=${rotation}${ctx ? ` · ${ctx}` : ""}`);
    return res.status(200).json({ rotation });
  } catch (e: any) {
    console.error("❌ photo-orientation:", e);
    return res.status(500).json({ error: e?.message || "Erreur contrôle orientation" });
  }
}
