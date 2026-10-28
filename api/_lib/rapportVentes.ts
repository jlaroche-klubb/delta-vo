// ============================================================
// 📊 RAPPORT HEBDOMADAIRE DES VENTES — tous les lundis à 8 h (heure de Paris)
// ============================================================
// Ventes de la semaine précédente (lundi → dimanche) : nacelles passées en
// vente (date de vente dans la semaine), quel que soit leur statut actuel
// (en préparation ou clôturée), + devis envoyés / signés de la semaine.
// Destinataires : Admin → Paramètres des devis (config/devis.rapport_ventes_destinataires).
// Déclenché par la tâche planifiée Vercel (vercel.json → crons) le lundi tôt ;
// l'email est programmé chez Brevo pour 8 h 00 précises, heure de Paris.
// ============================================================

import admin from "firebase-admin";

export interface Semaine { debut: string; fin: string; lundi8hUtc: Date }

/** Semaine précédente (lundi → dimanche) en heure de Paris, et lundi 8 h de la semaine en cours */
export function semainePrecedente(maintenant = new Date()): Semaine {
  const paris = new Date(maintenant.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const decalage = paris.getTime() - new Date(maintenant.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const jour = Date.UTC(paris.getFullYear(), paris.getMonth(), paris.getDate());
  const dow = (paris.getDay() + 6) % 7; // 0 = lundi
  const lundi = jour - dow * 86400000;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { debut: iso(lundi - 7 * 86400000), fin: iso(lundi - 86400000), lundi8hUtc: new Date(lundi + 8 * 3600000 - decalage) };
}

const esc = (s: any) => String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
const eur = (n: any) => (Number.isFinite(Number(n)) && n !== null && n !== "" ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €" : "—");
const dfr = (s?: string) => (s ? String(s).slice(0, 10).split("-").reverse().join("/") : "");
const num = (v: any) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const pos = (v: any) => { const n = num(v); return n !== null && n > 0 ? n : null; };

function referenceCommerciale(d: any): string {
  const brut = String(d.numero_occasion || "").trim().toUpperCase();
  if (!brut) return "VO";
  let prop = String(d.proprietaire || "DS").trim().toUpperCase();
  const x = brut.match(/^([A-Z]{2})?[\s-]*(\d+)[\s-]*([A-Z]{2})?$/);
  if (x) { prop = x[1] || x[3] || prop; return `${prop}${x[2]}`; }
  return brut.startsWith(prop) ? brut : `${prop}${brut}`;
}

export interface LigneVente {
  reference: string; immat: string; nacelle: string; site: string; acheteur: string; commercial: string;
  date_vente: string; statut: string; prix: number | null; prix_catalogue: number | null; vnc: number | null; devis: string;
}

export async function collecterVentes(db: admin.firestore.Firestore, s: Semaine) {
  const snap = await db.collection("machines_vo").where("date_vente", ">=", s.debut).where("date_vente", "<=", s.fin + "").get();
  const ventes: LigneVente[] = snap.docs
    .map((x) => ({ id: x.id, ...(x.data() as any) }))
    .filter((d) => d.type_sortie === "vente" && ["en_cours", "cloturee"].includes(d.statut))
    .map((d) => ({
      reference: referenceCommerciale(d),
      immat: d.immat || d.id,
      nacelle: [d.type_nacelle, d.modele_porteur, String(d.annee_circulation || "").match(/(19|20)\d{2}/)?.[0]].filter(Boolean).join(" · "),
      site: d.localite || "",
      acheteur: d.acheteur || "",
      commercial: d.commercial_vendeur || "",
      date_vente: String(d.date_vente || "").slice(0, 10),
      statut: d.statut === "cloturee" ? "facturée" : "en préparation",
      prix: pos(d.prix_vente_final) ?? pos(d.montant_offre) ?? pos(d.prix_fr),
      prix_catalogue: num(d.prix_fr),
      vnc: num(d.vr_vnc),
      devis: d.devis_vente_numero || "",
    }))
    .sort((a, b) => a.date_vente.localeCompare(b.date_vente) || a.reference.localeCompare(b.reference));

  const dsnap = await db.collection("devis_vente").where("date", ">=", s.debut).get();
  const devis = dsnap.docs.map((x) => x.data() as any).filter((d) => String(d.date || "").slice(0, 10) <= s.fin);
  const signes = (await db.collection("devis_vente").where("signe_le", ">=", s.debut).get()).docs
    .map((x) => x.data() as any).filter((d) => d.statut === "signe" && String(d.signe_le || "").slice(0, 10) <= s.fin);
  // 🔁 Ventes dont la nacelle a été changée et que le client n'a pas encore re-signées
  const aResigner = (await db.collection("devis_vente").where("statut", "in", ["a_resigner", "envoye"]).get()).docs
    .map((x) => x.data() as any).filter((d) => (d.echanges || []).length > 0)
    .map((d) => ({ numero: d.numero, client: d.client?.raison_sociale || "", commercial: d.commercial?.nom || "", envoye: d.statut === "envoye", refs: (d.lignes || []).map((l: any) => l.reference).join(", ") }));
  return {
    aResigner,
    ventes,
    devisEnvoyes: devis.filter((d) => ["envoye", "signature", "signe", "genere"].includes(d.statut) || d.envoye_le).length,
    devisSignes: signes.map((d) => ({ numero: d.numero, client: d.client?.raison_sociale || "", total_ht: d.total_ht, nb: (d.lignes || []).length })),
  };
}

export function construireRapport(s: Semaine, r: Awaited<ReturnType<typeof collecterVentes>>) {
  const total = r.ventes.reduce((t, v) => t + (v.prix || 0), 0);
  const sansPrix = r.ventes.filter((v) => v.prix === null).length;
  const avecVnc = r.ventes.filter((v) => v.prix !== null && v.vnc !== null);
  const marge = avecVnc.reduce((t, v) => t + ((v.prix as number) - (v.vnc as number)), 0);
  const parCommercial = new Map<string, { nb: number; ca: number }>();
  for (const v of r.ventes) {
    const k = v.commercial || "—";
    const c = parCommercial.get(k) || { nb: 0, ca: 0 };
    c.nb++; c.ca += v.prix || 0;
    parCommercial.set(k, c);
  }
  const periode = `du lundi ${dfr(s.debut)} au dimanche ${dfr(s.fin)}`;
  const sujet = `📊 Ventes Delta VO — semaine ${periode.replace("du lundi ", "du ").replace(" au dimanche ", " au ")} : ${r.ventes.length} nacelle${r.ventes.length > 1 ? "s" : ""}${total > 0 ? `, ${eur(total)} HT` : ""}`;
  const th = `style="text-align:left;padding:6px 8px;background:#1f4282;color:#fff;font-size:12px"`;
  const td = `style="padding:6px 8px;border-bottom:1px solid #e6e9ef;font-size:12px"`;
  const tdr = `style="padding:6px 8px;border-bottom:1px solid #e6e9ef;font-size:12px;text-align:right;white-space:nowrap"`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#1f2733;max-width:900px">` +
    `<h2 style="color:#1f4282;margin:0 0 4px">📊 Ventes de la semaine</h2><div style="color:#666;margin-bottom:16px">${esc(periode)}</div>` +
    `<table style="border-collapse:collapse;margin-bottom:18px"><tr>` +
    [["Nacelles vendues", String(r.ventes.length)], ["Chiffre d'affaires HT", (total > 0 ? eur(total) : "—") + (sansPrix ? ` (${sansPrix} sans prix)` : "")], ["Marge sur VNC", avecVnc.length ? eur(marge) + (avecVnc.length < r.ventes.length ? ` (${avecVnc.length}/${r.ventes.length})` : "") : "—"], ["Devis envoyés", String(r.devisEnvoyes)], ["Devis signés", String(r.devisSignes.length)]]
      .map(([l, v]) => `<td style="padding:10px 16px;border:1px solid #e6e9ef;text-align:center"><div style="font-size:20px;font-weight:bold;color:#1f4282">${esc(v)}</div><div style="font-size:11px;color:#666">${esc(l)}</div></td>`).join("") +
    `</tr></table>` +
    (r.ventes.length
      ? `<table style="border-collapse:collapse;width:100%"><tr><th ${th}>Date</th><th ${th}>Réf.</th><th ${th}>Immat</th><th ${th}>Nacelle</th><th ${th}>Site</th><th ${th}>Acheteur</th><th ${th}>Commercial</th><th ${th}>Prix HT</th><th ${th}>VNC</th><th ${th}>Statut</th></tr>` +
        r.ventes.map((v) => `<tr><td ${td}>${dfr(v.date_vente)}</td><td ${td}><b>${esc(v.reference)}</b></td><td ${td}>${esc(v.immat)}</td><td ${td}>${esc(v.nacelle)}</td><td ${td}>${esc(v.site)}</td><td ${td}>${esc(v.acheteur)}</td><td ${td}>${esc(v.commercial)}</td><td ${tdr}><b>${eur(v.prix)}</b></td><td ${tdr}>${eur(v.vnc)}</td><td ${td}>${esc(v.statut)}</td></tr>`).join("") +
        `</table>`
      : `<p style="color:#666">Aucune vente enregistrée cette semaine-là.</p>`) +
    (parCommercial.size > 1 || (parCommercial.size === 1 && !parCommercial.has("—"))
      ? `<h3 style="color:#1f4282;margin:20px 0 6px;font-size:15px">Par commercial</h3><ul style="margin:0;padding-left:18px">${[...parCommercial.entries()].sort((a, b) => b[1].ca - a[1].ca).map(([k, c]) => `<li>${esc(k)} : ${c.nb} nacelle${c.nb > 1 ? "s" : ""} — ${c.ca > 0 ? eur(c.ca) + " HT" : "prix non renseigné"}</li>`).join("")}</ul>`
      : "") +
    (r.aResigner.length
      ? `<h3 style="color:#b26a00;margin:20px 0 6px;font-size:15px">🔁 Nacelle changée — à re-signer</h3><ul style="margin:0;padding-left:18px">${r.aResigner.map((d) => `<li>${esc(d.numero)} — ${esc(d.client)} (${esc(d.commercial)}) : ${esc(d.refs)} · ${d.envoye ? "renvoyé au client, en attente de signature" : "pas encore renvoyé au client"}</li>`).join("")}</ul>`
      : "") +
    (r.devisSignes.length
      ? `<h3 style="color:#1f4282;margin:20px 0 6px;font-size:15px">Devis signés</h3><ul style="margin:0;padding-left:18px">${r.devisSignes.map((d) => `<li>${esc(d.numero)} — ${esc(d.client)} : ${d.nb} nacelle${d.nb > 1 ? "s" : ""}, ${eur(d.total_ht)} HT</li>`).join("")}</ul>`
      : "") +
    `<p style="margin-top:22px;font-size:11px;color:#888">Détail en pièce jointe (Excel). Prix HT = prix facturé, sinon montant du devis, sinon prix catalogue. — <a href="https://delta-vo.vercel.app">Delta VO</a></p></div>`;

  const cel = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "﻿" + [
    ["Date de vente", "Référence", "Immatriculation", "Nacelle", "Site", "Acheteur", "Commercial", "Prix HT", "Prix catalogue HT", "VNC", "Écart prix - VNC", "Statut", "Devis"].map(cel).join(";"),
    ...r.ventes.map((v) => [dfr(v.date_vente), v.reference, v.immat, v.nacelle, v.site, v.acheteur, v.commercial,
      v.prix ?? "", v.prix_catalogue ?? "", v.vnc ?? "", v.prix !== null && v.vnc !== null ? v.prix - v.vnc : "", v.statut, v.devis].map(cel).join(";")),
  ].join("\r\n");
  return { sujet, html, csv, nomCsv: `Ventes_Delta_VO_${s.debut}_au_${s.fin}.csv` };
}
