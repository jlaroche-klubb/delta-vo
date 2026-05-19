import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { dbNacelleExpert } from "../firebase";

/**
 * Interface pour les données d'expertise de nacelle-expert
 */
export interface NacelleExpertExpertise {
  id: string;
  immatriculation: string;
  agent?: string;
  heures_nacelle?: number;
  km_porteur?: number;
  degats?: Array<{
    zone: string;
    description: string;
    montant: number;
  }>;
  total_retenue_ht?: number;
  notes?: string;
  createdAt?: Timestamp;
}

/**
 * Récupérer les expertises récentes depuis nacelle-expert
 */
export async function getRecentExpertises(
  hoursAgo: number = 24
): Promise<NacelleExpertExpertise[]> {
  try {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - hoursAgo);
    const cutoffTimestamp = Timestamp.fromDate(cutoff);

    const expertisesRef = collection(dbNacelleExpert, "expertises");
    const q = query(expertisesRef, where("createdAt", ">=", cutoffTimestamp));

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as NacelleExpertExpertise[];
  } catch (error) {
    console.error("Erreur lors de la récupération des expertises:", error);
    return [];
  }
}

/**
 * Récupérer une expertise spécifique par ID
 */
export async function getExpertiseById(
  expertiseId: string
): Promise<NacelleExpertExpertise | null> {
  try {
    const expertiseRef = doc(dbNacelleExpert, "expertises", expertiseId);
    const expertiseSnap = await getDoc(expertiseRef);

    if (expertiseSnap.exists()) {
      return {
        id: expertiseSnap.id,
        ...expertiseSnap.data(),
      } as NacelleExpertExpertise;
    }
    return null;
  } catch (error) {
    console.error("Erreur lors de la récupération de l'expertise:", error);
    return null;
  }
}

/**
 * Rechercher une expertise par immatriculation
 */
export async function findExpertiseByImmat(
  immat: string
): Promise<NacelleExpertExpertise | null> {
  try {
    const expertisesRef = collection(dbNacelleExpert, "expertises");
    const q = query(expertisesRef, where("immatriculation", "==", immat));

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
      } as NacelleExpertExpertise;
    }
    return null;
  } catch (error) {
    console.error("Erreur lors de la recherche de l'expertise:", error);
    return null;
  }
}
