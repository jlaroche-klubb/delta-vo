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
// IA : Gemini (Vertex AI) avec recherche Google via api/_lib/ia.ts —
// retour arrière possible avec IA_FOURNISSEUR=anthropic.
// ============================================================

import { cors, exigerUtilisateur } from "./_lib/auth.js";
import { demanderIA, extraireJSON } from "./_lib/ia.js";

export const maxDuration = 60; // les recherches web prennent 20-50 s

const SITES =
  "machineryzone.fr, truckscorner.fr, leboncoin.fr, agriaffaires.com, " +
  "mascus.fr, europe-camions.com, europe-utilitaires.com";

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  // 🔐 Jeton Firebase obligatoire (voir api/_lib/auth.ts)
  const user = await exigerUtilisateur(req, res, { roles: ["admin", "superadmin"] });
  if (!user) return;

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

    const r0 = await demanderIA({ modele: "fort", maxTokens: 3000, rechercheWeb: true, parties: [{ texte: prompt }], timeoutMs: 50_000, essais: 2 });
    if (!r0.ok) {
      console.error(`❌ IA étude marché (${r0.fournisseur})`, r0.status, r0.detail);
      return res.status(502).json({ error: "IA indisponible", status: r0.status });
    }
    const etude: any = extraireJSON(r0.texte);
    if (!etude) {
      console.error("❌ Étude marché : pas de JSON dans la réponse", r0.texte.slice(0, 300));
      return res.status(502).json({ error: "Réponse IA illisible" });
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
