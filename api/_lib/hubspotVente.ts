// ============================================================
// 🏆 VENTE FACTURÉE → TRANSACTION « GAGNÉE » DANS HUBSPOT
// ============================================================
// Décision Jonathan (03/11/2026) : les devis se font dans Delta VO ; HubSpot
// ne reçoit plus le catalogue produits, seulement les ventes FACTURÉES
// (ventes et locations financières, pas les LLD), à partir de la mise en route.
//
// À la facturation d'une nacelle :
//  1. Entreprise (SIREN puis nom, créée si absente) + contact (email, créé si absent)
//  2. Transaction dans le DELTA Sales Pipeline au stade « Commande – Gagné – Won » :
//     - une transaction ouverte (et une seule) de la même entreprise dans ce
//       pipeline → elle passe Gagnée (pas de doublon dans les chiffres) ;
//     - sinon création ; plusieurs ouvertes → création + mail au commercial.
//     Une vente en lot = une transaction (les nacelles suivantes s'y rattachent).
//  3. Objet « Machines » de HubSpot (le parc suivi par Philippos / CPL) : la
//     fiche de la nacelle (par immatriculation, créée si absente) reçoit le
//     client, la date de facture, la livraison, le prix, et l'ID de la
//     transaction et de l'entreprise (champs « Deal Record ID » / « Company
//     Record ID » qui servent à ses workflows de rattachement).
//
// ⚠ L'immat est dans le NOM et la DESCRIPTION de la transaction, jamais dans le
// champ « immatriculation nacelle » ni en ligne de produit : le webhook
// (api/hubspot-webhook) remettrait sinon la nacelle « en préparation ».
// ============================================================

import admin from "firebase-admin";
import { fetchAvecReessai } from "./auth.js";

const API = "https://api.hubapi.com";
export const PIPELINE_DELTA = "3244783860";
const STADE_GAGNE = "4444367065";
const STADES_FERMES = [STADE_GAGNE, "4444367066" /* perdu */, "4605807861" /* annulé */, "4605820127" /* retiré */];
const OBJET_MACHINES = "p144239378_machines";
const ALERTE = "jlaroche@klubb.com";

type Hs = { ok: boolean; status: number; json: any; text: string };

function client(): (path: string, method?: string, body?: any) => Promise<Hs> {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error("HUBSPOT_TOKEN manquant");
  return async (path, method = "GET", body) => {
    const r = await fetchAvecReessai(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }, { timeoutMs: 15_000, essais: method === "GET" ? 3 : 1 });
    const text = await r.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* texte brut */ }
    return { ok: r.ok, status: r.status, json, text };
  };
}

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} €`;
const jourIso = (d?: string | null) => (/^\d{4}-\d{2}-\d{2}/.test(String(d || "")) ? String(d).slice(0, 10) : new Date().toISOString().slice(0, 10));
/** Date HubSpot (propriété « date ») : minuit UTC en millisecondes */
const dateHs = (d: string) => String(Date.parse(`${jourIso(d)}T00:00:00Z`));

function referenceDe(d: any): string {
  const brut = String(d.numero_occasion || "").trim().toUpperCase();
  if (!brut) return "VO";
  let prop = String(d.proprietaire || "DS").trim().toUpperCase();
  const x = brut.match(/^([A-Z]{2})?[\s-]*(\d+)[\s-]*([A-Z]{2})?$/);
  if (x) { prop = x[1] || x[3] || prop; return `${prop}${x[2]}`; }
  return brut.startsWith(prop) ? brut : `${prop}${brut}`;
}

async function emailBrevo(to: string, sujet: string, html: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender || !to) return;
  await fetchAvecReessai("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: sender, name: "Delta VO" }, to: [{ email: to }], subject: sujet, htmlContent: html }),
  }, { timeoutMs: 15_000, essais: 1 }).catch(() => null);
}

async function associer(hs: ReturnType<typeof client>, de: string, deId: string, vers: string, versId: string) {
  const r = await hs(`/crm/v4/objects/${de}/${deId}/associations/default/${vers}/${versId}`, "PUT");
  if (!r.ok) console.warn(`⚠️ association ${de}/${deId} → ${vers}/${versId} (${r.status}) ${r.text.slice(0, 160)}`);
}

async function chercher(hs: ReturnType<typeof client>, objet: string, filterGroups: any[], properties: string[], limit = 10): Promise<any[]> {
  const r = await hs(`/crm/v3/objects/${objet}/search`, "POST", { filterGroups, properties, limit });
  if (!r.ok) throw new Error(`recherche ${objet} impossible (${r.status}) ${r.text.slice(0, 200)}`);
  return r.json?.results || [];
}

/** Entreprise : SIREN (champ SIRET / Company Registration number), puis nom exact ; créée si absente */
async function entreprise(hs: ReturnType<typeof client>, c: any): Promise<{ id: string; cree: boolean }> {
  const siren = String(c?.siren || "").replace(/\D/g, "");
  const nom = String(c?.raison_sociale || "").trim();
  if (siren.length >= 9) {
    const r = await chercher(hs, "companies", [
      { filters: [{ propertyName: "siret___company_registration_number", operator: "EQ", value: siren }] },
      { filters: [{ propertyName: "siret___company_registration_number", operator: "CONTAINS_TOKEN", value: `${siren}*` }] },
    ], ["name"], 2);
    if (r[0]) return { id: String(r[0].id), cree: false };
  }
  if (nom) {
    const r = await chercher(hs, "companies", [{ filters: [{ propertyName: "name", operator: "EQ", value: nom }] }], ["name"], 2);
    if (r[0]) return { id: String(r[0].id), cree: false };
  }
  const props: Record<string, string> = { name: nom || "Client Delta VO" };
  if (siren) props.siret___company_registration_number = siren;
  if (c?.adresse) props.address = String(c.adresse);
  if (c?.cp) props.zip = String(c.cp);
  if (c?.ville) props.city = String(c.ville);
  const cr = await hs("/crm/v3/objects/companies", "POST", { properties: props });
  if (!cr.ok) throw new Error(`création de l'entreprise impossible (${cr.status}) ${cr.text.slice(0, 200)}`);
  return { id: String(cr.json.id), cree: true };
}

