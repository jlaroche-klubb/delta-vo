// ============================================================
// 📄 CONTRATS LLD — côté serveur (lot 3)
// ============================================================
// Un contrat = une nacelle. Il naît soit automatiquement d'une offre signée
// (un brouillon par nacelle de l'offre), soit à la main par Jonathan pour un
// client « sous tarif ». Numérotation DS + année + LD + mois + rang
// (DS2026LD-11-01, compteur mensuel config/compteur_contrats_lld).
// Contrôle bloquant avant envoi (validé par Jonathan) : champs obligatoires,
// SIRET 14 chiffres, caution = 1 loyer TTC, cohérence avec l'offre signée,
// neuf / rétrofité, calculs TVA / TTC. Le PDF (25 pages) est généré dans le
// navigateur et rangé ici dans Storage. Lot 4 : lien personnel, page publique
// (fiche locataire, SEPA, CGV, CNI + RIB), PDF rempli et signé. Affectation : lot 5.
// ============================================================

import crypto from "node:crypto";
import admin from "firebase-admin";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { coupe, propre, signerPdf } from "./signatureDevis.js";
import { fetchAvecReessai } from "./auth.js";
import { demanderIA, extraireJSON } from "./ia.js";

const BUCKET = "delta-vo.firebasestorage.app";
const COL = "contrats_lld";
const TVA = 0.2;

const str = (v: any, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: any) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const siretNettoye = (s: any) => String(s || "").replace(/\D/g, "");
const jour = (d: any) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? String(d).slice(0, 10) : "");

function contact(c: any) {
  if (!c || typeof c !== "object") return undefined;
  const o = { nom: str(c.nom, 80), fonction: str(c.fonction, 80), email: str(c.email, 120).toLowerCase(), tel: str(c.tel, 40) };
  return o.nom || o.email || o.tel ? o : undefined;
}

/** Montants recalculés depuis les composantes (loyer + assurance + options) */
export function montantsContrat(c: { loyer_ht: number; assurance: boolean; assurance_ht: number; options: { prix_mensuel_ht: number }[]; caution_mois?: number }) {
  const total = r2(c.loyer_ht + (c.assurance ? c.assurance_ht : 0) + (c.options || []).reduce((s, o) => s + (Number(o.prix_mensuel_ht) || 0), 0));
  const tva = r2(total * TVA);
  const ttc = r2(total + tva);
  return { total_mensuel_ht: total, tva_ht: tva, total_mensuel_ttc: ttc, caution_ttc: r2(ttc * (c.caution_mois || 1)) };
}

/** Nettoyage / validation des champs envoyés par le navigateur (création manuelle ou modification) */
export function contratDepuisCorps(b: any, commercialParDefaut: { nom: string; email: string; tel?: string }) {
  const c = b.client || {};
  const com = b.commercial || {};
  const options = (Array.isArray(b.options) ? b.options : []).slice(0, 20).map((o: any) => ({ libelle: str(o.libelle, 120), prix_mensuel_ht: num(o.prix_mensuel_ht) })).filter((o: any) => o.libelle);
  const base = {
    client_id: str(b.client_id, 60) || null,
    client: {
      raison_sociale: str(c.raison_sociale, 120), siren: str(c.siren, 20), siret: siretNettoye(c.siret).slice(0, 14), adresse: str(c.adresse, 200), cp: str(c.cp, 10), ville: str(c.ville, 80),
      tva_intra: str(c.tva_intra, 20), naf: str(c.naf, 10), telephone: str(c.telephone, 40), fax: str(c.fax, 40), email: str(c.email, 120).toLowerCase(),
      contact_nom: str(c.contact_nom, 80), contact_email: str(c.contact_email, 120).toLowerCase(), contact_tel: str(c.contact_tel, 40),
      facturation_societe: str(c.facturation_societe, 120), facturation_email: str(c.facturation_email, 120).toLowerCase(), facturation_adresse: str(c.facturation_adresse, 200),
      contact_compta: contact(c.contact_compta), contact_maintenance: contact(c.contact_maintenance), commande_obligatoire: c.commande_obligatoire === true, contact_commande: contact(c.contact_commande),
    },
    commercial: { nom: str(com.nom, 80) || commercialParDefaut.nom, email: str(com.email, 120).toLowerCase() || commercialParDefaut.email, tel: str(com.tel, 40) || commercialParDefaut.tel || "" },
    full_services: b.full_services !== false,
    materiel: b.materiel === "neuf" ? "neuf" : "vo",
    modele: str(b.modele, 60),
    immat: str(b.immat, 20).toUpperCase().replace(/\s/g, ""),
    duree_mois: Math.round(num(b.duree_mois)),
    loyer_ht: num(b.loyer_ht),
    assurance: b.assurance === true,
    assurance_ht: b.assurance === true ? num(b.assurance_ht) : 0,
    options,
    km_an: Math.round(num(b.km_an)),
    prix_km_sup: num(b.prix_km_sup),
    transport: { mode: b.transport?.mode === "chiffre" ? "chiffre" : "offert", prix_ht: b.transport?.mode === "chiffre" ? num(b.transport?.prix_ht) : 0, adresse: str(b.transport?.adresse, 200) },
    date_livraison_souhaitee: jour(b.date_livraison_souhaitee),
    jour_prelevement: Math.min(28, Math.max(1, Math.round(num(b.jour_prelevement)) || 20)),
    caution_ttc: num(b.caution_ttc),
  };
  const m = montantsContrat({ ...base, caution_mois: 1 });
  // caution : 1 loyer TTC par défaut ; Jonathan peut saisir autre chose, le contrôle le signalera
  const caution = base.caution_ttc > 0 ? base.caution_ttc : m.caution_ttc;
  return { ...base, total_mensuel_ht: m.total_mensuel_ht, tva_ht: m.tva_ht, total_mensuel_ttc: m.total_mensuel_ttc, caution_ttc: caution };
}

