import { useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { dbNacelleExpert } from '../firebase';

export function useNacelleExpertSync(onSync: (expertise: any) => void) {
  useEffect(() => {
    console.log('🔄 Hook synchronisation Delta VO activé');
    
    // Écouter les dossiers avec synced_to_delta_vo === false
    const dossiersRef = collection(dbNacelleExpert, 'dossiers');
    const q = query(dossiersRef, where('synced_to_delta_vo', '==', false));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      console.log(`📦 ${snapshot.size} dossier(s) à synchroniser`);
      
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const dossier = change.doc.data();
          const immat = change.doc.id;
          
          console.log(`🔄 Nouveau dossier détecté: ${immat}`);
          
          // Vérifier que le dossier a les champs requis
          if (!dossier.immat || !dossier.info?.modele_porteur || !dossier.info?.type_nacelle) {
            console.log(`⚠️ Dossier ${immat} incomplet - ignoré`);
            return;
          }
          
          // Si le dossier a un retour, on le synchronise
          if (dossier.retour) {
            console.log(`✅ Synchronisation du dossier ${immat}`);
            
            try {
              // Appeler la fonction de sync fournie par le parent
              await onSync(dossier);
              
              // Marquer comme synchronisé dans nacelle-expert
              const dossierRef = doc(dbNacelleExpert, 'dossiers', immat);
              await updateDoc(dossierRef, {
                synced_to_delta_vo: true,
                synced_at: new Date().toISOString()
              });
              
              console.log(`✓ Dossier ${immat} marqué comme synchronisé`);
            } catch (error) {
              console.error(`❌ Erreur sync ${immat}:`, error);
            }
          }
        }
      });
    }, (error) => {
      console.error('❌ Erreur listener:', error);
    });
    
    return () => {
      console.log('🛑 Hook synchronisation désactivé');
      unsubscribe();
    };
  }, [onSync]);
}
