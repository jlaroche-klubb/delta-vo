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
  const brut = String(m.numero_occasion || "").trim().toUpperCase();
  if (!brut) return "VO";
  let prop = String(m.proprietaire || "DS").trim().toUpperCase();
  // N° saisi avec les initiales (« 1240DS », « DS 1240 ») : pas de doublon « DS1240DS »
  const x = brut.match(/^([A-Z]{2})?[\s-]*(\d+)[\s-]*([A-Z]{2})?$/);
  if (x) {
    prop = x[1] || x[3] || prop;
    return `${prop}${x[2]}`;
  }
  return brut.startsWith(prop) ? brut : `${prop}${brut}`;
}
