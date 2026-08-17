import { Machine } from "../types/machine";

/**
 * 🏷️ RÉFÉRENCE COMMERCIALE (validée avec Jonathan).
 *
 * Remplace l'immatriculation sur tout ce qui circule AVANT la facture
 * (devis HubSpot, fiche VO, photos composées) : les commerciaux ne
 * parlent qu'avec cette référence.
 *
 * Format : initiales du propriétaire + n° d'occasion → « DS1587 »
 * (DS = Delta Services, KF = Klubb France). Sans n° d'occasion : « VO ».
 */
export function referenceCommerciale(
  m: Pick<Machine, "numero_occasion" | "proprietaire">
): string {
  const num = String(m.numero_occasion || "").trim();
  if (!num) return "VO";
  const prop = String(m.proprietaire || "DS").trim().toUpperCase();
  return `${prop}${num}`;
}
