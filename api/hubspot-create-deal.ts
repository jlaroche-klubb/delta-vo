// ============================================================
// CRÉATION DE DEAL HUBSPOT depuis Delta VO
// ============================================================
// Appelé par le front quand on valide une offre (vente en lot).
// - Crée un Deal HubSpot "VO - [client]"
// - Le montant = somme des montants proposés
// - Stocke les immatriculations dans une propriété custom
// ============================================================

const HUBSPOT_API_BASE = "https://api.hubapi.com";
// Stage initial du Delta Services Pipeline (devra peut-être être ajusté)
// On laisse HubSpot choisir le stage par défaut du pipeline si vide.

interface NacelleOffre {
  immat: string;
  modele?: string;
  montant: number;
}

interface CreateDealBody {
  client: string;          // nom du client
  nacelles: NacelleOffre[]; // les nacelles de l'offre
}

export default async function handler(req: any, res: any) {
  // CORS pour permettre l'appel depuis le navigateur (même domaine, mais safe)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.error("❌ HUBSPOT_TOKEN manquant");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const body: CreateDealBody = req.body;

    if (!body?.client || !body?.nacelles || body.nacelles.length === 0) {
      return res
        .status(400)
        .json({ error: "client et nacelles requis" });
    }

    // Calcul du montant total
    const amount = body.nacelles.reduce(
      (sum, n) => sum + (Number(n.montant) || 0),
      0
    );

    // Liste des immat (concaténée) pour la propriété custom
    const immats = body.nacelles.map((n) => n.immat).join(", ");

    // Nom du deal : "VO - [client]"
    const dealName = `VO - ${body.client}`;

    // Description : liste des nacelles avec montants
    const description = body.nacelles
      .map(
        (n) =>
          `• ${n.immat}${n.modele ? ` (${n.modele})` : ""} — ${n.montant.toLocaleString("fr-FR")} €`
      )
      .join("\n");

    // Création du Deal via HubSpot API
    const createResponse = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/deals`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            dealname: dealName,
            amount: String(amount),
            // Immatriculations dans la description (en attendant la propriété custom)
            description: `Offre VO Delta VO\n\nImmatriculations : ${immats}\n\nNacelles :\n${description}`,
            // TODO : ajouter immatriculation_nacelle quand la propriété custom HubSpot sera créée
          },
        }),
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error(`❌ HubSpot ${createResponse.status}:`, errorText);
      return res.status(createResponse.status).json({
        error: "Erreur lors de la création du Deal HubSpot",
        details: errorText,
      });
    }

    const deal = await createResponse.json();
    console.log(`✅ Deal HubSpot créé : ${deal.id} - ${dealName}`);

    return res.status(200).json({
      status: "ok",
      dealId: deal.id,
      dealName,
      amount,
    });
  } catch (err: any) {
    console.error("❌ Erreur création Deal:", err);
    return res.status(500).json({
      error: "Erreur serveur",
      message: err.message,
    });
  }
}
