// Sélecteur de langue FR / EN.
// - applique immédiatement la langue (i18next) ;
// - mémorise le choix dans localStorage ;
// - persiste dans le profil Firestore de l'utilisateur connecté (users/{uid}.lang).
import { useTranslation } from "react-i18next";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { SUPPORTED_LANGS, LANG_STORAGE_KEY, type AppLang } from "../i18n";

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
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
      style={{ display: "inline-flex", border: "1px solid #C2C8DC", borderRadius: 6, overflow: "hidden" }}
    >
      {SUPPORTED_LANGS.map((code) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => change(code)}
            aria-pressed={active}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.4,
              background: active ? "#1A2A6E" : "transparent",
              color: active ? "#FFFFFF" : "#1A2A6E",
            }}
          >
            {t(`lang.${code}`)}
          </button>
        );
      })}
    </div>
  );
}
