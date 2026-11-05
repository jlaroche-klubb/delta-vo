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
// navigateur et rangé ici dans Storage. Signature : lot 4. Affectation : lot 5.
// ============================================================

import crypto from "node:crypto";
import admin from "firebase-admin";

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
  const client = fiche ? clientContratDepuisFiche(fiche) : clientContratDepuisFiche({ ...o.client, signataire: { nom: o.signature?.nom, email: o.signature?.email || o.client?.contact_email, tel: o.client?.contact_tel } });
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
export async function enregistrerPdfContrat(app: admin.app.App, numero: string, pdfBase64: string, zone: any, par: string): Promise<{ pdf_url: string }> {
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
  await ref.update({ pdf_url: url, ...(zoneOk ? { zone_signature: zoneOk } : {}), modifie_le: now, historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: "PDF du contrat généré", par }) });
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
