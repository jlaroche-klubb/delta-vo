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

    // ─── Interrogation du modèle (réutilisée pour l'auto-contrôle) ───
    const demander = async (imgData: string, imgType: string): Promise<number | null> => {
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
                { type: "image", source: { type: "base64", media_type: imgType, data: imgData } },
                {
                  type: "text",
                  text:
                    "Photo de chantier (camion nacelle, véhicule, extérieur ou habitacle). " +
                    "De combien de degrés faut-il la faire pivoter DANS LE SENS HORAIRE pour " +
                    "qu'elle soit droite (ciel/plafond en haut, sol en bas) ? " +
                    "La plupart des photos sont DÉJÀ droites : dans ce cas réponds 0. " +
                    "Gros plan sans repère fiable (roue, tôle, cadran...) : réponds 0. " +
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
        return null;
      }
      const out: any = await resp.json();
      const text: string = out?.content?.[0]?.text || "";
      const found = text.match(/\b(0|90|180|270)\b/);
      return found ? Number(found[1]) : 0;
    };

    const brut = await demander(data, mediaType);
    if (brut === null) return res.status(502).json({ error: "IA indisponible" });

    // ─── 🛡 AUTO-CONTRÔLE (anti-hallucination) ───
    // Le modèle a tendance à répondre « 90 » sur des gros plans pourtant
    // droits (constaté en production : rafales de rotation=90 sur des photos
    // correctes). Toute réponse ≠ 0 doit donc être PROUVÉE : on pivote la
    // miniature de l'angle annoncé et on redemande. Si le modèle ne répond
    // pas 0 sur l'image pivotée, sa réponse est rejetée (photo inchangée).
    // Une photo réellement couchée passe ce test ; une hallucination non.
    let rotation = 0;
    if (brut === 90 || brut === 180 || brut === 270) {
      try {
        const sharp = (await import("sharp")).default;
        const tourne = await sharp(Buffer.from(data, "base64")).rotate(brut).jpeg({ quality: 70 }).toBuffer();
        const controle = await demander(tourne.toString("base64"), "image/jpeg");
        if (controle === 0) rotation = brut;
        console.log(`🤖 rotation brute=${brut} · contrôle après pivot=${controle === null ? "échec" : controle} · final=${rotation}${ctx ? ` · ${ctx}` : ""}`);
      } catch (e: any) {
        // sharp indisponible ou image illisible : prudence, on ne pivote pas
        console.error(`⚠ auto-contrôle impossible (${e?.message}) → rotation refusée${ctx ? ` · ${ctx}` : ""}`);
      }
    } else {
      console.log(`🤖 rotation=0${ctx ? ` · ${ctx}` : ""}`);
    }
    return res.status(200).json({ rotation });
  } catch (e: any) {
    console.error("❌ photo-orientation:", e);
    return res.status(500).json({ error: e?.message || "Erreur contrôle orientation" });
  }
}
