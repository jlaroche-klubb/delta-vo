import { useMemo, useState } from "react";
import type { Machine } from "../types/machine";
import { referenceCommerciale } from "../utils/reference";
import { changerNacelle } from "../services/devisVenteService";

/**
 * 🔁 Changer la nacelle d'une vente signée (admin / super admin) — décision
 * Jonathan 28/10/2026 : prix inchangé (sinon : annuler et refaire un devis),
 * autant de changements que nécessaire, re-signature du client seulement quand
 * la nacelle est définitive (bouton « Envoyer pour re-signature »).
 */
interface Props {
  machine: Machine;
  disponibles: Machine[];
  onClose: () => void;
}

const eur = (n?: number | null) => (n ? n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " € HT" : "—");

export default function ChangerNacelleModal({ machine, disponibles, onClose }: Props) {
  const [q, setQ] = useState("");
  const [choix, setChoix] = useState<Machine | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");

  const liste = useMemo(() => {
    const t = q.trim().toLowerCase();
    return disponibles
      .filter((m) => m.id !== machine.id)
      .filter((m) => !t || [referenceCommerciale(m), m.immat, m.type_nacelle, m.modele_porteur, m.numero_dossier, m.localite].some((v) => String(v || "").toLowerCase().includes(t)))
      .sort((a, b) => (a.type_nacelle === machine.type_nacelle ? -1 : 0) - (b.type_nacelle === machine.type_nacelle ? -1 : 0))
      .slice(0, 40);
  }, [q, disponibles, machine]);

  async function valider() {
    if (!choix || !machine.devis_vente_numero) return;
    setErreur("");
    setEnCours(true);
    try {
      const r = await changerNacelle(machine.devis_vente_numero, machine.id, choix.id);
      alert(`🔁 Nacelle changée : ${r.ancienne} → ${r.nouvelle}.\n\n• ${r.nouvelle} est en préparation (${r.preparateurs}).\n• ${r.ancienne} est revenue en ${r.retour === "disponible" ? "Disponibles" : "Restitutions"}.\n• Prix inchangé. Le devis est « à re-signer » : envoyez-le au client quand la nacelle est définitive.`);
      onClose();
    } catch (e: any) {
      setErreur(e?.message || "Changement impossible");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
      <div style={{ maxWidth: 680, width: "95%", maxHeight: "90vh", background: "white", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🔁 Changer de nacelle — devis {machine.devis_vente_numero}</h2>
          <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
            Vente {machine.acheteur || machine.client_offre} · nacelle actuelle <b>{referenceCommerciale(machine)}</b> ({machine.immat}, {machine.type_nacelle}) · <b>prix inchangé : {eur(machine.montant_offre)}</b>
          </div>
        </div>
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Rechercher la nacelle de remplacement : référence, immat, type, porteur, D0, site…"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, marginBottom: 10 }} />
          {liste.length === 0 && <div style={{ color: "#888" }}>Aucune nacelle disponible ne correspond.</div>}
          {liste.map((m) => (
            <label key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4, border: `2px solid ${choix?.id === m.id ? "#1a73e8" : "#eee"}`, background: choix?.id === m.id ? "#eef4fd" : "white" }}>
              <input type="radio" name="remplacante" checked={choix?.id === m.id} onChange={() => setChoix(m)} style={{ width: "auto", margin: 0 }} />
              <span style={{ fontSize: 13, flex: 1 }}>
                <b>{referenceCommerciale(m)}</b> · {m.immat} · {m.type_nacelle} sur {m.modele_porteur} {m.annee_circulation ? `(${String(m.annee_circulation).match(/(19|20)\d{2}/)?.[0] || m.annee_circulation})` : ""}
                <span style={{ color: "#777" }}> · {m.localite || "site ?"}{m.offre_en_cours ? " · ⚠ devis en cours chez un autre client (il sera annulé)" : ""}</span>
              </span>
              <span style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>catalogue {eur(m.prix_fr)}</span>
            </label>
          ))}
          {erreur && <div style={{ color: "#c0392b", fontWeight: 600, marginTop: 8 }}>⚠ {erreur}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: 14, borderTop: "1px solid #eee", background: "#fafafa", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#666" }}>Le client n'est pas prévenu : il re-signera quand vous enverrez le devis définitif.</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} disabled={enCours} style={{ padding: "9px 14px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>Annuler</button>
            <button onClick={valider} disabled={!choix || enCours} style={{ padding: "9px 14px", borderRadius: 6, border: "none", background: choix ? "#1a73e8" : "#9bbcf0", color: "white", fontWeight: 700, cursor: choix ? "pointer" : "default" }}>
              {enCours ? "⏳ …" : choix ? `🔁 Remplacer par ${referenceCommerciale(choix)}` : "Choisissez une nacelle"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
