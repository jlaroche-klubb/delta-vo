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
  date_expertise: string;
  agent: string;
  heures_nacelle: number;
  km_porteur: number;
  duree_location_jours?: number;
  taux_vetuste: number;
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

// ====== NOUVEAU v5 : Infos commerciales pour fiche VO ======
export interface FicheCommerciale {
  numero_fiche?: string;              // "2196DS"
  date_creation_fiche?: string;
  hauteur_travail_m?: number;         // 13.80
  deport_travail_m?: number;          // 7.30
  nb_personnes_panier?: number;       // 1 ou 2
  puissance_porteur?: string;         // "145Cv"
  options?: string[];                 // Liste des options
  amenagement_interieur?: string;     // Texte libre
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

  // Disponibles
  date_mise_stock?: string;
  prix_fr?: number;
  prix_dealer?: number;
  prix_modifie_le?: string;
  prix_modifie_par?: string;
  prix_modifie_manuellement?: boolean;

  // ====== FICHE COMMERCIALE (NOUVEAU v5) ======
  fiche_commerciale?: FicheCommerciale;

  // En cours
  type_prepa?: TypePrepa;
  acheteur?: string;
  commercial_vendeur?: string;
  prix_vente_final?: number;
  date_vente?: string;
  date_livraison_prevue?: string;
  date_mise_en_cours?: string;
  etapes_prepa?: EtapePrepa[];

  // LLD
  type_sortie?: TypeSortie;
  client_lld?: string;
  date_mise_dispo_lld?: string;

  // Clôturées
  date_facturation?: string;
  numero_facture?: string;
  date_reglement?: string;
  marche?: "fr" | "dealer";

  // ====== NOUVEAU v7 : Archivage admin ======
  archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  ne_dossier_id?: string;  // référence dossier nacelle-expert (si la machine vient de là)

  is_test?: boolean;
  createdAt: string;
  updatedAt?: string;
}

// Helpers existants
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
  if (jours <= 30) return { color: "#208040", bg: "rgba(48,160,80,0.1)", label: "Nouveau stock" };
  if (jours <= seuilRepricer) return { color: "#9a8a2a", bg: "rgba(154,138,42,0.1)", label: "En vente" };
  if (jours <= seuilRepricer + 30) return { color: "#c58300", bg: "rgba(197,131,0,0.1)", label: "À repricer" };
  return { color: "#c8102e", bg: "rgba(200,16,46,0.1)", label: "Stock long" };
}

export const ETAPES_PREPA_DEFAULT: { id: string; label: string }[] = [
  { id: "nettoyage", label: "Nettoyage complet (intérieur + extérieur)" },
  { id: "reparations", label: "Réparations identifiées dans l'expertise" },
  { id: "ct", label: "Contrôle technique (CT)" },
  { id: "vgp", label: "Contrôle nacelle (VGP)" },
  { id: "marquage", label: "Marquage / habillage commercial" },
  { id: "verif", label: "Vérification finale" },
];

export function creerEtapesPrepa(): EtapePrepa[] {
  return ETAPES_PREPA_DEFAULT.map((e) => ({
    id: e.id,
    label: e.label,
    done: false,
  }));
}

export function prepaTerminee(etapes: EtapePrepa[] | undefined): boolean {
  if (!etapes || etapes.length === 0) return false;
  return etapes.every((e) => e.done);
}

export function isLivraisonEnRetard(dateLivraison: string | undefined): boolean {
  if (!dateLivraison) return false;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return dateLivraison < aujourdhui;
}

export function isMiseDispoEnRetard(dateMiseDispo: string | undefined): boolean {
  if (!dateMiseDispo) return false;
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return dateMiseDispo < aujourdhui;
}

// Helpers paiement
export const SEUIL_RETARD_PAIEMENT_DEFAULT = 30;

export function getStatutPaiement(
  machine: Machine,
  seuilRetard: number = SEUIL_RETARD_PAIEMENT_DEFAULT
): StatutPaiement {
  if (machine.date_reglement) return "payee";
  if (!machine.date_facturation) return "en_attente";
  const facture = new Date(machine.date_facturation);
  const today = new Date();
  const joursDepuis = Math.floor((today.getTime() - facture.getTime()) / (1000 * 60 * 60 * 24));
  if (joursDepuis > seuilRetard) return "retard";
  return "en_attente";
}

export function joursDepuisFacturation(dateFacturation: string | undefined): number {
  if (!dateFacturation) return 0;
  const facture = new Date(dateFacturation);
  const today = new Date();
  return Math.floor((today.getTime() - facture.getTime()) / (1000 * 60 * 60 * 24));
}

export function getAnneeFacturation(machine: Machine): number {
  if (!machine.date_facturation) return 0;
  return new Date(machine.date_facturation).getFullYear();
}

// ====== NOUVEAU v5 : Helpers fiche VO ======

// La fiche est "complète" si tous les champs commerciaux essentiels sont remplis
export function isFicheComplete(machine: Machine): boolean {
  const fc = machine.fiche_commerciale;
  if (!fc) return false;
  return !!(
    fc.hauteur_travail_m &&
    fc.deport_travail_m &&
    fc.nb_personnes_panier &&
    fc.puissance_porteur
  );
}

// Génère le prochain numéro de fiche dans la séquence
export function getNextFicheNumber(machines: Machine[], startFrom: number = 2196): string {
  const existingNumbers = machines
    .map((m) => m.fiche_commerciale?.numero_fiche)
    .filter((n): n is string => !!n && /^\d+DS$/.test(n))
    .map((n) => parseInt(n.replace("DS", ""), 10))
    .filter((n) => !isNaN(n));

  const maxUsed = existingNumbers.length > 0 ? Math.max(...existingNumbers) : startFrom - 1;
  const next = Math.max(maxUsed + 1, startFrom);
  return `${next}DS`;
}
