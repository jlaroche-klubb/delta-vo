import { useEffect, useRef, useState } from "react";

/**
 * Champ texte avec liste de suggestions (saisie semi-automatique).
 * `chercher` est appelé ~350 ms après la dernière frappe ; un clic (ou Entrée)
 * sur une suggestion appelle `onChoix`. Désactivé si `actif` est faux.
 */
interface Props<T> {
  value: string;
  onChange: (v: string) => void;
  chercher: (q: string) => Promise<T[]>;
  rendu: (s: T) => React.ReactNode;
  onChoix: (s: T) => void;
  actif?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
  autoFocus?: boolean;
  invalide?: boolean;
}

export default function ChampSuggestions<T>({ value, onChange, chercher, rendu, onChoix, actif = true, style, placeholder, autoFocus, invalide }: Props<T>) {
  const [liste, setListe] = useState<T[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [charge, setCharge] = useState(false);
  const [sel, setSel] = useState(-1);
  const frappe = useRef(false); // ne chercher qu'après une saisie (pas après un choix)
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actif || !frappe.current) return;
    const t = setTimeout(async () => {
      setCharge(true);
      const r = await chercher(value);
      setCharge(false);
      setListe(r);
      setSel(-1);
      setOuvert(r.length > 0);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, actif]);

  useEffect(() => {
    const fermer = (e: MouseEvent) => { if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, []);

  const choisir = (s: T) => { frappe.current = false; setOuvert(false); onChoix(s); };

  return (
    <div ref={boite} style={{ position: "relative" }}>
      <input
        style={{ ...style, ...(invalide ? { border: "1px solid #c0392b", background: "#fff6f5" } : {}) }}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => { frappe.current = true; onChange(e.target.value); }}
        onFocus={() => liste.length && setOuvert(true)}
        onKeyDown={(e) => {
          if (!ouvert || !liste.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, liste.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); choisir(liste[sel]); }
          else if (e.key === "Escape") setOuvert(false);
        }}
      />
      {charge && <span style={{ position: "absolute", right: 10, top: 9, fontSize: 12, color: "#999" }}>…</span>}
      {ouvert && (
        <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%", marginTop: 2, background: "white", border: "1px solid #ccd", borderRadius: 6, boxShadow: "0 6px 18px rgba(0,0,0,0.15)", maxHeight: 260, overflowY: "auto" }}>
          {liste.map((s, i) => (
            <div key={i} onMouseDown={(e) => { e.preventDefault(); choisir(s); }} onMouseEnter={() => setSel(i)}
              style={{ padding: "8px 10px", cursor: "pointer", fontSize: 13, background: i === sel ? "#eef4fd" : "white", borderBottom: i < liste.length - 1 ? "1px solid #f2f2f2" : "none" }}>
              {rendu(s)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
