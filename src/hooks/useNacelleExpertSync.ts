import { useEffect } from "react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { dbNacelleExpert } from "../firebase";
import { useMachines } from "../contexts/MachinesContext";

/**
 * Hook pour synchroniser les expertises de nacelle-expert vers delta-vo
 * Écoute les nouvelles expertises créées dans les dernières 24h
 */
export function useNacelleExpertSync() {
  const { syncExpertiseFromNacelleExpert } = useMachines();

  useEffect(() => {
    // Date limite : 24h avant maintenant
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const yesterdayTimestamp = Timestamp.fromDate(yesterday);

    // Query pour écouter les expertises récentes
    const expertisesRef = collection(dbNacelleExpert, "expertises");
    const q = query(
      expertisesRef,
      where("createdAt", ">=", yesterdayTimestamp)
    );

    console.log("✅ Synchronisation nacelle-expert → delta-vo activée");

    // Listener en temps réel
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const expertise = change.doc.data();
          console.log("🔄 Nouvelle expertise détectée:", expertise.immatriculation);
          
          // Synchroniser vers delta-vo
          syncExpertiseFromNacelleExpert(expertise);
        }
      });
    });

    return () => unsubscribe();
  }, [syncExpertiseFromNacelleExpert]);
}
