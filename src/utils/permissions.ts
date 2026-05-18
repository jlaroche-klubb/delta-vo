import { UserRole } from "../types";

/**
 * Système de permissions Delta VO
 * Basé sur la matrice validée le 18/05/2026
 */

// ==================== PAGES / NAVIGATION ====================

export function canAccessRestitutions(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canAccessDisponibles(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "dealer", "chef"].includes(role);
}

export function canAccessEnCours(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canAccessCloturees(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

export function canAccessStats(role: UserRole): boolean {
  return role === "admin";
}

export function canAccessAdmin(role: UserRole): boolean {
  return role === "admin";
}

// ==================== RESTITUTIONS ====================

export function canCreateRestitution(role: UserRole): boolean {
  return ["admin", "secretaire", "chef", "atelier"].includes(role);
}

export function canValidateRestitutionSteps(role: UserRole): boolean {
  return ["admin", "secretaire", "chef", "atelier"].includes(role);
}

export function canViewExpertiseReport(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "chef", "atelier"].includes(role);
}

// ==================== DISPONIBLES ====================

export function canViewAllMachines(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "dealer", "chef"].includes(role);
}

export function canViewPrixFR(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr"].includes(role);
}

export function canViewPrixExport(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "dealer"].includes(role);
}

export function canEditPrixFR(role: UserRole): boolean {
  return role === "admin";
}

export function canEditPrixExport(role: UserRole): boolean {
  return role === "admin";
}

export function canExportExcelPricing(role: UserRole): boolean {
  return ["admin", "secretaire"].includes(role);
}

export function canImportExcelPricing(role: UserRole): boolean {
  return role === "admin";
}

export function canCreateLLD(role: UserRole): boolean {
  return ["admin", "secretaire"].includes(role);
}

export function canGenerateFicheVO(role: UserRole): boolean {
  return ["admin", "vendeur_fr", "dealer"].includes(role);
}

export function canEditFicheCommerciale(role: UserRole): boolean {
  return ["admin", "secretaire", "vendeur_fr", "dealer"].includes(role);
}

// ==================== EN COURS DE PRÉPARATION ====================

export function canViewMachinesEnPreparation(role: UserRole): boolean {
  return true; // Tous les rôles
}

export function canEditEtapesPreparation(role: UserRole): boolean {
  return ["admin", "secretaire", "chef", "atelier"].includes(role);
}

export function canValidateEtapesTechniques(role: UserRole): boolean {
  return ["admin", "chef", "atelier"].includes(role);
}

// ==================== EXPERTISE ====================

export function canViewExpertiseDetail(role: UserRole): boolean {
  return true; // Tous les rôles
}

export function canEditExpertise(role: UserRole): boolean {
  return ["admin", "chef"].includes(role);
}

// ==================== HELPERS ====================

/**
 * Retourne la liste des pages accessibles pour un rôle
 */
export function getAccessiblePages(role: UserRole): string[] {
  const pages: string[] = [];
  
  if (canAccessRestitutions(role)) pages.push("restitutions");
  if (canAccessDisponibles(role)) pages.push("disponibles");
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
    admin: "Administrateur",
    secretaire: "Secrétaire/ADV",
    vendeur_fr: "Vendeur France",
    dealer: "Dealer Export",
    chef: "Chef d'équipe",
    atelier: "Atelier"
  };
  
  return `Action non autorisée pour le rôle ${roleLabels[role]}: ${action}`;
}
