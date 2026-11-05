// ============================================================
// 🔗 Nacelle Expert — écriture MERGE du dossier via l'API REST Firestore (côté serveur)
// Même logique que le connecteur (api/mcp/[cle].ts) et que le front
// (pushProchainDepartToNacelleExpert) : le bloc `info` et `info_prochain_depart`
// seulement, jamais les blocs d'expertise.
// ============================================================

const NE_FIRESTORE = "https://firestore.googleapis.com/v1/projects/nacelle-expert/databases/(default)/documents";
const nowIso = () => new Date().toISOString();

function versFirestore(v: any): any {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(versFirestore) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versFirestore(x)])) } };
}
function depuisFirestore(v: any): any {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(depuisFirestore);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, depuisFirestore(x)]));
  return v;
}
async function lireDossierNE(immat: string): Promise<Record<string, any> | null> {
  const r = await fetch(`${NE_FIRESTORE}/dossiers/${encodeURIComponent(immat)}`, { signal: AbortSignal.timeout(15_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Nacelle Expert : lecture impossible (${r.status})`);
  const j: any = await r.json();
  return depuisFirestore({ mapValue: { fields: j.fields || {} } });
}
async function fusionnerDossierNE(immat: string, champs: Record<string, any>): Promise<boolean> {
  const mask = Object.keys(champs).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const r = await fetch(`${NE_FIRESTORE}/dossiers/${encodeURIComponent(immat)}?${mask}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(champs).map(([k, v]) => [k, versFirestore(v)])) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) console.warn(`NE merge ${immat} : ${r.status} ${await r.text().catch(() => "")}`);
  return r.ok;
}
/** Prochain départ (location) pré-rempli dans Nacelle Expert ; le client de la restitution en cours reste intact */
export async function pousserProchainDepartNE(immat: string, d: Record<string, any>, client?: string, contrat?: string, email?: string): Promise<boolean> {
  const existant = await lireDossierNE(immat).catch(() => null);
  const prochain: Record<string, string> = {};
  if (client) prochain.client = client;
  if (contrat) prochain.contrat = contrat;
  if (email) prochain.email = email;
  const identite: Record<string, string> = { ...(existant?.info || {}), immat };
  if (d.modele) identite.modele = d.modele;
  if (d.type_nacelle) identite.type_nacelle = d.type_nacelle;
  if (d.annee_fab) identite.annee_fab = d.annee_fab;
  const champs: Record<string, any> = {
    immat, info: existant ? identite : { ...identite, ...prochain },
    info_prochain_depart: { ...prochain, updatedAt: nowIso(), source: "delta-vo" },
    infos_admin_source: "delta-vo", infos_admin_updatedAt: nowIso(),
  };
  if (!existant) champs.createdAt = nowIso();
  return fusionnerDossierNE(immat, champs);
}
