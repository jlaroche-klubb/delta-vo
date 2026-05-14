import * as XLSX from "xlsx";
import { Machine } from "../types/machine";

interface ExportStatsOptions {
  machines: Machine[];
  periodeLabel: string;
}

export function exportStatsToExcel({ machines, periodeLabel }: ExportStatsOptions) {
  if (machines.length === 0) {
    alert("Aucune donnée à exporter pour cette période.");
    return;
  }

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: "Delta VO — Stats de vente",
    Subject: `Statistiques ${periodeLabel}`,
    Author: "Delta VO",
    CreatedDate: new Date(),
  };

  // ════════ ONGLET 1 : DÉTAIL DES VENTES ════════
  const rows = machines.map((m) => ({
    "Immatriculation": m.immat,
    "Type nacelle": m.type_nacelle,
    "Modèle porteur": m.modele_porteur,
    "Acheteur": m.acheteur || "",
    "Commercial": m.commercial_vendeur || "",
    "Marché": m.marche === "dealer" ? "Dealer" : "France",
    "Prix de vente (€)": m.prix_vente_final || 0,
    "Date vente": m.date_vente || "",
    "Date facturation": m.date_facturation || "",
    "N° facture": m.numero_facture || "",
    "Date règlement": m.date_reglement || "",
    "Statut paiement": m.date_reglement ? "Payée" : "En attente",
  }));

  const ws1 = XLSX.utils.json_to_sheet(rows);
  ws1["!cols"] = [
    { wch: 14 },{ wch: 12 },{ wch: 18 },{ wch: 24 },{ wch: 20 },
    { wch: 10 },{ wch: 16 },{ wch: 12 },{ wch: 14 },{ wch: 14 },
    { wch: 14 },{ wch: 14 },
  ];
  styleHeader(ws1, 12);
  XLSX.utils.book_append_sheet(wb, ws1, "Détail ventes");

  // ════════ ONGLET 2 : SYNTHÈSE PAR COMMERCIAL ════════
  const parCommercial = new Map<string, { ca: number; nb: number; fr: number; dealer: number }>();
  machines.forEach((m) => {
    const com = m.commercial_vendeur || "Non renseigné";
    if (!parCommercial.has(com)) {
      parCommercial.set(com, { ca: 0, nb: 0, fr: 0, dealer: 0 });
    }
    const stat = parCommercial.get(com)!;
    stat.ca += m.prix_vente_final || 0;
    stat.nb += 1;
    if (m.marche === "dealer") stat.dealer += 1;
    else stat.fr += 1;
  });

  const rowsCom = Array.from(parCommercial.entries())
    .map(([com, stat]) => ({
      "Commercial": com,
      "Nb ventes": stat.nb,
      "Ventes France": stat.fr,
      "Ventes Dealer": stat.dealer,
      "CA total (€)": stat.ca,
      "Prix moyen (€)": Math.round(stat.ca / stat.nb),
    }))
    .sort((a, b) => b["CA total (€)"] - a["CA total (€)"]);

  const ws2 = XLSX.utils.json_to_sheet(rowsCom);
  ws2["!cols"] = [{ wch: 24 },{ wch: 12 },{ wch: 14 },{ wch: 14 },{ wch: 16 },{ wch: 16 }];
  styleHeader(ws2, 6);
  XLSX.utils.book_append_sheet(wb, ws2, "Par commercial");

  // ════════ ONGLET 3 : SYNTHÈSE PAR MOIS ════════
  const parMois = new Map<string, { ca: number; nb: number }>();
  machines.forEach((m) => {
    if (!m.date_facturation) return;
    const mois = m.date_facturation.slice(0, 7); // YYYY-MM
    if (!parMois.has(mois)) parMois.set(mois, { ca: 0, nb: 0 });
    const stat = parMois.get(mois)!;
    stat.ca += m.prix_vente_final || 0;
    stat.nb += 1;
  });

  const rowsMois = Array.from(parMois.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mois, stat]) => ({
      "Mois": mois,
      "Nb ventes": stat.nb,
      "CA (€)": stat.ca,
      "Prix moyen (€)": Math.round(stat.ca / stat.nb),
    }));

  const ws3 = XLSX.utils.json_to_sheet(rowsMois);
  ws3["!cols"] = [{ wch: 14 },{ wch: 12 },{ wch: 16 },{ wch: 16 }];
  styleHeader(ws3, 4);
  XLSX.utils.book_append_sheet(wb, ws3, "Par mois");

  const today = new Date().toISOString().slice(0, 10);
  const filename = `delta-vo_stats_${today}.xlsx`;
  XLSX.writeFile(wb, filename);
}

function styleHeader(ws: XLSX.WorkSheet, nbCols: number) {
  for (let c = 0; c < nbCols; c++) {
    const cellRef = XLSX.utils.encode_cell({ c, r: 0 });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: { fgColor: { rgb: "1A2A6E" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
  }
}