import { useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { useMachines } from "../contexts/MachinesContext";
import { lancerEtudeMarche, etudeRecente } from "../services/etudeMarcheService";
import type { Machine } from "../types/machine";

/**
 * 📊 ÉTUDE DE MARCHÉ GLOBALE — SUPER ADMIN UNIQUEMENT (demandé par Jonathan).
 *
 * Enchaîne l'étude de marché IA sur TOUTES les machines en vente (y compris
 * celles en attente de prix), deux à la fois, avec progression et bilan.
 * Les machines dont l'étude date de moins de 30 jours sont sautées (économie :
 * ~3 centimes et ~30 s par étude) — relancer une machine précise reste
 * possible depuis sa carte. Arrêt propre possible à tout moment.
 */
export default function EtudeMarcheTous({ machines }: { machines: Machine[] }) {
  const { profile } = useAuth();
  const { enregistrerEtudeMarche } = useMachines();
  const [progress, setProgress] = useState<{ fait: number; total: number } | null>(null);
  const stopRef = useRef(false);

  if (profile?.role !== "superadmin") return null;

  const cibles = machines.filter((m) => !m.archived && m.type_nacelle && !etudeRecente(m));
  const recentes = machines.filter((m) => !m.archived && etudeRecente(m)).length;
  if (!cibles.length && !progress) return null;

  const userName = profile ? `${profile.prenom} ${profile.nom}`.trim() : "";

  async function lancerTout() {
    if (progress) return;
    const minutes = Math.ceil((cibles.length * 30) / 2 / 60);
    const cout = (cibles.length * 0.03).toFixed(2);
    const ok = window.confirm(
      `Lancer l'étude de marché IA sur ${cibles.length} machine(s) en vente ?\n\n` +
        `Durée estimée : ~${minutes} min (2 études en parallèle, ~30 s chacune) · coût estimé : ~${cout} €.\n` +
        (recentes ? `${recentes} machine(s) ont déjà une étude de moins de 30 jours et sont sautées.\n` : "") +
        `\nVous pouvez continuer à travailler pendant le traitement ; le bouton permet de l'arrêter.`
    );
    if (!ok) return;

    stopRef.current = false;
    setProgress({ fait: 0, total: cibles.length });
    let reussies = 0;
    const echecs: string[] = [];
    const sansAnnonce: string[] = [];
    let fait = 0;

    // File de travail partagée par 2 « ouvriers » (limite le temps total
    // sans saturer l'API ni dépasser les 60 s par appel).
    const file = [...cibles];
    async function ouvrier() {
      while (file.length && !stopRef.current) {
        const m = file.shift()!;
        try {
          const etude = await lancerEtudeMarche(m, userName);
          enregistrerEtudeMarche(m.id, etude);
          reussies++;
          if (!etude.nb_annonces) sansAnnonce.push(m.immat);
        } catch (e: any) {
          echecs.push(`${m.immat} (${e?.message || e})`);
        }
        fait++;
        setProgress({ fait, total: cibles.length });
      }
    }
    await Promise.all([ouvrier(), ouvrier()]);
    const arretees = file.length;
    setProgress(null);

    alert(
      `📊 Étude de marché globale terminée :\n\n` +
        `• ${reussies} étude(s) réalisée(s)` +
        (sansAnnonce.length ? `\n• ${sansAnnonce.length} sans annonce comparable trouvée : ${sansAnnonce.join(", ")}` : "") +
        (echecs.length ? `\n• ⚠ ${echecs.length} échec(s) : ${echecs.join(", ")}` : "") +
        (arretees ? `\n• ⏹ arrêt demandé : ${arretees} machine(s) non traitée(s)` : "") +
        `\n\nLes fourchettes sont visibles sur les cartes (📊) et dans l'Export Pricing PDG.`
    );
  }

  if (progress) {
    return (
      <button className="btn-import" onClick={() => { stopRef.current = true; }} title="Arrêter après les études en cours">
        ⏳ Étude marché {progress.fait}/{progress.total} — cliquer pour arrêter
      </button>
    );
  }
  return (
    <button
      className="btn-import"
      onClick={lancerTout}
      title="Lance l'étude de marché IA sur toutes les machines en vente sans étude récente (super admin)"
    >
      📊 Étude marché — toutes ({cibles.length})
    </button>
  );
}
