// ============================================================
// 🔌 CONNECTEUR MCP — Delta VO pilotable depuis Claude (demande Jonathan, 05/10/2026)
// ============================================================
// Expose le stock Delta VO à Claude (claude.ai → Paramètres → Connecteurs →
// « Ajouter un connecteur personnalisé ») comme HubSpot ou Vercel : Claude peut
// consulter les machines, restitutions, devis… et exécuter les actions de
// l'application (site, points d'attention, prix, mise en préparation,
// facturation, devis…) À DISTANCE, à la demande de Jonathan.
//
// Sécurité
//  - URL secrète : /api/mcp/<MCP_SECRET>. La clé est une variable Vercel
//    (MCP_SECRET, 32+ caractères aléatoires). Sans variable → 503, mauvaise
//    clé → 404 (le connecteur n'existe pas pour un inconnu).
//  - Chaque écriture passe par la MÊME logique que l'appli (mêmes champs,
//    même historique, mêmes synchros HubSpot / Nacelle Expert) et est tracée
//    « Claude (connecteur) » dans l'historique de la machine ET dans la
//    collection `connecteur_journal` (qui / quoi / quand).
//  - Côté Claude, chaque action qui modifie quelque chose demande une
//    confirmation à l'utilisateur avant d'être exécutée.
//  - Pas d'action en masse ni de suppression définitive : une machine se
//    retire du stock par archivage (récupérable), jamais par suppression.
//
// Transport : MCP « Streamable HTTP » sans session (chaque requête est
// autonome → compatible fonctions Vercel). Réponses JSON (pas de flux SSE).
// ============================================================

import admin from "firebase-admin";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const maxDuration = 60;

// ─────────────────────────────────────────────────────────────
// Constantes partagées avec le front (copiées : pas d'import de src/ côté API)
// ─────────────────────────────────────────────────────────────
const PAR = "Claude (connecteur)";
const DELTA_VO_URL = "https://delta-vo.vercel.app";
const NACELLE_EXPERT_URL = "https://nacelle-expert2.vercel.app";
const NE_FIRESTORE = "https://firestore.googleapis.com/v1/projects/nacelle-expert/databases/(default)/documents";
const DELTA_VO_WEB_KEY = "AIzaSyD9BhTym5Rjm-UK2-F2ES4PV5NUjxJR8HY"; // clé web publique (même que le front)
const UID_CONNECTEUR = "connecteur-claude";

const LOCALITES = ["EGI", "Ferrières", "Croissy", "Avignon", "St Alban"] as const;
const CANON_LOCALITE: Record<string, string> = {
  egi: "EGI", egi08: "EGI", ferriere: "Ferrières", ferrieres: "Ferrières", croissy: "Croissy",
  avignon: "Avignon", stalban: "St Alban", saintalban: "St Alban", stalbanleysse: "St Alban",
};
const STATUTS = ["restitution", "disponible", "en_cours", "cloturee", "louee_lld"] as const;
const LIBELLE_STATUT: Record<string, string> = {
  restitution: "en restitution (retour de location, frais NE à facturer)",
  disponible: "disponible à la vente",
  en_cours: "en préparation (vendue ou louée, pas encore livrée)",
  cloturee: "clôturée (vente facturée)",
  louee_lld: "louée (mise à disposition LLD)",
};
const MOTIFS_ATTENTION = [
  "moteur_hs", "boite_hs", "nacelle_hs", "hydraulique", "electrique", "carrosserie",
  "pneus", "ct", "vgp", "en_l_etat", "ne_roule_pas", "pieces_manquantes",
] as const;
const ETAPES_PREPA_NORMALE = [
  { label: "Lavage / nettoyage", has_na: false }, { label: "Contrôle technique", has_na: true },
  { label: "VGP", has_na: true }, { label: "Remise en état carrosserie", has_na: true },
  { label: "Révision mécanique", has_na: true }, { label: "Photos commerciales", has_na: false },
];
const ETAPES_PREPA_EN_ETAT = [
  { label: "Lavage / nettoyage", has_na: false }, { label: "Photos commerciales", has_na: false },
];

// ─────────────────────────────────────────────────────────────
// Firebase Admin (projet delta-vo) — même compte de service que les autres fonctions
// ─────────────────────────────────────────────────────────────
function app(): admin.app.App {
  const existante = admin.apps.find((a) => a?.name === "[DEFAULT]");
  if (existante) return existante;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT manquant dans Vercel");
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)), projectId: "delta-vo" });
}
const db = () => admin.firestore(app());
const machinesCol = () => db().collection("machines_vo");
const FieldValue = admin.firestore.FieldValue;

// ─────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────
const nowIso = () => new Date().toISOString();
const today = () => nowIso().slice(0, 10);

function normalizeImmat(raw: string): string {
  const s = (raw || "").toUpperCase();
  const compact = s.replace(/[\s.\-_]/g, "");
  if (/^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(compact)) return `${compact.slice(0, 2)}-${compact.slice(2, 5)}-${compact.slice(5)}`;
  return s.trim();
}
function normalizeLocalite(raw?: string | null): string {
  if (!raw) return "";
  const key = raw.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.\-_']/g, "");
  return CANON_LOCALITE[key] || raw.trim();
}
function creerEtapesPrepa(type: "normale" | "en_etat") {
  return (type === "normale" ? ETAPES_PREPA_NORMALE : ETAPES_PREPA_EN_ETAT).map((e, idx) => ({
    id: `etape-${idx + 1}`, label: e.label, done: false, non_necessaire: false, has_na: e.has_na,
  }));
}
/** Ligne d'historique identique à src/utils/historique.ts (traceStatut) */
function trace(de: string | undefined, vers: string, source: string, note?: string) {
  return FieldValue.arrayUnion({ date: nowIso(), de: de || "—", vers, source, par: PAR, ...(note ? { note } : {}) });
}
function toDateStr(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v?.toDate === "function") return v.toDate().toISOString().slice(0, 10);
  return undefined;
}
function ageJours(d?: string): number | undefined {
  if (!d) return undefined;
  const t = Date.parse(d);
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 86_400_000)) : undefined;
}

class ErreurOutil extends Error {}

async function chargerMachine(immatBrute: string): Promise<{ id: string; d: Record<string, any> }> {
  const id = normalizeImmat(immatBrute);
  if (!/^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(id)) throw new ErreurOutil(`Immatriculation illisible : « ${immatBrute} » (attendu AB-123-CD)`);
  const snap = await machinesCol().doc(id).get();
  if (!snap.exists) throw new ErreurOutil(`Aucune machine ${id} dans Delta VO`);
  return { id, d: snap.data() || {} };
}

