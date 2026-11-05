import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";
import SignaturePad, { type SignaturePadHandle } from "../components/SignaturePad";
import { lireOffrePublique, signerOffrePublique, type ContactFiche, type FicheOffre, type OffrePublique } from "../services/offresLldService";
import { rechercherEntreprises } from "../services/rechercheFrance";

/**
 * ✍️ Page PUBLIQUE de signature d'une OFFRE LLD : /offre-lld/{numero}/{jeton}.
 * Lien personnel envoyé par Jonathan, sans compte. Le client relit l'offre,
 * choisit sa durée (et l'assurance, les options), donne les coordonnées de
 * sa société pour le contrat (SIRET → annuaire des entreprises), coche
 * « Bon pour accord » et signe au doigt. Le PDF signé lui est envoyé par email.
 */
const emailOk = (e: string) => !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const telOk = (t: string) => !t || t.replace(/\D/g, "").length >= 9;
const siretOk = (s: string) => s.replace(/\D/g, "").length === 14;
const ct = (c?: ContactFiche | null): ContactFiche => ({ nom: c?.nom || "", fonction: c?.fonction || "", email: c?.email || "", tel: c?.tel || "" });
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
  const [tel, setTel] = useState("");
  const [fiche, setFiche] = useState<FicheOffre | null>(null);
  const [compta, setCompta] = useState<ContactFiche>(ct());
  const [maint, setMaint] = useState<ContactFiche>(ct());
  const [cmd, setCmd] = useState<ContactFiche>(ct());
  const [cmdOblig, setCmdOblig] = useState<boolean | null>(null);
  const [rechSiret, setRechSiret] = useState<"" | "cours" | "ok" | "aucun">("");
  const [plus, setPlus] = useState(false);
  const [accepte, setAccepte] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [details, setDetails] = useState<string[]>([]);
  const pad = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    document.title = "Delta Services — proposition commerciale";
    lireOffrePublique(numero, jeton).then(({ offre: d, fiche: f }) => {
      setO(d); setEtat("ok");
      if (d.durees.length === 1) setDuree(d.durees[0].mois);
      setOptions(d.options.map((x) => x.libelle)); // options proposées cochées par défaut, décochables
      setFiche(f); setNom(f.signataire.nom || d.client.contact_nom || ""); setFonction(f.signataire.fonction || ""); setEmail(f.signataire.email || ""); setTel(f.signataire.tel || "");
      setCompta(ct(f.contact_compta)); setMaint(ct(f.contact_maintenance)); setCmd(ct(f.contact_commande)); setCmdOblig(f.commande_obligatoire);
      setPlus(!!(f.contact_compta?.nom || f.contact_maintenance?.nom || f.commande_obligatoire));
    }).catch(() => setEtat("invalide"));
  }, [numero, jeton]);

  const dureeChoisie = o?.durees.find((d) => d.mois === duree) || null;
  const loyer = dureeChoisie ? (assurance && dureeChoisie.loyer_assurance_ht ? dureeChoisie.loyer_assurance_ht : dureeChoisie.loyer_ht) : 0;
  const optionsTotal = (o?.options || []).filter((x) => options.includes(x.libelle)).reduce((s, x) => s + x.prix_mensuel_ht, 0);
  const totalMensuel = loyer + optionsTotal;
  const caution = totalMensuel * 1.2 * (o?.caution_mois || 1);
  const setF = <K extends keyof FicheOffre>(k: K, v: FicheOffre[K]) => setFiche((f) => (f ? { ...f, [k]: v } : f));

  /** SIRET saisi → annuaire des entreprises : raison sociale, adresse, TVA, NAF */
  async function chercherSiret(siret: string) {
    const s = siret.replace(/\D/g, "");
    if (s.length !== 14) return;
    setRechSiret("cours");
    try {
      const l = await rechercherEntreprises(s.slice(0, 9));
      const e = l.find((x) => x.siren === s.slice(0, 9)) || l[0];
      if (!e) { setRechSiret("aucun"); return; }
      setFiche((f) => f ? { ...f, raison_sociale: f.raison_sociale || e.raison_sociale, adresse: f.adresse || e.adresse || "", cp: f.cp || e.cp || "", ville: f.ville || e.ville || "", tva_intra: f.tva_intra || e.tva_intra || "", naf: f.naf || e.naf || "", forme_juridique: f.forme_juridique || e.forme_juridique || "" } : f);
      setRechSiret("ok");
    } catch { setRechSiret("aucun"); }
  }
  const manquesFiche = useMemo(() => {
    const e: string[] = [];
    if (!fiche) return e;
    if (fiche.raison_sociale.trim().length < 2) e.push("Raison sociale");
    if (!siretOk(fiche.siret)) e.push("SIRET (14 chiffres)");
    if (!fiche.adresse.trim() || !fiche.cp.trim() || !fiche.ville.trim()) e.push("Adresse complète");
    if (!fiche.telephone.trim() || !telOk(fiche.telephone)) e.push("Téléphone de la société");
    if (!fiche.email.trim() || !emailOk(fiche.email)) e.push("Email de la société");
    for (const [lib, c] of [["Contact comptabilité", compta], ["Contact maintenance", maint], ["Contact n° de commande", cmd]] as const) if (!emailOk(c.email) || !telOk(c.tel)) e.push(`${lib} : email ou téléphone invalide`);
    return e;
  }, [fiche, compta, maint, cmd]);

  async function signer() {
    setErreur(""); setDetails([]);
    if (!duree) return setErreur("Choisissez la durée de location.");
    if (!fiche) return;
    if (manquesFiche.length) { setDetails(manquesFiche); return setErreur("Complétez les coordonnées de votre société :"); }
    if (nom.trim().length < 3) return setErreur("Indiquez votre nom et prénom.");
    if (!accepte) return setErreur("Cochez la case « Bon pour accord ».");
    const sig = pad.current?.png() || "";
    if (!sig) return setErreur("Signez dans le cadre.");
    setEnvoi(true);
    try {
      const { signataire: _s, deja_complete: _d, siren: _n, ...reste } = fiche;
      const d = await signerOffrePublique(numero, jeton, { nom: nom.trim(), fonction: fonction.trim(), email: email.trim(), tel: tel.trim(), accepte: true, signature: sig, duree_mois: duree, avec_assurance: assurance, options,
        fiche: { ...reste, siret: fiche.siret.replace(/\D/g, ""), contact_compta: compta, contact_maintenance: maint, commande_obligatoire: cmdOblig === true, contact_commande: cmd } });
      setO(d); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      if (e?.details?.offre) setO(e.details.offre);
      else if (e?.details?.details?.length) { setDetails(e.details.details); setErreur("Points à corriger :"); }
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

                {fiche && (
                  <div style={carte}>
                    <h2 style={{ marginTop: 0, fontSize: 19, color: BLEU }}>2. Votre société <span style={{ fontSize: 13, color: "#666", fontWeight: 400 }}>— pour établir le contrat{fiche.deja_complete ? " (préremplie, vérifiez)" : ""}</span></h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>SIRET (14 chiffres) *
                        <input style={{ ...champ, marginTop: 4, ...(fiche.siret && !siretOk(fiche.siret) ? { border: "1px solid #c0392b" } : {}) }} inputMode="numeric" value={fiche.siret} onChange={(e) => { setF("siret", e.target.value); setRechSiret(""); if (e.target.value.replace(/\D/g, "").length === 14) chercherSiret(e.target.value); }} placeholder="123 456 789 00012" />
                        <span style={{ fontSize: 11.5, fontWeight: 400, color: rechSiret === "ok" ? VERT : "#777" }}>{rechSiret === "cours" ? "Recherche dans l'annuaire des entreprises…" : rechSiret === "ok" ? "✓ Coordonnées trouvées dans l'annuaire, vérifiez-les" : rechSiret === "aucun" ? "Non trouvé dans l'annuaire : complétez à la main" : "L'adresse et la TVA se remplissent automatiquement"}</span>
                      </label>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Raison sociale *<input style={{ ...champ, marginTop: 4 }} value={fiche.raison_sociale} onChange={(e) => setF("raison_sociale", e.target.value)} autoComplete="organization" /></label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr", gap: 12, marginTop: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Adresse *<input style={{ ...champ, marginTop: 4 }} value={fiche.adresse} onChange={(e) => setF("adresse", e.target.value)} autoComplete="street-address" /></label>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Code postal *<input style={{ ...champ, marginTop: 4 }} value={fiche.cp} onChange={(e) => setF("cp", e.target.value)} autoComplete="postal-code" /></label>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Ville *<input style={{ ...champ, marginTop: 4 }} value={fiche.ville} onChange={(e) => setF("ville", e.target.value)} autoComplete="address-level2" /></label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Téléphone de la société *<input style={{ ...champ, marginTop: 4 }} type="tel" value={fiche.telephone} onChange={(e) => setF("telephone", e.target.value)} autoComplete="tel" /></label>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Email de la société *<input style={{ ...champ, marginTop: 4 }} type="email" value={fiche.email} onChange={(e) => setF("email", e.target.value)} autoComplete="email" /></label>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>N° TVA intracommunautaire<input style={{ ...champ, marginTop: 4 }} value={fiche.tva_intra} onChange={(e) => setF("tva_intra", e.target.value)} /></label>
                      <label style={{ fontSize: 13, fontWeight: 600 }}>Code NAF<input style={{ ...champ, marginTop: 4 }} value={fiche.naf} onChange={(e) => setF("naf", e.target.value)} /></label>
                    </div>
                    <button type="button" onClick={() => setPlus((v) => !v)} style={{ marginTop: 12, background: "none", border: "none", color: BLEU, fontWeight: 600, cursor: "pointer", padding: 0 }}>{plus ? "▲ Masquer" : "▼ Facturation, contacts comptabilité / maintenance, n° de commande"} <span style={{ fontWeight: 400, color: "#777" }}>(facultatif maintenant, demandé au contrat)</span></button>
                    {plus && (
                      <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                          <label style={{ fontSize: 13, fontWeight: 600 }}>Société de facturation (si différente)<input style={{ ...champ, marginTop: 4 }} value={fiche.facturation_societe} onChange={(e) => setF("facturation_societe", e.target.value)} /></label>
                          <label style={{ fontSize: 13, fontWeight: 600 }}>Email de facturation<input style={{ ...champ, marginTop: 4 }} type="email" value={fiche.facturation_email} onChange={(e) => setF("facturation_email", e.target.value)} /></label>
                          <label style={{ fontSize: 13, fontWeight: 600 }}>Adresse de facturation<input style={{ ...champ, marginTop: 4 }} value={fiche.facturation_adresse} onChange={(e) => setF("facturation_adresse", e.target.value)} /></label>
                        </div>
                        {([["Contact comptabilité fournisseur", compta, setCompta], ["Contact maintenance du véhicule (révisions, VGP, relevés km)", maint, setMaint]] as const).map(([lib, v, set]) => (
                          <div key={lib}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: BLEU, marginBottom: 4 }}>{lib}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                              <input style={champ} placeholder="Nom" value={v.nom} onChange={(e) => set({ ...v, nom: e.target.value })} />
                              <input style={champ} placeholder="Téléphone" type="tel" value={v.tel} onChange={(e) => set({ ...v, tel: e.target.value })} />
                              <input style={champ} placeholder="Email" type="email" value={v.email} onChange={(e) => set({ ...v, email: e.target.value })} />
                            </div>
                          </div>
                        ))}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: BLEU, marginBottom: 4 }}>Numéro de commande sur nos factures</div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <label style={choix(cmdOblig === true)}><input type="radio" name="cmd" checked={cmdOblig === true} onChange={() => setCmdOblig(true)} style={{ width: 18, height: 18 }} />Obligatoire</label>
                            <label style={choix(cmdOblig === false)}><input type="radio" name="cmd" checked={cmdOblig === false} onChange={() => setCmdOblig(false)} style={{ width: 18, height: 18 }} />Pas nécessaire</label>
                          </div>
                          {cmdOblig && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 8 }}>
                            <input style={champ} placeholder="Personne à contacter" value={cmd.nom} onChange={(e) => setCmd({ ...cmd, nom: e.target.value })} />
                            <input style={champ} placeholder="Téléphone" type="tel" value={cmd.tel} onChange={(e) => setCmd({ ...cmd, tel: e.target.value })} />
                            <input style={champ} placeholder="Email" type="email" value={cmd.email} onChange={(e) => setCmd({ ...cmd, email: e.target.value })} />
                          </div>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={carte}>
                  <h2 style={{ marginTop: 0, fontSize: 19, color: BLEU }}>3. Accepter et signer</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Nom et prénom du signataire *<input style={{ ...champ, marginTop: 4 }} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" /></label>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Fonction<input style={{ ...champ, marginTop: 4 }} value={fonction} onChange={(e) => setFonction(e.target.value)} autoComplete="organization-title" /></label>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Votre email (pour recevoir le PDF signé)<input style={{ ...champ, marginTop: 4 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Votre téléphone<input style={{ ...champ, marginTop: 4 }} type="tel" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" /></label>
                  </div>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginBottom: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
                    <span>J'ai lu la proposition commerciale et j'accepte la durée, le loyer et les conditions ci-dessus : « Bon pour accord ». *</span>
                  </label>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Signez dans le cadre ci-dessous (doigt ou souris) *</div>
                  <SignaturePad ref={pad} />
                  {erreur && <div style={{ color: "#c0392b", fontWeight: 600, marginTop: 12 }}>⚠ {erreur}{details.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 20, fontWeight: 400 }}>{details.map((d, i) => <li key={i}>{d}</li>)}</ul>}</div>}
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
