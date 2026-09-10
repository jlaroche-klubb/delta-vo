import type { Machine } from "../types/machine";
import { normalizeTypeNacelle } from "./nacelles";

/**
 * 📐 RÉFÉRENTIEL TECHNIQUE DES NACELLES (fiches techniques KLUBB).
 *
 * Valeurs relevées le 10/09/2026 dans les brochures officielles du Drive
 * KLUBB (dossier « 00. RANGE » → un sous-dossier par modèle, brochures FR).
 * Sert à PRÉ-REMPLIR la fiche commerciale (hauteur / déport) et à l'outil
 * super admin « Mettre à jour les hauteurs ». Les champs de la fiche restent
 * modifiables : une machine peut différer de la brochure (option, châssis).
 *
 * Variantes : quand la brochure donne des valeurs différentes selon le
 * châssis (KL26 pick-up, KL38P électrique), le modèle porteur de la machine
 * sert à choisir ; à défaut, la variante « standard » (fourgon Master).
 */

export interface ReferenceNacelle {
  /** Libellé affiché */
  modele: string;
  hauteur_travail_m: number;
  hauteur_plancher_m?: number;
  deport_m: number;
  charge_kg?: number;
  /** Brochure source (Drive KLUBB) */
  source: string;
  /** Variante châssis décrite par la brochure */
  variante?: string;
  /** true = valeurs reprises d'un modèle voisin, à confirmer */
  assimile?: string;
}

type Variante = ReferenceNacelle & { si?: (porteur: string) => boolean };

const porteurContient = (...mots: string[]) => (p: string) => mots.some((m) => p.includes(m));
const estPickUp = porteurContient("hilux", "d-max", "dmax", "pick", "isuzu", "toyota", "navara", "ranger");
const estElectrique = porteurContient("e-tech", "etech", "électrique", "electrique", "e-expert", "eexpert", "ev ");

