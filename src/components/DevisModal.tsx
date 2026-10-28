import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Machine } from "../types/machine";
import { referenceCommerciale } from "../utils/reference";
import {
  chargerConfigDevis,
  creerDevisVente,
  envoyerDevisVente,
  type AcompteDevis,
  type ClientDevis,
  type ConfigDevis,
  type DevisVente,
  type LigneDevis,
} from "../services/devisVenteService";
import { genererDevisPdf } from "../utils/generateDevisPdf";
import ChampSuggestions from "./ChampSuggestions";
import { cpValide, emailValide, rechercherAdresses, rechercherEntreprises, sirenValide, telValide, type AdresseFR, type EntrepriseFR } from "../services/rechercheFrance";
import { LANGUES_DEVIS, TEXTES_DEVIS, langueDevis, nombreDevis, type LangueDevis } from "../utils/devisLangues";

/**
 * 🧾 Création d'un DEVIS DE VENTE dans Delta VO (remplace l'offre HubSpot,
 * décision Jonathan 28/10/2026). Client, nacelles et prix, TVA, acompte
 * (30 % / 100 % / 0 % financement), conditions → PDF + envoi par email.
 * Règle direction : jamais d'immatriculation sur le devis (référence DS/KF).
 */
interface Props {
  machines: Machine[];
  prixDealer: boolean; // dealer : prix dealer par défaut
  onClose: () => void;
  /** Appelé une fois le devis créé (machines à marquer « offre en cours ») */
  onCree: (r: { numero: string; client: string; montants: Record<string, number>; pdfUrl?: string }) => Promise<void> | void;
}

const CHAMP: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, fontFamily: "inherit" };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 4 };
const eur = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €";

function designation(m: Machine, lg: LangueDevis): string {
  const T = TEXTES_DEVIS[lg];
  const an = (m.annee_circulation || "").match(/(19|20)\d{2}/)?.[0];
  const tete = [m.type_nacelle && `${T.nacelle} ${m.type_nacelle}`, m.modele_porteur && `${T.sur} ${m.modele_porteur}`, an && `(${an})`].filter(Boolean).join(" ");
  const details = [
    m.km_porteur ? `${nombreDevis(Number(m.km_porteur), lg)} km` : "",
    m.heures_nacelle ? `${nombreDevis(Number(m.heures_nacelle), lg)} h` : "",
  ].filter(Boolean);
  return [tete, ...details].filter(Boolean).join(" · ");
}

