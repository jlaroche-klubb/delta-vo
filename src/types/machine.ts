export type MachineStatut =
  | "restitution"
  | "disponible"
  | "en_cours"
  | "cloturee"
  | "louee_lld";

export type TypePrepa = "normale" | "en_etat";
export type TypeSortie = "vente" | "lld";
export type StatutPaiement = "en_attente" | "payee" | "retard";

export interface DegatExpertise {
  zone: string;
  description: string;
  montant: number;
  sur_devis?: boolean;
}

export interface RapportExpertise {
  date_expertise?: string;
  agent?: string;
  heures_nacelle?: number;
  km_porteur?: number;
  duree_location_jours?: number;
  taux_vetuste?: number;
  degats: DegatExpertise[];
  total_retenue_ht: number;
  notes?: string;
  rapport_url?: string;
}

export interface EtapePrepa {
  id: string;
  label: string;
  done: boolean;
  done_by?: string;
  done_at?: string;
}

export interface FicheCommerciale {
  numero_fiche?: string;
  date_creation_fiche?: string;
  hauteur_travail_m?: number;
  deport_travail_m?: number;
  nb_personnes_panier?: number;
  puissance_porteur?: string;
  options?: string[];
  amenagement_interieur?: string;
}

export interface Machine {
  id: string;
  immat: string;
  modele_porteur: string;
  type_nacelle: string;
  annee_circulation: string;
  statut: MachineStatut;

  date_demande_recuperation?: string;
  recuperation_ok: boolean;
  expertise_ok: boolean;
  facture_ok: boolean;
  facture_reglee_ok: boolean;
  fiche_vo_creee: boolean;

  client_precedent: string;
  date_retour: string;
  contrat: string;

  heures_nacelle?: number;
  km_porteur?: number;
  agent_expertise?: string;
  rapport_expertise?: RapportExpertise;

  photos_commerciales?: {
    av_droit?: string;
    av_gauche?: string;
    ar_droit?: string;
    ar_gauche?: string;
  };

  date_mise_stock?: string;
  prix_fr?: number;
  prix_dealer?: number;
  prix_modifie_le?: string;
  prix_modifie_par?: string;
  prix_modifie_manuellement?: boolean;

  fiche_commerciale?: FicheCommerciale;

  type_prepa?: TypePrepa;
  acheteur?: string;
  commercial_vendeur?: string;
  prix_vente_final?: number;
  date_vente?: string;
  date_livraison_prevue?: string;
  date_mise_en_cours?: string;
  etapes_prepa?: EtapePrepa[];

  type_sortie?: TypeSortie;
  client_lld?: string;
  date_mise_dispo_lld?: string;

  date_facturation?: string;
  numero_facture?: string;
  date_reglement?: string;
  marche?: "fr" | "dealer";

  archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  ne_dossier_id?: string;

  is_test?: boolean;
  createdAt: string;
  updatedAt?: string;

  // === CHAMPS SYNCHRONISATION NACELLE-EXPERT ===
  expertise_recue?: boolean;
  date_expertise_recue?: string;
  agent_expert?: string;
}

// ========== FONCTIONS HELPER ==========

export function calculAgeStock(dateStock: string): number {
  if (!dateStock) return 0;
  const now = new Date();
  const stock = new Date(dateStock);
  return Math.floor((now.getTime() - stock.getTime()) / (1000 * 60 * 60 * 24));
}

export function getAgeStockColor(jours: number, seuilRepricer: number = 60): {
  color: string;
  bg: string;
  label: string;
} {
  if (jours <= 30) {
    return { color: "text-green-700", bg: "bg-green-100", label: "Frais" };
  } else if (jours <= seuilRepricer) {
    return { color: "text-yellow-700", bg: "bg-yellow-100", label: "Bon" };
  } else if (jours <= 90) {
    return { color: "text-orange-700", bg: "bg-orange-100", label: "À repricer" };
  } else {
    return { color: "text-red-700", bg: "bg-red-100", label: "Urgent" };
  }
}

const ETAPES_PREPA_NORMALE = [
  "Lavage complet",
  "Peinture si nécessaire",
  "Contrôle technique + CT CACES",
  "Pneumatique (rechapé OK)",
  "Préparation complète (mécanique + électrique)",
];

const ETAPES_PREPA_EN_ETAT = [
  "Lavage rapide",
  "Contrôle technique + CT CACES",
  "Pneumatique (si besoin)",
];

export function creerEtapesPrepa(typePrepa: TypePrepa = "normale"): EtapePrepa[] {
  const labels = typePrepa === "normale" ? ETAPES_PREPA_NORMALE : ETAPES_PREPA_EN_ETAT;
  return labels.map((label, idx) => ({
    id: `etape-${idx + 1}`,
    label,
    done: false,
  }));
}

