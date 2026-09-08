import { arrayUnion } from "firebase/firestore";
import { auth } from "../firebase";

/**
 * 🧾 HISTORIQUE DES CHANGEMENTS DE STATUT (demandé après le cas GN-610-XG :
 * impossible de savoir qui / quoi avait fait passer une machine de A à B).
 *
 * Chaque écriture qui change le statut d'une machine ajoute une ligne
 * `historique` : date, ancien statut, nouveau statut, origine (synchro NE,
 * import VOG, clic d'étape, mise en location, annulation…), utilisateur
 * connecté et note libre. Visible en super admin (🔎 Diagnostic).
 */
export interface EntreeHistorique {
  date: string;
  de: string;
  vers: string;
  source: string;
  par: string;
  note?: string;
}

export type SourceHistorique =
  | "synchro_ne_retour"
  | "synchro_ne_depart"
  | "import_vog"
  | "etape_restitution"
  | "mise_en_location"
  | "configuration_prepa"
  | "annulation_prepa"
  | "facturation"
  | "reouverture"
  | "creation_manuelle"
  | "webhook_hubspot";

export const LIBELLES_SOURCE: Record<SourceHistorique, string> = {
  synchro_ne_retour: "Synchro Nacelle Expert — expertise retour",
  synchro_ne_depart: "Synchro Nacelle Expert — départ",
  import_vog: "Import fichier VOG",
  etape_restitution: "Étape restitution (clic)",
  mise_en_location: "Mise en location",
  configuration_prepa: "Mise en préparation",
  annulation_prepa: "Annulation de la préparation",
  facturation: "Facturation / mise à disposition",
  reouverture: "Réouverture de la restitution",
  creation_manuelle: "Création manuelle (Restitutions)",
  webhook_hubspot: "Webhook HubSpot",
};

function utilisateurCourant(): string {
  const u = auth.currentUser;
  return u?.displayName || u?.email || "—";
}

/** Valeur à passer dans un updateDoc/setDoc : `{ historique: traceStatut(...) }` */
export function traceStatut(de: string | undefined, vers: string, source: SourceHistorique, note?: string, par?: string) {
  const entree: EntreeHistorique = {
    date: new Date().toISOString(),
    de: de || "—",
    vers,
    source,
    par: par || utilisateurCourant(),
    ...(note ? { note } : {}),
  };
  return arrayUnion(entree);
}
