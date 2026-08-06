import { Machine } from "../types/machine";
import { ParsedStockMachine } from "./importStock";

// ============================================================
// FUSION VOG : logique PARTAGÉE entre la simulation (rapport à
// blanc montré avant import) et l'import réel (MachinesContext).
// Un seul endroit décide de ce qui est écrit -> la simulation
// montre EXACTEMENT ce que l'import fera.
// ============================================================
//
// Politique validée avec Jonathan :
// - fusion par immatriculation normalisée, JAMAIS de suppression
// - le PRIX du fichier fait autorité (écrase le prix Delta VO)
// - N° occasion, VR/VNC, diffusion et champs administratifs VOG :
//   toujours rafraîchis depuis le fichier
// - modèle / type / année / km / heures / châssis : complétés
//   seulement s'ils sont vides (les données d'expertise NE priment)
// - le workflow (étapes, statuts avancés, expertise) n'est jamais touché ;
//   une machine en préparation / vendue / louée garde son statut

const eur = (n: number) => n.toLocaleString("fr-FR") + " €";

/** Champs toujours rafraîchis depuis le fichier (fichier = autorité) */
const REFRESH_FIELDS: [keyof ParsedStockMachine, string, string][] = [
  // [champ parsé, champ Firestore, libellé pour le rapport]
  ["numero_occasion", "numero_occasion", "N° occasion"],
  ["numero_dossier", "numero_dossier", "N° dossier"],
  ["proprietaire", "proprietaire", "Propriétaire"],
  ["categorie_vehicule", "categorie_vehicule", "Catégorie"],
  ["numero_cube", "numero_cube", "N° de cube"],
  ["histovec", "histovec", "HISTOVEC"],
  ["etat_exterieur", "etat_exterieur", "État extérieur"],
  ["etat_nacelle_vog", "etat_nacelle_vog", "État nacelle (VOG)"],
  ["etat_note_vog", "etat_note_vog", "État (note VOG)"],
  ["date_mise_en_service", "date_mise_en_service", "Mise en service"],
  ["fiche_occasion_vog", "fiche_occasion_vog", "Fiche d'occasion (VOG)"],
  ["date_ajout_vog", "date_ajout_vog", "Date ajout VOG"],
  ["carte_grise_vog", "carte_grise_vog", "Carte grise (VOG)"],
  ["date_prix_vog", "date_prix_vog", "Date prix (VOG)"],
  ["km_note", "km_note", "Mention KM"],
  ["heures_note", "heures_note", "Mention heures"],
  ["vr_vnc", "vr_vnc", "VR/VNC"],
];

export interface VogUpdateResult {
  updates: Record<string, any>;
  /** Changements lisibles pour le rapport de simulation */
  changes: string[];
}

