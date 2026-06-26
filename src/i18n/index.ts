// Configuration i18n (react-i18next).
// Langue par défaut : français. Langues supportées : fr, en.
// La langue choisie est mémorisée dans localStorage (instantané) et, pour les
// utilisateurs connectés, dans leur profil Firestore (cf. LanguageSwitcher).
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fr from "./locales/fr";
import en from "./locales/en";

export const SUPPORTED_LANGS = ["fr", "en"] as const;
export type AppLang = (typeof SUPPORTED_LANGS)[number];
export const LANG_STORAGE_KEY = "delta_lang";

function initialLang(): AppLang {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    /* localStorage indisponible : on retombe sur le défaut */
  }
  return "fr";
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: initialLang(),
  fallbackLng: "fr",
  supportedLngs: SUPPORTED_LANGS as unknown as string[],
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
