import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import {
  Machine,
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
import type { ParsedStockMachine } from "../utils/importStock";

export interface StockImportSummary {
  created: number;
  merged: number;
  skipped: number;
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

interface MachinesContextType {
  machines: Machine[];
  toggleEtapeRestitution: (
    machineId: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) => void;
  setDateDemandeRecup: (machineId: string, date: string) => void;
  createMachineRestitution: (machine: Machine) => void;
  updatePrice: (
    machineId: string,
    prixFr: number | undefined,
    prixDealer: number | undefined,
    userName: string,
    manuel: boolean,
    numeroDossier?: string
  ) => void;
  basculerEnLld: (machineId: string, clientLld: string, dateMiseDispo: string) => void;
  toggleEtapePrepa: (machineId: string, etapeId: string, userName: string) => void;
  setEtapeNonNecessaire: (machineId: string, etapeId: string) => void;
  addEtapePrepa: (machineId: string, label: string) => void;
  removeEtapePrepa: (machineId: string, etapeId: string) => void;
  importStockMachines: (parsed: ParsedStockMachine[]) => Promise<StockImportSummary>;
  configureEnCours: (
    machineId: string,
    typePrepa: "normale" | "en_etat",
    acheteur: string,
    commercial: string,
    dateVente: string,
    dateLivraison: string
  ) => void;
  cancelEnCours: (machineId: string) => void;  // ✅ Annuler mise en préparation
  marquerFacturee: (
    machineId: string,
    numeroFacture: string,
    dateFacturation: string
  ) => void;
  marquerPayee: (machineId: string, dateReglement: string) => void;
  annulerCloture: (machineId: string) => void;  // ✅ Revenir en arrière (admin)
  updateFicheCommerciale: (machineId: string, fiche: FicheCommerciale) => void;
  updatePhotosSupplementaires: (machineId: string, photos: PhotoSupplementaire[]) => void;
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

  // ✅ ÉCOUTER LA COLLECTION machines_vo EN TEMPS RÉEL
  useEffect(() => {
    console.log('🔄 Démarrage de l\'écoute Firebase machines_vo');
    
    const unsubscribe = onSnapshot(
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
            
            date_retour: data.dossier_nacelle_expert?.date_retour || '',
            // ✅ Auto-remplir date_demande_recuperation (machine déjà récupérée)
            date_demande_recuperation: data.date_demande_recuperation || data.dossier_nacelle_expert?.date_retour || data.dossier_nacelle_expert?.date_depart || '',
            client_precedent: data.dossier_nacelle_expert?.client || '',
            contrat: data.dossier_nacelle_expert?.contrat || '',
            
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

            // ✅ Photos supplémentaires (optionnelles) stockées dans Delta VO
            photos_supplementaires: Array.isArray(data.photos_supplementaires)
              ? data.photos_supplementaires
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
            expertise_recue: true,
            
            // ✅ date_mise_stock pour les machines visibles en Disponibles
            // (disponible OU restitution avec expertise reçue) — sinon "Stock depuis le —"
            date_mise_stock:
              (statutFirebase === 'disponible' ||
                (statutFirebase === 'restitution' && (data.expertise_ok ?? true)))
                ? (data.date_ajout?.toDate?.()?.toISOString?.()?.slice(0, 10) ||
                   new Date().toISOString().slice(0, 10))
                : undefined,
              
            // ✅ Conserver les prix si présents
            prix_fr: data.prix_fr,
            prix_dealer: data.prix_dealer,
            numero_dossier: data.numero_dossier || undefined,
            prix_modifie_le: data.prix_modifie_le,
            prix_modifie_par: data.prix_modifie_par,
            prix_modifie_manuellement: data.prix_modifie_manuellement,
            
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
        console.error('❌ Erreur lors de l\'écoute Firebase:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // ✅ FUSIONNER MOCK + Firebase
  const machines = useMemo(() => {
    const allMachines = [...mockMachines, ...firebaseMachines];
    const map = new Map<string, Machine>();
    
    allMachines.forEach((m) => {
      const key = m.immat.toUpperCase();
      if (!map.has(key) || m.expertise_recue) {
        map.set(key, m);
      }
    });
    
    return Array.from(map.values());
  }, [mockMachines, firebaseMachines]);

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

  function createMachineRestitution(machine: Machine) {
    setMockMachines((prev) => [machine, ...prev]);
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

  async function basculerEnLld(machineId: string, clientLld: string, dateMiseDispo: string) {
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
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
    }
  }

  async function toggleEtapePrepa(machineId: string, etapeId: string, userName: string) {
    const now = new Date().toISOString();
    const machine = machines.find((m) => m.id === machineId);
    if (!machine || !machine.etapes_prepa) return;

    // Calculer les nouvelles étapes : on coche/décoche "done"
    // Si on coche "done", on retire automatiquement "non_necessaire"
    const updatedEtapes = machine.etapes_prepa.map((e) => {
      if (e.id !== etapeId) return e;
      const newDone = !e.done;
      return {
        ...e,
        done: newDone,
        non_necessaire: newDone ? false : e.non_necessaire,
        done_by: newDone ? userName : undefined,
        done_at: newDone ? now : undefined,
      };
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
      return {
        ...e,
        non_necessaire: newNA,
        done: newNA ? false : e.done,
        done_by: undefined,
        done_at: undefined,
      };
    });

    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, "machines_vo", machineId), {
          etapes_prepa: updatedEtapes,
          updatedAt: now,
        });
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

  async function importStockMachines(parsed: ParsedStockMachine[]): Promise<StockImportSummary> {
    let created = 0;
    let merged = 0;
    let skipped = 0;
    const details: { ref: string; action: string }[] = [];

    for (const p of parsed) {
      const now = new Date().toISOString();
      const existing = machines.find((m) => m.id === p.docId);

      if (existing) {
        // Machine déjà connue -> on ne complète QUE les champs vides (jamais d'écrasement)
        // ⚠️ Noms de champs Firestore = ceux lus par la conversion (modele/annee_fab/heures)
        const updates: any = {};
        if (!existing.modele_porteur && p.modele_porteur) updates.modele = p.modele_porteur;
        if (!existing.type_nacelle && p.type_nacelle) updates.type_nacelle = p.type_nacelle;
        if (!existing.annee_circulation && p.annee_circulation) updates.annee_fab = p.annee_circulation;
        if (existing.km_porteur == null && p.km_porteur != null) updates.km_porteur = p.km_porteur;
        if (existing.heures_nacelle == null && p.heures_nacelle != null) updates.heures = p.heures_nacelle;
        if (!existing.localite && p.localite) updates.localite = p.localite;
        if (!existing.numero_dossier && p.numero_dossier) updates.numero_dossier = p.numero_dossier;
        if (existing.prix_fr == null && p.prix_fr != null) updates.prix_fr = p.prix_fr;
        // Ces machines sont en STOCK (présentes dans le VOG "à vendre").
        // Si elles ont été tirées en restitution par la synchro, on les remet disponibles.
        if (existing.statut === "restitution") {
          updates.statut = "disponible";
          updates.fiche_vo_creee = true;
        }

        if (Object.keys(updates).length > 0) {
          updates.updatedAt = now;
          try {
            await updateDoc(doc(db, "machines_vo", p.docId), updates);
            merged++;
            details.push({ ref: p.source, action: "complétée" });
          } catch (e) {
            skipped++;
            details.push({ ref: p.source, action: "erreur MAJ" });
            continue;
          }
        } else {
          skipped++;
          details.push({ ref: p.source, action: "déjà complète" });
        }
        const prix = existing.prix_fr ?? updates.prix_fr;
        if (prix) {
          const label = `${existing.type_nacelle || p.type_nacelle} ${existing.modele_porteur || p.modele_porteur}`.trim();
          await syncHubspotProduct("upsert", p.docId, label, prix);
        }
      } else {
        // Nouvelle machine — noms de champs Firestore = ceux lus par la conversion
        const newDoc: any = {
          immat: p.immat || p.docId,
          modele: p.modele_porteur,
          type_nacelle: p.type_nacelle,
          annee_fab: p.annee_circulation,
          statut: "disponible",
          date_ajout: Timestamp.fromDate(new Date()),
          recuperation_ok: true,
          expertise_ok: true,
          createdAt: now,
          updatedAt: now,
        };
        if (p.numero_dossier) newDoc.numero_dossier = p.numero_dossier;
        if (p.km_porteur != null) newDoc.km_porteur = p.km_porteur;
        if (p.heures_nacelle != null) newDoc.heures = p.heures_nacelle;
        if (p.localite) newDoc.localite = p.localite;
        if (p.prix_fr != null) newDoc.prix_fr = p.prix_fr;

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

    return { created, merged, skipped, details };
  }

  async function configureEnCours(
    machineId: string,
    typePrepa: "normale" | "en_etat",
    acheteur: string,
    commercial: string,
    dateVente: string,
    dateLivraison: string
  ) {
    const now = new Date().toISOString();
    const updates = {
      statut: "en_cours" as const,        // ✅ Bug 3 : Passer en en_cours
      type_sortie: "vente" as const,
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
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
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
      const mm = machines.find((x) => x.id === machineId);
      if (mm?.prix_fr && mm.prix_fr > 0) {
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
      updatePrice,
      basculerEnLld,
      toggleEtapePrepa,
      setEtapeNonNecessaire,
      addEtapePrepa,
      removeEtapePrepa,
      importStockMachines,
      configureEnCours,
      cancelEnCours,
      marquerFacturee,
      marquerPayee,
      annulerCloture,
      updateFicheCommerciale,
      updatePhotosSupplementaires,
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