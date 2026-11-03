// ============================================================
// SERVICE HUBSPOT (côté client)
// ============================================================
// Décision Jonathan (03/11/2026) : les devis se font dans Delta VO.
// - Le catalogue produits HubSpot n'est PLUS synchronisé (syncHubspotProduct
//   ne fait plus rien ; les appels existants restent inoffensifs).
// - Seules les ventes FACTURÉES (ventes + locations financières, pas les LLD)
//   partent dans HubSpot : transaction « Gagnée » dans le DELTA Sales Pipeline
//   + mise à jour du parc « Machines » (envoyerVenteHubspot).
// Le token reste côté serveur (jamais exposé au navigateur).
// ============================================================

import { apiFetch } from "./apiFetch";

export interface ResultatVenteHubspot { ok: boolean; deal_id?: string; detail: string }

/** 🏆 Vente facturée → transaction gagnée HubSpot (idempotent, ne lève jamais) */
export async function envoyerVenteHubspot(machineId: string): Promise<ResultatVenteHubspot> {
  try {
    const r = await apiFetch("/api/hubspot-create-deal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machine_id: machineId }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: !!j.ok, deal_id: j.deal_id, detail: j.detail || j.error || `erreur ${r.status}` };
  } catch (e: any) {
    return { ok: false, detail: e?.message || "HubSpot injoignable" };
  }
}

/** 🧹 Super admin : retire du catalogue produits HubSpot les produits créés par Delta VO */
export async function viderCatalogueHubspot(): Promise<{ supprimes: number; ignores: number }> {
  const r = await apiFetch("/api/hubspot-sync-product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "vider_catalogue", immat: "-" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return { supprimes: Number(j.supprimes) || 0, ignores: Number(j.ignores) || 0 };
}

/**
 * ⛔ Synchro du catalogue produits HubSpot arrêtée : ne fait plus rien.
 * Conservée pour ne pas toucher aux nombreux appels existants.
 */
export async function syncHubspotProduct(
  _action: "upsert" | "archive",
  _immat: string,
  _modele?: string,
  _prix?: number | null
): Promise<void> {
  return;
}
