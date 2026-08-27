import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { notifyExpertiseArrivee } from '../services/emailService';
import { db, dbNacelleExpert } from '../firebase';
import { syncHubspotProduct } from '../services/hubspotService';
import { normalizeLocalite } from '../utils/localites';

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
    lieu_restitution?: string;
    commercialPhotos?: string[];
    rapport_url?: string;
    pdf_url?: string;
  };
  rapport_url?: string;
  synced_to_delta_vo?: boolean;
  createdAt?: any;
  createdBy?: string;
  // ⏳ Devis en attente (postes sur devis non chiffrés par l'atelier)
  devis_pending?: string[];
  devis_pending_labels?: string[];
  devis_complet?: boolean;
  devis_valide?: { par?: string; date?: string } | null;
  /** Montants saisis par l'atelier via le lien de chiffrage, par id de poste tarifaire */
  devis_recu?: Record<string, { montant?: number; reference?: string; date?: string; label?: string }>;
  /** 💶 Résumé d'expertise produit par Nacelle Expert (dégâts, montants, total retenue).
   *  Recalculé à chaque chiffrage atelier — copié tel quel dans machines_vo.rapport_expertise. */
  expertise_resume?: {
    date_expertise?: string;
    agent?: string;
    heures_nacelle?: number;
    km_porteur?: number;
    taux_vetuste?: number;
    degats?: { zone?: string; description?: string; montant?: number }[];
    total_retenue_ht?: number;
    notes?: string;
    nb_attente?: number;
  };
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

// 🛡️ FUSION DES PHOTOS COMMERCIALES — protège les remplacements manuels.
// Les slots remplacés depuis Delta VO (PhotosModal) sont stockés sous
// machines/{immat}/fiche/ : tant qu'il s'agit de la MÊME expertise, ils
// restent prioritaires sur les photos venant de Nacelle Expert. Une NOUVELLE
// expertise (relocation) reprend la main avec ses photos fraîches.
function fusionPhotosCommerciales(actuelles: any, venantDeNE: any): any {
  const base: any = { ...(venantDeNE || {}) };
  if (!actuelles) return base;
  for (const slot of Object.keys(actuelles)) {
    const u = String(actuelles[slot]?.url || '');
    if (u.includes('%2Ffiche%2F') || u.includes('/fiche/')) base[slot] = actuelles[slot];
  }
  return base;
}

