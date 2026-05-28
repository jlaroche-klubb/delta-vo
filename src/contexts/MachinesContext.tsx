import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  Machine,
  creerEtapesPrepa,
  FicheCommerciale,
} from "../types/machine";
import { MOCK_MACHINES } from "../data/mockMachines";
import { MOCK_DISPONIBLES } from "../data/mockDisponibles";
import { MOCK_EN_COURS } from "../data/mockEnCours";
import { MOCK_CLOTUREES } from "../data/mockCloturees";

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
    manuel: boolean
  ) => void;
  basculerEnLld: (machineId: string, clientLld: string, dateMiseDispo: string) => void;
  toggleEtapePrepa: (machineId: string, etapeId: string, userName: string) => void;
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
  updateFicheCommerciale: (machineId: string, fiche: FicheCommerciale) => void;
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
            
            // ✅ Indicateurs depuis Firebase
            recuperation_ok: data.recuperation_ok ?? true,
            expertise_ok: data.expertise_ok ?? true,
            facture_ok: data.facture_ok ?? false,
            facture_reglee_ok: data.facture_reglee_ok ?? false,
            fiche_vo_creee: ficheVoCreee,
            expertise_recue: true,
            
            // ✅ date_mise_stock UNIQUEMENT si "disponible"
            date_mise_stock: statutFirebase === 'disponible'
              ? (data.date_ajout?.toDate?.()?.toISOString?.()?.slice(0, 10) || new Date().toISOString().slice(0, 10))
              : undefined,
              
            // ✅ Conserver les prix si présents
            prix_fr: data.prix_fr,
            prix_dealer: data.prix_dealer,
            prix_modifie_le: data.prix_modifie_le,
            prix_modifie_par: data.prix_modifie_par,
            prix_modifie_manuellement: data.prix_modifie_manuellement,
            
            // ✅ Conserver la fiche commerciale depuis Firebase
            fiche_commerciale: data.fiche_commerciale,
            
            // ✅ Conserver le rapport d'expertise
            rapport_expertise: data.rapport_expertise || data.dossier_nacelle_expert?.rapport_expertise,
            agent_expert: data.agent_expert || data.dossier_nacelle_expert?.agent_retour,
              
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
    manuel: boolean
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const updates = {
      prix_fr: prixFr ?? null,
      prix_dealer: prixDealer ?? null,
      prix_modifie_le: today,
      prix_modifie_par: userName,
      prix_modifie_manuellement: manuel,
      updatedAt: new Date().toISOString(),
    };
    
    if (isFirebaseMachine(machineId)) {
      try {
        await updateDoc(doc(db, 'machines_vo', machineId), updates);
      } catch (err) {
        console.error('❌ Erreur update prix Firebase:', err);
      }
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? { ...m, prix_fr: prixFr, prix_dealer: prixDealer, prix_modifie_le: today, prix_modifie_par: userName, prix_modifie_manuellement: manuel, updatedAt: new Date().toISOString() }
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
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? { ...m, ...updates } : m
        )
      );
    }
  }

  function toggleEtapePrepa(machineId: string, etapeId: string, userName: string) {
    const now = new Date().toISOString();
    setMockMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId || !m.etapes_prepa) return m;
        const updatedEtapes = m.etapes_prepa.map((e) =>
          e.id === etapeId
            ? { ...e, done: !e.done, done_by: !e.done ? userName : undefined, done_at: !e.done ? now : undefined }
            : e
        );
        return { ...m, etapes_prepa: updatedEtapes, updatedAt: now };
      })
    );
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
    } else {
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId ? ({ ...m, ...updates } as unknown as Machine) : m
        )
      );
    }
  }

  function marquerFacturee(
    machineId: string,
    numeroFacture: string,
    dateFacturation: string
  ) {
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              numero_facture: numeroFacture,
              date_facturation: dateFacturation,
              statut: "cloturee",
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  }

  function marquerPayee(machineId: string, dateReglement: string) {
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? { ...m, date_reglement: dateReglement, updatedAt: new Date().toISOString() }
          : m
      )
    );
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

  const value = useMemo(
    () => ({
      machines,
      toggleEtapeRestitution,
      setDateDemandeRecup,
      createMachineRestitution,
      updatePrice,
      basculerEnLld,
      toggleEtapePrepa,
      configureEnCours,
      cancelEnCours,
      marquerFacturee,
      marquerPayee,
      updateFicheCommerciale,
      attribuerNumeroFiche,
      syncExpertiseFromNacelleExpert,
      deleteMachine,
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