import * as XLSX from "xlsx";
import { Machine } from "../types/machine";

interface ExportPricingOptions {
  machines: Machine[];
  seuilRepricer?: number; // conservé pour compatibilité avec l'appelant (non utilisé)
}

/**
 * Export Pricing PDG
 * Même format que l'export Liste de prix, avec en plus :
 *   - Montant expertise VO (repris du rapport d'expertise)
 *   - VNC (case vide à remplir par le PDG)
 *   - Prix Dealer HT et Prix France HT (valeur actuelle ou vide à remplir)
 * Périmètre identique à la page Disponibles (statut "disponible"
 * ou restitution dont l'expertise est validée).
 */
export function exportPricingToExcel({ machines }: ExportPricingOptions) {
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}`;

  const disponibles = machines.filter(
    (m) => m.statut === "disponible" || (m.statut === "restitution" && m.expertise_ok)
  );

  if (disponibles.length === 0) {
    alert("Aucune machine disponible à exporter.");
    return;
  }

  const rows = disponibles.map((m) => {
    const row: any = {
      "N° Dossier": m.numero_dossier || "",
      Immatriculation: m.immat || "",
      "Type nacelle": m.type_nacelle || "",
      "Modèle porteur": m.modele_porteur || "",
      "Mise en circulation": m.annee_circulation || "",
      "Heures nacelle": m.heures_nacelle ?? "",
      "Km porteur": m.km_porteur ?? "",
      "Montant expertise VO (€)": m.rapport_expertise?.total_retenue_ht ?? "",
      "VNC (€)": "",
      "Prix Dealer HT (€)": m.prix_dealer ?? "",
      "Prix France HT (€)": m.prix_fr ?? "",
    };

    if (m.date_mise_stock) {
      row["Disponible depuis"] = m.date_mise_stock;
    }

    return row;
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 12 }, // N° Dossier
    { wch: 15 }, // Immat
    { wch: 12 }, // Type nacelle
    { wch: 20 }, // Modèle porteur
    { wch: 15 }, // Mise en circulation
    { wch: 12 }, // Heures
    { wch: 12 }, // Km
    { wch: 20 }, // Montant expertise VO
    { wch: 14 }, // VNC
    { wch: 16 }, // Prix Dealer
    { wch: 16 }, // Prix FR
    { wch: 15 }, // Dispo depuis
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pricing PDG");

  XLSX.writeFile(wb, `DeltaVO_PricingPDG_${dateStr}.xlsx`);
}