/** Clé compacte (même règle que normalizeTypeNacelle) → variantes, la première = standard */
const REF: Record<string, Variante[]> = {
  kl17p: [{ modele: "KL17P", hauteur_travail_m: 17.3, hauteur_plancher_m: 15.3, deport_m: 10.5, charge_kg: 250, source: "FR_KL17P.pdf", variante: "Fourgon Renault Master L2H2" }],
  k20: [{ modele: "K20", hauteur_travail_m: 10.2, hauteur_plancher_m: 8.5, deport_m: 4.8, charge_kg: 120, source: "FR_K20L_E-expert_tronqué.pdf", variante: "Fourgon tronqué", assimile: "valeurs K20L" }],
  k20l: [{ modele: "K20L", hauteur_travail_m: 10.2, hauteur_plancher_m: 8.5, deport_m: 4.8, charge_kg: 120, source: "FR_K20L_E-expert_tronqué.pdf", variante: "Fourgon tronqué e-Expert" }],
  kl21b: [
    { modele: "KL21B", hauteur_travail_m: 11.4, hauteur_plancher_m: 9.4, deport_m: 6.3, charge_kg: 120, source: "FR_KL21B_Renault Trafic.pdf", variante: "Mini-fourgon Trafic / Expert / Jumpy" },
    { si: estElectrique, modele: "KL21B", hauteur_travail_m: 11.4, hauteur_plancher_m: 9.4, deport_m: 6.5, charge_kg: 120, source: "FR_KL21B_expert.pdf", variante: "Peugeot e-Expert électrique" },
  ],
  kl21: [{ modele: "KL21", hauteur_travail_m: 11.4, hauteur_plancher_m: 9.4, deport_m: 6.3, charge_kg: 120, source: "FR_KL21B_Renault Trafic.pdf", variante: "Mini-fourgon", assimile: "valeurs KL21B (pas de brochure KL21 dans le Drive)" }],
  k21: [{ modele: "K21", hauteur_travail_m: 11.4, hauteur_plancher_m: 9.4, deport_m: 6.3, charge_kg: 120, source: "FR_KL21B_Renault Trafic.pdf", variante: "Mini-fourgon", assimile: "valeurs KL21B (pas de brochure K21 dans le Drive)" }],
  k21b: [{ modele: "K21B", hauteur_travail_m: 11.4, hauteur_plancher_m: 9.4, deport_m: 6.3, charge_kg: 120, source: "FR_KL21B_Renault Trafic.pdf", variante: "Mini-fourgon", assimile: "valeurs KL21B" }],
  kl21n: [{ modele: "KL21N", hauteur_travail_m: 11.4, hauteur_plancher_m: 9.4, deport_m: 6.3, charge_kg: 120, source: "FR_KL21B_Renault Trafic.pdf", variante: "Mini-fourgon", assimile: "valeurs KL21B (pas de brochure KL21N dans le Drive)" }],
  kl26: [
    { modele: "KL26", hauteur_travail_m: 11.8, hauteur_plancher_m: 9.8, deport_m: 6.5, charge_kg: 120, source: "FR_KL26_RENAULT MASTER.pdf", variante: "Renault Master L2H2 (tronqué ou châssis)" },
    { si: estPickUp, modele: "KL26", hauteur_travail_m: 11.3, hauteur_plancher_m: 9.3, deport_m: 5.2, charge_kg: 120, source: "FR_KL26_PICK-UP.pdf", variante: "Pick-up Hilux / D-Max" },
    { si: estElectrique, modele: "KL26", hauteur_travail_m: 11.8, hauteur_plancher_m: 9.8, deport_m: 6.8, charge_kg: 120, source: "FR_KL26_MASTER E-TECH.pdf", variante: "Renault Master E-Tech" },
  ],
  kl32: [
    { modele: "KL32", hauteur_travail_m: 12.5, hauteur_plancher_m: 10.5, deport_m: 7.3, charge_kg: 120, source: "FR_KL32_Renault Master XDD.pdf", variante: "Fourgon Master / Boxer / Jumpy / Daily" },
    { si: estElectrique, modele: "KL32", hauteur_travail_m: 12.5, hauteur_plancher_m: 10.5, deport_m: 7.3, charge_kg: 120, source: "FR_KL32_Master E-tech.pdf", variante: "Renault Master E-Tech" },
  ],
  kl38p: [
    { modele: "KL38P", hauteur_travail_m: 14.0, hauteur_plancher_m: 12.0, deport_m: 8.2, charge_kg: 200, source: "FR_KL38P_MASTER TRONQUÉ.pdf", variante: "Fourgon Master / Daily / Sprinter (tronqué ou non)" },
    { si: estElectrique, modele: "KL38P", hauteur_travail_m: 13.8, hauteur_plancher_m: 11.8, deport_m: 8.2, charge_kg: 200, source: "FR_KL38P_RENAULT MASTER E-TECH.pdf", variante: "Renault Master E-Tech" },
  ],
  kl42p: [{ modele: "KL42P", hauteur_travail_m: 14.8, hauteur_plancher_m: 12.8, deport_m: 8.2, charge_kg: 200, source: "FR_KL42P_RENAULT MASTER.pdf", variante: "Renault Master L2H2" }],
  k42p: [{ modele: "K42P", hauteur_travail_m: 14.8, hauteur_plancher_m: 12.8, deport_m: 8.2, charge_kg: 200, source: "FR_K42P_RENAULT MASTER 4x4.pdf", variante: "Master 4x4 / Iveco cellule" }],
  kat42: [{ modele: "KAT42", hauteur_travail_m: 14.5, hauteur_plancher_m: 12.5, deport_m: 6.25, charge_kg: 200, source: "FR_KAT42_ISUZU.pdf", variante: "Pick-up 4x4 Hilux / D-Max" }],
  kat42l: [{ modele: "KAT42L", hauteur_travail_m: 14.5, hauteur_plancher_m: 12.5, deport_m: 6.25, charge_kg: 200, source: "EN_KAT42L_ISUZU.pdf", variante: "Pick-up 4x4 Hilux / D-Max" }],
  e12: [{ modele: "E12", hauteur_travail_m: 11.2, hauteur_plancher_m: 9.2, deport_m: 5.5, charge_kg: 200, source: "FR_E12.pdf", variante: "Isolée 46 kV" }],
  e13: [{ modele: "E13", hauteur_travail_m: 12.7, hauteur_plancher_m: 10.7, deport_m: 7.5, charge_kg: 200, source: "FR_E13.pdf", variante: "Isolée 46 kV" }],
  e14p: [{ modele: "E14P", hauteur_travail_m: 14.0, hauteur_plancher_m: 12.0, deport_m: 8.2, charge_kg: 200, source: "FR_E14P.pdf", variante: "Isolée 46 kV" }],
  e15p2: [{ modele: "E15P2", hauteur_travail_m: 14.5, hauteur_plancher_m: 12.5, deport_m: 9.1, charge_kg: 240, source: "FR_E15P2.pdf", variante: "Isolée 46 kV" }],
  e17p: [{ modele: "E17P", hauteur_travail_m: 18.5, hauteur_plancher_m: 16.5, deport_m: 12.8, charge_kg: 240, source: "FR_E17P.pdf", variante: "Iveco 4x4 isolée 46 kV" }],
  e18p: [{ modele: "E18P", hauteur_travail_m: 18.5, hauteur_plancher_m: 16.5, deport_m: 12.8, charge_kg: 240, source: "FR_E18P.pdf", variante: "Iveco 4x4 isolée 46 kV" }],
  pt160e: [{ modele: "PT 160 E", hauteur_travail_m: 16.0, hauteur_plancher_m: 14.0, deport_m: 10.5, charge_kg: 300, source: "FR_PT160E IVECO.pdf" }],
  pt160ehh: [{ modele: "PT 160 E H-H", hauteur_travail_m: 16.0, hauteur_plancher_m: 14.0, deport_m: 10.5, charge_kg: 300, source: "FR_PT160E IVECO.pdf" }],
  pt170j: [{ modele: "PT 170J", hauteur_travail_m: 17.0, hauteur_plancher_m: 15.0, deport_m: 12.5, charge_kg: 300, source: "PT170J KLUBB FR.pdf" }],
  pt180e: [{ modele: "PT 180 E", hauteur_travail_m: 18.0, hauteur_plancher_m: 16.0, deport_m: 12.5, charge_kg: 300, source: "FR — PT 180 E H-H.pdf" }],
  pt180ehh: [{ modele: "PT 180 E H-H", hauteur_travail_m: 18.0, hauteur_plancher_m: 16.0, deport_m: 12.5, charge_kg: 300, source: "FR — PT 180 E H-H.pdf" }],
  pt200e: [{ modele: "PT 200E", hauteur_travail_m: 19.8, hauteur_plancher_m: 17.8, deport_m: 13.0, charge_kg: 300, source: "FR_PT200E_IVECO.pdf" }],
  pt200je: [{ modele: "PT 200JE", hauteur_travail_m: 19.8, hauteur_plancher_m: 17.8, deport_m: 12.5, charge_kg: 300, source: "FR_PT200JE_IVECO.pdf" }],
  pt280: [{ modele: "PT 280", hauteur_travail_m: 28.0, hauteur_plancher_m: 26.0, deport_m: 17.5, charge_kg: 250, source: "PT280 KLUBB FR.pdf" }],
  pnt200he: [{ modele: "PNT 200 HE", hauteur_travail_m: 20.0, hauteur_plancher_m: 18.0, deport_m: 8.2, charge_kg: 230, source: "FR_PNT 200HE_IVECO.pdf" }],
  pnt200h: [{ modele: "PNT 200H", hauteur_travail_m: 19.8, hauteur_plancher_m: 17.8, deport_m: 8.5, charge_kg: 225, source: "FR_PNT 200H_IVECO.pdf" }],
  pnt210jd4: [{ modele: "PNT 210 JD4", hauteur_travail_m: 20.5, hauteur_plancher_m: 18.5, deport_m: 10.0, charge_kg: 230, source: "FR_PNT 210 JD4_IVECO.pdf" }],
  pnt215he: [{ modele: "PNT 215 HE", hauteur_travail_m: 21.3, hauteur_plancher_m: 19.3, deport_m: 9.0, charge_kg: 230, source: "FR_PNT 215 HE_IVECO.pdf" }],
  pnt220nlx: [{ modele: "PNT 220 NLX", hauteur_travail_m: 22.0, deport_m: 11.2, charge_kg: 250, source: "FR_PNT 220 NLX_IVECO_LD.pdf" }],
  pnt240: [{ modele: "PNT 240", hauteur_travail_m: 24.0, deport_m: 12.0, charge_kg: 250, source: "FR_PNT 240_IVECO.pdf" }],
  pnt240af: [{ modele: "PNT 240 AF", hauteur_travail_m: 24.0, deport_m: 12.1, charge_kg: 250, source: "FR_PNT 240 AF_IVECO.pdf" }],
  pnt290: [{ modele: "PNT 290", hauteur_travail_m: 29.0, hauteur_plancher_m: 27.0, deport_m: 17.0, charge_kg: 250, source: "FR_PNT 290_IVECO.pdf" }],
  pnt290h: [{ modele: "PNT 290 H", hauteur_travail_m: 29.0, hauteur_plancher_m: 27.0, deport_m: 17.0, charge_kg: 250, source: "FR_PNT 290_IVECO.pdf" }],
  xtenso3: [{ modele: "XTENSO 3", hauteur_travail_m: 18.5, hauteur_plancher_m: 16.5, deport_m: 13.9, charge_kg: 265, source: "FR_XTENSO 3_PLATEAU.pdf" }],
  xtenso4: [{ modele: "XTENSO 4", hauteur_travail_m: 21.0, hauteur_plancher_m: 19.0, deport_m: 16.5, charge_kg: 265, source: "FR_XTENSO 4_PLATEAU.pdf" }],
};

