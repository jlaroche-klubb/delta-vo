import { useState } from "react";
import { useAuth } from "../AuthContext";
import { useMachines } from "../contexts/MachinesContext";
import type { Machine } from "../types/machine";

/**
 * 🚚 COMMANDE MANUELLE « hors vente » (demandée par Jonathan).
 *
 * Super admin uniquement. Retire une machine de toutes les pages de vente
 * (Disponibles, Export Pricing) ou l'y remet — sans passer par le fichier
 * VOG ni toucher au circuit Restitutions (facture/règlement restent
 * strictement manuels). Le marqueur hors_vente_manuel est prioritaire et
 * n'est jamais modifié par les imports.
 */
export default function HorsVenteToggle({ machine }: { machine: Machine }) {
  const { profile } = useAuth();
  const { setHorsVenteManuel } = useMachines();
  const [busy, setBusy] = useState(false);

  if (profile?.role !== "superadmin") return null;

  const par = profile ? `${profile.prenom} ${profile.nom}`.trim() : "";
  const manuel = machine.hors_vente_manuel === true;
  // Hors vente d'après le fichier VOG (info affichée, pas modifiable ici)
  const dispoVog = (machine.disponibilite_vog || "").trim();
  const horsVog = dispoVog !== "" && !/^ok$/i.test(dispoVog);

  async function toggle() {
    if (busy) return;
    const question = manuel
      ? `Remettre ${machine.immat} EN VENTE (visible dans Disponibles et le pricing) ?`
      : `Retirer ${machine.immat} de la vente ?\n\nElle disparaîtra de Disponibles et de l'Export Pricing PDG. Sa fiche Restitution (facture/règlement) n'est pas touchée.`;
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      await setHorsVenteManuel(machine.id, !manuel, par);
    } catch (e: any) {
      alert("Erreur : " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        style={{
          border: "1px solid " + (manuel ? "#2e7d4f" : "#b3541e"),
          background: "#fff",
          color: manuel ? "#2e7d4f" : "#b3541e",
          padding: "3px 10px",
          borderRadius: 4,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        {busy ? "…" : manuel ? "↩ Remettre en vente" : "🚚 Retirer de la vente"}
      </button>
      {horsVog && !manuel && (
        <span style={{ fontSize: 11, color: "#b3541e" }}>VOG : {dispoVog}</span>
      )}
    </div>
  );
}
