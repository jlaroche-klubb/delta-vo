import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc, setDoc, Timestamp, deleteField } from "firebase/firestore";
import { db, dbNacelleExpert } from "../firebase";
import {
  Machine,
  EtapePrepa,
  creerEtapesPrepa,
  FicheCommerciale,
  PhotoSupplementaire,
  DocumentVO,
} from "../types/machine";
import { MOCK_MACHINES } from "../data/mockMachines";
import { MOCK_DISPONIBLES } from "../data/mockDisponibles";
import { MOCK_EN_COURS } from "../data/mockEnCours";
import { MOCK_CLOTUREES } from "../data/mockCloturees";
import { syncHubspotProduct } from "../services/hubspotService";
import { getAllExpertises } from "../services/nacelleExpertService";
import { pushInfosAdminToNacelleExpert } from "../services/nacelleExpertPushService";
import { normalizeImmat } from "../utils/immat";
import type { ParsedStockMachine } from "../utils/importStock";
import { computeVogUpdates, buildNewVogDoc } from "../utils/importVogMerge";

export interface StockImportSummary {
  created: number;
  merged: number;
  skipped: number;
  archived: number;
  details: { ref: string; action: string }[];
}

// Libellé "type + porteur" pour le nom du produit HubSpot (ex. "KL26 Renault Master PLT")
function modeleLabel(m?: Machine): string | undefined {
  if (!m) return undefined;
  return `${m.type_nacelle ?? ""} ${m.modele_porteur ?? ""}`.trim() || undefined;
}

/**
 * Aplatit le champ photos d'un dossier Nacelle-Expert.
 * Dans Nacelle-Expert, depart.photos / retour.photos sont des OBJETS indexés par zone :
 *   { carrosserie: [{name,url,path}], tour_complet_av_droit: [{url}], degat_xxx: [{url}], ... }
 * On renvoie un tableau plat d'URLs. Les photos de dégâts (clés "degat_") sont exclues
 * car ce sont des gros plans de casse, peu pertinents pour une galerie commerciale.
 * Gère aussi le cas legacy où photos serait déjà un tableau.
 */
function flattenNePhotos(val: any): string[] | undefined {
  if (!val) return undefined;
  let urls: string[] = [];
  if (Array.isArray(val)) {
    urls = val.map((p: any) => (typeof p === "string" ? p : p?.url)).filter(Boolean);
  } else if (typeof val === "object") {
    urls = Object.entries(val)
      .filter(([key]) => !key.startsWith("degat_"))
      .flatMap(([, arr]) => (Array.isArray(arr) ? arr : []))
      .map((p: any) => (typeof p === "string" ? p : p?.url))
      .filter(Boolean);
  }
  return urls.length ? urls : undefined;
}

/**
 * Infos administratives modifiables sur une fiche machine
 * (secrétaire/ADV) — JAMAIS les photos ni le contenu d'expertise.
 */
export interface InfosAdminUpdate {
  client_precedent?: string;
  contrat?: string;
  email_client?: string;
  modele_porteur?: string;
  type_nacelle?: string;
  annee_circulation?: string;
}

interface MachinesContextType {
  machines: Machine[];
  toggleEtapeRestitution: (
    machineId: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) => void;
  setDateDemandeRecup: (machineId: string, date: string) => void;
  createMachineRestitution: (machine: Machine) => void;
  updateInfosAdmin: (machineId: string, infos: InfosAdminUpdate) => Promise<boolean>;
  pushRestitutionsToNacelleExpert: () => Promise<{ pushed: number; total: number }>;
  updatePrice: (
    machineId: string,
    prixFr: number | undefined,
    prixDealer: number | undefined,
    userName: string,
    manuel: boolean,
    numeroDossier?: string
  ) => void;
  basculerEnLld: (machineId: string, clientLld: string, dateMiseDispo: string, contrat?: string, emailClient?: string) => void;
  toggleEtapePrepa: (machineId: string, etapeId: string, userName: string) => void;
  setEtapeNonNecessaire: (machineId: string, etapeId: string) => void;
  addEtapePrepa: (machineId: string, label: string) => void;
  removeEtapePrepa: (machineId: string, etapeId: string) => void;
  importStockMachines: (parsed: ParsedStockMachine[], archiveIds?: string[]) => Promise<StockImportSummary>;
  /** 💶 Circuit VNC : applique les VNC validées par la compta (import ADV) */
  updateVncValues: (items: { immat: string; nouvelle: number }[]) => Promise<number>;
  refreshExpertiseMontants: () => Promise<{ updated: number; matched: number; total: number }>;
  enregistrerChiffrageCorrige: (
    machineId: string,
    rapport: any,
    mode: "manuel" | "recalcul",
    par: string
  ) => Promise<void>;
  configureEnCours: (
    machineId: string,
    typePrepa: "normale" | "en_etat",
    acheteur: string,
    commercial: string,
    dateVente: string,
    dateLivraison: string,
    contrat?: string,
    emailClient?: string
  ) => void;
  cancelEnCours: (machineId: string) => void;  // ✅ Annuler mise en préparation
  modifierInfosVente: (machineId: string, infos: { acheteur: string; commercial_vendeur: string; date_vente: string; date_livraison_prevue: string; contrat?: string; email_client?: string }) => Promise<void>;
  marquerFacturee: (
    machineId: string,
    numeroFacture: string,
    dateFacturation: string
  ) => void;
  marquerPayee: (machineId: string, dateReglement: string) => void;
  marquerLivree: (machineId: string, par: string) => void;
  enregistrerEtudeMarche: (machineId: string, etude: any) => void;
  facturerRestitution: (
    machineId: string,
    numeroFacture: string,
    dateFacturation: string,
    facturePar: string
  ) => void;
  annulerFacturationRestitution: (machineId: string) => void;
  annulerCloture: (machineId: string) => void;  // ✅ Revenir en arrière (admin)
  updateFicheCommerciale: (machineId: string, fiche: FicheCommerciale) => void;
  updatePhotosSupplementaires: (machineId: string, photos: PhotoSupplementaire[]) => void;
  updatePhotosInternes: (machineId: string, photos: PhotoSupplementaire[]) => void; // 🔒 super admin
  updateShareToken: (machineId: string, token: string | null) => void;
  updateLocalite: (machineId: string, localite: string) => void;
  updateDocumentsVO: (machineId: string, documents: DocumentVO[]) => void;
  attribuerNumeroFiche: (machineId: string, numero: string) => void;
  syncExpertiseFromNacelleExpert: (expertiseData: {
    immat: string;
    modele_porteur: string;
    type_nacelle: string;
    annee_circulation?: string;
    heures_nacelle?: number;
    km_porteur?: number;
    rapport_expertise?: any;
    photos_commerciales?: any;
    agent_expert?: string;
    date_expertise: string;
  }) => void;
  deleteMachine: (machineId: string) => void;
  creerOffre: (machineIds: string[], clientOffre: string, montants: Record<string, number>, hubspotDealId?: string) => Promise<void>;
  annulerOffre: (machineId: string) => void;
}

const MachinesContext = createContext<MachinesContextType | undefined>(undefined);

function fusionnerMocks(): Machine[] {
  const all = [
    ...MOCK_MACHINES,
    ...MOCK_DISPONIBLES,
    ...MOCK_EN_COURS,
    ...MOCK_CLOTUREES,
  ];
  const map = new Map<string, Machine>();
  all.forEach((m) => map.set(m.id, m));
  return Array.from(map.values());
}

