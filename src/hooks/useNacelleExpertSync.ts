import { useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db, dbNacelleExpert } from '../firebase';

interface NacelleExpertDossier {
  immat: string;
  info?: {
    immat?: string;
    type_nacelle?: string;
    modele?: string;
    annee_fab?: string;
    client?: string;
    contrat?: string;
    email?: string;
    date?: string;
    heures?: string;
    km_porteur?: string;
    agent?: string;
  };
  depart?: {
    zones?: any[];
    photos?: string[];
    date?: string;
    heures?: string;
    km_porteur?: string;
    agent?: string;
  };
  retour?: {
    zones?: any[];
    photos?: string[];
    degats?: string[];
    note?: string;
    date?: string;
    heures?: string;
    km_porteur?: string;
    agent?: string;
    commercialPhotos?: string[];
  };
  synced_to_delta_vo?: boolean;
  createdAt?: any;
  createdBy?: string;
}

interface MachineVO {
  immat: string;
  modele: string;
  type_nacelle: string;
  annee_fab: string;
  heures: string;
  km_porteur: string;
  
  // Données du dossier nacelle-expert
  dossier_nacelle_expert?: {
    client: string;
    contrat: string;
    email: string;
    date_depart: string;
    date_retour: string;
    agent_depart: string;
    agent_retour: string;
    zones_depart: any[];
    zones_retour: any[];
    photos_depart: string[];
    photos_retour: string[];
    photos_commerciales: any;  // Peut être objet {av_droit: {url}, ...} ou tableau (legacy)
    degats: string[];
    note_expert: string;
  };
  
  // ✅ CORRECTION: Statut initial "restitution" avec phases
  statut: 'restitution';
  recuperation_ok: boolean;
  expertise_ok: boolean;
  facture_ok: boolean;
  facture_reglee_ok: boolean;
  fiche_vo_creee: boolean;
  
  date_ajout: any;
  date_modification: any;
  createdBy?: string;
}

export function useNacelleExpertSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);

  const syncDossiers = async () => {
    setIsLoading(true);
    setError(null);
    setSyncedCount(0);

    try {
      console.log('🔄 Démarrage de la synchronisation Nacelle-Expert → Delta VO');
      
      // ✅ Chercher dans Nacelle-Expert
      const dossiersQuery = query(
        collection(dbNacelleExpert, 'dossiers'),
        where('synced_to_delta_vo', '==', false)
      );
      
      const dossiersSnapshot = await getDocs(dossiersQuery);
      console.log(`📋 ${dossiersSnapshot.size} dossiers à synchroniser`);

      if (dossiersSnapshot.empty) {
        console.log('✅ Aucun dossier à synchroniser');
        setIsLoading(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const dossierDoc of dossiersSnapshot.docs) {
        const dossier = dossierDoc.data() as NacelleExpertDossier;
        
        try {
          console.log(`\n📦 Traitement du dossier: ${dossier.immat}`);
          
          if (!dossier.info?.immat) {
            console.warn(`⚠️ Dossier sans immatriculation, ignoré`);
            continue;
          }

          if (!dossier.info?.modele) {
            console.warn(`⚠️ Dossier ${dossier.immat} sans modèle, ignoré`);
            continue;
          }

          // Créer la fiche VO dans Delta VO
          const machineVORef = doc(db, 'machines_vo', dossier.immat);
          
          const machineVOData: MachineVO = {
            // Données de base
            immat: dossier.info.immat,
            modele: dossier.info.modele || '',
            type_nacelle: dossier.info.type_nacelle || '',
            annee_fab: dossier.info.annee_fab || '',
            heures: dossier.retour?.heures || dossier.depart?.heures || '',
            km_porteur: dossier.retour?.km_porteur || dossier.depart?.km_porteur || '',
            
            // Données du dossier nacelle-expert
            dossier_nacelle_expert: {
              client: dossier.info.client || '',
              contrat: dossier.info.contrat || '',
              email: dossier.info.email || '',
              date_depart: dossier.depart?.date || '',
              date_retour: dossier.retour?.date || '',
              agent_depart: dossier.depart?.agent || '',
              agent_retour: dossier.retour?.agent || '',
              zones_depart: dossier.depart?.zones || [],
              zones_retour: dossier.retour?.zones || [],
              photos_depart: dossier.depart?.photos || [],
              photos_retour: dossier.retour?.photos || [],
              photos_commerciales: dossier.retour?.commercialPhotos || {},
              degats: dossier.retour?.degats || [],
              note_expert: dossier.retour?.note || '',
            },
            
            // ✅ CORRECTION: Statut "restitution" avec phase "expertise"
            statut: 'restitution',
            recuperation_ok: true,   // ✅ Déjà récupérée (expertise faite)
            expertise_ok: true,       // ✅ Expertise faite dans Nacelle-Expert
            facture_ok: false,        // ⏳ Reste à faire
            facture_reglee_ok: false, // ⏳ Reste à faire
            fiche_vo_creee: false,    // ⏳ À créer manuellement
            
            date_ajout: new Date(),
            date_modification: new Date(),
            createdBy: dossier.createdBy,
          };

          console.log(`💾 Création de la fiche en restitution (expertise OK) pour ${dossier.immat}`);
          await setDoc(machineVORef, machineVOData);
          console.log(`✅ Fiche créée avec succès`);

          // Marquer comme synchronisé dans Nacelle-Expert
          const dossierRef = doc(dbNacelleExpert, 'dossiers', dossierDoc.id);
          await updateDoc(dossierRef, {
            synced_to_delta_vo: true
          });
          console.log(`✅ Dossier marqué comme synchronisé`);

          successCount++;
        } catch (err) {
          console.error(`❌ Erreur lors de la synchronisation de ${dossier.immat}:`, err);
          errorCount++;
        }
      }

      console.log(`\n🎉 Synchronisation terminée:`);
      console.log(`  ✅ Succès: ${successCount}`);
      console.log(`  ❌ Erreurs: ${errorCount}`);

      setSyncedCount(successCount);
      
      if (errorCount > 0) {
        setError(`${errorCount} dossier(s) n'ont pas pu être synchronisés`);
      }

    } catch (err) {
      console.error('❌ Erreur générale lors de la synchronisation:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    syncDossiers,
    isLoading,
    error,
    syncedCount,
  };
}