import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import { deciderValidation, lireValidation, type DevisAValider } from "../services/devisVenteService";

/**
 * 🔒 Page de VALIDATION d'une remise > 1 000 € HT / nacelle — ouverte depuis
 * l'email reçu par le valideur (Jonathan / Nathalie) : /devis-validation/{numero}/{jeton}.
 * Lien personnel, pas de connexion. Le premier qui décide l'emporte.
 */

const BLEU = "#1f4282";
const eur = (n?: number | null) => (n === null || n === undefined ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/[  ]/g, " ") + " €");
const dfr = (s?: string | null) => (s ? new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "");

export default function ValidationDevisPage() {
  const { numero = "", jeton = "" } = useParams<{ numero: string; jeton: string }>();
  const [dv, setDv] = useState<DevisAValider | null>(null);
  const [etat, setEtat] = useState<"charge" | "invalide" | "ok">("charge");
  const [motif, setMotif] = useState("");
  const [envoi, setEnvoi] = useState<"" | "valider" | "refuser">("");
  const [resultat, setResultat] = useState("");
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    document.title = `Validation devis ${numero} — Delta VO`;
    lireValidation(numero, jeton).then((d) => { setDv(d); setEtat("ok"); }).catch(() => setEtat("invalide"));
  }, [numero, jeton]);

  async function decider(decision: "valider" | "refuser") {
    setErreur("");
    if (decision === "refuser" && !motif.trim() && !window.confirm("Refuser sans commentaire pour le commercial ?")) return;
    setEnvoi(decision);
    try {
      const r = await deciderValidation(numero, jeton, decision, motif.trim());
      setDv(r.devis);
      setResultat(r.resultat || "");
    } catch (e: any) {
      if (e?.details?.devis) setDv(e.details.devis);
      else setErreur("La décision n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setEnvoi("");
    }
  }

  const carte: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "20px 22px", marginBottom: 16 };
  const enAttente = dv?.validation.statut === "en_attente";

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1f2733" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <img src={DELTA_LOGO_BASE64} alt="Delta Services" style={{ height: 40 }} />
          <span style={{ fontWeight: 700, color: BLEU }}>🔒 Validation de remise</span>
        </div>
        {etat === "charge" && <div style={carte}>Chargement…</div>}
        {etat === "invalide" && <div style={carte}><h2 style={{ marginTop: 0, color: "#c0392b" }}>Lien de validation invalide</h2><p>Ouvrez le lien complet reçu par email.</p></div>}
        {etat === "ok" && dv && (
          <>
            {!enAttente && (
              <div style={{ ...carte, borderLeft: `5px solid ${dv.validation.statut === "validee" ? "#1e8e3e" : "#c0392b"}` }}>
                <h2 style={{ marginTop: 0, color: dv.validation.statut === "validee" ? "#1e8e3e" : "#c0392b" }}>
                  {dv.validation.statut === "validee" ? "✅ Remise validée" : dv.validation.statut === "refusee" ? "❌ Remise refusée" : "Demande déjà traitée"}
                </h2>
                {dv.validation.par && <p>Par {dv.validation.par} le {dfr(dv.validation.le)}{dv.validation.motif ? ` — « ${dv.validation.motif} »` : ""}</p>}
                {resultat && <p><b>{resultat}</b></p>}
              </div>
            )}
            <div style={carte}>
              <div style={{ fontSize: 13, color: "#666" }}>Devis {dv.numero} · par <b>{dv.commercial}</b></div>
              <div style={{ fontWeight: 700, fontSize: 18, margin: "4px 0 14px" }}>{dv.client}</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: BLEU, color: "white" }}>
                      <th style={{ textAlign: "left", padding: "7px 8px" }}>Nacelle</th>
                      <th style={{ textAlign: "right", padding: "7px 8px" }}>Catalogue HT</th>
                      <th style={{ textAlign: "right", padding: "7px 8px" }}>Proposé HT</th>
                      <th style={{ textAlign: "right", padding: "7px 8px" }}>Remise</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dv.lignes.map((l, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #eef0f4" }}>
                        <td style={{ padding: "8px" }}><b>{l.reference}</b><div style={{ fontSize: 12, color: "#666" }}>{l.designation}</div></td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{eur(l.catalogue)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>{dv.lot ? "lot" : eur(l.propose)}</td>
                        <td style={{ padding: "8px", textAlign: "right", color: !dv.lot && (l.remise || 0) > 1000 ? "#c0392b" : undefined, fontWeight: !dv.lot && (l.remise || 0) > 1000 ? 700 : 400 }}>{dv.lot ? "—" : eur(l.remise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, fontSize: 15 }}>
                <span>Total catalogue</span><span style={{ textAlign: "right" }}>{eur(dv.total_catalogue)} HT</span>
                <b>Total proposé{dv.lot ? ` (lot de ${dv.lignes.length})` : ""}</b><b style={{ textAlign: "right" }}>{eur(dv.total_ht)} HT</b>
                <b style={{ color: "#c0392b" }}>Remise totale</b><b style={{ textAlign: "right", color: "#c0392b" }}>{eur(dv.remise_totale)}</b>
              </div>
              {dv.motifs.length > 0 && <div style={{ marginTop: 10, fontSize: 13, color: "#7a4b00" }}>🔒 {dv.motifs.join(" ; ")}</div>}
              <div style={{ marginTop: 10, fontSize: 13, color: "#555" }}>
                Acompte : {dv.acompte_pct ? `${dv.acompte_pct} %` : "financement bancaire"} · Après validation : {dv.envoi_prevu === "email" ? "envoi automatique au client par email" : dv.envoi_prevu === "signature" ? "envoi automatique pour signature DocuSign" : "le commercial récupère le PDF"}
              </div>
              {dv.pdf_url && <div style={{ marginTop: 10 }}><a href={dv.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>📄 Voir le devis (PDF)</a></div>}
            </div>
            {enAttente && (
              <div style={carte}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Commentaire pour le commercial (facultatif)
                  <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} style={{ width: "100%", boxSizing: "border-box", marginTop: 4, padding: 10, borderRadius: 6, border: "1px solid #c8cdd8", fontFamily: "inherit", fontSize: 15 }} />
                </label>
                {erreur && <div style={{ color: "#c0392b", fontWeight: 600, marginTop: 8 }}>⚠ {erreur}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <button onClick={() => decider("valider")} disabled={!!envoi} style={{ flex: "1 1 200px", padding: "14px", fontSize: 16, fontWeight: 700, border: "none", borderRadius: 8, background: "#1e8e3e", color: "white", cursor: "pointer" }}>
                    {envoi === "valider" ? "⏳ …" : "✅ Valider la remise"}
                  </button>
                  <button onClick={() => decider("refuser")} disabled={!!envoi} style={{ flex: "1 1 200px", padding: "14px", fontSize: 16, fontWeight: 700, border: "2px solid #c0392b", borderRadius: 8, background: "white", color: "#c0392b", cursor: "pointer" }}>
                    {envoi === "refuser" ? "⏳ …" : "❌ Refuser"}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "#888", marginBottom: 0 }}>Lien personnel de {dv.valideur}. Le commercial est prévenu par email de votre décision.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
