import type { Machine, EtudeMarche } from "../types/machine";

/**
 * 📊 Lance UNE étude de marché IA pour une machine (appel /api/etude-marche)
 * et renvoie l'objet EtudeMarche prêt à enregistrer. Partagé entre la fenêtre
 * unitaire (EtudeMarcheModal) et le traitement global (EtudeMarcheTous).
 * Lève une erreur en cas d'échec (message lisible).
 */
export async function lancerEtudeMarche(machine: Machine, userName: string): Promise<EtudeMarche> {
  const fc = machine.fiche_commerciale || {};
  const resp = await fetch("/api/etude-marche", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type_nacelle: machine.type_nacelle || "",
      modele_porteur: machine.modele_porteur || "",
      annee: machine.annee_circulation || "",
      heures: machine.heures_nacelle ?? "",
      km: machine.km_porteur ?? "",
      hauteur: fc.hauteur_travail_m ?? "",
      deport: fc.deport_travail_m ?? "",
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error || `Erreur ${resp.status}`);
  return {
    date: new Date().toISOString().slice(0, 10),
    par: userName,
    fourchette_basse: data.fourchette_basse ?? undefined,
    fourchette_haute: data.fourchette_haute ?? undefined,
    mediane: data.mediane ?? undefined,
    nb_annonces: data.nb_annonces ?? 0,
    commentaire: data.commentaire || "",
    annonces: data.annonces || [],
  };
}

/** Une étude est considérée « fraîche » si elle date de moins de N jours. */
export function etudeRecente(m: Machine, jours = 30): boolean {
  const d = m.etude_marche?.date;
  if (!d) return false;
  const t = new Date(d).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < jours * 86400000;
}