/** Objet « client » du contrat depuis la mémoire client (fiche locataire préremplie) */
export function clientContratDepuisFiche(f: any) {
  return {
    raison_sociale: str(f?.raison_sociale, 120), siren: str(f?.siren, 20), siret: siretNettoye(f?.siret).slice(0, 14), adresse: str(f?.adresse, 200), cp: str(f?.cp, 10), ville: str(f?.ville, 80),
    tva_intra: str(f?.tva_intra, 20), naf: str(f?.naf, 10), telephone: str(f?.telephone, 40), fax: str(f?.fax, 40), email: str(f?.email, 120).toLowerCase(),
    contact_nom: str(f?.signataire?.nom, 80), contact_email: str(f?.signataire?.email, 120).toLowerCase(), contact_tel: str(f?.signataire?.tel, 40),
    facturation_societe: str(f?.facturation_societe, 120), facturation_email: str(f?.facturation_email, 120).toLowerCase(), facturation_adresse: str(f?.facturation_adresse, 200),
    contact_compta: contact(f?.contact_compta), contact_maintenance: contact(f?.contact_maintenance), commande_obligatoire: f?.commande_obligatoire === true, contact_commande: contact(f?.contact_commande),
  };
}

async function numeroSuivant(db: admin.firestore.Firestore, tx: admin.firestore.Transaction, now: Date): Promise<string> {
  const compteur = db.collection("config").doc("compteur_contrats_lld");
  const mois = now.toISOString().slice(0, 7);
  const snap = await tx.get(compteur);
  const d: any = snap.exists ? snap.data() || {} : {};
  const suivant = d.mois === mois ? (Number(d.dernier) || 0) + 1 : 1;
  tx.set(compteur, { mois, dernier: suivant, maj: now.toISOString() });
  return `DS${mois.slice(0, 4)}LD-${mois.slice(5, 7)}-${String(suivant).padStart(2, "0")}`;
}

function cgVersion(cfg: any): string {
  return str(cfg?.textes_contrat?.cg_version, 20) || "2026-08";
}

/** 🔁 Offre signée → un contrat en brouillon par nacelle (client, durée et options choisies, loyer, assurance, km, caution, formule, commercial) */
export async function creerContratsDepuisOffre(app: admin.app.App, o: any): Promise<string[]> {
  const db = admin.firestore(app);
  const nb = Math.min(50, Math.max(1, Number(o.quantite) || 1));
  const choix = o.choix || {};
  const fiche: any = o.client_id ? (await db.collection("clients_lld").doc(String(o.client_id)).get()).data() : null;
  const cfg: any = (await db.collection("config").doc("lld").get()).data() || {};
  // Fiche en mémoire, complétée par ce que le client a saisi à la signature de l'offre (les valeurs vides n'écrasent rien)
  const saisi: any = Object.fromEntries(Object.entries(o.client || {}).filter(([, v]) => v !== "" && v !== null && v !== undefined));
  const client = clientContratDepuisFiche({ ...(fiche || {}), ...saisi, signataire: saisi.signataire || fiche?.signataire || { nom: o.signature?.nom, email: o.signature?.email || o.client?.contact_email, tel: o.client?.contact_tel } });
  if (!client.contact_nom) { client.contact_nom = str(o.signature?.nom, 80); client.contact_email = client.contact_email || str(o.signature?.email, 120).toLowerCase(); }
  const duree = (o.durees || []).find((d: any) => d.mois === choix.duree_mois) || {};
  const assurance = !!choix.avec_assurance;
  const loyer = assurance ? Number(duree.loyer_ht) || 0 : Number(choix.loyer_ht ?? duree.loyer_ht) || 0;
  const assuranceHt = assurance && duree.loyer_assurance_ht ? r2(duree.loyer_assurance_ht - duree.loyer_ht) : 0;
  const base = {
    client_id: o.client_id || null, client, commercial: o.commercial || { nom: "", email: "" },
    offre_numero: o.numero, full_services: o.full_services !== false, materiel: o.materiel === "neuf" ? "neuf" : "vo", modele: str(o.modele, 60), immat: "",
    duree_mois: Number(choix.duree_mois) || 0, loyer_ht: loyer, assurance, assurance_ht: assuranceHt, options: choix.options || [],
    km_an: Number(o.km_an) || 0, prix_km_sup: Number(o.prix_km_sup) || 0, transport: o.transport || { mode: "offert" }, date_livraison_souhaitee: "",
    jour_prelevement: Number(cfg?.sepa?.jour_prelevement) || 20, cg_version: cgVersion(cfg),
  };
  const m = montantsContrat({ ...base, caution_mois: o.caution_mois || 1 });
  const now = new Date();
  const numeros: string[] = [];
  for (let i = 1; i <= nb; i++) {
    const n = await db.runTransaction(async (tx) => {
      const numero = await numeroSuivant(db, tx, now);
      tx.set(db.collection(COL).doc(numero), {
        ...base, ...m, numero, statut: "brouillon", rang: i, rang_total: nb, date: now.toISOString(),
        cree_par: "Delta VO (offre signée)", cree_le: now.toISOString(), modifie_le: now.toISOString(),
        historique: [{ date: now.toISOString(), action: `brouillon créé depuis l'offre ${o.numero} signée (nacelle ${i}/${nb})`, par: "Delta VO" }],
      });
      return numero;
    });
    numeros.push(n);
  }
  await db.collection("offres_lld").doc(String(o.numero)).update({ contrats: numeros }).catch(() => undefined);
  return numeros;
}

/** Création manuelle (client sous tarif) par Jonathan */
export async function creerContratManuel(app: admin.app.App, donnees: any, par: string): Promise<{ numero: string }> {
  const db = admin.firestore(app);
  const cfg: any = (await db.collection("config").doc("lld").get()).data() || {};
  const now = new Date();
  const numero = await db.runTransaction(async (tx) => {
    const n = await numeroSuivant(db, tx, now);
    tx.set(db.collection(COL).doc(n), {
      ...donnees, numero: n, statut: "brouillon", date: now.toISOString(), cg_version: cgVersion(cfg),
      cree_par: par, cree_le: now.toISOString(), modifie_le: now.toISOString(),
      historique: [{ date: now.toISOString(), action: "création manuelle (client sous tarif)", par }],
    });
    return n;
  });
  return { numero };
}

export async function modifierContrat(app: admin.app.App, numero: string, donnees: any, par: string): Promise<void> {
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const c: any = (await ref.get()).data();
  if (!c) throw new Error(`Contrat ${numero} introuvable`);
  if (!["brouillon", "controle"].includes(c.statut)) throw new Error(`Contrat ${numero} : statut « ${c.statut} », il ne peut plus être modifié`);
  const now = new Date().toISOString();
  // l'offre d'origine, le rang et la version des CG ne changent pas
  const { offre_numero: _o, rang: _r, rang_total: _rt, cg_version: _v, ...reste } = donnees;
  await ref.update({ ...reste, statut: "brouillon", controle: admin.firestore.FieldValue.delete(), pdf_url: admin.firestore.FieldValue.delete(), modifie_le: now,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: "modifié (contrôle et PDF à refaire)", par }) });
}