/** Résumé lisible d'une fiche (ce que la carte affiche) */
function resume(id: string, d: Record<string, any>, complet = false) {
  const ne = d.dossier_nacelle_expert || {};
  const rapport = d.rapport_expertise || ne.rapport_expertise || null;
  const base: Record<string, any> = {
    immat: id,
    statut: d.statut || "restitution",
    statut_libelle: LIBELLE_STATUT[d.statut || "restitution"],
    archivee: d.archived === true ? `oui (${d.archived_by || "?"}, ${toDateStr(d.archived_at) || "?"})` : "non",
    type_nacelle: d.type_nacelle || "",
    modele_porteur: d.modele || "",
    annee: d.annee_fab || "",
    site: d.localite || "",
    numero_dossier: d.numero_dossier || "",
    km_porteur: d.km_porteur ?? null,
    heures_nacelle: d.heures ?? null,
    prix_fr: d.prix_fr ?? null,
    prix_dealer: d.prix_dealer ?? null,
    date_mise_stock: toDateStr(d.date_mise_stock),
    age_stock_jours: ageJours(toDateStr(d.date_mise_stock)),
    hors_vente: d.disponibilite_vog && !/^ok$/i.test(String(d.disponibilite_vog)) ? `mention VOG « ${d.disponibilite_vog} »` : d.hors_vente_manuel ? "retrait manuel" : "non",
    points_attention: d.points_attention?.motifs?.length || d.points_attention?.texte
      ? { motifs: d.points_attention.motifs || [], texte: d.points_attention.texte || "", par: d.points_attention.par, date: d.points_attention.date }
      : null,
    alerte_saisie: d.alerte_saisie || undefined,
  };
  const restitution = {
    client_precedent: d.client_precedent || ne.client || "",
    contrat: d.contrat || ne.contrat || "",
    email_client: d.email_client || ne.email || "",
    date_retour: toDateStr(ne.date_retour || d.date_retour),
    etapes: {
      recuperation: d.recuperation_ok ?? true,
      expertise: d.expertise_ok ?? true,
      facture: d.facture_ok ?? false,
      facture_reglee: d.facture_reglee_ok ?? false,
    },
    expertise_recue: d.expertise_recue ?? true,
    montant_expertise_ht: rapport?.total_retenue_ht ?? d.montant_expertise_vog ?? null,
    facture_restitution: d.facture_resti_numero ? { numero: d.facture_resti_numero, date: d.facture_resti_date, par: d.facture_resti_par } : null,
  };
  const devis = (d.devis_complet === false || d.devis_a_verifier || d.devis_pdf || d.devis_annule)
    ? {
        en_attente_du_fournisseur: d.devis_complet === false && !d.devis_a_verifier,
        postes_en_attente: d.devis_pending_labels || [],
        a_verifier_par_secretaire: d.devis_a_verifier === true,
        pdf: d.devis_pdf ? { url: d.devis_pdf.url, montant_lu: d.devis_pdf.montant_lu, fournisseur: d.devis_pdf.fournisseur, confiance: d.devis_pdf.confiance } : null,
        valide: d.devis_valide || null,
        annule: d.devis_annule || null,
        relances: (d.devis_relances || []).length,
      }
    : null;
  const sortie = d.statut === "en_cours" || d.statut === "cloturee" || d.statut === "louee_lld"
    ? {
        type: d.type_sortie === "lld" ? "location" : "vente",
        client: d.acheteur || d.client_lld || "",
        commercial: d.commercial_vendeur || "",
        type_prepa: d.type_prepa || "non configurée",
        date_vente: d.date_vente, date_livraison_prevue: d.date_livraison_prevue,
        contrat_sortie: d.contrat_sortie, email_sortie: d.email_sortie,
        etapes_prepa: Array.isArray(d.etapes_prepa) ? d.etapes_prepa.map((e: any) => `${e.done ? "✓" : e.non_necessaire ? "n/a" : "☐"} ${e.label}`) : [],
        facture_vente: d.numero_facture ? { numero: d.numero_facture, date: d.date_facturation, reglement: d.date_reglement || null } : null,
      }
    : null;
  const r: Record<string, any> = { ...base, restitution, devis, sortie };
  if (complet) {
    r.photos = {
      commerciales: Object.keys(ne.photos_commerciales || {}).length,
      supplementaires: (d.photos_supplementaires || []).length,
      internes: (d.photos_internes || []).length,
    };
    r.expertise = rapport ? { date: rapport.date_expertise, agent: rapport.agent, degats: (rapport.degats || []).length, total_retenue_ht: rapport.total_retenue_ht, rapport_url: rapport.rapport_url } : null;
    r.offre = d.offre_en_cours ? { client: d.client_offre, montant: d.montant_offre, date: d.date_offre } : null;
    r.fiche_commerciale = d.fiche_commerciale || null;
    r.derniere_modification = toDateStr(d.updatedAt) || toDateStr(d.date_modification);
    r.historique = Array.isArray(d.historique) ? d.historique.slice(-15) : [];
  }
  return r;
}

async function toutesLesMachines(): Promise<{ id: string; d: Record<string, any> }[]> {
  const snap = await machinesCol().get();
  return snap.docs.map((x) => ({ id: x.id, d: x.data() }));
}

/** Journal des actions du connecteur (collection connecteur_journal) */
async function journal(outil: string, immat: string | null, args: any, resultat: string) {
  try {
    await db().collection("connecteur_journal").add({ date: nowIso(), par: PAR, outil, immat, args, resultat });
  } catch (e) {
    console.warn("journal connecteur :", e);
  }
}

// ─────────────────────────────────────────────────────────────
// Jeton Delta VO « connecteur » (pour appeler nos propres fonctions protégées
// et /api/valider-devis de Nacelle Expert exactement comme le fait l'appli)
// ─────────────────────────────────────────────────────────────
let jetonCache = { token: "", expire: 0 };
async function jetonConnecteur(): Promise<string> {
  if (jetonCache.token && Date.now() < jetonCache.expire) return jetonCache.token;
  // Profil Delta VO du connecteur : rôle admin (les actions devis exigent secrétaire/admin)
  const uref = db().collection("users").doc(UID_CONNECTEUR);
  const u = await uref.get();
  if (!u.exists) {
    await uref.set({ role: "admin", prenom: "Claude", nom: "(connecteur)", email: "connecteur@delta-vo.local", service: true, createdAt: nowIso() });
  }
  const custom = await admin.auth(app()).createCustomToken(UID_CONNECTEUR, { service: "connecteur-mcp" });
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${DELTA_VO_WEB_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.idToken) throw new ErreurOutil(`jeton connecteur indisponible (${r.status})`);
  jetonCache = { token: j.idToken, expire: Date.now() + 50 * 60 * 1000 };
  return j.idToken;
}

/** Synchro produit HubSpot — même fonction serveur que l'appli (best-effort) */
async function hubspot(action: "upsert" | "archive", immat: string, modele?: string, prix?: number | null): Promise<string> {
  try {
    const r = await fetch(`${DELTA_VO_URL}/api/hubspot-sync-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await jetonConnecteur()}` },
      body: JSON.stringify({ action, immat, modele, prix }),
      signal: AbortSignal.timeout(25_000),
    });
    const j: any = await r.json().catch(() => ({}));
    return `HubSpot ${action} : ${j.status || r.status}${j.warning ? ` (${j.warning})` : ""}`;
  } catch (e: any) {
    return `HubSpot ${action} : non synchronisé (${e?.message || e})`;
  }
}

/** Libellé « type + porteur » pour le nom du produit HubSpot (comme modeleLabel du front) */
const modeleLabel = (d: Record<string, any>) => [d.type_nacelle, d.modele].filter(Boolean).join(" ").trim() || undefined;

