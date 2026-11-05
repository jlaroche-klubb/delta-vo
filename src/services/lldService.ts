// ============================================================
// 📄 LLD — service Firestore : mémoire client + paramètres
// ============================================================
import {
  collection, deleteField, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  CONFIG_LLD_DEFAUT,
  type ClientLLD, type ClientLLDPrive, type ConfigLLD, type LigneCourteDureeLLD, type LigneGrilleLLD, type MembreAgenceLLD, type OptionLLD, type PrestationLLD,
} from "../types/lld";
import type { EntrepriseFR } from "./rechercheFrance";

const COL_CLIENTS = "clients_lld";
const COL_PRIVE = "clients_lld_prive";

export const sirenNettoye = (s?: string) => String(s || "").replace(/\D/g, "").slice(0, 9);
export const siretNettoye = (s?: string) => String(s || "").replace(/\D/g, "").slice(0, 14);
export const siretValide = (s?: string) => siretNettoye(s).length === 14;

/** Retire les clés `undefined` (Firestore les refuse) */
function propre<T extends Record<string, any>>(o: T): T {
  const r: Record<string, any> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    r[k] = v && typeof v === "object" && !Array.isArray(v) ? propre(v) : v;
  }
  return r as T;
}

// ───────────── Clients ─────────────

/** Écoute temps réel de tous les clients LLD (triés par raison sociale) */
export function ecouterClientsLLD(cb: (clients: ClientLLD[]) => void): () => void {
  const q = query(collection(db, COL_CLIENTS), orderBy("raison_sociale"));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as ClientLLD), id: d.id }))), (e) => {
    console.error("❌ clients LLD :", e);
    cb([]);
  });
}

/** Un client existe-t-il déjà avec ce SIREN ? (doublon → ouvrir la fiche existante) */
export async function clientLLDParSiren(siren: string): Promise<ClientLLD | null> {
  const s = sirenNettoye(siren);
  if (s.length !== 9) return null;
  const snap = await getDocs(collection(db, COL_CLIENTS));
  const d = snap.docs.find((x) => sirenNettoye((x.data() as ClientLLD).siren) === s);
  return d ? { ...(d.data() as ClientLLD), id: d.id } : null;
}

/** Fiche pré-remplie depuis l'annuaire des entreprises (recherche nom / SIREN) */
export function clientDepuisEntreprise(e: EntrepriseFR): Partial<ClientLLD> {
  return propre({
    raison_sociale: e.raison_sociale,
    siren: e.siren,
    siret: e.siret_siege || "",
    forme_juridique: e.forme_juridique || "",
    rcs: e.rcs || "",
    adresse: e.adresse,
    cp: e.cp,
    ville: e.ville,
    naf: e.naf || "",
    tva_intra: e.tva_intra || "",
  });
}

export async function creerClientLLD(data: Partial<ClientLLD>, par: string): Promise<string> {
  const ref = doc(collection(db, COL_CLIENTS));
  const now = new Date().toISOString();
  await setDoc(ref, propre({ ...data, raison_sociale: String(data.raison_sociale || "").trim(), cree_le: now, cree_par: par, modifie_le: now, modifie_par: par, _ts: serverTimestamp() }));
  return ref.id;
}

export async function modifierClientLLD(id: string, data: Partial<ClientLLD>, par: string): Promise<void> {
  const { id: _i, ...reste } = data as any;
  await updateDoc(doc(db, COL_CLIENTS, id), propre({ ...reste, modifie_le: new Date().toISOString(), modifie_par: par }));
}

/** 🔒 Banque : lecture réservée (le composant ne l'appelle que pour Jonathan / assistantes) */
export async function lireBanqueLLD(id: string): Promise<ClientLLDPrive> {
  const snap = await getDoc(doc(db, COL_PRIVE, id));
  return snap.exists() ? (snap.data() as ClientLLDPrive) : {};
}

export async function enregistrerBanqueLLD(id: string, data: ClientLLDPrive, par: string): Promise<void> {
  await setDoc(doc(db, COL_PRIVE, id), propre({ ...data, iban: ibanNettoye(data.iban), modifie_le: new Date().toISOString(), modifie_par: par }), { merge: true });
}

/** Marque une modification proposée par le client comme traitée (lot 4) */
export async function viderModificationsLLD(id: string): Promise<void> {
  await updateDoc(doc(db, COL_CLIENTS, id), { modifications_en_attente: deleteField() });
}

// ───────────── IBAN / BIC ─────────────

export const ibanNettoye = (s?: string) => String(s || "").replace(/\s/g, "").toUpperCase();
export const ibanAffiche = (s?: string) => ibanNettoye(s).replace(/(.{4})/g, "$1 ").trim();

/** Clé IBAN (mod 97) */
export function ibanValide(s?: string): boolean {
  const iban = ibanNettoye(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const re = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const c of re) {
    const v = c >= "A" ? String(c.charCodeAt(0) - 55) : c;
    for (const ch of v) reste = (reste * 10 + Number(ch)) % 97;
  }
  return reste === 1;
}