/** 🔒 Contrôle bloquant (CDC) — renvoie erreurs (bloquantes) et avertissements */
export async function controlerContrat(app: admin.app.App, numero: string, par: string): Promise<{ ok: boolean; erreurs: string[]; avertissements: string[] }> {
  const db = admin.firestore(app);
  const ref = db.collection(COL).doc(numero);
  const c: any = (await ref.get()).data();
  if (!c) throw new Error(`Contrat ${numero} introuvable`);
  const erreurs: string[] = [];
  const avert: string[] = [];
  const cl = c.client || {};
  // 1) champs obligatoires
  if (!str(cl.raison_sociale)) erreurs.push("Client : raison sociale manquante");
  if (!str(cl.adresse) || !str(cl.cp) || !str(cl.ville)) erreurs.push("Client : adresse incomplète");
  if (!str(c.modele)) erreurs.push("Modèle de nacelle manquant");
  if (!(Number(c.duree_mois) > 0)) erreurs.push("Durée d'engagement manquante");
  if (!(Number(c.loyer_ht) > 0)) erreurs.push("Loyer HT manquant");
  if (!(Number(c.caution_ttc) > 0)) erreurs.push("Caution manquante");
  if (!(Number(c.km_an) > 0)) avert.push("Kilométrage annuel non renseigné (contrat : 30 000 km/an par défaut)");
  if (!c.date_livraison_souhaitee) avert.push("Date de livraison souhaitée non renseignée");
  // 2) SIRET à 14 chiffres (un SIREN de 9 chiffres est refusé)
  const siret = siretNettoye(cl.siret);
  if (siret.length !== 14) erreurs.push(siret.length === 9 ? "SIRET : 9 chiffres saisis (c'est un SIREN), 14 attendus" : "SIRET à 14 chiffres manquant");
  else if (str(cl.siren) && siret.slice(0, 9) !== siretNettoye(cl.siren)) erreurs.push("SIRET et SIREN ne correspondent pas");
  // 3) neuf / rétrofité
  if (c.materiel !== "neuf" && c.materiel !== "vo") erreurs.push("Neuf ou rétrofité non coché");
  // 4) calculs TVA / TTC
  const m = montantsContrat({ ...c, caution_mois: 1 });
  if (Math.abs(m.total_mensuel_ht - Number(c.total_mensuel_ht)) > 0.01 || Math.abs(m.total_mensuel_ttc - Number(c.total_mensuel_ttc)) > 0.01) erreurs.push(`Calculs : total mensuel attendu ${m.total_mensuel_ht} € HT / ${m.total_mensuel_ttc} € TTC`);
  // 5) caution = 1 loyer TTC (cohérente avec le loyer affiché)
  if (Number(c.caution_ttc) > 0 && Math.abs(Number(c.caution_ttc) - m.total_mensuel_ttc) > 1) erreurs.push(`Caution ${Number(c.caution_ttc).toFixed(2)} € TTC ≠ 1 loyer TTC (${m.total_mensuel_ttc.toFixed(2)} €)`);
  // 6) cohérence avec l'offre signée (ou les tarifs négociés du client)
  if (c.offre_numero) {
    const o: any = (await db.collection("offres_lld").doc(String(c.offre_numero)).get()).data();
    if (!o) avert.push(`Offre ${c.offre_numero} introuvable`);
    else if (o.statut !== "signee") erreurs.push(`L'offre ${c.offre_numero} n'est pas signée (statut ${o.statut})`);
    else {
      const ch = o.choix || {};
      if (Number(ch.duree_mois) !== Number(c.duree_mois)) erreurs.push(`Durée ${c.duree_mois} mois ≠ offre signée (${ch.duree_mois} mois)`);
      if (Math.abs(Number(ch.total_mensuel_ht) - m.total_mensuel_ht) > 0.01) erreurs.push(`Loyer mensuel ${m.total_mensuel_ht} € HT ≠ offre signée (${ch.total_mensuel_ht} € HT)`);
      if (!!ch.avec_assurance !== !!c.assurance) erreurs.push(`Assurance ${c.assurance ? "oui" : "non"} ≠ offre signée (${ch.avec_assurance ? "oui" : "non"})`);
      const oo = (ch.options || []).map((x: any) => x.libelle).sort().join("|"), co = (c.options || []).map((x: any) => x.libelle).sort().join("|");
      if (oo !== co) avert.push(`Options différentes de l'offre signée (offre : ${oo.replace(/\|/g, ", ") || "aucune"})`);
      if (String(o.modele).toLowerCase() !== String(c.modele).toLowerCase()) erreurs.push(`Modèle ${c.modele} ≠ offre signée (${o.modele})`);
      if ((o.full_services !== false) !== (c.full_services !== false)) erreurs.push("Formule (Full services / sans entretien) ≠ offre signée");
    }
  } else if (c.client_id) {
    const f: any = (await db.collection("clients_lld").doc(String(c.client_id)).get()).data();
    const t = (f?.tarifs_negocies || []).find((x: any) => String(x.modele).toLowerCase() === String(c.modele).toLowerCase() && Number(x.duree_mois) === Number(c.duree_mois) && (x.full_services !== false) === (c.full_services !== false));
    if (!f?.sous_tarif) avert.push("Contrat sans offre pour un client qui n'est pas « sous tarif »");
    if (!t) avert.push(`Aucun tarif négocié ${c.modele} × ${c.duree_mois} mois dans la fiche client`);
    else if (Math.abs(Number(t.loyer_ht) - Number(c.loyer_ht)) > 0.01) erreurs.push(`Loyer ${c.loyer_ht} € HT ≠ tarif négocié du client (${t.loyer_ht} € HT)`);
  } else avert.push("Contrat sans offre et sans fiche client");
  // 7) immat (facultative) : la nacelle doit exister et être disponible
  if (c.immat) {
    const mref: any = (await db.collection("machines_vo").doc(String(c.immat)).get()).data();
    if (!mref) erreurs.push(`Nacelle ${c.immat} introuvable dans Delta VO`);
    else if (mref.archived) erreurs.push(`Nacelle ${c.immat} archivée`);
    else if (mref.statut !== "disponible") avert.push(`Nacelle ${c.immat} n'est pas en Disponibles (${mref.statut})`);
  }
  const ok = erreurs.length === 0;
  const now = new Date().toISOString();
  await ref.update({ controle: { ok, erreurs, avertissements: avert, le: now, par }, statut: ok ? "controle" : "brouillon", modifie_le: now,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: ok ? `contrôle OK${avert.length ? ` (${avert.length} avertissement(s))` : ""}` : `contrôle : ${erreurs.length} erreur(s)`, par }) });
  return { ok, erreurs, avertissements: avert };
}

