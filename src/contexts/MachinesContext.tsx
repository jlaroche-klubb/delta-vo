import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase"; // Delta VO Firebase
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
        const machinesFromFirebase = snapshot.docs.map(doc => {
          const data = doc.data();
          
          // Convertir le format machines_vo → format Machine
          const machine: Machine = {
            id: doc.id,
            immat: data.immat || '',
            modele_porteur: data.modele || '',
            type_nacelle: data.type_nacelle || '',
            annee_circulation: data.annee_fab || '',
            statut: data.statut || 'disponible',
            
            // Données de restitution
            date_retour: data.dossier_nacelle_expert?.date_retour || '',
            client_precedent: data.dossier_nacelle_expert?.client || '',
            contrat: data.dossier_nacelle_expert?.contrat || '',
            
            heures_nacelle: parseInt(data.heures) || undefined,
            km_porteur: parseInt(data.km_porteur) || undefined,
            
            // Photos commerciales
            photos_commerciales: data.dossier_nacelle_expert?.photos_commerciales?.[0] ? {
              av_droit: data.dossier_nacelle_expert.photos_commerciales[0],
              av_gauche: data.dossier_nacelle_expert.photos_commerciales[1],
              ar_droit: data.dossier_nacelle_expert.photos_commerciales[2],
              ar_gauche: data.dossier_nacelle_expert.photos_commerciales[3],
            } : undefined,
            
            // Indicateurs
            recuperation_ok: true,
            expertise_ok: true,
            facture_ok: false,
            facture_reglee_ok: false,
            fiche_vo_creee: true,
            expertise_recue: true,
            
            // ✅ AJOUT : Lire les prix depuis Firebase
            prix_fr: data.prix_fr,
            prix_dealer: data.prix_dealer,
            prix_modifie_le: data.prix_modifie_le,
            prix_modifie_par: data.prix_modifie_par,
            prix_modifie_manuellement: data.prix_modifie_manuellement,
            
            date_mise_stock: data.date_ajout?.toDate?.()?.toISOString?.()?.slice(0, 10) || new Date().toISOString().slice(0, 10),
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

  // ✅ FUSIONNER les machines MOCK + Firebase (éviter doublons)
  const machines = useMemo(() => {
    const allMachines = [...mockMachines, ...firebaseMachines];
    const map = new Map<string, Machine>();
    
    // Les machines Firebase écrasent les MOCK si même immat
    allMachines.forEach((m) => {
      const key = m.immat.toUpperCase();
      if (!map.has(key) || m.expertise_recue) {
        map.set(key, m);
      }
    });
    
    return Array.from(map.values());
  }, [mockMachines, firebaseMachines]);

  // ====== RESTE DU CODE ======
  function toggleEtapeRestitution(
    machineId: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) {
    setMockMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        const newVal = !m[field];
        const updated = {
          ...m,
          [field]: newVal,
          updatedAt: new Date().toISOString(),
        };
        if (updated.recuperation_ok && updated.expertise_ok && !updated.fiche_vo_creee) {
          updated.fiche_vo_creee = true;
          updated.date_mise_stock = new Date().toISOString().slice(0, 10);
          if (updated.statut === "restitution") {
            updated.statut = "disponible";
          }
        }
        return updated;
      })
    );
  }

  function setDateDemandeRecup(machineId: string, date: string) {
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? { ...m, date_demande_recuperation: date, updatedAt: new Date().toISOString() }
          : m
      )
    );
  }

  function createMachineRestitution(machine: Machine) {
    setMockMachines((prev) => [machine, ...prev]);
  }

  // ✅ ✅ ✅ CORRECTION CRITIQUE : updatePrice sauve maintenant dans Firebase
  async function updatePrice(
    machineId: string,
    prixFr: number | undefined,
    prixDealer: number | undefined,
    userName: string,
    manuel: boolean
  ) {
    const today = new Date().toISOString().slice(0, 10);
    
    // Vérifier si la machine vient de Firebase
    const isFirebaseMachine = firebaseMachines.some((m) => m.id === machineId);
    
    if (isFirebaseMachine) {
      // ✅ SAUVEGARDER DANS FIRESTORE
      try {
        console.log(`💾 Sauvegarde des prix dans Firebase pour ${machineId}...`);
        const machineRef = doc(db, 'machines_vo', machineId);
        await updateDoc(machineRef, {
          prix_fr: prixFr ?? null,
          prix_dealer: prixDealer ?? null,
          prix_modifie_le: today,
          prix_modifie_par: userName,
          prix_modifie_manuellement: manuel,
          date_modification: new Date(),
        });
        console.log(`✅ Prix sauvegardés dans Firebase : FR=${prixFr}, Dealer=${prixDealer}`);
      } catch (error) {
        console.error('❌ Erreur sauvegarde Firebase :', error);
        alert('Erreur lors de la sauvegarde du prix : ' + (error as Error).message);
      }
    } else {
      // ✅ SAUVEGARDER DANS LES MOCKS (anciens comportement)
      console.log(`💾 Sauvegarde des prix dans les MOCKS pour ${machineId}...`);
      setMockMachines((prev) =>
        prev.map((m) =>
          m.id === machineId
            ? {
                ...m,
                prix_fr: prixFr,
                prix_dealer: prixDealer,
                prix_modifie_le: today,
                prix_modifie_par: userName,
                prix_modifie_manuellement: manuel,
                updatedAt: new Date().toISOString(),
              }
            : m
        )
      );
      console.log(`✅ Prix sauvegardés dans MOCKS : FR=${prixFr}, Dealer=${prixDealer}`);
    }
  }

  function basculerEnLld(machineId: string, clientLld: string, dateMiseDispo: string) {
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              statut: "louee_lld",
              type_sortie: "lld",
              client_lld: clientLld,
              date_mise_dispo_lld: dateMiseDispo,
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
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

  function configureEnCours(
    machineId: string,
    typePrepa: "normale" | "en_etat",
    acheteur: string,
    commercial: string,
    dateVente: string,
    dateLivraison: string
  ) {
    const now = new Date().toISOString();
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              type_prepa: typePrepa,
              acheteur,
              commercial_vendeur: commercial,
              date_vente: dateVente,
              date_livraison_prevue: dateLivraison,
              date_mise_en_cours: now,
              etapes_prepa: creerEtapesPrepa(typePrepa),
              updatedAt: now,
            }
          : m
      )
    );
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
              statut: "cloturee",
              numero_facture: numeroFacture,
              date_facturation: dateFacturation,
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

  function updateFicheCommerciale(machineId: string, fiche: FicheCommerciale) {
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              fiche_commerciale: { ...m.fiche_commerciale, ...fiche },
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  }

  function attribuerNumeroFiche(machineId: string, numero: string) {
    const today = new Date().toISOString().slice(0, 10);
    setMockMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              fiche_commerciale: {
                ...m.fiche_commerciale,
                numero_fiche: numero,
                date_creation_fiche: today,
              },
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
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
        (m) => 
          m.immat.toUpperCase() === expertiseData.immat.toUpperCase() &&
          m.statut === "restitution"
      );

      if (existingIndex !== -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        
        console.log(`✅ Restitution ${expertiseData.immat} trouvée → Mise à jour`);
        
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
        
        if (updated[existingIndex].recuperation_ok && updated[existingIndex].expertise_ok) {
          updated[existingIndex].fiche_vo_creee = true;
          updated[existingIndex].date_mise_stock = new Date().toISOString().slice(0, 10);
          updated[existingIndex].statut = "disponible";
        }
        
        return updated;
      } else {
        console.log(`➕ Restitution ${expertiseData.immat} créée automatiquement depuis expertise`);
        
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
          statut: "disponible",
          recuperation_ok: true,
          expertise_ok: true,
          facture_ok: false,
          facture_reglee_ok: false,
          fiche_vo_creee: true,
          date_mise_stock: new Date().toISOString().slice(0, 10),
          expertise_recue: true,
          date_expertise_recue: expertiseData.date_expertise,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        return [newMachine, ...prev];
      }
    });
  }

  function deleteMachine(machineId: string) {
    setMockMachines((prev) => prev.filter((m) => m.id !== machineId));
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
