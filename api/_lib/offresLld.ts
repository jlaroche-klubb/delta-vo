// ============================================================
// 📄 OFFRES LLD (propositions commerciales) — côté serveur
// ============================================================
// Cahier des charges Jonathan (05/11/2026), lot 2. Les offres sont faites par
// Jonathan seul ; le PDF (9 pages) est généré dans le navigateur, rangé ici
// dans Storage avec un lien de signature personnel que Jonathan envoie
// lui-même. Sur la page publique, le client choisit sa durée (et l'assurance,
// les options), puis signe : PDF signé + certificat, email à Jonathan et au
// commercial local. Aucune nacelle n'est mise en préparation (contrats, lot 3).
// Numérotation : OF-AAAA-MM-NN (compteur mensuel config/compteur_offres_lld).
// ============================================================

import crypto from "node:crypto";
import admin from "firebase-admin";
import { fetchAvecReessai } from "./auth.js";
import { signerPdf } from "./signatureDevis.js";
import { creerContratsDepuisOffre } from "./contratsLld.js";

const BUCKET = "delta-vo.firebasestorage.app";
const COL = "offres_lld";
const ALERTE = "jlaroche@klubb.com";

const str = (v: any, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: any) => { const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
const eur = (n: number) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const jour = (d?: string) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? String(d).slice(0, 10) : "");
export const lienOffre = (hote: string, numero: string, jeton: string) => `https://${hote}/offre-lld/${encodeURIComponent(numero)}/${jeton}`;