export function computeVogUpdates(existing: Machine, p: ParsedStockMachine): VogUpdateResult {
  const updates: Record<string, any> = {};
  const changes: string[] = [];
  // Machine encore en stock (le fichier VOG fait autorité sur prix/localité/statut).
  // En prépa / vendue / louée : champs administratifs et N° occasion seulement.
  const enStock = existing.statut === "restitution" || existing.statut === "disponible";

  // ── Champs complétés seulement s'ils sont vides (données NE prioritaires) ──
  if (!existing.modele_porteur && p.modele_porteur) { updates.modele = p.modele_porteur; changes.push(`modèle : ${p.modele_porteur}`); }
  if (!existing.type_nacelle && p.type_nacelle) { updates.type_nacelle = p.type_nacelle; changes.push(`type : ${p.type_nacelle}`); }
  if (!existing.annee_circulation && p.annee_circulation) { updates.annee_fab = p.annee_circulation; changes.push(`année : ${p.annee_circulation}`); }
  if (existing.km_porteur == null && p.km_porteur != null) { updates.km_porteur = p.km_porteur; changes.push(`km : ${p.km_porteur}`); }
  if (existing.heures_nacelle == null && p.heures_nacelle != null) { updates.heures = p.heures_nacelle; changes.push(`heures : ${p.heures_nacelle}`); }
  if (!existing.num_chassis && p.num_chassis) { updates.num_chassis = p.num_chassis; changes.push(`châssis : ${p.num_chassis}`); }

  // ── 💶 Prix de vente : le fichier VOG fait AUTORITÉ (machines en stock) ──
  if (enStock && p.prix_fr != null && p.prix_fr !== existing.prix_fr) {
    updates.prix_fr = p.prix_fr;
    updates.prix_modifie_le = new Date().toISOString().slice(0, 10);
    updates.prix_modifie_par = "Import VOG";
    changes.push(
      existing.prix_fr != null
        ? `💶 prix : ${eur(existing.prix_fr)} → ${eur(p.prix_fr)}`
        : `💶 prix : ${eur(p.prix_fr)}`
    );
  }

  // ── Champs toujours rafraîchis depuis le fichier ──
  for (const [pKey, fsKey, label] of REFRESH_FIELDS) {
    const val = (p as any)[pKey];
    if (val !== undefined && val !== (existing as any)[fsKey]) {
      updates[fsKey] = val;
      if (fsKey === "numero_occasion") changes.push(`🏷️ N° occasion : ${val}`);
      else if (fsKey === "vr_vnc") changes.push(`VR/VNC : ${eur(Number(val))}`);
      else if (["numero_dossier", "proprietaire", "numero_cube"].includes(fsKey)) changes.push(`${label} : ${val}`);
      // autres champs administratifs : mis à jour sans encombrer le rapport
    }
  }
  if (p.diffusion) updates.diffusion = p.diffusion;

  // ── 📍 Localité : le fichier reflète le stock ACTUEL -> rafraîchie,
  // mais uniquement pour les machines encore en stock (jamais en prépa/vendues)
  if (enStock && p.localite && p.localite !== existing.localite) {
    updates.localite = p.localite;
    changes.push(`📍 localité : ${existing.localite || "—"} → ${p.localite}`);
  }

  // ✅ Marqueur : cette machine est dans le stock VOG.
  updates.import_vog = true;

  // Machines du VOG « à vendre » encore en cycle -> repassent disponibles.
  // On ne touche PAS aux machines en prépa / louées / vendues.
  // ⚠ Ni aux RESTITUTIONS EN COURS : le fichier du parc (format VOG) circule
  // compta → ADV → PDG et les contient pour l'attribution des N° occasion —
  // son réimport ne doit JAMAIS clore leur facturation de frais.
  const restitutionEnCours =
    existing.statut === "restitution" && !(existing.facture_ok && existing.facture_reglee_ok);
  if (enStock && !restitutionEnCours) {
    if (existing.statut !== "disponible") changes.push("statut : disponible (stock VOG)");
    updates.statut = "disponible";
    updates.fiche_vo_creee = true;
    updates.facture_reglee_ok = true;
  }

  return { updates, changes };
}

/** Document Firestore pour une machine ABSENTE de Delta VO (création) */
export function buildNewVogDoc(p: ParsedStockMachine): Record<string, any> {
  const now = new Date().toISOString();
  const doc: Record<string, any> = {
    immat: p.immat || p.docId,
    modele: p.modele_porteur,
    type_nacelle: p.type_nacelle,
    annee_fab: p.annee_circulation,
    statut: "disponible",
    import_vog: true,
    recuperation_ok: true,
    expertise_ok: true,
    fiche_vo_creee: true,
    facture_reglee_ok: true,
    createdAt: now,
    updatedAt: now,
  };
  const optional: [any, string][] = [
    [p.numero_occasion, "numero_occasion"],
    [p.numero_dossier, "numero_dossier"],
    [p.proprietaire, "proprietaire"],
    [p.fiche_occasion_vog, "fiche_occasion_vog"],
    [p.date_ajout_vog, "date_ajout_vog"],
    [p.carte_grise_vog, "carte_grise_vog"],
    [p.categorie_vehicule, "categorie_vehicule"],
    [p.numero_cube, "numero_cube"],
    [p.histovec, "histovec"],
    [p.num_chassis, "num_chassis"],
    [p.etat_exterieur, "etat_exterieur"],
    [p.etat_nacelle_vog, "etat_nacelle_vog"],
    [p.etat_note_vog, "etat_note_vog"],
    [p.date_mise_en_service, "date_mise_en_service"],
    [p.km_porteur, "km_porteur"],
    [p.km_note, "km_note"],
    [p.heures_nacelle, "heures"],
    [p.heures_note, "heures_note"],
    [p.localite, "localite"],
    [p.prix_fr, "prix_fr"],
    [p.date_prix_vog, "date_prix_vog"],
    [p.vr_vnc, "vr_vnc"],
    [p.diffusion, "diffusion"],
  ];
  for (const [val, key] of optional) {
    if (val !== undefined && val !== null && val !== "") doc[key] = val;
  }
  return doc;
}

