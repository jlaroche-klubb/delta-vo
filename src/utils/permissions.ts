import { UserRole } from "../types";

/**
 * Système de permissions Delta VO
 * Basé sur la matrice validée le 18/05/2026
 */

// ==================== NIVEAUX D'ADMINISTRATION ====================
// 👑 superadmin (Jonathan) : peut TOUT faire, y compris les « éléments de
// structure » (utilisateurs/rôles, import VOG + purge, suppressions
// définitives, annulation de clôture).
// ⚙️ admin (restreint) : toute l'exploitation quotidienne, mais pas la structure.

export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "superadmin";
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === "superadmin";
}

// ==================== PAGES / NAVIGATION ====================

export function canAccessRestitutions(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canAccessDisponibles(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "dealer", "chef"].includes(role);
}

export function canAccessEnCours(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canAccessCloturees(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canAccessStats(role: UserRole): boolean {
  return isAdminRole(role);
}

export function canAccessAdmin(role: UserRole): boolean {
  // 🔒 Structure : gestion des utilisateurs et des rôles
  return isSuperAdmin(role);
}

export function canAccessExport(_role: UserRole): boolean {
  return true; // Onglet Export visible par tous les rôles
}

// ==================== RESTITUTIONS ====================

export function canCreateRestitution(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "chef", "atelier"].includes(role);
}

export function canValidateRestitutionSteps(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "chef", "atelier"].includes(role);
}

export function canViewExpertiseReport(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canExportRestitutions(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

/**
 * Modifier les infos ADMINISTRATIVES d'une fiche machine
 * (client, n° contrat, email, modèle...) — y compris sur les fiches
 * arrivées par la synchro d'expertise Nacelle-Expert.
 * Les photos et le contenu d'expertise ne sont jamais modifiables.
 */
export function canEditInfosAdmin(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

// ==================== DISPONIBLES ====================

export function canViewAllMachines(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "dealer", "chef"].includes(role);
}

export function canViewPrixFR(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr"].includes(role);
}

export function canViewPrixExport(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "dealer"].includes(role);
}

export function canEditPrixFR(role: UserRole): boolean {
  return isAdminRole(role);
}

export function canEditPrixExport(role: UserRole): boolean {
  return isAdminRole(role);
}

export function canExportExcelPricing(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

export function canImportExcelPricing(role: UserRole): boolean {
  return isAdminRole(role);
}

/** 💶 Circuit VNC (compta -> ADV) : import du fichier VNC et export manuel */
export function canManageVnc(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

/**
 * Export liste de prix commerciale (pour envoyer aux clients)
 * Accessible à tous sauf chef et atelier
 */
export function canExportListePrix(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "dealer"].includes(role);
}

export function canCreateLLD(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

export function canGenerateFicheVO(role: UserRole): boolean {
  return ["superadmin", "admin", "vendeur_fr", "dealer"].includes(role);
}

export function canEditFicheCommerciale(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "dealer"].includes(role);
}

/**
 * Gérer les photos supplémentaires d'une machine (galerie : upload + pioche
 * dans Nacelle-Expert). N'affecte JAMAIS les 4 photos officielles de la fiche.
 * Même périmètre que ceux qui gèrent la fiche.
 */
export function canManagePhotosSupplementaires(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "vendeur_fr", "dealer"].includes(role);
}

// ==================== EN COURS DE PRÉPARATION ====================

export function canViewMachinesEnPreparation(role: UserRole): boolean {
  return true; // Tous les rôles
}

export function canEditEtapesPreparation(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire", "chef", "atelier"].includes(role);
}

export function canValidateEtapesTechniques(role: UserRole): boolean {
  return ["superadmin", "admin", "chef", "atelier"].includes(role);
}

/**
 * Configurer la mise en cours (choix prépa normale/en l'état + infos vente)
 * Admin et Secrétaire/ADV uniquement
 */
export function canConfigureEnCours(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

/**
 * Facturer une machine (marquer comme facturée → clôturée)
 * Admin et Secrétaire/ADV uniquement
 */
export function canFacturer(role: UserRole): boolean {
  return ["superadmin", "admin", "secretaire"].includes(role);
}

/**
 * Annuler une mise en préparation (retour en disponible)
 * Admin uniquement
 */
export function canCancelEnCours(role: UserRole): boolean {
  return isAdminRole(role);
}

// ==================== EXPERTISE ====================

export function canViewExpertiseDetail(role: UserRole): boolean {
  return true; // Tous les rôles
}

export function canEditExpertise(role: UserRole): boolean {
  return ["superadmin", "admin", "chef"].includes(role);
}

// ==================== SUPPRESSION ====================

export function canDeleteMachine(role: UserRole): boolean {
  // 🔒 Structure : suppression définitive
  return isSuperAdmin(role);
}

/** 🔒 Structure : import de la base VOG (et purge exceptionnelle) */
export function canImportVogStock(role: UserRole): boolean {
  return isSuperAdmin(role);
}

/** 🔒 Structure : annuler une clôture (efface facture et règlement) */
export function canCancelCloture(role: UserRole): boolean {
  return isSuperAdmin(role);
}

// ==================== HELPERS ====================

/**
 * Retourne la liste des pages accessibles pour un rôle
 */
export function getAccessiblePages(role: UserRole): string[] {
  const pages: string[] = [];
  
  if (canAccessRestitutions(role)) pages.push("restitutions");
  if (canAccessDisponibles(role)) pages.push("disponibles");
  if (canAccessExport(role)) pages.push("export");
  if (canAccessEnCours(role)) pages.push("encours");
  if (canAccessCloturees(role)) pages.push("cloturees");
  if (canAccessStats(role)) pages.push("stats");
  if (canAccessAdmin(role)) pages.push("admin");
  
  return pages;
}

/**
 * Vérifie si un utilisateur a accès à une page spécifique
 */
export function hasPageAccess(role: UserRole, page: string): boolean {
  const accessiblePages = getAccessiblePages(role);
  return accessiblePages.includes(page);
}

/**
 * Retourne un message d'erreur personnalisé selon le rôle
 */
export function getPermissionDeniedMessage(role: UserRole, action: string): string {
  const roleLabels: Record<UserRole, string> = {
    superadmin: "Super administrateur",
    admin: "Administrateur",
    secretaire: "Secrétaire/ADV",
    vendeur_fr: "Vendeur France",
    dealer: "Dealer Export",
    chef: "Chef d'équipe",
    atelier: "Atelier"
  };
  
  return `Action non autorisée pour le rôle ${roleLabels[role]}: ${action}`;
}
