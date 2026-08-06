import * as XLSX from "xlsx";
import { normalizeImmat } from "./immat";
import { normalizeLocalite } from "./localites";

// ============================================================
// IMPORT DU STOCK VO depuis l'Excel "VOG" (feuille « Liste complète »)
// ============================================================
// Nouvelle base VOG (août 2026) : TOUTES les lignes sont importées
// (le fichier EST la liste du stock en vente), toutes les colonnes sont
// reprises SAUF « Machinery Zone » (exclue à la demande de Jonathan).
// Le N° OCCASION devient la référence commerciale : c'est lui qui figure
// sur les documents envoyés à l'extérieur (jamais l'immatriculation).
//
// Clé du document machines_vo :
//   - immatriculation normalisée (clé de jointure avec Nacelle Expert)
//   - sinon le N° de dossier (colonne B)
// ============================================================

// En-têtes attendus (ligne 1 de la feuille « Liste complète »)
const H = {
  dossier: "Dossier Delta ou KLUBB France",
  occasion: "N° OCCASION",
  proprietaire: "Propriétaire",
  ficheOccasion: "Fiche d'occasion",
  dataAjout: "Data ajout vog",
  carteGrise: "Carte grise",
  categorie: "VL / PL /TR",
  cube: "N° de cube",
  immat: "IMMAT",
  histovec: "Vérification HISTOVEC",
  chassis: "N° de châssis",
  etatExterieur: "Etat général extérieur",
  etatNacelle: "Etat de la nacelle",
  etat: "Etat",
  dateMiseEnService: "Date de mise en service",
  annee: "Année de mise en service",
  marque: "Marque porteur",
  porteur: "Porteur",
  typeNacelle: "Type nacelle",
  km: "KM porteur",
  heures: "Heures de la nacelle",
  lieu: "Lieu de stockage du véhicule",
  prix: "PRIX DE VENTE HT",
  datePrix: "Date prix de vente",
  vrVnc: "VR OU VNC EUR",
  // Diffusion des annonces (stockées pour le futur système de mise en ligne)
  mascus: "Mascus",
  viamobilis: "ViaMobilis",
  siteDelta: "Site Delta",
  klubbCom: "Klubb.com",
  klubbFrance: "Klubb France",
  lot: "LOT",
  // ⚠ « Machinery Zone » volontairement ABSENTE : colonne exclue de l'import.
};

export interface ParsedStockMachine {
  docId: string; // immat normalisée ou dossier MAJ
  immat: string;
  numero_occasion: string;
  numero_dossier?: string;
  proprietaire?: string; // DS / KF
  fiche_occasion_vog?: string; // Oui / Non
  date_ajout_vog?: string;
  carte_grise_vog?: string;
  categorie_vehicule?: string; // VL / PL / TR
  numero_cube?: string;
  histovec?: string;
  num_chassis?: string;
  etat_exterieur?: string;
  etat_nacelle_vog?: string;
  etat_note_vog?: string;
  date_mise_en_service?: string;
  modele_porteur: string;
  type_nacelle: string;
  annee_circulation: string;
  km_porteur?: number;
  km_note?: string; // valeur non numérique d'origine ("PAS DE CLES", "NC"...)
  heures_nacelle?: number;
  heures_note?: string;
  localite?: string;
  prix_fr?: number;
  date_prix_vog?: string;
  vr_vnc?: number; // 💶 sensible : affichage réservé aux admins
  diffusion?: {
    mascus?: string;
    viamobilis?: string;
    site_delta?: string;
    klubb_com?: string;
    klubb_france?: string;
    lot?: string;
  };
  source: string; // libellé pour l'affichage du résultat
  avertissements: string[]; // anomalies détectées sur la ligne (rapport)
}

export interface StockParseResult {
  parsed: ParsedStockMachine[];
  skipped: { ref: string; raison: string }[];
  totalRows: number;
}

const CHASSIS_RE = /^[A-Z0-9]{15,20}$/; // n° de châssis (VIN ~17 caractères)
const SIV_RE = /^[A-Z]{2}-\d{3}-[A-Z]{2}$/;

function toNum(v: any): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const cleaned = String(v).replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return undefined;
  const n = Number(cleaned);
  return isNaN(n) ? undefined : n;
}

