// ============================================================
// CRÉATION DE DEAL + DEVIS HUBSPOT depuis Delta VO
// ============================================================
// Appelé par le front quand on valide une offre (vente en lot).
// - Crée un Deal HubSpot "VO - [client]"
// - Crée une ligne (line item) par nacelle (immat + prix)
// - Crée un DEVIS en BROUILLON rattaché au deal + aux lignes
//   (le vendeur le finalise/envoie ensuite dans HubSpot)
//
// La partie devis est "best-effort" : si le token de l'app privée
// n'a pas encore les scopes quotes/line_items, le deal est quand
// même créé et on renvoie un avertissement (quoteWarning).
// ============================================================

const HUBSPOT_API_BASE = "https://api.hubapi.com";

interface NacelleOffre {
  immat: string;
  modele?: string;
  montant: number;
}

interface CreateDealBody {
  client: string;
  nacelles: NacelleOffre[];
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
  // ID de modèle de devis Delta (optionnel) : pré-sélectionne le template.
  const quoteTemplateId = process.env.HUBSPOT_QUOTE_TEMPLATE_ID || "";

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
    const body: CreateDealBody = req.body;
    if (!body?.client || !body?.nacelles || body.nacelles.length === 0) {
      return res.status(400).json({ error: "client et nacelles requis" });
    }

    const amount = body.nacelles.reduce((sum, n) => sum + (Number(n.montant) || 0), 0);
    const immats = body.nacelles.map((n) => n.immat).join(", ");
    const dealName = `VO - ${body.client}`;
    const description = body.nacelles
      .map((n) => `• ${n.immat}${n.modele ? ` (${n.modele})` : ""} — ${(Number(n.montant) || 0).toLocaleString("fr-FR")} €`)
      .join("\n");

    // 1) DEAL
    const dealRes = await hs("/crm/v3/objects/deals", "POST", {
      properties: {
        dealname: dealName,
        amount: String(amount),
        pipeline: "1310426306", // KLUBB Sales Pipeline
        description: `Offre VO Delta VO\n\nImmatriculations : ${immats}\n\nNacelles :\n${description}`,
      },
    });
    if (!dealRes.ok) {
      console.error(`❌ HubSpot deal ${dealRes.status}:`, dealRes.text);
      return res.status(dealRes.status).json({
        error: "Erreur lors de la création du Deal HubSpot",
        details: dealRes.text,
      });
    }
    const dealId = dealRes.json.id as string;
    console.log(`✅ Deal HubSpot créé : ${dealId} - ${dealName}`);

    // 1b) Renseigner l'immatriculation sur le deal (propriété custom).
    // Best-effort : si la propriété immatriculation_nacelle n'existe pas encore
    // côté HubSpot, on ignore l'erreur (le deal reste créé).
    // NB : cas mono-nacelle. Le multi-nacelles sera traité plus tard.
    try {
      const patch = await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", {
        properties: { immatriculation_nacelle: immats },
      });
      if (!patch.ok) {
        console.warn(`⚠️ immatriculation_nacelle non renseignée (${patch.status}): ${patch.text}`);
      }
    } catch (e) {
      console.warn("⚠️ immatriculation_nacelle:", e);
    }

    // 2) DEVIS (best-effort)
    let quoteId: string | null = null;
    let quoteWarning: string | null = null;
    try {
      // 2a) Lignes (line items)
      const lineItemIds: string[] = [];
      for (const n of body.nacelles) {
        const liName = `${n.immat}${n.modele ? ` — ${n.modele}` : ""}`;
        const liRes = await hs("/crm/v3/objects/line_items", "POST", {
          properties: {
            name: liName,
            price: String(Number(n.montant) || 0),
            quantity: "1",
          },
        });
        if (!liRes.ok) throw new Error(`line_item ${liRes.status}: ${liRes.text}`);
        lineItemIds.push(liRes.json.id);
      }

      // 2b) Devis brouillon
      const expiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const quoteRes = await hs("/crm/v3/objects/quotes", "POST", {
        properties: {
          hs_title: `Offre VO - ${body.client}`,
          hs_expiration_date: expiration,
          hs_currency: "EUR",
          hs_language: "fr",
          hs_status: "DRAFT",
        },
      });
      if (!quoteRes.ok) throw new Error(`quote ${quoteRes.status}: ${quoteRes.text}`);
      quoteId = quoteRes.json.id;

      // 2c) Associations (v4 "default")
      const assoc = async (fromType: string, fromId: string, toType: string, toId: string) => {
        const a = await hs(
          `/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`,
          "PUT"
        );
        if (!a.ok) console.warn(`⚠️ assoc ${fromType}->${toType} ${a.status}: ${a.text}`);
      };

      await assoc("quotes", quoteId!, "deals", dealId);
      for (const li of lineItemIds) {
        await assoc("quotes", quoteId!, "line_items", li);
        await assoc("deals", dealId, "line_items", li);
      }
      if (quoteTemplateId) {
        await assoc("quotes", quoteId!, "quote_templates", quoteTemplateId);
      }
      console.log(`✅ Devis brouillon créé : ${quoteId} (deal ${dealId})`);
    } catch (qErr: any) {
      quoteWarning =
        "Le deal a été créé, mais pas le devis. Vérifiez que l'app privée HubSpot a les scopes " +
        "crm.objects.quotes.write et crm.objects.line_items.write.";
      console.error("⚠️ Création devis échouée :", qErr?.message || qErr);
    }

    return res.status(200).json({
      status: "ok",
      dealId,
      dealName,
      amount,
      quoteId,
      quoteWarning,
    });
  } catch (err: any) {
    console.error("❌ Erreur création Deal/Devis:", err);
    return res.status(500).json({ error: "Erreur serveur", message: err.message });
  }
}
