import * as XLSX from "xlsx";
import { Machine, calculAgeStock } from "../types/machine";

interface ExportPricingOptions {
  machines: Machine[];
  seuilRepricer?: number;
}

export function exportPricingToExcel({ machines, seuilRepricer = 60 }: ExportPricingOptions) {
  // Filtrer uniquement les machines disponibles
  const disponibles = machines.filter((m) => m.statut === "disponible");

  // Séparer en 2 catégories
  const aPricer = disponibles.filter(
    (m) => m.prix_fr === undefined && m.prix_dealer === undefined
  );

  const aRepricer = disponibles.filter(
    (m) =>
      (m.prix_fr !== undefined || m.prix_dealer !== undefined) &&
      m.date_mise_stock &&
      calculAgeStock(m.date_mise_stock) > seuilRepricer
  );

  if (aPricer.length === 0 && aRepricer.length === 0) {
    alert("Aucune machine à pricer ou repricer pour le moment.");
    return;
  }

  // Créer le workbook
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: "Delta VO — Pricing",
    Subject: "Tarification machines d'occasion",
    Author: "Delta VO",
    CreatedDate: new Date(),
  };

  // ════════ ONGLET 1 : À PRICER ════════
  if (aPricer.length > 0) {
    const rows1 = aPricer.map((m) => ({
      "Immatriculation": m.immat,
      "Type nacelle": m.type_nacelle,
      "Modèle porteur": m.modele_porteur,
      "Mise en circulation": m.annee_circulation,
      "Km porteur": m.km_porteur ?? "",
      "Heures nacelle": m.heures_nacelle ?? "",
      "Total retenue HT (info)": m.rapport_expertise?.total_retenue_ht ?? "",
      "VNC (à remplir)": "",
      "Prix FR (à remplir)": "",
      "Prix Dealer (à remplir)": "",
    }));

    const ws1 = XLSX.utils.json_to_sheet(rows1);

    // Largeurs de colonnes
    ws1["!cols"] = [
      { wch: 16 },  // Immat
      { wch: 13 },  // Type
      { wch: 18 },  // Modèle
      { wch: 18 },  // Mise circulation
      { wch: 13 },  // Km
      { wch: 14 },  // Heures
      { wch: 20 },  // Total retenue
      { wch: 18 },  // VNC
      { wch: 20 },  // Prix FR
      { wch: 22 },  // Prix Dealer
    ];

    // Mise en forme header (bleu Delta)
    styleHeader(ws1, 10);
    // Mise en forme colonnes à remplir (jaune)
    styleFillableCols(ws1, [7, 8, 9], rows1.length);

    XLSX.utils.book_append_sheet(wb, ws1, "À pricer");
  }

  // ════════ ONGLET 2 : À REPRICER ════════
  if (aRepricer.length > 0) {
    const rows2 = aRepricer.map((m) => {
      const age = m.date_mise_stock ? calculAgeStock(m.date_mise_stock) : 0;
      return {
        "Immatriculation": m.immat,
        "Type nacelle": m.type_nacelle,
        "Modèle porteur": m.modele_porteur,
        "Mise en circulation": m.annee_circulation,
        "Km porteur": m.km_porteur ?? "",
        "Heures nacelle": m.heures_nacelle ?? "",
        "Âge stock (jours)": age,
        "Prix FR actuel": m.prix_fr ?? "",
        "Prix Dealer actuel": m.prix_dealer ?? "",
        "VNC (à remplir)": "",
        "Nouveau Prix FR (à remplir)": "",
        "Nouveau Prix Dealer (à remplir)": "",
      };
    });

    const ws2 = XLSX.utils.json_to_sheet(rows2);

    ws2["!cols"] = [
      { wch: 16 },  // Immat
      { wch: 13 },  // Type
      { wch: 18 },  // Modèle
      { wch: 18 },  // Mise circulation
      { wch: 13 },  // Km
      { wch: 14 },  // Heures
      { wch: 16 },  // Âge stock
      { wch: 16 },  // Prix FR actuel
      { wch: 18 },  // Prix Dealer actuel
      { wch: 18 },  // VNC
      { wch: 26 },  // Nouveau Prix FR
      { wch: 28 },  // Nouveau Prix Dealer
    ];

    styleHeader(ws2, 12);
    styleFillableCols(ws2, [9, 10, 11], rows2.length);

    XLSX.utils.book_append_sheet(wb, ws2, "À repricer");
  }

  // Nom du fichier
  const today = new Date().toISOString().slice(0, 10);
  const filename = `delta-vo_pricing_${today}.xlsx`;

  XLSX.writeFile(wb, filename);
}

// Met en forme la ligne d'en-tête (fond bleu Delta + texte blanc gras)
function styleHeader(ws: XLSX.WorkSheet, nbCols: number) {
  for (let c = 0; c < nbCols; c++) {
    const cellRef = XLSX.utils.encode_cell({ c, r: 0 });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "1A2A6E" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "FFFFFF" } },
        bottom: { style: "thin", color: { rgb: "FFFFFF" } },
        left: { style: "thin", color: { rgb: "FFFFFF" } },
        right: { style: "thin", color: { rgb: "FFFFFF" } },
      },
    };
  }
}

// Met en forme les colonnes à remplir (fond jaune)
function styleFillableCols(ws: XLSX.WorkSheet, colIndexes: number[], nbRows: number) {
  for (let r = 1; r <= nbRows; r++) {
    for (const c of colIndexes) {
      const cellRef = XLSX.utils.encode_cell({ c, r });
      if (!ws[cellRef]) {
        // Créer la cellule vide si elle n'existe pas
        ws[cellRef] = { t: "s", v: "" };
      }
      ws[cellRef].s = {
        fill: { fgColor: { rgb: "FFF4CC" } },
        border: {
          top: { style: "thin", color: { rgb: "E5B800" } },
          bottom: { style: "thin", color: { rgb: "E5B800" } },
          left: { style: "thin", color: { rgb: "E5B800" } },
          right: { style: "thin", color: { rgb: "E5B800" } },
        },
        alignment: { horizontal: "right", vertical: "center" },
      };
    }
  }
}