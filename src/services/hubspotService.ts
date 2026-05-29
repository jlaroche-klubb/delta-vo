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
  }
  
  /**
   * Crée un Deal HubSpot pour une offre de nacelles VO.
   * Appelle l'endpoint serverless /api/hubspot-create-deal.
   */
  export async function createHubspotDeal(
    client: string,
    nacelles: NacelleOffre[]
  ): Promise<CreateDealResult> {
    const response = await fetch("/api/hubspot-create-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client, nacelles }),
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
  