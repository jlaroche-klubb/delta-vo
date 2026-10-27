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
// IA : Gemini (Vertex AI, compte de service Firebase) via api/_lib/ia.ts —
// retour arrière possible avec IA_FOURNISSEUR=anthropic.
// ============================================================

import { cors, exigerUtilisateur } from "./_lib/auth.js";
import { demanderIA } from "./_lib/ia.js";

export const maxDuration = 60;

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // 🔐 Jeton Firebase obligatoire (voir api/_lib/auth.ts)
  const user = await exigerUtilisateur(req, res, { accepterNE: true });
  if (!user) return;

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
    // ─── Interrogation du modèle (réutilisée pour l'auto-contrôle) ───
    // Formulation « où est le ciel ? » : les modèles de vision confondent
    // facilement 90° et 270° quand on leur demande un angle ; décrire le côté
    // du ciel est plus fiable (mesuré sur photos réelles d'expertise, 10/2026).
    const COTE: Record<string, number> = { HAUT: 0, GAUCHE: 90, BAS: 180, DROITE: 270 };
    const demander = async (imgData: string, imgType: string): Promise<number | null> => {
      const r = await demanderIA({
        modele: "rapide",
        maxTokens: 16,
        parties: [
          { image: { mediaType: imgType, data: imgData } },
          {
            texte:
              "Photo de chantier (camion nacelle, véhicule, extérieur ou habitacle). " +
              "Regarde où se trouvent le ciel / le plafond / le haut de la scène et où se trouvent " +
              "le sol / la route / les roues. Réponds UNIQUEMENT par un mot : HAUT si le ciel est en " +
              "haut de l'image (photo droite), GAUCHE si le ciel est sur le bord gauche, BAS si le ciel " +
              "est en bas (photo à l'envers), DROITE si le ciel est sur le bord droit. " +
              "Gros plan sans repère fiable (roue, tôle, cadran...) : HAUT.",
          },
        ],
        timeoutMs: 25_000,
        essais: 3,
      });
      if (!r.ok) {
        console.error(`❌ IA orientation (${r.fournisseur})`, r.status, r.detail);
        return null;
      }
      const m = r.texte.toUpperCase().match(/HAUT|GAUCHE|BAS|DROITE/);
      return m ? COTE[m[0]] : 0;
    };

    const brut = await demander(data, mediaType);
    if (brut === null) return res.status(502).json({ error: "IA indisponible" });

    // ─── 🛡 AUTO-CONTRÔLE (anti-hallucination) ───
    // Toute réponse ≠ 0 doit être PROUVÉE : on pivote la miniature de l'angle
    // annoncé et on redemande ; le modèle doit alors répondre « droite ».
    // Comme la confusion gauche/droite est l'erreur la plus fréquente, on
    // essaie aussi l'angle miroir (90 ↔ 270) avant de renoncer. Une photo
    // réellement couchée passe ce test ; une hallucination non (photo inchangée).
    let rotation = 0;
    if (brut === 90 || brut === 180 || brut === 270) {
      try {
        const sharp = (await import("sharp")).default;
        const candidats = brut === 180 ? [180] : [brut, 360 - brut];
        const controles: string[] = [];
        for (const c of candidats) {
          const tourne = await sharp(Buffer.from(data, "base64")).rotate(c).jpeg({ quality: 70 }).toBuffer();
          const controle = await demander(tourne.toString("base64"), "image/jpeg");
          controles.push(`${c}→${controle === null ? "échec" : controle}`);
          if (controle === 0) { rotation = c; break; }
        }
        console.log(`🤖 rotation brute=${brut} · contrôles ${controles.join(", ")} · final=${rotation}${ctx ? ` · ${ctx}` : ""}`);
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
