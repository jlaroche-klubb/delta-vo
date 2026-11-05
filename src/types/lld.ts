// ============================================================
// 📄 LOCATIONS LONGUE DURÉE (LLD) — types du module
// ============================================================
// Cahier des charges Jonathan (05/11/2026) : mémoire client, offres,
// contrats, signature, affectation. Lot 1 = mémoire client + paramètres.
// Collections Firestore :
//   - clients_lld/{id}        : fiche client (visible selon le rôle)
//   - clients_lld_prive/{id}  : banque (IBAN, BIC, RUM) — Jonathan + assistantes
//   - config/lld              : paramètres (modèles, grille, options, société, SEPA…)
// ============================================================

export interface ContactLLD {
  nom?: string;
  fonction?: string;
  email?: string;
  tel?: string;
}

/** Tarif négocié d'un client « sous tarif » : s'applique directement au contrat */
export interface TarifNegocieLLD {
  modele: string;
  duree_mois: number;
  loyer_ht: number;
  /** Full services (true) ou sans entretien (false) */
  full_services: boolean;
  km_an?: number;
  prix_km_sup?: number;
  caution_ttc?: number;
  /** Options incluses et leur prix mensuel, texte libre « libellé = prix » */
  options?: string;
  /** Date de fin de validité du tarif (AAAA-MM-JJ) */
  fin?: string;
}

export interface ClientLLD {
  id: string;
  // Entreprise
  raison_sociale: string;
  forme_juridique?: string;
  capital?: string;
  rcs?: string;
  siren?: string;
  siret?: string; // siège, 14 chiffres
  adresse?: string;
  cp?: string;
  ville?: string;
  naf?: string;
  tva_intra?: string;
  telephone?: string;
  fax?: string;
  email?: string;
  // Facturation
  facturation_societe?: string;
  facturation_email?: string;
  facturation_adresse?: string;
  // Contacts
  contact_compta?: ContactLLD;
  contact_maintenance?: ContactLLD;
  // N° de commande
  commande_obligatoire?: boolean;
  contact_commande?: ContactLLD;
  // Signataire
  signataire?: ContactLLD;
  /** Client « sous tarif » : pas d'offre, ses tarifs négociés s'appliquent au contrat */
  sous_tarif?: boolean;
  tarifs_negocies?: TarifNegocieLLD[];
  notes?: string;
  // Suivi
  cree_le?: string;
  cree_par?: string;
  modifie_le?: string;
  modifie_par?: string;
  /** Modifications proposées par le client à la signature, à relire (lot 4) */
  modifications_en_attente?: ModificationClientLLD[];
}

export interface ModificationClientLLD {
  date: string;
  contrat?: string;
  champ: string;
  avant: string;
  apres: string;
}

/** 🔒 Données bancaires — collection séparée, Jonathan + assistantes seulement */
export interface ClientLLDPrive {
  titulaire?: string;
  adresse_titulaire?: string;
  iban?: string;
  bic?: string;
  /** Référence unique du mandat SEPA en cours */
  rum?: string;
  modifie_le?: string;
  modifie_par?: string;
}

// ───────────── Paramètres (config/lld) ─────────────

export interface LigneGrilleLLD {
  modele: string;
  duree_mois: number;
  loyer_ht: number;
  /** neuf Klubb (true) ou occasion (false) */
  neuf: boolean;
  /** Supplément assurance HT / mois (vide = pas d'offre avec assurance pour cette ligne) */
  assurance_ht?: number;
}

export interface LigneCourteDureeLLD {
  modele: string;
  mois: number; // 1 à 11
  loyer_ht: number;
}

export interface OptionLLD {
  libelle: string;
  prix_mensuel_ht: number;
}

export interface PrestationLLD {
  libelle: string;
  inclus: boolean;
}

export interface MembreAgenceLLD {
  nom: string;
  fonction?: string;
  email?: string;
  tel?: string;
}

