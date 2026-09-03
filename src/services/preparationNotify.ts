import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { creerEtapesPrepa } from "../types/machine";
import type { Machine, TypePrepa } from "../types/machine";
import { LOCALITES, normalizeLocalite } from "../utils/localites";

/**
 * 🔧 NOTIFICATION PRÉPARATEURS PAR SITE (validée avec Jonathan).
 *
 * Quand une machine est MISE EN PRÉPARATION (« Valider et créer la fiche »),
 * un email part automatiquement aux préparateurs du SITE de la machine.
 * La liste d'emails par site est gérée dans Admin → « Préparateurs par
 * site » et stockée dans Firestore : config/notifications_preparation
 *   { sites: { "EGI": ["a@…", "b@…"], "Ferrières": [...], ... } }
 *
 * - Best-effort : un échec d'envoi n'interrompt JAMAIS la mise en préparation.
 * - Une trace (date + destinataires) est posée sur la machine (notif_prepa).
 */

export const NOTIF_PREPA_DOC = "notifications_preparation";

export type NotifPrepaConfig = { sites: Record<string, string[]> };

export async function chargerConfigNotifPrepa(): Promise<NotifPrepaConfig> {
  const snap = await getDoc(doc(db, "config", NOTIF_PREPA_DOC));
  const data = (snap.exists() ? snap.data() : {}) as Partial<NotifPrepaConfig>;
  const sites: Record<string, string[]> = {};
  for (const site of LOCALITES) {
    const raw = data.sites?.[site];
    sites[site] = Array.isArray(raw) ? raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean) : [];
  }
  return { sites };
}

export async function enregistrerConfigNotifPrepa(cfg: NotifPrepaConfig, par: string): Promise<void> {
  await setDoc(
    doc(db, "config", NOTIF_PREPA_DOC),
    { sites: cfg.sites, updatedAt: new Date().toISOString(), updatedBy: par },
    { merge: true }
  );
}

/** Découpe une saisie libre (virgules, ; espaces, retours ligne) en emails valides. */
export function parseEmails(text: string): { ok: string[]; invalides: string[] } {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ok: string[] = [];
  const invalides: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const e = raw.trim().toLowerCase();
    if (!e) continue;
    (re.test(e) ? ok : invalides).push(e);
  }
  return { ok: Array.from(new Set(ok)), invalides };
}

/** Destinataires pour le site d'une machine (localité normalisée). */
export function destinatairesPourSite(cfg: NotifPrepaConfig, localite?: string): string[] {
  const site = normalizeLocalite(localite);
  if (!site) return [];
  return cfg.sites[site] || [];
}

export type NotifPrepaResult =
  | { status: "envoye"; to: string[]; site: string }
  | { status: "sans_site" }
  | { status: "sans_destinataire"; site: string }
  | { status: "erreur"; message: string };

/**
 * Envoie la notification de mise en préparation pour une machine.
 * `config` = valeurs saisies dans la fenêtre de configuration (la machine
 * en mémoire n'est pas encore à jour au moment de l'appel).
 */
export async function notifierPreparateurs(
  machine: Machine,
  config: {
    type_prepa: TypePrepa;
    acheteur: string;
    commercial_vendeur: string;
    date_livraison_prevue: string;
  },
  par: string
): Promise<NotifPrepaResult> {
  try {
    const site = normalizeLocalite(machine.localite);
    if (!site) return { status: "sans_site" };
    const cfg = await chargerConfigNotifPrepa();
    const to = destinatairesPourSite(cfg, site);
    if (!to.length) return { status: "sans_destinataire", site };

    const estLocation = machine.type_sortie === "lld";
    const resp = await fetch("/api/notify-preparation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        immat: machine.immat,
        site,
        reference: machine.numero_dossier || "",
        type_nacelle: machine.type_nacelle || "",
        modele_porteur: machine.modele_porteur || "",
        annee: machine.annee_circulation || "",
        type_prepa: config.type_prepa,
        type_sortie: estLocation ? "lld" : "vente",
        acheteur: estLocation ? machine.client_lld || config.acheteur : config.acheteur,
        commercial: config.commercial_vendeur,
        date_livraison_prevue: config.date_livraison_prevue,
        par,
        etapes: creerEtapesPrepa(config.type_prepa).map((e) => e.label),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { status: "erreur", message: data?.error || `Erreur ${resp.status}` };

    // 🧾 Trace sur la machine (best-effort)
    try {
      await updateDoc(doc(db, "machines_vo", machine.id), {
        notif_prepa: { date: new Date().toISOString(), to, site, par },
      });
    } catch (e) {
      console.warn("⚠️ Trace notif_prepa non enregistrée :", e);
    }
    return { status: "envoye", to, site };
  } catch (e: any) {
    console.warn("⚠️ Notification préparateurs non envoyée :", e);
    return { status: "erreur", message: e?.message || String(e) };
  }
}
