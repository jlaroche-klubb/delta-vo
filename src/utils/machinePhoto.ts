import { Machine } from "../types/machine";

/**
 * Retourne la première URL de photo trouvée dans une valeur quelconque
 * (string, tableau, ou objet type { url } / map de photos).
 */
function firstUrl(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v.trim() ? v : undefined;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = firstUrl(x);
      if (u) return u;
    }
    return undefined;
  }
  if (typeof v === "object") {
    if (typeof v.url === "string" && v.url.trim()) return v.url;
    for (const k of Object.keys(v)) {
      const u = firstUrl(v[k]);
      if (u) return u;
    }
  }
  return undefined;
}

/**
 * Première photo disponible pour une machine, avec repli en cascade :
 * photos commerciales/supplémentaires Delta VO -> photos de vente ->
 * photos du dossier Nacelle-Expert (commerciales, retour, départ).
 */
export function getMachinePhotoUrl(machine: Machine): string | undefined {
  const m: any = machine;
  return (
    firstUrl(m.photos_supplementaires) ||
    firstUrl(m.photos_commerciales) ||
    firstUrl(m.photos_ventes) ||
    firstUrl(m.dossier_nacelle_expert?.photos_commerciales) ||
    firstUrl(m.dossier_nacelle_expert?.photos_retour) ||
    firstUrl(m.dossier_nacelle_expert?.photos_depart) ||
    undefined
  );
}
