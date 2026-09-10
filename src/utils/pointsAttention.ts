import type { Machine, PointsAttention } from "../types/machine";

/**
 * 🚩 POINTS D'ATTENTION VENDEURS (validé avec Jonathan, 10/09/2026).
 *
 * Ce qu'un vendeur doit savoir sur l'état réel d'une machine avant de la
 * proposer (moteur HS, boîte HS, nacelle HS, vendu en l'état…).
 * - Saisie : admin / super admin / secrétaire / chef / atelier.
 * - Lecture : tous les rôles (carte Disponibles, Liste Prix, Pricing PDG).
 * - Jamais sur la fiche VO ni les documents remis au client.
 */

export type MotifAttention = {
  key: string;
  label: string;
  /** rouge = bloquant pour l'usage ; orange = à signaler */
  gravite: "rouge" | "orange";
};

export const MOTIFS_ATTENTION: MotifAttention[] = [
  { key: "moteur_hs", label: "Moteur HS", gravite: "rouge" },
  { key: "boite_hs", label: "Boîte de vitesses HS", gravite: "rouge" },
  { key: "nacelle_hs", label: "Nacelle HS / ne monte pas", gravite: "rouge" },
  { key: "hydraulique", label: "Fuite / défaut hydraulique", gravite: "orange" },
  { key: "electrique", label: "Défaut électrique", gravite: "orange" },
  { key: "carrosserie", label: "Carrosserie très abîmée", gravite: "orange" },
  { key: "pneus", label: "Pneus à remplacer", gravite: "orange" },
  { key: "ct", label: "Contrôle technique à refaire", gravite: "orange" },
  { key: "vgp", label: "VGP à refaire", gravite: "orange" },
  { key: "en_l_etat", label: "Vendu en l'état (sans remise en état)", gravite: "orange" },
  { key: "ne_roule_pas", label: "Ne roule pas / non déplaçable", gravite: "rouge" },
  { key: "pieces_manquantes", label: "Pièces manquantes", gravite: "orange" },
];

const PAR_CLE = new Map(MOTIFS_ATTENTION.map((m) => [m.key, m]));

export function libelleMotif(key: string): string {
  return PAR_CLE.get(key)?.label || key;
}

/** true si au moins un point d'attention est renseigné */
export function aDesPointsAttention(m: Machine): boolean {
  const p = m.points_attention;
  return !!p && ((p.motifs?.length || 0) > 0 || !!(p.texte && p.texte.trim()));
}

/** rouge si un motif bloquant est coché, sinon orange */
export function gravitePointsAttention(p?: PointsAttention): "rouge" | "orange" {
  if (!p) return "orange";
  return p.motifs?.some((k) => PAR_CLE.get(k)?.gravite === "rouge") ? "rouge" : "orange";
}

/** Texte sur une ligne pour les exports Excel : « Moteur HS · Pneus à remplacer — précision libre » */
export function pointsAttentionTexte(m: Machine): string {
  const p = m.points_attention;
  if (!p) return "";
  const motifs = (p.motifs || []).map(libelleMotif).join(" · ");
  const texte = (p.texte || "").trim();
  return [motifs, texte].filter(Boolean).join(" — ");
}
