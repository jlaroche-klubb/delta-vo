import * as XLSX from "xlsx";
import { Machine } from "../types/machine";

export interface ImportResult {
  success: ImportSuccess[];
  errors: ImportError[];
  totalRows: number;
}

export interface ImportSuccess {
  immat: string;
  prixFr?: number;
  prixExport?: number;
  source: "À pricer" | "À repricer";
}

export interface ImportError {
  immat: string;
  raison: string;
  source: string;
}

interface ImportOptions {
  file: File;
  machines: Machine[];
}

export async function importPricingFromExcel({
  file,
  machines,
}: ImportOptions): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const success: ImportSuccess[] = [];
  const errors: ImportError[] = [];
  let totalRows = 0;

  // Onglet "À pricer"
  if (wb.SheetNames.includes("À pricer")) {
    const ws = wb.Sheets["À pricer"];
    const rows = XLSX.utils.sheet_to_json<any>(ws);
    totalRows += rows.length;

    rows.forEach((row, idx) => {
      processRow(row, idx + 2, "À pricer", machines, success, errors, false);
    });
  }

  // Onglet "À repricer"
  if (wb.SheetNames.includes("À repricer")) {
    const ws = wb.Sheets["À repricer"];
    const rows = XLSX.utils.sheet_to_json<any>(ws);
    totalRows += rows.length;

    rows.forEach((row, idx) => {
      processRow(row, idx + 2, "À repricer", machines, success, errors, true);
    });
  }

  if (wb.SheetNames.length === 0 || (!wb.SheetNames.includes("À pricer") && !wb.SheetNames.includes("À repricer"))) {
    throw new Error(
      "Le fichier ne contient pas les onglets attendus. Vérifiez que vous utilisez bien le modèle exporté depuis Delta VO (onglets « À pricer » et/ou « À repricer »)."
    );
  }

  return { success, errors, totalRows };
}

function processRow(
  row: any,
  rowNum: number,
  source: "À pricer" | "À repricer",
  machines: Machine[],
  success: ImportSuccess[],
  errors: ImportError[],
  isRepricer: boolean
) {
  const immat = String(row["Immatriculation"] || "").trim().toUpperCase();

  if (!immat) {
    errors.push({
      immat: `Ligne ${rowNum}`,
      raison: "Immatriculation manquante",
      source,
    });
    return;
  }

  // Trouver la machine
  const machine = machines.find((m) => m.immat.toUpperCase() === immat);
  if (!machine) {
    errors.push({
      immat,
      raison: `Immatriculation introuvable dans Delta VO (ligne ${rowNum})`,
      source,
    });
    return;
  }

  // Vérifier le statut
  if (machine.statut !== "disponible") {
    errors.push({
      immat,
      raison: `Machine au statut "${machine.statut}" — pricing non applicable`,
      source,
    });
    return;
  }

  // Récupérer les prix selon l'onglet
  const prixFrKey = isRepricer ? "Nouveau Prix FR (à remplir)" : "Prix FR (à remplir)";
  const prixExportKey = isRepricer
    ? "Nouveau Prix Export (à remplir)"
    : "Prix Export (à remplir)";

  const prixFrRaw = row[prixFrKey];
  const prixExportRaw = row[prixExportKey];

  const prixFr = parsePrice(prixFrRaw);
  const prixExport = parsePrice(prixExportRaw);

  if (prixFr === null && prixExport === null) {
    errors.push({
      immat,
      raison: "Aucun prix renseigné (Prix FR et Prix Export vides)",
      source,
    });
    return;
  }

  if (prixFr !== null && prixFr < 0) {
    errors.push({ immat, raison: "Prix FR négatif", source });
    return;
  }
  if (prixExport !== null && prixExport < 0) {
    errors.push({ immat, raison: "Prix Export négatif", source });
    return;
  }

  success.push({
    immat,
    prixFr: prixFr === null ? undefined : prixFr,
    prixExport: prixExport === null ? undefined : prixExport,
    source,
  });
}

function parsePrice(raw: any): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw);
  const cleaned = String(raw).replace(/[\s€]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n);
}