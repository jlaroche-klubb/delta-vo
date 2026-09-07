import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 🧰 MENU D'ACTIONS DE BARRE D'OUTILS (refonte esthétique validée avec Jonathan).
 *
 * Regroupe plusieurs boutons (Exports, Imports, Outils…) derrière un seul
 * bouton déroulant pour éviter les barres d'outils à 3 lignes en admin.
 * - Les enfants sont des <button className="action-menu-item"> ; les enfants
 *   `false`/`null` (droits insuffisants) sont ignorés.
 * - Aucun enfant → rien n'est rendu. Un seul enfant → il est affiché
 *   directement comme bouton de barre (pas de menu pour un seul choix).
 * - Le menu se ferme au clic sur un élément, en dehors, ou avec Échap.
 */
export default function ActionMenu({
  label,
  icon,
  children,
  busy = false,
}: {
  label: string;
  icon?: string;
  children: ReactNode;
  /** Affiche ⏳ sur le bouton du menu (un traitement long est en cours) */
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children).filter((c) => isValidElement(c));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  if (items.length === 1) return <div className="action-menu single">{items[0]}</div>;

  return (
    <div className={`action-menu ${open ? "open" : ""}`} ref={ref}>
      <button
        type="button"
        className={`tb-btn ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? "⏳" : icon} {label} <span className="tb-caret">▾</span>
      </button>
      {open && (
        <div
          className="action-menu-panel"
          role="menu"
          onClick={(e) => {
            const btn = (e.target as HTMLElement).closest("button");
            if (btn && !btn.disabled) setOpen(false);
          }}
        >
          {items}
        </div>
      )}
    </div>
  );
}
