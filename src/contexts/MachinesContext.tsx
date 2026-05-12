import { createContext, useContext, useState, ReactNode, useMemo } from "react";
import {
  Machine,
  creerEtapesPrepa,
  EtapePrepa,
  FicheCommerciale,
} from "../types/machine";
import { MOCK_MACHINES } from "../data/mockMachines";
import { MOCK_DISPONIBLES } from "../data/mockDisponibles";
import { MOCK_EN_COURS } from "../data/mockEnCours";
import { MOCK_CLOTUREES } from "../data/mockCloturees";

interface MachinesContextType {
  machines: Machine[];

  // Restitutions
  toggleEtapeRestitution: (
    machineId: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) => void;
  setDateDemandeRecup: (machineId: string, date: string) => void;
  createMachineRestitution: (machine: Machine) => void;

  // Disponibles
  updatePrice: (
    machineId: string,
    prixFr: number | undefined,
    prixExport: number | undefined,
    userName: string,
    manuel: boolean
  ) => void;
  basculerEnLld: (machineId: string, clientLld: string, dateMiseDispo: string) => void;

  // En cours
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

  // Clôturées
  marquerPayee: (machineId: string, dateReglement: string) => void;

  // Fiche commerciale (NOUVEAU v5)
  updateFicheCommerciale: (machineId: string, fiche: FicheCommerciale) => void;
  attribuerNumeroFiche: (machineId: string, numero: string) => void;
}

const MachinesContext = createContext<MachinesContextType | undefined>(undefined);

// On fusionne tous les mocks dans un seul tableau au démarrage
// (en évitant les doublons d'ID si jamais)
function fusionnerMocks(): Machine[] {
  const all = [
    ...MOCK_MACHINES,
    ...MOCK_DISPONIBLES,
    ...MOCK_EN_COURS,
    ...MOCK_CLOTUREES,
  ];
  // Dédupliquer par ID au cas où
  const map = new Map<string, Machine>();
  all.forEach((m) => map.set(m.id, m));
  return Array.from(map.values());
}

export function MachinesProvider({ children }: { children: ReactNode }) {
  const [machines, setMachines] = useState<Machine[]>(() => fusionnerMocks());

  // ====== RESTITUTIONS ======
  function toggleEtapeRestitution(
    machineId: string,
    field: "recuperation_ok" | "expertise_ok" | "facture_ok" | "facture_reglee_ok"
  ) {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        const newVal = !m[field];
        const updated = {
          ...m,
          [field]: newVal,
          updatedAt: new Date().toISOString(),
        };
        // Si on coche récup + expertise → la fiche VO est créée
        if (updated.recuperation_ok && updated.expertise_ok && !updated.fiche_vo_creee) {
          updated.fiche_vo_creee = true;
          updated.date_mise_stock = new Date().toISOString().slice(0, 10);
          // Si pas encore en disponible, on bascule
          if (updated.statut === "restitution") {
            updated.statut = "disponible";
          }
        }
        return updated;
      })
    );
  }

  function setDateDemandeRecup(machineId: string, date: string) {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? { ...m, date_demande_recuperation: date, updatedAt: new Date().toISOString() }
          : m
      )
    );
  }

  function createMachineRestitution(machine: Machine) {
    setMachines((prev) => [machine, ...prev]);
  }

  // ====== DISPONIBLES ======
  function updatePrice(
    machineId: string,
    prixFr: number | undefined,
    prixExport: number | undefined,
    userName: string,
    manuel: boolean
  ) {
    const today = new Date().toISOString().slice(0, 10);
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              prix_fr: prixFr,
              prix_export: prixExport,
              prix_modifie_le: today,
              prix_modifie_par: userName,
              prix_modifie_manuellement: manuel,
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  }

  function basculerEnLld(machineId: string, clientLld: string, dateMiseDispo: string) {
    const today = new Date().toISOString().slice(0, 10);
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return {
          ...m,
          statut: "en_cours" as const,
          type_sortie: "lld" as const,
          type_prepa: "normale" as const,
          client_lld: clientLld,
          date_mise_dispo_lld: dateMiseDispo,
          date_mise_en_cours: today,
          etapes_prepa: creerEtapesPrepa(),
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }

  // ====== EN COURS ======
  function toggleEtapePrepa(machineId: string, etapeId: string, userName: string) {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        const updatedEtapes: EtapePrepa[] | undefined = m.etapes_prepa?.map((e) => {
          if (e.id !== etapeId) return e;
          const newDone = !e.done;
          return {
            ...e,
            done: newDone,
            done_by: newDone ? userName : undefined,
            done_at: newDone ? new Date().toISOString().slice(0, 10) : undefined,
          };
        });
        return { ...m, etapes_prepa: updatedEtapes, updatedAt: new Date().toISOString() };
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
    const today = new Date().toISOString().slice(0, 10);
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        return {
          ...m,
          type_prepa: typePrepa,
          type_sortie: "vente" as const,
          acheteur,
          commercial_vendeur: commercial,
          date_vente: dateVente,
          date_livraison_prevue: dateLivraison || undefined,
          date_mise_en_cours: m.date_mise_en_cours || today,
          etapes_prepa: typePrepa === "normale" ? creerEtapesPrepa() : [],
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }

  function marquerFacturee(machineId: string, numeroFacture: string, dateFacturation: string) {
    setMachines((prev) =>
      prev.map((m) => {
        if (m.id !== machineId) return m;
        // Détection auto marché selon commercial
        const marche: "fr" | "export" = m.commercial_vendeur
          ?.toLowerCase()
          .includes("export")
          ? "export"
          : "fr";

        // Cas LLD : on bascule en statut "louee_lld" (pas dans clôturées)
        if (m.type_sortie === "lld") {
          return {
            ...m,
            statut: "louee_lld" as const,
            date_facturation: dateFacturation,
            numero_facture: numeroFacture,
            marche,
            updatedAt: new Date().toISOString(),
          };
        }

        // Cas Vente : bascule en "cloturee"
        return {
          ...m,
          statut: "cloturee" as const,
          date_facturation: dateFacturation,
          numero_facture: numeroFacture,
          marche,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  }

  // ====== CLÔTURÉES ======
  function marquerPayee(machineId: string, dateReglement: string) {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? { ...m, date_reglement: dateReglement, updatedAt: new Date().toISOString() }
          : m
      )
    );
  }

  // ====== FICHE COMMERCIALE (NOUVEAU v5) ======
  function updateFicheCommerciale(machineId: string, fiche: FicheCommerciale) {
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId
          ? {
              ...m,
              fiche_commerciale: {
                ...m.fiche_commerciale,
                ...fiche,
              },
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  }

  function attribuerNumeroFiche(machineId: string, numero: string) {
    const today = new Date().toISOString().slice(0, 10);
    setMachines((prev) =>
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