async function sauverPdf(app: admin.app.App, chemin: string, contenu: Buffer): Promise<string> {
  const bucket = admin.storage(app).bucket(BUCKET);
  const token = crypto.randomUUID();
  await bucket.file(chemin).save(contenu, { contentType: "application/pdf", metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(chemin)}?alt=media&token=${token}`;
}

async function emailBrevo(to: { email: string; name?: string }[], sujet: string, html: string, extra: Record<string, any> = {}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  const dest = to.filter((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email));
  if (!apiKey || !sender || !dest.length) return false;
  const r = await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Delta Services" }, to: dest, subject: sujet, htmlContent: html, ...extra }),
  }, { timeoutMs: 20_000, essais: 1 }).catch(() => null);
  return !!r?.ok;
}

/** Nettoyage / validation des champs de l'offre envoyés par le navigateur */
export function offreDepuisCorps(b: any, commercialParDefaut: { nom: string; email: string; tel?: string }) {
  const c = b.client || {};
  const durees = (Array.isArray(b.durees) ? b.durees : []).slice(0, 12)
    .map((d: any) => ({ mois: Math.round(num(d.mois)), loyer_ht: num(d.loyer_ht), ...(num(d.loyer_assurance_ht) ? { loyer_assurance_ht: num(d.loyer_assurance_ht) } : {}) }))
    .filter((d: any) => d.mois > 0 && d.loyer_ht > 0);
  const courte = b.courte_duree === true;
  const erreurs: string[] = [];
  if (!str(c.raison_sociale)) erreurs.push("client");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(c.contact_email, 120))) erreurs.push("l'email du client");
  if (!str(b.modele)) erreurs.push("modèle");
  if (!durees.length) erreurs.push("au moins une durée avec un loyer");
  if (courte && durees.some((d: any) => d.mois > 11)) erreurs.push("courte durée : 11 mois maximum");
  const com = b.commercial || {};
  const offre = {
    client_id: str(b.client_id, 60) || null,
    client: {
      raison_sociale: str(c.raison_sociale, 120), siren: str(c.siren, 20), adresse: str(c.adresse, 200), cp: str(c.cp, 10), ville: str(c.ville, 80),
      contact_nom: str(c.contact_nom, 80), contact_email: str(c.contact_email, 120).toLowerCase(), contact_tel: str(c.contact_tel, 40),
    },
    commercial: { nom: str(com.nom, 80) || commercialParDefaut.nom, email: str(com.email, 120).toLowerCase() || commercialParDefaut.email, tel: str(com.tel, 40) || commercialParDefaut.tel || "" },
    materiel: b.materiel === "neuf" ? "neuf" : "vo",
    courte_duree: courte,
    avec_assurance: b.avec_assurance === true,
    full_services: b.full_services !== false,
    modele: str(b.modele, 60),
    quantite: Math.min(50, Math.max(1, Math.round(num(b.quantite) || 1))),
    durees,
    options: (Array.isArray(b.options) ? b.options : []).slice(0, 20).map((o: any) => ({ libelle: str(o.libelle, 120), prix_mensuel_ht: num(o.prix_mensuel_ht) })).filter((o: any) => o.libelle),
    transport: { mode: b.transport?.mode === "chiffre" ? "chiffre" : "offert", prix_ht: b.transport?.mode === "chiffre" ? num(b.transport?.prix_ht) : 0, adresse: str(b.transport?.adresse, 200) },
    km_an: Math.round(num(b.km_an)) || 0,
    heures: str(b.heures, 40) || "illimitées",
    prix_km_sup: num(b.prix_km_sup),
    caution_mois: 1,
    prestations: (Array.isArray(b.prestations) ? b.prestations : []).slice(0, 80).map((p: any) => ({ libelle: str(p.libelle, 160), inclus: p.inclus === true })).filter((p: any) => p.libelle),
    commentaire: str(b.commentaire, 1500),
    validite_jours: Math.min(Math.max(Math.round(num(b.validite_jours)) || 30, 1), 180),
  };
  return { offre, erreurs };
}

/** Création : numéro OF-AAAA-MM-NN (transaction sur le compteur mensuel) */
export async function creerOffre(app: admin.app.App, donnees: any, par: string): Promise<{ numero: string; date: string; date_expiration: string }> {
  const db = admin.firestore(app);
  const now = new Date();
  const mois = now.toISOString().slice(0, 7);
  const expire = new Date(now.getTime() + donnees.validite_jours * 86400000).toISOString().slice(0, 10);
  const compteur = db.collection("config").doc("compteur_offres_lld");
  const numero = await db.runTransaction(async (tx) => {
    const snap = await tx.get(compteur);
    const d: any = snap.exists ? snap.data() || {} : {};
    const suivant = d.mois === mois ? (Number(d.dernier) || 0) + 1 : 1;
    tx.set(compteur, { mois, dernier: suivant, maj: now.toISOString() });
    const n = `OF-${mois}-${String(suivant).padStart(2, "0")}`;
    tx.set(db.collection(COL).doc(n), {
      ...donnees, numero: n, statut: "brouillon", date: now.toISOString(), date_expiration: expire,
      cree_par: par, cree_le: now.toISOString(), modifie_le: now.toISOString(),
      historique: [{ date: now.toISOString(), action: "création", par }],
    });
    return n;
  });
  return { numero, date: now.toISOString(), date_expiration: expire };
}

/** Modification d'une offre pas encore signée (brouillon / générée) : le PDF devra être régénéré */
export async function modifierOffre(app: admin.app.App, numero: string, donnees: any, par: string): Promise<{ date_expiration: string }> {
  const db = admin.firestore(app);
  const ref = db.collection(COL).doc(numero);
  const o: any = (await ref.get()).data();
  if (!o) throw new Error(`Offre ${numero} introuvable`);
  if (!["brouillon", "generee"].includes(o.statut)) throw new Error(`Offre ${numero} : statut « ${o.statut} », elle ne peut plus être modifiée`);
  const now = new Date().toISOString();
  const expire = new Date(Date.parse(o.date) + donnees.validite_jours * 86400000).toISOString().slice(0, 10);
  await ref.update({ ...donnees, date_expiration: expire, statut: "brouillon", pdf_url: admin.firestore.FieldValue.delete(), zone_signature: admin.firestore.FieldValue.delete(), modifie_le: now,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: "modifiée (PDF à régénérer)", par }) });
  return { date_expiration: expire };
}

/** PDF généré dans le navigateur → Storage + jeton + lien de signature (statut « générée ») */
export async function genererLienOffre(app: admin.app.App, numero: string, pdfBase64: string, zone: any, hote: string, par: string): Promise<{ pdf_url: string; lien: string }> {
  const db = admin.firestore(app);
  const ref = db.collection(COL).doc(numero);
  const o: any = (await ref.get()).data();
  if (!o) throw new Error(`Offre ${numero} introuvable`);
  if (!["brouillon", "generee"].includes(o.statut)) throw new Error(`Offre ${numero} : statut « ${o.statut} »`);
  const pdf = String(pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
  if (!pdf || pdf.length > 12_000_000) throw new Error("PDF manquant ou trop volumineux");
  const pdfUrl = await sauverPdf(app, `offres_lld/${numero}.pdf`, Buffer.from(pdf, "base64"));
  const jeton: string = /^[a-f0-9]{32}$/.test(String(o.signature_jeton || "")) ? o.signature_jeton : crypto.randomBytes(16).toString("hex");
  const z = zone || {};
  const zoneOk = [z.page, z.x, z.y, z.w, z.h].every((v: any) => Number.isFinite(Number(v))) ? { page: Number(z.page), x: Number(z.x), y: Number(z.y), w: Number(z.w), h: Number(z.h) } : null;
  const now = new Date().toISOString();
  await ref.update({ pdf_url: pdfUrl, signature_jeton: jeton, ...(zoneOk ? { zone_signature: zoneOk } : {}), statut: "generee", modifie_le: now,
    historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: "PDF généré, lien de signature prêt", par }) });
  return { pdf_url: pdfUrl, lien: lienOffre(hote, numero, jeton) };
}

/** 📧 Envoi du lien de signature au client par email (après génération du PDF) — Jonathan peut aussi copier le lien */
export async function envoyerLienOffre(app: admin.app.App, numero: string, hote: string, par: string): Promise<{ envoye_a: string }> {
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const o: any = (await ref.get()).data();
  if (!o) throw new Error(`Offre ${numero} introuvable`);
  if (o.statut !== "generee" || !o.signature_jeton || !o.pdf_url) throw new Error("Générez d'abord le PDF et le lien");
  const dest = str(o.client?.contact_email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) throw new Error("Email du client manquant sur l'offre");
  const lien = lienOffre(hote, numero, o.signature_jeton);
  const dureesTxt = (o.durees || []).map((d: any) => `${d.mois} mois`).join(" / ");
  const ok = await emailBrevo([{ email: dest, name: o.client?.contact_nom || o.client?.raison_sociale }],
    `Proposition commerciale ${numero} — location longue durée ${esc(o.modele)}`,
    `<p>Bonjour${o.client?.contact_nom ? " " + esc(o.client.contact_nom) : ""},</p>` +
    `<p>Veuillez trouver ci-joint notre proposition commerciale <b>${esc(numero)}</b> pour la location longue durée d'une nacelle <b>${esc(o.modele)}</b>${o.quantite > 1 ? ` (× ${o.quantite})` : ""}, formule ${o.full_services ? "Full services" : "Sans entretien"}${dureesTxt ? ` — durée${(o.durees || []).length > 1 ? "s au choix" : ""} : ${esc(dureesTxt)}` : ""}.</p>` +
    `<p>Pour l'accepter, ouvrez le lien ci-dessous : vous y choisirez votre durée, indiquerez les coordonnées de votre société pour l'établissement du contrat, et signerez en ligne en quelques minutes.</p>` +
    `<p style="margin:18px 0"><a href="${lien}" style="background:#1e8e3e;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Consulter et signer la proposition</a></p>` +
    `<p style="font-size:12px;color:#666">Lien valable jusqu'au ${esc(String(o.date_expiration || "").split("-").reverse().join("/"))}. Si le bouton ne fonctionne pas : ${lien}</p>` +
    `<p>Cordialement,<br/>${esc(o.commercial?.nom || "")}${o.commercial?.tel ? `<br/>${esc(o.commercial.tel)}` : ""}<br/>Delta Services</p>`,
    { attachment: [{ name: `Proposition_LLD_${numero}.pdf`, url: o.pdf_url }], replyTo: o.commercial?.email ? { email: o.commercial.email, name: o.commercial.nom } : undefined });
  if (!ok) throw new Error("L'email n'a pas pu être envoyé (Brevo)");
  const now = new Date().toISOString();
  await ref.update({ envoye_le: now, envoye_a: dest, modifie_le: now, historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `lien de signature envoyé par email à ${dest}`, par }) });
  return { envoye_a: dest };
}

