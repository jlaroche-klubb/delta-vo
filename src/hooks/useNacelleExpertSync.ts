import { useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { dbNacelleExpert } from '../firebase';
import { useMachines } from '../contexts/MachinesContext';

export function useNacelleExpertSync() {
  const { syncExpertiseFromNacelleExpert } = useMachines();

  useEffect(() => {
    console.log('✅ Synchronisation nacelle-expert → delta-vo activée');

    // Écouter TOUS les dossiers sans filtre de date
    // onSnapshot détecte automatiquement les nouveaux ajouts
    const dossiersRef = collection(dbNacelleExpert, 'dossiers');

    const unsubscribe = onSnapshot(
      dossiersRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const dossier = change.doc.data();
            console.log('🔄 Nouveau dossier détecté:', dossier.immat || 'sans immat');

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
