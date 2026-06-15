import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
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
    rapport_url?: string;
    pdf_url?: string;
  };
  rapport_url?: string;
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
          
          // ✅ Date demande récupération = date de retour (la machine est arrivée)
          const dateRecup = dossier.retour?.date || dossier.depart?.date || new Date().toISOString().slice(0, 10);
          
          const machineVOData: any = {
            // Données de base
            immat: dossier.info.immat,
            modele: dossier.info.modele || '',
            type_nacelle: dossier.info.type_nacelle || '',
            annee_fab: dossier.info.annee_fab || '',
            
            // ✅ Date demande récupération auto-remplie (machine déjà arrivée)
            date_demande_recuperation: dateRecup,
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
              rapport_url: dossier.retour?.pdf_url || dossier.rapport_url || dossier.retour?.rapport_url || '',
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

          // ✅ ANTI-ÉCRASEMENT : Vérifier si la machine existe déjà
          const existingDoc = await getDoc(machineVORef);
          
          if (existingDoc.exists()) {
            // 🔄 RELOCATION : La nacelle revient pour une nouvelle expertise
            console.log(`🔄 Machine ${dossier.immat} existe déjà - mise à jour intelligente`);
            const existingData = existingDoc.data();
            
            // ✅ Préserver les données importantes Delta VO :
            // - Fiche commerciale (hauteur, déport, etc.)
            // - Prix précédents (à titre indicatif, pourront être révisés)
            // - Historique
            // ✅ Une machine DÉJÀ en stock (disponible) ne doit PAS être tirée
            // vers la restitution : on rafraîchit seulement ses données d'expertise/photos.
            const enStock = existingData.statut === 'disponible';

            const smartUpdate: any = {
              // Nouvelles données d'expertise (remontent toujours)
              heures: machineVOData.heures,
              km_porteur: machineVOData.km_porteur,
              dossier_nacelle_expert: machineVOData.dossier_nacelle_expert,

              // ✅ Nouvelle date de récupération pour ce cycle de relocation
              date_demande_recuperation: dateRecup,

              // Conserver les données Delta VO existantes
              fiche_commerciale: existingData.fiche_commerciale,
              prix_fr: existingData.prix_fr,
              prix_dealer: existingData.prix_dealer,
              prix_modifie_le: existingData.prix_modifie_le,
              prix_modifie_par: existingData.prix_modifie_par,

              date_modification: new Date(),
            };

            // Uniquement si la machine n'est PAS déjà en stock : on la (re)met en
            // cycle restitution pour une nouvelle expertise/facturation (relocation).
            if (!enStock) {
              smartUpdate.statut = 'restitution';
              smartUpdate.recuperation_ok = true;
              smartUpdate.expertise_ok = true;
              smartUpdate.facture_ok = false;
              smartUpdate.facture_reglee_ok = false;
              smartUpdate.fiche_vo_creee = false;
            }
            
            // Nettoyer les undefined avant Firebase
            Object.keys(smartUpdate).forEach(key => {
              if (smartUpdate[key] === undefined) {
                delete smartUpdate[key];
              }
            });
            
            await updateDoc(machineVORef, smartUpdate);
            console.log(`✅ Machine ${dossier.immat} mise à jour (relocation détectée)`);
          } else {
            // 🆕 Nouvelle nacelle : création normale
            console.log(`💾 Création nouvelle fiche pour ${dossier.immat}`);
            await setDoc(machineVORef, machineVOData);
            console.log(`✅ Fiche créée avec succès`);
          }

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

  // ✅ ÉCOUTE TEMPS RÉEL des nouveaux dossiers Nacelle-Expert
  useEffect(() => {
    console.log('🔄 Démarrage de l\'écoute temps réel Nacelle-Expert');
    
    const dossiersQuery = query(
      collection(dbNacelleExpert, 'dossiers'),
      where('synced_to_delta_vo', '==', false)
    );
    
    const unsubscribe = onSnapshot(
      dossiersQuery,
      (snapshot) => {
        if (snapshot.empty) {
          console.log('ℹ️ Aucun nouveau dossier à synchroniser');
          return;
        }
        
        console.log(`🆕 ${snapshot.size} nouveau(x) dossier(s) détecté(s) - sync automatique`);
        syncDossiers();
      },
      (error) => {
        console.error('❌ Erreur écoute Nacelle-Expert:', error);
      }
    );
    
    return () => {
      console.log('🛑 Arrêt de l\'écoute Nacelle-Expert');
      unsubscribe();
    };
  }, []);

  // ✅ RATTRAPAGE AUTOMATIQUE du lien PDF de restitution
  // Pour les machines déjà synchronisées AVANT l'ajout du PDF (flag synced_to_delta_vo
  // resté à true) : on lit retour.pdf_url directement dans Nacelle-Expert et on remplit
  // dossier_nacelle_expert.rapport_url dans machines_vo si absent/différent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(dbNacelleExpert, 'dossiers'));
        for (const d of snap.docs) {
          if (cancelled) return;
          const data: any = d.data();
          const pdfUrl = data?.retour?.pdf_url;
          if (!pdfUrl) continue;
          const immat = data?.immat || data?.info?.immat || d.id;
          if (!immat) continue;
          try {
            const ref = doc(db, 'machines_vo', immat);
            const mSnap = await getDoc(ref);
            if (!mSnap.exists()) continue;
            const m: any = mSnap.data();
            const current = m?.dossier_nacelle_expert?.rapport_url || '';
            if (current !== pdfUrl) {
              await updateDoc(ref, {
                'dossier_nacelle_expert.rapport_url': pdfUrl,
              });
              console.log(`🔗 Lien PDF rattrapé pour ${immat}`);
            }
          } catch (e) {
            console.error('Rattrapage PDF échoué pour', immat, e);
          }
        }
      } catch (e) {
        console.error('Rattrapage PDF : lecture des dossiers échouée', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    syncDossiers,
    isLoading,
    error,
    syncedCount,
  };
}