import * as XLSX from "xlsx";
import { Machine } from "../types/machine";
import { horsVenteVog } from "./nacelles";

interface ExportPricingOptions {
  machines: Machine[];
  seuilRepricer?: number; // seuil (jours) au-delà duquel un prix est « à revoir »
}

/**
 * Export Pricing PDG — DEUX feuilles (circuit VNC/prix validé avec Jonathan) :
 *   1. « Prix à faire »  : machines actives SANS prix de vente
 *   2. « Prix à revoir » : prix présent mais trop vieux (> seuil jours) —
 *      date du prix (prix_modifie_le / date_prix_vog) absente ou dépassée
 *
 * Chaque feuille montre la VNC ACTUELLE (mise à jour par la compta via
 * l'import VNC) pour éclairer la décision de prix, et une colonne
 * « Prix France HT (€) » / « Prix Dealer HT (€) » à remplir par le PDG.
 *
 * ⚠ Document INTERNE (PDG) : l'immatriculation y figure — la règle
 * « N° occasion sans immat » ne s'applique qu'aux documents externes
 * (liste de prix, fiches VO).
 *
 * Le fichier renvoyé par le PDG se réimporte tel quel via « Import Pricing »
 * (les deux feuilles sont lues, correspondance par immat ou N° occasion).
 */
export function exportPricingToExcel({ machines, seuilRepricer = 60 }: ExportPricingOptions) {
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}`;

  const actives = machines.filter(
    (m) =>
      !m.archived &&
      // 🚚 Disponibilité VOG ≠ OK (location, prêt, vente en cours…) : hors
      // vente, donc hors pricing PDG
      !horsVenteVog(m) &&
      (m.statut === "disponible" || (m.statut === "restitution" && m.expertise_ok))
  );

  if (actives.length === 0) {
    alert("Aucune machine disponible à exporter.");
    return;
  }

  const datePrix = (m: Machine): string => m.prix_modifie_le || m.date_prix_vog || "";
  const prixTropVieux = (m: Machine): boolean => {
    const d = datePrix(m);
    if (!d) return true; // prix sans date -> à revoir
    const age = (now.getTime() - new Date(d).getTime()) / 86400000;
    return age > seuilRepricer;
  };

  const aFaire = actives.filter((m) => m.prix_fr == null);
  const aRevoir = actives.filter((m) => m.prix_fr != null && prixTropVieux(m));

  const toRow = (m: Machine) => ({
    "N° occasion": m.numero_occasion || "",
    "Immatriculation": m.immat || "",
    "N° Dossier": m.numero_dossier || "",
    "Type nacelle": m.type_nacelle || "",
    "Modèle porteur": m.modele_porteur || "",
    "Mise en circulation": m.annee_circulation || "",
    "Heures nacelle": m.heures_nacelle ?? "",
    "Km porteur": m.km_porteur ?? "",
    "Localisation": m.localite || "",
    "Montant expertise VO (€)": m.rapport_expertise?.total_retenue_ht ?? "",
    "VNC (€)": m.vr_vnc ?? "",
    "Prix actuel HT (€)": m.prix_fr ?? "",
    "Date du prix": datePrix(m),
    "Prix France HT (€)": "",
    "Prix Dealer HT (€)": m.prix_dealer ?? "",
    "Disponible depuis": m.date_mise_stock || "",
  });

  const cols = [
    { wch: 12 }, // N° occasion
    { wch: 13 }, // Immat
    { wch: 12 }, // N° Dossier
    { wch: 14 }, // Type nacelle
    { wch: 20 }, // Modèle porteur
    { wch: 14 }, // Mise en circulation
    { wch: 12 }, // Heures
    { wch: 12 }, // Km
    { wch: 12 }, // Localisation
    { wch: 20 }, // Montant expertise VO
    { wch: 12 }, // VNC
    { wch: 15 }, // Prix actuel
    { wch: 12 }, // Date du prix
    { wch: 16 }, // Prix France (à remplir)
    { wch: 16 }, // Prix Dealer
    { wch: 15 }, // Dispo depuis
  ];

  const wb = XLSX.utils.book_new();
  const wsFaire = XLSX.utils.json_to_sheet(aFaire.map(toRow));
  wsFaire["!cols"] = cols;
  XLSX.utils.book_append_sheet(wb, wsFaire, "Prix à faire");
  const wsRevoir = XLSX.utils.json_to_sheet(aRevoir.map(toRow));
  wsRevoir["!cols"] = cols;
  XLSX.utils.book_append_sheet(wb, wsRevoir, "Prix à revoir");

  XLSX.writeFile(wb, `delta-vo_pricing-pdg_${dateStr}.xlsx`);
}