/** Contact du devis (email) : créé si absent */
async function contact(hs: ReturnType<typeof client>, c: any): Promise<string | null> {
  const email = String(c?.contact_email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const r = await chercher(hs, "contacts", [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }], ["email"], 1);
  if (r[0]) return String(r[0].id);
  const [prenom, ...reste] = String(c?.contact_nom || "").trim().split(/\s+/);
  const cr = await hs("/crm/v3/objects/contacts", "POST", { properties: {
    email, ...(prenom ? { firstname: prenom } : {}), ...(reste.length ? { lastname: reste.join(" ") } : {}), ...(c?.contact_tel ? { phone: String(c.contact_tel) } : {}),
  } });
  if (!cr.ok) { console.warn(`⚠️ contact ${email} non créé (${cr.status}) ${cr.text.slice(0, 160)}`); return null; }
  return String(cr.json.id);
}

async function proprietaire(hs: ReturnType<typeof client>, email: string): Promise<string | null> {
  if (!email) return null;
  const r = await hs(`/crm/v3/owners/?email=${encodeURIComponent(email)}`);
  return r.ok && r.json?.results?.[0]?.id ? String(r.json.results[0].id) : null;
}

/** Fiche de la nacelle dans l'objet « Machines » (parc HubSpot) : mise à jour, créée si absente */
async function ficheMachine(hs: ReturnType<typeof client>, d: any, infos: Record<string, string>): Promise<string | null> {
  const immat = String(d.immat || "").toUpperCase();
  const r = immat ? await chercher(hs, OBJET_MACHINES, [{ filters: [{ propertyName: "vehicle_registration_number", operator: "EQ", value: immat }] }], ["vehicle_registration_number"], 1) : [];
  if (r[0]) {
    const u = await hs(`/crm/v3/objects/${OBJET_MACHINES}/${r[0].id}`, "PATCH", { properties: infos });
    if (!u.ok) throw new Error(`fiche Machines ${immat} non mise à jour (${u.status}) ${u.text.slice(0, 200)}`);
    return String(r[0].id);
  }
  const cr = await hs(`/crm/v3/objects/${OBJET_MACHINES}`, "POST", { properties: {
    ...infos,
    vehicle_registration_number: immat,
    ...(d.numero_dossier ? { numero_de_dossier: String(d.numero_dossier) } : {}),
    ...(d.type_nacelle ? { nom: String(d.type_nacelle) } : {}),
    klubb_group_company: "Delta services",
  } });
  if (!cr.ok) throw new Error(`fiche Machines ${immat} non créée (${cr.status}) ${cr.text.slice(0, 200)}`);
  return String(cr.json.id);
}

