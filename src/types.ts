export type UserRole = "admin" | "secretaire" | "vendeur_fr" | "vendeur_export" | "chef" | "atelier";

export interface UserProfile {
  email: string;
  nom: string;
  prenom: string;
  role: UserRole;
  phone?: string;                  // NOUVEAU v5 : pour fiches VO
  activatedAt?: string;
  createdAt: string;
}

export interface PendingUser extends UserProfile {
  status: "pending";
}