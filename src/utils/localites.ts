/**
 * Localisation des machines (sites Delta Services).
 *
 * La localisation vient en priorité de Nacelle Expert : c'est le
 * « Lieu de restitution » saisi par l'expert lors de l'expertise retour
 * (champ obligatoire). Elle peut aussi être ajustée à la main dans Delta VO.
 *
 * normalizeLocalite harmonise les orthographes entre les deux applications
 * (« Ferrière » / « Ferrières », « St-Alban » / « St Alban »...) pour que
 * l'affichage et les filtres regroupent bien le même site.
 */

// Liste canonique — alignée sur les lieux de restitution de Nacelle Expert
// (EGI, Ferrières, Avignon, St Alban) + le site Croissy propre à Delta VO.
export const LOCALITES = ["EGI", "Ferrières", "Croissy", "Avignon", "St Alban"];

const CANON: Record<string, string> = {
  egi: "EGI",
  ferriere: "Ferrières",
  ferrieres: "Ferrières",
  croissy: "Croissy",
  avignon: "Avignon",
  stalban: "St Alban",
  saintalban: "St Alban",
};

export function normalizeLocalite(raw?: string | null): string {
  if (!raw) return "";
  const key = raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[\s.\-_']/g, "");      // séparateurs
  return CANON[key] || raw.trim();
}