export default function DevisModal({ machines, prixDealer, onClose, onCree }: Props) {
  const { i18n } = useTranslation();
  const [langue, setLangue] = useState<LangueDevis>(() => langueDevis(i18n.language));
  const [cfg, setCfg] = useState<ConfigDevis | null>(null);
  const [client, setClient] = useState<ClientDevis>({ raison_sociale: "" });
  const [lignes, setLignes] = useState<LigneDevis[]>(() =>
    machines.map((m) => ({
      machine_id: m.id,
      immat: m.immat,
      reference: referenceCommerciale(m),
      designation: designation(m, langue),
      prix_ht: (prixDealer ? m.prix_dealer ?? m.prix_fr : m.prix_fr ?? m.prix_dealer) ?? 0,
    }))
  );
  const [tva, setTva] = useState<20 | 0>(() => (langue === "fr" ? 20 : 0));
  const [tente, setTente] = useState(false); // a cliqué sur Créer : champs manquants en rouge
  const [exoneration, setExoneration] = useState(() => TEXTES_DEVIS[langue].exonerationDefaut);
  const [acompte, setAcompte] = useState<AcompteDevis>(30);
  const [validite, setValidite] = useState(30);
  const [conditions, setConditions] = useState("");
  const [enCours, setEnCours] = useState<"" | "pdf" | "email">("");
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    chargerConfigDevis().then((c) => {
      setCfg(c);
      setConditions(conditionsPour(c, langue));
      setValidite(c.validite_jours || 30);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Conditions pré-remplies dans la langue du devis (Admin → Paramètres des devis, sinon texte par défaut traduit) */
  function conditionsPour(c: ConfigDevis, lg: LangueDevis): string {
    const v = lg === "fr" ? c.conditions_defaut : lg === "en" ? c.conditions_defaut_en : c.conditions_defaut_es;
    return (v || "").trim() || TEXTES_DEVIS[lg].conditionsDefaut;
  }

  /** Changement de langue : désignations, mention d'exonération et conditions retraduites */
  function changerLangue(lg: LangueDevis) {
    if (lg === langue) return;
    setLangue(lg);
    const parId = new Map(machines.map((m) => [m.id, m]));
    setLignes((ls) => ls.map((l) => { const m = parId.get(l.machine_id); return m ? { ...l, designation: designation(m, lg) } : l; }));
    setExoneration(TEXTES_DEVIS[lg].exonerationDefaut);
    if (cfg) setConditions(conditionsPour(cfg, lg));
    setTva(lg === "fr" ? 20 : 0); // devis anglais / espagnol : client étranger par défaut (modifiable)
  }

  // 🇫🇷 Client en France (TVA 20 %) : toutes les coordonnées sont obligatoires
  const france = tva === 20;
  const manquants: Partial<Record<keyof ClientDevis, string>> = {};
  if (!client.raison_sociale.trim()) manquants.raison_sociale = "la raison sociale";
  if (france) {
    if (!sirenValide(client.siren)) manquants.siren = "le SIREN (9 chiffres)";
    if (!(client.adresse || "").trim()) manquants.adresse = "l'adresse";
    if (!cpValide(client.cp)) manquants.cp = "le code postal (5 chiffres)";
    if (!(client.ville || "").trim()) manquants.ville = "la ville";
    if (!(client.contact_nom || "").trim()) manquants.contact_nom = "le nom du contact";
    if (!emailValide(client.contact_email)) manquants.contact_email = "l'email du contact";
    if (!telValide(client.contact_tel)) manquants.contact_tel = "le téléphone";
  }
  const rouge = (k: keyof ClientDevis): React.CSSProperties => (tente && manquants[k] ? { border: "1px solid #c0392b", background: "#fff6f5" } : {});
  const etoile = (k: keyof ClientDevis) => (k === "raison_sociale" || france ? " *" : "");

  function choisirEntreprise(e: EntrepriseFR) {
    setClient((c) => ({ ...c, raison_sociale: e.raison_sociale, siren: e.siren, tva_intra: e.tva_intra || "", adresse: e.adresse || c.adresse, cp: e.cp || c.cp, ville: e.ville || c.ville }));
  }
  function choisirAdresse(a: AdresseFR) {
    setClient((c) => ({ ...c, adresse: a.adresse, cp: a.cp, ville: a.ville }));
  }

  const totalHt = useMemo(() => lignes.reduce((s, l) => s + (Number(l.prix_ht) || 0), 0), [lignes]);
  const totalTtc = totalHt * (1 + tva / 100);
  const setC = (k: keyof ClientDevis, v: string) => setClient((c) => ({ ...c, [k]: v }));
  const setL = (i: number, k: keyof LigneDevis, v: any) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function valider(mode: "pdf" | "email") {
    setErreur("");
    setTente(true);
    if (Object.keys(manquants).length) return; // message affiché en direct sous le formulaire
    if (mode === "email" && !emailValide(client.contact_email)) return setErreur("Indiquez l'email du contact pour l'envoi.");
    if (lignes.some((l) => !(Number(l.prix_ht) > 0))) return setErreur("Chaque nacelle doit avoir un prix HT.");
    if (!cfg) return;
    setEnCours(mode);
    try {
      const r = await creerDevisVente({ client, lignes, tva_taux: tva, exoneration: tva === 0 ? exoneration : "", acompte_pct: acompte, validite_jours: validite, conditions, langue });
      const now = new Date();
      const dv: DevisVente = {
        numero: r.numero,
        date: now.toISOString(),
        date_expiration: new Date(now.getTime() + validite * 86400000).toISOString().slice(0, 10),
        client, lignes, tva_taux: tva, exoneration: tva === 0 ? exoneration : "",
        total_ht: r.total_ht, tva: r.tva, total_ttc: r.total_ttc,
        acompte_pct: acompte, acompte_ttc: Math.round(r.total_ttc * acompte) / 100,
        conditions, commercial: r.commercial, langue,
      };
      const pdf = genererDevisPdf(dv, cfg);
      const env = await envoyerDevisVente(r.numero, pdf.base64, mode === "email");
      if (mode === "pdf") {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pdf.blob);
        a.download = pdf.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      await onCree({
        numero: r.numero,
        client: client.raison_sociale.trim(),
        montants: Object.fromEntries(lignes.map((l) => [l.machine_id, Number(l.prix_ht) || 0])),
        pdfUrl: env.pdf_url,
      });
      alert(mode === "email" ? `✅ Devis ${r.numero} envoyé à ${env.to} (copie à vous-même).` : `✅ Devis ${r.numero} créé et téléchargé.`);
      onClose();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de la création du devis");
    } finally {
      setEnCours("");
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: "95%", maxHeight: "92vh", background: "white", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>🧾 Nouveau devis de vente</h2>
          <button onClick={onClose} disabled={!!enCours} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {!cfg ? <div>Chargement…</div> : (
            <>
              {/* Langue du devis */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <span style={{ fontWeight: 700, color: "#1a2a6e" }}>Langue du devis</span>
                {LANGUES_DEVIS.map((l) => (
                  <button key={l.code} type="button" onClick={() => changerLangue(l.code)}
                    style={{ padding: "6px 12px", borderRadius: 16, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `2px solid ${langue === l.code ? "#1a73e8" : "#ddd"}`, background: langue === l.code ? "#eef4fd" : "white", color: langue === l.code ? "#1a73e8" : "#444" }}>
                    {l.libelle}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: "#888" }}>PDF et email au client dans cette langue</span>
              </div>

              {/* Client */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "#1a2a6e" }}>Client</span>
                <span style={{ fontSize: 11, color: "#888" }}>
                  {france
                    ? "🇫🇷 Client en France : tapez le nom ou le SIREN et choisissez l'entreprise (annuaire officiel) — tous les champs sont obligatoires"
                    : "Client étranger (TVA exonérée) : seule la raison sociale est obligatoire"}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={LABEL}>Raison sociale{etoile("raison_sociale")}</label>
                  <ChampSuggestions<EntrepriseFR>
                    style={{ ...CHAMP, ...rouge("raison_sociale") }} autoFocus actif={france}
                    value={client.raison_sociale} onChange={(v) => setC("raison_sociale", v)}
                    chercher={rechercherEntreprises} onChoix={choisirEntreprise}
                    placeholder={france ? "Nom de l'entreprise ou SIREN…" : ""}
                    rendu={(e) => (
                      <>
                        <b>{e.raison_sociale}</b>{e.fermee && <span style={{ color: "#c0392b" }}> · fermée</span>}
                        <div style={{ fontSize: 11, color: "#666" }}>SIREN {e.siren} · {[e.adresse, e.cp, e.ville].filter(Boolean).join(" ")}</div>
                      </>
                    )}
                  />
                </div>
                <div>
                  <label style={LABEL}>SIREN{etoile("siren")}</label>
                  <ChampSuggestions<EntrepriseFR>
                    style={{ ...CHAMP, ...rouge("siren") }} actif={france}
                    value={client.siren || ""} onChange={(v) => setClient((c) => ({ ...c, siren: v, tva_intra: "" }))}
                    chercher={(q) => (sirenValide(q) ? rechercherEntreprises(q) : Promise.resolve([]))} onChoix={choisirEntreprise}
                    rendu={(e) => (<><b>{e.raison_sociale}</b><div style={{ fontSize: 11, color: "#666" }}>{[e.cp, e.ville].filter(Boolean).join(" ")}</div></>)}
                  />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={LABEL}>Adresse{etoile("adresse")}</label>
                  <ChampSuggestions<AdresseFR>
                    style={{ ...CHAMP, ...rouge("adresse") }} actif={france}
                    value={client.adresse || ""} onChange={(v) => setC("adresse", v)}
                    chercher={rechercherAdresses} onChoix={choisirAdresse}
                    placeholder={france ? "Tapez l'adresse…" : ""}
                    rendu={(a) => a.label}
                  />
                </div>
                <div><label style={LABEL}>Code postal{etoile("cp")}</label><input style={{ ...CHAMP, ...rouge("cp") }} value={client.cp || ""} onChange={(e) => setC("cp", e.target.value)} /></div>
                <div><label style={LABEL}>Ville{etoile("ville")}</label><input style={{ ...CHAMP, ...rouge("ville") }} value={client.ville || ""} onChange={(e) => setC("ville", e.target.value)} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 10, marginBottom: 18 }}>
                <div><label style={LABEL}>Contact{etoile("contact_nom")}</label><input style={{ ...CHAMP, ...rouge("contact_nom") }} value={client.contact_nom || ""} onChange={(e) => setC("contact_nom", e.target.value)} placeholder="Prénom Nom" /></div>
                <div><label style={LABEL}>Email du contact{etoile("contact_email")}</label><input style={{ ...CHAMP, ...rouge("contact_email") }} type="email" value={client.contact_email || ""} onChange={(e) => setC("contact_email", e.target.value)} /></div>
                <div><label style={LABEL}>Téléphone{etoile("contact_tel")}</label><input style={{ ...CHAMP, ...rouge("contact_tel") }} value={client.contact_tel || ""} onChange={(e) => setC("contact_tel", e.target.value)} /></div>
              </div>

              {/* Nacelles */}
              <div style={{ fontWeight: 700, color: "#1a2a6e", marginBottom: 8 }}>Nacelles ({lignes.length})</div>
              <div style={{ border: "1px solid #eee", borderRadius: 6, marginBottom: 8 }}>
                {lignes.map((l, i) => (
                  <div key={l.machine_id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: i < lignes.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }} title={l.immat}>{l.reference}</div>
                    <input style={{ ...CHAMP, fontSize: 13 }} value={l.designation} onChange={(e) => setL(i, "designation", e.target.value)} />
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input style={{ ...CHAMP, textAlign: "right" }} value={l.prix_ht || ""} onChange={(e) => setL(i, "prix_ht", Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0)} />
                      <span style={{ fontSize: 12, color: "#666" }}>HT</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 18 }}>Référence commerciale uniquement : l'immatriculation n'apparaît pas sur le devis.</div>

              {/* TVA + validité */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={LABEL}>TVA</label>
                  <select style={CHAMP} value={tva} onChange={(e) => setTva(Number(e.target.value) as 20 | 0)}>
                    <option value={20}>20 % (France)</option>
                    <option value={0}>Exonéré (export / intracommunautaire)</option>
                  </select>
                </div>
                <div><label style={LABEL}>Validité (jours)</label><input style={CHAMP} type="number" min={1} max={180} value={validite} onChange={(e) => setValidite(Number(e.target.value) || 30)} /></div>
              </div>
              {tva === 0 && (
                <div style={{ marginBottom: 10 }}><label style={LABEL}>Mention d'exonération (imprimée sur le devis)</label><input style={CHAMP} value={exoneration} onChange={(e) => setExoneration(e.target.value)} /></div>
              )}

              {/* Acompte */}
              <label style={{ ...LABEL, marginTop: 8 }}>Acompte à la commande</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {([30, 100, 0] as AcompteDevis[]).map((v) => (
                  <label key={v} style={{ flex: "1 1 150px", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 6, cursor: "pointer", border: `2px solid ${acompte === v ? "#1a73e8" : "#ddd"}`, background: acompte === v ? "#eef4fd" : "white", fontSize: 14 }}>
                    <input type="radio" name="acompte" checked={acompte === v} onChange={() => setAcompte(v)} style={{ width: "auto", margin: 0 }} />
                    <span><strong>{v} %</strong><span style={{ display: "block", fontSize: 12, color: "#666" }}>{v === 30 ? "Standard" : v === 100 ? "Paiement intégral" : "Financement bancaire"}</span></span>
                  </label>
                ))}
              </div>

              <label style={LABEL}>Conditions (imprimées sur le devis)</label>
              <textarea style={{ ...CHAMP, resize: "vertical" }} rows={4} value={conditions} onChange={(e) => setConditions(e.target.value)} />

              {/* Récap */}
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#f8f9fa", borderRadius: 6, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 14 }}>
                <span>Total : <b>{eur(totalHt)} HT</b>{tva ? <> · {eur(totalTtc)} TTC</> : null}</span>
                <span>{acompte ? <>Acompte {acompte} % : <b>{eur((totalTtc * acompte) / 100)} TTC</b></> : "Sans acompte (financement)"}</span>
              </div>
              {!cfg.iban && acompte > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#8a5a00" }}>⚠ IBAN non renseigné (Admin → Paramètres des devis) : il n'apparaîtra pas sur le devis.</div>
              )}
              {tente && Object.keys(manquants).length > 0 && (
                <div style={{ marginTop: 10, color: "#c0392b", fontWeight: 600 }}>⚠ {france ? "Client en France : " : ""}indiquez {Object.values(manquants).join(", ")}.</div>
              )}
              {erreur && <div style={{ marginTop: 10, color: "#c0392b", fontWeight: 600 }}>⚠ {erreur}</div>}
            </>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: "1px solid #eee", background: "#fafafa", flexWrap: "wrap" }}>
          <button onClick={onClose} disabled={!!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>Annuler</button>
          <button onClick={() => valider("pdf")} disabled={!cfg || !!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #1a73e8", background: "white", color: "#1a73e8", fontWeight: 600, cursor: "pointer" }}>
            {enCours === "pdf" ? "⏳ …" : "⬇ Créer et télécharger"}
          </button>
          <button onClick={() => valider("email")} disabled={!cfg || !!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 600, cursor: "pointer" }}>
            {enCours === "email" ? "⏳ Envoi…" : "📧 Créer et envoyer au client"}
          </button>
        </div>
      </div>
    </div>
  );
}
