// ============================================================
// 📊 ÉTUDE DE MARCHÉ IA — Delta VO (validé avec Jonathan)
// ============================================================
// Recherche sur le web (outil de recherche Anthropic) les annonces
// de nacelles COMPARABLES à une machine du stock, et renvoie une
// fourchette de prix « pour avoir un ordre d'idée » — reprise dans
// l'Export Pricing PDG (la décision de prix reste au PDG).
//
// Sites de référence (service marketing) : MachineryZone, Truckscorner,
// LeBonCoin, Agriaffaires (groupe LeBonCoin), Mascus, et les sites
// ViaMobilis (Europe-Camions, Europe-Utilitaires…).
// Critères de comparaison, par importance : hauteur de travail, déport,
// km, heures, année.
//
// PRÉREQUIS Vercel (projet delta-vo) : ANTHROPIC_API_KEY (déjà en place).
// Optionnel : ETUDE_MODEL (défaut claude-sonnet-4-5).
// ============================================================

export const maxDuration = 60; // les recherches web prennent 20-50 s

const SITES =
  "machineryzone.fr, truckscorner.fr, leboncoin.fr, agriaffaires.com, " +
  "mascus.fr, europe-camions.com, europe-utilitaires.com";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("❌ ANTHROPIC_API_KEY manquante");
    return res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY manquante" });
  }

  try {
    const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const desc = [
      b.type_nacelle && `type de nacelle : ${b.type_nacelle}`,
      b.hauteur && `hauteur de travail : ${b.hauteur} m`,
      b.deport && `déport : ${b.deport} m`,
      b.modele_porteur && `porteur : ${b.modele_porteur}`,
      b.annee && `année : ${b.annee}`,
      b.heures != null && b.heures !== "" && `heures nacelle : ${b.heures}`,
      b.km != null && b.km !== "" && `km porteur : ${b.km}`,
    ]
      .filter(Boolean)
      .join(", ");
    if (!desc) return res.status(400).json({ error: "Description machine manquante" });

    const prompt =
      `Tu es analyste du marché des nacelles élévatrices sur porteur (PEMP VL) d'occasion en France/Europe.\n\n` +
      `Machine à évaluer : ${desc}.\n\n` +
      `Cherche sur le web les ANNONCES ACTUELLES de machines comparables, en priorité sur ces sites : ${SITES}. ` +
      `Critères de comparabilité, par ordre d'importance : hauteur de travail, déport, kilométrage, heures, année. ` +
      `Ne retiens que des annonces AVEC PRIX affiché (ignore « prix sur demande »). 4 à 10 annonces suffisent.\n\n` +
      `Réponds UNIQUEMENT par un objet JSON (aucun texte autour) au format exact :\n` +
      `{"annonces":[{"titre":"...","prix_eur":00000,"annee":"...","heures":"...","site":"...","url":"..."}],` +
      `"fourchette_basse":00000,"fourchette_haute":00000,"mediane":00000,"nb_annonces":0,` +
      `"commentaire":"1 à 2 phrases sur l'état du marché pour ce modèle"}\n` +
      `Les montants sont en euros HT quand précisé, sinon tels qu'affichés. ` +
      `La fourchette exclut les valeurs aberrantes (annonce très au-dessus/en-dessous du lot).`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ETUDE_MODEL || "claude-sonnet-4-5",
        max_tokens: 3000,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("❌ Anthropic (étude marché)", resp.status, detail.slice(0, 400));
      return res.status(502).json({ error: "IA indisponible", status: resp.status });
    }

    const out: any = await resp.json();
    // Le texte final peut être réparti sur plusieurs blocs — on concatène
    const text = (out?.content || [])
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error("❌ Étude marché : pas de JSON dans la réponse", text.slice(0, 300));
      return res.status(502).json({ error: "Réponse IA illisible" });
    }
    let etude: any;
    try {
      etude = JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      console.error("❌ Étude marché : JSON invalide", text.slice(start, start + 300));
      return res.status(502).json({ error: "Réponse IA illisible (JSON)" });
    }

    // Nettoyage défensif
    const annonces = Array.isArray(etude.annonces)
      ? etude.annonces
          .filter((a: any) => a && (a.prix_eur || a.titre))
          .slice(0, 15)
          .map((a: any) => ({
            titre: String(a.titre || "").slice(0, 160),
            prix_eur: Number(a.prix_eur) || null,
            annee: String(a.annee ?? "").slice(0, 12),
            heures: String(a.heures ?? "").slice(0, 20),
            site: String(a.site || "").slice(0, 60),
            url: typeof a.url === "string" && /^https?:\/\//.test(a.url) ? a.url.slice(0, 500) : "",
          }))
      : [];

    console.log(`📊 Étude marché OK — ${annonces.length} annonce(s), fourchette ${etude.fourchette_basse}–${etude.fourchette_haute} €`);
    return res.status(200).json({
      annonces,
      fourchette_basse: Number(etude.fourchette_basse) || null,
      fourchette_haute: Number(etude.fourchette_haute) || null,
      mediane: Number(etude.mediane) || null,
      nb_annonces: annonces.length,
      commentaire: String(etude.commentaire || "").slice(0, 600),
    });
  } catch (e: any) {
    console.error("❌ etude-marche:", e);
    return res.status(500).json({ error: e?.message || "Erreur étude de marché" });
  }
}
