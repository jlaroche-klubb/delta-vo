// ============================================================
// WEBHOOK HUBSPOT → DELTA VO
// ============================================================
// Reçoit les notifications de HubSpot quand un Deal change de stage.
// Si le Deal passe en "Closed Won" (stage 4444367065), on récupère
// l'immatriculation de la nacelle (propriété du Deal) et on bascule
// la machine correspondante en "en_cours" (préparation) dans Firebase.
// ============================================================

import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

// ---- Config Firebase Delta VO (même que côté client) ----
const firebaseConfig = {
  apiKey: "AIzaSyD9BhTym5Rjm-UK2-F2ES4PV5NUjxJR8HY",
  authDomain: "delta-vo.firebaseapp.com",
  projectId: "delta-vo",
  storageBucket: "delta-vo.firebasestorage.app",
  messagingSenderId: "44936008146",
  appId: "1:44936008146:web:420cef581cae468764380b",
};

// Initialiser Firebase (réutilise l'app si déjà initialisée)
const app =
  getApps().find((a) => a.name === "webhook-app") ||
  initializeApp(firebaseConfig, "webhook-app");
const db = getFirestore(app);

// ---- Constantes HubSpot ----
const HUBSPOT_WON_STAGE = "1784881368"; // KLUBB Sales Pipeline - Order Won (Gagné)
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
async function getDealImmats(dealId: string, token: string): Promise<{ immats: string[]; dealName?: string }> {
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
        if (sku) immats.add(String(sku).trim().toUpperCase());
      }
    }
  } catch (e) {
    console.warn("⚠️ Lecture lignes de produit impossible:", e);
  }

  // 2) Secours : propriété immatriculation_nacelle (+ nom du deal)
  let dealName: string | undefined;
  try {
    const dealRes = await fetch(
      `${HUBSPOT_API_BASE}/crm/v3/objects/deals/${dealId}?properties=${HUBSPOT_IMMAT_PROPERTY},dealname`,
      { headers }
    );
    const deal = await dealRes.json().catch(() => null);
    dealName = deal?.properties?.dealname;
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

  return { immats: [...immats], dealName };
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
 * Bascule une nacelle en "en_cours" (préparation) à partir de son immatriculation
 */
async function basculerNacelleEnPreparation(immat: string, dealName: string) {
  // Chercher la machine par immatriculation (insensible à la casse)
  const immatUpper = immat.trim().toUpperCase();

  // L'ID du document machines_vo est l'immatriculation
  const machineRef = doc(db, "machines_vo", immatUpper);

  // On tente directement la mise à jour sur le doc (id = immat)
  try {
    await updateDoc(machineRef, {
      statut: "en_cours",
      type_sortie: "vente",
      acheteur: dealName || "Client HubSpot",
      date_mise_en_cours: new Date().toISOString(),
      hubspot_synced: true,
      updatedAt: new Date().toISOString(),
    });
    return { found: true, immat: immatUpper, method: "docId" };
  } catch (errDoc) {
    // Si le doc n'existe pas avec cet id, on cherche par champ "immat"
    const q = query(
      collection(db, "machines_vo"),
      where("immat", "==", immatUpper)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      return { found: false, immat: immatUpper };
    }
    const machineDoc = snap.docs[0];
    await updateDoc(machineDoc.ref, {
      statut: "en_cours",
      type_sortie: "vente",
      acheteur: dealName || "Client HubSpot",
      date_mise_en_cours: new Date().toISOString(),
      hubspot_synced: true,
      updatedAt: new Date().toISOString(),
    });
    return { found: true, immat: immatUpper, method: "query" };
  }
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
      const { objectId, propertyName, propertyValue } = event;

      // On ne traite que les changements de stage vers "Won"
      if (propertyName !== "dealstage") {
        console.log(`⏭️ Ignoré : propertyName=${propertyName} (pas dealstage)`);
        continue;
      }

      if (String(propertyValue) !== HUBSPOT_WON_STAGE) {
        console.log(`⏭️ Ignoré : stage=${propertyValue} (pas Won)`);
        continue;
      }

      console.log(`🎯 Deal ${objectId} passé en WON → traitement`);

      // Option A : on récupère les immats depuis les lignes de produit (SKU),
      // avec la propriété immatriculation_nacelle en secours.
      const { immats, dealName } = await getDealImmats(String(objectId), token);

      if (!immats.length) {
        console.warn(
          `⚠️ Deal ${objectId} : aucune immat trouvée (ni ligne de produit, ni ${HUBSPOT_IMMAT_PROPERTY})`
        );
        results.push({ dealId: objectId, error: "no_immat" });
        continue;
      }

      for (const immat of immats) {
        const result = await basculerNacelleEnPreparation(immat, dealName || "Client HubSpot");
        console.log(`✅ Résultat pour ${immat}:`, result);
        results.push({ dealId: objectId, ...result });

        // Machine vendue -> archiver le produit HubSpot correspondant
        await archiverProduit(immat, token);
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
