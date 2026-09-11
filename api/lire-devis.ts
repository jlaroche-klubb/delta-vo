// ============================================================
// 🧾 LECTURE IA D'UN DEVIS ATELIER (PDF ou image) — Delta VO
// ============================================================
// Appelée par le SERVEUR Nacelle Expert (page devis /api/devis/[immat]) avec
// son jeton technique : Nacelle Assistance dépose son devis PDF, on en extrait
// le montant total HT, la référence, la date et les lignes. Le résultat est
// PROPOSÉ à l'utilisateur (champs pré-remplis modifiables), jamais écrit
// directement.
//
// Entrée  : { pdfBase64 | imageBase64, filename?, immat? }
// Sortie  : { ok, montant_ht, montant_ttc, reference, date, fournisseur,
//             lignes: [{ libelle, montant_ht }], confiance: "haute"|"moyenne"|"basse", note }
// ============================================================

import { cors, exigerUtilisateur, fetchAvecReessai } from "./_lib/auth.js";

export const maxDuration = 60;

const MAX_BASE64 = 6_000_000; // ≈ 4,5 Mo : limite du corps de requête Vercel

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await exigerUtilisateur(req, res, { accepterNE: true });
  if (!user) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("❌ ANTHROPIC_API_KEY manquante");
    return res.status(500).json({ error: "Server misconfigured: ANTHROPIC_API_KEY manquante" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const immat = String(body.immat || "").slice(0, 20);
    let data = "";
    let bloc: any;
    if (body.pdfBase64) {
      data = String(body.pdfBase64).replace(/^data:application\/pdf;base64,/, "");
      bloc = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (body.imageBase64) {
      const m = String(body.imageBase64).match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/);
      const mediaType = m ? (m[1] === "jpg" ? "image/jpeg" : `image/${m[1]}`) : "image/jpeg";
      data = m ? m[2] : String(body.imageBase64);
      bloc = { type: "image", source: { type: "base64", media_type: mediaType, data } };
    } else {
      return res.status(400).json({ error: "pdfBase64 ou imageBase64 manquant" });
    }
    if (data.length > MAX_BASE64) return res.status(413).json({ error: "Fichier trop volumineux (max ≈ 4 Mo)" });

    const consigne =
      "Tu lis un DEVIS de remise en état d'une nacelle élévatrice (atelier Nacelle Assistance / Delta Services)" +
      (immat ? `, véhicule immatriculé ${immat}` : "") +
      ". Extrais les informations suivantes et réponds UNIQUEMENT par un objet JSON valide, sans texte autour :\n" +
      "{\n" +
      '  "montant_ht": nombre (total HORS TAXES du devis en euros, sans séparateur de milliers, ou null si introuvable),\n' +
      '  "montant_ttc": nombre ou null,\n' +
      '  "reference": "numéro / référence du devis" ou null,\n' +
      '  "date": "AAAA-MM-JJ" ou null,\n' +
      '  "fournisseur": "nom de l\'entreprise qui émet le devis" ou null,\n' +
      '  "immat_detectee": "immatriculation lue sur le devis" ou null,\n' +
      '  "lignes": [ { "libelle": "…", "montant_ht": nombre } ] (les postes principaux, max 20),\n' +
      '  "confiance": "haute" | "moyenne" | "basse" (haute = total HT clairement identifié),\n' +
      '  "note": "remarque courte si quelque chose est ambigu (deux totaux, remise, acompte…)" ou null\n' +
      "}\n" +
      "Règles : le montant_ht est le TOTAL HT (après remise éventuelle, hors TVA). Si seul un TTC est lisible, " +
      "renseigne montant_ttc et laisse montant_ht à null. N'invente aucune valeur.";

    const resp = await fetchAvecReessai(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.DEVIS_MODEL || "claude-sonnet-4-5",
          max_tokens: 1200,
          messages: [{ role: "user", content: [bloc, { type: "text", text: consigne }] }],
        }),
      },
      { timeoutMs: 45_000, essais: 2 }
    );
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("❌ Anthropic lire-devis", resp.status, detail.slice(0, 300));
      return res.status(502).json({ error: "IA indisponible — saisissez le montant à la main" });
    }
    const out: any = await resp.json();
    const text: string = out?.content?.map((c: any) => c.text || "").join("") || "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    let r: any = {};
    try {
      r = json ? JSON.parse(json) : {};
    } catch {
      console.warn("⚠ lire-devis : JSON illisible", text.slice(0, 200));
    }
    const num = (v: any) => {
      if (v == null || v === "") return null;
      const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
    };
    const montant_ht = num(r.montant_ht);
    const montant_ttc = num(r.montant_ttc);
    const lignes = Array.isArray(r.lignes)
      ? r.lignes
          .map((l: any) => ({ libelle: String(l?.libelle || "").slice(0, 160), montant_ht: num(l?.montant_ht) }))
          .filter((l: any) => l.libelle)
          .slice(0, 20)
      : [];
    const confiance = montant_ht ? (["haute", "moyenne", "basse"].includes(r.confiance) ? r.confiance : "moyenne") : "basse";
    console.log(`🧾 lire-devis ${immat || "?"} : ${montant_ht ?? "?"} € HT · ref ${r.reference || "—"} · ${confiance}`);
    return res.status(200).json({
      ok: true,
      montant_ht,
      montant_ttc,
      reference: r.reference ? String(r.reference).slice(0, 60) : null,
      date: r.date ? String(r.date).slice(0, 10) : null,
      fournisseur: r.fournisseur ? String(r.fournisseur).slice(0, 80) : null,
      immat_detectee: r.immat_detectee ? String(r.immat_detectee).toUpperCase().slice(0, 12) : null,
      lignes,
      confiance,
      note: r.note ? String(r.note).slice(0, 200) : null,
    });
  } catch (e: any) {
    console.error("❌ lire-devis", e);
    return res.status(500).json({ error: e?.message || "Erreur serveur" });
  }
}