export interface ConfigLLD {
  modeles: string[];
  grille: LigneGrilleLLD[];
  courte_duree: LigneCourteDureeLLD[];
  options: OptionLLD[];
  prestations_full: PrestationLLD[];
  prestations_sans_entretien: PrestationLLD[];
  /** Kilométrage annuel, heures et prix du km supplémentaire par défaut */
  km_an_defaut: number;
  heures_defaut: string;
  prix_km_sup_defaut: number;
  validite_offre_jours: number;
  societe: {
    raison_sociale: string;
    adresse: string;
    siren: string;
    telephone: string;
    site_web: string;
    email: string;
  };
  fournisseur: {
    raison_sociale: string;
    adresse: string;
    siren: string;
  };
  sepa: {
    ics: string;
    creancier: string;
    adresse_creancier: string;
    jour_prelevement: number;
  };
  agence: MembreAgenceLLD[];
  /** Textes du contrat (lot 3) — vides = textes par défaut du modèle DS2026LD-08-01 */
  textes_contrat?: {
    cp_full?: string;
    cp_sans?: string;
    cg?: string;
    cg_version?: string;
    annexe_vetuste?: string;
    annexe_tarifs?: string;
    annexe_sinistres?: string;
    annexe_contacts?: string;
  };
  maj?: string;
}

export const CONFIG_LLD_DEFAUT: ConfigLLD = {
  modeles: ["KL26 TRQ", "KL 21B", "KL 32"],
  grille: [],
  courte_duree: [],
  options: [
    { libelle: "4 pneumatiques / an", prix_mensuel_ht: 90 },
    { libelle: "Véhicule de remplacement", prix_mensuel_ht: 130 },
  ],
  // Un libellé qui commence par « # » est un titre de groupe (colonne du PDF)
  prestations_full: [
    { libelle: "# VÉHICULE", inclus: true }, { libelle: "Audit de votre parc", inclus: true }, { libelle: "Aménagement extérieur", inclus: true }, { libelle: "Frais de mise en route", inclus: true },
    { libelle: "# ENTRETIEN", inclus: true }, { libelle: "Entretien courant", inclus: true }, { libelle: "Entretien curatif", inclus: true }, { libelle: "Réparation mécanique", inclus: true },
    { libelle: "# CONSOMMABLES", inclus: true }, { libelle: "Appoints d'huile, filtres, ampoules, liquides…", inclus: true },
    { libelle: "# GESTION ADMINISTRATIVE", inclus: true }, { libelle: "Taxes administratives", inclus: true }, { libelle: "Assurance responsabilité civile (si option assurance souscrite)", inclus: true },
    { libelle: "Assurance dommages au véhicule (si option assurance souscrite)", inclus: true }, { libelle: "Assurances vol et incendie (si option assurance souscrite)", inclus: true }, { libelle: "Planning des entretiens", inclus: true },
    { libelle: "# GESTION DES CONTRÔLES OBLIGATOIRES", inclus: true }, { libelle: "Préparation et présentation aux contrôles obligatoires (VGP)", inclus: true }, { libelle: "Contrôle anti-pollution, contrôle technique", inclus: true },
    { libelle: "# PANNE / IMMOBILISATION", inclus: true }, { libelle: "Assistance dépannage 24h/24 – 7j/7", inclus: true }, { libelle: "Véhicule de remplacement (relais)*", inclus: false },
    { libelle: "# SERVICE", inclus: true }, { libelle: "Un interlocuteur unique", inclus: true }, { libelle: "Mesure de votre satisfaction", inclus: true },
    { libelle: "# EN OPTION", inclus: true }, { libelle: "Aménagement intérieur", inclus: true }, { libelle: "Pneumatiques compris", inclus: false },
    { libelle: "# AUTRES", inclus: true }, { libelle: "Carburant", inclus: false }, { libelle: "Taxes dues aux infractions au code de la route", inclus: false }, { libelle: "Compensation kilométrique annuelle et entre les véhicules de même PTC", inclus: true },
  ],
  prestations_sans_entretien: [
    { libelle: "# VÉHICULE", inclus: true }, { libelle: "Audit de votre parc", inclus: true }, { libelle: "Aménagement extérieur", inclus: true }, { libelle: "Frais de mise en route", inclus: true },
    { libelle: "# ENTRETIEN", inclus: true }, { libelle: "Entretien courant de la nacelle", inclus: false }, { libelle: "Entretien curatif", inclus: false }, { libelle: "Entretien du porteur (à la charge du locataire)", inclus: false },
    { libelle: "# CONSOMMABLES", inclus: true }, { libelle: "Appoints d'huile, filtres, ampoules, liquides…", inclus: false },
    { libelle: "# GESTION ADMINISTRATIVE", inclus: true }, { libelle: "Taxes administratives", inclus: true }, { libelle: "Assurances (si option assurance souscrite)", inclus: true }, { libelle: "Planning des entretiens", inclus: false },
    { libelle: "# GESTION DES CONTRÔLES OBLIGATOIRES", inclus: true }, { libelle: "Préparation et présentation aux contrôles obligatoires (VGP)", inclus: true }, { libelle: "Contrôle anti-pollution, contrôle technique", inclus: false },
    { libelle: "# PANNE / IMMOBILISATION", inclus: true }, { libelle: "Assistance dépannage 24h/24 – 7j/7", inclus: true }, { libelle: "Véhicule de remplacement (relais)*", inclus: false },
    { libelle: "# SERVICE", inclus: true }, { libelle: "Un interlocuteur unique", inclus: true }, { libelle: "Mesure de votre satisfaction", inclus: true },
    { libelle: "# AUTRES", inclus: true }, { libelle: "Carburant", inclus: false }, { libelle: "Taxes dues aux infractions au code de la route", inclus: false },
  ],
  km_an_defaut: 30000,
  heures_defaut: "illimitées",
  prix_km_sup_defaut: 0.18,
  validite_offre_jours: 30,
  societe: {
    raison_sociale: "DELTA SERVICES",
    adresse: "12 avenue James de Rothschild\n77164 Ferrières-en-Brie",
    siren: "512 252 792",
    telephone: "+33 (0)1 60 95 47 80",
    site_web: "www.delta-services.fr",
    email: "",
  },
  fournisseur: {
    raison_sociale: "KLUBB FRANCE",
    adresse: "12 avenue James de Rothschild\n77164 Ferrières-en-Brie",
    siren: "",
  },
  sepa: {
    ics: "FR35ZZZ559458",
    creancier: "DELTA SERVICES",
    adresse_creancier: "12 avenue James de Rothschild\n77164 Ferrières-en-Brie",
    jour_prelevement: 20,
  },
  agence: [],
};