export async function changerStatutOffre(app: admin.app.App, numero: string, statut: "refusee" | "annulee", motif: string, par: string): Promise<void> {
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const o: any = (await ref.get()).data();
  if (!o) throw new Error(`Offre ${numero} introuvable`);
  if (o.statut === "signee") throw new Error("Une offre signée ne peut pas être refusée ou annulée ici");
  const now = new Date().toISOString();
  await ref.update({ statut, modifie_le: now, historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `${statut === "refusee" ? "refusée par le client" : "annulée"}${motif ? ` — ${motif}` : ""}`, par }) });
}

// ───────────── Page publique ─────────────

export async function offreParJeton(app: admin.app.App, numero: string, jeton: string): Promise<{ ref?: admin.firestore.DocumentReference; o?: any; erreur?: string }> {
  if (!/^OF-\d{4}-\d{2}-\d{2,3}$/.test(numero) || !/^[a-f0-9]{32}$/.test(jeton)) return { erreur: "lien_invalide" };
  const ref = admin.firestore(app).collection(COL).doc(numero);
  const snap = await ref.get();
  const o: any = snap.data();
  if (!snap.exists || String(o?.signature_jeton || "").length !== 32 || !crypto.timingSafeEqual(Buffer.from(String(o.signature_jeton)), Buffer.from(jeton))) return { erreur: "lien_invalide" };
  return { ref, o };
}

