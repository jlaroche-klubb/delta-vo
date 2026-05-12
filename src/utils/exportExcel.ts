import * as XLSX from "xlsx";
import { Machine } from "../types/machine";

export function exportMachinesToExcel(machines: Machine[], filename = "delta-vo-restitutions") {
  // Préparer les données pour Excel
  const rows = machines.map((m) => {
    const etape = getCurrentStep(m);
    return {
      "Immatriculation": m.immat,
      "Type nacelle": m.type_nacelle,
      "Modèle porteur": m.modele_porteur,
      "Mise en circulation": m.annee_circulation,
      "Client précédent": m.client_precedent,
      "N° Contrat": m.contrat,
      "Date retour": formatDate(m.date_retour),
      "Heures nacelle": m.heures_nacelle ?? "",
      "Km porteur": m.km_porteur ?? "",
      "Agent expert": m.agent_expertise ?? "",
      "Étape actuelle": etape,
      "Date demande récupération": formatDate(m.date_demande_recuperation || ""),
      "Récupération OK": m.recuperation_ok ? "✓" : "",
      "Expertise OK": m.expertise_ok ? "✓" : "",
      "Facture émise": m.facture_ok ? "✓" : "",
      "Facture réglée": m.facture_reglee_ok ? "✓" : "",
      "Fiche VO créée": m.fiche_vo_creee ? "✓" : "",
      "Total retenue HT": m.rapport_expertise?.total_retenue_ht ?? "",
      "Nb dégâts": m.rapport_expertise?.degats.length ?? 0,
      "Statut": m.statut,
      "Créé le": formatDateTime(m.createdAt),
      "Mis à jour": formatDateTime(m.updatedAt || ""),
    };
  });

  // Créer le workbook
  const ws = XLSX.utils.json_to_sheet(rows);

  // Largeurs de colonnes (en caractères)
  ws["!cols"] = [
    { wch: 14 },  // Immat
    { wch: 12 },  // Type
    { wch: 18 },  // Modèle
    { wch: 14 },  // Mise circulation
    { wch: 28 },  // Client
    { wch: 16 },  // Contrat
    { wch: 12 },  // Date retour
    { wch: 13 },  // Heures
    { wch: 12 },  // Km
    { wch: 18 },  // Agent
    { wch: 22 },  // Étape
    { wch: 14 },  // Date demande
    { wch: 14 },  // Récup
    { wch: 12 },  // Expertise
    { wch: 12 },  // Facture
    { wch: 12 },  // Réglée
    { wch: 12 },  // Fiche VO
    { wch: 14 },  // Total
    { wch: 9 },   // Nb dégâts
    { wch: 12 },  // Statut
    { wch: 18 },  // Créé
    { wch: 18 },  // MAJ
  ];

  // Mise en forme du header (gras, fond bleu, texte blanc)
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellRef = XLSX.utils.encode_cell({ c: C, r: 0 });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1A2A6E" } },
      alignment: { horizontal: "center", vertical: "center" },
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Restitutions");

  // Métadonnées
  wb.Props = {
    Title: "Delta VO — Restitutions",
    Subject: "Export ADV",
    Author: "Delta VO",
    CreatedDate: new Date(),
  };

  // Nom du fichier avec date
  const today = new Date().toISOString().slice(0, 10);
  const finalName = `${filename}_${today}.xlsx`;

  XLSX.writeFile(wb, finalName);
}

function getCurrentStep(m: Machine): string {
  if (!m.date_demande_recuperation) return "1 · Demande récupération";
  if (!m.recuperation_ok) return "2 · Récupération";
  if (!m.expertise_ok) return "3 · Expertise";
  if (!m.facture_ok) return "4 · Facture";
  if (!m.facture_reglee_ok) return "5 · Règlement";
  return "✓ Terminé";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR");
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}