/**
 * 🇫🇷 Recherche d'entreprises et d'adresses françaises — API publiques de
 * l'État, gratuites et sans clé (appelées directement depuis le navigateur) :
 *   - Recherche d'entreprises (annuaire-entreprises.data.gouv.fr) : nom ou SIREN
 *     → raison sociale, SIREN, adresse du siège
 *   - Géoplateforme IGN (ex-API Adresse / BAN) : saisie semi-automatique d'adresse
 * Pas de Google : Google Places demande une clé API payante.
 */

export interface EntrepriseFR {
  siren: string;
  raison_sociale: string;
  adresse: string;
  cp: string;
  ville: string;
  tva_intra?: string;
  activite?: string;
  fermee?: boolean;
}

export interface AdresseFR {
  label: string;
  adresse: string; // n° + voie
  cp: string;
  ville: string;
}

const enCours = new Map<string, AbortController>();

async function getJson(cle: string, url: string): Promise<any | null> {
  enCours.get(cle)?.abort(); // on annule la requête précédente (frappe rapide)
  const ctrl = new AbortController();
  enCours.set(cle, ctrl);
  const minuterie = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

const propre = (s: any) => String(s ?? "").replace(/\s+/g, " ").trim();

export async function rechercherEntreprises(q: string): Promise<EntrepriseFR[]> {
  const t = q.replace(/\s/g, "").match(/^\d{9}$/) ? q.replace(/\s/g, "") : q.trim();
  if (t.length < 3) return [];
  const j = await getJson("entreprise", `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(t)}&per_page=6&page=1`);
  return (j?.results || []).map((e: any) => {
    const s = e.siege || {};
    const voie = propre([s.numero_voie, s.indice_repetition, s.type_voie, s.libelle_voie].filter(Boolean).join(" "));
    return {
      siren: String(e.siren || ""),
      raison_sociale: propre(e.nom_raison_sociale || e.nom_complet || ""),
      adresse: voie || propre(String(s.adresse || "").replace(new RegExp(`\\s*${s.code_postal || "#"}.*$`), "")),
      cp: String(s.code_postal || ""),
      ville: propre(s.libelle_commune || ""),
      tva_intra: Array.isArray(e.tva) ? String(e.tva[0] || "") : "",
      activite: propre(e.libelle_activite_principale || e.activite_principale || ""),
      fermee: e.etat_administratif === "C",
    } as EntrepriseFR;
  });
}

export async function rechercherAdresses(q: string): Promise<AdresseFR[]> {
  if (q.trim().length < 4) return [];
  const j = await getJson("adresse", `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q.trim())}&autocomplete=1&limit=6&index=address`);
  return (j?.features || []).map((f: any) => {
    const p = f.properties || {};
    return { label: String(p.label || ""), adresse: String(p.name || ""), cp: String(p.postcode || ""), ville: String(p.city || "") };
  });
}

export const sirenValide = (s?: string) => /^\d{9}$/.test(String(s || "").replace(/\s/g, ""));
export const cpValide = (s?: string) => /^\d{5}$/.test(String(s || "").trim());
export const emailValide = (s?: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
export const telValide = (s?: string) => String(s || "").replace(/\D/g, "").length >= 9;
