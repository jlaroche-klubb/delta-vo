import * as XLSX from "xlsx";
import type { Machine } from "../types/machine";
import { normalizeImmat } from "./immat";
import { normalizeLocalite } from "./localites";

/**
 * 📋 IMPORT « ÉTAT DE PARC » (demande Jonathan, 05/10/2026).
 *
 * Les sites (Ferrières, Croissy, EGI…) envoient un fichier Excel simple :
 * n° D0, immatriculation, (lieu), (km), (heures), statut (EN VENTE / VENDU /
 * Disponible / Pas dispo / À vérifier…). Contrairement au fichier VOG, il n'y
 * a ni type de nacelle, ni modèle, ni année.
 *
 * L'import compare chaque ligne au stock Delta VO et PROPOSE (simulation) :
 *  - machine « en vente » absente        → création (fiche « à compléter »)
 *  - machine « en vente » archivée       → réactivation
 *  - machine « en vente » disponible mais au mauvais site → site corrigé
 *  - machine « en vente » mais en préparation / mention VOG bloquante → CONFLIT
 *    (jamais appliqué sans case cochée explicitement)
 *  - vendu / pas dispo                   → rien (cohérent) ou ignoré (absente)
 * Rien n'est écrit tant que l'utilisateur n'a pas cliqué « Appliquer ».
 */

export type StatutParc = "vente" | "vendu" | "hors_vente" | "a_verifier" | "inconnu";

export interface LigneParc {
  source: string; // nom du fichier
  immat: string; // normalisée AB-123-CD ("" si illisible)
  immatBrute: string;
  d0: string; // D0xxxx ou ""
  site: string; // localité normalisée ("" si inconnue)
  km?: number;
  heures?: number;
  statut: StatutParc;
  statutBrut: string;
}

export interface LigneSim {
  immat: string;
  label: string;
  detail: string[];
  site: string;
  ligne: LigneParc;
  machineId?: string;
}

export interface SimulationParc {
  aCreer: LigneSim[];
  aReactiver: LigneSim[];
  sitesACorriger: LigneSim[];
  conflitsPrepa: LigneSim[]; // en vente dans le fichier, en préparation dans Delta VO
  conflitsVog: LigneSim[]; // en vente dans le fichier, mention VOG bloquante dans Delta VO
  conflitsVente: LigneSim[]; // vendu / pas dispo dans le fichier, en vente dans Delta VO
  dejaOk: LigneSim[];
  ignorees: { ref: string; raison: string }[];
  totalLignes: number;
  sources: string[];
}

const str = (v: any) => (v == null ? "" : String(v).trim());

function toNum(v: any): number | undefined {
  if (v == null) return undefined;
  const s = String(v).replace(/[~hH \s]/g, "").replace(",", ".");
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;
}

function classer(statutBrut: string): StatutParc {
  const s = statutBrut.toLowerCase().replace(/\s+/g, " ").trim();
  if (!s) return "inconnu";
  if (/^(en vente|dispo|disponible|a vendre|à vendre|ok)/.test(s)) return "vente";
  if (/^(vendu|vendue|vente )/.test(s)) return "vendu";
  if (/^(pas dispo|indispo|non dispo|lou|loc|pret|prêt|hs)/.test(s)) return "hors_vente";
  if (/v[ée]rif/.test(s)) return "a_verifier";
  if (/non renseign/.test(s)) return "inconnu";
  return "inconnu";
}

/** Site déduit du nom de fichier quand le fichier n'a pas de colonne « Lieu » */
function siteDepuisNomFichier(nom: string): string {
  const n = nom.toLowerCase();
  if (n.includes("egi")) return "EGI";
  if (n.includes("ferri")) return "Ferrières";
  if (n.includes("croissy")) return "Croissy";
  if (n.includes("avignon")) return "Avignon";
  if (n.includes("alban")) return "St Alban";
  return "";
}

/** Trouve la ligne d'en-tête (celle qui contient « immat ») et renvoie l'index des colonnes */
function trouverEntete(aoa: any[][]): { idx: number; col: Record<string, number> } | null {
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = aoa[i].map((c) => str(c).toLowerCase());
    const immat = row.findIndex((c) => c.includes("immat"));
    if (immat < 0) continue;
    const find = (...mots: string[]) => row.findIndex((c) => mots.some((m) => c.includes(m)));
    return {
      idx: i,
      col: {
        immat,
        d0: find("d0", "numéro d0", "dossier"),
        lieu: find("lieu", "site"),
        km: find("kilom", "km"),
        heures: find("heure"),
        statut: find("statut", "etat", "état", "dispon"),
      },
    };
  }
  return null;
}

