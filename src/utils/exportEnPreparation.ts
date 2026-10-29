import * as XLSX from "xlsx";
import { Machine, prepaTerminee, isLivraisonEnRetard } from "../types/machine";
import { referenceCommerciale } from "./reference";
import { pointsAttentionTexte } from "./pointsAttention";

/**
 * 📤 Export Excel « En préparation » (demande Jonathan 29/10/2026) : toutes les
 * nacelles affichées dans l'onglet (filtres et recherche appliqués), une ligne
 * par nacelle — vente / location, client, commercial, dates, avancement de la
 * préparation, étapes restantes, retard de livraison, devis. Document interne :
 * l'immatriculation y figure.
 */

const jour = (d?: string | null) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "");
const joursDepuis = (d?: string | null) => {
  if (!d) return "";
  const t = Date.parse(String(d).slice(0, 10));
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : "";
};
const retardJours = (d?: string | null) => {
  if (!d || !isLivraisonEnRetard(d)) return "";
  return joursDepuis(d);
};

function etat(m: Machine): string {
  if (!m.type_prepa) return "À configurer";
  if (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa)) return "Prête à facturer";
  return "En préparation";
}

export function exportEnPreparationExcel(machines: Machine[]) {
  if (!machines.length) {
    alert("Aucune nacelle en préparation à exporter.");
    return;
  }
  const ordre = (m: Machine) => (etat(m) === "À configurer" ? 0 : etat(m) === "En préparation" ? 1 : 2);
  const liste = [...machines].sort(
    (a, b) => ordre(a) - ordre(b) || String(a.date_livraison_prevue || "9999").localeCompare(String(b.date_livraison_prevue || "9999"))
  );

  const HEADERS = [
    "État", "Vente / Location", "Référence", "Immatriculation", "N° Dossier", "Type nacelle", "Modèle porteur", "Mise en circulation",
    "Site", "Client", "Commercial", "Date de vente", "Livraison / mise à dispo prévue", "Retard (j)",
    "Type de préparation", "Étapes faites", "Étapes restantes", "Prix de vente HT (€)", "Devis / contrat", "En préparation depuis (j)", "Points d'attention",
  ];
  const aoa: (string | number)[][] = [HEADERS];
  for (const m of liste) {
    const etapes = (m.etapes_prepa || []).filter((e) => !e.non_necessaire);
    const faites = etapes.filter((e) => e.done).length;
    const lld = m.type_sortie === "lld";
    const livraison = lld ? m.date_mise_dispo_lld || m.date_livraison_prevue : m.date_livraison_prevue;
    aoa.push([
      etat(m),
      lld ? "Location" : (m as any).mode_vente === "location_financiere" ? "Vente (location financière)" : "Vente",
      referenceCommerciale(m),
      m.immat || "",
      m.numero_dossier || "",
      m.type_nacelle || "",
      m.modele_porteur || "",
      m.annee_circulation || "",
      m.localite || "",
      (lld ? m.client_lld || m.acheteur : m.acheteur) || "",
      m.commercial_vendeur || "",
      jour(m.date_vente),
      jour(livraison),
      retardJours(livraison),
      !m.type_prepa ? "" : m.type_prepa === "en_etat" ? "En l'état" : "Normale",
      etapes.length ? `${faites}/${etapes.length}` : "",
      etapes.filter((e) => !e.done).map((e) => e.label).join(", "),
      m.montant_offre ?? m.prix_vente_final ?? "",
      [m.devis_vente_numero, (m as any).contrat_sortie].filter(Boolean).join(" · "),
      joursDepuis(m.date_mise_en_cours),
      pointsAttentionTexte(m),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [16, 22, 11, 13, 11, 13, 20, 12, 11, 24, 18, 12, 16, 9, 13, 10, 40, 14, 22, 12, 32].map((wch) => ({ wch }));
  ws["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}${aoa.length}` } as any;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "En préparation");
  const d = new Date();
  XLSX.writeFile(wb, `delta-vo_en-preparation_${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}.xlsx`);
}
