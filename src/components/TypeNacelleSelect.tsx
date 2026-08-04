import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { dbNacelleExpert } from "../firebase";
import { useTranslation } from "react-i18next";

/**
 * Liste déroulante "Type nacelle" — MÊME liste que Nacelle Expert.
 *
 * La liste est lue dans la configuration de Nacelle Expert
 * (config/types_nacelle, gérée depuis son panneau admin) : les deux
 * applications proposent donc toujours les mêmes types, sans double saisie.
 * L'option AUTRE ouvre un champ libre, comme dans Nacelle Expert.
 * En cas d'indisponibilité, une liste par défaut est utilisée.
 */

// Même liste par défaut que Nacelle Expert (fallback si la config est inaccessible)
const DEFAULT_TYPES_NACELLE = [
  "KL 32", "KL26 TRQ", "KL26 CC", "KL 21B", "KL 38P", "KL 38P TRQ", "KL 42P", "KL 17P",
];

// Cache module : une seule lecture Firestore par session
let typesCache: string[] | null = null;
let typesPromise: Promise<string[]> | null = null;

async function fetchTypesNacelle(): Promise<string[]> {
  if (typesCache) return typesCache;
  if (!typesPromise) {
    typesPromise = (async () => {
      try {
        const snap = await getDoc(doc(dbNacelleExpert, "config", "types_nacelle"));
        const data = snap.exists() ? (snap.data() as any) : null;
        if (Array.isArray(data?.data) && data.data.length > 0) {
          typesCache = data.data as string[];
          return typesCache;
        }
      } catch (e) {
        console.warn("Types nacelle : config Nacelle Expert inaccessible, liste par défaut utilisée", e);
      }
      typesCache = DEFAULT_TYPES_NACELLE;
      return typesCache;
    })();
  }
  return typesPromise;
}

interface TypeNacelleSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export default function TypeNacelleSelect({ value, onChange }: TypeNacelleSelectProps) {
  const { t } = useTranslation();
  const [types, setTypes] = useState<string[]>(typesCache || DEFAULT_TYPES_NACELLE);
  const inList = !!value && types.includes(value);
  const [autre, setAutre] = useState(!!value && !types.includes(value));

  useEffect(() => {
    let mounted = true;
    fetchTypesNacelle().then((list) => { if (mounted) setTypes(list); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (value && types.includes(value)) setAutre(false);
    else if (value && !types.includes(value)) setAutre(true);
  }, [value, types]);

  return (
    <div>
      <select
        value={autre ? "__AUTRE__" : (inList ? value : "")}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__AUTRE__") { setAutre(true); onChange(""); }
          else { setAutre(false); onChange(v); }
        }}
      >
        <option value="">{t("typeNacelle.select")}</option>
        {types.map((tn) => <option key={tn} value={tn}>{tn}</option>)}
        <option value="__AUTRE__">{t("typeNacelle.other")}</option>
      </select>
      {autre && (
        <input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("typeNacelle.otherPlaceholder")}
          style={{ marginTop: 6 }}
          autoFocus
        />
      )}
    </div>
  );
}
