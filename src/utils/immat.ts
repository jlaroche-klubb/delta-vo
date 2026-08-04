/**
 * Normalise une immatriculation au format SIV "AB-123-CD" (majuscules, tirets)
 * dès que la saisie correspond au motif 2 lettres + 3 chiffres + 2 lettres,
 * quels que soient les séparateurs tapés (espaces, points, rien...).
 * Hors format SIV (engins, plaques étrangères) : majuscules simples, inchangé.
 *
 * ⚠️ MÊME LOGIQUE que dans Nacelle Expert : c'est ce qui garantit qu'une
 * immatriculation saisie dans Delta VO retombe sur le MÊME dossier
 * Nacelle Expert (clé de jointure), sans créer de doublon.
 */
export function normalizeImmat(raw: string): string {
  const s = (raw || "").toUpperCase();
  const compact = s.replace(/[\s.\-_]/g, "");
  if (/^[A-Z]{2}[0-9]{3}[A-Z]{2}$/.test(compact)) {
    return compact.slice(0, 2) + "-" + compact.slice(2, 5) + "-" + compact.slice(5);
  }
  return s;
}
