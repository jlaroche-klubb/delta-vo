import { useState } from "react";

/**
 * Modèle de nacelle : liste de l'admin (Paramètres LLD → Modèles) + saisie
 * manuelle pour les offres neuves ou un modèle hors liste (demande Jonathan
 * 06/11/2026). Un modèle tapé à la main reste sélectionné et est proposé tel
 * quel ; la grille tarifaire ne s'applique que s'il existe dans la grille.
 */
interface Props { valeur: string; modeles: string[]; onChange: (m: string) => void; style: React.CSSProperties }
const AUTRE = "__autre__";

export default function ChampModele({ valeur, modeles, onChange, style }: Props) {
  const horsListe = !!valeur && !modeles.includes(valeur);
  const [manuel, setManuel] = useState(horsListe);
  if (manuel) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input style={style} value={valeur} onChange={(e) => onChange(e.target.value)} placeholder="ex. KL 42 ALU, K 38 P…" autoFocus={!valeur} />
        <button type="button" title="Revenir à la liste" onClick={() => { setManuel(false); if (horsListe) onChange(modeles[0] || ""); }} style={{ border: "1px solid #ccd", background: "white", borderRadius: 6, padding: "0 10px", cursor: "pointer", fontSize: 13 }}>☰</button>
      </div>
    );
  }
  return (
    <select style={style} value={horsListe ? AUTRE : valeur} onChange={(e) => { if (e.target.value === AUTRE) { setManuel(true); onChange(""); } else onChange(e.target.value); }}>
      {modeles.map((m) => <option key={m} value={m}>{m}</option>)}
      <option value={AUTRE}>✏️ Autre modèle (saisie manuelle)…</option>
    </select>
  );
}
