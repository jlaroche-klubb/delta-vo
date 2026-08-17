// ============================================================
// 🔔 ALERTE IMPORT ADMIN — Delta VO
// ============================================================
// Appelé par le front après chaque import (Parc VOG, VNC compta,
// Pricing PDG) fait par un admin : envoie un email récapitulatif
// au super admin (qui a importé, combien de machines, erreurs).
//
// PRÉREQUIS Vercel (projet delta-vo) : BREVO_API_KEY,
//   BREVO_SENDER_EMAIL (+ BREVO_SENDER_NAME optionnel) — mêmes
//   valeurs que sur le projet nacelle-expert2.
// Destinataires : IMPORTS_NOTIFY_TO (emails séparés par des
//   virgules) — défaut : jlaroche@klubb.com.
// ============================================================

const DEFAULT_TO = ["jlaroche@klubb.com"];

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
    const type = String(body.type || "Import").slice(0, 60);
    const par = String(body.par || "?").slice(0, 120);
    const email = String(body.email || "").slice(0, 200);
    const resume: string[] = Array.isArray(body.resume) ? body.resume.slice(0, 40) : [];
    const erreurs: string[] = Array.isArray(body.erreurs) ? body.erreurs.slice(0, 120) : [];

    const recipients = String(process.env.IMPORTS_NOTIFY_TO || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const to = recipients.length ? recipients : DEFAULT_TO;

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const dateStr = new Date().toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
    });

    const html =
      `<div style="font-family:Arial,sans-serif;max-width:600px;">` +
      `<h2 style="color:#1a2a6e;margin-bottom:4px;">📥 Import « ${esc(type)} »</h2>` +
      `<p style="color:#666;margin-top:0;">Delta VO · Delta Services</p>` +
      `<p><b>Par :</b> ${esc(par)}${email ? ` (${esc(email)})` : ""}<br/><b>Le :</b> ${dateStr}</p>` +
      (resume.length
        ? `<div style="margin:14px 0;padding:12px 14px;background:#f6f8fc;border-radius:8px;">` +
          resume.map((l) => `<div>${esc(l)}</div>`).join("") +
          `</div>`
        : "") +
      (erreurs.length
        ? `<div style="margin:14px 0;padding:12px 14px;background:#fdecea;border-radius:8px;">` +
          `<div style="font-weight:bold;color:#c0392b;">⚠ ${erreurs.length} erreur(s) / ligne(s) ignorée(s)</div>` +
          `<ul style="margin:6px 0 0;padding-left:20px;">` +
          erreurs.map((l) => `<li style="margin:2px 0;">${esc(l)}</li>`).join("") +
          `</ul></div>`
        : `<p style="color:#1a7f37;">✓ Aucune erreur signalée.</p>`) +
      `<p style="color:#999;font-size:12px;margin-top:18px;">Alerte automatique envoyée pour chaque import fait par un admin · ne pas répondre à cet email.</p>` +
      `</div>`;

    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || "Delta VO · Delta Services" },
        to: to.map((e) => ({ email: e })),
        subject: `📥 Import ${type} par ${par}${erreurs.length ? ` · ⚠ ${erreurs.length} erreur(s)` : " · OK"}`,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.error("❌ Brevo (notify-import):", resp.status, detail.slice(0, 300));
      return res.status(502).json({ error: "Envoi Brevo échoué" });
    }
    return res.status(200).json({ ok: true, recipients: to.length });
  } catch (e: any) {
    console.error("❌ notify-import:", e);
    return res.status(500).json({ error: e?.message || "Erreur alerte import" });
  }
}