/** PDF (navigateur) → Storage ; le contrat doit avoir passé le contrôle */
export async function enregistrerPdfContrat(app: admin.app.App, numero: string, pdfBase64: string, zone: any, par: string, champs?: any): Promise<{ pdf_url: string }> {
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const c: any = (await ref.get()).data();
  if (!c) throw new Error(`Contrat ${numero} introuvable`);
  if (!c.controle?.ok || !["controle", "envoye"].includes(c.statut)) throw new Error("Le contrôle doit être validé (tout vert) avant de générer le PDF");
  const pdf = String(pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
  if (!pdf || pdf.length > 20_000_000) throw new Error("PDF manquant ou trop volumineux");
  const bucket = admin.storage(app).bucket(BUCKET);
  const token = crypto.randomUUID();
  const chemin = `contrats_lld/${numero}.pdf`;
  await bucket.file(chemin).save(Buffer.from(pdf, "base64"), { contentType: "application/pdf", metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chemin)}?alt=media&token=${token}`;
  const z = zone || {};
  const zoneOk = [z.page, z.x, z.y, z.w, z.h].every((v: any) => Number.isFinite(Number(v))) ? { page: Number(z.page), x: Number(z.x), y: Number(z.y), w: Number(z.w), h: Number(z.h) } : null;
  const now = new Date().toISOString();
  await ref.update({ pdf_url: url, ...(zoneOk ? { zone_signature: zoneOk } : {}), ...(champs && typeof champs === "object" ? { champs_pdf: champs } : {}), modifie_le: now, historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: "PDF du contrat généré", par }) });
  return { pdf_url: url };
}

export async function annulerContrat(app: admin.app.App, numero: string, motif: string, par: string): Promise<void> {
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const c: any = (await ref.get()).data();
  if (!c) throw new Error(`Contrat ${numero} introuvable`);
  if (["signe", "affecte", "en_preparation", "livre"].includes(c.statut)) throw new Error(`Contrat ${numero} signé : il ne peut pas être annulé ici`);
  const now = new Date().toISOString();
  await ref.update({ statut: "annule", modifie_le: now, historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `annulé${motif ? ` — ${motif}` : ""}`, par }) });
}

// ════════════════════════════════════════════════════════════
// ✍️ LOT 4 — lien personnel, page publique, pièces, signature
// ════════════════════════════════════════════════════════════

const COL_PRIVE = "contrats_lld_prive";
const ALERTE = "jlaroche@klubb.com";
const MM = 72 / 25.4;
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const eur = (n: number) => `${(Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const lienContrat = (hote: string, numero: string, jeton: string) => `https://${hote}/contrat-lld/${encodeURIComponent(numero)}/${jeton}`;

/** IBAN : lettres → chiffres, mod 97 = 1 */
export function ibanValide(iban: string): boolean {
  const s = String(iban || "").replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let reste = 0;
  for (const ch of r) reste = (reste * 10 + Number(ch)) % 97;
  return reste === 1;
}
export const bicValide = (bic: string) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(String(bic || "").replace(/\s/g, "").toUpperCase());
const emailOk = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const telOk = (t: string) => !t || String(t).replace(/\D/g, "").length >= 9;

async function emailBrevo(to: { email: string; name?: string }[], sujet: string, html: string, extra: Record<string, any> = {}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  const dest = to.filter((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email));
  if (!apiKey || !sender || !dest.length) return false;
  const r = await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta Services" }, to: dest, subject: sujet, htmlContent: html, ...extra }),
  }, { timeoutMs: 20_000, essais: 1 }).catch(() => null);
  return !!r?.ok;
}

/** 🔗 Lien personnel de signature (après contrôle OK + PDF) : jeton, RUM, statut « envoyé ». Jonathan envoie le lien lui-même. */
export async function genererLienContrat(app: admin.app.App, numero: string, hote: string, par: string): Promise<{ lien: string }> {
  const db = admin.firestore(app);
  const ref = db.collection(COL).doc(numero);
  const c: any = (await ref.get()).data();
  if (!c) throw new Error(`Contrat ${numero} introuvable`);
  if (!c.controle?.ok || !c.pdf_url) throw new Error("Contrôle validé et PDF généré sont nécessaires avant d'envoyer le lien");
  if (!["controle", "envoye"].includes(c.statut)) throw new Error(`Contrat ${numero} : statut « ${c.statut} »`);
  const jeton = c.signature_jeton && String(c.signature_jeton).length === 32 ? String(c.signature_jeton) : crypto.randomBytes(16).toString("hex");
  const rum = c.rum || `RUM-${numero}`;
  // Nouveau client = pas de fiche en mémoire, ou pas d'IBAN connu → CNI + RIB obligatoires
  let nouveau = true;
  if (c.client_id) {
    const prive: any = (await db.collection("clients_lld_prive").doc(String(c.client_id)).get()).data();
    nouveau = !prive?.iban;
  }
  const now = new Date().toISOString();
  await ref.update({ signature_jeton: jeton, rum, nouveau_client: nouveau, statut: "envoye", envoye_le: c.envoye_le || now, modifie_le: now,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: c.signature_jeton ? "lien de signature régénéré" : "lien de signature créé (à envoyer au client)", par }) });
  return { lien: lienContrat(hote, numero, jeton) };
}

export async function contratParJeton(app: admin.app.App, numero: string, jeton: string): Promise<{ ref?: admin.firestore.DocumentReference; c?: any; erreur?: string }> {
  if (!/^DS\d{4}LD-\d{2}-\d{2,3}$/.test(numero) || !/^[a-f0-9]{32}$/.test(jeton)) return { erreur: "lien_invalide" };
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const snap = await ref.get();
  const c: any = snap.data();
  if (!snap.exists || String(c?.signature_jeton || "").length !== 32 || !crypto.timingSafeEqual(Buffer.from(String(c.signature_jeton)), Buffer.from(jeton))) return { erreur: "lien_invalide" };
  return { ref, c };
}

