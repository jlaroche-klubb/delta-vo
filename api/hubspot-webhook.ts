// ============================================================
// WEBHOOK HUBSPOT → DELTA VO
// ============================================================
// Reçoit les notifications de HubSpot quand un Deal change de stage.
// Si le Deal passe en "Closed Won" (stage 4444367065), on récupère
// l'immatriculation de la nacelle (propriété du Deal) et on bascule
// la machine correspondante en "en_cours" (préparation) dans Firebase.
// ============================================================

import admin from "firebase-admin";

// ---- Firebase Admin : écriture serveur autorisée (contourne les règles
// de sécurité Firestore via un compte de service). Le JSON du compte de
// service est stocké dans la variable d'environnement FIREBASE_SERVICE_ACCOUNT. ----
function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant");
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "delta-vo",
    });
  }
  return admin.firestore();
}

// ---- Constantes HubSpot ----
const HUBSPOT_API_BASE = "https://api.hubapi.com";

// Nom de la propriété HubSpot qui contient l'immatriculation de la nacelle.
// Le commercial doit renseigner ce champ sur le Deal.
const HUBSPOT_IMMAT_PROPERTY = "immatriculation_nacelle";

/**
 * Récupère les immatriculations rattachées à un Deal :
 *  1) via les LIGNES DE PRODUIT du deal (hs_sku = immatriculation) -> Option A
 *  2) en secours, via la propriété immatriculation_nacelle (1 ou plusieurs, séparées par virgule)
 * Renvoie la liste dédupliquée + le nom du deal.
 */