export function MachinesProvider({ children }: { children: ReactNode }) {
  const [mockMachines, setMockMachines] = useState<Machine[]>(() => fusionnerMocks());
  const [firebaseMachines, setFirebaseMachines] = useState<Machine[]>([]);
  // ✅ Photos de ventes "libres" prises dans Nacelle-Expert SANS dossier d'expertise
  // (collection photos_ventes/{IMMAT} du Firestore nacelle-expert, clés vente_*)
  const [ventesLibres, setVentesLibres] = useState<Record<string, any>>({});

  // ✅ ÉCOUTER LES PHOTOS DE VENTES LIBRES (Nacelle-Expert, temps réel)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(dbNacelleExpert, 'photos_ventes'),
      (snapshot) => {
        const map: Record<string, any> = {};
        snapshot.docs.forEach(d => {
          const data = d.data();
          if (data?.photos) map[d.id.toUpperCase()] = data.photos;
        });
        setVentesLibres(map);
        console.log(`📷 photos_ventes (Nacelle-Expert) : ${Object.keys(map).length} immat(s)`);
      },
      (error) => {
        console.error('❌ Écoute photos_ventes (Nacelle-Expert) impossible:', error);
      }
    );
    return () => unsub();
  }, []);

  // ✅ ÉCOUTER LA COLLECTION machines_vo EN TEMPS RÉEL
  useEffect(() => {
    console.log('🔄 Démarrage de l\'écoute Firebase machines_vo');
    
    let unsubscribe: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const subscribe = () => {
      if (cancelled) return;
      unsubscribe = onSnapshot(
      collection(db, 'machines_vo'),
      (snapshot) => {
        const machinesFromFirebase = snapshot.docs.map(d => {
          const data = d.data();
          
          // ✅ Respecter le statut depuis Firebase (par défaut "restitution")
          const statutFirebase = data.statut || 'restitution';
          
          // ✅ fiche_vo_creee dépend du statut
          const ficheVoCreee = statutFirebase === 'disponible' 
            ? (data.fiche_vo_creee ?? true)
            : (data.fiche_vo_creee ?? false);
          
          const machine: Machine = {
            id: d.id,
            immat: data.immat || '',
            modele_porteur: data.modele || '',
            type_nacelle: data.type_nacelle || '',
            annee_circulation: data.annee_fab || '',
            statut: statutFirebase,
            
            // ✅ Fallback sur les champs saisis par les secrétaires (page Restitutions)
            // quand la machine n'a pas (encore) de dossier d'expertise Nacelle-Expert.
            date_retour: data.dossier_nacelle_expert?.date_retour || data.date_retour || '',
            // ✅ Auto-remplir date_demande_recuperation (machine déjà récupérée)
            date_demande_recuperation: data.date_demande_recuperation || data.dossier_nacelle_expert?.date_retour || data.dossier_nacelle_expert?.date_depart || '',
            client_precedent: data.dossier_nacelle_expert?.client || data.client_precedent || '',
            contrat: data.dossier_nacelle_expert?.contrat || data.contrat || '',
            email_client: data.email_client || data.dossier_nacelle_expert?.email || undefined,

            // ⏳ Devis en attente (Nacelle Expert)
            devis_pending_labels: Array.isArray(data.devis_pending_labels) ? data.devis_pending_labels : [],
            devis_complet: data.devis_complet ?? null,
            devis_valide: data.devis_valide || null,
            devis_recu_items: Array.isArray(data.devis_recu_items) ? data.devis_recu_items : [],
            
            heures_nacelle: parseInt(data.heures) || undefined,
            km_porteur: parseInt(data.km_porteur) || undefined,
            
            // ✅ CORRECTION : commercialPhotos est un OBJET avec {av_droit: {url, type}, ...}
            // pas un tableau. On extrait les URLs.
            photos_commerciales: (() => {
              const cp = data.dossier_nacelle_expert?.photos_commerciales;
              if (!cp) return undefined;
              
              // Si c'est un objet (nouveau format Nacelle-Expert)
              if (typeof cp === 'object' && !Array.isArray(cp)) {
                const result: any = {};
                if (cp.av_droit?.url) result.av_droit = cp.av_droit.url;
                if (cp.av_gauche?.url) result.av_gauche = cp.av_gauche.url;
                if (cp.ar_droit?.url) result.ar_droit = cp.ar_droit.url;
                if (cp.ar_gauche?.url) result.ar_gauche = cp.ar_gauche.url;
                return Object.keys(result).length > 0 ? result : undefined;
              }
              
              // Si c'est un tableau (ancien format, retrocompatibilité)
              if (Array.isArray(cp) && cp[0]) {
                return {
                  av_droit: cp[0],
                  av_gauche: cp[1],
                  ar_droit: cp[2],
                  ar_gauche: cp[3],
                };
              }
              
              return undefined;
            })(),

            // ✅ Photos de ventes (Nacelle-Expert "vente_*", remplies après l'expertise).
            // Source canonique = dossier_nacelle_expert.photos_commerciales (même map que ci-dessus).
            // 3/4 av droit + 3/4 ar gauche détourées ; habitacles av/ar bruts.
            photos_ventes: (() => {
              const cp = data.dossier_nacelle_expert?.photos_commerciales;
              if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return undefined;
              const toUrl = (v: any): string | undefined =>
                !v ? undefined : (typeof v === 'string' ? v : (v.url || undefined));
              const result = {
                trois_quart_av_droit: toUrl(cp.vente_3_4_av_droit),
                trois_quart_ar_gauche: toUrl(cp.vente_3_4_ar_gauche),
                habitacle_av: toUrl(cp.vente_habitacle_av),
                habitacle_ar: toUrl(cp.vente_habitacle_ar),
              };
              return Object.values(result).some(Boolean) ? result : undefined;
            })(),

            // ✅ Photos supplémentaires (optionnelles) stockées dans Delta VO
            photos_supplementaires: Array.isArray(data.photos_supplementaires)
              ? data.photos_supplementaires
              : undefined,

            // 🔒 Photos internes (super admin uniquement)
            photos_internes: Array.isArray(data.photos_internes)
              ? data.photos_internes
              : undefined,

            // ✅ Pool de photos Nacelle-Expert (départ/retour) où piocher — lecture seule.
            // ⚠️ Dans Nacelle-Expert, .photos est un OBJET indexé par zone
            // ({ zoneId: [{url}], tour_complet_av_droit: [{url}], degat_xxx: [{url}] })
            // et non un tableau : on l'aplatit pour récupérer toutes les URLs.
            photos_ne_depart: flattenNePhotos(data.dossier_nacelle_expert?.photos_depart),
            photos_ne_retour: flattenNePhotos(data.dossier_nacelle_expert?.photos_retour),

            // ✅ Jeton du lien de partage galerie (si un lien actif existe)
            share_token: data.share_token || undefined,

            // ✅ Indicateurs depuis Firebase
            recuperation_ok: data.recuperation_ok ?? true,
            expertise_ok: data.expertise_ok ?? true,
            facture_ok: data.facture_ok ?? false,
            facture_reglee_ok: data.facture_reglee_ok ?? false,
            fiche_vo_creee: ficheVoCreee,
            // ✅ expertise_recue : true par défaut (docs historiques créés par la synchro),
            // false si écrit explicitement (machines créées par les secrétaires,
            // en attente d'expertise Nacelle-Expert).
            expertise_recue: data.expertise_recue ?? true,
            import_vog: data.import_vog ?? false,

            // 🚚 Hors vente : disponibilité du fichier VOG + retrait manuel
            // super admin (champs ÉCRITS par l'import et le bouton, mais qui
            // n'étaient jamais RELUS ici — d'où des exclusions sans effet)
            disponibilite_vog: data.disponibilite_vog || undefined,
            montant_expertise_vog: data.montant_expertise_vog ?? undefined,
            hors_vente_manuel: data.hors_vente_manuel ?? false,
            hors_vente_manuel_par: data.hors_vente_manuel_par || undefined,
            hors_vente_manuel_date: data.hors_vente_manuel_date || undefined,
            // 💶 Trace de l'outil « chiffrage à zéro » (même oubli de lecture)
            chiffrage_corrige: data.chiffrage_corrige || undefined,

            // 🗄️ Archivage (purge base VOG, machines hors périmètre) — récupérable
            archived: data.archived ?? false,
            archived_at: data.archived_at || undefined,
            archived_by: data.archived_by || undefined,
            
            // ✅ date_mise_stock pour les machines visibles en Disponibles
            // (disponible OU restitution avec expertise reçue) — sinon "Stock depuis le —"
            date_mise_stock:
              (statutFirebase === 'disponible' ||
                (statutFirebase === 'restitution' && (data.expertise_ok ?? true)))
                ? (data.date_ajout?.toDate?.()?.toISOString?.()?.slice(0, 10) ||
                   new Date().toISOString().slice(0, 10))
                : undefined,
              
            // ✅ Conserver les prix si présents — normaliser null -> undefined
            // (updatePrice écrit `null` quand un prix est effacé ; sans ça les
            //  composants qui gardent par `!== undefined` planteraient sur null.toLocaleString())
            prix_fr: data.prix_fr ?? undefined,
            prix_dealer: data.prix_dealer ?? undefined,
            numero_dossier: data.numero_dossier || undefined,
            prix_modifie_le: data.prix_modifie_le,
            prix_modifie_par: data.prix_modifie_par,
            prix_modifie_manuellement: data.prix_modifie_manuellement,

            // 🏷️ Nouvelle base VOG : N° occasion (référence commerciale externe) + admin
            numero_occasion: data.numero_occasion || undefined,
            proprietaire: data.proprietaire || undefined,
            categorie_vehicule: data.categorie_vehicule || undefined,
            numero_cube: data.numero_cube || undefined,
            histovec: data.histovec || undefined,
            num_chassis: data.num_chassis || undefined,
            etat_exterieur: data.etat_exterieur || undefined,
            etat_nacelle_vog: data.etat_nacelle_vog || undefined,
            etat_note_vog: data.etat_note_vog || undefined,
            date_mise_en_service: data.date_mise_en_service || undefined,
            fiche_occasion_vog: data.fiche_occasion_vog || undefined,
            date_ajout_vog: data.date_ajout_vog || undefined,
            carte_grise_vog: data.carte_grise_vog || undefined,
            date_prix_vog: data.date_prix_vog || undefined,
            km_note: data.km_note || undefined,
            heures_note: data.heures_note || undefined,
            vr_vnc: data.vr_vnc ?? undefined,
            vnc_maj_le: data.vnc_maj_le || undefined,
            diffusion: data.diffusion || undefined,
            
            // ✅ Conserver la fiche commerciale depuis Firebase
            fiche_commerciale: data.fiche_commerciale,
            
            // ✅ Conserver le rapport d'expertise
            rapport_expertise: data.rapport_expertise || data.dossier_nacelle_expert?.rapport_expertise,
            agent_expert: data.agent_expert || data.dossier_nacelle_expert?.agent_retour,
            dossier_nacelle_expert: data.dossier_nacelle_expert || undefined,
            localite: data.localite || "",
            documents_vo: data.documents_vo || [],
            
            // ✅ Champs de mise en cours / préparation (vente ou LLD)
            type_sortie: data.type_sortie || undefined,
            type_prepa: data.type_prepa || undefined,
            acheteur: data.acheteur || undefined,
            commercial_vendeur: data.commercial_vendeur || undefined,
            date_vente: data.date_vente || undefined,
            date_livraison_prevue: data.date_livraison_prevue || undefined,
            date_mise_en_cours: data.date_mise_en_cours || undefined,
            etapes_prepa: data.etapes_prepa || undefined,
            client_lld: data.client_lld || undefined,
            date_mise_dispo_lld: data.date_mise_dispo_lld || undefined,
            
            // ✅ Champs de facturation
            numero_facture: data.numero_facture || undefined,
            livraison_reelle: data.livraison_reelle || undefined,
            etude_marche: data.etude_marche || undefined,
            depart_constate_ne: data.depart_constate_ne || undefined,
            depart_constate_agent: data.depart_constate_agent || undefined,
            facture_resti_numero: data.facture_resti_numero || undefined,
            facture_resti_date: data.facture_resti_date || undefined,
            facture_resti_par: data.facture_resti_par || undefined,
            date_facturation: data.date_facturation || undefined,
            date_reglement: data.date_reglement || undefined,
            
            // ✅ Champs offre HubSpot
            offre_en_cours: data.offre_en_cours || undefined,
            client_offre: data.client_offre || undefined,
            montant_offre: data.montant_offre ?? undefined,
            hubspot_deal_id: data.hubspot_deal_id || undefined,
            date_offre: data.date_offre || undefined,
              
            createdAt: data.date_ajout?.toDate?.()?.toISOString?.() || new Date().toISOString(),
            updatedAt: data.date_modification?.toDate?.()?.toISOString?.(),
          };
          
          return machine;
        });
        
        console.log(`✅ ${machinesFromFirebase.length} machine(s) chargée(s) depuis Firebase`);
        setFirebaseMachines(machinesFromFirebase);
      },
      (error) => {
        // ⚠️ Le listener peut mourir définitivement lors d'une transition d'auth
        // (migration de domaine, deux comptes Google simultanés). On le relance
        // après 2s pour éviter une UI figée jusqu'au rechargement manuel.
        console.error('❌ Écoute Firebase interrompue — réabonnement dans 2s:', error);
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        if (!cancelled) retryTimer = setTimeout(subscribe, 2000);
      }
      );
    };

    subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ✅ FUSIONNER MOCK + Firebase + photos de ventes libres (Nacelle-Expert)
  const machines = useMemo(() => {
    const allMachines = [...mockMachines, ...firebaseMachines];
    const map = new Map<string, Machine>();

    allMachines.forEach((m) => {
      const key = m.immat.toUpperCase();
      if (!map.has(key) || m.expertise_recue) {
        map.set(key, m);
      }
    });

    // ✅ Superposer les photos de ventes prises SANS dossier d'expertise
    // (Nacelle-Expert, collection photos_ventes). Slot par slot : la photo
    // libre gagne si présente, sinon on garde celle du dossier d'expertise.
    const toUrl = (v: any): string | undefined =>
      !v ? undefined : (typeof v === 'string' ? v : (v.url || undefined));
    map.forEach((m, key) => {
      const vp = ventesLibres[key];
      if (!vp) return;
      const overlay: Record<string, string> = {};
      const oU = toUrl(vp.vente_3_4_av_droit);   if (oU) overlay.trois_quart_av_droit = oU;
      const oG = toUrl(vp.vente_3_4_ar_gauche);  if (oG) overlay.trois_quart_ar_gauche = oG;
      const hA = toUrl(vp.vente_habitacle_av);   if (hA) overlay.habitacle_av = hA;
      const hR = toUrl(vp.vente_habitacle_ar);   if (hR) overlay.habitacle_ar = hR;
      if (Object.keys(overlay).length) {
        // ⚖️ PRIORITÉ : les photos du dossier d'expertise (qui portent aussi
        // les remplacements faits dans Delta VO) passent DEVANT les photos de
        // ventes « libres » de Nacelle Expert — même précédence que côté NE.
        // Les photos libres ne servent qu'à combler les emplacements vides.
        const duDossier: Record<string, string> = {};
        Object.entries(m.photos_ventes || {}).forEach(([k, v]) => {
          if (v) duDossier[k] = v as string; // on ignore les slots vides
        });
        map.set(key, { ...m, photos_ventes: { ...overlay, ...duDossier } });
      }
    });

    return Array.from(map.values());
  }, [mockMachines, firebaseMachines, ventesLibres]);

  // Helper : vérifie si une machine vient de Firebase
  function isFirebaseMachine(machineId: string): boolean {
    return firebaseMachines.some(m => m.id === machineId);
  }

  // ====== FONCTIONS DE MODIFICATION ======
  
  async function toggleEtapeRestitution(
    machineId: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) {
    // Trouver la machine (peut être Firebase ou Mock)
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    
    const newVal = !machine[field];
    const updates: any = {
      [field]: newVal,
      updatedAt: new Date().toISOString(),
    };
    
    // ✅ Si les 4 étapes sont OK → bascule en "disponible"
    const wouldBeAllOk = 
      (field === "recuperation_ok" ? newVal : machine.recuperation_ok) &&
      (field === "expertise_ok" ? newVal : machine.expertise_ok) &&
      (field === "facture_ok" ? newVal : machine.facture_ok) &&
      (field === "facture_reglee_ok" ? newVal : machine.facture_reglee_ok);
    
    if (wouldBeAllOk && !machine.fiche_vo_creee && machine.statut === "restitution") {
      updates.fiche_vo_creee = true;
      updates.date_mise_stock = new Date().toISOString().slice(0, 10);
      updates.statut = "disponible";
      console.log(`✅ Machine ${machine.immat} basculée en disponible`);
    }

    // 🔄 HubSpot : l'étape Expertise validée fait entrer la machine dans les
    // Disponibles → si elle a déjà un prix (retour de location), elle
    // RERENTRE automatiquement dans le catalogue produits.
    if (field === "expertise_ok" && newVal && !machine.archived && (machine.prix_fr ?? 0) > 0) {
      syncHubspotProduct("upsert", machineId, modeleLabel(machine), machine.prix_fr);
    }
    
    // ✅ Si machine Firebase → mettre à jour Firestore
    if (isFirebaseMachine(machineId)) {
      try {
        const machineRef = doc(db, 'machines_vo', machineId);
        await updateDoc(machineRef, updates);
        console.log(`✅ Firebase mis à jour pour ${machine.immat}`);
      } catch (err) {
        console.error(`❌ Erreur Firebase update:`, err);
      }
    } else {
      // Machine mock → mettre à jour state local
      setMockMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m))
      );
    }
  }

  async function setDateDemandeRecup(machineId: string, date: string) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, 'machines_vo', machineId), {
          date_demande_recuperation: date,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('❌ Erreur:', err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, date_demande_recuperation: date, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function createMachineRestitution(machine: Machine) {
    // ⚠️ Normalisation SIV (AB-123-CD) : même clé de jointure que Nacelle Expert
    const immatId = normalizeImmat((machine.immat || "").trim());

    // ✅ PERSISTANCE FIREBASE : la machine est écrite dans machines_vo
    // (ID = immat MAJUSCULES, clé de jointure avec Nacelle-Expert et VOG).
    // Avant, la machine n'existait qu'en mémoire et disparaissait au rechargement.
    try {
      await setDoc(
        doc(db, "machines_vo", immatId),
        {
          immat: immatId,
          modele: machine.modele_porteur || "",
          type_nacelle: machine.type_nacelle || "",
          annee_fab: machine.annee_circulation || "",
          client_precedent: machine.client_precedent || "",
          contrat: machine.contrat || "",
          email_client: machine.email_client || "",
          date_retour: machine.date_retour || "",
          statut: "restitution",
          recuperation_ok: false,
          expertise_ok: false,
          facture_ok: false,
          facture_reglee_ok: false,
          fiche_vo_creee: false,
          expertise_recue: false, // ⏳ Pas encore d'expertise Nacelle-Expert
          date_ajout: new Date(),
          date_modification: new Date(),
        },
        { merge: true }
      );
      console.log(`✅ Restitution ${immatId} créée dans Firebase`);
    } catch (err) {
      console.error("❌ Erreur création restitution Firebase:", err);
      // Fallback : au moins visible localement pour ne pas bloquer la saisie
      setMockMachines((prev) => [machine, ...prev]);
    }

    // 📤 SYNCHRO INVERSE : pré-créer/compléter le dossier Nacelle Expert
    // pour que l'expert retrouve client + contrat + email pré-remplis.
    pushInfosAdminToNacelleExpert({
      immat: immatId,
      client: machine.client_precedent,
      contrat: machine.contrat,
      email: machine.email_client,
      modele: machine.modele_porteur,
      type_nacelle: machine.type_nacelle,
      annee_fab: machine.annee_circulation,
    });
  }

  /**
   * ✏️ Modifier les infos ADMINISTRATIVES d'une fiche (secrétaire/ADV) :
   * client, contrat, email, modèle... — y compris sur les fiches arrivées
   * par la synchro d'expertise. Les photos et le contenu d'expertise
   * (zones, dégâts, signatures) ne sont JAMAIS touchés.
   * La correction est répercutée vers le dossier Nacelle Expert.
   */
  async function updateInfosAdmin(
    machineId: string,
    infos: InfosAdminUpdate
  ): Promise<boolean> {
    const machine = machines.find((m) => m.id === machineId);
    const immat = (machine?.immat || machineId || "").trim().toUpperCase();

    if (isFirebaseMachine(machineId)) {
      try {
        const updates: any = {
          date_modification: new Date(),
          updatedAt: new Date().toISOString(),
        };
        // Champs canoniques du document machines_vo
        if (infos.client_precedent !== undefined) updates.client_precedent = infos.client_precedent;
        if (infos.contrat !== undefined) updates.contrat = infos.contrat;
        if (infos.email_client !== undefined) updates.email_client = infos.email_client;
        if (infos.modele_porteur !== undefined) updates.modele = infos.modele_porteur;
        if (infos.type_nacelle !== undefined) updates.type_nacelle = infos.type_nacelle;
        if (infos.annee_circulation !== undefined) updates.annee_fab = infos.annee_circulation;

        // Si la fiche vient d'une expertise, corriger aussi le bloc
        // dossier_nacelle_expert (prioritaire à l'affichage) — champs admin uniquement.
        if (machine?.dossier_nacelle_expert) {
          if (infos.client_precedent !== undefined)
            updates["dossier_nacelle_expert.client"] = infos.client_precedent;
          if (infos.contrat !== undefined)
            updates["dossier_nacelle_expert.contrat"] = infos.contrat;
          if (infos.email_client !== undefined)
            updates["dossier_nacelle_expert.email"] = infos.email_client;
        }

        await updateDoc(doc(db, "machines_vo", machineId), updates);
        console.log(`✅ Infos admin mises à jour pour ${immat}`);
      } catch (err) {
        console.error("❌ Erreur mise à jour infos admin:", err);
        return false;
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? {
                ...m,
                ...(infos.client_precedent !== undefined && { client_precedent: infos.client_precedent }),
                ...(infos.contrat !== undefined && { contrat: infos.contrat }),
                ...(infos.email_client !== undefined && { email_client: infos.email_client }),
                ...(infos.modele_porteur !== undefined && { modele_porteur: infos.modele_porteur }),
                ...(infos.type_nacelle !== undefined && { type_nacelle: infos.type_nacelle }),
                ...(infos.annee_circulation !== undefined && { annee_circulation: infos.annee_circulation }),
                updatedAt: new Date().toISOString(),
              }
            : m
        )
      );
    }

    // 📤 Répercuter la correction vers Nacelle Expert (bloc info uniquement)
    if (immat) {
      pushInfosAdminToNacelleExpert({
        immat,
        client: infos.client_precedent,
        contrat: infos.contrat,
        email: infos.email_client,
        modele: infos.modele_porteur,
        type_nacelle: infos.type_nacelle,
        annee_fab: infos.annee_circulation,
      });
    }
    return true;
  }

  /**
   * 🔄 RATTRAPAGE : pousser en une fois les infos admin de toutes les
   * machines en restitution vers Nacelle Expert (stock existant).
   * Déclenché manuellement par un bouton admin (page Restitutions).
   */
  async function pushRestitutionsToNacelleExpert(): Promise<{ pushed: number; total: number }> {
    const restitutions = machines.filter(
      (m) => !m.import_vog && !m.archived && m.statut === "restitution"
    );
    let pushed = 0;
    for (const m of restitutions) {
      const ok = await pushInfosAdminToNacelleExpert({
        immat: m.immat,
        client: m.client_precedent,
        contrat: m.contrat,
        email: m.email_client,
        modele: m.modele_porteur,
        type_nacelle: m.type_nacelle,
        annee_fab: m.annee_circulation,
      });
      if (ok) pushed++;
    }
    console.log(`🔄 Rattrapage Nacelle Expert : ${pushed}/${restitutions.length} restitutions poussées`);
    return { pushed, total: restitutions.length };
  }

  async function updatePrice(
    machineId: string,
    prixFr: number | undefined,
    prixDealer: number | undefined,
    userName: string,
    manuel: boolean,
    numeroDossier?: string
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const updates: any = {
      prix_fr: prixFr ?? null,
      prix_dealer: prixDealer ?? null,
      prix_modifie_le: today,
      prix_modifie_par: userName,
      prix_modifie_manuellement: manuel,
      updatedAt: new Date().toISOString(),
    };
    // N° de dossier : on ne l'écrit que s'il est fourni (le workflow Excel ne le passe pas)
    if (numeroDossier !== undefined) {
      updates.numero_dossier = numeroDossier.trim() || null;
    }
    
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, 'machines_vo', machineId), updates);
      } catch (err) {
        console.error('❌ Erreur update prix Firebase:', err);
      }
      // Synchro produit HubSpot : prix fixé -> upsert ; prix retiré -> archive
      const mm = machines.find((x) => x.id === machineId);
      if (prixFr && prixFr > 0) {
        syncHubspotProduct("upsert", machineId, modeleLabel(mm), prixFr);
      } else {
        syncHubspotProduct("archive", machineId);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, prix_fr: prixFr, prix_dealer: prixDealer, prix_modifie_le: today, prix_modifie_par: userName, prix_modifie_manuellement: manuel, ...(numeroDossier !== undefined ? { numero_dossier: numeroDossier.trim() || undefined } : {}), updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function basculerEnLld(machineId: string, clientLld: string, dateMiseDispo: string, contrat?: string, emailClient?: string) {
    // ✅ La LLD passe en "en_cours" mais NON CONFIGURÉE
    // → L'ADV/Admin devra choisir le type de prépa (normale / en l'état)
    const updates: any = {
      statut: "en_cours" as const,
      type_sortie: "lld" as const,
      // PAS de type_prepa : la machine sera "non configurée" pour que l'ADV choisisse
      type_prepa: null,
      client_lld: clientLld,
      acheteur: clientLld,
      date_mise_dispo_lld: dateMiseDispo,
      // 📋 Demandés à la mise en location : partent dans le pré-départ NE
      ...(contrat ? { contrat } : {}),
      ...(emailClient ? { email_client: emailClient } : {}),
      date_livraison_prevue: dateMiseDispo,
      date_mise_en_cours: new Date().toISOString(),
      etapes_prepa: null,
      updatedAt: new Date().toISOString(),
    };
    
    // Si machine Firebase, update Firestore
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, 'machines_vo', machineId), updates);
        console.log(`✅ Machine ${machineId} basculée en LLD → en_cours dans Firebase`);
      } catch (err) {
        console.error('❌ Erreur update LLD Firebase:', err);
      }
      // Machine sortie du stock -> archiver le produit HubSpot
      syncHubspotProduct("archive", machineId);
      // 🚚 Mise en location → pré-départ NE (client, contrat, email pré-remplis)
      pushPreDepartNacelleExpert(machines.find((x) => x.id === machineId), clientLld, contrat, emailClient);
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
    }
  }

  // 🚚 PRÉ-DÉPART : quand une machine est prête à SORTIR (prépa terminée,
  // vendue en l'état, ou bascule LLD), on pré-remplit son dossier Nacelle
  // Expert (client, modèle, type) — l'expert retrouve tout déjà rempli en
  // tapant l'immatriculation dans « + Nouveau départ ». Best-effort.
  // ⚠ RÉSERVÉ AUX LOCATIONS (validé avec Jonathan) : une machine VENDUE ne
  // fait pas l'objet d'une expertise départ — on ne pré-remplit Nacelle
  // Expert que pour les mises en location.
  function pushPreDepartNacelleExpert(m: Machine | undefined, client?: string, contrat?: string, email?: string) {
    if (!m?.immat) return;
    pushInfosAdminToNacelleExpert({
      immat: m.immat,
      client: (client || m.client_lld || m.acheteur || "").trim() || undefined,
      contrat: (contrat || m.contrat || "").trim() || undefined,
      email: (email || m.email_client || "").trim() || undefined,
      modele: m.modele_porteur || undefined,
      type_nacelle: m.type_nacelle || undefined,
      annee_fab: m.annee_circulation || undefined,
    }).catch(() => {});
  }

  const etapesToutesFaites = (etapes: EtapePrepa[] | null | undefined) =>
    !!etapes && etapes.length > 0 && etapes.every((e) => e.done || e.non_necessaire);

  async function toggleEtapePrepa(machineId: string, etapeId: string, userName: string) {
    const now = new Date().toISOString();
    const machine = machines.find((m) => m.id === machineId);
    if (!machine || !machine.etapes_prepa) return;

    // Calculer les nouvelles étapes : on coche/décoche "done"
    // Si on coche "done", on retire automatiquement "non_necessaire"
    const updatedEtapes = machine.etapes_prepa.map((e) => {
      if (e.id !== etapeId) return e;
      const newDone = !e.done;
      const next: any = {
        ...e,
        done: newDone,
        non_necessaire: newDone ? false : e.non_necessaire,
        done_by: newDone ? userName : undefined,
        done_at: newDone ? now : undefined,
      };
      // ⚠️ Firestore refuse `undefined` : au décochage on SUPPRIME les champs,
      // sinon l'enregistrement échoue silencieusement et l'étape « revient ».
      if (next.done_by === undefined) delete next.done_by;
      if (next.done_at === undefined) delete next.done_at;
      return next;
    });

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          etapes_prepa: updatedEtapes,
          updatedAt: now,
        });
      } catch (err) {
        console.error("❌ Erreur toggleEtapePrepa Firebase:", err);
      }
      // 🚚 Dernière étape validée → prête : pré-départ NE (LOCATIONS uniquement)
      if (machine.type_sortie === "lld" && !etapesToutesFaites(machine.etapes_prepa) && etapesToutesFaites(updatedEtapes)) {
        pushPreDepartNacelleExpert(machine);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, etapes_prepa: updatedEtapes, updatedAt: now } : m
        )
      );
    }
  }

  async function setEtapeNonNecessaire(machineId: string, etapeId: string) {
    const now = new Date().toISOString();
    const machine = machines.find((m) => m.id === machineId);
    if (!machine || !machine.etapes_prepa) return;

    // Toggle "non_necessaire". Si on active, on retire "done"
    const updatedEtapes = machine.etapes_prepa.map((e) => {
      if (e.id !== etapeId) return e;
      const newNA = !e.non_necessaire;
      // ⚠️ Firestore refuse `undefined` : on retire réellement done_by/done_at
      // au lieu de les mettre à undefined (sinon le clic n'enregistrait RIEN,
      // et sur une location le pré-départ Nacelle Expert pouvait ne jamais partir).
      const next: any = {
        ...e,
        non_necessaire: newNA,
        done: newNA ? false : e.done,
      };
      delete next.done_by;
      delete next.done_at;
      return next;
    });

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          etapes_prepa: updatedEtapes,
          updatedAt: now,
        });
        // 🚚 Dernière étape réglée → prête : pré-départ NE (LOCATIONS uniquement)
        if (machine.type_sortie === "lld" && !etapesToutesFaites(machine.etapes_prepa) && etapesToutesFaites(updatedEtapes)) {
          pushPreDepartNacelleExpert(machine);
        }
      } catch (err) {
        console.error("❌ Erreur setEtapeNonNecessaire Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, etapes_prepa: updatedEtapes, updatedAt: now } : m
        )
      );
    }
  }

  async function addEtapePrepa(machineId: string, label: string) {
    const clean = (label || "").trim();
    if (!clean) return;
    const now = new Date().toISOString();
    const machine = machines.find((m) => m.id === machineId);
    if (!machine) return;

    const newEtape = {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: clean,
      done: false,
      non_necessaire: false,
      has_na: true,
      custom: true,
    };
    const updatedEtapes = [...(machine.etapes_prepa || []), newEtape];

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          etapes_prepa: updatedEtapes,
          updatedAt: now,
        });
      } catch (err) {
        console.error("❌ Erreur addEtapePrepa Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, etapes_prepa: updatedEtapes, updatedAt: now } : m
        )
      );
    }
  }

  async function removeEtapePrepa(machineId: string, etapeId: string) {
    const now = new Date().toISOString();
    const machine = machines.find((m) => m.id === machineId);
    if (!machine || !machine.etapes_prepa) return;

    const updatedEtapes = machine.etapes_prepa.filter((e) => e.id !== etapeId);

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          etapes_prepa: updatedEtapes,
          updatedAt: now,
        });
      } catch (err) {
        console.error("❌ Erreur removeEtapePrepa Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, etapes_prepa: updatedEtapes, updatedAt: now } : m
        )
      );
    }
  }

  // 💶 Outil super admin « chiffrage à zéro » : enregistre un rapport
  // d'expertise corrigé (recalcul barème ou saisie manuelle) avec traçabilité.
  async function enregistrerChiffrageCorrige(
    machineId: string,
    rapport: any,
    mode: "manuel" | "recalcul",
    par: string
  ) {
    const now = new Date().toISOString();
    if (isFirebaseMachine(machineId)) {
      await updateDoc(doc(db, "machines_vo", machineId), {
        rapport_expertise: rapport,
        chiffrage_corrige: { mode, par, date: now },
        updatedAt: now,
      });
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, rapport_expertise: rapport, chiffrage_corrige: { mode, par, date: now }, updatedAt: now }
            : m
        )
      );
    }
  }

  async function refreshExpertiseMontants(): Promise<{ updated: number; matched: number; total: number }> {
    const expertises = await getAllExpertises();

    // Index par immatriculation (MAJUSCULES)
    const byImmat = new Map<string, any>();
    for (const e of expertises) {
      const im = (e.immatriculation || "").trim().toUpperCase();
      if (im) byImmat.set(im, e);
    }

    let updated = 0;
    let matched = 0;

    for (const m of machines) {
      const im = (m.immat || "").trim().toUpperCase();
      if (!im) continue;
      const exp = byImmat.get(im);
      if (!exp) continue;
      matched++;

      const rapport = {
        total_retenue_ht: typeof exp.total_retenue_ht === "number" ? exp.total_retenue_ht : 0,
        degats: Array.isArray(exp.degats)
          ? exp.degats.map((d: any) => ({
              zone: d.zone || "",
              description: d.description || "",
              montant: typeof d.montant === "number" ? d.montant : 0,
            }))
          : [],
        agent: exp.agent,
        heures_nacelle: exp.heures_nacelle,
        km_porteur: exp.km_porteur,
        notes: exp.notes,
      };

      try {
        await updateDoc(doc(db, "machines_vo", m.id), {
          rapport_expertise: rapport,
          updatedAt: new Date().toISOString(),
        });
        updated++;
      } catch (e) {
        console.warn("MAJ expertise impossible pour", m.id, e);
      }
    }

    return { updated, matched, total: machines.length };
  }

  async function importStockMachines(parsed: ParsedStockMachine[], archiveIds: string[] = []): Promise<StockImportSummary> {
    // ⚠ La logique de fusion vit dans utils/importVogMerge.ts, PARTAGÉE avec la
    // simulation à blanc : le rapport montré avant import = ce qui est écrit ici.
    let created = 0;
    let merged = 0;
    let skipped = 0;
    const details: { ref: string; action: string }[] = [];

    for (const p of parsed) {
      const now = new Date().toISOString();
      // Match par ID de document OU par immatriculation (MAJUSCULES) : un ancien
      // document à ID non normalisé doit fusionner, jamais créer un doublon.
      const existing = machines.find(
        (m) => m.id === p.docId || m.immat.toUpperCase() === p.docId
      );

      if (existing) {
        const { updates } = computeVogUpdates(existing, p);
        const significatif = Object.keys(updates).filter((k) => k !== "import_vog");
        if (significatif.length > 0 || !existing.import_vog) {
          updates.updatedAt = now;
          try {
            // On écrit sur l'ID du doc RÉELLEMENT trouvé (existing.id), pas sur
            // p.docId : sinon un match par immat sur un doc legacy créerait un doublon.
            await updateDoc(doc(db, "machines_vo", existing.id), updates);
            merged++;
            details.push({ ref: p.source, action: "mise à jour" });
          } catch (e) {
            skipped++;
            details.push({ ref: p.source, action: "erreur MAJ" });
            continue;
          }
        } else {
          skipped++;
          details.push({ ref: p.source, action: "déjà à jour" });
        }
        const prix = (updates.prix_fr as number | undefined) ?? existing.prix_fr;
        if (prix) {
          const label = `${existing.type_nacelle || p.type_nacelle} ${existing.modele_porteur || p.modele_porteur}`.trim();
          await syncHubspotProduct("upsert", p.docId, label, prix);
        }
      } else {
        // Nouvelle machine du stock VOG
        const newDoc = buildNewVogDoc(p);
        newDoc.date_ajout = Timestamp.fromDate(new Date());
        try {
          await setDoc(doc(db, "machines_vo", p.docId), newDoc);
          created++;
          details.push({ ref: p.source, action: "créée" });
          if (p.prix_fr != null) {
            await syncHubspotProduct(
              "upsert",
              p.docId,
              `${p.type_nacelle} ${p.modele_porteur}`.trim(),
              p.prix_fr
            );
          }
        } catch (e) {
          skipped++;
          details.push({ ref: p.source, action: "erreur création" });
        }
      }
    }

    // 🗄️ Purge exceptionnelle « base de départ VOG » : ARCHIVAGE (récupérable)
    // des machines hors fichier et hors restitutions en cours. Jamais de delete.
    let archived = 0;
    for (const id of archiveIds) {
      try {
        await updateDoc(doc(db, "machines_vo", id), {
          archived: true,
          archived_at: new Date().toISOString(),
          archived_by: "Purge base VOG",
          updatedAt: new Date().toISOString(),
        });
        archived++;
        details.push({ ref: id, action: "archivée (purge VOG)" });
        // 🗄️ HubSpot : machine archivée → SORT du catalogue (best-effort)
        await syncHubspotProduct("archive", id);
      } catch (e) {
        details.push({ ref: id, action: "erreur archivage" });
      }
    }

    return { created, merged, skipped, archived, details };
  }

  // 💶 Circuit VNC : applique les VNC du fichier compta (correspondance par immat,
  // seule la VNC est modifiée). Retourne le nombre de machines mises à jour.
  async function updateVncValues(items: { immat: string; nouvelle: number }[]): Promise<number> {
    let updated = 0;
    const today = new Date().toISOString().slice(0, 10);
    for (const it of items) {
      const machine = machines.find((m) => m.immat.toUpperCase() === it.immat.toUpperCase());
      if (!machine) continue;
      try {
        await updateDoc(doc(db, "machines_vo", machine.id), {
          vr_vnc: it.nouvelle,
          vnc_maj_le: today,
          updatedAt: new Date().toISOString(),
        });
        updated++;
      } catch (e) {
        console.warn("MAJ VNC impossible pour", it.immat, e);
      }
    }
    return updated;
  }

  async function configureEnCours(
    machineId: string,
    typePrepa: "normale" | "en_etat",
    acheteur: string,
    commercial: string,
    dateVente: string,
    dateLivraison: string,
    contrat?: string,
    emailClient?: string
  ) {
    const now = new Date().toISOString();
    // 🔁 Une machine réservée en LOCATION reste une location quand on
    // configure sa préparation (ne pas l'écraser en « vente »)
    const machineCfg = machines.find((x) => x.id === machineId);
    const estLocation = machineCfg?.type_sortie === "lld";
    const updates = {
      statut: "en_cours" as const,        // ✅ Bug 3 : Passer en en_cours
      type_sortie: (estLocation ? "lld" : "vente") as any,
      // 📋 Location : contrat + email demandés à la configuration
      ...(contrat ? { contrat } : {}),
      ...(emailClient ? { email_client: emailClient } : {}),
      type_prepa: typePrepa,
      acheteur,
      commercial_vendeur: commercial,
      date_vente: dateVente,
      date_livraison_prevue: dateLivraison,
      date_mise_en_cours: now,
      etapes_prepa: creerEtapesPrepa(typePrepa),
      updatedAt: now,
    };
    
    // Si machine Firebase, update Firestore
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, 'machines_vo', machineId), updates);
        console.log(`✅ Machine ${machineId} configurée en_cours (vente) dans Firebase`);
      } catch (err) {
        console.error('❌ Erreur configureEnCours Firebase:', err);
      }
      // 🗄️ HubSpot : machine vendue / partie en préparation → SORT du catalogue
      // (le serveur ne supprime que les produits marqués Delta VO — règle stricte)
      syncHubspotProduct("archive", machineId);
      // 🚚 LOCATION configurée → pré-départ NE (client, contrat, email).
      //    Une VENTE ne déclenche jamais d'expertise départ (validé Jonathan).
      if (estLocation) {
        pushPreDepartNacelleExpert(machineCfg, machineCfg?.client_lld || acheteur, contrat, emailClient);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
    }
  }

  // ✏️ Correction des informations de vente d'une machine DÉJÀ en préparation
  // (faute de frappe sur l'acheteur, commercial, dates, contrat/email LLD) —
  // sans toucher au type de préparation ni aux étapes déjà avancées.
  async function modifierInfosVente(
    machineId: string,
    infos: { acheteur: string; commercial_vendeur: string; date_vente: string; date_livraison_prevue: string; contrat?: string; email_client?: string }
  ) {
    const now = new Date().toISOString();
    const m = machines.find((x) => x.id === machineId);
    const updates: Record<string, any> = {
      acheteur: infos.acheteur,
      // 🚚 Location : la carte affiche client_lld → on le corrige aussi
      ...(m?.type_sortie === "lld" ? { client_lld: infos.acheteur } : {}),
      commercial_vendeur: infos.commercial_vendeur,
      date_vente: infos.date_vente,
      date_livraison_prevue: infos.date_livraison_prevue,
      ...(infos.contrat !== undefined ? { contrat: infos.contrat } : {}),
      ...(infos.email_client !== undefined ? { email_client: infos.email_client } : {}),
      updatedAt: now,
    };
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
      } catch (err) {
        console.error("❌ Erreur modifierInfosVente Firebase:", err);
      }
    } else {
      setMockMachines((prev) => prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m)));
    }
  }

  async function cancelEnCours(machineId: string) {
    // ✅ Annule la mise en préparation : retour en "disponible"
    const updates = {
      statut: "disponible" as const,
      type_sortie: null,
      type_prepa: null,
      acheteur: null,
      commercial_vendeur: null,
      date_vente: null,
      date_livraison_prevue: null,
      date_mise_en_cours: null,
      etapes_prepa: null,
      client_lld: null,
      date_mise_dispo_lld: null,
      updatedAt: new Date().toISOString(),
    };
    
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, 'machines_vo', machineId), updates as any);
        console.log(`✅ Machine ${machineId} remise en disponible (annulation prépa)`);
      } catch (err) {
        console.error('❌ Erreur cancelEnCours Firebase:', err);
      }
      // Retour en stock -> re-publier le produit HubSpot si la machine a un prix
      // ⛔ sauf machine ARCHIVÉE (vendue/sortie du parc) : annuler sa prépa ne
      // doit pas la faire réapparaître dans le catalogue HubSpot
      const mm = machines.find((x) => x.id === machineId);
      if (mm?.prix_fr && mm.prix_fr > 0 && !mm.archived) {
        syncHubspotProduct("upsert", machineId, modeleLabel(mm), mm.prix_fr);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? ({ ...m, ...updates } as unknown as Machine) : m
        )
      );
    }
  }

  async function marquerFacturee(
    machineId: string,
    numeroFacture: string,
    dateFacturation: string
  ) {
    const updates = {
      numero_facture: numeroFacture,
      date_facturation: dateFacturation,
      statut: "cloturee" as const,
      updatedAt: new Date().toISOString(),
    };

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
        console.log(`✅ Machine ${machineId} facturée → clôturée dans Firebase`);
      } catch (err) {
        console.error("❌ Erreur marquerFacturee Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
    }
  }

  // 📊 ÉTUDE DE MARCHÉ IA (super admin) : enregistrée sur la machine,
  // reprise dans l'Export Pricing PDG.
  async function enregistrerEtudeMarche(machineId: string, etude: any) {
    const updates = { etude_marche: etude, updatedAt: new Date().toISOString() };
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
      } catch (err) {
        console.error("❌ Erreur enregistrerEtudeMarche:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m))
      );
    }
  }

  // 🚚 LIVRAISON RÉELLE d'une VENTE (validé avec Jonathan) : cochée par
  // l'ADV quand le camion part — éteint l'alerte « retard de livraison ».
  async function marquerLivree(machineId: string, par: string) {
    const updates = {
      livraison_reelle: { date: new Date().toISOString().slice(0, 10), par },
      updatedAt: new Date().toISOString(),
    };
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
      } catch (err) {
        console.error("❌ Erreur marquerLivree:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m))
      );
    }
  }

  // 🧾 FACTURE DE REMISE EN ÉTAT (onglet Restitutions) — validée avec Jonathan :
  // n° de facture OBLIGATOIRE (demandé par la fenêtre de confirmation), date et
  // nom enregistrés et affichés sous l'étape, annulation réservée aux admins.
  async function facturerRestitution(
    machineId: string,
    numeroFacture: string,
    dateFacturation: string,
    facturePar: string
  ) {
    const updates: any = {
      facture_ok: true,
      facture_resti_numero: numeroFacture,
      facture_resti_date: dateFacturation,
      facture_resti_par: facturePar,
      updatedAt: new Date().toISOString(),
    };
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
      } catch (err) {
        console.error("❌ Erreur facturerRestitution:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m))
      );
    }
  }

  // Annulation (admins uniquement — contrôle fait côté page) : on efface aussi
  // le n°, la date et le nom pour ne pas laisser de fausses informations.
  async function annulerFacturationRestitution(machineId: string) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          facture_ok: false,
          facture_resti_numero: deleteField(),
          facture_resti_date: deleteField(),
          facture_resti_par: deleteField(),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("❌ Erreur annulerFacturationRestitution:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? {
                ...m,
                facture_ok: false,
                facture_resti_numero: undefined,
                facture_resti_date: undefined,
                facture_resti_par: undefined,
              }
            : m
        )
      );
    }
  }

  async function marquerPayee(machineId: string, dateReglement: string) {
    const updates = {
      date_reglement: dateReglement,
      updatedAt: new Date().toISOString(),
    };

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
        console.log(`✅ Machine ${machineId} marquée payée dans Firebase`);
      } catch (err) {
        console.error("❌ Erreur marquerPayee Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
    }
  }

  async function annulerCloture(machineId: string) {
    // ✅ Revenir en arrière : la machine clôturée repasse en "en_cours"
    // On efface la facture et le règlement
    const updates: any = {
      statut: "en_cours" as const,
      numero_facture: null,
      date_facturation: null,
      date_reglement: null,
      updatedAt: new Date().toISOString(),
    };

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
        console.log(`✅ Clôture annulée pour ${machineId} → retour en cours`);
      } catch (err) {
        console.error("❌ Erreur annulerCloture Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? ({ ...m, ...updates } as unknown as Machine) : m
        )
      );
    }
  }

  async function updateFicheCommerciale(machineId: string, fiche: FicheCommerciale) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          fiche_commerciale: fiche,
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ Fiche commerciale mise à jour dans Firebase`);
      } catch (err) {
        console.error("❌ Erreur Firebase fiche:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, fiche_commerciale: fiche, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function updatePhotosSupplementaires(
    machineId: string,
    photos: PhotoSupplementaire[]
  ) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          photos_supplementaires: photos,
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ Photos supplémentaires mises à jour dans Firebase`);
      } catch (err) {
        console.error("❌ Erreur Firebase photos supplémentaires:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, photos_supplementaires: photos, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  // 🔒 Photos internes du stock — réservées au super admin (jamais côté client)
  async function updatePhotosInternes(
    machineId: string,
    photos: PhotoSupplementaire[]
  ) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          photos_internes: photos,
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ Photos internes mises à jour dans Firebase`);
      } catch (err) {
        console.error("❌ Erreur Firebase photos internes:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, photos_internes: photos, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function updateShareToken(machineId: string, token: string | null) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          share_token: token || "",
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("❌ Erreur Firebase share_token:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, share_token: token || undefined, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function updateLocalite(machineId: string, localite: string) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          localite: localite || "",
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("❌ Erreur Firebase localite:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, localite, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function updateDocumentsVO(machineId: string, documents: DocumentVO[]) {
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          documents_vo: documents,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("❌ Erreur Firebase documents_vo:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, documents_vo: documents, updatedAt: new Date().toISOString() }
            : m
        )
      );
    }
  }

  async function attribuerNumeroFiche(machineId: string, numero: string) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    
    const updatedFiche = {
      ...(machine.fiche_commerciale || {}),
      numero_fiche: numero,
      date_creation_fiche: new Date().toISOString().slice(0, 10),
    };
    
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          fiche_commerciale: updatedFiche,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("❌ Erreur Firebase numéro fiche:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? {
                ...m,
                fiche_commerciale: updatedFiche,
                updatedAt: new Date().toISOString(),
              }
            : m
        )
      );
    }
  }

  function syncExpertiseFromNacelleExpert(expertiseData: {
    immat: string;
    modele_porteur: string;
    type_nacelle: string;
    annee_circulation?: string;
    heures_nacelle?: number;
    km_porteur?: number;
    rapport_expertise?: any;
    photos_commerciales?: any;
    agent_expert?: string;
    date_expertise: string;
  }) {
    setMockMachines((prev) => {
      const existingIndex = prev.findIndex(
        (m) => m.immat.toUpperCase() === expertiseData.immat.toUpperCase()
      );
      
      if (existingIndex !== -1) {
        console.log(`🔄 MAJ expertise pour ${expertiseData.immat}`);
        const updated = [...prev];
        const existing = updated[existingIndex];
        
        updated[existingIndex] = {
          ...existing,
          heures_nacelle: expertiseData.heures_nacelle ?? existing.heures_nacelle,
          km_porteur: expertiseData.km_porteur ?? existing.km_porteur,
          rapport_expertise: expertiseData.rapport_expertise ?? existing.rapport_expertise,
          photos_commerciales: expertiseData.photos_commerciales ?? existing.photos_commerciales,
          agent_expert: expertiseData.agent_expert ?? existing.agent_expert,
          recuperation_ok: true,
          expertise_ok: true,
          expertise_recue: true,
          date_expertise_recue: expertiseData.date_expertise,
          updatedAt: new Date().toISOString(),
        };
        
        // ✅ Machine reste en "restitution" pour suivre la facturation
        return updated;
      } else {
        console.log(`➕ Restitution ${expertiseData.immat} créée`);
        
        const newMachine: Machine = {
          id: "M" + Date.now().toString().slice(-6),
          immat: expertiseData.immat.toUpperCase(),
          modele_porteur: expertiseData.modele_porteur,
          type_nacelle: expertiseData.type_nacelle,
          annee_circulation: expertiseData.annee_circulation || "",
          heures_nacelle: expertiseData.heures_nacelle,
          km_porteur: expertiseData.km_porteur,
          rapport_expertise: expertiseData.rapport_expertise,
          photos_commerciales: expertiseData.photos_commerciales,
          agent_expert: expertiseData.agent_expert,
          date_retour: expertiseData.date_expertise,
          client_precedent: "Import nacelle-expert",
          contrat: "",
          statut: "restitution",
          recuperation_ok: true,
          expertise_ok: true,
          facture_ok: false,
          facture_reglee_ok: false,
          fiche_vo_creee: false,
          expertise_recue: true,
          date_expertise_recue: expertiseData.date_expertise,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        return [newMachine, ...prev];
      }
    });
  }

  async function deleteMachine(machineId: string) {
    if (isFirebaseMachine(machineId)) {
      try {
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(doc(db, "machines_vo", machineId));
        console.log(`✅ Machine supprimée de Firebase`);
      } catch (err) {
        console.error("❌ Erreur suppression Firebase:", err);
      }
      // 🗄️ HubSpot : machine supprimée → SORT du catalogue (règle stricte côté serveur)
      syncHubspotProduct("archive", machineId);
    } else {
      setMockMachines((prev) => prev.filter((m) => m.id !== machineId));
    }
  }

  async function creerOffre(
    machineIds: string[],
    clientOffre: string,
    montants: Record<string, number>,
    hubspotDealId?: string
  ) {
    const now = new Date().toISOString();

    for (const machineId of machineIds) {
      const updates: any = {
        offre_en_cours: true,
        client_offre: clientOffre,
        montant_offre: montants[machineId] ?? null,
        date_offre: now,
        updatedAt: now,
      };
      if (hubspotDealId) {
        updates.hubspot_deal_id = hubspotDealId;
      }

      if (isFirebaseMachine(machineId)) {
        try {
          await updateDoc(doc(db, "machines_vo", machineId), updates);
          console.log(`✅ Offre créée pour ${machineId} (client: ${clientOffre})`);
        } catch (err) {
          console.error(`❌ Erreur creerOffre Firebase pour ${machineId}:`, err);
        }
      } else {
        setMockMachines((prev) =>
          prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m))
        );
      }
    }
  }

  async function annulerOffre(machineId: string) {
    const updates: any = {
      offre_en_cours: false,
      client_offre: null,
      montant_offre: null,
      date_offre: null,
      hubspot_deal_id: null,
      updatedAt: new Date().toISOString(),
    };

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), updates);
        console.log(`✅ Offre annulée pour ${machineId}`);
      } catch (err) {
        console.error("❌ Erreur annulerOffre Firebase:", err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) => (m.id === machineId ? { ...m, ...updates } : m))
      );
    }
  }

  const value = useMemo(
    () => ({
      machines,
      toggleEtapeRestitution,
      setDateDemandeRecup,
      createMachineRestitution,
      updateInfosAdmin,
      pushRestitutionsToNacelleExpert,
      updatePrice,
      basculerEnLld,
      toggleEtapePrepa,
      setEtapeNonNecessaire,
      addEtapePrepa,
      removeEtapePrepa,
      importStockMachines,
      updateVncValues,
      refreshExpertiseMontants,
      enregistrerChiffrageCorrige,
      configureEnCours,
      cancelEnCours,
      modifierInfosVente,
      marquerFacturee,
      marquerPayee,
      marquerLivree,
      enregistrerEtudeMarche,
      facturerRestitution,
      annulerFacturationRestitution,
      annulerCloture,
      updateFicheCommerciale,
      updatePhotosSupplementaires,
      updatePhotosInternes,
      updateShareToken,
      updateLocalite,
      updateDocumentsVO,
      attribuerNumeroFiche,
      syncExpertiseFromNacelleExpert,
      deleteMachine,
      creerOffre,
      annulerOffre,
    }),
    [machines]
  );

  return <MachinesContext.Provider value={value}>{children}</MachinesContext.Provider>;
}

export function useMachines() {
  const ctx = useContext(MachinesContext);
  if (!ctx) {
    throw new Error("useMachines doit être utilisé dans MachinesProvider");
  }
  return ctx;
}

export function useMachinesFiltered(showArchived: boolean = false) {
  const ctx = useMachines();
  const filteredMachines = showArchived
    ? ctx.machines
    : ctx.machines.filter((m) => !m.archived);
  
  return {
    ...ctx,
    machines: filteredMachines,
  };
}