export interface ResultatVente { ok: boolean; deal_id?: string; detail: string }

/**
 * Envoie dans HubSpot la vente facturée d'une nacelle. Idempotent : une
 * nacelle déjà envoyée n'est pas renvoyée ; une 2e nacelle du même devis se
 * rattache à la transaction du devis.
 */
export async function envoyerVenteGagnee(app: admin.app.App, machineId: string, par: string): Promise<ResultatVente> {
  const db = admin.firestore(app);
  const ref = db.collection("machines_vo").doc(machineId);
  const d: any = (await ref.get()).data();
  if (!d) return { ok: false, detail: "fiche introuvable" };
  if (d.statut !== "cloturee") return { ok: false, detail: "la nacelle n'est pas facturée (clôturée)" };
  if (d.type_sortie === "lld") return { ok: true, detail: "location longue durée : pas envoyée à HubSpot" };
  if (d.hubspot_vente?.deal_id) return { ok: true, deal_id: d.hubspot_vente.deal_id, detail: "déjà envoyée" };

  try {
    const hs = client();
    const dvRef = d.devis_vente_numero ? db.collection("devis_vente").doc(String(d.devis_vente_numero)) : null;
    const dv: any = dvRef ? (await dvRef.get()).data() || null : null;
    const ligne = (dv?.lignes || []).find((l: any) => l.machine_id === machineId);
    const prixNacelle = Number(ligne?.prix_ht ?? d.montant_offre ?? d.prix_vente_final ?? d.prix_fr) || 0;
    const locfi = dv?.type === "locfi" || d.mode_vente === "location_financiere";
    const reference = referenceDe(d);
    const immat = String(d.immat || machineId).toUpperCase();
    const facture = String(d.numero_facture || "");
    const dateFacture = jourIso(d.date_facturation);
    const clientDv = dv?.client || { raison_sociale: d.acheteur || d.client_offre || "", contact_email: d.email_sortie || "" };
    const nomClient = String(clientDv.raison_sociale || d.acheteur || "Client").trim();
    const commercialEmail = String(dv?.commercial?.email || "");
    const commercialNom = String(dv?.commercial?.nom || d.commercial_vendeur || "");
    const ligneDesc = `${reference} · ${immat} · ${d.type_nacelle || ""}${d.modele_porteur ? ` sur ${d.modele_porteur}` : ""} · ${eur(prixNacelle)} HT · facture ${facture || "?"} du ${dateFacture.split("-").reverse().join("/")}`;

    const ent = await entreprise(hs, clientDv);
    const contactId = await contact(hs, clientDv);
    if (contactId) await associer(hs, "contacts", contactId, "companies", ent.id);

    let dealId: string = dv?.hubspot_deal_id || "";
    let mode = "";
    if (dealId) {
      // Vente en lot : la transaction du devis existe déjà → on complète la description
      const cur = await hs(`/crm/v3/objects/deals/${dealId}?properties=description`);
      const desc = String(cur.json?.properties?.description || "");
      await hs(`/crm/v3/objects/deals/${dealId}`, "PATCH", { properties: { description: `${desc}\n• ${ligneDesc}`.trim() } });
      mode = "rattachée à la transaction du devis";
    } else {
      const ownerId = await proprietaire(hs, commercialEmail);
      const montant = Number(dv?.total_ht ?? prixNacelle) || prixNacelle;
      const nb = Math.max(1, (dv?.lignes || []).length || 1);
      const nom = nb > 1 ? `VO – ${nomClient} – ${nb} nacelles (${reference} …)` : `VO – ${nomClient} – ${reference} – ${immat} – ${d.type_nacelle || ""}`.trim();
      const description = [
        `${locfi ? "Location financière" : "Vente VO"} facturée — envoyée par Delta VO (${par}).`,
        dv ? `${locfi ? `Contrat ${dv.locfi?.numero_contrat || ""} (devis ${dv.numero})` : `Devis ${dv.numero}`}${locfi && dv.locfi ? ` : ${dv.locfi.duree_mois} mois, 1er loyer ${eur(dv.locfi.premier_loyer_ht)} HT` : ""}` : "",
        `• ${ligneDesc}`,
      ].filter(Boolean).join("\n");
      const props: Record<string, string> = {
        amount: String(montant), closedate: dateHs(dateFacture), pipeline: PIPELINE_DELTA, dealstage: STADE_GAGNE, description,
        ...(ownerId ? { hubspot_owner_id: ownerId } : {}),
      };

      // Transaction déjà ouverte pour cette entreprise dans le DELTA pipeline ?
      const ouvertes = await chercher(hs, "deals", [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: PIPELINE_DELTA },
          { propertyName: "dealstage", operator: "NOT_IN", values: STADES_FERMES },
          { propertyName: "associations.company", operator: "EQ", value: ent.id },
        ],
      }], ["dealname", "immatriculation_nacelle", "hs_num_of_associated_line_items", "description"], 5).catch(() => [] as any[]);
      const unique = ouvertes.length === 1 ? ouvertes[0] : null;
      const porteImmat = unique && (String(unique.properties?.immatriculation_nacelle || "").trim() || Number(unique.properties?.hs_num_of_associated_line_items || 0) > 0);
      if (unique && !porteImmat) {
        const ancienne = String(unique.properties?.description || "");
        const u = await hs(`/crm/v3/objects/deals/${unique.id}`, "PATCH", { properties: { ...props, description: `${ancienne ? `${ancienne}\n\n` : ""}${description}` } });
        if (!u.ok) throw new Error(`transaction ${unique.id} non mise à jour (${u.status}) ${u.text.slice(0, 200)}`);
        dealId = String(unique.id);
        mode = `transaction ouverte « ${unique.properties?.dealname || dealId} » passée Gagnée`;
      } else {
        const cr = await hs("/crm/v3/objects/deals", "POST", { properties: { ...props, dealname: nom } });
        if (!cr.ok) throw new Error(`création de la transaction impossible (${cr.status}) ${cr.text.slice(0, 200)}`);
        dealId = String(cr.json.id);
        mode = "transaction créée";
        if (ouvertes.length) {
          const liens = ouvertes.map((o: any) => `<li><a href="https://app.hubspot.com/contacts/144239378/record/0-3/${o.id}">${String(o.properties?.dealname || o.id)}</a></li>`).join("");
          const raison = porteImmat ? "elle porte une immatriculation (le webhook remettrait la nacelle en préparation)" : `${ouvertes.length} transactions ouvertes`;
          await emailBrevo(commercialEmail || ALERTE, `HubSpot — ${nomClient} : transaction(s) ouverte(s) à fermer`,
            `<p>Bonjour,</p><p>La vente ${esc(reference)} à <b>${esc(nomClient)}</b> (facture ${esc(facture)}) a été enregistrée dans HubSpot comme une <b>nouvelle transaction gagnée</b>, car ${raison}.</p>` +
            `<p>Pensez à fermer (Perdu / Annulé) celle(s) qui faisai(en)t doublon :</p><ul>${liens}</ul><p>— Delta VO</p>`);
          mode += ` (${ouvertes.length} ouverte(s) à fermer : commercial prévenu)`;
        }
      }
      await associer(hs, "deals", dealId, "companies", ent.id);
      if (contactId) await associer(hs, "deals", dealId, "contacts", contactId);
      if (dvRef) await dvRef.update({ hubspot_deal_id: dealId, hubspot_envoye_le: new Date().toISOString() }).catch(() => undefined);
    }

    // Parc HubSpot (objet Machines) : la nacelle sort du stock Delta vers ce client
    // (best-effort : la transaction est déjà enregistrée ; si la clé HubSpot n'a pas
    // le droit sur les objets personnalisés, on prévient sans tout faire échouer)
    const livraison = jourIso(d.livraison_reelle?.date || d.date_livraison_prevue || dateFacture);
    let erreurParc = "";
    const machineHsId = await ficheMachine(hs, d, {
      customer_name: nomClient,
      invoice_date: dateHs(dateFacture),
      date_de_livraison: dateHs(livraison),
      prix: String(prixNacelle),
      currency: "EUR",
      rental: "No",
      delivery_status: "Delivered",
      deal_record_id: dealId,
      company_record_id: ent.id,
      numero_de_transaction: dealId,
      numero_d_offre: String(dv ? (locfi && dv.locfi?.numero_contrat ? dv.locfi.numero_contrat : dv.numero) : facture),
    }).catch((e: any) => { erreurParc = String(e?.message || e); return null; });
    if (machineHsId) {
      await associer(hs, OBJET_MACHINES, machineHsId, "deals", dealId);
      await associer(hs, OBJET_MACHINES, machineHsId, "companies", ent.id);
    } else if (erreurParc) {
      console.error(`❌ HubSpot parc Machines ${immat}:`, erreurParc);
      await emailBrevo(ALERTE, `⚠ HubSpot — parc « Machines » non mis à jour pour ${immat}`,
        `<p>La transaction gagnée de <b>${esc(immat)}</b> (${esc(nomClient)}) est bien dans HubSpot, mais la fiche du parc « Machines » n'a pas pu être mise à jour :</p><p><i>${esc(erreurParc)}</i></p>` +
        `<p>Si l'erreur parle de droits (403), la clé HubSpot de Delta VO doit recevoir les droits sur les objets personnalisés (crm.objects.custom.read / write) — à demander à Philippos.</p>`);
    }

    await ref.update({
      hubspot_vente: { deal_id: dealId, machine_hs_id: machineHsId, envoye_le: new Date().toISOString(), par, ...(erreurParc ? { erreur_parc: erreurParc.slice(0, 300) } : {}) },
      hubspot_vente_erreur: admin.firestore.FieldValue.delete(),
    });
    console.log(`🏆 HubSpot ${immat} → deal ${dealId} (${mode})`);
    return { ok: true, deal_id: dealId, detail: `${mode}${ent.cree ? ", entreprise créée" : ""}${erreurParc ? " — ⚠ parc Machines non mis à jour" : machineHsId ? ", parc Machines mis à jour" : ""}` };
  } catch (e: any) {
    const msg = String(e?.message || e);
    console.error(`❌ HubSpot vente ${machineId}:`, msg);
    await ref.update({ hubspot_vente_erreur: { message: msg.slice(0, 300), le: new Date().toISOString() } }).catch(() => undefined);
    await emailBrevo(ALERTE, `⚠ HubSpot — vente ${d.immat || machineId} non envoyée`,
      `<p>La vente facturée de <b>${esc(d.immat || machineId)}</b> (${esc(d.acheteur || "")}, facture ${esc(d.numero_facture || "")}) n'a pas pu être envoyée à HubSpot :</p><p><i>${esc(msg)}</i></p><p>La facture est bien enregistrée dans Delta VO. Bouton « Renvoyer vers HubSpot » sur la carte (onglet Clôturées).</p>`);
    return { ok: false, detail: msg };
  }
}

