/**
 * Normalisation des TYPES DE NACELLE pour les filtres.
 *
 * Le champ type_nacelle est saisi librement (import VOG, Nacelle Expert,
 * corrections manuelles) : le même modèle existe donc en plusieurs
 * orthographes — « KL32 », « Kl32 », « KL 32 », « kl32  »… — et le filtre
 * affichait une entrée par variante.
 *
 * normalizeTypeNacelle regroupe ces variantes sous un libellé unique,
 * exactement comme normalizeLocalite pour les sites. La donnée en base
 * n'est JAMAIS modifiée : la normalisation ne sert qu'à l'affichage des
 * filtres et au regroupement.
 *
 * Règles :
 *  1. espaces superflus retirés ;
 *  2. la clé de comparaison = lettres+chiffres en minuscules (sans espaces,
 *     tirets ni points) ;
 *  3. si la clé est dans CANON → libellé canonique (à compléter au besoin,
 *     par ex. pour fusionner deux écritures d'un même modèle) ;
 *  4. sinon, un code modèle court (≤ 10 caractères, contient un chiffre)
 *     est affiché en MAJUSCULES compactes (« Kl 32 » → « KL32 ») ;
 *  5. sinon (libellé long type « Snake 2010 H Plus ») chaque mot prend une
 *     majuscule initiale pour que la casse ne crée plus de doublons.
 */

// Libellés canoniques par clé compacte. À compléter si un modèle doit
// absolument s'écrire d'une façon précise, ou pour FUSIONNER deux écritures
// (ex. si « K26 » est une faute pour « KL26 », ajouter : k26: "KL26").
const CANON: Record<string, string> = {
  kl17p: "KL17P",
  kl21: "KL21",
  kl21b: "KL21B",
  kl26: "KL26",
  kl26cc: "KL26 CC",
  kl26trq: "KL26 TRQ",
  kl32: "KL32",
  kl38p: "KL38P",
  kl38ptrq: "KL38P TRQ",
  kl42p: "KL42P",
  sansnacelle: "Sans nacelle",
};

/** Clé compacte de comparaison : lettres/chiffres minuscules uniquement. */
function compactKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents retirés pour la clé
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeTypeNacelle(raw?: string | null): string {
  if (!raw) return "";
  const s = String(raw).replace(/\s+/g, " ").trim();
  if (!s) return "";

  const key = compactKey(s);
  if (!key) return s;

  // 1) Libellé canonique connu
  if (CANON[key]) return CANON[key];

  // 2) Code modèle court : MAJUSCULES compactes (KL32, K38P, VT48NEXS, PT180E…)
  if (key.length <= 10 && /\d/.test(key)) {
    return key.toUpperCase();
  }

  // 3) Libellé long : une majuscule par mot pour neutraliser la casse
  return s
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

/**
 * 🚚 Machine HORS VENTE d'après le fichier du parc VOG (validé avec Jonathan) :
 * la colonne « Disponibilté » fait autorité — tout ce qui n'est pas « OK »
 * (LOC …, PRET …, VENTE …, à vérifier, fin de loc…) ne doit apparaître sur
 * AUCUNE page de vente, quel que soit le statut interne de la machine
 * (y compris une fiche restitution encore ouverte pour sa facturation).
 */
export function horsVenteVog(m: { disponibilite_vog?: string }): boolean {
  const d = (m.disponibilite_vog || "").trim();
  return d !== "" && !/^ok$/i.test(d);
}
