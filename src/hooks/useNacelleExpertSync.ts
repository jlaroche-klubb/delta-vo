import { useEffect } from "react";
import { onSnapshot, collection, query, where, Timestamp } from "firebase/firestore";
import { db as nacelleExpertDb } from "../firebaseNacelleExpert";
import { useMachines } from "../contexts/MachinesContext";

/**
 * Hook qui écoute les nouvelles expertises dans nacelle-expert2
 * et les synchronise automatiquement vers delta-vo
 * 
 * Détecte les expertises créées dans les dernières 24h
 * et crée/met à jour les restitutions correspondantes
 */
export function useNacelleExpertSync() {
  const { syncExpertiseFromNacelleExpert } = useMachines();

  useEffect(() => {
    // Écouter les expertises créées dans les dernières 24h
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const q = query(
      collection(nacelleExpertDb, "expertises"),
      where("date_expertise", ">=", Timestamp.fromDate(yesterday))
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "added") {
            const expertise = change.doc.data();

            console.log("🔄 Nouvelle expertise détectée:", expertise.immat);

            // Synchroniser vers delta-vo
            syncExpertiseFromNacelleExpert({
              immat: expertise.immat || "",
              modele_porteur: expertise.modele_porteur || "",
              type_nacelle: expertise.type_nacelle || "",
              annee_circulation: expertise.annee_circulation || "",
              heures_nacelle: expertise.heures_nacelle,
              km_porteur: expertise.km_porteur,
              rapport_expertise: expertise.rapport,
              photos_commerciales: expertise.photos,
              agent_expert: expertise.agent || expertise.expert,
              date_expertise: expertise.date_expertise?.toDate?.()?.toISOString().slice(0, 10) || new Date().toISOString().slice(0, 10),
            });
          }
        });
      },
      (error) => {
        console.error("❌ Erreur sync nacelle-expert:", error);
      }
    );

    console.log("✅ Synchronisation nacelle-expert → delta-vo activée");

    return () => {
      console.log("🔌 Synchronisation nacelle-expert → delta-vo désactivée");
      unsubscribe();
    };
  }, [syncExpertiseFromNacelleExpert]);
}
