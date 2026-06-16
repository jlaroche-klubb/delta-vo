import * as XLSX from "xlsx";

// ============================================================
// IMPORT DU STOCK VO depuis l'Excel "VOG" (Liste complète)
// ============================================================
// Ne lit que les machines "à vendre".
// Clé du document machines_vo :
//   - immatriculation (MAJUSCULES) si présente
//   - sinon le N° de dossier (colonne B)
// ============================================================

// En-têtes attendus (ligne 1 de la feuille)
const H = {
  dossier: "Dossier Delta ou KLUBB France",
  occasion: "N° OCCASION",
  immat: "IMMAT",
  etatNacelle: "Etat de la nacelle",
  annee: "Année de mise en service",
  marque: "Marque porteur",
  porteur: "Porteur",
  typeNacelle: "Type nacelle",
  km: "KM porteur",
  heures: "Heures de la nacelle",
  lieu: "Lieu de stockage du véhicule",
  prix: "PRIX DE VENTE HT",
};

export interface ParsedStockMachine {
  docId: string; // immat MAJ ou dossier MAJ
  immat: string;
  numero_dossier?: string;
  modele_porteur: string;
  type_nacelle: string;
  annee_circulation: string;
  km_porteur?: number;
  heures_nacelle?: number;
  localite?: string;
  prix_fr?: number;
  source: string; // libellé pour l'affichage du résultat
}

export interface StockParseResult {
  parsed: ParsedStockMachine[];
  skipped: { ref: string; raison: string }[];
  totalRows: number;
}

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

// Lecture d'une colonne tolérante aux espaces / différences de casse dans l'en-tête
// (le VOG contient par ex. " KM porteur" avec un espace en tête).
function col(row: any, header: string): any {
  if (header in row) return row[header];
  const target = header.trim().toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.trim().toLowerCase() === target) return row[k];
  }
  return null;
}

function hasCol(sampleRow: any, header: string): boolean {
  return col(sampleRow, header) !== null || Object.keys(sampleRow).some(
    (k) => k.trim().toLowerCase() === header.trim().toLowerCase()
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
    const dossier = str(col(row, H.dossier));
    if (!dossier) return; // ligne vide -> ignorée silencieusement

    const etat = str(col(row, H.etatNacelle));
    if (!etat.toLowerCase().includes("vendre")) {
      skipped.push({ ref: dossier, raison: `Pas à vendre (${etat || "état vide"})` });
      return;
    }

    const immat = str(col(row, H.immat)).toUpperCase();
    const docId = immat || dossier.toUpperCase();

    const marque = str(col(row, H.marque));
    const porteur = str(col(row, H.porteur));
    const modele = `${marque} ${porteur}`.trim();

    parsed.push({
      docId,
      immat,
      numero_dossier: dossier,
      modele_porteur: modele,
      type_nacelle: str(col(row, H.typeNacelle)),
      annee_circulation: str(col(row, H.annee)),
      km_porteur: toNum(col(row, H.km)),
      heures_nacelle: toNum(col(row, H.heures)),
      localite: str(col(row, H.lieu)) || undefined,
      prix_fr: toNum(col(row, H.prix)),
      source: immat ? `immat ${immat}` : `dossier ${dossier}`,
    });
  });

  return { parsed, skipped, totalRows: rows.length };
}