// ───────────── Offres (offres_lld) — lot 2 ─────────────

export type StatutOffreLLD = "brouillon" | "generee" | "signee" | "refusee" | "expiree" | "annulee";

/** Une durée proposée : loyer HT / mois sans assurance, et avec assurance si l'offre la propose */
export interface DureeOffreLLD {
  mois: number;
  loyer_ht: number;
  loyer_assurance_ht?: number;
}

export interface OptionOffreLLD {
  libelle: string;
  prix_mensuel_ht: number;
}

export interface ClientOffreLLD {
  raison_sociale: string;
  siren?: string;
  adresse?: string;
  cp?: string;
  ville?: string;
  contact_nom?: string;
  contact_email?: string;
  contact_tel?: string;
}

/** Choix du client à la signature de l'offre */
export interface ChoixOffreLLD {
  duree_mois: number;
  loyer_ht: number;
  avec_assurance: boolean;
  options: OptionOffreLLD[];
  /** Loyer mensuel HT total retenu (loyer + assurance + options) */
  total_mensuel_ht: number;
  caution_ttc: number;
}

export interface OffreLLD {
  numero: string; // OF-AAAA-MM-NN
  statut: StatutOffreLLD;
  date: string;
  date_expiration: string;
  validite_jours: number;
  client_id?: string;
  client: ClientOffreLLD;
  commercial: { nom: string; email: string; tel?: string };
  /** Matériel d'occasion du parc Delta (vo) ou neuf Klubb (neuf) */
  materiel: "vo" | "neuf";
  /** Courte durée : durées de 1 à 11 mois, prix par mois */
  courte_duree: boolean;
  /** L'offre affiche un loyer sans et un loyer avec assurance */
  avec_assurance: boolean;
  full_services: boolean;
  modele: string;
  quantite: number;
  /** Une durée fixe, ou plusieurs au choix du client (24 / 36 / 48…) */
  durees: DureeOffreLLD[];
  options: OptionOffreLLD[];
  transport: { mode: "offert" | "chiffre"; prix_ht?: number; adresse?: string };
  km_an: number;
  heures: string;
  prix_km_sup: number;
  /** Caution = 1 mois de loyer TTC (décision Jonathan 05/11/2026) */
  caution_mois: number;
  prestations: PrestationLLD[];
  commentaire?: string;
  pdf_url?: string;
  pdf_signe_url?: string;
  signature_jeton?: string;
  /** Lien envoyé par email depuis Delta VO */
  envoye_le?: string;
  envoye_a?: string;
  /** Contrats créés à la signature */
  contrats?: string[];
  zone_signature?: { page: number; x: number; y: number; w: number; h: number };
  choix?: ChoixOffreLLD;
  signature?: { nom: string; fonction?: string; email?: string; date: string; ip?: string };
  signe_le?: string;
  cree_par?: string;
  cree_le?: string;
  modifie_le?: string;
  historique?: { date: string; action: string; par: string }[];
}