export async function parseEtatParcExcel(file: File): Promise<{ lignes: LigneParc[]; totalLignes: number }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const entete = trouverEntete(aoa);
  if (!entete) throw new Error("Colonne « Immatriculation » introuvable dans le fichier");
  const siteFichier = siteDepuisNomFichier(file.name);
  const lignes: LigneParc[] = [];
  let totalLignes = 0;
  for (const row of aoa.slice(entete.idx + 1)) {
    const immatBrute = str(row[entete.col.immat]);
    if (!immatBrute) continue;
    totalLignes++;
    const immat = normalizeImmat(immatBrute);
    const d0raw = entete.col.d0 >= 0 ? str(row[entete.col.d0]).toUpperCase() : "";
    const lieuRaw = entete.col.lieu >= 0 ? str(row[entete.col.lieu]) : "";
    const site = normalizeLocalite(lieuRaw.replace(/^(klubb|delta)\s+/i, "")) || siteFichier;
    const statutBrut = entete.col.statut >= 0 ? str(row[entete.col.statut]) : "";
    lignes.push({
      source: file.name,
      immat: /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(immat) ? immat : "",
      immatBrute,
      d0: /^D\d{5}$/.test(d0raw) ? d0raw : "",
      site,
      km: entete.col.km >= 0 ? toNum(row[entete.col.km]) : undefined,
      heures: entete.col.heures >= 0 ? toNum(row[entete.col.heures]) : undefined,
      statut: classer(statutBrut),
      statutBrut,
    });
  }
  return { lignes, totalLignes };
}

const horsVenteVog = (m: Machine) => {
  const d = (m.disponibilite_vog || "").trim();
  return d !== "" && !/^ok$/i.test(d);
};

export function simulerEtatParc(lignes: LigneParc[], machines: Machine[]): SimulationParc {
  const parImmat = new Map<string, Machine>();
  for (const m of machines) parImmat.set(normalizeImmat((m.immat || m.id || "").trim()), m);
  const sim: SimulationParc = {
    aCreer: [], aReactiver: [], sitesACorriger: [], conflitsPrepa: [], conflitsVog: [], conflitsVente: [],
    dejaOk: [], ignorees: [], totalLignes: lignes.length, sources: Array.from(new Set(lignes.map((l) => l.source))),
  };
  const vus = new Set<string>();
  for (const l of lignes) {
    if (!l.immat) {
      sim.ignorees.push({ ref: l.immatBrute, raison: "immatriculation illisible" });
      continue;
    }
    if (vus.has(l.immat)) {
      sim.ignorees.push({ ref: l.immat, raison: "doublon dans les fichiers" });
      continue;
    }
    vus.add(l.immat);
    const m = parImmat.get(l.immat);
    const label = m ? `${m.type_nacelle || "type ?"} · ${m.modele_porteur || ""}`.trim() : "nouvelle fiche";
    const base = (detail: string[]): LigneSim => ({ immat: l.immat, label, detail, site: l.site, ligne: l, machineId: m?.id });

    if (l.statut === "vente") {
      if (!m) {
        sim.aCreer.push(base([
          `site ${l.site || "— (à renseigner)"}${l.d0 ? ` · D0 ${l.d0}` : ""}`,
          `${l.km != null ? `${l.km.toLocaleString("fr-FR")} km` : "km —"} · ${l.heures != null ? `${l.heures.toLocaleString("fr-FR")} h` : "heures —"}`,
          "type de nacelle, modèle et année à compléter (crayon ✏️ ou prochain import VOG)",
        ]));
      } else if (m.archived) {
        sim.aReactiver.push(base([`archivée${m.archived_by ? ` (${m.archived_by})` : ""} → remise en vente, site ${l.site || m.localite || "—"}`]));
      } else if (m.statut === "en_cours" || m.statut === "cloturee" || m.statut === "louee_lld") {
        sim.conflitsPrepa.push(base([`Delta VO : ${m.statut === "en_cours" ? "en préparation" : m.statut === "cloturee" ? "clôturée" : "louée"}${m.acheteur || m.client_lld ? ` — ${m.acheteur || m.client_lld}` : ""} · le fichier dit « ${l.statutBrut} »`]));
      } else if (horsVenteVog(m)) {
        sim.conflitsVog.push(base([`mention VOG « ${m.disponibilite_vog} » bloque la vente · le fichier dit « ${l.statutBrut} »`]));
      } else if (l.site && normalizeLocalite(m.localite) !== l.site) {
        sim.sitesACorriger.push(base([`site Delta VO « ${m.localite || "—"} » → « ${l.site} »`]));
      } else {
        sim.dejaOk.push(base([m.statut === "restitution" ? "en restitution : en vente dès réception de l'expertise Nacelle Expert" : "disponible, bon site"]));
      }
    } else if (l.statut === "vendu" || l.statut === "hors_vente" || l.statut === "a_verifier") {
      if (!m) {
        sim.ignorees.push({ ref: l.immat, raison: `« ${l.statutBrut} » et absente de Delta VO — rien à faire` });
      } else if (m.statut === "disponible" && !m.archived && !horsVenteVog(m)) {
        sim.conflitsVente.push(base([`Delta VO : en vente · le fichier dit « ${l.statutBrut} »`]));
      } else {
        sim.dejaOk.push(base([`hors vente des deux côtés (« ${l.statutBrut} »)`]));
      }
    } else {
      sim.ignorees.push({ ref: l.immat, raison: `statut « ${l.statutBrut || "vide"} » non reconnu` });
    }
  }
  return sim;
}

/** Options d'application choisies dans la modale (conflits : décochés par défaut) */
export interface OptionsParc {
  remettreEnVentePrepa: boolean;
  leverVog: boolean;
  retirerDeLaVente: boolean;
}