async function getDealImmats(dealId: string, token: string): Promise<{ immats: string[]; dealName?: string; isClosedWon: boolean }> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const immats = new Set<string>();

  // 1) Lignes de produit -> hs_sku
  try {
    const assocRes = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/deals/${dealId}/associations/line_items`,
      { headers }
    );
    const assoc = await assocRes.json().catch(() => null);
    const ids: string[] = (assoc?.results || [])
      .map((r: any) => r.id ?? r.toObjectId)
      .filter(Boolean)
      .map((x: any) => String(x));

    if (ids.length) {
      const batch = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/line_items/batch/read`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          properties: ["hs_sku", "name"],
          inputs: ids.map((id) => ({ id })),
        }),
      });
      const bj = await batch.json().catch(() => null);
      for (const li of bj?.results || []) {
        const sku = li?.properties?.hs_sku;
        const v = sku ? String(sku).trim().toUpperCase() : "";
        if (v) immats.add(v);
      }
    }
  } catch (e) {
    console.warn("⚠️ Lecture lignes de produit impossible:", e);
  }

  // 2) Secours : propriété immatriculation_nacelle (+ nom du deal)
  let dealName: string | undefined;
  let isClosedWon = false;
  try {
    const dealRes = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/deals/${dealId}?properties=${HUBSPOT_IMMAT_PROPERTY},dealname,hs_is_closed_won`,
      { headers }
    );
    const deal = await dealRes.json().catch(() => null);
    dealName = deal?.properties?.dealname;
    isClosedWon = String(deal?.properties?.hs_is_closed_won) === "true";
    const raw = deal?.properties?.[HUBSPOT_IMMAT_PROPERTY];
    if (raw) {
      String(raw)
        .split(",")
        .forEach((s) => {
          const v = s.trim().toUpperCase();
          if (v) immats.add(v);
        });
    }
  } catch (e) {
    console.warn("⚠️ Lecture deal impossible:", e);
  }

  return { immats: [...immats], dealName, isClosedWon };
}

/**
 * Archive le produit HubSpot correspondant à une immat (SKU).
 */
async function archiverProduit(immatUpper: string, token: string) {
  try {
    const search = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/products/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: immatUpper }] }],
        properties: ["hs_sku"],
        limit: 1,
      }),
    });
    const sj = await search.json().catch(() => null);
    const pid = sj?.results?.[0]?.id;
    if (pid) {
      await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/products/${pid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(`🗄️ Produit HubSpot archivé (vendu) : ${immatUpper}`);
    }
  } catch (e) {
    console.warn("⚠️ Archive produit (webhook) impossible:", e);
  }
}

/**
 * Bascule une nacelle en "en_cours" (préparation) à partir de son immatriculation.
 * Écrit via le SDK Admin (droits serveur).
 */
async function basculerNacelleEnPreparation(immat: string, dealName: string) {
  const immatUpper = immat.trim().toUpperCase();
  if (!immatUpper || immatUpper.includes("/")) {
    return { found: false, immat: immatUpper, error: "immat_invalide" };
  }

  const db = getDb();
  const updates = {
    statut: "en_cours",
    type_sortie: "vente",
    acheteur: dealName || "Client HubSpot",
    date_mise_en_cours: new Date().toISOString(),
    hubspot_synced: true,
    updatedAt: new Date().toISOString(),
  };

  // L'ID du document machines_vo est l'immatriculation (MAJUSCULES)
  const ref = db.collection("machines_vo").doc(immatUpper);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update(updates);
    return { found: true, immat: immatUpper, method: "docId" };
  }

  // Secours : recherche par champ "immat"
  const q = await db
    .collection("machines_vo")
    .where("immat", "==", immatUpper)
    .limit(1)
    .get();
  if (q.empty) {
    return { found: false, immat: immatUpper };
  }
  await q.docs[0].ref.update(updates);
  return { found: true, immat: immatUpper, method: "query" };
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req: any, res: any) {
  // HubSpot envoie du POST. On accepte aussi GET pour un test simple.
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Webhook HubSpot Delta VO is live",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.HUBSPOT_TOKEN;
  if (!token) {
    console.error("❌ HUBSPOT_TOKEN manquant dans les variables d'environnement");
    return res.status(500).json({ error: "Server misconfigured: missing token" });
  }

  try {
    // HubSpot envoie soit un objet, soit un tableau d'événements
    const body = req.body;
    const events = Array.isArray(body) ? body : [body];

    console.log(`📨 Webhook reçu : ${events.length} événement(s)`);

    const results: any[] = [];

    for (const event of events) {
      const { objectId, propertyName } = event;

      // On ne réagit qu'aux changements de phase de la transaction
      if (propertyName !== "dealstage") {
        console.log(`⏭️ Ignoré : propertyName=${propertyName} (pas dealstage)`);
        continue;
      }

      // Option A : on récupère les immats depuis les lignes de produit (SKU),
      // avec la propriété immatriculation_nacelle en secours.
      // On lit aussi hs_is_closed_won pour savoir si le deal est "Gagné"
      // (robuste : marche pour TOUT pipeline/stage, sans id en dur).
      const { immats, dealName, isClosedWon } = await getDealImmats(String(objectId), token);

      if (!isClosedWon) {
        console.log(`⏭️ Deal ${objectId} : pas Gagné (hs_is_closed_won != true)`);
        continue;
      }

      console.log(`🎯 Deal ${objectId} GAGNÉ → traitement`);

      if (!immats.length) {
        console.warn(
          `⚠️ Deal ${objectId} : aucune immat trouvée (ni ligne de produit, ni ${HUBSPOT_IMMAT_PROPERTY})`
        );
        results.push({ dealId: objectId, error: "no_immat" });
        continue;
      }

      for (const immat of immats) {
        try {
          const result = await basculerNacelleEnPreparation(immat, dealName || "Client HubSpot");
          console.log(`✅ Résultat pour ${immat}:`, JSON.stringify(result));
          results.push({ dealId: objectId, ...result });

          // Machine vendue -> archiver le produit HubSpot correspondant
          await archiverProduit(immat, token);
        } catch (e: any) {
          console.error(`❌ Échec bascule ${immat}:`, e?.message || e);
          results.push({ dealId: objectId, immat, error: "bascule_failed", detail: String(e?.message || e) });
        }
      }
    }

    return res.status(200).json({ status: "ok", results });
  } catch (err: any) {
    console.error("❌ Erreur webhook:", err);
    // On renvoie 200 pour éviter que HubSpot ne renvoie en boucle,
    // mais on log l'erreur pour debug.
    return res.status(200).json({ status: "error", message: err.message });
  }
}