export const bicValide = (s?: string) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(s || "").replace(/\s/g, "").toUpperCase());

// ───────────── Paramètres (config/lld) ─────────────

export async function chargerConfigLLD(): Promise<ConfigLLD> {
  try {
    const snap = await getDoc(doc(db, "config", "lld"));
    const d = snap.exists() ? (snap.data() as Partial<ConfigLLD>) : {};
    return {
      ...CONFIG_LLD_DEFAUT,
      ...d,
      societe: { ...CONFIG_LLD_DEFAUT.societe, ...(d.societe || {}) },
      fournisseur: { ...CONFIG_LLD_DEFAUT.fournisseur, ...(d.fournisseur || {}) },
      sepa: { ...CONFIG_LLD_DEFAUT.sepa, ...(d.sepa || {}) },
    };
  } catch {
    return { ...CONFIG_LLD_DEFAUT };
  }
}

export async function enregistrerConfigLLD(cfg: ConfigLLD): Promise<void> {
  await setDoc(doc(db, "config", "lld"), propre({ ...cfg, maj: new Date().toISOString() }), { merge: true });
}

/** Loyer HT de la grille pour un modèle et une durée (undefined si absent) */
export function loyerGrille(cfg: ConfigLLD, modele: string, dureeMois: number, neuf = false): LigneGrilleLLD | undefined {
  const m = modele.trim().toLowerCase();
  return cfg.grille.find((g) => g.modele.trim().toLowerCase() === m && g.duree_mois === dureeMois && g.neuf === neuf);
}

// ───────────── Textes « une ligne = un élément » pour l'admin ─────────────
// Format volontairement simple (comme « commercial = assistante » des devis) :
// chaque ligne est découpée sur « ; » ou « | ».

const decoupe = (ligne: string) => ligne.split(/\s*[;|]\s*/).map((x) => x.trim());
const nombre = (s: string) => Number(String(s || "").replace(/\s/g, "").replace(",", ".")) || 0;
const lignes = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

export const grilleVersTexte = (g: LigneGrilleLLD[]) => g.map((l) => `${l.modele} ; ${l.duree_mois} ; ${l.loyer_ht} ; ${l.neuf ? "neuf" : "VO"}${l.assurance_ht ? ` ; ${l.assurance_ht}` : ""}`).join("\n");
export const texteVersGrille = (t: string): LigneGrilleLLD[] => lignes(t).map(decoupe).filter((c) => c.length >= 3).map(([modele, duree, loyer, type, assurance]) => ({
  modele, duree_mois: Math.round(nombre(duree)), loyer_ht: nombre(loyer), neuf: /neuf/i.test(type || ""), ...(nombre(assurance || "") ? { assurance_ht: nombre(assurance) } : {}),
})).filter((l) => l.modele && l.duree_mois > 0 && l.loyer_ht > 0);

export const courteDureeVersTexte = (g: LigneCourteDureeLLD[]) => g.map((l) => `${l.modele} ; ${l.mois} ; ${l.loyer_ht}`).join("\n");
export const texteVersCourteDuree = (t: string): LigneCourteDureeLLD[] => lignes(t).map(decoupe).filter((c) => c.length >= 3).map(([modele, mois, loyer]) => ({ modele, mois: Math.min(11, Math.max(1, Math.round(nombre(mois)))), loyer_ht: nombre(loyer) })).filter((l) => l.modele && l.loyer_ht > 0);

export const optionsVersTexte = (o: OptionLLD[]) => o.map((x) => `${x.libelle} ; ${x.prix_mensuel_ht}`).join("\n");
export const texteVersOptions = (t: string): OptionLLD[] => lignes(t).map(decoupe).map(([libelle, prix]) => ({ libelle, prix_mensuel_ht: nombre(prix || "") })).filter((o) => o.libelle);

export const prestationsVersTexte = (p: PrestationLLD[]) => p.map((x) => `${x.libelle} ; ${x.inclus ? "oui" : "non"}`).join("\n");
export const texteVersPrestations = (t: string): PrestationLLD[] => lignes(t).map(decoupe).map(([libelle, inclus]) => ({ libelle, inclus: /^(oui|o|yes|✓|inclus|1)$/i.test(inclus || "oui") })).filter((p) => p.libelle);

export const agenceVersTexte = (a: MembreAgenceLLD[]) => a.map((m) => [m.nom, m.fonction || "", m.email || "", m.tel || ""].join(" ; ")).join("\n");
export const texteVersAgence = (t: string): MembreAgenceLLD[] => lignes(t).map(decoupe).map(([nom, fonction, email, tel]) => ({ nom, fonction, email, tel })).filter((m) => m.nom);

export const modelesVersTexte = (m: string[]) => m.join("\n");
export const texteVersModeles = (t: string) => [...new Set(lignes(t))];