const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));

/**
 * 🧹 Vide le catalogue produits HubSpot des produits créés par Delta VO (la
 * synchro du catalogue est arrêtée). Ne supprime JAMAIS un produit tiers
 * (CPL, configurateur…) : seulement delta_vo_managed = true, ou SKU = immat
 * d'une fiche Delta VO avec un nom « IMMAT » / « IMMAT — modèle ».
 */
export async function viderCatalogueDeltaVo(app: admin.app.App): Promise<{ supprimes: number; ignores: number }> {
  const hs = client();
  const ids = (await admin.firestore(app).collection("machines_vo").select("immat").get()).docs
    .map((x) => String(x.data().immat || x.id).trim().toUpperCase()).filter((v) => /^[A-Z]{2}-\d{3}-[A-Z]{2}$/.test(v));
  const immats = [...new Set(ids)];
  const aSupprimer: string[] = [];
  let ignores = 0;
  for (let i = 0; i < immats.length; i += 100) {
    const lot = immats.slice(i, i + 100);
    const r = await hs("/crm/v3/objects/products/search", "POST", {
      filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "IN", values: lot }] }],
      properties: ["hs_sku", "name", "delta_vo_managed"], limit: 200,
    });
    if (!r.ok) throw new Error(`recherche produits impossible (${r.status}) ${r.text.slice(0, 200)}`);
    for (const p of r.json?.results || []) {
      const sku = String(p.properties?.hs_sku || "").toUpperCase();
      const nom = String(p.properties?.name || "");
      const aNous = p.properties?.delta_vo_managed === "true" || nom === sku || nom.startsWith(`${sku} —`);
      if (aNous) aSupprimer.push(String(p.id)); else ignores++;
    }
  }
  for (let i = 0; i < aSupprimer.length; i += 100) {
    const r = await hs("/crm/v3/objects/products/batch/archive", "POST", { inputs: aSupprimer.slice(i, i + 100).map((id) => ({ id })) });
    if (!r.ok) throw new Error(`suppression des produits impossible (${r.status}) ${r.text.slice(0, 200)}`);
  }
  console.log(`🧹 Catalogue HubSpot Delta VO vidé : ${aSupprimer.length} produit(s) retiré(s), ${ignores} produit(s) tiers ignoré(s)`);
  return { supprimes: aSupprimer.length, ignores };
}