/** Vue client : rien d'interne (pas d'id client, pas d'historique) */
export function offrePublique(o: any) {
  const expiree = o.date_expiration && o.date_expiration < new Date().toISOString().slice(0, 10);
  const statut = o.statut === "signee" ? "signee" : o.statut === "refusee" || o.statut === "annulee" ? "annulee" : expiree || o.statut === "expiree" ? "expiree" : o.statut === "generee" ? "a_signer" : "annulee";
  return {
    numero: o.numero, statut, date: o.date, date_expiration: o.date_expiration,
    client: { raison_sociale: o.client?.raison_sociale || "", contact_nom: o.client?.contact_nom || "" },
    commercial: { nom: o.commercial?.nom || "", email: o.commercial?.email || "", tel: o.commercial?.tel || "" },
    materiel: o.materiel, courte_duree: !!o.courte_duree, avec_assurance: !!o.avec_assurance, full_services: o.full_services !== false,
    modele: o.modele, quantite: o.quantite || 1, durees: o.durees || [], options: o.options || [], transport: o.transport || { mode: "offert" },
    km_an: o.km_an, heures: o.heures, prix_km_sup: o.prix_km_sup, caution_mois: o.caution_mois || 1,
    pdf_url: statut === "signee" ? o.pdf_signe_url || o.pdf_url : o.pdf_url, choix: o.choix || null, signe_le: o.signe_le || null, signataire: o.signature?.nom || null,
  };
}

