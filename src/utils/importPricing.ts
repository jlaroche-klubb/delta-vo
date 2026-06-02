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
  prixDealer?: number;
  source: string;
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

const SOURCE = "Pricing PDG";

export async function importPricingFromExcel({
  file,
  machines,
}: ImportOptions): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  if (wb.SheetNames.length === 0) {
    throw new Error("Le fichier Excel est vide.");
  }

  // On lit l'onglet "Pricing PDG" ; à défaut, le premier onglet du classeur
  // (tolérant si l'onglet a été renommé en l'enregistrant).
  const sheetName = wb.SheetNames.includes(SOURCE) ? SOURCE : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any>(ws);

  const success: ImportSuccess[] = [];
  const errors: ImportError[] = [];

  // Vérifier que le fichier ressemble bien au modèle (colonnes de prix présentes)
  if (rows.length > 0) {
    const cols = Object.keys(rows[0]);
    const aLesColonnes =
      cols.includes("Prix France HT (€)") || cols.includes("Prix Dealer HT (€)");
    if (!aLesColonnes) {
      throw new Error(
        "Le fichier ne correspond pas au modèle Pricing PDG (colonnes « Prix France HT (€) » / « Prix Dealer HT (€) » introuvables). Utilisez le fichier exporté depuis « Export Pricing PDG »."
      );
    }
  }

  rows.forEach((row, idx) => {
    processRow(row, idx + 2, machines, success, errors);
  });

  return { success, errors, totalRows: rows.length };
}

function processRow(
  row: any,
  rowNum: number,
  machines: Machine[],
  success: ImportSuccess[],
  errors: ImportError[]
) {
  const immat = String(row["Immatriculation"] || "").trim().toUpperCase();

  if (!immat) {
    errors.push({ immat: `Ligne ${rowNum}`, raison: "Immatriculation manquante", source: SOURCE });
    return;
  }

  const machine = machines.find((m) => m.immat.toUpperCase() === immat);
  if (!machine) {
    errors.push({
      immat,
      raison: `Immatriculation introuvable dans Delta VO (ligne ${rowNum})`,
      source: SOURCE,
    });
    return;
  }

  // Même périmètre que l'export : disponible OU restitution dont l'expertise est validée
  const perimetreOk =
    machine.statut === "disponible" ||
    (machine.statut === "restitution" && machine.expertise_ok);
  if (!perimetreOk) {
    errors.push({
      immat,
      raison: `Machine au statut "${machine.statut}" — pricing non applicable`,
      source: SOURCE,
    });
    return;
  }

  const prixFr = parsePrice(row["Prix France HT (€)"]);
  const prixDealer = parsePrice(row["Prix Dealer HT (€)"]);

  if (prixFr === null && prixDealer === null) {
    errors.push({
      immat,
      raison: "Aucun prix renseigné (Prix France HT et Prix Dealer HT vides)",
      source: SOURCE,
    });
    return;
  }

  if (prixFr !== null && prixFr < 0) {
    errors.push({ immat, raison: "Prix France HT négatif", source: SOURCE });
    return;
  }
  if (prixDealer !== null && prixDealer < 0) {
    errors.push({ immat, raison: "Prix Dealer HT négatif", source: SOURCE });
    return;
  }

  success.push({
    immat,
    prixFr: prixFr === null ? undefined : prixFr,
    prixDealer: prixDealer === null ? undefined : prixDealer,
    source: SOURCE,
  });
}

function parsePrice(raw: any): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "number") return Math.round(raw);
  const cleaned = String(raw).replace(/[\s€]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.round(n);
}