export function useNacelleExpertSync() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);

  // 🛡️ GARDE DE RÉENTRANCE : le listener redéclenche syncDossiers à chaque
  // snapshot (y compris ceux provoqués par nos propres écritures synced:true).
  // Sans ce verrou, plusieurs exécutions traitent les MÊMES dossiers en même
  // temps → emails d'alerte et upserts HubSpot envoyés en double/triple.
  const syncEnCoursRef = useRef(false);
  const resyncDemandeRef = useRef(false);

  const syncDossiers = async () => {
    if (syncEnCoursRef.current) {
      // Une synchro tourne déjà : on note qu'il faudra repasser après elle
      resyncDemandeRef.current = true;
      return;
    }
    syncEnCoursRef.current = true;
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

      // 🏷️ Libellés des postes tarifaires NE : devis_recu est stocké par id de
      // poste, on le traduit en libellés lisibles pour la secrétaire (bandeau
      // « Devis reçu » avec montants). Échec non bloquant : repli sur l'id.
      const tarifLabels: Record<string, string> = {};
      try {
        const tarifsSnap = await getDoc(doc(dbNacelleExpert, 'config', 'tarifs'));
        const tarifsArr: any[] = tarifsSnap.exists() && Array.isArray((tarifsSnap.data() as any).data)
          ? (tarifsSnap.data() as any).data
          : [];
        tarifsArr.forEach((t: any) => { if (t?.id) tarifLabels[t.id] = t.label || t.id; });
      } catch (e) {
        console.warn('⚠️ Tarifs NE non chargés (libellés du devis) :', e);
      }

      let successCount = 0;
      let errorCount = 0;

      for (const dossierDoc of dossiersSnapshot.docs) {
        const dossier = dossierDoc.data() as NacelleExpertDossier;
        
        try {
          console.log(`\n📦 Traitement du dossier: ${dossier.immat}`);
          
          // 🛡️ GARDE-FOU ANTI-BOUCLE : les dossiers pré-créés par Delta VO
          // (synchro inverse des infos ADV) n'ont NI départ NI retour.
          // Ils ne doivent jamais être ré-importés ici tant qu'aucune
          // expertise n'a été faite dans Nacelle-Expert.
          if (!dossier.depart && !dossier.retour) {
            console.log(`⏭️ Dossier ${dossier.immat} sans expertise (pré-créé ADV), ignoré`);
            continue;
          }

          // 🚚 SÉCURITÉ DÉPART (validée avec Jonathan) : dossier avec une
          // expertise DÉPART seule (retour: null) → la machine vient de
          // PARTIR en location. Delta VO suit la réalité du terrain ;
          // on ne crée JAMAIS de restitution ici.
          if (dossier.depart && !dossier.retour) {
            // 🛡️ « Retour sans départ » en cours de saisie : le marqueur
            // sansDossier n'est PAS un vrai départ — surtout ne pas basculer
            // la machine en location (le retour arrive juste après).
            if ((dossier.depart as any)?.sansDossier) {
              console.log(`⏭️ ${dossier.immat} : départ administratif (sans dossier), ignoré`);
              await updateDoc(doc(dbNacelleExpert, 'dossiers', dossierDoc.id), { synced_to_delta_vo: true });
              successCount++;
              continue;
            }
            const immatDepart = (dossier.info?.immat || dossier.immat || '').trim().toUpperCase();
            try {
              if (immatDepart) {
                const refDepart = doc(db, 'machines_vo', immatDepart);
                const snapDepart = await getDoc(refDepart);
                if (snapDepart.exists()) {
                  const m: any = snapDepart.data();
                  const dateDepart = dossier.depart?.date || new Date().toISOString().slice(0, 10);
                  const trace = {
                    depart_constate_ne: dateDepart, // 🧾 trace « départ constaté par Nacelle Expert »
                    depart_constate_agent: (dossier.depart as any)?.agent || '',
                    updatedAt: new Date().toISOString(),
                  };
                  if (m.statut === 'disponible' || m.archived) {
                    // Partie directement depuis le stock (« au cas où ») —
                    // bascule automatique en location LLD, désarchivée si besoin
                    await updateDoc(refDepart, {
                      ...trace,
                      statut: 'louee_lld',
                      type_sortie: 'lld',
                      client_lld: m.client_lld || dossier.info?.client || '',
                      date_mise_dispo_lld: dateDepart,
                      archived: false, archived_at: null, archived_by: null,
                    });
                    syncHubspotProduct('archive', immatDepart); // sortie du catalogue
                    console.log(`🚚 ${immatDepart} : départ NE → louée LLD (était ${m.archived ? 'archivée' : m.statut})`);
                  } else if (m.statut === 'en_cours' && m.type_sortie === 'lld') {
                    // LLD en préparation : le départ vaut mise à disposition
                    await updateDoc(refDepart, {
                      ...trace,
                      statut: 'louee_lld',
                      date_mise_dispo_lld: m.date_mise_dispo_lld || dateDepart,
                    });
                    console.log(`🚚 ${immatDepart} : départ NE → mise à disposition LLD`);
                  } else if (m.statut === 'en_cours') {
                    // Vente en préparation : machine physiquement partie →
                    // étapes restantes validées, elle passe « Prête à facturer »
                    const etapes = Array.isArray(m.etapes_prepa)
                      ? m.etapes_prepa.map((e: any) =>
                          e.done || e.non_necessaire
                            ? e
                            : { ...e, done: true, done_by: 'Départ Nacelle Expert', done_at: new Date().toISOString() }
                        )
                      : m.etapes_prepa;
                    await updateDoc(refDepart, {
                      ...trace,
                      ...(m.type_prepa ? {} : { type_prepa: 'en_etat' }),
                      ...(etapes ? { etapes_prepa: etapes } : {}),
                    });
                    console.log(`🚚 ${immatDepart} : départ NE → prête à facturer (étapes validées)`);
                  } else {
                    console.log(`⏭️ ${immatDepart} : départ NE, statut « ${m.statut} » — rien à changer`);
                  }
                } else {
                  // Machine du parc LOCATION (hors stock VO) : on ne crée rien
                  console.log(`⏭️ ${immatDepart} : départ NE d'une machine hors parc VO — ignoré`);
                }
              }
            } catch (e) {
              console.error(`❌ Sécurité départ ${immatDepart}:`, e);
            }
            // Dossier traité : on le marque pour ne pas le reprendre en boucle
            await updateDoc(doc(dbNacelleExpert, 'dossiers', dossierDoc.id), { synced_to_delta_vo: true });
            successCount++;
            continue;
          }

          if (!dossier.info?.immat) {
            console.warn(`⚠️ Dossier sans immatriculation, ignoré`);
            continue;
          }

          if (!dossier.info?.modele) {
            console.warn(`⚠️ Dossier ${dossier.immat} sans modèle, ignoré`);
            continue;
          }

          // Créer la fiche VO dans Delta VO
          // L'ID du document machines_vo DOIT être l'immatriculation en MAJUSCULES :
          // c'est la clé de jointure avec l'import VOG. Sinon, doublon à la fusion.
          const immatId = (dossier.info?.immat || dossier.immat || '').trim().toUpperCase();
          if (!immatId) {
            console.warn('⚠️ Dossier sans immatriculation exploitable, ignoré');
            continue;
          }
          const machineVORef = doc(db, 'machines_vo', immatId);
          
          // ✅ Date demande récupération = date de retour (la machine est arrivée)
          const dateRecup = dossier.retour?.date || dossier.depart?.date || new Date().toISOString().slice(0, 10);
          
          const machineVOData: any = {
            // Données de base
            immat: immatId,
            modele: dossier.info.modele || '',
            type_nacelle: dossier.info.type_nacelle || '',
            annee_fab: dossier.info.annee_fab || '',
            
            // ✅ Date demande récupération auto-remplie (machine déjà arrivée)
            date_demande_recuperation: dateRecup,
            heures: dossier.retour?.heures || dossier.depart?.heures || '',
            km_porteur: dossier.retour?.km_porteur || dossier.depart?.km_porteur || '',

            // 📍 Localisation = lieu de restitution saisi par l'expert
            // (normalisée : « Ferrière »/« Ferrières », « St-Alban »/« St Alban »...)
            localite: normalizeLocalite(dossier.retour?.lieu_restitution) || '',

            // ⏳ Devis en attente (postes sur devis non chiffrés) — badge + blocage facture
            devis_pending_labels: dossier.devis_pending_labels || [],
            devis_complet: dossier.devis_complet ?? null,
            devis_valide: dossier.devis_valide || null,
            // 💶 Détail du devis chiffré par l'atelier (affiché à la secrétaire)
            devis_recu_items: Object.entries(dossier.devis_recu || {}).map(([id, e]) => ({
              // Libellé : mémorisé au chiffrage par NE en priorité (config/tarifs
              // peut ne pas exister tant que le barème par défaut n'a pas été modifié)
              label: e?.label || tarifLabels[id] || id,
              montant: Number(e?.montant) || 0,
              reference: e?.reference || '',
            })),
            // 💶 Résumé d'expertise NE → rapport_expertise (total retenue, dégâts) :
            // alimente le montant global et la modale expertise partout dans Delta VO
            ...(dossier.expertise_resume ? {
              rapport_expertise: {
                ...dossier.expertise_resume,
                rapport_url: `https://nacelle-expert2.vercel.app/api/rapport/${encodeURIComponent(immatId)}`,
              },
            } : {}),
            
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
            expertise_recue: true,    // ✅ Marqueur "expertise reçue" (fiches pré-créées ADV : passe de false à true)
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
            const smartUpdate: any = {
              // Nouvelles données d'expertise (remontent toujours)
              heures: machineVOData.heures,
              km_porteur: machineVOData.km_porteur,
              // Les photos de fiche remplacées dans Delta VO sont conservées
              // si c'est la même expertise (voir fusionPhotosCommerciales)
              dossier_nacelle_expert: {
                ...machineVOData.dossier_nacelle_expert,
                photos_commerciales:
                  String(existingData?.dossier_nacelle_expert?.date_retour || '') ===
                  String(dossier.retour?.date || '')
                    ? fusionPhotosCommerciales(
                        existingData?.dossier_nacelle_expert?.photos_commerciales,
                        machineVOData.dossier_nacelle_expert.photos_commerciales
                      )
                    : machineVOData.dossier_nacelle_expert.photos_commerciales,
              },

              // 📍 Nouveau lieu de restitution (relocation) — uniquement si renseigné,
              // sinon on conserve la localisation existante (posée à la main)
              ...(machineVOData.localite ? { localite: machineVOData.localite } : {}),

              // ⏳ État du devis (remonte toujours : attente, complet, validé)
              devis_pending_labels: machineVOData.devis_pending_labels,
              devis_complet: machineVOData.devis_complet,
              devis_valide: machineVOData.devis_valide,
              devis_recu_items: machineVOData.devis_recu_items,
              // 💶 Résumé d'expertise à jour (total retenue global) — uniquement
              // si présent, pour ne pas écraser un rapport legacy existant
              ...(machineVOData.rapport_expertise ? { rapport_expertise: machineVOData.rapport_expertise } : {}),

              // 🛡 MACHINE EN PRÉPARATION (validé avec Jonathan) : la
              // modification/re-validation d'une expertise ne la ramène JAMAIS
              // en cycle restitution/disponible et ne remet pas à zéro son
              // avancement (facture, fiche VO, étapes). Seul le retour manuel
              // d'un admin/super admin (annulation de préparation) peut la
              // repasser en disponible. Les données d'expertise, elles,
              // remontent bien (bloc ci-dessus).
              ...(existingData.statut === 'en_cours' ? {
                expertise_recue: true, // l'expertise à jour est bien arrivée
              } : {
              // ✅ Nouvelle date de récupération pour ce cycle de relocation
              date_demande_recuperation: dateRecup,

              // ✅ Une machine qui revient (dossier Nacelle-Expert resynchronisé)
              // repasse en cycle restitution pour nouvelle expertise/facturation.
              // 🗄️→✅ DÉSARCHIVAGE AUTOMATIQUE : une machine archivée (ex. purge
              // VOG alors qu'elle était en réalité partie en location) qui
              // revient avec une expertise reprend le circuit normal — sinon
              // son expertise arriverait sur une fiche invisible.
              ...(existingData.archived ? {
                archived: false,
                archived_at: null,
                archived_by: null,
                desarchivee_le: new Date().toISOString(),
                desarchivee_motif: 'Expertise retour reçue (retour de location)',
              } : {}),
              statut: 'restitution',
              recuperation_ok: true,
              expertise_ok: true,
              expertise_recue: true,    // ✅ L'expertise vient d'arriver (fiches pré-créées ADV incluses)
              facture_ok: false,        // ⏳ Nouvelle facture expertise à faire
              facture_reglee_ok: false, // ⏳ Nouveau règlement à recevoir
              fiche_vo_creee: false,    // ⏳ Refaire la fiche VO si besoin
              import_vog: false,        // ⏳ Vraie restitution : on lève le marqueur stock VOG
              }),

              // Conserver les données Delta VO existantes
              fiche_commerciale: existingData.fiche_commerciale,
              prix_fr: existingData.prix_fr,
              prix_dealer: existingData.prix_dealer,
              prix_modifie_le: existingData.prix_modifie_le,
              prix_modifie_par: existingData.prix_modifie_par,

              date_modification: new Date(),
            };
            
            // Nettoyer les undefined avant Firebase
            Object.keys(smartUpdate).forEach(key => {
              if (smartUpdate[key] === undefined) {
                delete smartUpdate[key];
              }
            });
            
            await updateDoc(machineVORef, smartUpdate);
            console.log(`✅ Machine ${dossier.immat} mise à jour (relocation détectée)`);

            // 🔄 HubSpot : la machine revient de location (expertise reçue) et
            // entre dans les Disponibles — si elle a un prix conservé, elle
            // RERENTRE automatiquement dans le catalogue produits.
            const prixRetour = Number(existingData.prix_fr) || 0;
            if (prixRetour > 0) {
              const labelRetour = [dossier.info?.type_nacelle, dossier.info?.modele]
                .filter(Boolean).join(' ');
              syncHubspotProduct('upsert', immatId, labelRetour || undefined, prixRetour);
            }
            notifyExpertiseArrivee({
              immat: immatId,
              modele: dossier.info?.modele,
              type_nacelle: dossier.info?.type_nacelle,
              date: dateRecup,
              type: 'retour',
            });
          } else {
            // 🆕 Nouvelle nacelle : création normale
            console.log(`💾 Création nouvelle fiche pour ${dossier.immat}`);
            // ⚠️ Firestore refuse les champs `undefined` (ex. createdBy absent
            // sur un dossier importé) : on les retire, sinon la fiche ne serait
            // JAMAIS créée et le dossier resterait bloqué en erreur de synchro.
            Object.keys(machineVOData).forEach((k) => {
              if ((machineVOData as any)[k] === undefined) delete (machineVOData as any)[k];
            });
            await setDoc(machineVORef, machineVOData);
            console.log(`✅ Fiche créée avec succès`);
            notifyExpertiseArrivee({
              immat: immatId,
              modele: dossier.info?.modele,
              type_nacelle: dossier.info?.type_nacelle,
              date: dateRecup,
              type: 'nouvelle',
            });
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
      syncEnCoursRef.current = false;
      if (resyncDemandeRef.current) {
        // Des dossiers sont arrivés pendant la synchro : on repasse une fois
        resyncDemandeRef.current = false;
        syncDossiers();
      }
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

  // ⚠️ Le rattrapage photos/PDF n'est plus automatique : il relisait tous les
  // dossiers + un getDoc par machine à CHAQUE chargement (coûteux). Il est
  // désormais manuel via runNacelleExpertRattrapage() — bouton admin (Disponibles).

  return {
    syncDossiers,
    isLoading,
    error,
    syncedCount,
  };
}

/**
 * Rattrapage MANUEL (déclenché par un bouton admin, plus en automatique au chargement).
 * Relit retour.pdf_url et retour.commercialPhotos dans Nacelle-Expert et met à jour
 * machines_vo si la valeur a changé (ex. détourage refait après la synchro).
 * Retourne le nombre de dossiers scannés et de machines mises à jour.
 */
export async function runNacelleExpertRattrapage(): Promise<{ scanned: number; updated: number }> {
  let scanned = 0;
  let updated = 0;

  const snap = await getDocs(collection(dbNacelleExpert, 'dossiers'));
  for (const d of snap.docs) {
    scanned++;
    const data: any = d.data();
    const immat = (data?.immat || data?.info?.immat || d.id || '').trim().toUpperCase();
    if (!immat) continue;

    const pdfUrl = data?.retour?.pdf_url;
    const commercialPhotos = data?.retour?.commercialPhotos;

    // Rien à rattraper pour ce dossier
    if (!pdfUrl && !(commercialPhotos && Object.keys(commercialPhotos).length > 0)) {
      continue;
    }

    try {
      const ref = doc(db, 'machines_vo', immat);
      const mSnap = await getDoc(ref);
      if (!mSnap.exists()) continue;
      const m: any = mSnap.data();

      const updates: any = {};

      // PDF de restitution
      if (pdfUrl) {
        const currentPdf = m?.dossier_nacelle_expert?.rapport_url || '';
        if (currentPdf !== pdfUrl) {
          updates['dossier_nacelle_expert.rapport_url'] = pdfUrl;
        }
      }

      // Photos détourées (commercialPhotos) — fusion qui PRÉSERVE les
      // remplacements faits dans Delta VO (le rattrapage les effaçait)
      if (commercialPhotos && Object.keys(commercialPhotos).length > 0) {
        const actuelles = m?.dossier_nacelle_expert?.photos_commerciales;
        const fusion = fusionPhotosCommerciales(actuelles, commercialPhotos);
        if (JSON.stringify(actuelles ?? null) !== JSON.stringify(fusion)) {
          updates['dossier_nacelle_expert.photos_commerciales'] = fusion;
        }
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(ref, updates);
        updated++;
        console.log(`🔄 Rattrapage Nacelle-Expert pour ${immat}:`, Object.keys(updates).join(', '));
      }
    } catch (e) {
      console.error('Rattrapage échoué pour', immat, e);
    }
  }

  return { scanned, updated };
}
