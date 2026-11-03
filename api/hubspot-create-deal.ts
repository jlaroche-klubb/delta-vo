// ============================================================
// 🏆 VENTE FACTURÉE → TRANSACTION GAGNÉE DANS HUBSPOT
// ============================================================
// Décision Jonathan (03/11/2026) : les devis se font dans Delta VO, HubSpot ne
// reçoit plus que les ventes FACTURÉES (ventes + locations financières, pas
// les LLD). L'ancien usage de ce point d'entrée (deal + devis brouillon à
// l'offre) est supprimé. Logique : api/_lib/hubspotVente.ts.
//
// POST { machine_id }  — appelé par l'appli juste après « Facturer », et par
// le bouton « Renvoyer vers HubSpot » des Clôturées. Idempotent.
// ============================================================

import admin from "firebase-admin";
import { cors, exigerUtilisateur } from "./_lib/auth.js";
import { envoyerVenteGagnee } from "./_lib/hubspotVente.js";

export const maxDuration = 30;

function appAdmin(): admin.app.App {
  const existante = admin.apps.find((a) => a?.name === "[DEFAULT]");
  if (existante) return existante;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: "delta-vo" });
}

export default async function handler(req: any, res: any) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await exigerUtilisateur(req, res, { roles: ["superadmin", "admin", "secretaire", "vendeur_fr", "chef"] });
  if (!user) return;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const machineId = String(body.machine_id || "").trim().slice(0, 40);
    if (!machineId) return res.status(400).json({ error: "machine_id requis" });
    const app = appAdmin();
    const profil = (await admin.firestore(app).collection("users").doc(user.uid).get()).data() || {};
    const par = `${profil.prenom || ""} ${profil.nom || ""}`.trim() || user.email;
    const r = await envoyerVenteGagnee(app, machineId, par);
    return res.status(r.ok ? 200 : 502).json(r);
  } catch (e: any) {
    console.error("❌ hubspot vente:", e);
    return res.status(500).json({ ok: false, detail: e?.message || "erreur" });
  }
}