// ============================================================
// SIMULATION À BLANC : ce que l'import ferait, sans rien écrire
// ============================================================

export interface VogSimulationLine {
  ref: string;
  label: string; // type + modèle
  detail: string[]; // changements / avertissements
  protegee?: boolean; // machine en prépa/vendue/louée : workflow non touché
}

export interface VogSimulation {
  aCreer: VogSimulationLine[];
  aMettreAJour: VogSimulationLine[];
  inchangees: VogSimulationLine[];
  ignorees: { ref: string; raison: string }[];
  /** 🗄️ Purge exceptionnelle : machines hors fichier ET hors restitutions en
   *  cours -> ARCHIVÉES (récupérables) si l'utilisateur coche la case. */
  aArchiver: (VogSimulationLine & { id: string })[];
  nbPrixModifies: number;
  totalRows: number;
}

/**
 * 🗄️ Purge « base de départ » (validée par Jonathan, exceptionnelle) :
 * le fichier VOG devient LA référence. Toute machine absente du fichier est
 * ARCHIVÉE (jamais supprimée : récupérable), SAUF les restitutions dont la
 * facturation des frais n'est pas terminée. Les dossiers Nacelle Expert
 * (photos, expertises) ne sont pas touchés.
 */
export function computeVogPurge(
  parsed: ParsedStockMachine[],
  machines: Machine[]
): (VogSimulationLine & { id: string })[] {
  const inFile = new Set<string>();
  for (const p of parsed) {
    inFile.add(p.docId);
    if (p.immat) inFile.add(p.immat.toUpperCase());
  }

  const motif = (m: Machine): string => {
    switch (m.statut) {
      case "cloturee": return "vendue / clôturée";
      case "en_cours": return "vente ou préparation en cours";
      case "louee_lld": return "location LLD";
      case "restitution": return "restitution terminée (facture réglée)";
      default: return "absente du fichier VOG";
    }
  };

  return machines
    .filter((m) => {
      if (m.archived) return false; // déjà archivée
      if (inFile.has(m.id) || (m.immat && inFile.has(m.immat.toUpperCase()))) return false;
      // ✅ Conservées : restitutions avec facturation des frais en cours
      if (m.statut === "restitution" && !(m.facture_ok && m.facture_reglee_ok)) return false;
      return true;
    })
    .map((m) => ({
      id: m.id,
      ref: m.immat || m.id,
      label: `${m.type_nacelle || ""} ${m.modele_porteur || ""}`.trim() || "—",
      detail: [motif(m)],
    }));
}

export function simulateVogImport(
  parsed: ParsedStockMachine[],
  machines: Machine[],
  skipped: { ref: string; raison: string }[],
  totalRows: number
): VogSimulation {
  const sim: VogSimulation = {
    aCreer: [],
    aMettreAJour: [],
    inchangees: [],
    ignorees: [...skipped],
    aArchiver: computeVogPurge(parsed, machines),
    nbPrixModifies: 0,
    totalRows,
  };

  for (const p of parsed) {
    const existing = machines.find(
      (m) => m.id === p.docId || (p.immat && m.immat.toUpperCase() === p.immat.toUpperCase())
    );
    const label = `${p.type_nacelle} ${p.modele_porteur}`.trim() || "—";

    if (!existing) {
      sim.aCreer.push({ ref: p.source, label, detail: [...p.avertissements] });
      if (p.prix_fr != null) sim.nbPrixModifies += 0; // prix initial, pas une modification
      continue;
    }

    const { updates, changes } = computeVogUpdates(existing, p);
    const protegee = !["restitution", "disponible"].includes(existing.statut);
    const detail = [...changes, ...p.avertissements];
    if (protegee) detail.unshift(`machine ${existing.statut === "cloturee" ? "vendue/clôturée" : existing.statut === "louee_lld" ? "louée LLD" : "en préparation"} : workflow non touché, champs administratifs seulement`);

    // « Mise à jour » seulement si autre chose que le simple marqueur import_vog
    const significatif = Object.keys(updates).filter((k) => !["import_vog", "updatedAt"].includes(k));
    if (significatif.length > 0) {
      sim.aMettreAJour.push({ ref: p.source, label, detail, protegee });
      if (changes.some((c) => c.startsWith("💶 prix") && c.includes("→"))) sim.nbPrixModifies++;
    } else {
      sim.inchangees.push({ ref: p.source, label, detail: p.avertissements, protegee });
    }
  }

  return sim;
}