/** Vue client : contrat, fiche locataire préremplie, SEPA créancier, CG (texte modifié dans l'admin ou vide = texte par défaut côté page) */
export async function contratPublique(app: admin.app.App, c: any) {
  const cfg: any = (await admin.firestore(app).collection("config").doc("lld").get()).data() || {};
  const statut = c.statut === "signe" || ["affecte", "en_preparation", "livre"].includes(c.statut) ? "signe" : c.statut === "annule" ? "annule" : c.statut === "envoye" ? "a_signer" : "indisponible";
  const cl = c.client || {};
  return {
    numero: c.numero, statut, date: c.date, rum: c.rum || "", nouveau_client: c.nouveau_client !== false,
    client: {
      raison_sociale: cl.raison_sociale || "", siret: cl.siret || "", siren: cl.siren || "", adresse: cl.adresse || "", cp: cl.cp || "", ville: cl.ville || "", tva_intra: cl.tva_intra || "", naf: cl.naf || "",
      telephone: cl.telephone || "", fax: cl.fax || "", email: cl.email || "", contact_nom: cl.contact_nom || "", contact_email: cl.contact_email || "", contact_tel: cl.contact_tel || "",
      facturation_societe: cl.facturation_societe || "", facturation_email: cl.facturation_email || "", facturation_adresse: cl.facturation_adresse || "",
      contact_compta: cl.contact_compta || null, contact_maintenance: cl.contact_maintenance || null, commande_obligatoire: cl.commande_obligatoire ?? null, contact_commande: cl.contact_commande || null,
    },
    commercial: { nom: c.commercial?.nom || "", email: c.commercial?.email || "", tel: c.commercial?.tel || "" },
    full_services: c.full_services !== false, materiel: c.materiel, modele: c.modele, immat: c.immat || "", duree_mois: c.duree_mois, loyer_ht: c.loyer_ht, assurance: !!c.assurance, assurance_ht: c.assurance_ht || 0,
    options: c.options || [], total_mensuel_ht: c.total_mensuel_ht, tva_ht: c.tva_ht, total_mensuel_ttc: c.total_mensuel_ttc, caution_ttc: c.caution_ttc, km_an: c.km_an, prix_km_sup: c.prix_km_sup,
    transport: c.transport || { mode: "offert" }, date_livraison_souhaitee: c.date_livraison_souhaitee || "", jour_prelevement: c.jour_prelevement || 20,
    sepa: { creancier: cfg.sepa?.creancier || cfg.societe?.raison_sociale || "DELTA SERVICES", ics: cfg.sepa?.ics || "", adresse_creancier: cfg.sepa?.adresse_creancier || cfg.societe?.adresse || "" },
    cg_version: c.cg_version || cfg.textes_contrat?.cg_version || "", cg_texte: str(cfg.textes_contrat?.cg, 200_000) || null,
    pdf_url: statut === "signe" ? c.pdf_signe_url || c.pdf_url : c.pdf_url, signe_le: c.signe_le || null, signataire: c.signature?.nom || null,
    pieces: { cni: !!c.pieces?.cni, rib: !!c.pieces?.rib },
  };
}

const TYPES_PIECE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

/** 📎 Dépôt d'une pièce (CNI ou RIB) avant signature — Storage privé (pas de jeton de téléchargement) */
export async function deposerPieceContrat(app: admin.app.App, ref: admin.firestore.DocumentReference, c: any, body: any): Promise<{ ok: boolean; status: number; error?: string; banque?: { titulaire: string; iban: string; bic: string } }> {
  if (c.statut !== "envoye") return { ok: false, status: 409, error: "indisponible" };
  const type = body.piece === "cni" ? "cni" : body.piece === "rib" ? "rib" : "";
  if (!type) return { ok: false, status: 400, error: "piece_inconnue" };
  const contentType = str(body.content_type, 60).toLowerCase();
  const ext = TYPES_PIECE[contentType];
  if (!ext) return { ok: false, status: 400, error: "format" };
  const data = Buffer.from(String(body.base64 || "").replace(/^data:[^;]+;base64,/, ""), "base64");
  if (data.length < 1_000 || data.length > 3_500_000) return { ok: false, status: 400, error: "taille" };
  const okMagic = ext === "pdf" ? data.subarray(0, 4).toString() === "%PDF" : ext === "png" ? data.readUInt32BE(0) === 0x89504e47 : data[0] === 0xff && data[1] === 0xd8;
  if (!okMagic) return { ok: false, status: 400, error: "format" };
  const chemin = `contrats_lld/${c.numero}/pieces/${type}.${ext}`;
  await admin.storage(app).bucket(BUCKET).file(chemin).save(data, { contentType, resumable: false });
  const piece = { chemin, nom: str(body.nom, 120) || `${type}.${ext}`, type: contentType, taille: data.length, le: new Date().toISOString() };
  await ref.update({ [`pieces.${type}`]: piece, modifie_le: piece.le });
  // 🤖 RIB : lecture des coordonnées bancaires par l'IA pour préremplir le mandat SEPA (le client vérifie avant de signer ; rien n'est enregistré ici)
  let banque: { titulaire: string; iban: string; bic: string } | undefined;
  if (type === "rib") banque = await lireRibIA(data, contentType).catch(() => undefined);
  return { ok: true, status: 200, banque };
}