// ─────────────────────────────────────────────────────────────
// Nacelle Expert : lecture / écriture MERGE du dossier via l'API REST Firestore
// (mêmes règles que le front Delta VO, qui écrit sans authentification NE)
// ─────────────────────────────────────────────────────────────
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
  if (!r.ok) throw new ErreurOutil(`Nacelle Expert : lecture impossible (${r.status})`);
  const j: any = await r.json();
  return depuisFirestore({ mapValue: { fields: j.fields || {} } });
}
/** Fusion (merge) de champs de premier niveau dans dossiers/{immat} — jamais les blocs d'expertise */
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
/** = pushInfosAdminToNacelleExpert du front : bloc `info` fusionné, jamais l'expertise */
async function pousserInfosAdminNE(immat: string, infos: { client?: string; contrat?: string; email?: string; modele?: string; type_nacelle?: string; annee_fab?: string }) {
  const existant = await lireDossierNE(immat).catch(() => null);
  const info: Record<string, string> = { ...(existant?.info || {}), immat };
  for (const [k, v] of Object.entries(infos)) if (v) info[k] = v;
  const champs: Record<string, any> = { immat, info, infos_admin_source: "delta-vo", infos_admin_updatedAt: nowIso() };
  if (!existant) champs.createdAt = nowIso();
  return fusionnerDossierNE(immat, champs);
}
/** = pushProchainDepartToNacelleExpert : le client de la restitution en cours reste intact */
async function pousserProchainDepartNE(immat: string, d: Record<string, any>, client?: string, contrat?: string, email?: string) {
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

// ─────────────────────────────────────────────────────────────
// Serveur MCP : outils
// ─────────────────────────────────────────────────────────────
const texte = (v: any) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const erreur = (msg: string) => ({ content: [{ type: "text" as const, text: `❌ ${msg}` }], isError: true });
const immatSchema = z.string().describe("Immatriculation (AB-123-CD ; espaces/points tolérés)");

function construireServeur(): McpServer {
  const server = new McpServer({ name: "delta-vo", version: "1.0.0" }, {
    instructions:
      "Connecteur Delta VO (stock de nacelles d'occasion Klubb / Delta Services). Les immatriculations sont la clé " +
      "de toutes les fiches. Statuts : restitution (retour de location, frais Nacelle Expert à facturer), disponible " +
      "(en vente), en_cours (vendue/louée en préparation), cloturee (vente facturée), louee_lld (en location). " +
      "Règles métier : une machine n'est vendable qu'après réception de l'expertise Nacelle Expert ; une machine en " +
      "restitution avec frais impayés reste visible en Restitutions même si elle est disponible ; un départ Nacelle " +
      "Expert est toujours une location. Avant toute action qui modifie une fiche, relire la machine (fiche_machine) " +
      "et faire confirmer par l'utilisateur. Les outils d'écriture sont unitaires (une machine à la fois).",
  });

  const lecture = (nom: string, titre: string, description: string, schema: z.ZodRawShape, fn: (a: any) => Promise<any>) =>
    server.registerTool(nom, { title: titre, description, inputSchema: schema, annotations: { readOnlyHint: true, openWorldHint: false } }, async (a: any) => {
      try { return texte(await fn(a)); } catch (e: any) { return erreur(e?.message || String(e)); }
    });
  const action = (nom: string, titre: string, description: string, schema: z.ZodRawShape, fn: (a: any) => Promise<{ immat: string | null; resultat: any }>, destructif = false) =>
    server.registerTool(nom, { title: titre, description, inputSchema: schema, annotations: { readOnlyHint: false, destructiveHint: destructif, idempotentHint: false, openWorldHint: false } }, async (a: any) => {
      try {
        const r = await fn(a);
        await journal(nom, r.immat, a, typeof r.resultat === "string" ? r.resultat : JSON.stringify(r.resultat));
        return texte(r.resultat);
      } catch (e: any) {
        await journal(nom, a?.immat ? normalizeImmat(a.immat) : null, a, `ERREUR ${e?.message || e}`);
        return erreur(e?.message || String(e));
      }
    });

  // ───────────── LECTURE ─────────────
  lecture("rechercher_machines", "Rechercher des machines",
    "Recherche dans tout le stock Delta VO (immat, type de nacelle, modèle porteur, client, D0, acheteur). Filtres optionnels par statut, site, archivées. Renvoie des résumés courts.",
    {
      texte: z.string().optional().describe("Texte libre : immat partielle, modèle, client…"),
      statut: z.enum(STATUTS).optional(),
      site: z.string().optional().describe("EGI, Ferrières, Croissy, Avignon, St Alban"),
      archivees: z.enum(["exclure", "inclure", "seulement"]).default("exclure"),
      limite: z.number().int().min(1).max(200).default(50),
    },
    async (a) => {
      const q = (a.texte || "").toLowerCase().trim();
      const qImmat = normalizeImmat(a.texte || "").replace(/-/g, "");
      const site = normalizeLocalite(a.site);
      const res = (await toutesLesMachines()).filter(({ id, d }) => {
        const arch = d.archived === true;
        if (a.archivees === "exclure" && arch) return false;
        if (a.archivees === "seulement" && !arch) return false;
        if (a.statut && (d.statut || "restitution") !== a.statut) return false;
        if (site && normalizeLocalite(d.localite) !== site) return false;
        if (!q) return true;
        const champs = [id.replace(/-/g, ""), d.type_nacelle, d.modele, d.client_precedent, d.dossier_nacelle_expert?.client, d.acheteur, d.client_lld, d.numero_dossier, d.commercial_vendeur]
          .map((x) => String(x || "").toLowerCase());
        return champs.some((c) => c.includes(q)) || (qImmat.length >= 3 && champs[0].includes(qImmat.toLowerCase()));
      });
      const lignes = res.slice(0, a.limite).map(({ id, d }) => ({
        immat: id, statut: d.statut || "restitution", archivee: d.archived === true || undefined,
        type: d.type_nacelle || "", porteur: d.modele || "", annee: d.annee_fab || "", site: d.localite || "",
        prix_fr: d.prix_fr ?? null, client: d.client_precedent || d.dossier_nacelle_expert?.client || d.acheteur || d.client_lld || "",
        points_attention: d.points_attention?.motifs?.length ? d.points_attention.motifs : undefined,
      }));
      return { total: res.length, affichees: lignes.length, machines: lignes };
    });

  lecture("fiche_machine", "Fiche complète d'une machine",
    "Tout ce que Delta VO sait d'une machine : identité, statut, site, prix, restitution (étapes, client, frais), devis, sortie (vente/location), photos, expertise, 15 dernières lignes d'historique.",
    { immat: immatSchema },
    async (a) => { const { id, d } = await chargerMachine(a.immat); return resume(id, d, true); });

  lecture("stock_en_vente", "Stock disponible à la vente",
    "Machines visibles dans l'onglet Disponibles (statut disponible, non archivées, pas de mention VOG bloquante), groupées par site, avec prix et âge de stock. Option : inclure les restitutions dont l'expertise est reçue (vendables).",
    { site: z.string().optional(), inclure_restitutions_vendables: z.boolean().default(false) },
    async (a) => {
      const site = normalizeLocalite(a.site);
      const horsVente = (d: any) => (d.disponibilite_vog && !/^ok$/i.test(String(d.disponibilite_vog))) || d.hors_vente_manuel === true;
      const toutes = (await toutesLesMachines()).filter(({ d }) => {
        if (d.archived === true || horsVente(d)) return false;
        if (site && normalizeLocalite(d.localite) !== site) return false;
        const st = d.statut || "restitution";
        return st === "disponible" || (a.inclure_restitutions_vendables && st === "restitution" && (d.expertise_recue ?? true));
      });
      const parSite: Record<string, any[]> = {};
      for (const { id, d } of toutes) {
        const s = normalizeLocalite(d.localite) || "— site non renseigné";
        (parSite[s] ||= []).push({
          immat: id, statut: d.statut, type: d.type_nacelle || "", porteur: d.modele || "", annee: d.annee_fab || "",
          km: d.km_porteur ?? null, heures: d.heures ?? null, prix_fr: d.prix_fr ?? null, prix_dealer: d.prix_dealer ?? null,
          stock_depuis: toDateStr(d.date_mise_stock), age_jours: ageJours(toDateStr(d.date_mise_stock)),
          points_attention: d.points_attention?.motifs?.length ? d.points_attention.motifs : undefined,
          sans_prix: !(d.prix_fr > 0) || undefined,
        });
      }
      return { total: toutes.length, par_site: Object.fromEntries(Object.entries(parSite).map(([s, l]) => [s, { nombre: l.length, machines: l }])) };
    });

  lecture("restitutions", "Restitutions en cours",
    "Machines dans l'onglet Restitutions : statut restitution, ou en préparation / clôturée / louée avec frais Nacelle Expert non réglés. Pour chaque : client, étapes (récupération, expertise, facture, règlement), montant d'expertise, état du devis.",
    { seulement_devis_en_attente: z.boolean().default(false), seulement_a_facturer: z.boolean().default(false) },
    async (a) => {
      const liste = (await toutesLesMachines()).filter(({ d }) => {
        if (d.archived === true) return false;
        // Même filtre que la page Restitutions de l'appli
        const st = d.statut || "restitution";
        const regle = d.facture_reglee_ok ?? false;
        const visible = st === "restitution" || (st === "en_cours" && !regle) || (st !== "disponible" && (d.expertise_recue ?? true) && !regle);
        if (!visible) return false;
        if (a.seulement_devis_en_attente && !(d.devis_complet === false || d.devis_a_verifier)) return false;
        if (a.seulement_a_facturer && !((d.expertise_ok ?? true) && !(d.facture_ok ?? false) && d.devis_complet !== false && !d.devis_a_verifier)) return false;
        return true;
      });
      return {
        total: liste.length,
        machines: liste.map(({ id, d }) => { const r = resume(id, d); return { immat: id, statut: r.statut, type: r.type_nacelle, porteur: r.modele_porteur, site: r.site, ...r.restitution, devis: r.devis }; }),
      };
    });

  lecture("devis_en_attente", "Devis Nacelle Assistance",
    "Machines dont l'expertise attend un devis fournisseur (Nacelle Assistance), ou dont le devis PDF déposé doit être vérifié et validé par une secrétaire dans Delta VO.",
    {},
    async () => {
      const liste = (await toutesLesMachines()).filter(({ d }) => d.archived !== true && (d.devis_complet === false || d.devis_a_verifier === true));
      return {
        total: liste.length,
        a_verifier_par_secretaire: liste.filter(({ d }) => d.devis_a_verifier).map(({ id, d }) => ({ immat: id, client: d.client_precedent || d.dossier_nacelle_expert?.client, pdf: d.devis_pdf?.url, montant_lu_ht: d.devis_pdf?.montant_lu, fournisseur: d.devis_pdf?.fournisseur, confiance_ia: d.devis_pdf?.confiance, depose_le: toDateStr(d.devis_pdf?.date) })),
        attendus_du_fournisseur: liste.filter(({ d }) => !d.devis_a_verifier).map(({ id, d }) => ({ immat: id, client: d.client_precedent || d.dossier_nacelle_expert?.client, postes: d.devis_pending_labels || [], relances: (d.devis_relances || []).length, derniere_relance: toDateStr((d.devis_relances || []).slice(-1)[0]?.date), demande_le: toDateStr(d.devis_demande_le) })),
      };
    });

  lecture("historique_machine", "Historique des changements",
    "Toutes les lignes d'historique d'une machine (date, ancien → nouveau statut, origine, utilisateur, note). Sert au diagnostic : qui a fait quoi, quand.",
    { immat: immatSchema },
    async (a) => { const { id, d } = await chargerMachine(a.immat); return { immat: id, lignes: Array.isArray(d.historique) ? d.historique : [] }; });

  lecture("statistiques_parc", "Statistiques du parc",
    "Compteurs : machines par statut, par site, en vente avec/sans prix, archivées, devis en attente, restitutions à facturer.",
    {},
    async () => {
      const toutes = await toutesLesMachines();
      const actives = toutes.filter(({ d }) => d.archived !== true);
      const compte = (f: (d: any) => string | undefined) => { const c: Record<string, number> = {}; for (const { d } of actives) { const k = f(d); if (k) c[k] = (c[k] || 0) + 1; } return c; };
      const dispo = actives.filter(({ d }) => d.statut === "disponible" && !(d.disponibilite_vog && !/^ok$/i.test(String(d.disponibilite_vog))) && !d.hors_vente_manuel);
      return {
        total_fiches: toutes.length, actives: actives.length, archivees: toutes.length - actives.length,
        par_statut: compte((d) => d.statut || "restitution"),
        par_site_actives: compte((d) => normalizeLocalite(d.localite) || "— sans site"),
        en_vente: { total: dispo.length, avec_prix: dispo.filter(({ d }) => d.prix_fr > 0).length, sans_prix: dispo.filter(({ d }) => !(d.prix_fr > 0)).length, par_site: Object.fromEntries(Object.entries(dispo.reduce((acc: Record<string, number>, { d }) => { const s = normalizeLocalite(d.localite) || "—"; acc[s] = (acc[s] || 0) + 1; return acc; }, {}))) },
        devis_en_attente: actives.filter(({ d }) => d.devis_complet === false || d.devis_a_verifier).length,
        restitutions_a_facturer: actives.filter(({ d }) => (d.statut || "restitution") === "restitution" && (d.expertise_ok ?? true) && !(d.facture_ok ?? false) && d.devis_complet !== false && !d.devis_a_verifier).length,
        avec_points_attention: actives.filter(({ d }) => d.points_attention?.motifs?.length).length,
      };
    });

  lecture("dossier_nacelle_expert", "Dossier Nacelle Expert",
    "Lit le dossier d'expertise Nacelle Expert d'une immatriculation : infos client, départ/retour (dates, agent), synchro vers Delta VO, devis, prochain départ pré-rempli.",
    { immat: immatSchema },
    async (a) => {
      const immat = normalizeImmat(a.immat);
      const dos = await lireDossierNE(immat);
      if (!dos) return { immat, dossier: null, note: "Aucun dossier Nacelle Expert pour cette immatriculation" };
      const cycle = (c: any) => c ? { date: c.date, agent: c.agent || c.agent_nom, client: c.client, lieu: c.lieu, km: c.km, heures: c.heures, signe: !!c.signature || !!c.signature_client, nb_photos: Array.isArray(c.photos) ? c.photos.length : Object.keys(c.photos || {}).length } : null;
      return {
        immat, info: dos.info || null, info_prochain_depart: dos.info_prochain_depart || null,
        depart: cycle(dos.depart), retour: cycle(dos.retour),
        synced_to_delta_vo: dos.synced_to_delta_vo ?? null, archived: dos.archived ?? false, renamed_to: dos.renamed_to || undefined,
        devis: { complet: dos.devis_complet ?? null, a_verifier: dos.devis_a_verifier ?? false, pending: dos.devis_pending || [], valide: dos.devis_valide || null, annule: dos.devis_annule || null, pdf: dos.devis_pdf ? { url: dos.devis_pdf.url, montant_lu: dos.devis_pdf.montant_lu } : null },
        expertise_resume: dos.expertise_resume || null, montants_devis: dos.montants_devis || null,
        createdAt: dos.createdAt, updatedAt: dos.updatedAt,
      };
    });

  // ───────────── ACTIONS ─────────────
  action("modifier_site", "Changer le site d'une machine",
    "Déplace une machine vers un autre site (EGI, Ferrières, Croissy, Avignon, St Alban). Équivalent du sélecteur de site sur la carte.",
    { immat: immatSchema, site: z.enum(LOCALITES) },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      await machinesCol().doc(id).update({ localite: a.site, updatedAt: nowIso() });
      return { immat: id, resultat: `✅ ${id} : site « ${d.localite || "—"} » → « ${a.site} »` };
    });

  action("modifier_points_attention", "Points d'attention vendeurs",
    "Pose, remplace ou efface les points d'attention affichés aux commerciaux (bandeau rouge/orange sur la carte, export liste de prix, pricing PDG). Motifs : " + MOTIFS_ATTENTION.join(", ") + ". `effacer: true` retire tout.",
    { immat: immatSchema, motifs: z.array(z.enum(MOTIFS_ATTENTION)).default([]), texte: z.string().max(500).optional().describe("Précision libre"), effacer: z.boolean().default(false) },
    async (a) => {
      const { id } = await chargerMachine(a.immat);
      if (a.effacer) {
        await machinesCol().doc(id).update({ points_attention: FieldValue.delete(), updatedAt: nowIso() });
        return { immat: id, resultat: `✅ ${id} : points d'attention effacés` };
      }
      if (!a.motifs.length && !a.texte?.trim()) throw new ErreurOutil("Indiquer au moins un motif ou un texte (ou effacer: true)");
      await machinesCol().doc(id).update({ points_attention: { motifs: a.motifs, texte: a.texte?.trim() || "", date: nowIso(), par: PAR }, updatedAt: nowIso() });
      return { immat: id, resultat: `✅ ${id} : points d'attention → ${[...a.motifs, a.texte?.trim()].filter(Boolean).join(", ")}` };
    });

  action("modifier_infos_machine", "Corriger les informations d'une fiche",
    "Corrige l'identité et les infos administratives : type de nacelle, modèle porteur, année, n° de dossier D0, km, heures, client précédent, n° de contrat, email client. Seuls les champs fournis sont modifiés. Client/contrat/email/identité sont répercutés dans le dossier Nacelle Expert (comme le crayon ✏️ de l'appli). Ne change ni statut ni prix.",
    {
      immat: immatSchema,
      type_nacelle: z.string().optional(), modele_porteur: z.string().optional(), annee: z.string().optional().describe("Année de 1re mise en circulation"),
      numero_dossier: z.string().optional().describe("D0xxxxx"), km: z.number().int().nonnegative().optional(), heures: z.number().nonnegative().optional(),
      client_precedent: z.string().optional(), contrat: z.string().optional(), email_client: z.string().optional(),
    },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      const u: Record<string, any> = { updatedAt: nowIso(), date_modification: new Date() };
      const chg: string[] = [];
      const set = (champ: string, val: any, libelle: string, ancien: any) => { if (val !== undefined) { u[champ] = val; chg.push(`${libelle} « ${ancien ?? "—"} » → « ${val} »`); } };
      set("type_nacelle", a.type_nacelle, "type", d.type_nacelle);
      set("modele", a.modele_porteur, "porteur", d.modele);
      set("annee_fab", a.annee, "année", d.annee_fab);
      set("numero_dossier", a.numero_dossier?.trim().toUpperCase(), "D0", d.numero_dossier);
      set("km_porteur", a.km, "km", d.km_porteur);
      set("heures", a.heures, "heures", d.heures);
      set("client_precedent", a.client_precedent, "client", d.client_precedent);
      set("contrat", a.contrat, "contrat", d.contrat);
      set("email_client", a.email_client, "email", d.email_client);
      if (!chg.length) throw new ErreurOutil("Aucun champ à modifier");
      if (d.dossier_nacelle_expert) {
        if (a.client_precedent !== undefined) u["dossier_nacelle_expert.client"] = a.client_precedent;
        if (a.contrat !== undefined) u["dossier_nacelle_expert.contrat"] = a.contrat;
        if (a.email_client !== undefined) u["dossier_nacelle_expert.email"] = a.email_client;
      }
      if (d.alerte_saisie && (a.type_nacelle || a.modele_porteur || a.annee) && [a.type_nacelle ?? d.type_nacelle, a.modele_porteur ?? d.modele, a.annee ?? d.annee_fab].every(Boolean)) u.alerte_saisie = FieldValue.delete();
      await machinesCol().doc(id).update(u);
      const ne = await pousserInfosAdminNE(id, { client: a.client_precedent, contrat: a.contrat, email: a.email_client, modele: a.modele_porteur, type_nacelle: a.type_nacelle, annee_fab: a.annee });
      return { immat: id, resultat: `✅ ${id} : ${chg.join(" ; ")}${ne ? " — dossier Nacelle Expert mis à jour" : " — ⚠ dossier Nacelle Expert non mis à jour"}` };
    });

  action("modifier_prix", "Fixer ou retirer le prix",
    "Fixe le prix France et/ou dealer (HT) d'une machine, ou le retire (null). Comme dans l'appli : un prix France > 0 publie/actualise le produit dans le catalogue HubSpot, un prix retiré l'archive.",
    { immat: immatSchema, prix_fr: z.number().nonnegative().nullable().optional().describe("Prix France HT ; null = retirer"), prix_dealer: z.number().nonnegative().nullable().optional(), numero_dossier: z.string().optional() },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if (a.prix_fr === undefined && a.prix_dealer === undefined) throw new ErreurOutil("Indiquer prix_fr et/ou prix_dealer");
      const prixFr = a.prix_fr === undefined ? (d.prix_fr ?? null) : a.prix_fr;
      const prixDealer = a.prix_dealer === undefined ? (d.prix_dealer ?? null) : a.prix_dealer;
      const u: Record<string, any> = { prix_fr: prixFr || null, prix_dealer: prixDealer || null, prix_modifie_le: today(), prix_modifie_par: PAR, prix_modifie_manuellement: true, updatedAt: nowIso() };
      if (a.numero_dossier !== undefined) u.numero_dossier = a.numero_dossier.trim() || null;
      await machinesCol().doc(id).update(u);
      const hs = d.archived || (d.statut || "restitution") !== "disponible" ? "HubSpot : non publié (machine hors Disponibles)" : prixFr && prixFr > 0 ? await hubspot("upsert", id, modeleLabel(d), prixFr) : await hubspot("archive", id);
      return { immat: id, resultat: `✅ ${id} : prix FR ${d.prix_fr ?? "—"} → ${prixFr ?? "—"} € ; dealer ${d.prix_dealer ?? "—"} → ${prixDealer ?? "—"} € — ${hs}` };
    });

  action("creer_fiche", "Créer une fiche machine",
    "Crée une machine absente de Delta VO. `statut` disponible = directement en vente (comme un import état de parc : étapes restitution considérées faites) ; restitution = retour de location à traiter (étapes à cocher, expertise Nacelle Expert attendue, dossier NE pré-rempli avec le client).",
    {
      immat: immatSchema, statut: z.enum(["disponible", "restitution"]), site: z.enum(LOCALITES).optional(),
      type_nacelle: z.string().optional(), modele_porteur: z.string().optional(), annee: z.string().optional(), numero_dossier: z.string().optional(),
      km: z.number().int().nonnegative().optional(), heures: z.number().nonnegative().optional(),
      client_precedent: z.string().optional(), contrat: z.string().optional(), email_client: z.string().optional(), date_retour: z.string().optional().describe("AAAA-MM-JJ"),
      note: z.string().optional().describe("Motif / origine (pour l'historique)"),
    },
    async (a) => {
      const id = normalizeImmat(a.immat);
      if (!/^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(id)) throw new ErreurOutil(`Immatriculation illisible : « ${a.immat} »`);
      const ref = machinesCol().doc(id);
      if ((await ref.get()).exists) throw new ErreurOutil(`${id} existe déjà — utiliser fiche_machine / desarchiver_machine`);
      const identiteIncomplete = !(a.type_nacelle && a.modele_porteur && a.annee);
      const commun = {
        immat: id, numero_dossier: a.numero_dossier?.trim().toUpperCase() || "", localite: a.site || "",
        type_nacelle: a.type_nacelle || "", modele: a.modele_porteur || "", annee_fab: a.annee || "",
        ...(a.km != null ? { km_porteur: a.km } : {}), ...(a.heures != null ? { heures: a.heures } : {}),
        client_precedent: a.client_precedent || "", contrat: a.contrat || "", email_client: a.email_client || "",
        ...(identiteIncomplete ? { alerte_saisie: `Fiche créée par le connecteur Claude le ${today().split("-").reverse().join("/")} — type de nacelle, modèle porteur et année à compléter` } : {}),
        date_ajout: new Date(), date_modification: new Date(), createdAt: nowIso(), updatedAt: nowIso(),
      };
      if (a.statut === "disponible") {
        await ref.set({ ...commun, statut: "disponible", disponibilite_vog: "OK", import_vog: true, recuperation_ok: true, expertise_ok: true, fiche_vo_creee: true, facture_reglee_ok: true, date_mise_stock: today(),
          historique: trace(undefined, "disponible", "creation_manuelle", a.note || "création par le connecteur Claude (mise en vente directe)") });
      } else {
        await ref.set({ ...commun, statut: "restitution", date_retour: a.date_retour || "", recuperation_ok: false, expertise_ok: false, facture_ok: false, facture_reglee_ok: false, fiche_vo_creee: false, expertise_recue: false,
          historique: trace(undefined, "restitution", "creation_manuelle", a.note || a.client_precedent || "création par le connecteur Claude") });
        await pousserInfosAdminNE(id, { client: a.client_precedent, contrat: a.contrat, email: a.email_client, modele: a.modele_porteur, type_nacelle: a.type_nacelle, annee_fab: a.annee });
      }
      return { immat: id, resultat: `✅ ${id} créée (${a.statut}, site ${a.site || "—"})${identiteIncomplete ? " — type/modèle/année à compléter (alerte posée)" : ""}` };
    });

  action("archiver_machine", "Archiver (sortir du parc)",
    "Retire une machine du stock sans la supprimer (récupérable avec desarchiver_machine) : vendue hors Delta VO, hors périmètre, doublon… Le produit HubSpot est archivé. Pas de suppression définitive.",
    { immat: immatSchema, motif: z.string().min(3) },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if (d.archived === true) throw new ErreurOutil(`${id} est déjà archivée`);
      await machinesCol().doc(id).update({ archived: true, archived_at: nowIso(), archived_by: `${PAR} — ${a.motif}`, updatedAt: nowIso(), historique: trace(d.statut, "archivée", "archivage", a.motif) });
      const hs = await hubspot("archive", id);
      return { immat: id, resultat: `✅ ${id} archivée (${a.motif}) — ${hs}` };
    }, true);

  action("desarchiver_machine", "Désarchiver (remettre au parc)",
    "Réactive une machine archivée. Elle reprend son statut d'avant archivage (ou disponible), avec option de site. Si elle a un prix, elle est republiée dans HubSpot.",
    { immat: immatSchema, site: z.enum(LOCALITES).optional(), motif: z.string().optional() },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if (d.archived !== true) throw new ErreurOutil(`${id} n'est pas archivée`);
      const statut = d.statut || "disponible";
      await machinesCol().doc(id).update({
        archived: false, archived_at: null, archived_by: null, desarchivee_le: nowIso(), desarchivee_motif: a.motif || "réactivée par le connecteur Claude",
        ...(a.site ? { localite: a.site } : {}), disponibilite_vog: "OK", ...(statut === "disponible" ? { date_mise_stock: today() } : {}), updatedAt: nowIso(),
        historique: trace("archivée", statut, "desarchivage", a.motif),
      });
      const hs = statut === "disponible" && d.prix_fr > 0 ? await hubspot("upsert", id, modeleLabel(d), d.prix_fr) : "HubSpot : rien à publier (pas de prix ou hors Disponibles)";
      return { immat: id, resultat: `✅ ${id} désarchivée → ${statut}${a.site ? `, site ${a.site}` : ""} — ${hs}` };
    });

  action("mettre_en_preparation", "Vendre ou louer (mise en préparation)",
    "Sort une machine disponible vers une vente ou une location : statut en_cours, type de préparation (normale = lavage, CT, VGP, carrosserie, révision, photos ; en_etat = lavage + photos), client, commercial, dates. Comme dans l'appli : le produit HubSpot est archivé ; pour une LOCATION, le prochain départ est pré-rempli dans Nacelle Expert (jamais pour une vente).",
    {
      immat: immatSchema, type: z.enum(["vente", "location"]), type_prepa: z.enum(["normale", "en_etat"]),
      client: z.string().min(2).describe("Acheteur ou locataire"), commercial: z.string().default(""),
      date_vente: z.string().optional().describe("AAAA-MM-JJ (défaut aujourd'hui)"), date_livraison_prevue: z.string().optional().describe("AAAA-MM-JJ"),
      contrat: z.string().optional().describe("N° de contrat (location)"), email_client: z.string().optional(),
    },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      const st = d.statut || "restitution";
      if (d.archived) throw new ErreurOutil(`${id} est archivée`);
      if (st === "en_cours" || st === "cloturee" || st === "louee_lld") throw new ErreurOutil(`${id} est déjà ${LIBELLE_STATUT[st]} — utiliser remettre_en_disponible d'abord`);
      if (st === "restitution" && !(d.expertise_recue ?? true)) throw new ErreurOutil(`${id} : l'expertise Nacelle Expert n'est pas encore reçue — machine non vendable (règle R1)`);
      const estLoc = a.type === "location";
      const dateVente = a.date_vente || today();
      const u: Record<string, any> = {
        historique: trace(st, "en_cours", estLoc ? "mise_en_location" : "configuration_prepa", estLoc ? `location — ${a.client}` : `vente — ${a.client}`),
        statut: "en_cours", type_sortie: estLoc ? "lld" : "vente", type_prepa: a.type_prepa,
        acheteur: a.client, ...(estLoc ? { client_lld: a.client, date_mise_dispo_lld: a.date_livraison_prevue || dateVente } : {}),
        commercial_vendeur: a.commercial || "", date_vente: dateVente, date_livraison_prevue: a.date_livraison_prevue || dateVente, date_mise_en_cours: nowIso(),
        ...(a.contrat ? { contrat_sortie: a.contrat } : {}), ...(a.email_client ? { email_sortie: a.email_client } : {}),
        etapes_prepa: creerEtapesPrepa(a.type_prepa), updatedAt: nowIso(),
      };
      await machinesCol().doc(id).update(u);
      const hs = await hubspot("archive", id);
      let ne = "";
      if (estLoc) ne = (await pousserProchainDepartNE(id, d, a.client, a.contrat, a.email_client)) ? " — prochain départ pré-rempli dans Nacelle Expert" : " — ⚠ Nacelle Expert non pré-rempli";
      return { immat: id, resultat: `✅ ${id} : ${st} → en préparation (${a.type}, ${a.type_prepa}) pour ${a.client} — ${hs}${ne}` };
    });

  action("remettre_en_disponible", "Annuler la préparation",
    "Annule une vente/location en préparation (statut en_cours) : retour en disponible — ou en restitution si les frais Nacelle Expert de son retour ne sont pas réglés (règle R3). Efface acheteur, commercial, dates, étapes. Republie dans HubSpot si la machine a un prix.",
    { immat: immatSchema, motif: z.string().optional() },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if ((d.statut || "") !== "en_cours") throw new ErreurOutil(`${id} n'est pas en préparation (statut ${d.statut}) — pour une machine clôturée/louée, passer par l'appli (Annuler la clôture)`);
      const fraisImpayes = !!(d.expertise_recue ?? true) && !(d.facture_reglee_ok ?? false);
      const vers = fraisImpayes ? "restitution" : "disponible";
      await machinesCol().doc(id).update({
        historique: trace(d.statut, vers, "annulation_prepa", [fraisImpayes ? "frais NE non réglés" : "", a.motif].filter(Boolean).join(" — ") || undefined),
        statut: vers, type_sortie: null, type_prepa: null, acheteur: null, commercial_vendeur: null, date_vente: null, date_livraison_prevue: null, date_mise_en_cours: null,
        etapes_prepa: null, client_lld: null, contrat_sortie: FieldValue.delete(), email_sortie: FieldValue.delete(), date_mise_dispo_lld: null, updatedAt: nowIso(),
      });
      const hs = vers === "disponible" && d.prix_fr > 0 && !d.archived ? await hubspot("upsert", id, modeleLabel(d), d.prix_fr) : "HubSpot : rien à publier";
      return { immat: id, resultat: `✅ ${id} : préparation annulée → ${vers}${fraisImpayes ? " (frais Nacelle Expert non réglés : reste en Restitutions)" : ""} — ${hs}` };
    });

  action("cocher_etape_restitution", "Cocher / décocher une étape de restitution",
    "Étapes de l'onglet Restitutions : recuperation, expertise, facture, facture_reglee. Mêmes règles que l'appli : l'étape expertise ne se force pas si l'expertise Nacelle Expert n'est pas reçue ; les 4 étapes cochées font passer la machine en disponible ; décocher facture/règlement sur une machine disponible la rouvre en restitution.",
    { immat: immatSchema, etape: z.enum(["recuperation", "expertise", "facture", "facture_reglee"]), valeur: z.boolean() },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      const champ = `${a.etape}_ok`;
      const actuel = { recuperation_ok: d.recuperation_ok ?? true, expertise_ok: d.expertise_ok ?? true, facture_ok: d.facture_ok ?? false, facture_reglee_ok: d.facture_reglee_ok ?? false } as Record<string, boolean>;
      if (actuel[champ] === a.valeur) return { immat: id, resultat: `${id} : étape ${a.etape} déjà ${a.valeur ? "cochée" : "décochée"}` };
      if (champ === "expertise_ok" && a.valeur && !(d.expertise_recue ?? true)) throw new ErreurOutil(`${id} : l'expertise Nacelle Expert n'est pas encore arrivée — l'étape se validera automatiquement à sa réception`);
      const u: Record<string, any> = { [champ]: a.valeur, updatedAt: nowIso() };
      const apres = { ...actuel, [champ]: a.valeur };
      let note = "";
      if (Object.values(apres).every(Boolean) && (d.statut || "restitution") === "restitution" && !(d.fiche_vo_creee ?? false)) {
        u.fiche_vo_creee = true; u.statut = "disponible";
        if (!d.date_mise_stock) u.date_mise_stock = today();
        u.historique = trace(d.statut, "disponible", "etape_restitution", "4 étapes validées (facture réglée)");
        note = " → machine passée DISPONIBLE";
      }
      if (!a.valeur && d.statut === "disponible" && (champ === "facture_ok" || champ === "facture_reglee_ok")) {
        u.statut = "restitution"; u.fiche_vo_creee = false;
        u.historique = trace(d.statut, "restitution", "etape_restitution", `${champ} décoché`);
        note = " → machine ROUVERTE en restitution";
      }
      await machinesCol().doc(id).update(u);
      let hs = "";
      if (champ === "expertise_ok" && a.valeur && !d.archived && d.prix_fr > 0) hs = ` — ${await hubspot("upsert", id, modeleLabel(d), d.prix_fr)}`;
      return { immat: id, resultat: `✅ ${id} : étape ${a.etape} ${a.valeur ? "cochée" : "décochée"}${note}${hs}` };
    });

  action("facturer_restitution", "Facture des frais de restitution (Nacelle Expert)",
    "Enregistre la facture des frais de remise en état au client sortant (n° + date) → étape facture cochée. `annuler: true` efface la facture (admin). Pour le règlement, utiliser cocher_etape_restitution facture_reglee.",
    { immat: immatSchema, numero_facture: z.string().optional(), date_facture: z.string().optional().describe("AAAA-MM-JJ (défaut aujourd'hui)"), annuler: z.boolean().default(false) },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if (a.annuler) {
        await machinesCol().doc(id).update({ facture_ok: false, facture_resti_numero: FieldValue.delete(), facture_resti_date: FieldValue.delete(), facture_resti_par: FieldValue.delete(), updatedAt: nowIso() });
        return { immat: id, resultat: `✅ ${id} : facture de restitution ${d.facture_resti_numero || ""} annulée` };
      }
      if (!a.numero_facture?.trim()) throw new ErreurOutil("numero_facture requis");
      if (d.devis_complet === false || d.devis_a_verifier) throw new ErreurOutil(`${id} : devis fournisseur en attente / à vérifier — la facturation est bloquée tant que le devis n'est pas validé ou annulé (devis_action)`);
      await machinesCol().doc(id).update({ facture_ok: true, facture_resti_numero: a.numero_facture.trim(), facture_resti_date: a.date_facture || today(), facture_resti_par: PAR, updatedAt: nowIso() });
      return { immat: id, resultat: `✅ ${id} : facture restitution ${a.numero_facture.trim()} du ${a.date_facture || today()} enregistrée (étape facture cochée)` };
    });

  action("clore_restitution_sans_frais", "Rien à facturer (expertise 0 €)",
    "Clôture proprement une restitution dont l'expertise est à 0 € : facture + règlement cochés avec la mention « SANS FACTURE — expertise 0 € », passage en disponible, tracé dans l'historique.",
    { immat: immatSchema },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      const bascule = (d.statut || "restitution") === "restitution";
      if (!(d.expertise_recue ?? true)) throw new ErreurOutil(`${id} : expertise Nacelle Expert non reçue`);
      await machinesCol().doc(id).update({
        facture_ok: true, facture_resti_numero: "SANS FACTURE — expertise 0 €", facture_resti_date: today(), facture_resti_par: PAR, facture_reglee_ok: true, fiche_vo_creee: true,
        ...(bascule ? { statut: "disponible" } : {}), ...(!d.date_mise_stock ? { date_mise_stock: today() } : {}),
        historique: trace(d.statut, bascule ? "disponible" : d.statut, "etape_restitution", "rien à facturer (expertise 0 €)"), updatedAt: nowIso(),
      });
      return { immat: id, resultat: `✅ ${id} : restitution close sans frais${bascule ? " → disponible" : ""}` };
    });

  action("rouvrir_restitution", "Rouvrir une restitution",
    "Pour une machine passée disponible sans passer par Restitutions : repasse en restitution avec facture/règlement décochés (nouveau cycle de facturation des frais Nacelle Expert).",
    { immat: immatSchema, motif: z.string().min(3) },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if ((d.statut || "") === "restitution") throw new ErreurOutil(`${id} est déjà en restitution`);
      await machinesCol().doc(id).update({ historique: trace(d.statut, "restitution", "reouverture", a.motif), statut: "restitution", recuperation_ok: true, expertise_ok: !!(d.expertise_recue ?? true), facture_ok: false, facture_reglee_ok: false, fiche_vo_creee: false, updatedAt: nowIso() });
      return { immat: id, resultat: `✅ ${id} : ${d.statut} → restitution (${a.motif})` };
    });

  action("facturer_vente", "Facturer la vente / mettre à disposition (location)",
    "Machine en préparation (en_cours) livrée : VENTE → statut clôturée avec n° et date de facture ; LOCATION → statut louée (mise à disposition LLD, pas de facture de vente). `date_reglement` enregistre le paiement d'une vente déjà clôturée.",
    { immat: immatSchema, numero_facture: z.string().optional(), date_facture: z.string().optional().describe("AAAA-MM-JJ (défaut aujourd'hui)"), date_reglement: z.string().optional().describe("AAAA-MM-JJ — règlement reçu (vente clôturée)") },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      const st = d.statut || "";
      if (a.date_reglement && !a.numero_facture) {
        if (st !== "cloturee") throw new ErreurOutil(`${id} n'est pas une vente clôturée (statut ${st})`);
        await machinesCol().doc(id).update({ date_reglement: a.date_reglement, updatedAt: nowIso() });
        return { immat: id, resultat: `✅ ${id} : règlement de la facture ${d.numero_facture || ""} enregistré au ${a.date_reglement}` };
      }
      if (st !== "en_cours") throw new ErreurOutil(`${id} n'est pas en préparation (statut ${st})`);
      const estLoc = d.type_sortie === "lld";
      const dateF = a.date_facture || today();
      if (!estLoc && !a.numero_facture?.trim()) throw new ErreurOutil("numero_facture requis pour une vente");
      const u: Record<string, any> = estLoc
        ? { historique: trace(st, "louee_lld", "facturation", "mise à disposition LLD"), statut: "louee_lld", date_mise_dispo_lld: dateF, ...(a.numero_facture ? { numero_facture: a.numero_facture.trim() } : {}), updatedAt: nowIso() }
        : { historique: trace(st, "cloturee", "facturation", `facture ${a.numero_facture!.trim()}`), numero_facture: a.numero_facture!.trim(), date_facturation: dateF, statut: "cloturee", ...(a.date_reglement ? { date_reglement: a.date_reglement } : {}), updatedAt: nowIso() };
      await machinesCol().doc(id).update(u);
      return { immat: id, resultat: `✅ ${id} : ${estLoc ? `mise à disposition LLD le ${dateF} → louée` : `facture ${a.numero_facture!.trim()} du ${dateF} → clôturée`}` };
    });

  action("devis_action", "Devis Nacelle Assistance : relancer / annuler / valider",
    "Passe par la fonction serveur de Nacelle Expert, comme les boutons de l'appli. relancer = renvoie l'email « devis à chiffrer » à Nacelle Assistance ; annuler = société liquidée etc., postes à 0, débloque la facturation, aucun email ; valider = vérifie le devis PDF déposé (montant/référence corrigés si fournis) et ENVOIE l'expertise complète au client.",
    { immat: immatSchema, action: z.enum(["relancer", "annuler", "valider"]), motif: z.string().optional().describe("Obligatoire pour annuler"), montant_global_ht: z.number().nonnegative().optional().describe("valider : montant HT corrigé"), reference: z.string().optional().describe("valider : référence du devis corrigée") },
    async (a) => {
      const { id, d } = await chargerMachine(a.immat);
      if (a.action === "annuler" && !a.motif?.trim()) throw new ErreurOutil("motif requis pour annuler une demande de devis");
      if (a.action === "valider" && !d.devis_a_verifier && d.devis_complet === false) throw new ErreurOutil(`${id} : aucun devis déposé à valider (toujours attendu du fournisseur) — relancer ?`);
      const corps: Record<string, any> = { immat: id };
      if (a.action !== "valider") corps.action = a.action;
      if (a.motif) corps.motif = a.motif;
      if (a.montant_global_ht !== undefined) corps.montant_global = a.montant_global_ht;
      if (a.reference) corps.reference = a.reference;
      const r = await fetch(`${NACELLE_EXPERT_URL}/api/valider-devis`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await jetonConnecteur()}` },
        body: JSON.stringify(corps), signal: AbortSignal.timeout(45_000),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) throw new ErreurOutil(`Nacelle Expert : ${j.error || r.status}`);
      const detail = a.action === "relancer" ? `relance n° ${j.relances ?? "?"} envoyée à Nacelle Assistance` : a.action === "annuler" ? "demande de devis annulée — facturation débloquée (la synchro Delta VO suit dans la minute)" : `devis validé${j.email_envoye ? `, expertise envoyée au client ${j.client || ""}` : " (email non envoyé)"}`;
      return { immat: id, resultat: `✅ ${id} : ${detail}` };
    });

  return server;
}

// ─────────────────────────────────────────────────────────────
// Point d'entrée Vercel : /api/mcp/<cle>
// ─────────────────────────────────────────────────────────────
function cleValide(fournie: string): boolean {
  const attendue = process.env.MCP_SECRET || "";
  if (!attendue || attendue.length < 16) return false;
  const a = createHash("sha256").update(fournie).digest();
  const b = createHash("sha256").update(attendue).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req: any, res: any) {
  if (!process.env.MCP_SECRET) {
    res.status(503).json({ error: "Connecteur non configuré (variable MCP_SECRET absente dans Vercel)" });
    return;
  }
  const cle = String(req.query?.cle || "");
  if (!cleValide(cle)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (req.method === "GET" && !String(req.headers?.accept || "").includes("text/event-stream")) {
    // Petit écran de contrôle (navigateur) — ne révèle rien du stock
    res.status(200).json({ connecteur: "delta-vo", protocole: "MCP Streamable HTTP", etat: "ok", outils: 23 });
    return;
  }
  try {
    const server = construireServeur();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e: any) {
    console.error("❌ connecteur MCP :", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Erreur interne du connecteur" }, id: null });
  }
}