// ───────────── Contrats (contrats_lld) — lot 3 ─────────────

export type StatutContratLLD = "brouillon" | "controle" | "envoye" | "signe" | "affecte" | "en_preparation" | "livre" | "annule";

export interface ControleContratLLD {
  ok: boolean;
  /** Règles en échec (libellés) */
  erreurs: string[];
  /** Écarts signalés mais non bloquants */
  avertissements: string[];
  le?: string;
  par?: string;
}

export interface ContratLLD {
  numero: string; // DS2026LD-11-01
  statut: StatutContratLLD;
  date: string;
  client_id?: string;
  /** Snapshot de la fiche locataire (p.16-17), prérempli depuis la mémoire client, complété par le client à la signature */
  client: ClientOffreLLD & { siret?: string; tva_intra?: string; naf?: string; telephone?: string; fax?: string; email?: string; facturation_societe?: string; facturation_email?: string; facturation_adresse?: string; contact_compta?: ContactLLD; contact_maintenance?: ContactLLD; commande_obligatoire?: boolean; contact_commande?: ContactLLD };
  commercial: { nom: string; email: string; tel?: string };
  /** Offre d'origine (vide pour un client sous tarif) */
  offre_numero?: string;
  /** Rang du contrat dans l'offre (1/3, 2/3…) */
  rang?: number;
  rang_total?: number;
  full_services: boolean;
  materiel: "vo" | "neuf";
  modele: string;
  /** Immatriculation si la nacelle est déjà connue (sinon affectée après signature, lot 5) */
  immat?: string;
  machine_id?: string;
  duree_mois: number;
  loyer_ht: number;
  assurance: boolean;
  assurance_ht: number;
  /** Options mensuelles retenues */
  options: OptionOffreLLD[];
  /** Loyer mensuel HT total = loyer + assurance + options */
  total_mensuel_ht: number;
  tva_ht: number;
  total_mensuel_ttc: number;
  caution_ttc: number;
  km_an: number;
  prix_km_sup: number;
  transport: { mode: "offert" | "chiffre"; prix_ht?: number; adresse?: string };
  date_livraison_souhaitee?: string;
  jour_prelevement: number;
  /** Version des CG figée à la création (date) */
  cg_version: string;
  controle?: ControleContratLLD;
  pdf_url?: string;
  pdf_signe_url?: string;
  signature_jeton?: string;
  zone_signature?: { page: number; x: number; y: number; w: number; h: number };
  /** Positions des champs remplis par le serveur à la signature (SEPA, fiche locataire, fait le / à) */
  champs_pdf?: Record<string, { page: number; x: number; y: number; w: number; taille: number; lignes?: number; cases?: number; pas?: number; h?: number; type?: "texte" | "cases" | "case" | "zone" }>;
  /** Lot 4 : lien envoyé */
  envoye_le?: string;
  /** Référence unique du mandat SEPA (générée à l'envoi du lien) */
  rum?: string;
  /** Nouveau client : CNI et RIB obligatoires à la signature */
  nouveau_client?: boolean;
  signature?: { nom: string; fonction?: string; email?: string; date: string; ip?: string; navigateur?: string; cg_version?: string; empreinte_original?: string; empreinte_signe?: string };
  /** Pièces déposées à la signature (chemins Storage privés, téléchargement via l'API) */
  pieces?: { cni?: PieceContratLLD; rib?: PieceContratLLD };
  signe_le?: string;
  cree_par?: string;
  cree_le?: string;
  modifie_le?: string;
  historique?: { date: string; action: string; par: string }[];
}

export interface PieceContratLLD { chemin: string; nom: string; type: string; taille: number; le: string }

/** 🔒 Données bancaires du contrat (collection contrats_lld_prive, Jonathan + assistantes) */
export interface ContratLLDPrive {
  titulaire?: string;
  adresse_titulaire?: string;
  iban?: string;
  bic?: string;
  rum?: string;
  signe_le?: string;
}
