import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
  updateDoc,
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
 * Lire UN dossier Nacelle Expert par immatriculation (lecture publique de la
 * collection dossiers). Utilisé par l'outil super admin « chiffrage à zéro ».
 */
export async function getDossierNE(immat: string): Promise<any | null> {
  try {
    const im = (immat || "").trim().toUpperCase();
    if (!im) return null;
    const snap = await getDoc(doc(dbNacelleExpert, "dossiers", im));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("getDossierNE:", e);
    return null;
  }
}

/**
 * Récupérer TOUTES les expertises depuis nacelle-expert (pour rattachement par immat)
 */
export async function getAllExpertises(): Promise<NacelleExpertExpertise[]> {
  try {
    const expertisesRef = collection(dbNacelleExpert, "expertises");
    const snapshot = await getDocs(expertisesRef);
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


/**
 * 🔐 Ouvre le rapport Nacelle Expert d'une machine avec sa clé d'accès.
 * Les rapports NE exigent désormais `?cle=<rapport_token>` (plus lisibles par
 * simple immatriculation). Si le lien mémorisé n'a pas de clé (dossier ancien),
 * on la lit dans le dossier NE — et on la crée si elle n'existe pas encore
 * (migration douce des anciens dossiers).
 */
export async function ouvrirRapportNE(url: string, immat: string): Promise<void> {
  try {
    if (!url) return;
    if (/[?&]cle=/.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const im = (immat || "").trim().toUpperCase();
    let token = "";
    if (im) {
      const ref = doc(dbNacelleExpert, "dossiers", im);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        token = String((snap.data() as any)?.rapport_token || "");
        if (!token) {
          const bytes = new Uint8Array(24);
          crypto.getRandomValues(bytes);
          token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
          await updateDoc(ref, { rapport_token: token, rapport_token_created: new Date().toISOString() });
        }
      }
    }
    const sep = url.includes("?") ? "&" : "?";
    window.open(token ? `${url}${sep}cle=${encodeURIComponent(token)}` : url, "_blank", "noopener,noreferrer");
  } catch (e) {
    console.error("ouvrirRapportNE:", e);
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
