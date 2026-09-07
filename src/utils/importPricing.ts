import * as XLSX from "xlsx";
import { Machine } from "../types/machine";

export interface ImportResult {
  success: ImportSuccess[];
  errors: ImportError[];
  totalRows: number;
  /** Lignes dont le prix est identique à celui déjà en base (fichier renvoyé tel quel) */
  inchangees?: number;
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

  // 📄 On lit TOUTES les feuilles du classeur : le fichier Pricing PDG contient
  // désormais « Prix à faire » et « Prix à revoir » (l'ancien format mono-feuille
  // « Pricing PDG » reste accepté).
  const rows: any[] = [];
  for (const sheetName of wb.SheetNames) {
    // 📊 La feuille « Marché internet » est une synthèse (pas de machines)
    if (/^march/i.test(sheetName.trim())) continue;
    rows.push(...XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]));
  }

  const success: ImportSuccess[] = [];
  const errors: ImportError[] = [];
  const stats = { inchangees: 0 };

  // Vérifier que le fichier ressemble bien au modèle (colonnes de prix présentes)
  if (rows.length > 0) {
    const aLesColonnes = rows.some((r) => {
      const cols = Object.keys(r);
      return cols.includes("Prix France HT (€)") || cols.includes("Prix Dealer HT (€)");
    });
    if (!aLesColonnes) {
      throw new Error(
        "Le fichier ne correspond pas au modèle Pricing PDG (colonnes « Prix France HT (€) » / « Prix Dealer HT (€) » introuvables). Utilisez le fichier exporté depuis « Export Pricing PDG »."
      );
    }
  }

  // 📄 Lignes de titre de groupe (« ── K26 · 5 machine(s) ── »), lignes vides
  // et ligne de pied du fichier : ni immat, ni N° occasion, ni prix → ignorées
  // silencieusement (ce ne sont pas des machines).
  const lignesMachines = rows.filter((r) => {
    const immat = String(r["Immatriculation"] || "").trim();
    const occ = String(r["N° occasion"] || "").trim();
    const prix = r["Prix France HT (€)"] ?? r["Prix Dealer HT (€)"];
    return immat || occ || (prix !== undefined && prix !== "");
  });

  lignesMachines.forEach((row, idx) => {
    processRow(row, idx + 2, machines, success, errors, stats);
  });

  return { success, errors, totalRows: lignesMachines.length, inchangees: stats.inchangees };
}

function processRow(
  row: any,
  rowNum: number,
  machines: Machine[],
  success: ImportSuccess[],
  errors: ImportError[],
  stats: { inchangees: number }
) {
  const immat = String(row["Immatriculation"] || "").trim().toUpperCase();
  // 🏷️ Correspondance par immat OU par N° occasion (référence commerciale)
  const occasion = String(row["N° occasion"] || "").trim().replace(/\.0$/, "");

  if (!immat && !occasion) {
    errors.push({ immat: `Ligne ${rowNum}`, raison: "Ni immatriculation ni N° occasion", source: SOURCE });
    return;
  }

  const machine = machines.find(
    (m) =>
      (immat && m.immat.toUpperCase() === immat) ||
      (occasion && m.numero_occasion === occasion)
  );
  if (!machine) {
    errors.push({
      immat: immat || `occasion ${occasion}`,
      raison: `Machine introuvable dans Delta VO (ligne ${rowNum})`,
      source: SOURCE,
    });
    return;
  }

  // Même périmètre que l'export : disponible OU restitution dont l'expertise est validée
  const perimetreOk =
    machine.statut === "disponible" ||
    (machine.statut === "restitution" && machine.expertise_recue && machine.expertise_ok);
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
      immat: machine.immat,
      raison: "Aucun nouveau prix renseigné — ligne ignorée",
      source: SOURCE,
    });
    return;
  }

  // ♻️ Fichier renvoyé avec les prix déjà faits pré-remplis : une ligne dont
  // les prix n'ont pas bougé n'est ni une mise à jour ni une erreur.
  const memeFr = prixFr === null || prixFr === (machine.prix_fr ?? null);
  const memeDealer = prixDealer === null || prixDealer === (machine.prix_dealer ?? null);
  if (memeFr && memeDealer) {
    stats.inchangees++;
    return;
  }

  if (prixFr !== null && prixFr < 0) {
    errors.push({ immat: machine.immat, raison: "Prix France HT négatif", source: SOURCE });
    return;
  }
  if (prixDealer !== null && prixDealer < 0) {
    errors.push({ immat: machine.immat, raison: "Prix Dealer HT négatif", source: SOURCE });
    return;
  }

  success.push({
    // ⚠ Toujours l'immat de la machine TROUVÉE : l'application des prix
    // (DisponiblesPage) retrouve la machine par cette valeur.
    immat: machine.immat,
    // Seuls les prix réellement modifiés sont appliqués
    prixFr: memeFr ? undefined : prixFr!,
    prixDealer: memeDealer ? undefined : prixDealer!,
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
