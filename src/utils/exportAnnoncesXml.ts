import { Machine } from "../types/machine";

// ============================================================
// EXPORT XML DES ANNONCES WEB — ébauche pour Via Mobilis
// (Europe-Utilitaires.com) et autres plateformes.
// ============================================================
// Contexte (échange E. Colinmaire / Via Mobilis, 09/09/2026) :
// c'est NOUS qui proposons la structure du fichier, la plateforme
// valide ensuite et signale les éléments manquants. Structure
// volontairement plate et lisible, ajustable après leur retour.
//
// Périmètre (décision J. Laroche, 23/10/2026) : uniquement les
// machines SÉLECTIONNÉES à la main (champ annonce_web coché par
// un admin sur la fiche) ET disposant d'un prix FR.
// Prix affiché : Prix France HT.

/** Échappement XML minimal (texte et attributs) */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Balise optionnelle : rien si la valeur est vide/indéfinie */
function tag(name: string, v: unknown): string {
  if (v === undefined || v === null || String(v).trim() === "") return "";
  return `    <${name}>${esc(String(v).trim())}</${name}>\n`;
}

/** Toutes les URLs de photos d'une machine, dans l'ordre commercial :
 *  3/4 détourés (ventes) → 4 angles commerciaux → habitacles → supplémentaires */
export function photosAnnonce(m: Machine): string[] {
  const urls: string[] = [];
  const push = (u?: string) => {
    if (u && /^https?:\/\//.test(u) && !urls.includes(u)) urls.push(u);
  };
  push(m.photos_ventes?.trois_quart_av_droit);
  push(m.photos_ventes?.trois_quart_ar_gauche);
  push(m.photos_commerciales?.av_droit);
  push(m.photos_commerciales?.av_gauche);
  push(m.photos_commerciales?.ar_droit);
  push(m.photos_commerciales?.ar_gauche);
  push(m.photos_ventes?.habitacle_av);
  push(m.photos_ventes?.habitacle_ar);
  for (const p of m.photos_supplementaires || []) push(p.url);
  return urls;
}

/** Machines publiables : sélection manuelle (annonce_web) + prix FR renseigné */
export function machinesPubliables(machines: Machine[]): Machine[] {
  return machines.filter(
    (m) => m.statut === "disponible" && !m.archived && m.annonce_web && m.prix_fr != null
  );
}

export function buildAnnoncesXml(machines: Machine[]): string {
  const publiables = machinesPubliables(machines);
  const genereLe = new Date().toISOString();

  const items = publiables
    .map((m) => {
      const fc = m.fiche_commerciale;
      let x = `  <annonce>\n`;
      // 🏷️ Référence commerciale = N° occasion (identifiant public Delta VO)
      x += tag("reference", m.numero_occasion || m.numero_dossier || m.id);
      x += tag("immatriculation", m.immat);
      x += tag("categorie_vehicule", m.categorie_vehicule); // VL / PL / TR
      x += tag("famille", "Nacelle élévatrice sur porteur");
      x += tag("modele_nacelle", m.type_nacelle);
      x += tag("porteur", m.modele_porteur);
      x += tag("annee", m.annee_circulation);
      x += tag("kilometrage", m.km_porteur);
      x += tag("heures_nacelle", m.heures_nacelle);
      x += tag("hauteur_travail_m", fc?.hauteur_travail_m);
      x += tag("deport_travail_m", fc?.deport_travail_m);
      x += tag("personnes_panier", fc?.nb_personnes_panier);
      x += tag("puissance_porteur", fc?.puissance_porteur);
      if (fc?.options?.length) {
        x += `    <options>\n`;
        for (const o of fc.options) x += `      <option>${esc(o)}</option>\n`;
        x += `    </options>\n`;
      }
      x += tag("amenagement_interieur", fc?.amenagement_interieur);
      x += tag("prix_ht", m.prix_fr);
      x += tag("devise", "EUR");
      x += tag("localisation", m.localite);
      x += tag("pays", "France");
      x += tag("disponible_depuis", m.date_mise_stock);
      const photos = photosAnnonce(m);
      if (photos.length) {
        x += `    <photos>\n`;
        for (const u of photos) x += `      <photo>${esc(u)}</photo>\n`;
        x += `    </photos>\n`;
      }
      x += `  </annonce>\n`;
      return x;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<annonces societe="Delta Services (Groupe Klubb)" genere_le="${esc(genereLe)}" nb="${publiables.length}">\n` +
    `  <contact>\n` +
    `    <societe>Delta Services</societe>\n` +
    `    <adresse>84 Boulevard Courcerin, 77183 Croissy-Beaubourg, France</adresse>\n` +
    `    <telephone>+33 1 60 95 47 80</telephone>\n` +
    `    <email>assistanat.commerce@delta-services.fr</email>\n` +
    `  </contact>\n` +
    items +
    `</annonces>\n`
  );
}

/** Génère et télécharge le fichier XML des annonces sélectionnées */
export function exportAnnoncesXml(machines: Machine[]): number {
  const publiables = machinesPubliables(machines);
  if (publiables.length === 0) return 0;
  const xml = buildAnnoncesXml(machines);
  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2, "0")}-${(now.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${now.getFullYear()}`;
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `delta-vo_annonces_${dateStr}.xml`;
  a.click();
  URL.revokeObjectURL(url);
  return publiables.length;
}
