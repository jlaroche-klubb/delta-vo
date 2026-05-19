import { useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, setDoc } from 'firebase/firestore';
import { dbNacelleExpert, db } from '../firebase';

const genId = () => Math.random().toString(36).slice(2, 9).toUpperCase();

export function useNacelleExpertSync() {
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
              // 1️⃣ Créer la fiche VO dans Delta VO
              const ficheVO = {
                id: genId(),
                immat: dossier.immat,
                info: {
                  type_nacelle: dossier.info?.type_nacelle || '',
                  modele_porteur: dossier.info?.modele_porteur || '',
                  annee_fab: dossier.info?.annee_fab || '',
                  client: dossier.info?.client || '',
                  date_expertise: dossier.retour?.date || new Date().toISOString().slice(0, 10),
                  heures_nacelle: dossier.retour?.heures || '',
                  km_porteur: dossier.retour?.km_porteur || '',
                  agent_expert: dossier.retour?.agent || ''
                },
                photos_commerciales: dossier.retour?.commercialPhotos || {},
                statut: 'en_attente_tarification',
                createdAt: new Date().toISOString(),
                source: 'nacelle-expert'
              };
              
              await setDoc(doc(db, 'machines_vo', dossier.immat), ficheVO);
              console.log(`✅ Fiche VO créée: ${dossier.immat}`);
              
              // 2️⃣ Marquer comme synchronisé dans nacelle-expert
              const dossierRef = doc(dbNacelleExpert, 'dossiers', immat);
              await updateDoc(dossierRef, {
                synced_to_delta_vo: true,
                synced_at: new Date().toISOString()
              });
              
              console.log(`✓ Dossier ${immat} marqué comme synchronisé`);
            } catch (error) {
              console.error(`❌ Erreur sync ${immat}:`, error);
            }
          } else {
            console.log(`⏸️ Dossier ${immat} sans retour - ignoré`);
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
  }, []); // ✅ Pas de dépendance car le hook est autonome
}
