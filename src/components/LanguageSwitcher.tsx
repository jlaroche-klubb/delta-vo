// Sélecteur de langue FR / EN (segmented control).
// - "piste" translucide bien visible sur la barre bleue ;
// - langue active = pastille BLANCHE (texte marine), comme l'onglet actif ;
// - langue inactive = texte blanc atténué, cliquable.
// Applique la langue (i18next), la mémorise dans localStorage et la persiste
// dans le profil Firestore de l'utilisateur connecté (users/{uid}.lang).
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { SUPPORTED_LANGS, LANG_STORAGE_KEY, type AppLang } from "../i18n";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const [hovered, setHovered] = useState<AppLang | null>(null);
  const current = ((i18n.resolvedLanguage || i18n.language || "fr").slice(0, 2)) as AppLang;

  const change = async (code: AppLang) => {
    if (code === current) return;
    await i18n.changeLanguage(code);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), { lang: code });
      } catch (e) {
        console.error("Sauvegarde de la langue échouée:", e);
      }
    }
  };

  return (
    <div
      role="group"
      aria-label="Language"
      title="Langue / Language"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        background: "rgba(255, 255, 255, 0.16)",
        border: "1px solid rgba(255, 255, 255, 0.3)",
        borderRadius: 999,
        lineHeight: 1,
      }}
    >
      {SUPPORTED_LANGS.map((code) => {
        const active = current === code;
        const isHover = hovered === code && !active;
        return (
          <button
            key={code}
            type="button"
            onClick={() => change(code)}
            onMouseEnter={() => setHovered(code)}
            onMouseLeave={() => setHovered(null)}
            aria-pressed={active}
            style={{
              border: "none",
              cursor: active ? "default" : "pointer",
              padding: "3px 12px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.5,
              borderRadius: 999,
              transition: "background 0.15s, color 0.15s",
              background: active ? "#ffffff" : isHover ? "rgba(255,255,255,0.18)" : "transparent",
              color: active ? "#1A2A6E" : "rgba(255, 255, 255, 0.9)",
              boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.25)" : "none",
            }}
          >
            {t(`lang.${code}`)}
          </button>
        );
      })}
    </div>
  );
}
