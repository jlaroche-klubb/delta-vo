import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import SignaturePad, { type SignaturePadHandle } from "../components/SignaturePad";
import { lireOffrePublique, signerOffrePublique, type OffrePublique } from "../services/offresLldService";

/**
 * ✍️ Page PUBLIQUE de signature d'une OFFRE LLD : /offre-lld/{numero}/{jeton}.
 * Lien personnel envoyé par Jonathan, sans compte. Le client relit l'offre,
 * choisit sa durée (et l'assurance, les options), coche « Bon pour accord »
 * et signe au doigt. Le PDF signé (certificat) lui est envoyé par email.
 */
const BLEU = "#1f4282";
const VERT = "#1e8e3e";
const eur = (n?: number) => (Number(n) || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const dateFr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export default function SignerOffrePage() {
  const { numero = "", jeton = "" } = useParams<{ numero: string; jeton: string }>();
  const [etat, setEtat] = useState<"charge" | "invalide" | "ok">("charge");
  const [o, setO] = useState<OffrePublique | null>(null);
  const [duree, setDuree] = useState<number | null>(null);
  const [assurance, setAssurance] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");
  const [email, setEmail] = useState("");
  const [accepte, setAccepte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const pad = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    document.title = "Delta Services — proposition commerciale";
    lireOffrePublique(numero, jeton).then((d) => {
      setO(d); setNom(d.client.contact_nom || ""); setEtat("ok");
      if (d.durees.length === 1) setDuree(d.durees[0].mois);
      setOptions(d.options.map((x) => x.libelle)); // options proposées cochées par défaut, décochables
    }).catch(() => setEtat("invalide"));
  }, [numero, jeton]);

  const dureeChoisie = o?.durees.find((d) => d.mois === duree) || null;
  const loyer = dureeChoisie ? (assurance && dureeChoisie.loyer_assurance_ht ? dureeChoisie.loyer_assurance_ht : dureeChoisie.loyer_ht) : 0;
  const optionsTotal = (o?.options || []).filter((x) => options.includes(x.libelle)).reduce((s, x) => s + x.prix_mensuel_ht, 0);
  const totalMensuel = loyer + optionsTotal;
  const caution = totalMensuel * 1.2 * (o?.caution_mois || 1);

  async function signer() {
    setErreur("");
    if (!duree) return setErreur("Choisissez la durée de location.");
    if (nom.trim().length < 3) return setErreur("Indiquez votre nom et prénom.");
    if (!accepte) return setErreur("Cochez la case « Bon pour accord ».");
    const sig = pad.current?.png() || "";
    if (!sig) return setErreur("Signez dans le cadre.");
    setEnvoi(true);
    try {
      const d = await signerOffrePublique(numero, jeton, { nom: nom.trim(), fonction: fonction.trim(), email: email.trim(), accepte: true, signature: sig, duree_mois: duree, avec_assurance: assurance, options });
      setO(d); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      if (e?.details?.offre) setO(e.details.offre);
      else setErreur("La signature n'a pas pu être enregistrée. Réessayez ou contactez votre interlocuteur.");
    } finally { setEnvoi(false); }
  }

  const carte: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", padding: "20px 22px", marginBottom: 16 };
  const champ: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 6, border: "1px solid #c8cdd8", fontSize: 16, fontFamily: "inherit" };
  const choix = (on: boolean): React.CSSProperties => ({ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 8, cursor: "pointer", border: `2px solid ${on ? BLEU : "#dde2ea"}`, background: on ? "#eef3fb" : "white", fontSize: 15, minHeight: 44 });

  return (
    <div style={{ minHeight: "100vh", background: "#f2f4f8", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1f2733" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <img src={DELTA_LOGO_BASE64} alt="Delta Services" style={{ height: 40 }} />
          {o && <span style={{ fontWeight: 700, color: BLEU }}>Proposition {o.numero}</span>}
        </div>
        {etat === "charge" && <div style={carte}>Chargement de la proposition…</div>}
        {etat === "invalide" && <div style={carte}><h2 style={{ marginTop: 0, color: "#c0392b" }}>Ce lien n'est pas valide.</h2><p>Vérifiez que vous avez ouvert le lien complet, ou contactez votre interlocuteur Delta Services.</p></div>}
        {etat === "ok" && o && (
          <>
            {o.statut === "signee" && (
              <div style={{ ...carte, borderLeft: `5px solid ${VERT}` }}>
                <h2 style={{ marginTop: 0, color: VERT }}>✅ Proposition signée — merci !</h2>
                <p>Votre accord a bien été enregistré{o.choix ? ` : ${o.choix.duree_mois} mois, ${eur(o.choix.total_mensuel_ht)} HT / mois${o.choix.avec_assurance ? ", avec assurance" : ""}` : ""}. Le document signé vous a été envoyé par email ; votre interlocuteur vous recontacte pour le contrat.</p>
                {o.signataire && <p style={{ color: "#555" }}>Signé par {o.signataire} le {dateFr(o.signe_le)}</p>}
                {o.pdf_url && <a href={o.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>📄 Télécharger la proposition signée (PDF)</a>}
              </div>
            )}
            {(o.statut === "expiree" || o.statut === "annulee") && (
              <div style={{ ...carte, borderLeft: "5px solid #c0392b" }}>
                <h2 style={{ marginTop: 0, color: "#c0392b" }}>{o.statut === "expiree" ? "Cette proposition a expiré" : "Cette proposition n'est plus valable"}</h2>
                <p>Contactez votre interlocuteur pour recevoir une proposition à jour.</p>
              </div>
            )}

            <div style={carte}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{o.client.raison_sociale}</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Location longue durée · valable jusqu'au {dateFr(o.date_expiration)}</div>
              <div style={{ background: "#f5f8fe", borderRadius: 8, padding: "12px 14px", fontSize: 15 }}>
                <b>{o.modele}</b> — {o.materiel === "neuf" ? "nacelle neuve Klubb" : "nacelle d'occasion"}{o.quantite > 1 ? ` × ${o.quantite}` : ""} · {o.full_services ? "Full services" : "Sans entretien"}
                <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>{o.km_an.toLocaleString("fr-FR")} km / an · heures nacelle {o.heures} · km supplémentaire {eur(o.prix_km_sup)} HT · transport {o.transport.mode === "chiffre" ? `${eur(o.transport.prix_ht)} HT (une fois)` : "offert"}{o.transport.adresse ? ` — livraison à ${o.transport.adresse}` : ""}</div>
              </div>
              {o.pdf_url && o.statut !== "signee" && <div style={{ marginTop: 12 }}><a href={o.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: BLEU, fontWeight: 600 }}>📄 Voir la proposition complète (PDF)</a></div>}
            </div>

            {o.statut === "a_signer" && (
              <>
                <div style={carte}>
                  <h2 style={{ marginTop: 0, fontSize: 19, color: BLEU }}>1. {o.durees.length > 1 ? "Choisissez votre durée" : "Durée de location"}</h2>
                  <div style={{ display: "grid", gap: 8 }}>
                    {o.durees.map((d) => (
                      <label key={d.mois} style={choix(duree === d.mois)}>
                        <input type="radio" name="duree" checked={duree === d.mois} onChange={() => setDuree(d.mois)} style={{ width: 20, height: 20 }} />
                        <span style={{ flex: 1 }}><b>{d.mois} mois</b>{o.courte_duree ? " (courte durée)" : ""}</span>
                        <span style={{ fontWeight: 700 }}>{eur(d.loyer_ht)} HT / mois</span>
                      </label>
                    ))}
                  </div>
                  {o.avec_assurance && (
                    <>
                      <h3 style={{ fontSize: 15, color: BLEU, margin: "16px 0 8px" }}>Assurance</h3>
                      <div style={{ display: "grid", gap: 8 }}>
                        <label style={choix(!assurance)}><input type="radio" name="assurance" checked={!assurance} onChange={() => setAssurance(false)} style={{ width: 20, height: 20 }} /><span style={{ flex: 1 }}>Sans assurance</span>{dureeChoisie && <span style={{ fontWeight: 700 }}>{eur(dureeChoisie.loyer_ht)} HT / mois</span>}</label>
                        <label style={choix(assurance)}><input type="radio" name="assurance" checked={assurance} disabled={!!dureeChoisie && !dureeChoisie.loyer_assurance_ht} onChange={() => setAssurance(true)} style={{ width: 20, height: 20 }} /><span style={{ flex: 1 }}>Avec assurance Delta Services</span>{dureeChoisie?.loyer_assurance_ht && <span style={{ fontWeight: 700 }}>{eur(dureeChoisie.loyer_assurance_ht)} HT / mois</span>}</label>
                      </div>
                    </>
                  )}
                  {o.options.length > 0 && (
                    <>
                      <h3 style={{ fontSize: 15, color: BLEU, margin: "16px 0 8px" }}>Options</h3>
                      <div style={{ display: "grid", gap: 8 }}>
                        {o.options.map((op) => {
                          const on = options.includes(op.libelle);
                          return <label key={op.libelle} style={choix(on)}><input type="checkbox" checked={on} onChange={(e) => setOptions(e.target.checked ? [...options, op.libelle] : options.filter((x) => x !== op.libelle))} style={{ width: 20, height: 20 }} /><span style={{ flex: 1 }}>{op.libelle}</span><span style={{ fontWeight: 700 }}>+ {eur(op.prix_mensuel_ht)} HT / mois</span></label>;
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ borderTop: `2px solid ${BLEU}`, marginTop: 16, paddingTop: 10, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, fontSize: 15 }}>
                    <b>Loyer mensuel retenu</b><b style={{ textAlign: "right" }}>{dureeChoisie ? `${eur(totalMensuel)} HT` : "—"}</b>
                    <span style={{ color: "#555" }}>soit {dureeChoisie ? eur(totalMensuel * 1.2) : "—"} TTC / mois{dureeChoisie ? ` pendant ${dureeChoisie.mois} mois` : ""}</span><span />
                    <span>Caution ({o.caution_mois} mois de loyer TTC, avant la mise à disposition)</span><span style={{ textAlign: "right" }}>{dureeChoisie ? eur(caution) : "—"}</span>
                    {o.transport.mode === "chiffre" && <><span>Transport (une fois)</span><span style={{ textAlign: "right" }}>{eur(o.transport.prix_ht)} HT</span></>}
                  </div>
                </div>

                <div style={carte}>
                  <h2 style={{ marginTop: 0, fontSize: 19, color: BLEU }}>2. Accepter et signer</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Nom et prénom du signataire *<input style={{ ...champ, marginTop: 4 }} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Fonction<input style={{ ...champ, marginTop: 4 }} value={fonction} onChange={(e) => setFonction(e.target.value)} autoComplete="organization-title" /></label>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Votre email (pour recevoir le PDF signé)<input style={{ ...champ, marginTop: 4 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                  </div>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginBottom: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
                    <span>J'ai lu la proposition commerciale et j'accepte la durée, le loyer et les conditions ci-dessus : « Bon pour accord ». *</span>
                  </label>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Signez dans le cadre ci-dessous (doigt ou souris) *</div>
                  <SignaturePad ref={pad} />
                  {erreur && <div style={{ color: "#c0392b", fontWeight: 600, marginTop: 12 }}>⚠ {erreur}</div>}
                  <button type="button" onClick={signer} disabled={envoi} style={{ marginTop: 16, width: "100%", padding: "14px 18px", fontSize: 17, fontWeight: 700, border: "none", borderRadius: 8, background: envoi ? "#7fb893" : VERT, color: "white", cursor: envoi ? "wait" : "pointer" }}>
                    {envoi ? "⏳ Signature en cours…" : "✍️ Signer la proposition"}
                  </button>
                  <p style={{ fontSize: 11.5, color: "#777", marginBottom: 0 }}>Signature électronique simple (règlement UE eIDAS) : votre nom, votre choix, la date, l'heure et l'adresse IP sont enregistrés dans un certificat joint au document signé.</p>
                </div>
              </>
            )}

            <div style={{ fontSize: 13, color: "#555", textAlign: "center" }}>
              Une question ? Votre interlocuteur : <b>{o.commercial.nom}</b>
              {o.commercial.tel ? <> · <a href={`tel:${o.commercial.tel.replace(/\s/g, "")}`}>{o.commercial.tel}</a></> : null}
              {o.commercial.email ? <> · <a href={`mailto:${o.commercial.email}`}>{o.commercial.email}</a></> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
