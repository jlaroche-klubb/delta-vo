/**
 * ════════════════════════════════════════════════════════════════
 * SERVICE NACELLE-EXPERT
 * ════════════════════════════════════════════════════════════════
 * Récupère les dossiers d'expertise depuis le Firestore
 * de nacelle-expert et les convertit en Machine Delta VO.
 *
 * Flux unidirectionnel : nacelle-expert → Delta VO (lecture seule)
 *
 * Photos détourées : depuis le 13 mai 2026, nacelle-expert stocke
 * les photos commerciales (4 angles détourés + composés avec bande
 * Delta) dans Firebase Storage et expose les URLs via le champ
 * retour.commercialPhotos.
 * ════════════════════════════════════════════════════════════════
 */

import {
    collection,
    onSnapshot,
    Unsubscribe,
  } from "firebase/firestore";
  import { nacelleExpertDb } from "../firebase";
  import { Machine } from "../types/machine";
  
  // ════════════════════════════════════════════════════════════════
  // TYPES (structure d'un dossier nacelle-expert)
  // ════════════════════════════════════════════════════════════════
  
  interface PhotoBase {
    name: string;
    url: string;
  }
  
  interface CommercialPhoto {
    url: string;       // URL Firebase Storage
    type?: string;     // "storage"
  }
  
  interface CommercialPhotos {
    av_droit?: CommercialPhoto;
    av_gauche?: CommercialPhoto;
    ar_droit?: CommercialPhoto;
    ar_gauche?: CommercialPhoto;
  }
  
  interface InfoDossier {
    agent?: string;
    annee_fab?: string;
    client?: string;
    contrat?: string;
    date?: string;
    email?: string;
    heures?: string;
    immat?: string;
    km_porteur?: string;
    modele?: string;
    type_nacelle?: string;
  }
  
  interface EtatDesLieux {
    agent?: string;
    date?: string;
    heures?: string;
    km_porteur?: string;
    note?: string;
    degats?: any[];
    photos?: Record<string, PhotoBase[]>;
    commercialPhotos?: CommercialPhotos;  // ← NOUVEAU : photos détourées
  }
  
  interface DossierNacelleExpert {
    id?: string;
    immat?: string;
    createdAt?: string;
    createdBy?: string;
    createdByName?: string;
    sansDossier?: boolean;
    info?: InfoDossier;
    depart?: EtatDesLieux;
    retour?: EtatDesLieux;
  }
  
  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════
  
  /**
   * Extrait les URLs des photos commerciales détourées dans l'ordre :
   * av_droit, av_gauche, ar_droit, ar_gauche
   * (= les 4 angles utilisés pour la fiche VO commerciale)
   */
  function extractCommercialPhotos(
    commercialPhotos?: CommercialPhotos
  ): string[] {
    if (!commercialPhotos) return [];
  
    const angles: (keyof CommercialPhotos)[] = [
      "av_droit",
      "av_gauche",
      "ar_droit",
      "ar_gauche",
    ];
  
    return angles
      .map((angle) => commercialPhotos[angle]?.url)
      .filter((url): url is string => typeof url === "string" && url.length > 0);
  }
  
  /**
   * Convertit une string en number, retourne undefined si vide ou invalide
   */
  function toNumber(value?: string): number | undefined {
    if (!value || value.trim() === "") return undefined;
    const n = parseFloat(value);
    return isNaN(n) ? undefined : n;
  }
  
  // ════════════════════════════════════════════════════════════════
  // CONVERSION : Dossier nacelle-expert → Machine Delta VO
  // ════════════════════════════════════════════════════════════════
  function dossierToMachine(
    dossier: DossierNacelleExpert,
    firestoreId: string
  ): Machine {
    const info = dossier.info || {};
    const retour = dossier.retour || {};
  
    const immat = info.immat || dossier.immat || firestoreId;
  
    // Priorité aux photos commerciales détourées (Firebase Storage)
    // Si pas dispo → on n'a pas de photos utilisables pour la fiche VO
    const photos = extractCommercialPhotos(retour.commercialPhotos);
  
    // Détection des dossiers de test
    const isTest =
      (info.client || "").toUpperCase().includes("TEST") ||
      immat.toUpperCase().includes("TEST");
  
    const clientOrigine = info.client || "";
    const contratOrigine = info.contrat || "";
    const dateRetour =
      retour.date || info.date || dossier.createdAt?.slice(0, 10) || "";
    const anneeStr = info.annee_fab || "";
  
    return {
      id: `ne-${firestoreId}`,
      immat: immat,
  
      // === Noms "Delta VO" classiques ===
      type_nacelle: info.type_nacelle || "—",
      modele_porteur: info.modele || "—",
      annee_circulation: anneeStr,
      client_precedent: clientOrigine,
      contrat: contratOrigine,
      date_retour: dateRetour,
  
      // === Noms "modernes" ===
      modele_nacelle: info.type_nacelle || "—",
      annee: toNumber(info.annee_fab),
      km: toNumber(retour.km_porteur) || toNumber(info.km_porteur),
      heures: toNumber(retour.heures) || toNumber(info.heures),
      client_origine: clientOrigine,
      contrat_origine: contratOrigine,
      agent_expert: retour.agent || info.agent || "",
      notes_expert: retour.note || "",
  
      // === Photos détourées (URLs Firebase Storage) ===
      photos_detourees: photos,
  
      // === Workflow Restitution ===
      statut: "restitution",
      recuperation_ok: false,
      expertise_ok: false,
      facture_ok: false,
      facture_reglee_ok: false,
      fiche_vo_creee: false,
  
      // === Méta ===
      is_test: isTest,
      createdAt: dossier.createdAt,
      source: "nacelle-expert",
    } as Machine;
  }
  
  // ════════════════════════════════════════════════════════════════
  // LISTENER TEMPS RÉEL
  // ════════════════════════════════════════════════════════════════
  export function subscribeToDossiers(
    onUpdate: (machines: Machine[]) => void,
    onError?: (err: Error) => void
  ): Unsubscribe {
    const dossiersRef = collection(nacelleExpertDb, "dossiers");
  
    return onSnapshot(
      dossiersRef,
      (snapshot) => {
        const machines: Machine[] = snapshot.docs.map((doc) =>
          dossierToMachine(doc.data() as DossierNacelleExpert, doc.id)
        );
  
        console.log(
          `[nacelleExpertService] ${machines.length} dossiers récupérés`,
          machines
        );
  
        onUpdate(machines);
      },
      (error) => {
        console.error("[nacelleExpertService] Erreur Firestore:", error);
        if (onError) onError(error);
      }
    );
  }