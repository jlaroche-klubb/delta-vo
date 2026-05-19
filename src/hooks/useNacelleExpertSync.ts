import { useEffect } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { dbNacelleExpert } from '../firebase';
import { useMachines } from '../contexts/MachinesContext';

export function useNacelleExpertSync() {
  const { syncExpertiseFromNacelleExpert } = useMachines();

  useEffect(() => {
    console.log('✅ Synchronisation nacelle-expert → delta-vo activée');

    // Calculer la date d'il y a 24h
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    const yesterdayTimestamp = Timestamp.fromDate(yesterday);

    // Écouter les dossiers créés dans les dernières 24h
    const dossiersRef = collection(dbNacelleExpert, 'dossiers');
    const recentDossiersQuery = query(
      dossiersRef,
      where('createdAt', '>=', yesterdayTimestamp)
    );

    const unsubscribe = onSnapshot(
      recentDossiersQuery,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const dossier = change.doc.data();
            console.log('🔄 Nouveau dossier détecté:', dossier.immat);

            // Synchroniser vers Delta VO
            syncExpertiseFromNacelleExpert(dossier as any);
          }
        });
      },
      (error) => {
        console.error('❌ Erreur sync nacelle-expert:', error);
      }
    );

    return () => unsubscribe();
  }, [syncExpertiseFromNacelleExpert]);
}