function str(v: any): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** "2183.0" → "2183" (les N° occasion sortent d'Excel en nombre) */
function occStr(v: any): string {
  const s = str(v);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Dates Excel -> ISO court "AAAA-MM-JJ". Accepte : objet Date (cellule date),
 *  n° de série Excel, "AAAA-MM-JJ...", "JJ/MM/AAAA" ; sinon la valeur brute. */
function dateStr(v: any): string {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // n° de série Excel (jours depuis 1900) -> date
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    // n° de série Excel stocké en texte (legs de l'import initial)
    return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return s;
}

// Lecture d'une colonne tolérante aux espaces / retours ligne / casse dans
// l'en-tête (le VOG contient par ex. "VR OU VNC EUR \nOBLIGATOIRE").
function col(row: any, header: string): any {
  if (header in row) return row[header];
  const target = header.trim().toLowerCase();
  for (const k of Object.keys(row)) {
    const kk = k.replace(/\s+/g, " ").trim().toLowerCase();
    if (kk === target || kk.startsWith(target)) return row[k];
  }
  return null;
}

function hasCol(sampleRow: any, header: string): boolean {
  return Object.keys(sampleRow).some((k) =>
    k.replace(/\s+/g, " ").trim().toLowerCase().startsWith(header.trim().toLowerCase())
  );
}

export async function parseStockExcel(file: File): Promise<StockParseResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  if (wb.SheetNames.length === 0) throw new Error("Le fichier Excel est vide.");

  const sheetName = wb.SheetNames.includes("Liste complète")
    ? "Liste complète"
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });

  // Vérification du modèle : colonnes clés présentes ?
  if (rows.length > 0) {
    if (!hasCol(rows[0], H.dossier) || !hasCol(rows[0], H.immat)) {
      throw new Error(
        "Le fichier ne correspond pas au modèle VOG (colonnes « Dossier Delta ou KLUBB France » / « IMMAT » introuvables)."
      );
    }
  }

  const parsed: ParsedStockMachine[] = [];
  const skipped: { ref: string; raison: string }[] = [];

  rows.forEach((row) => {
    const dossier = str(col(row, H.dossier)).replace(/\.0$/, "");
    const immatRaw = str(col(row, H.immat));
    const occasion = occStr(col(row, H.occasion));

    // Ligne sans immat NI dossier -> parasite, ignorée et signalée
    if (!immatRaw && !dossier) {
      if (Object.values(row).some((v) => str(v))) {
        skipped.push({ ref: occasion || "(ligne vide)", raison: "Ni immatriculation ni n° de dossier" });
      }
      return;
    }

    const immat = immatRaw ? normalizeImmat(immatRaw) : "";
    const docId = immat || dossier.toUpperCase();
    const avert: string[] = [];

    if (!occasion) avert.push("Sans N° occasion (référence commerciale manquante)");
    if (!immat) avert.push("Sans immatriculation (clé = n° de dossier)");
    else if (!SIV_RE.test(immat)) avert.push(`Immat hors format SIV (${immat}) : pas de jointure Nacelle Expert possible`);

    // 🔧 N° de châssis égaré/dupliqué dans une colonne « Etat »
    // (décalage de saisie constaté dans le fichier, ex. AB-613-CW)
    let chassis = str(col(row, H.chassis));
    let etatNacelle = str(col(row, H.etatNacelle));
    let etatNote = str(col(row, H.etat));
    const nacelleVin = CHASSIS_RE.test(etatNacelle.replace(/\s/g, ""));
    const noteVin = CHASSIS_RE.test(etatNote.replace(/\s/g, ""));
    if (nacelleVin) {
      if (!chassis) {
        chassis = etatNacelle.replace(/\s/g, "");
        avert.push("N° de châssis récupéré depuis la colonne « Etat de la nacelle »");
      }
      etatNacelle = ""; // un VIN n'est pas un état : on nettoie
    }
    if (noteVin) {
      if (!chassis) {
        chassis = etatNote.replace(/\s/g, "");
        avert.push("N° de châssis récupéré depuis la colonne « Etat »");
      }
      etatNote = "";
    }

    // KM / heures : nombres si possible, sinon la mention est conservée en note
    const kmRaw = str(col(row, H.km));
    const heuresRaw = str(col(row, H.heures));
    const km = toNum(kmRaw);
    const heures = toNum(heuresRaw);

    const marque = str(col(row, H.marque));
    const porteur = str(col(row, H.porteur));

    const diffusion: ParsedStockMachine["diffusion"] = {};
    const dMascus = str(col(row, H.mascus));
    const dVia = str(col(row, H.viamobilis));
    const dSite = str(col(row, H.siteDelta));
    const dKlubb = str(col(row, H.klubbCom));
    const dKlubbFr = str(col(row, H.klubbFrance));
    const dLot = occStr(col(row, H.lot));
    if (dMascus) diffusion.mascus = dMascus;
    if (dVia) diffusion.viamobilis = dVia;
    if (dSite) diffusion.site_delta = dSite;
    if (dKlubb) diffusion.klubb_com = dKlubb;
    if (dKlubbFr) diffusion.klubb_france = dKlubbFr;
    if (dLot) diffusion.lot = dLot;

    parsed.push({
      docId,
      immat,
      numero_occasion: occasion,
      numero_dossier: dossier || undefined,
      proprietaire: str(col(row, H.proprietaire)) || undefined,
      fiche_occasion_vog: str(col(row, H.ficheOccasion)) || undefined,
      date_ajout_vog: dateStr(col(row, H.dataAjout)) || undefined,
      carte_grise_vog: str(col(row, H.carteGrise)) || undefined,
      categorie_vehicule: str(col(row, H.categorie)) || undefined,
      numero_cube: occStr(col(row, H.cube)) || undefined,
      histovec: str(col(row, H.histovec)) || undefined,
      num_chassis: chassis || undefined,
      etat_exterieur: str(col(row, H.etatExterieur)) || undefined,
      etat_nacelle_vog: etatNacelle || undefined,
      etat_note_vog: etatNote || undefined,
      date_mise_en_service: dateStr(col(row, H.dateMiseEnService)) || undefined,
      modele_porteur: `${marque} ${porteur}`.replace(/\s+/g, " ").trim(),
      type_nacelle: str(col(row, H.typeNacelle)),
      annee_circulation: occStr(col(row, H.annee)),
      km_porteur: km,
      km_note: km == null && kmRaw ? kmRaw : undefined,
      heures_nacelle: heures,
      heures_note: heures == null && heuresRaw ? heuresRaw : undefined,
      localite: normalizeLocalite(str(col(row, H.lieu))) || undefined,
      prix_fr: toNum(col(row, H.prix)),
      date_prix_vog: dateStr(col(row, H.datePrix)) || undefined,
      vr_vnc: toNum(col(row, H.vrVnc)),
      diffusion: Object.keys(diffusion).length ? diffusion : undefined,
      source: occasion ? `occasion ${occasion} (${immat || dossier})` : (immat ? `immat ${immat}` : `dossier ${dossier}`),
      avertissements: avert,
    });
  });

  return { parsed, skipped, totalRows: rows.length };
}
