// ============================================================
// PROXY IMAGE pour Delta VO (traitement des photos de fiche)
// ============================================================
// Certaines photos (selon le bucket / l'ancienneté de l'URL) refusent
// le téléchargement direct par le navigateur (CORS), alors qu'elles
// s'affichent normalement. Ce proxy les récupère côté serveur et les
// renvoie en base64 au front (rotation, détourage...).
//
// 🔒 Sécurité : uniquement les URLs de NOS stockages Firebase
// (delta-vo et nacelle-expert) — aucune autre destination acceptée.
// ============================================================

const ALLOWED = [
  /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/(delta-vo|nacelle-expert)\.(firebasestorage\.app|appspot\.com)\//,
  /^https:\/\/storage\.googleapis\.com\/(delta-vo|nacelle-expert)\.(firebasestorage\.app|appspot\.com)\//,
];

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const url: string | undefined = body.url;
    if (!url || !ALLOWED.some((re) => re.test(url))) {
      return res.status(400).json({ error: "URL non autorisée" });
    }

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: `Téléchargement impossible [${r.status}]` });
    }
    const contentType = r.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ error: "La ressource n'est pas une image" });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: "Image trop volumineuse" });
    }
    return res.status(200).json({
      base64: `data:${contentType};base64,${buf.toString("base64")}`,
    });
  } catch (e: any) {
    console.error("❌ fetch-image:", e);
    return res.status(500).json({ error: e?.message || "Erreur proxy image" });
  }
}
