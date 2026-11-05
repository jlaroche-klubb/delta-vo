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
  prestations_full: [
    { libelle: "Entretien et révisions de la nacelle", inclus: true },
    { libelle: "VGP semestrielle", inclus: true },
    { libelle: "Entretien du porteur", inclus: true },
    { libelle: "Assistance et dépannage", inclus: true },
    { libelle: "Carburant", inclus: false },
    { libelle: "Pneumatiques (hors option)", inclus: false },
  ],
  prestations_sans_entretien: [
    { libelle: "Entretien et révisions de la nacelle", inclus: false },
    { libelle: "VGP semestrielle", inclus: true },
    { libelle: "Entretien du porteur (à la charge du client)", inclus: false },
    { libelle: "Assistance et dépannage", inclus: true },
    { libelle: "Carburant", inclus: false },
    { libelle: "Pneumatiques (hors option)", inclus: false },
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