// ========== FONCTIONS POUR DISPONIBLES ==========

export interface FiltreDisponibles {
  searchText: string;
  section: "attente_prix" | "repricer" | "normal" | "tous";
  marche: "tous" | "fr" | "dealer";
  modele: string;
  ageMin: number;
  ageMax: number;
}

export function filtrerDisponibles(
  machines: Machine[],
  filtre: FiltreDisponibles,
  seuilRepricer: number = 60
): Machine[] {
  let result = machines.filter((m) => m.statut === "disponible");

  if (filtre.searchText.trim()) {
    const text = filtre.searchText.toLowerCase();
    result = result.filter(
      (m) =>
        m.immat.toLowerCase().includes(text) ||
        m.modele_porteur.toLowerCase().includes(text) ||
        m.type_nacelle.toLowerCase().includes(text)
    );
  }

  if (filtre.section !== "tous") {
    result = result.filter((m) => {
      const age = calculAgeStock(m.date_mise_stock || "");
      if (filtre.section === "attente_prix") {
        return !m.prix_fr && !m.prix_dealer;
      }
      if (filtre.section === "repricer") {
        return (m.prix_fr || m.prix_dealer) && age > seuilRepricer;
      }
      if (filtre.section === "normal") {
        return (m.prix_fr || m.prix_dealer) && age <= seuilRepricer;
      }
      return true;
    });
  }

  if (filtre.marche !== "tous") {
    result = result.filter((m) => m.marche === filtre.marche);
  }

  if (filtre.modele) {
    result = result.filter((m) => m.modele_porteur === filtre.modele);
  }

  if (filtre.ageMin !== undefined) {
    result = result.filter((m) => {
      const age = calculAgeStock(m.date_mise_stock || "");
      return age >= filtre.ageMin;
    });
  }

  if (filtre.ageMax !== undefined) {
    result = result.filter((m) => {
      const age = calculAgeStock(m.date_mise_stock || "");
      return age <= filtre.ageMax;
    });
  }

  return result;
}

export function isFicheComplete(machine: Machine): boolean {
  const f = machine.fiche_commerciale;
  if (!f) return false;
  return !!(
    f.hauteur_travail_m &&
    f.deport_travail_m &&
    f.nb_personnes_panier &&
    f.puissance_porteur
  );
}

export function getNextFicheNumber(machines: Machine[]): string {
  const currentYear = new Date().getFullYear();
  const fiches = machines
    .filter((m) => m.fiche_commerciale?.numero_fiche)
    .map((m) => m.fiche_commerciale!.numero_fiche!);

  const thisYearFiches = fiches.filter((num) => num.startsWith(`${currentYear}-`));
  if (thisYearFiches.length === 0) {
    return `${currentYear}-001`;
  }

  const maxNum = Math.max(
    ...thisYearFiches.map((num) => parseInt(num.split("-")[1], 10))
  );
  const next = maxNum + 1;
  return `${currentYear}-${next.toString().padStart(3, "0")}`;
}

// ========== FONCTIONS POUR EN COURS ==========

export function prepaTerminee(etapesPrepa: EtapePrepa[] | undefined): boolean {
  if (!etapesPrepa || etapesPrepa.length === 0) return false;
  return etapesPrepa.every((e) => e.done);
}

export function isLivraisonEnRetard(dateLivraisonPrevue: string | undefined): boolean {
  if (!dateLivraisonPrevue) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateLivraisonPrevue < today;
}

export function isMiseDispoEnRetard(dateMiseDispo: string | undefined): boolean {
  if (!dateMiseDispo) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateMiseDispo < today;
}

// ========== FONCTIONS POUR CLÔTURÉES ==========

export function getStatutPaiement(machine: Machine): StatutPaiement {
  if (machine.date_reglement) return "payee";
  if (!machine.date_facturation) return "en_attente";

  const jours = joursDepuisFacturation(machine.date_facturation);
  if (jours > 60) return "retard";
  return "en_attente";
}

export function joursDepuisFacturation(dateFacturation: string | undefined): number {
  if (!dateFacturation) return 0;
  const now = new Date();
  const facturation = new Date(dateFacturation);
  return Math.floor((now.getTime() - facturation.getTime()) / (1000 * 60 * 60 * 24));
}

export function getAnneeFacturation(machine: Machine): number {
  if (!machine.date_facturation) return 0;
  return parseInt(machine.date_facturation.slice(0, 4), 10);
}
