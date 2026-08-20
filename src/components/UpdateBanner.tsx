import { useEffect, useState } from "react";

/**
 * 🔄 DÉTECTEUR DE NOUVELLE VERSION (validé avec Jonathan).
 *
 * Un onglet Delta VO laissé ouvert des jours à l'ADV continue de tourner
 * sur l'ancienne version de l'appli. À chaque retour sur l'onglet (et
 * toutes les 30 minutes), on compare le nom du bundle JS servi par le
 * serveur avec celui réellement chargé ; s'ils diffèrent, un bandeau
 * discret propose de recharger. Pas de rechargement forcé ici : une
 * saisie peut être en cours (modales, formulaires).
 */
export default function UpdateBanner() {
  const [majDispo, setMajDispo] = useState(false);

  useEffect(() => {
    let stop = false;
    const scriptActuel = (
      document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src || ""
    )
      .split("/")
      .pop();

    async function verifierVersion() {
      try {
        const html = await fetch("/", { cache: "no-store" }).then((r) => r.text());
        const m = html.match(/assets\/(index-[^"']+\.js)/);
        if (!stop && m && scriptActuel && m[1] !== scriptActuel) setMajDispo(true);
      } catch {
        /* hors-ligne : on réessaiera */
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") verifierVersion();
    };
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(verifierVersion, 30 * 60 * 1000);
    verifierVersion();
    return () => {
      stop = true;
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, []);

  if (!majDispo) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 3000,
        background: "#1a2a6e",
        color: "#fff",
        padding: "10px 16px",
        borderRadius: 8,
        boxShadow: "0 6px 24px rgba(0,0,0,.3)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        fontSize: 13,
      }}
    >
      🔄 Nouvelle version disponible
      <button
        onClick={() => window.location.reload()}
        style={{
          background: "#c8a13a",
          color: "#1a2a6e",
          border: "none",
          padding: "6px 14px",
          borderRadius: 5,
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 13,
        }}
      >
        Recharger
      </button>
    </div>
  );
}
