import * as XLSX from "xlsx";
import { Machine } from "../types/machine";
import { UserRole } from "../types";

/**
 * Export de la liste de prix commerciale
 * Filtre les prix selon le rôle (vendeur FR = prix FR, dealer = Prix Dealer)
 */
export function exportListePrix(machines: Machine[], userRole: UserRole) {
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}`;

  // Filtrer uniquement les machines avec prix
  const machinesAvecPrix = machines.filter(
    (m) => m.prix_fr !== undefined || m.prix_dealer !== undefined
  );

  if (machinesAvecPrix.length === 0) {
    alert("Aucune machine avec prix à exporter");
    return;
  }

  // Déterminer quels prix afficher selon le rôle
  const showPrixFR = ["admin", "secretaire", "vendeur_fr"].includes(userRole);
  const showprixDealer= ["admin", "secretaire", "dealer"].includes(userRole);

  // Préparer les données
  const rows = machinesAvecPrix.map((m) => {
    const row: any = {
      Immatriculation: m.immat || "",
      "Type nacelle": m.type_nacelle || "",
      "Modèle porteur": m.modele_porteur || "",
      "Mise en circulation": m.annee_circulation || "",
      "Heures nacelle": m.heures_nacelle ?? "",
      "Km porteur": m.km_porteur ?? "",
    };

    // Ajouter les prix selon les permissions
    if (showPrixFR && m.prix_fr !== undefined) {
      row["Prix France HT (€)"] = m.prix_fr;
    }
    if (showprixDealer&& m.prix_dealer !== undefined) {
      row["Prix Dealer HT (€)"] = m.prix_dealer;
    }

    // Date mise en stock
    if (m.date_mise_stock) {
      row["Disponible depuis"] = m.date_mise_stock;
    }

    return row;
  });

  // Créer le workbook
  const ws = XLSX.utils.json_to_sheet(rows);

  // Largeurs colonnes
  const colWidths = [
    { wch: 15 }, // Immat
    { wch: 12 }, // Type nacelle
    { wch: 20 }, // Modèle porteur
    { wch: 15 }, // Mise en circulation
    { wch: 12 }, // Heures
    { wch: 12 }, // Km
  ];

  if (showPrixFR) colWidths.push({ wch: 15 }); // Prix FR
  if (showPrixDealer) colWidths.push({ wch: 15 }); // Prix Dealer
  colWidths.push({ wch: 15 }); // Dispo depuis

  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Liste Prix");

  // Nom du fichier selon le rôle
  let fileName = `DeltaVO_ListePrix_${dateStr}`;
  if (userRole === "vendeur_fr") fileName += "_FR";
  if (userRole === "dealer") fileName += "_Dealer";
  fileName += ".xlsx";

  XLSX.writeFile(wb, fileName);
}
