// ============================================================
// SYNCHRO STOCK VO -> BIBLIOTHÈQUE DE PRODUITS HUBSPOT
// ============================================================
// Appelé automatiquement par Delta VO à chaque mutation utile :
//   - action "upsert"  : crée ou met à jour le produit (prix fixé/modifié,
//                        machine (re)disponible avec un prix)
//   - action "archive" : archive le produit (machine vendue / sortie du stock)
//
// 1 produit = 1 nacelle, identifiée par son SKU = immatriculation (MAJUSCULES).
// On ne pousse QUE les machines qui ont un prix.
//
// Best-effort : si le scope "e-commerce" n'est pas encore accordé, l'appel
// échoue proprement et renvoie un warning, sans casser l'app.
// ============================================================

const HUBSPOT_API_BASE = "https://api.hubapi.com";

interface SyncProductBody {
  action: "upsert" | "archive";
  immat: string;
  modele?: string;
  prix?: number | null;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.error("❌ HUBSPOT_TOKEN manquant");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const hs = async (path: string, method: string, body?: any) => {
    const r = await fetch(`${HUBSPOT_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* noop */ }
    return { ok: r.ok, status: r.status, json, text };
  };

  try {
    const body: SyncProductBody = req.body;
    const action = body?.action;
    const immat = (body?.immat || "").trim().toUpperCase(); // SKU = immat MAJUSCULES

    if (!immat || (action !== "upsert" && action !== "archive")) {
      return res.status(400).json({ error: "action ('upsert'|'archive') et immat requis" });
    }

    // Retrouver le produit existant par SKU = immat
    const search = await hs("/crm/v3/objects/products/search", "POST", {
      filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: immat }] }],
      properties: ["hs_sku", "name", "price", "delta_vo_managed"],
      limit: 1,
    });

    if (!search.ok) {
      console.warn(`⚠️ Recherche produit ${immat} échouée (${search.status}): ${search.text}`);
      return res.status(200).json({
        status: "skipped",
        warning: `Recherche produit impossible (scope e-commerce manquant ?) [${search.status}]`,
      });
    }

    const existing = search.json?.results?.[0] || null;
    const existingId: string | null = existing?.id || null;

    // 🔒 Un produit ne peut être supprimé/modifié par Delta VO que s'il est "à nous" :
    //   - delta_vo_managed = "true" (produits créés après ce fix), OU
    //   - nom au format "IMMAT" / "IMMAT — modèle" (produits Delta VO historiques).
    const ownedByDeltaVO = (() => {
      if (!existing) return false;
      if (existing?.properties?.delta_vo_managed === "true") return true;
      const n = String(existing?.properties?.name || "");
      return n === immat || n.startsWith(`${immat} —`);
    })();

    // -------- ARCHIVE (machine vendue / sortie du stock) --------
    if (action === "archive") {
      if (!existingId) {
        return res.status(200).json({ status: "ok", note: "Aucun produit à archiver" });
      }
      if (!ownedByDeltaVO) {
        console.warn(`🚫 Produit ${immat} (id ${existingId}) NON géré par Delta VO -> suppression refusée`);
        return res.status(200).json({ status: "skipped", warning: "Produit non géré par Delta VO -> non supprimé" });
      }
      const del = await hs(`/crm/v3/objects/products/${existingId}`, "DELETE");
      if (!del.ok) {
        console.warn(`⚠️ Archive produit ${immat} échouée (${del.status}): ${del.text}`);
        return res.status(200).json({ status: "skipped", warning: `Archive impossible [${del.status}]` });
      }
      console.log(`🗄️ Produit archivé : ${immat}`);
      return res.status(200).json({ status: "ok", action: "archived", immat });
    }

    // -------- UPSERT (prix fixé/modifié, machine disponible) --------
    const prix = body.prix;
    if (prix === undefined || prix === null || Number(prix) <= 0) {
      // Pas de prix : on n'envoie pas le produit. Si un produit existait ET qu'il est
      // géré par Delta VO, on l'archive. Jamais de suppression d'un produit tiers.
      if (existingId && ownedByDeltaVO) {
        const del = await hs(`/crm/v3/objects/products/${existingId}`, "DELETE");
        if (del.ok) console.log(`🗄️ Produit archivé (prix retiré) : ${immat}`);
      } else if (existingId) {
        console.warn(`🚫 Produit ${immat} non géré par Delta VO -> non supprimé (prix retiré)`);
      }
      return res.status(200).json({ status: "ok", note: "Pas de prix -> non publié" });
    }

    const name = `${immat}${body.modele ? ` — ${body.modele}` : ""}`;
    const props: Record<string, string> = {
      name,
      price: String(prix),
      hs_sku: immat,
      delta_vo_managed: "true", // marqueur d'appartenance Delta VO
    };

    if (existingId) {
      if (!ownedByDeltaVO) {
        console.warn(`🚫 Produit ${immat} (id ${existingId}) NON géré par Delta VO -> MAJ refusée`);
        return res.status(200).json({ status: "skipped", warning: "SKU déjà utilisé par un produit tiers -> non modifié" });
      }
      let upd = await hs(`/crm/v3/objects/products/${existingId}`, "PATCH", { properties: { name, price: String(prix), delta_vo_managed: "true" } });
      if (!upd.ok && upd.status === 400) {
        // Repli : la propriété custom delta_vo_managed n'existe pas encore côté HubSpot
        upd = await hs(`/crm/v3/objects/products/${existingId}`, "PATCH", { properties: { name, price: String(prix) } });
      }
      if (!upd.ok) {
        console.warn(`⚠️ MAJ produit ${immat} échouée (${upd.status}): ${upd.text}`);
        return res.status(200).json({ status: "skipped", warning: `MAJ impossible [${upd.status}]` });
      }
      console.log(`♻️ Produit mis à jour : ${immat} (${prix} €)`);
      return res.status(200).json({ status: "ok", action: "updated", productId: existingId, immat });
    } else {
      let crea = await hs("/crm/v3/objects/products", "POST", { properties: props });
      if (!crea.ok && crea.status === 400) {
        // Repli : la propriété custom delta_vo_managed n'existe pas encore côté HubSpot
        const { delta_vo_managed, ...propsSansFlag } = props;
        crea = await hs("/crm/v3/objects/products", "POST", { properties: propsSansFlag });
      }
      if (!crea.ok) {
        console.warn(`⚠️ Création produit ${immat} échouée (${crea.status}): ${crea.text}`);
        return res.status(200).json({ status: "skipped", warning: `Création impossible [${crea.status}]` });
      }
      console.log(`✅ Produit créé : ${immat} (${prix} €)`);
      return res.status(200).json({ status: "ok", action: "created", productId: crea.json?.id, immat });
    }
  } catch (err: any) {
    console.error("❌ Erreur sync produit:", err);
    return res.status(200).json({ status: "skipped", warning: "Exception sync produit" });
  }
}