// Alias d'écriture : K26 = KL26, KL26 CC / TRQ = KL26 (tronqué : valeurs
// identiques), KL38P TRQ = KL38P, K32 = KL32, K38P = KL38P…
const ALIAS: Record<string, string> = {
  k26: "kl26",
  kl26cc: "kl26",
  kl26trq: "kl26",
  kl26tronque: "kl26",
  k32: "kl32",
  k38p: "kl38p",
  kl38ptrq: "kl38p",
  kl38ptronque: "kl38p",
  kl42: "kl42p",
  k42: "k42p",
  kl17: "kl17p",
};

function cle(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Fiche technique pour un type de nacelle (et un porteur pour choisir la variante). */
export function referenceNacelle(typeNacelle?: string | null, modelePorteur?: string | null): ReferenceNacelle | null {
  const type = normalizeTypeNacelle(typeNacelle || "");
  if (!type || type === "Sans nacelle") return null;
  const k0 = cle(type);
  const k = ALIAS[k0] || k0;
  const variantes = REF[k];
  if (!variantes?.length) return null;
  const porteur = (modelePorteur || "").toLowerCase();
  const specifique = porteur ? variantes.find((v) => v.si && v.si(porteur)) : undefined;
  const { si: _si, ...ref } = specifique || variantes[0];
  // Ancienne génération « K » (K26, K32, K38P…) : la brochure du Drive est
  // celle du modèle KL correspondant → valeurs à confirmer
  if (k !== k0 && /^k\d/.test(k0)) {
    return { ...ref, modele: type, assimile: ref.assimile || `valeurs ${ref.modele} (brochure commune ${type} / ${ref.modele})` };
  }
  return ref;
}

export function referencePourMachine(m: Machine): ReferenceNacelle | null {
  return referenceNacelle(m.type_nacelle, m.modele_porteur);
}

/** Types connus du référentiel (libellés), pour information */
export function typesReferences(): string[] {
  return Object.values(REF).map((v) => v[0].modele);
}
