import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { useTranslation } from "react-i18next";

/**
 * Liste déroulante « Commercial » — alimentée par TOUS les comptes
 * enregistrés sur le site (collection users : prénom + nom), pour éviter
 * les fautes de frappe dans les noms (validé avec Jonathan).
 *
 * - L'option « Autre » ouvre un champ libre (commercial pas encore
 *   enregistré sur le site).
 * - Si la valeur déjà enregistrée n'est pas dans la liste, on bascule
 *   automatiquement en saisie libre pour ne rien perdre.
 * - Si la liste est inaccessible (règles, réseau), on retombe sur le
 *   champ libre classique : la configuration n'est jamais bloquée.
 */

// Cache module : une seule lecture Firestore par session
let usersCache: string[] | null = null;
let usersPromise: Promise<string[]> | null = null;

async function fetchNoms(): Promise<string[]> {
  if (usersCache) return usersCache;
  if (!usersPromise) {
    usersPromise = (async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const noms = new Set<string>();
        snap.docs.forEach((d) => {
          const u: any = d.data();
          const nom = `${u.prenom || ""} ${u.nom || ""}`.replace(/\s+/g, " ").trim();
          if (nom) noms.add(nom);
        });
        usersCache = Array.from(noms).sort((a, b) => a.localeCompare(b, "fr"));
        return usersCache;
      } catch (e) {
        console.warn("Liste des comptes inaccessible — saisie libre :", e);
        usersCache = [];
        return usersCache;
      }
    })();
  }
  return usersPromise;
}

interface CommercialSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function CommercialSelect({
  value,
  onChange,
  placeholder,
}: CommercialSelectProps) {
  const { t } = useTranslation();
  const [noms, setNoms] = useState<string[]>(usersCache || []);
  const [loaded, setLoaded] = useState(usersCache !== null);
  const [autre, setAutre] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetchNoms().then((l) => {
      if (mounted) {
        setNoms(l);
        setLoaded(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Une valeur déjà enregistrée qui n'est pas dans la liste (ancienne
  // saisie libre) → on passe en mode « Autre » pour la conserver telle quelle
  useEffect(() => {
    if (loaded && value && noms.length > 0 && !noms.includes(value)) {
      setAutre(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Liste indisponible ou vide : champ libre classique (jamais bloquant)
  if (loaded && noms.length === 0) {
    return (
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <>
      <select
        value={autre ? "__AUTRE__" : value}
        onChange={(e) => {
          if (e.target.value === "__AUTRE__") {
            setAutre(true);
            onChange("");
          } else {
            setAutre(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{loaded ? t("modals.cfgSalesChoose") : "…"}</option>
        {noms.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value="__AUTRE__">✏️ {t("modals.cfgSalesOther")}</option>
      </select>
      {autre && (
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus
          style={{ marginTop: 6 }}
        />
      )}
    </>
  );
}
