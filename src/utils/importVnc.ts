import * as XLSX from "xlsx";
import { Machine } from "../types/machine";

// ============================================================
// IMPORT VNC — fichier renvoyé par le SERVICE COMPTA.
// ============================================================
// Circuit (validé avec Jonathan) :
//   1. Tous les 15 jours, la compta reçoit automatiquement le fichier du parc
//      avec la colonne « VNC (€) » (cron Nacelle Expert /api/cron-vnc-compta)
//   2. Elle met à jour les VNC et renvoie le fichier à l'ADV
//   3. L'ADV l'importe ici (bouton « Import VNC ») puis vérifie la cohérence
//   4. L'ADV génère ensuite l'export « Pricing PDG » (prix à faire / à revoir,
//      VNC visibles) pour la décision de prix du PDG
//
// Correspondance par immatriculation OU N° occasion. Seule la VNC est
// modifiée : aucun autre champ n'est touché.

export interface VncImportResult {
  success: { immat: string; ancienne?: number; nouvelle: number }[];
  errors: { ref: string; raison: string }[];
  totalRows: number;
}

export async function parseVncExcel(file: File, machines: Machine[]): Promise<VncImportResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  if (wb.SheetNames.length === 0) throw new Error("Le fichier Excel est vide.");

  const rows: any[] = [];
  for (const sheetName of wb.SheetNames) {
    rows.push(...XLSX.utils.sheet_to_json<any>(wb.Sheets[sheetName]));
  }

  if (rows.length > 0 && !rows.some((r) => Object.keys(r).some((k) => k.trim().startsWith("VNC")))) {
    throw new Error(
      "Le fichier ne correspond pas au modèle VNC (colonne « VNC (€) » introuvable). Utilisez le fichier envoyé à la compta."
    );
  }

  const success: VncImportResult["success"] = [];
  const errors: VncImportResult["errors"] = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const immat = String(row["Immatriculation"] || "").trim().toUpperCase();
    const occasion = String(row["N° occasion"] || "").trim().replace(/\.0$/, "");
    if (!immat && !occasion) {
      errors.push({ ref: `Ligne ${rowNum}`, raison: "Ni immatriculation ni N° occasion" });
      return;
    }

    const machine = machines.find(
      (m) =>
        (immat && m.immat.toUpperCase() === immat) ||
        (occasion && m.numero_occasion === occasion)
    );
    if (!machine) {
      errors.push({ ref: immat || `occasion ${occasion}`, raison: `Machine introuvable (ligne ${rowNum})` });
      return;
    }

    const vncKey = Object.keys(row).find((k) => k.trim().startsWith("VNC"));
    const raw = vncKey ? row[vncKey] : undefined;
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      errors.push({ ref: machine.immat, raison: "VNC vide — ligne ignorée" });
      return;
    }
    const vnc = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[\s€]/g, "").replace(",", "."));
    if (isNaN(vnc) || vnc < 0) {
      errors.push({ ref: machine.immat, raison: `VNC illisible (« ${raw} »)` });
      return;
    }

    const arrondie = Math.round(vnc * 100) / 100;
    if (machine.vr_vnc === arrondie) {
      errors.push({ ref: machine.immat, raison: "VNC inchangée" });
      return;
    }
    success.push({ immat: machine.immat, ancienne: machine.vr_vnc, nouvelle: arrondie });
  });

  return { success, errors, totalRows: rows.length };
}

/**
 * 📤 Fichier VNC pour la compta (même format que l'envoi automatique du cron
 * Nacelle Expert — utile pour un envoi manuel hors calendrier).
 */
export function exportVncToExcel(machines: Machine[]) {
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}`;

  const actives = machines.filter((m) => !m.archived);
  const rows = actives.map((m) => ({
    "N° occasion": m.numero_occasion || "",
    "Immatriculation": m.immat || "",
    "N° de châssis": m.num_chassis || "",
    "Type nacelle": m.type_nacelle || "",
    "Modèle porteur": m.modele_porteur || "",
    "Date de mise en service": m.date_mise_en_service || "",
    "Mise en circulation": m.annee_circulation || "",
    "Propriétaire": m.proprietaire || "",
    "Catégorie": m.categorie_vehicule || "",
    "Prix de vente HT (€)": m.prix_fr ?? "",
    "VNC (€)": m.vr_vnc ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 13 }, { wch: 20 }, { wch: 14 }, { wch: 20 },
    { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "VNC");
  XLSX.writeFile(wb, `delta-vo_vnc-compta_${dateStr}.xlsx`);
}
