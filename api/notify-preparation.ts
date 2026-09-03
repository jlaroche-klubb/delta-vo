// ============================================================
// 🔧 NOTIFICATION PRÉPARATEURS — Delta VO
// ============================================================
// Appelé par le front quand une machine est MISE EN PRÉPARATION
// (« Valider et créer la fiche » dans En préparation). Envoie un
// email aux préparateurs du SITE de la machine (liste d'emails par
// site gérée dans Admin → « Préparateurs par site », stockée dans
// Firestore config/notifications_preparation).
//
// PRÉREQUIS Vercel (projet delta-vo) : BREVO_API_KEY,
//   BREVO_SENDER_EMAIL (+ BREVO_SENDER_NAME optionnel) — déjà en
//   place pour l'alerte import.
// Les destinataires sont fournis par le front (lus dans Firestore).
// ============================================================

const APP_URL = "https://delta-vo.vercel.app";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    console.error("❌ Brevo non configuré (BREVO_API_KEY / BREVO_SENDER_EMAIL sur delta-vo)");
    return res.status(500).json({ error: "Brevo non configuré" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const s = (v: any, max = 200) => String(v ?? "").trim().slice(0, max);

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const to: string[] = Array.from(
      new Set(
        (Array.isArray(body.to) ? body.to : [])
          .map((e: any) => s(e, 200).toLowerCase())
          .filter((e: string) => emailRe.test(e))
      )
    ).slice(0, 30) as string[];
    if (!to.length) return res.status(400).json({ error: "Aucun destinataire" });

    const immat = s(body.immat, 20);
    const site = s(body.site, 60);
    const reference = s(body.reference, 60);
    const typeNacelle = s(body.type_nacelle, 60);
    const modele = s(body.modele_porteur, 80);
    const annee = s(body.annee, 10);
    const typePrepa = s(body.type_prepa, 20) === "en_etat" ? "Remise en état complète" : "Préparation normale";
    const typeSortie = s(body.type_sortie, 10) === "lld" ? "Location (LLD)" : "Vente";
    const acheteur = s(body.acheteur, 120);
    const commercial = s(body.commercial, 120);
    const dateLivraison = s(body.date_livraison_prevue, 20);
    const par = s(body.par, 120);
    const etapes: string[] = Array.isArray(body.etapes) ? body.etapes.map((e: any) => s(e, 120)).filter(Boolean).slice(0, 40) : [];

    const esc = (str: string) =>
      str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmtDate = (iso: string) => {
      if (!iso) return "";
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
    };

    const dateStr = new Date().toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
    });

    const machineTitre = [typeNacelle, modele].filter(Boolean).join(" · ") || immat;
    const row = (label: string, value: string) =>
      value
        ? `<tr><td style="padding:4px 10px 4px 0;color:#666;white-space:nowrap;">${label}</td><td style="padding:4px 0;font-weight:bold;">${esc(value)}</td></tr>`
        : "";

    const html =
      `<div style="font-family:Arial,sans-serif;max-width:620px;">` +
      `<h2 style="color:#1a2a6e;margin-bottom:4px;">🔧 Nouvelle machine à préparer${site ? ` — ${esc(site)}` : ""}</h2>` +
      `<p style="color:#666;margin-top:0;">Delta VO · Delta Services · ${dateStr}</p>` +
      `<div style="margin:14px 0;padding:14px 16px;background:#f6f8fc;border-radius:8px;">` +
      `<div style="font-size:18px;font-weight:bold;color:#1a2a6e;margin-bottom:8px;">${esc(immat)}${reference ? ` <span style="color:#666;font-weight:normal;font-size:14px;">· ${esc(reference)}</span>` : ""}</div>` +
      `<table style="border-collapse:collapse;font-size:14px;">` +
      row("Machine", machineTitre) +
      row("Année", annee) +
      row("Site", site) +
      row("Type de sortie", typeSortie) +
      row("Préparation", typePrepa) +
      row(typeSortie.startsWith("Location") ? "Client" : "Acheteur", acheteur) +
      row("Commercial", commercial) +
      row("Livraison prévue", fmtDate(dateLivraison)) +
      row("Mise en préparation par", par) +
      `</table></div>` +
      (etapes.length
        ? `<div style="margin:14px 0;"><div style="font-weight:bold;color:#1a2a6e;margin-bottom:6px;">Étapes à réaliser</div>` +
          `<ol style="margin:0;padding-left:22px;font-size:14px;">` +
          etapes.map((e) => `<li style="margin:2px 0;">${esc(e)}</li>`).join("") +
          `</ol></div>`
        : "") +
      `<p style="margin:18px 0;"><a href="${APP_URL}" style="background:#1a2a6e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold;">Ouvrir Delta VO → En préparation</a></p>` +
      `<p style="color:#999;font-size:12px;margin-top:18px;">Notification automatique envoyée aux préparateurs du site à chaque mise en préparation · ne pas répondre à cet email.</p>` +
      `</div>`;

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || "Delta VO · Delta Services" },
        to: to.map((e) => ({ email: e })),
        subject: `🔧 À préparer${site ? ` ${site}` : ""} : ${immat}${machineTitre !== immat ? ` · ${machineTitre}` : ""}${dateLivraison ? ` · livraison ${fmtDate(dateLivraison)}` : ""}`,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("❌ Brevo (notify-preparation):", resp.status, detail.slice(0, 300));
      return res.status(502).json({ error: "Envoi Brevo échoué" });
    }
    console.log(`📧 notify-preparation ${immat} (${site}) → ${to.length} destinataire(s)`);
    return res.status(200).json({ ok: true, recipients: to.length });
  } catch (e: any) {
    console.error("❌ notify-preparation:", e);
    return res.status(500).json({ error: e?.message || "Erreur notification préparation" });
  }
}