/** Extraction titulaire / IBAN / BIC d'un RIB (image ou PDF) — modèle rapide, réponse JSON ; IBAN vérifié (clé 97) */
export async function lireRibIA(data: Buffer, contentType: string): Promise<{ titulaire: string; iban: string; bic: string } | undefined> {
  const partie = contentType === "application/pdf" ? { pdf: { data: data.toString("base64") } } : { image: { mediaType: contentType, data: data.toString("base64") } };
  const r = await demanderIA({
    modele: "rapide", json: true, maxTokens: 400, timeoutMs: 25_000,
    parties: [{ texte: "Ce document est un relevé d'identité bancaire (RIB) français ou européen. Extrais exactement, sans inventer : le nom du titulaire du compte (tel qu'imprimé), l'IBAN complet (lettres et chiffres, sans espaces) et le BIC/SWIFT. Réponds uniquement en JSON : {\"titulaire\": \"\", \"iban\": \"\", \"bic\": \"\"}. Champ vide si illisible." }, partie],
  });
  if (!r.ok) return undefined;
  const j = extraireJSON(r.texte) || {};
  const iban = String(j.iban || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const bic = String(j.bic || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return { titulaire: str(j.titulaire, 120), iban: ibanValide(iban) ? iban : "", bic: bicValide(bic) ? bic : "" };
}

/** 📥 Lecture d'une pièce (Jonathan + assistantes) — renvoyée en base64, jamais d'URL publique */
export async function lirePieceContrat(app: admin.app.App, numero: string, type: string): Promise<{ base64: string; content_type: string; nom: string }> {
  const c: any = (await admin.firestore(app).collection(COL).doc(numero).get()).data();
  const p = c?.pieces?.[type === "cni" ? "cni" : type === "rib" ? "rib" : "contrat"];
  if (!p?.chemin) throw new Error("Pièce introuvable");
  const [data] = await admin.storage(app).bucket(BUCKET).file(p.chemin).download();
  return { base64: data.toString("base64"), content_type: p.type, nom: p.nom };
}

/** Fiche locataire + SEPA saisis par le client : nettoyage et contrôles (règles du cahier des charges) */
function ficheDepuisCorps(b: any, nouveau: boolean): { fiche: any; sepa: any; erreurs: string[] } {
  const f = b.fiche || {};
  const s = b.sepa || {};
  const ct = (c: any) => (c && typeof c === "object" ? { nom: str(c.nom, 80), fonction: str(c.fonction, 80), email: str(c.email, 120).toLowerCase(), tel: str(c.tel, 40) } : { nom: "", fonction: "", email: "", tel: "" });
  const fiche = {
    raison_sociale: str(f.raison_sociale, 120), siret: siretNettoye(f.siret).slice(0, 14), adresse: str(f.adresse, 200), cp: str(f.cp, 10), ville: str(f.ville, 80),
    tva_intra: str(f.tva_intra, 20).toUpperCase().replace(/\s/g, ""), naf: str(f.naf, 10).toUpperCase(), telephone: str(f.telephone, 40), fax: str(f.fax, 40), email: str(f.email, 120).toLowerCase(),
    facturation_societe: str(f.facturation_societe, 120), facturation_email: str(f.facturation_email, 120).toLowerCase(), facturation_adresse: str(f.facturation_adresse, 200),
    contact_compta: ct(f.contact_compta), contact_maintenance: ct(f.contact_maintenance), commande_obligatoire: f.commande_obligatoire === true, contact_commande: ct(f.contact_commande),
  };
  const sepa = { titulaire: str(s.titulaire, 120), adresse_titulaire: str(s.adresse_titulaire, 200), cp: str(s.cp, 10), ville: str(s.ville, 80), iban: str(s.iban, 40).replace(/\s/g, "").toUpperCase(), bic: str(s.bic, 11).replace(/\s/g, "").toUpperCase(), lieu: str(s.lieu, 80) };
  const e: string[] = [];
  if (fiche.raison_sociale.length < 2) e.push("raison sociale");
  if (!fiche.adresse || !fiche.cp || !fiche.ville) e.push("adresse complète");
  if (fiche.siret.length !== 14) e.push("SIRET (14 chiffres)");
  if (!telOk(fiche.telephone) || !fiche.telephone) e.push("téléphone");
  if (!fiche.email || !emailOk(fiche.email)) e.push("email");
  if (!emailOk(fiche.facturation_email)) e.push("email de facturation");
  for (const [lib, c] of [["contact comptabilité", fiche.contact_compta], ["contact maintenance", fiche.contact_maintenance]] as const) {
    if (!c.nom || !c.tel || !c.email) e.push(`${lib} (nom, téléphone, email)`);
    else if (!emailOk(c.email) || !telOk(c.tel)) e.push(`${lib} : email ou téléphone invalide`);
  }
  if (f.commande_obligatoire !== true && f.commande_obligatoire !== false) e.push("n° de commande obligatoire : oui ou non");
  if (fiche.commande_obligatoire && (!fiche.contact_commande.email || !fiche.contact_commande.tel)) e.push("contact pour le n° de commande (email, téléphone)");
  if (!sepa.titulaire) e.push("SEPA : nom du débiteur");
  if (!sepa.adresse_titulaire || !sepa.cp || !sepa.ville) e.push("SEPA : adresse");
  if (!ibanValide(sepa.iban)) e.push("SEPA : IBAN");
  if (!bicValide(sepa.bic)) e.push("SEPA : BIC");
  if (!sepa.lieu) e.push("SEPA : lieu de signature");
  void nouveau;
  return { fiche, sepa, erreurs: e };
}

/** Remplit les pages SEPA / fiche locataire / « fait le » du PDF d'origine avec les données saisies (positions mémorisées à la génération) */
async function remplirPdfContrat(original: Buffer, champs: any, valeurs: Record<string, string | boolean>, signaturePng: Buffer): Promise<Buffer> {
  const doc = await PDFDocument.load(original);
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const img = await doc.embedPng(signaturePng);
  const pages = doc.getPages();
  const bleu = rgb(51 / 255, 98 / 255, 121 / 255);
  for (const [cle, ch] of Object.entries<any>(champs || {})) {
    const v = valeurs[cle];
    if (v === undefined || !ch || !(ch.page >= 1 && ch.page <= pages.length)) continue;
    const page = pages[ch.page - 1];
    const H = page.getHeight();
    const x = ch.x * MM, yBase = H - ch.y * MM;
    if (ch.type === "zone") {
      const w = ch.w * MM, h = (ch.h || 20) * MM;
      page.drawRectangle({ x: x + 0.5 * MM, y: H - (ch.y + (ch.h || 20)) * MM + 0.5 * MM, width: w - 1 * MM, height: h - 1 * MM, color: rgb(1, 1, 1) });
      const ech = Math.min((w - 8 * MM) / img.width, (h - 6 * MM) / img.height);
      page.drawImage(img, { x: x + 4 * MM, y: H - (ch.y + (ch.h || 20)) * MM + 3 * MM, width: img.width * ech, height: img.height * ech });
      continue;
    }
    if (ch.type === "case") {
      page.drawRectangle({ x: x + 0.4 * MM, y: yBase - 2.2 * MM, width: 2.2 * MM, height: 2.2 * MM, color: rgb(1, 1, 1) });
      if (v === true) page.drawText("X", { x: x + 0.55 * MM, y: yBase - 2.05 * MM, size: 8, font: gras, color: bleu });
      continue;
    }
    const texte = String(v ?? "");
    if (ch.type === "cases") {
      const pas = (ch.pas || 4.2) * MM;
      page.drawRectangle({ x: x + 0.3 * MM, y: yBase - 3.2 * MM, width: ch.cases * pas - 0.6 * MM, height: 3.9 * MM, color: rgb(1, 1, 1) });
      [...propre(gras, texte.replace(/\s/g, ""))].slice(0, ch.cases).forEach((car, i) => page.drawText(car, { x: x + i * pas + 1.1 * MM, y: yBase, size: ch.taille || 8, font: gras, color: bleu }));
      continue;
    }
    const n = ch.lignes || 1, inter = 5.5 * MM;
    page.drawRectangle({ x, y: yBase - (n - 1) * inter - 0.5 * MM, width: ch.w * MM, height: (n - 1) * inter + (ch.taille || 9) * 1.1, color: rgb(1, 1, 1) });
    const lignes = texte.split("\n").flatMap((l) => coupe(police, l, ch.taille || 9, ch.w * MM)).slice(0, n);
    lignes.forEach((l, i) => page.drawText(l, { x, y: yBase - i * inter, size: ch.taille || 9, font: police, color: bleu }));
  }
  return Buffer.from(await doc.save());
}

export interface ResultatSignatureContrat { ok: boolean; status: number; error?: string; details?: string[]; contrat?: any }

/** ✍️ Signature du contrat par le client : fiche + SEPA + CGV + pièces + signature → PDF rempli et signé, mémoire client, emails */
export async function signerContrat(app: admin.app.App, ref: admin.firestore.DocumentReference, c: any, body: any, req: any): Promise<ResultatSignatureContrat> {
  const db = admin.firestore(app);
  const vue = await contratPublique(app, c);
  if (vue.statut !== "a_signer") return { ok: false, status: 409, error: vue.statut, contrat: vue };
  const nom = str(body.nom, 80), fonction = str(body.fonction, 80), email = str(body.email, 120).toLowerCase();
  if (nom.length < 3) return { ok: false, status: 400, error: "nom_requis" };
  if (body.accepte_cg !== true) return { ok: false, status: 400, error: "cg_requises" };
  const nouveau = c.nouveau_client !== false;
  const { fiche, sepa, erreurs } = ficheDepuisCorps(body, nouveau);
  if (erreurs.length) return { ok: false, status: 400, error: "fiche_incomplete", details: erreurs };
  if (nouveau && (!c.pieces?.cni || !c.pieces?.rib)) return { ok: false, status: 400, error: "pieces_requises" };
  const png = Buffer.from(String(body.signature || "").replace(/^data:image\/png;base64,/, ""), "base64");
  if (png.length < 300 || png.length > 600_000 || png.readUInt32BE(0) !== 0x89504e47) return { ok: false, status: 400, error: "signature_requise" };

  const [original] = await admin.storage(app).bucket(BUCKET).file(`contrats_lld/${c.numero}.pdf`).download();
  const date = new Date();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const navigateur = str(req.headers["user-agent"], 300);
  const dateFr = date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
  const valeurs: Record<string, string | boolean> = {
    fait_le: dateFr, fait_a: sepa.lieu,
    sepa_nom: sepa.titulaire, sepa_adresse: sepa.adresse_titulaire, sepa_cp_ville: `${sepa.cp}  ${sepa.ville}`, sepa_iban: sepa.iban, sepa_bic: sepa.bic, sepa_lieu_date: `${sepa.lieu}, le ${dateFr}`, sepa_signature: true,
    f_societe: fiche.raison_sociale, f_adresse: `${fiche.adresse}\n${fiche.cp} ${fiche.ville}`, f_siret: fiche.siret.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, "$1 $2 $3 $4"), f_tva: fiche.tva_intra, f_naf: fiche.naf,
    f_tel: fiche.telephone, f_fax: fiche.fax, f_email: fiche.email, f_fact_societe: fiche.facturation_societe, f_fact_email: fiche.facturation_email, f_fact_adresse: fiche.facturation_adresse,
    f_sign_nom: `${nom}${fonction ? ` — ${fonction}` : ""}`, f_sign_tel: str(body.tel, 40), f_sign_email: email,
    f_compta_nom: fiche.contact_compta.nom, f_compta_tel: fiche.contact_compta.tel, f_compta_email: fiche.contact_compta.email,
    f_maint_nom: fiche.contact_maintenance.nom, f_maint_tel: fiche.contact_maintenance.tel, f_maint_email: fiche.contact_maintenance.email,
    f_cmd_oui: fiche.commande_obligatoire, f_cmd_non: !fiche.commande_obligatoire, f_cmd_nom: fiche.contact_commande.nom, f_cmd_email: fiche.contact_commande.email, f_cmd_tel: fiche.contact_commande.tel,
  };
  const rempli = await remplirPdfContrat(original, c.champs_pdf, valeurs, png);
  const cgVersion = c.cg_version || vue.cg_version || "";
  const signe = await signerPdf(rempli, png, c.zone_signature, { nom, fonction, email: email || fiche.email, societe: fiche.raison_sociale, ip, navigateur, date }, c.numero, "fr", "Contrat de location LLD",
    [{ label: "Conditions générales acceptées", value: `Version ${cgVersion} — case « J'ai lu et j'accepte les conditions générales » cochée` }, { label: "Mandat SEPA", value: `${c.rum || ""} — IBAN ****${sepa.iban.slice(-4)}` }, { label: "Loyer", value: `${c.duree_mois} mois — ${eur(c.total_mensuel_ht)} HT / mois — caution ${eur(c.caution_ttc)} TTC` }],
    `Contrat ${c.numero} — ${c.modele}${c.immat ? ` (${c.immat})` : ""} — ${c.duree_mois} mois`);
  const bucket = admin.storage(app).bucket(BUCKET);
  const token = crypto.randomUUID();
  const chemin = `contrats_lld/${c.numero}_signe.pdf`;
  await bucket.file(chemin).save(signe.pdf, { contentType: "application/pdf", metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chemin)}?alt=media&token=${token}`;
  const now = date.toISOString();
  const clientSigne = { ...(c.client || {}), ...fiche, contact_nom: nom, contact_email: email || c.client?.contact_email || "", contact_tel: str(body.tel, 40) || c.client?.contact_tel || "" };
  const deja = await db.runTransaction(async (tx) => {
    const cur: any = (await tx.get(ref)).data();
    if (cur?.statut !== "envoye") return true;
    tx.update(ref, {
      statut: "signe", signe_le: now, pdf_signe_url: url, client: clientSigne,
      signature: { nom, fonction, email, date: now, ip, navigateur, cg_version: cgVersion, empreinte_original: signe.hashOriginal, empreinte_signe: signe.hashSigne },
      "pieces.contrat": { chemin, nom: `Contrat_LLD_${c.numero}_signe.pdf`, type: "application/pdf", taille: signe.pdf.length, le: now },
      historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `signé en ligne par ${nom}${fonction ? ` (${fonction})` : ""}`, par: nom }),
    });
    tx.set(db.collection(COL_PRIVE).doc(c.numero), { titulaire: sepa.titulaire, adresse_titulaire: `${sepa.adresse_titulaire}\n${sepa.cp} ${sepa.ville}`, iban: sepa.iban, bic: sepa.bic, rum: c.rum || `RUM-${c.numero}`, signe_le: now });
    return false;
  });
  if (deja) return { ok: false, status: 409, error: "signe", contrat: await contratPublique(app, { ...c, statut: "signe" }) };

  // 🧠 Mémoire client : banque enregistrée, corrections de la fiche proposées à la relecture (jamais appliquées d'office)
  if (c.client_id) {
    try {
      const refClient = db.collection("clients_lld").doc(String(c.client_id));
      const avant: any = (await refClient.get()).data() || {};
      await db.collection("clients_lld_prive").doc(String(c.client_id)).set({ titulaire: sepa.titulaire, adresse_titulaire: `${sepa.adresse_titulaire}\n${sepa.cp} ${sepa.ville}`, iban: sepa.iban, bic: sepa.bic, rum: c.rum || `RUM-${c.numero}`, modifie_le: now, modifie_par: `signature ${c.numero}` }, { merge: true });
      const modifs: any[] = [];
      const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const cmp = (champ: string, a: any, b: any) => { const sa = str(a, 200), sb = str(b, 200); if (sb && norm(sa) !== norm(sb)) modifs.push({ date: now, contrat: c.numero, champ, avant: sa, apres: sb }); };
      for (const k of ["raison_sociale", "siret", "adresse", "cp", "ville", "tva_intra", "naf", "telephone", "fax", "email", "facturation_societe", "facturation_email", "facturation_adresse"]) cmp(k, avant[k], (fiche as any)[k]);
      for (const k of ["contact_compta", "contact_maintenance", "contact_commande"]) for (const j of ["nom", "tel", "email"]) cmp(`${k}.${j}`, avant[k]?.[j], (fiche as any)[k][j]);
      if (avant.commande_obligatoire !== fiche.commande_obligatoire) modifs.push({ date: now, contrat: c.numero, champ: "commande_obligatoire", avant: String(avant.commande_obligatoire ?? ""), apres: String(fiche.commande_obligatoire) });
      cmp("signataire.nom", avant.signataire?.nom, nom); cmp("signataire.fonction", avant.signataire?.fonction, fonction); cmp("signataire.email", avant.signataire?.email, email); cmp("signataire.tel", avant.signataire?.tel, str(body.tel, 40));
      if (modifs.length) await refClient.update({ modifications_en_attente: admin.firestore.FieldValue.arrayUnion(...modifs) });
    } catch (e: any) { console.error(`⚠ mémoire client ${c.client_id} :`, e?.message || e); }
  }

  // 📧 Jonathan + commercial, puis le client avec le contrat signé (les assistantes et « À affecter » : lot 5)
  const resume = `<p><b>${esc(fiche.raison_sociale)}</b> a signé le contrat <b>${esc(c.numero)}</b> (${esc(c.modele)}${c.immat ? ` ${esc(c.immat)}` : ""}, ${c.duree_mois} mois, ${c.full_services ? "Full services" : "Sans entretien"}).</p>` +
    `<p>Loyer ${esc(eur(c.total_mensuel_ht))} HT / mois · caution ${esc(eur(c.caution_ttc))} TTC · livraison souhaitée : ${esc(c.date_livraison_souhaitee ? String(c.date_livraison_souhaitee).split("-").reverse().join("/") : "rapide")}</p>` +
    `<p>Signé par ${esc(nom)}${fonction ? ` (${esc(fonction)})` : ""} le ${date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}. Mandat SEPA ${esc(c.rum || "")} enregistré${nouveau ? ", CNI et RIB déposés" : ""}.</p>` +
    `<p>📄 <a href="${url}">Contrat signé (PDF)</a> — pièces et données bancaires dans Delta VO → LLD → Contrats.</p>`;
  await emailBrevo([{ email: ALERTE }, ...(c.commercial?.email && c.commercial.email !== ALERTE ? [{ email: c.commercial.email, name: c.commercial.nom }] : [])],
    `✍️ Contrat LLD ${c.numero} signé — ${fiche.raison_sociale}`, `<p>Bonjour,</p>${resume}<p>— Delta VO</p>`);
  const destClient = email || fiche.email;
  if (destClient) {
    await emailBrevo([{ email: destClient, name: nom }], `Contrat de location ${c.numero} signé — Delta Services`,
      `<p>Bonjour${nom ? " " + esc(nom) : ""},</p><p>Nous avons bien reçu votre contrat de location <b>${esc(c.numero)}</b> signé (${esc(c.modele)}, ${c.duree_mois} mois). Vous le trouverez en pièce jointe, avec votre mandat de prélèvement SEPA (référence ${esc(c.rum || "")}). Votre interlocuteur, ${esc(c.commercial?.nom || "")}, vous recontacte pour organiser la mise à disposition.</p><p>Cordialement,<br/>${esc(c.commercial?.nom || "")}<br/>Delta Services</p>`,
      { attachment: [{ name: `Contrat_LLD_${c.numero}_signe.pdf`, content: signe.pdf.toString("base64") }], replyTo: c.commercial?.email ? { email: c.commercial.email, name: c.commercial.nom } : undefined });
  }
  return { ok: true, status: 200, contrat: await contratPublique(app, { ...c, statut: "signe", pdf_signe_url: url, signe_le: now, signature: { nom }, pieces: c.pieces }) };
}
