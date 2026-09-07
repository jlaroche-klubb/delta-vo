import * as XLSX from "xlsx";
import { Machine } from "../types/machine";
import { horsVenteVog, normalizeTypeNacelle } from "./nacelles";
import { calculerSyntheseMarche, lignesSyntheseMarche } from "./syntheseMarche";

interface ExportPricingOptions {
  machines: Machine[];
  seuilRepricer?: number; // seuil (jours) au-delà duquel un prix est « à revoir »
}

/**
 * Export Pricing PDG — UNE SEULE feuille « Pricing PDG » (demande du PDG,
 * validée avec Jonathan) : TOUTES les machines en vente, regroupées par type
 * de nacelle, avec les prix déjà faits pré-remplis et les prix à faire
 * signalés (colonne « Statut prix »). Le PDG complète ou corrige directement
 * la colonne « Prix France HT (€) » / « Prix Dealer HT (€) » et renvoie le
 * fichier tel quel : l'import ne touche que les lignes dont le prix a changé.
 *
 * Statut prix : « ⚠ À FAIRE » (aucun prix France), « À revoir (N j) » (prix
 * plus vieux que le seuil), « OK ».
 *
 * Chaque ligne montre la VNC ACTUELLE (import VNC compta), le montant
 * d'expertise et la fourchette de l'étude de marché IA pour éclairer la décision.
 *
 * ⚠ Document INTERNE (PDG) : l'immatriculation y figure — la règle
 * « N° occasion sans immat » ne s'applique qu'aux documents externes.
 *
 * 2e feuille « Marché internet » : synthèse des prix internet par type et
 * tranche d'âge (information, ignorée à l'import).
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
      // 🔒 En vente = expertise Nacelle Expert reçue
      (m.statut === "disponible" || (m.statut === "restitution" && m.expertise_recue && m.expertise_ok))
  );

  if (actives.length === 0) {
    alert("Aucune machine disponible à exporter.");
    return;
  }

  const datePrix = (m: Machine): string => m.prix_modifie_le || m.date_prix_vog || "";
  const agePrix = (m: Machine): number | null => {
    const d = datePrix(m);
    if (!d) return null;
    const t = new Date(d).getTime();
    return isNaN(t) ? null : Math.floor((now.getTime() - t) / 86400000);
  };
  const statutPrix = (m: Machine): string => {
    if (m.prix_fr == null) return "⚠ À FAIRE";
    const age = agePrix(m);
    if (age == null) return "À revoir (date inconnue)";
    return age > seuilRepricer ? `À revoir (${age} j)` : "OK";
  };

  const HEADERS = [
    "Statut prix",
    "Type nacelle",
    "N° occasion",
    "Immatriculation",
    "N° Dossier",
    "Modèle porteur",
    "Mise en circulation",
    "Heures nacelle",
    "Km porteur",
    "Localisation",
    "Montant expertise VO (€)",
    "VNC (€)",
    // 📊 Étude de marché IA (fourchette indicative — décision au PDG)
    "Marché bas (€)",
    "Marché médiane (€)",
    "Marché haut (€)",
    "Étude du",
    "Prix France HT (€)",
    "Prix Dealer HT (€)",
    "Date du prix",
    "Disponible depuis",
  ];
  const toRow = (m: Machine): (string | number)[] => [
    statutPrix(m),
    m.type_nacelle || "",
    m.numero_occasion || "",
    m.immat || "",
    m.numero_dossier || "",
    m.modele_porteur || "",
    m.annee_circulation || "",
    m.heures_nacelle ?? "",
    m.km_porteur ?? "",
    m.localite || "",
    m.rapport_expertise?.total_retenue_ht ?? "",
    m.vr_vnc ?? "",
    m.etude_marche?.fourchette_basse ?? "",
    m.etude_marche?.mediane ?? "",
    m.etude_marche?.fourchette_haute ?? "",
    m.etude_marche?.date ?? "",
    // 💶 Prix déjà faits pré-remplis : le PDG complète les vides / corrige
    m.prix_fr ?? "",
    m.prix_dealer ?? "",
    datePrix(m),
    m.date_mise_stock || "",
  ];

  // ── Regroupement par type de nacelle (K26 ≠ KL26), les types les plus
  //    fournis d'abord ; dans un type : à faire d'abord, puis prix les plus
  //    anciens, puis par année.
  const parType = new Map<string, Machine[]>();
  for (const m of actives) {
    const type = normalizeTypeNacelle(m.type_nacelle) || m.type_nacelle || "Type inconnu";
    if (!parType.has(type)) parType.set(type, []);
    parType.get(type)!.push(m);
  }
  const ordreStatut = (m: Machine) => (m.prix_fr == null ? 0 : (agePrix(m) ?? 9999) > seuilRepricer ? 1 : 2);
  const groupes = Array.from(parType.entries()).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  );

  const aoa: (string | number)[][] = [HEADERS];
  let nbAFaire = 0;
  let nbARevoir = 0;
  for (const [type, ms] of groupes) {
    ms.sort((a, b) => ordreStatut(a) - ordreStatut(b) || (agePrix(b) ?? 9999) - (agePrix(a) ?? 9999) || String(a.annee_circulation).localeCompare(String(b.annee_circulation)));
    const aFaire = ms.filter((m) => m.prix_fr == null).length;
    const aRevoir = ms.filter((m) => ordreStatut(m) === 1).length;
    nbAFaire += aFaire;
    nbARevoir += aRevoir;
    // Ligne de titre du groupe (ignorée à l'import : ni immat ni prix)
    aoa.push([
      `── ${type} · ${ms.length} machine(s)` +
        (aFaire ? ` · ${aFaire} à faire` : "") +
        (aRevoir ? ` · ${aRevoir} à revoir` : "") +
        " ──",
    ]);
    for (const m of ms) aoa.push(toRow(m));
  }
  aoa.push([]);
  aoa.push([
    `${actives.length} machine(s) en vente · ${nbAFaire} prix à faire · ${nbARevoir} prix à revoir (> ${seuilRepricer} j) · ` +
      `Complétez / corrigez « Prix France HT (€) » et « Prix Dealer HT (€) » puis réimportez ce fichier tel quel : seules les lignes dont le prix a changé sont prises en compte.`,
  ]);

  const cols = [
    { wch: 18 }, // Statut prix
    { wch: 14 }, // Type nacelle
    { wch: 12 }, // N° occasion
    { wch: 13 }, // Immat
    { wch: 12 }, // N° Dossier
    { wch: 20 }, // Modèle porteur
    { wch: 14 }, // Mise en circulation
    { wch: 12 }, // Heures
    { wch: 12 }, // Km
    { wch: 12 }, // Localisation
    { wch: 20 }, // Montant expertise VO
    { wch: 12 }, // VNC
    { wch: 13 }, // Marché bas
    { wch: 15 }, // Marché médiane
    { wch: 13 }, // Marché haut
    { wch: 11 }, // Étude du
    { wch: 16 }, // Prix France
    { wch: 16 }, // Prix Dealer
    { wch: 12 }, // Date du prix
    { wch: 15 }, // Dispo depuis
  ];

  const wb = XLSX.utils.book_new();
  const wsPricing = XLSX.utils.aoa_to_sheet(aoa);
  wsPricing["!cols"] = cols;
  // Volet figé sous l'en-tête + filtre automatique sur toutes les colonnes
  wsPricing["!freeze"] = { xSplit: 0, ySplit: 1 } as any;
  wsPricing["!autofilter"] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}${aoa.length}` } as any;
  XLSX.utils.book_append_sheet(wb, wsPricing, "Pricing PDG");

  // 📊 Feuille « Marché internet » : synthèse des études de marché IA par type
  // de nacelle (ligne de tête, toutes années) puis par tranche d'âge, et
  // « Toutes nacelles » en pied. Ignorée par l'import Pricing.
  const synthese = calculerSyntheseMarche(machines);
  const lignes = lignesSyntheseMarche(synthese);
  const aoaMarche: (string | number)[][] = [
    ["Type nacelle / tranche d'âge", "Machines étudiées", "Annonces", "Marché min (€)", "Marché moyen (€)", "Marché max (€)", "Prix Delta VO moyen HT (€)", "Écart nos prix vs marché (%)", "Dernière étude"],
    ...lignes.map((l) => [
      l.niveau === 2 ? `    ↳ ${l.libelle}` : l.libelle,
      l.nbMachines,
      l.nbAnnonces,
      l.min ?? "",
      l.moyen ?? "",
      l.max ?? "",
      l.prixDeltaMoyen ?? "",
      l.ecartPct ?? "",
      l.derniereEtude,
    ]),
    [],
    [`Études de moins de ${synthese.joursMax} jours · min = plus basse des fourchettes basses · moyen = moyenne des médianes · max = plus haute des fourchettes hautes` +
      (synthese.nbSansEtude ? ` · ${synthese.nbSansEtude} machine(s) en vente sans étude récente` : "")],
  ];
  const wsMarche = XLSX.utils.aoa_to_sheet(aoaMarche);
  wsMarche["!cols"] = [{ wch: 30 }, { wch: 17 }, { wch: 10 }, { wch: 15 }, { wch: 17 }, { wch: 15 }, { wch: 26 }, { wch: 27 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsMarche, "Marché internet");

  XLSX.writeFile(wb, `delta-vo_pricing-pdg_${dateStr}.xlsx`);
}
