import { Machine } from "../types/machine";
import { horsVenteVog, normalizeTypeNacelle } from "./nacelles";

/**
 * 📊 SYNTHÈSE MARCHÉ INTERNET (validée avec Jonathan).
 *
 * Agrège les études de marché IA déjà enregistrées sur les machines en vente
 * (aucun nouvel appel IA, zéro coût) pour donner une vue globale des prix
 * internet : min / moyen / max par TYPE de nacelle (ligne de tête, toutes
 * années), détaillé par TRANCHE D'ÂGE en dessous, plus une ligne
 * « Toutes nacelles ». Notre prix de vente moyen Delta VO est mis en regard
 * avec l'écart en %.
 *
 * - Seules les études de moins de `joursMax` jours comptent (défaut 90).
 * - min = plus basse des fourchettes basses · max = plus haute des hautes ·
 *   moyen = moyenne des médianes.
 * - Réservé aux administrateurs (affichage + feuille Pricing PDG).
 */

export const TRANCHES_AGE = ["< 5 ans", "5-10 ans", "> 10 ans", "Année inconnue"] as const;
export type TrancheAge = (typeof TRANCHES_AGE)[number];

export interface LigneMarche {
  /** 0 = toutes nacelles · 1 = type · 2 = tranche d'âge */
  niveau: 0 | 1 | 2;
  libelle: string;
  nbMachines: number;
  nbAnnonces: number;
  min: number | null;
  moyen: number | null;
  max: number | null;
  /** Prix de vente France HT moyen Delta VO (machines avec prix et étude) */
  prixDeltaMoyen: number | null;
  /** Écart de notre prix moyen par rapport au marché moyen, en % (+ = au-dessus) */
  ecartPct: number | null;
  derniereEtude: string;
}

export interface SyntheseMarche {
  global: LigneMarche | null;
  types: { type: LigneMarche; tranches: LigneMarche[] }[];
  /** Machines en vente sans étude récente (information) */
  nbSansEtude: number;
  joursMax: number;
}

export function anneeMachine(m: Machine): number | null {
  const match = String(m.annee_circulation || "").match(/(19|20)\d{2}/);
  return match ? parseInt(match[0], 10) : null;
}

export function trancheAge(m: Machine, now = new Date()): TrancheAge {
  const annee = anneeMachine(m);
  if (!annee) return "Année inconnue";
  const age = now.getFullYear() - annee;
  if (age < 5) return "< 5 ans";
  if (age <= 10) return "5-10 ans";
  return "> 10 ans";
}

function etudeValide(m: Machine, joursMax: number, now: Date): boolean {
  const e = m.etude_marche;
  if (!e?.date) return false;
  const t = new Date(e.date).getTime();
  if (isNaN(t) || now.getTime() - t > joursMax * 86400000) return false;
  return e.fourchette_basse != null || e.fourchette_haute != null || e.mediane != null;
}

function agreger(niveau: 0 | 1 | 2, libelle: string, ms: Machine[]): LigneMarche {
  const basses: number[] = [];
  const hautes: number[] = [];
  const medianes: number[] = [];
  const prixDelta: number[] = [];
  let nbAnnonces = 0;
  let derniere = "";
  for (const m of ms) {
    const e = m.etude_marche!;
    const b = e.fourchette_basse ?? e.mediane;
    const h = e.fourchette_haute ?? e.mediane;
    const med = e.mediane ?? (b != null && h != null ? (b + h) / 2 : b ?? h);
    if (b != null) basses.push(b);
    if (h != null) hautes.push(h);
    if (med != null) medianes.push(med);
    if (m.prix_fr != null && m.prix_fr > 0) prixDelta.push(m.prix_fr);
    nbAnnonces += e.nb_annonces || 0;
    if (e.date > derniere) derniere = e.date;
  }
  const moy = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
  const moyen = moy(medianes);
  const prixDeltaMoyen = moy(prixDelta);
  return {
    niveau,
    libelle,
    nbMachines: ms.length,
    nbAnnonces,
    min: basses.length ? Math.min(...basses) : null,
    moyen,
    max: hautes.length ? Math.max(...hautes) : null,
    prixDeltaMoyen,
    ecartPct: moyen && prixDeltaMoyen ? Math.round(((prixDeltaMoyen - moyen) / moyen) * 100) : null,
    derniereEtude: derniere,
  };
}

export function calculerSyntheseMarche(machines: Machine[], joursMax = 90, now = new Date()): SyntheseMarche {
  const enVente = machines.filter((m) => !m.archived && !horsVenteVog(m) && m.statut === "disponible");
  const avecEtude = enVente.filter((m) => etudeValide(m, joursMax, now));
  const nbSansEtude = enVente.length - avecEtude.length;
  if (!avecEtude.length) return { global: null, types: [], nbSansEtude, joursMax };

  const parType = new Map<string, Machine[]>();
  for (const m of avecEtude) {
    const type = normalizeTypeNacelle(m.type_nacelle) || m.type_nacelle || "Type inconnu";
    if (!parType.has(type)) parType.set(type, []);
    parType.get(type)!.push(m);
  }

  const types = Array.from(parType.entries())
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([type, ms]) => {
      const tranches: LigneMarche[] = [];
      for (const tr of TRANCHES_AGE) {
        const sous = ms.filter((m) => trancheAge(m, now) === tr);
        if (sous.length) tranches.push(agreger(2, tr, sous));
      }
      return { type: agreger(1, type, ms), tranches };
    });

  return { global: agreger(0, "Toutes nacelles", avecEtude), types, nbSansEtude, joursMax };
}

/** Lignes à plat (global en tête, puis type + tranches) — pour l'export Excel. */
export function lignesSyntheseMarche(s: SyntheseMarche): LigneMarche[] {
  const out: LigneMarche[] = [];
  for (const t of s.types) {
    out.push(t.type, ...t.tranches);
  }
  if (s.global) out.push(s.global);
  return out;
}
