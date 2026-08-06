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

  if (
    rows.length > 0 &&
    !rows.some((r) => Object.keys(r).some((k) => {
      const kk = k.replace(/\s+/g, " ").trim().toUpperCase();
      return kk.startsWith("VNC") || kk.startsWith("VR OU VNC");
    }))
  ) {
    throw new Error(
      "Le fichier ne correspond pas au modèle (colonne « VNC » ou « VR OU VNC EUR » introuvable). Utilisez le fichier du parc envoyé à la compta."
    );
  }

  const success: VncImportResult["success"] = [];
  const errors: VncImportResult["errors"] = [];

  // Lecture tolérante des en-têtes : accepte le format VOG (« IMMAT »,
  // « N° OCCASION », « VR OU VNC EUR ») comme l'ancien format VNC
  const getCol = (row: any, ...candidats: string[]): any => {
    for (const k of Object.keys(row)) {
      const kk = k.replace(/\s+/g, " ").trim().toUpperCase();
      if (candidats.some((c) => kk === c || kk.startsWith(c))) return row[k];
    }
    return undefined;
  };

  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const immat = String(getCol(row, "IMMAT", "IMMATRICULATION") ?? "").trim().toUpperCase();
    const occasion = String(getCol(row, "N° OCCASION") ?? "").trim().replace(/\.0$/, "");
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

    const raw = getCol(row, "VNC", "VR OU VNC");
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
/** Colonnes date du fichier VOG (vraies cellules Excel, format jj/mm/aaaa) */
export const VOG_DATE_COLS = ["Data ajout vog", "Date de mise en service", "Date prix de vente"];

/** "2026-08-05", "05/08/2026" ou n° de série Excel ("45307", legs de l'import
 *  VOG initial) → Date Excel ; sinon la valeur brute (texte) */
function toExcelDate(v?: string): Date | string {
  const s = String(v || "").trim();
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 80000) {
    return new Date(Math.round((n - 25569) * 86400000)); // série Excel -> date
  }
  return s;
}

export function buildVogRow(m: Machine): Record<string, any> {
  // Marque / Porteur : le VOG les sépare, Delta VO les stocke combinés
  const mp = (m.modele_porteur || "").trim();
  const marque = mp.split(" ")[0] || "";
  const porteur = mp.split(" ").slice(1).join(" ");
  return {
    "Dossier Delta ou KLUBB France": m.numero_dossier || "",
    "N° OCCASION": m.numero_occasion || "", // vide = à attribuer par l'ADV
    "Propriétaire": m.proprietaire || "",
    "Fiche d'occasion": m.fiche_occasion_vog || "",
    "Data ajout vog": toExcelDate(m.date_ajout_vog),
    "Carte grise": m.carte_grise_vog || "",
    "VL / PL /TR": m.categorie_vehicule || "",
    "N° de cube": m.numero_cube || "",
    "IMMAT": m.immat || "",
    "Vérification HISTOVEC": m.histovec || "",
    "N° de châssis": m.num_chassis || "",
    "Etat général extérieur": m.etat_exterieur || "",
    "Etat de la nacelle": m.etat_nacelle_vog || "",
    "Etat": m.etat_note_vog || "",
    "Date de mise en service": toExcelDate(m.date_mise_en_service),
    "Année de mise en service": m.annee_circulation || "",
    "Marque porteur": marque,
    "Porteur": porteur,
    "Type nacelle": m.type_nacelle || "",
    "KM porteur": m.km_porteur ?? (m.km_note || ""),
    "Heures de la nacelle": m.heures_nacelle ?? (m.heures_note || ""),
    "Lieu de stockage du véhicule": m.localite || "",
    // 💶 Montant de la retenue d'expertise (aide à la décision de prix du PDG)
    "Montant expertise VO (€)": m.rapport_expertise?.total_retenue_ht ?? "",
    "PRIX DE VENTE HT": m.prix_fr ?? "", // ← rempli / révisé par le PDG
    "Date prix de vente": toExcelDate(m.prix_modifie_le || m.date_prix_vog),
    "VR OU VNC EUR": m.vr_vnc ?? "", // ← rempli / mis à jour par la COMPTA
    "Mascus": m.diffusion?.mascus || "",
    "ViaMobilis": m.diffusion?.viamobilis || "",
    "Site Delta": m.diffusion?.site_delta || "",
    "Klubb.com": m.diffusion?.klubb_com || "",
    "Klubb France": m.diffusion?.klubb_france || "",
    "LOT": m.diffusion?.lot || "",
  };
}

export function exportVncToExcel(machines: Machine[]) {
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}`;

  // Tout le parc actif : les restitutions en cours y figurent aussi, pour que
  // l'ADV leur ATTRIBUE leur N° occasion (colonne vide à compléter) en même
  // temps qu'elle vérifie la cohérence du fichier.
  const actives = machines.filter((m) => !m.archived);
  const rows = actives
    .map(buildVogRow)
    .sort((a, b) => String(a["N° OCCASION"]).localeCompare(String(b["N° OCCASION"]), "fr", { numeric: true }));

  const ws = XLSX.utils.json_to_sheet(rows, { cellDates: true });
  ws["!cols"] = Object.keys(rows[0] || {}).map((k) => ({ wch: Math.max(12, Math.min(24, k.length + 2)) }));
  // 📅 Colonnes date : vraies cellules Excel au format français jj/mm/aaaa
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let C = range.s.c; C <= range.e.c; C++) {
    const header = ws[XLSX.utils.encode_cell({ r: 0, c: C })]?.v;
    if (!VOG_DATE_COLS.includes(String(header))) continue;
    for (let R = 1; R <= range.e.r; R++) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.v instanceof Date) { cell.t = "d"; cell.z = "dd/mm/yyyy"; }
    }
  }
  const wb = XLSX.utils.book_new();
  // ⚠ Nom de feuille « Liste complète » : le fichier se réimporte tel quel
  // via « Import du stock VOG » (compta → VNC, PDG → prix, ADV → N° occasion)
  XLSX.utils.book_append_sheet(wb, ws, "Liste complète");
  XLSX.writeFile(wb, `delta-vo_parc-vog_${dateStr}.xlsx`);
}