/** Fiche société connue (mémoire client) pour préremplir l'étape « coordonnées » de la signature — jamais la banque ni les notes */
export async function ficheOffrePublique(app: admin.app.App, o: any) {
  const f: any = o.client_id ? (await admin.firestore(app).collection("clients_lld").doc(String(o.client_id)).get()).data() || {} : {};
  const c = o.client || {};
  const ct = (x: any) => (x ? { nom: str(x.nom, 80), fonction: str(x.fonction, 80), email: str(x.email, 120), tel: str(x.tel, 40) } : null);
  return {
    raison_sociale: str(f.raison_sociale || c.raison_sociale, 120), siret: str(f.siret, 14), siren: str(f.siren || c.siren, 9), adresse: str(f.adresse || c.adresse, 200), cp: str(f.cp || c.cp, 10), ville: str(f.ville || c.ville, 80),
    tva_intra: str(f.tva_intra, 20), naf: str(f.naf, 10), forme_juridique: str(f.forme_juridique, 80), telephone: str(f.telephone, 40), fax: str(f.fax, 40), email: str(f.email, 120),
    facturation_societe: str(f.facturation_societe, 120), facturation_email: str(f.facturation_email, 120), facturation_adresse: str(f.facturation_adresse, 200),
    contact_compta: ct(f.contact_compta), contact_maintenance: ct(f.contact_maintenance), commande_obligatoire: typeof f.commande_obligatoire === "boolean" ? f.commande_obligatoire : null, contact_commande: ct(f.contact_commande),
    signataire: { nom: str(f.signataire?.nom || c.contact_nom, 80), fonction: str(f.signataire?.fonction, 80), email: str(f.signataire?.email || c.contact_email, 120), tel: str(f.signataire?.tel || c.contact_tel, 40) },
    deja_complete: !!(f.siret && f.adresse && f.telephone && f.email),
  };
}

export interface ResultatSignatureOffre { ok: boolean; status: number; error?: string; details?: string[]; offre?: any }

const emailOk = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const telOk = (t: string) => !t || String(t).replace(/\D/g, "").length >= 9;
function contactDe(c: any) { return c && typeof c === "object" ? { nom: str(c.nom, 80), fonction: str(c.fonction, 80), email: str(c.email, 120).toLowerCase(), tel: str(c.tel, 40) } : { nom: "", fonction: "", email: "", tel: "" }; }
/** Fiche société saisie à la signature de l'offre : obligatoires = raison sociale, SIRET 14, adresse, téléphone, email ; contacts facultatifs (redemandés au contrat) */
export function ficheDepuisCorps(f: any, signataire: { nom: string; fonction: string; email: string; tel: string }) {
  f = f || {};
  const fiche = {
    raison_sociale: str(f.raison_sociale, 120), siret: String(f.siret || "").replace(/\D/g, "").slice(0, 14), siren: "", adresse: str(f.adresse, 200), cp: str(f.cp, 10), ville: str(f.ville, 80),
    tva_intra: str(f.tva_intra, 20).toUpperCase().replace(/\s/g, ""), naf: str(f.naf, 10).toUpperCase(), forme_juridique: str(f.forme_juridique, 80), telephone: str(f.telephone, 40), fax: str(f.fax, 40), email: str(f.email, 120).toLowerCase(),
    facturation_societe: str(f.facturation_societe, 120), facturation_email: str(f.facturation_email, 120).toLowerCase(), facturation_adresse: str(f.facturation_adresse, 200),
    contact_compta: contactDe(f.contact_compta), contact_maintenance: contactDe(f.contact_maintenance), commande_obligatoire: f.commande_obligatoire === true, contact_commande: contactDe(f.contact_commande),
    signataire: { nom: signataire.nom, fonction: signataire.fonction, email: signataire.email, tel: signataire.tel },
  };
  fiche.siren = fiche.siret.slice(0, 9);
  const e: string[] = [];
  if (fiche.raison_sociale.length < 2) e.push("raison sociale");
  if (fiche.siret.length !== 14) e.push("SIRET (14 chiffres)");
  if (!fiche.adresse || !fiche.cp || !fiche.ville) e.push("adresse complète");
  if (!fiche.telephone || !telOk(fiche.telephone)) e.push("téléphone");
  if (!fiche.email || !emailOk(fiche.email)) e.push("email de la société");
  if (!emailOk(fiche.facturation_email)) e.push("email de facturation");
  for (const [lib, c] of [["contact comptabilité", fiche.contact_compta], ["contact maintenance", fiche.contact_maintenance], ["contact n° de commande", fiche.contact_commande]] as const) {
    if (!emailOk(c.email) || !telOk(c.tel)) e.push(`${lib} : email ou téléphone invalide`);
  }
  return { fiche, erreurs: e };
}

