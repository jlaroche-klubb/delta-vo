// ============================================================
// SERVICE HUBSPOT (côté client)
// ============================================================
// Appelle les endpoints serverless Vercel pour interagir avec HubSpot.
// Le token reste côté serveur (jamais exposé au navigateur).
// ============================================================

export interface NacelleOffre {
  immat: string;
  modele?: string;
  montant: number;
}

export interface CreateDealResult {
  status: "ok";
  dealId: string;
  dealName: string;
  amount: number;
  quoteId?: string | null;
  quoteWarning?: string | null;
  ownerWarning?: string | null;
}

/**
 * Crée un Deal HubSpot pour une offre de nacelles VO.
 * Appelle l'endpoint serverless /api/hubspot-create-deal.
 */
export async function createHubspotDeal(
  client: string,
  nacelles: NacelleOffre[],
  userEmail?: string
): Promise<CreateDealResult> {
  const response = await fetch("/api/hubspot-create-deal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client, nacelles, userEmail }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error ||
        errorData.message ||
        `Erreur HubSpot (${response.status})`
    );
  }

  return response.json();
}

/**
 * Synchronise une nacelle vers la bibliothèque de produits HubSpot.
 * - action "upsert"  : crée/met à jour le produit (machine disponible avec prix)
 * - action "archive" : archive le produit (machine vendue / sortie du stock)
 * Best-effort : n'échoue jamais (les erreurs sont seulement loguées).
 */
export async function syncHubspotProduct(
  action: "upsert" | "archive",
  immat: string,
  modele?: string,
  prix?: number | null
): Promise<void> {
  try {
    const response = await fetch("/api/hubspot-sync-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, immat, modele, prix }),
    });
    const data = await response.json().catch(() => ({}));
    if (data?.warning) {
      console.warn(`⚠️ Sync produit HubSpot (${immat}):`, data.warning);
    }
  } catch (err) {
    console.warn(`⚠️ Sync produit HubSpot impossible (${immat}):`, err);
  }
}