/** 🧠 Mémoire client après signature de l'offre : les champs vides sont remplis directement (Jonathan n'avait saisi que le nom), les écarts partent en relecture */
async function alimenterMemoireClient(app: admin.app.App, clientId: string, fiche: any, numero: string, now: string): Promise<void> {
  const db = admin.firestore(app);
  const ref = db.collection("clients_lld").doc(clientId);
  const avant: any = (await ref.get()).data();
  if (!avant) return;
  const direct: Record<string, any> = {};
  const modifs: any[] = [];
  const norm = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const cmp = (champ: string, a: any, b: any) => {
    const sa = str(a, 200), sb = str(b, 200);
    if (!sb) return;
    if (!sa) direct[champ] = sb;
    else if (norm(sa) !== norm(sb)) modifs.push({ date: now, contrat: numero, champ, avant: sa, apres: sb });
  };
  for (const k of ["siret", "siren", "adresse", "cp", "ville", "tva_intra", "naf", "forme_juridique", "telephone", "fax", "email", "facturation_societe", "facturation_email", "facturation_adresse"]) cmp(k, avant[k], fiche[k]);
  if (norm(str(avant.raison_sociale, 120)) !== norm(fiche.raison_sociale)) modifs.push({ date: now, contrat: numero, champ: "raison_sociale", avant: str(avant.raison_sociale, 120), apres: fiche.raison_sociale });
  for (const k of ["contact_compta", "contact_maintenance", "contact_commande", "signataire"]) for (const j of ["nom", "fonction", "tel", "email"]) cmp(`${k}.${j}`, avant[k]?.[j], fiche[k]?.[j]);
  if (fiche.commande_obligatoire && avant.commande_obligatoire !== true) direct.commande_obligatoire = true;
  if (Object.keys(direct).length) await ref.update({ ...direct, modifie_le: now, modifie_par: `signature offre ${numero}` });
  if (modifs.length) await ref.update({ modifications_en_attente: admin.firestore.FieldValue.arrayUnion(...modifs) });
}

export async function signerOffre(app: admin.app.App, ref: admin.firestore.DocumentReference, o: any, body: any, req: any): Promise<ResultatSignatureOffre> {
  const vue = offrePublique(o);
  if (vue.statut !== "a_signer") return { ok: false, status: 409, error: vue.statut, offre: vue };
  const nom = str(body.nom, 80);
  const fonction = str(body.fonction, 80);
  const email = str(body.email, 120).toLowerCase();
  if (nom.length < 3) return { ok: false, status: 400, error: "nom_requis" };
  if (body.accepte !== true) return { ok: false, status: 400, error: "accord_requis" };
  const dureeMois = Math.round(num(body.duree_mois));
  const duree = (o.durees || []).find((d: any) => d.mois === dureeMois);
  if (!duree) return { ok: false, status: 400, error: "duree_requise" };
  const avecAssurance = !!o.avec_assurance && body.avec_assurance === true;
  if (avecAssurance && !duree.loyer_assurance_ht) return { ok: false, status: 400, error: "assurance_indisponible" };
  const libs = new Set((Array.isArray(body.options) ? body.options : []).map((x: any) => str(x, 120)));
  const options = (o.options || []).filter((op: any) => libs.has(op.libelle));
  const loyer = avecAssurance ? duree.loyer_assurance_ht : duree.loyer_ht;
  const totalMensuel = Math.round((loyer + options.reduce((s: number, op: any) => s + (Number(op.prix_mensuel_ht) || 0), 0)) * 100) / 100;
  const cautionTtc = Math.round(totalMensuel * 1.2 * (o.caution_mois || 1) * 100) / 100;
  const png = Buffer.from(String(body.signature || "").replace(/^data:image\/png;base64,/, ""), "base64");
  if (png.length < 300 || png.length > 600_000 || png.readUInt32BE(0) !== 0x89504e47) return { ok: false, status: 400, error: "signature_requise" };
  // 🏢 Coordonnées de la société pour le contrat (SIRET, adresse, contacts) — obligatoires depuis le 05/11
  const { fiche, erreurs: erreursFiche } = ficheDepuisCorps(body.fiche, { nom, fonction, email, tel: str(body.tel, 40) });
  if (erreursFiche.length) return { ok: false, status: 400, error: "fiche_incomplete", details: erreursFiche };

  const [original] = await admin.storage(app).bucket(BUCKET).file(`offres_lld/${o.numero}.pdf`).download();
  const date = new Date();
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const navigateur = str(req.headers["user-agent"], 300);
  const mention = `Durée retenue : ${dureeMois} mois${o.avec_assurance ? (avecAssurance ? ", avec assurance" : ", sans assurance") : ""} — ${eur(totalMensuel)} HT / mois${options.length ? ` (options : ${options.map((x: any) => x.libelle).join(", ")})` : ""}`;
  const signe = await signerPdf(original, png, o.zone_signature, { nom, fonction, email: email || o.client?.contact_email || "", societe: o.client?.raison_sociale || "", ip, navigateur, date },
    o.numero, "fr", "Proposition commerciale LLD", [{ label: "Choix du client", value: mention }, { label: "Caution (1 mois de loyer TTC)", value: eur(cautionTtc) }],
    `Durée retenue : ${dureeMois} mois${o.avec_assurance ? (avecAssurance ? " — avec assurance" : " — sans assurance") : ""} — ${eur(totalMensuel)} HT / mois${options.length ? ` — options : ${options.map((x: any) => x.libelle).join(", ")}` : ""}`);
  const url = await sauverPdf(app, `offres_lld/${o.numero}_signee.pdf`, signe.pdf);
  const now = date.toISOString();
  const choix = { duree_mois: dureeMois, loyer_ht: loyer, avec_assurance: avecAssurance, options, total_mensuel_ht: totalMensuel, caution_ttc: cautionTtc };
  const deja = await admin.firestore(app).runTransaction(async (tx) => {
    const cur: any = (await tx.get(ref)).data();
    if (cur?.statut === "signee") return true;
    tx.update(ref, {
      statut: "signee", signe_le: now, pdf_signe_url: url, choix,
      client: { ...(o.client || {}), raison_sociale: fiche.raison_sociale, siren: fiche.siren, siret: fiche.siret, adresse: fiche.adresse, cp: fiche.cp, ville: fiche.ville, contact_nom: nom, contact_email: email || o.client?.contact_email || "", contact_tel: str(body.tel, 40) || o.client?.contact_tel || "" },
      signature: { nom, fonction, email, date: now, ip, navigateur, empreinte_original: signe.hashOriginal, empreinte_signe: signe.hashSigne },
      historique: admin.firestore.FieldValue.arrayUnion({ date: now, action: `signée en ligne par ${nom} — ${mention}`, par: nom }),
    });
    return false;
  });
  if (deja) return { ok: false, status: 409, error: "signee", offre: offrePublique({ ...o, statut: "signee" }) };

  const o2 = { ...o, statut: "signee", pdf_signe_url: url, choix, signature: { nom, fonction, email, date: now }, signe_le: now, client: { ...(o.client || {}), ...fiche, contact_nom: nom, contact_email: email || o.client?.contact_email || "", contact_tel: str(body.tel, 40) || "" } };
  const vue2 = offrePublique(o2);
  // 🧠 Mémoire client complétée avec les coordonnées saisies (avant la création des contrats, qui lisent la fiche)
  if (o.client_id) { try { await alimenterMemoireClient(app, String(o.client_id), fiche, o.numero, now); } catch (e: any) { console.error(`⚠ mémoire client ${o.client_id} :`, e?.message || e); } }
  // 📄 Lot 3 : un contrat en brouillon par nacelle (best-effort : la signature est déjà enregistrée)
  let contrats: string[] = [];
  try { contrats = await creerContratsDepuisOffre(app, o2); } catch (e: any) { console.error(`❌ contrats depuis l'offre ${o.numero} :`, e?.message || e); }
  // Emails : Jonathan + commercial local (best-effort), puis confirmation au client
  const resume = `<p><b>${esc(o.client.raison_sociale)}</b> a signé l'offre <b>${esc(o.numero)}</b> (${esc(o.modele)}${o.quantite > 1 ? ` × ${o.quantite}` : ""}, ${o.full_services ? "Full services" : "Sans entretien"}).</p>` +
    `<p>${esc(mention)}<br/>Caution : ${esc(eur(cautionTtc))} TTC · Transport : ${o.transport?.mode === "chiffre" ? esc(eur(o.transport.prix_ht || 0)) + " HT" : "offert"}</p>` +
    `<p>Signé par ${esc(nom)}${fonction ? ` (${esc(fonction)})` : ""} le ${date.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p><p>📄 <a href="${url}">Offre signée (PDF)</a></p>` +
    (contrats.length ? `<p>📄 ${contrats.length} contrat${contrats.length > 1 ? "s" : ""} en brouillon créé${contrats.length > 1 ? "s" : ""} dans Delta VO → LLD → Contrats : <b>${contrats.map(esc).join(", ")}</b>. À contrôler puis envoyer pour signature.</p>` : `<p>⚠ Les contrats n'ont pas pu être créés automatiquement : créez-les dans Delta VO → LLD → Contrats.</p>`);
  await emailBrevo([{ email: ALERTE }, ...(o.commercial?.email && o.commercial.email !== ALERTE ? [{ email: o.commercial.email, name: o.commercial.nom }] : [])],
    `✍️ Offre LLD ${o.numero} signée — ${o.client.raison_sociale}`, `<p>Bonjour,</p>${resume}<p>— Delta VO</p>`);
  const destClient = email || o.client?.contact_email;
  if (destClient) {
    await emailBrevo([{ email: destClient, name: nom }], `Proposition commerciale ${o.numero} signée — Delta Services`,
      `<p>Bonjour${nom ? " " + esc(nom) : ""},</p><p>Merci ! Nous avons bien reçu votre accord sur notre proposition commerciale <b>${esc(o.numero)}</b> (${esc(o.modele)}, ${dureeMois} mois). Vous trouverez le document signé en pièce jointe. Votre interlocuteur, ${esc(o.commercial?.nom || "")}, vous recontacte rapidement pour la suite (contrat et mise à disposition).</p><p>Cordialement,<br/>${esc(o.commercial?.nom || "")}<br/>Delta Services</p>`,
      { attachment: [{ name: `Proposition_LLD_${o.numero}_signee.pdf`, content: signe.pdf.toString("base64") }], replyTo: o.commercial?.email ? { email: o.commercial.email, name: o.commercial.nom } : undefined });
  }
  return { ok: true, status: 200, offre: vue2 };
}
