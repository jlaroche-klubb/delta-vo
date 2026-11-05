import { useEffect, useMemo, useState } from "react";
import type { ClientLLD, ClientLLDPrive, ContactLLD, TarifNegocieLLD } from "../../types/lld";
import {
  bicValide, chargerConfigLLD, clientDepuisEntreprise, clientLLDParSiren, creerClientLLD, ecouterClientsLLD, enregistrerBanqueLLD,
  ibanAffiche, ibanValide, lireBanqueLLD, modifierClientLLD, sirenNettoye, siretNettoye, siretValide,
} from "../../services/lldService";
import { cpValide, emailValide, rechercherAdresses, rechercherEntreprises, telValide, type AdresseFR, type EntrepriseFR } from "../../services/rechercheFrance";
import ChampSuggestions from "../ChampSuggestions";

/**
 * 👥 Mémoire client LLD (lot 1). Une fiche unique par client, créée par
 * recherche SIREN (annuaire officiel), réutilisée par les offres et contrats.
 * - Doublon : un SIREN déjà présent ouvre la fiche existante.
 * - 🔒 Banque (collection séparée) : Jonathan + assistantes seulement.
 * - Les corrections proposées par le client à la signature (lot 4) sont
 *   affichées « avant / après » et relues avant mise à jour.
 */
interface Props {
  userName: string;
  userEmail: string;
  peutModifier: boolean;
  voitBanque: boolean;
}

const CHAMP: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 6, border: "1px solid #ccd", fontSize: 14, fontFamily: "inherit" };
const LABEL: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#444", marginBottom: 4 };
const CARTE: React.CSSProperties = { background: "white", borderRadius: 10, boxShadow: "0 1px 3px rgba(20,30,60,.08)", padding: 16 };
const TITRE: React.CSSProperties = { fontWeight: 700, color: "#1a2a6e", fontSize: 15, margin: "0 0 10px" };
const BTN: React.CSSProperties = { padding: "9px 14px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const BTN2: React.CSSProperties = { ...BTN, background: "white", color: "#1a73e8", border: "1px solid #1a73e8" };
const eur = (n?: number) => (n || n === 0 ? n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €" : "—");

const CONTACT_VIDE: ContactLLD = { nom: "", fonction: "", email: "", tel: "" };

export default function ClientsLld({ userName, peutModifier, voitBanque }: Props) {
  const [clients, setClients] = useState<ClientLLD[]>([]);
  const [charge, setCharge] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [mode, setMode] = useState<"lecture" | "edition" | "creation">("lecture");
  const [modeles, setModeles] = useState<string[]>([]);

  useEffect(() => {
    const stop = ecouterClientsLLD((c) => { setClients(c); setCharge(false); });
    chargerConfigLLD().then((c) => setModeles(c.modeles));
    return stop;
  }, []);

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const qn = q.replace(/\D/g, "");
    return clients.filter((c) => !q || c.raison_sociale.toLowerCase().includes(q) || (qn.length >= 3 && (sirenNettoye(c.siren).includes(qn) || siretNettoye(c.siret).includes(qn))) || (c.ville || "").toLowerCase().includes(q));
  }, [clients, recherche]);
  const sel = clients.find((c) => c.id === selId) || null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
      {/* Liste */}
      <div style={{ ...CARTE, flex: "1 1 260px", minWidth: 0, padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        <input aria-label="Rechercher un client" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher : nom, SIREN, ville…" style={CHAMP} />
        {peutModifier && (
          <button type="button" style={BTN} onClick={() => { setSelId(null); setMode("creation"); }}>+ Nouveau client</button>
        )}
        <div style={{ fontSize: 12, color: "#777", margin: "4px 2px" }}>{charge ? "Chargement…" : `${liste.length} client${liste.length > 1 ? "s" : ""}`}</div>
        <div style={{ maxHeight: 560, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {liste.map((c) => (
            <button key={c.id} type="button" onClick={() => { setSelId(c.id); setMode("lecture"); }}
              style={{ textAlign: "left", padding: "9px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: c.id === selId ? "#eef3fb" : "transparent", fontSize: 14 }}>
              <div style={{ fontWeight: 700, display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{c.raison_sociale}</span>
                {c.sous_tarif && <span style={{ fontSize: 11, background: "#fff3d6", color: "#7a5400", borderRadius: 10, padding: "1px 7px", whiteSpace: "nowrap" }}>sous tarif</span>}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>{[c.ville, c.siren ? `SIREN ${c.siren}` : ""].filter(Boolean).join(" · ")}{(c.modifications_en_attente?.length || 0) > 0 ? " · ✏️ à relire" : ""}</div>
            </button>
          ))}
          {!charge && !liste.length && <div style={{ padding: 10, color: "#888", fontSize: 13 }}>Aucun client{recherche ? " ne correspond" : " pour l'instant"}.</div>}
        </div>
      </div>

      {/* Fiche */}
      <div style={{ flex: "999 1 560px", minWidth: 0 }}>
        {mode === "creation" && (
          <FicheClientForm client={null} modeles={modeles} userName={userName} voitBanque={voitBanque} clients={clients}
            onAnnuler={() => setMode("lecture")} onEnregistre={(id) => { setSelId(id); setMode("lecture"); }} onOuvrir={(id) => { setSelId(id); setMode("lecture"); }} />
        )}
        {mode === "edition" && sel && (
          <FicheClientForm client={sel} modeles={modeles} userName={userName} voitBanque={voitBanque} clients={clients}
            onAnnuler={() => setMode("lecture")} onEnregistre={() => setMode("lecture")} onOuvrir={(id) => { setSelId(id); setMode("lecture"); }} />
        )}
        {mode === "lecture" && !sel && (
          <div style={{ ...CARTE, color: "#666", fontSize: 14 }}>
            Choisissez un client dans la liste{peutModifier ? ", ou créez-en un : la recherche par nom ou SIREN remplit la fiche depuis l'annuaire officiel des entreprises" : ""}.
          </div>
        )}
        {mode === "lecture" && sel && (
          <FicheClientLecture client={sel} voitBanque={voitBanque} peutModifier={peutModifier} userName={userName} onModifier={() => setMode("edition")} />
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Lecture ─────────────────────────

function Bloc({ titre, children, large }: { titre: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.5, gridColumn: large ? "1 / -1" : undefined }}>
      <div style={{ fontWeight: 700, color: "#1a2a6e", marginBottom: 2 }}>{titre}</div>
      {children}
    </div>
  );
}
const contact = (c?: ContactLLD) => c && (c.nom || c.email || c.tel) ? [c.nom, c.fonction, c.email, c.tel].filter(Boolean).join(" · ") : "—";

function FicheClientLecture({ client: c, voitBanque, peutModifier, userName, onModifier }: { client: ClientLLD; voitBanque: boolean; peutModifier: boolean; userName: string; onModifier: () => void }) {
  const [banque, setBanque] = useState<ClientLLDPrive | null>(null);
  const [montrerIban, setMontrerIban] = useState(false);
  useEffect(() => { setBanque(null); setMontrerIban(false); if (voitBanque) lireBanqueLLD(c.id).then(setBanque); }, [c.id, voitBanque]);
  const modifs = c.modifications_en_attente || [];

  async function accepterModif(i: number) {
    const m = modifs[i];
    const reste = modifs.filter((_, j) => j !== i);
    await modifierClientLLD(c.id, { [m.champ]: m.apres, modifications_en_attente: reste } as any, userName);
  }
  async function refuserModif(i: number) {
    await modifierClientLLD(c.id, { modifications_en_attente: modifs.filter((_, j) => j !== i) }, userName);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {peutModifier && modifs.length > 0 && (
        <div style={{ background: "#fff8e6", border: "1px solid #f0d58a", borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontWeight: 700, color: "#6b4a00" }}>✏️ Modifications proposées par le client à la signature — à relire</div>
          {modifs.map((m, i) => (
            <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 14 }}>
              <div style={{ flex: "1 1 320px" }}>
                <b>{m.champ}</b>{m.contrat ? <span style={{ color: "#777" }}> (contrat {m.contrat})</span> : null}<br />
                <span style={{ color: "#777" }}>Avant :</span> {m.avant || "—"} → <span style={{ color: "#777" }}>Après :</span> <b>{m.apres || "—"}</b>
              </div>
              <button type="button" onClick={() => accepterModif(i)} style={{ ...BTN, background: "#1e7a3c" }}>Accepter</button>
              <button type="button" onClick={() => refuserModif(i)} style={{ ...BTN2, color: "#b3261e", borderColor: "#b3261e" }}>Refuser</button>
            </div>
          ))}
        </div>
      )}
      <div style={CARTE}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: "#1a2a6e" }}>{c.raison_sociale}{c.sous_tarif && <span style={{ marginLeft: 10, fontSize: 12, background: "#fff3d6", color: "#7a5400", borderRadius: 10, padding: "2px 8px", verticalAlign: "middle" }}>client sous tarif</span>}</h2>
            <div style={{ fontSize: 12, color: "#777" }}>{c.modifie_le ? `Modifié le ${new Date(c.modifie_le).toLocaleDateString("fr-FR")} par ${c.modifie_par || "?"}` : ""}</div>
          </div>
          {peutModifier && <button type="button" style={BTN2} onClick={onModifier}>✏️ Modifier</button>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          <Bloc titre="Entreprise">
            {[c.forme_juridique, c.capital ? `capital ${c.capital}` : "", c.rcs ? `RCS ${c.rcs}` : ""].filter(Boolean).join(" · ") || <span style={{ color: "#999" }}>forme juridique, capital, RCS : —</span>}<br />
            SIRET {c.siret || "—"} · SIREN {c.siren || "—"}<br />
            {[c.adresse, c.cp, c.ville].filter(Boolean).join(" ") || "—"}<br />
            NAF {c.naf || "—"} · TVA {c.tva_intra || "—"}<br />
            {[c.telephone ? `☎ ${c.telephone}` : "", c.fax ? `fax ${c.fax}` : "", c.email].filter(Boolean).join(" · ")}
          </Bloc>
          <Bloc titre="Facturation">
            {c.facturation_societe || c.facturation_email || c.facturation_adresse
              ? <>{c.facturation_societe || c.raison_sociale}<br />{c.facturation_email || "—"}<br />{c.facturation_adresse || "même adresse"}</>
              : <span style={{ color: "#999" }}>identique à l'entreprise</span>}
          </Bloc>
          <Bloc titre="Signataire">{contact(c.signataire)}</Bloc>
          <Bloc titre="Contact comptabilité fournisseur">{contact(c.contact_compta)}</Bloc>
          <Bloc titre="Contact maintenance véhicule">{contact(c.contact_maintenance)}</Bloc>
          <Bloc titre="N° de commande">{c.commande_obligatoire ? <>Obligatoire — à demander à : {contact(c.contact_commande)}</> : "Non obligatoire"}</Bloc>
          {voitBanque && (
            <Bloc titre="🔒 Banque (mandat SEPA)">
              {banque === null ? "…" : banque.iban || banque.bic || banque.rum ? (
                <>
                  {banque.titulaire || "—"}{banque.adresse_titulaire ? ` · ${banque.adresse_titulaire}` : ""}<br />
                  IBAN {montrerIban ? ibanAffiche(banque.iban) : `•••• ${ibanAffiche(banque.iban).slice(-4)}`}{" "}
                  <button type="button" onClick={() => setMontrerIban(!montrerIban)} style={{ border: "none", background: "transparent", color: "#1a73e8", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>{montrerIban ? "masquer" : "afficher"}</button><br />
                  BIC {banque.bic || "—"} · RUM {banque.rum || "— (généré au 1er mandat)"}
                </>
              ) : <span style={{ color: "#999" }}>aucune coordonnée bancaire</span>}
            </Bloc>
          )}
          {!voitBanque && <Bloc titre="🔒 Banque, CNI, RIB"><span style={{ color: "#777" }}>Réservé à Jonathan et aux assistantes.</span></Bloc>}
          <Bloc titre="Tarifs négociés" large>
            {c.tarifs_negocies?.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                  <thead><tr style={{ background: "#f5f8fe", textAlign: "left" }}>{["Modèle", "Durée", "Loyer HT / mois", "Formule", "Km / an", "Km sup.", "Caution TTC", "Options", "Fin"].map((h) => <th key={h} style={{ padding: "6px 8px" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {c.tarifs_negocies.map((t, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #eef0f5" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 700 }}>{t.modele}</td><td style={{ padding: "6px 8px" }}>{t.duree_mois} mois</td><td style={{ padding: "6px 8px" }}>{eur(t.loyer_ht)}</td>
                        <td style={{ padding: "6px 8px" }}>{t.full_services ? "Full services" : "Sans entretien"}</td><td style={{ padding: "6px 8px" }}>{t.km_an ? t.km_an.toLocaleString("fr-FR") : "—"}</td>
                        <td style={{ padding: "6px 8px" }}>{t.prix_km_sup ? `${t.prix_km_sup} €` : "—"}</td><td style={{ padding: "6px 8px" }}>{eur(t.caution_ttc)}</td><td style={{ padding: "6px 8px" }}>{t.options || "—"}</td><td style={{ padding: "6px 8px" }}>{t.fin ? t.fin.split("-").reverse().join("/") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <span style={{ color: "#999" }}>aucun — les offres utilisent la grille tarifaire standard</span>}
          </Bloc>
          {c.notes && <Bloc titre="Notes" large><span style={{ whiteSpace: "pre-line" }}>{c.notes}</span></Bloc>}
          <Bloc titre="Historique" large><span style={{ color: "#999" }}>Offres, contrats et nacelles louées apparaîtront ici (lots suivants).</span></Bloc>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Formulaire ─────────────────────────

function FicheClientForm({ client, modeles, userName, voitBanque, clients, onAnnuler, onEnregistre, onOuvrir }: {
  client: ClientLLD | null; modeles: string[]; userName: string; voitBanque: boolean; clients: ClientLLD[];
  onAnnuler: () => void; onEnregistre: (id: string) => void; onOuvrir: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<ClientLLD>>(() => client ? { ...client } : { raison_sociale: "", sous_tarif: false, tarifs_negocies: [] });
  const [banque, setBanque] = useState<ClientLLDPrive>({});
  const [banqueCharg, setBanqueCharg] = useState(false);
  const [tente, setTente] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [doublon, setDoublon] = useState<ClientLLD | null>(null);

  useEffect(() => {
    if (client && voitBanque) { setBanqueCharg(true); lireBanqueLLD(client.id).then((b) => { setBanque(b); setBanqueCharg(false); }); }
  }, [client, voitBanque]);

  const set = (k: keyof ClientLLD, v: any) => setF((x) => ({ ...x, [k]: v }));
  const setContact = (k: "contact_compta" | "contact_maintenance" | "contact_commande" | "signataire", ck: keyof ContactLLD, v: string) =>
    setF((x) => ({ ...x, [k]: { ...CONTACT_VIDE, ...(x[k] || {}), [ck]: v } }));

  function choisirEntreprise(e: EntrepriseFR) {
    const existant = clients.find((c) => c.id !== client?.id && sirenNettoye(c.siren) === sirenNettoye(e.siren));
    if (existant) { setDoublon(existant); return; }
    setDoublon(null);
    setF((x) => ({ ...x, ...clientDepuisEntreprise(e) }));
  }
  function choisirAdresse(a: AdresseFR) { setF((x) => ({ ...x, adresse: a.adresse, cp: a.cp, ville: a.ville })); }

  // Contrôles (mêmes règles que la fiche locataire du contrat)
  const manquants: string[] = [];
  if (!String(f.raison_sociale || "").trim()) manquants.push("la raison sociale");
  if (f.siret && !siretValide(f.siret)) manquants.push("un SIRET à 14 chiffres (pas le SIREN)");
  if (f.cp && !cpValide(f.cp)) manquants.push("un code postal à 5 chiffres");
  if (f.email && !emailValide(f.email)) manquants.push("un email d'entreprise valide");
  for (const [k, lib] of [["signataire", "du signataire"], ["contact_compta", "du contact compta"], ["contact_maintenance", "du contact maintenance"], ["contact_commande", "du contact commande"]] as const) {
    const c = f[k];
    if (c?.email && !emailValide(c.email)) manquants.push(`un email valide ${lib}`);
    if (c?.tel && !telValide(c.tel)) manquants.push(`un téléphone valide ${lib}`);
  }
  if (voitBanque) {
    if (banque.iban && !ibanValide(banque.iban)) manquants.push("un IBAN valide (clé incorrecte)");
    if (banque.bic && !bicValide(banque.bic)) manquants.push("un BIC valide (8 ou 11 caractères)");
  }

  async function enregistrer() {
    setTente(true); setErreur("");
    if (manquants.length) return;
    setEnCours(true);
    try {
      const data: Partial<ClientLLD> = { ...f, raison_sociale: String(f.raison_sociale).trim(), siren: sirenNettoye(f.siren) || (siretNettoye(f.siret).slice(0, 9) || ""), siret: siretNettoye(f.siret) };
      if (!client) {
        const dbl = data.siren ? await clientLLDParSiren(data.siren) : null;
        if (dbl) { setDoublon(dbl); setEnCours(false); return; }
      }
      const id = client ? (await modifierClientLLD(client.id, data, userName), client.id) : await creerClientLLD(data, userName);
      if (voitBanque && (banque.iban || banque.bic || banque.titulaire || banque.rum || banque.adresse_titulaire)) await enregistrerBanqueLLD(id, banque, userName);
      onEnregistre(id);
    } catch (e: any) {
      setErreur(e?.message || "Enregistrement impossible");
    } finally { setEnCours(false); }
  }

  const rouge = (ko: boolean): React.CSSProperties => (tente && ko ? { border: "1px solid #c0392b", background: "#fff6f5" } : {});
  const champTexte = (k: keyof ClientLLD, label: string, opts: { ph?: string; type?: string; ko?: boolean } = {}) => (
    <div><label style={LABEL}>{label}</label><input style={{ ...CHAMP, ...rouge(!!opts.ko) }} type={opts.type || "text"} value={String(f[k] ?? "")} placeholder={opts.ph} onChange={(e) => set(k, e.target.value)} /></div>
  );
  const blocContact = (k: "contact_compta" | "contact_maintenance" | "contact_commande" | "signataire", titre: string, avecFonction = false) => {
    const c = f[k] || CONTACT_VIDE;
    return (
      <div style={CARTE}>
        <div style={TITRE}>{titre}</div>
        <div style={{ display: "grid", gridTemplateColumns: avecFonction ? "1.2fr 1fr 1.3fr 1fr" : "1.2fr 1.3fr 1fr", gap: 10 }}>
          <div><label style={LABEL}>Nom</label><input style={CHAMP} value={c.nom || ""} onChange={(e) => setContact(k, "nom", e.target.value)} placeholder="Prénom Nom" /></div>
          {avecFonction && <div><label style={LABEL}>Fonction</label><input style={CHAMP} value={c.fonction || ""} onChange={(e) => setContact(k, "fonction", e.target.value)} /></div>}
          <div><label style={LABEL}>Email</label><input style={{ ...CHAMP, ...rouge(!!c.email && !emailValide(c.email)) }} type="email" value={c.email || ""} onChange={(e) => setContact(k, "email", e.target.value)} /></div>
          <div><label style={LABEL}>Téléphone</label><input style={{ ...CHAMP, ...rouge(!!c.tel && !telValide(c.tel)) }} value={c.tel || ""} onChange={(e) => setContact(k, "tel", e.target.value)} /></div>
        </div>
      </div>
    );
  };

  // Tarifs négociés
  const tarifs = f.tarifs_negocies || [];
  const setTarif = (i: number, k: keyof TarifNegocieLLD, v: any) => set("tarifs_negocies", tarifs.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", ".")) || 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#1a2a6e" }}>{client ? `Modifier — ${client.raison_sociale}` : "Nouveau client"}</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={!!f.sous_tarif} onChange={(e) => set("sous_tarif", e.target.checked)} style={{ width: "auto", margin: 0 }} />
          Client sous tarif (pas d'offre : ses tarifs négociés s'appliquent au contrat)
        </label>
      </div>

      {doublon && (
        <div style={{ background: "#fff8e6", border: "1px solid #f0d58a", borderRadius: 10, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 14 }}>
          <span>⚠ <b>{doublon.raison_sociale}</b> existe déjà avec ce SIREN ({doublon.siren}).</span>
          <button type="button" style={BTN} onClick={() => onOuvrir(doublon.id)}>Ouvrir la fiche existante</button>
          <button type="button" style={BTN2} onClick={() => setDoublon(null)}>Continuer quand même</button>
        </div>
      )}

      <div style={CARTE}>
        <div style={TITRE}>Entreprise <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— tapez le nom ou le SIREN et choisissez dans l'annuaire officiel : la fiche se remplit</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LABEL}>Raison sociale *</label>
            <ChampSuggestions<EntrepriseFR> style={{ ...CHAMP, ...rouge(!String(f.raison_sociale || "").trim()) }} autoFocus={!client}
              value={f.raison_sociale || ""} onChange={(v) => set("raison_sociale", v)} chercher={rechercherEntreprises} onChoix={choisirEntreprise}
              placeholder="Nom de l'entreprise ou SIREN…"
              rendu={(e) => (<><b>{e.raison_sociale}</b>{e.fermee && <span style={{ color: "#c0392b" }}> · fermée</span>}<div style={{ fontSize: 11, color: "#666" }}>SIREN {e.siren} · {[e.adresse, e.cp, e.ville].filter(Boolean).join(" ")}</div></>)} />
          </div>
          <div>
            <label style={LABEL}>SIREN</label>
            <ChampSuggestions<EntrepriseFR> style={CHAMP} value={f.siren || ""} onChange={(v) => set("siren", v)}
              chercher={(q) => (/^\d{9}$/.test(q.replace(/\s/g, "")) ? rechercherEntreprises(q) : Promise.resolve([]))} onChoix={choisirEntreprise}
              rendu={(e) => (<><b>{e.raison_sociale}</b><div style={{ fontSize: 11, color: "#666" }}>{[e.cp, e.ville].filter(Boolean).join(" ")}</div></>)} />
          </div>
          {champTexte("siret", "SIRET du siège (14 chiffres)", { ko: !!f.siret && !siretValide(f.siret) })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 10 }}>
          {champTexte("forme_juridique", "Forme juridique")}
          {champTexte("capital", "Capital", { ph: "ex. 50 000 €" })}
          {champTexte("rcs", "RCS")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.4fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={LABEL}>Adresse</label>
            <ChampSuggestions<AdresseFR> style={CHAMP} value={f.adresse || ""} onChange={(v) => set("adresse", v)} chercher={rechercherAdresses} onChoix={choisirAdresse} rendu={(a) => a.label} placeholder="Tapez l'adresse…" />
          </div>
          {champTexte("cp", "Code postal", { ko: !!f.cp && !cpValide(f.cp) })}
          {champTexte("ville", "Ville")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
          {champTexte("naf", "Code NAF")}
          {champTexte("tva_intra", "N° TVA intracom.")}
          {champTexte("telephone", "Téléphone")}
          {champTexte("fax", "Fax")}
          {champTexte("email", "Email", { type: "email", ko: !!f.email && !emailValide(f.email) })}
        </div>
      </div>

      <div style={CARTE}>
        <div style={TITRE}>Facturation <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— à remplir seulement si différente de l'entreprise</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10 }}>
          {champTexte("facturation_societe", "Société facturée")}
          {champTexte("facturation_email", "Email de facturation", { type: "email" })}
          {champTexte("facturation_adresse", "Adresse postale de facturation")}
        </div>
      </div>

      {blocContact("signataire", "Signataire du contrat", true)}
      {blocContact("contact_compta", "Contact comptabilité fournisseur")}
      {blocContact("contact_maintenance", "Contact maintenance véhicule (révisions, VGP, relevés km)")}

      <div style={CARTE}>
        <div style={TITRE}>N° de commande</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginBottom: f.commande_obligatoire ? 10 : 0 }}>
          <input type="checkbox" checked={!!f.commande_obligatoire} onChange={(e) => set("commande_obligatoire", e.target.checked)} style={{ width: "auto", margin: 0 }} />
          Le client exige un n° de commande sur les factures
        </label>
        {f.commande_obligatoire && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.3fr 1fr", gap: 10 }}>
            <div><label style={LABEL}>Contact pour l'obtenir</label><input style={CHAMP} value={f.contact_commande?.nom || ""} onChange={(e) => setContact("contact_commande", "nom", e.target.value)} /></div>
            <div><label style={LABEL}>Email</label><input style={{ ...CHAMP, ...rouge(!!f.contact_commande?.email && !emailValide(f.contact_commande.email)) }} type="email" value={f.contact_commande?.email || ""} onChange={(e) => setContact("contact_commande", "email", e.target.value)} /></div>
            <div><label style={LABEL}>Téléphone</label><input style={CHAMP} value={f.contact_commande?.tel || ""} onChange={(e) => setContact("contact_commande", "tel", e.target.value)} /></div>
          </div>
        )}
      </div>

      {voitBanque && (
        <div style={{ ...CARTE, border: "1px solid #d6e2f0", background: "#f5f9fd" }}>
          <div style={TITRE}>🔒 Banque — mandat SEPA <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— visible par Jonathan et les assistantes seulement{banqueCharg ? " · chargement…" : ""}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10, marginBottom: 10 }}>
            <div><label style={LABEL}>Titulaire du compte</label><input style={CHAMP} value={banque.titulaire || ""} onChange={(e) => setBanque({ ...banque, titulaire: e.target.value })} /></div>
            <div><label style={LABEL}>Adresse du titulaire</label><input style={CHAMP} value={banque.adresse_titulaire || ""} onChange={(e) => setBanque({ ...banque, adresse_titulaire: e.target.value })} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <div><label style={LABEL}>IBAN</label><input style={{ ...CHAMP, fontFamily: "monospace", ...rouge(!!banque.iban && !ibanValide(banque.iban)) }} value={banque.iban || ""} onChange={(e) => setBanque({ ...banque, iban: e.target.value })} placeholder="FR76 …" />
              {banque.iban && <span style={{ fontSize: 11, color: ibanValide(banque.iban) ? "#1e7a3c" : "#b3261e" }}>{ibanValide(banque.iban) ? "✓ clé IBAN correcte" : "✗ clé IBAN incorrecte"}</span>}</div>
            <div><label style={LABEL}>BIC</label><input style={{ ...CHAMP, fontFamily: "monospace", ...rouge(!!banque.bic && !bicValide(banque.bic)) }} value={banque.bic || ""} onChange={(e) => setBanque({ ...banque, bic: e.target.value.toUpperCase() })} /></div>
            <div><label style={LABEL}>RUM du mandat en cours</label><input style={CHAMP} value={banque.rum || ""} onChange={(e) => setBanque({ ...banque, rum: e.target.value })} placeholder="généré au 1er contrat" /></div>
          </div>
        </div>
      )}

      <div style={CARTE}>
        <div style={{ ...TITRE, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>Tarifs négociés <span style={{ fontWeight: 400, fontSize: 12, color: "#777" }}>— par modèle × durée (client sous tarif, ou conditions particulières)</span></span>
          <button type="button" style={{ ...BTN2, padding: "6px 10px", fontSize: 13 }} onClick={() => set("tarifs_negocies", [...tarifs, { modele: modeles[0] || "", duree_mois: 36, loyer_ht: 0, full_services: true }])}>+ Ajouter un tarif</button>
        </div>
        {tarifs.length === 0 && <div style={{ fontSize: 13, color: "#888" }}>Aucun tarif négocié : la grille standard s'applique.</div>}
        {tarifs.map((t, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.3fr .8fr 1fr 1.1fr .9fr .8fr 1fr 1.4fr .9fr auto", gap: 8, alignItems: "end", padding: "8px 0", borderTop: i ? "1px solid #eef0f5" : "none" }}>
            <div><label style={LABEL}>Modèle</label>
              <input list="lld-modeles" style={CHAMP} value={t.modele} onChange={(e) => setTarif(i, "modele", e.target.value)} /></div>
            <div><label style={LABEL}>Durée (mois)</label><input style={CHAMP} type="number" min={1} max={84} value={t.duree_mois || ""} onChange={(e) => setTarif(i, "duree_mois", Number(e.target.value) || 0)} /></div>
            <div><label style={LABEL}>Loyer HT / mois</label><input style={CHAMP} value={t.loyer_ht || ""} onChange={(e) => setTarif(i, "loyer_ht", num(e.target.value))} /></div>
            <div><label style={LABEL}>Formule</label>
              <select style={CHAMP} value={t.full_services ? "full" : "sans"} onChange={(e) => setTarif(i, "full_services", e.target.value === "full")}><option value="full">Full services</option><option value="sans">Sans entretien</option></select></div>
            <div><label style={LABEL}>Km / an</label><input style={CHAMP} value={t.km_an || ""} onChange={(e) => setTarif(i, "km_an", num(e.target.value))} /></div>
            <div><label style={LABEL}>Km sup. (€)</label><input style={CHAMP} value={t.prix_km_sup ?? ""} onChange={(e) => setTarif(i, "prix_km_sup", num(e.target.value))} /></div>
            <div><label style={LABEL}>Caution TTC</label><input style={CHAMP} value={t.caution_ttc || ""} onChange={(e) => setTarif(i, "caution_ttc", num(e.target.value))} /></div>
            <div><label style={LABEL}>Options (libellé = prix)</label><input style={CHAMP} value={t.options || ""} onChange={(e) => setTarif(i, "options", e.target.value)} placeholder="4 pneus/an = 90 ; VR = 130" /></div>
            <div><label style={LABEL}>Fin</label><input style={CHAMP} type="date" value={t.fin || ""} onChange={(e) => setTarif(i, "fin", e.target.value)} /></div>
            <button type="button" title="Retirer" onClick={() => set("tarifs_negocies", tarifs.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", color: "#c0392b", fontSize: 18, cursor: "pointer", padding: "8px 4px" }}>✕</button>
          </div>
        ))}
        <datalist id="lld-modeles">{modeles.map((m) => <option key={m} value={m} />)}</datalist>
      </div>

      <div style={CARTE}>
        <label style={LABEL}>Notes internes</label>
        <textarea style={{ ...CHAMP, resize: "vertical" }} rows={3} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} />
      </div>

      {tente && manquants.length > 0 && <div style={{ color: "#c0392b", fontWeight: 600 }}>⚠ Indiquez {manquants.join(", ")}.</div>}
      {erreur && <div style={{ color: "#c0392b", fontWeight: 600 }}>⚠ {erreur}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" onClick={onAnnuler} disabled={enCours} style={{ ...BTN2, color: "#555", borderColor: "#ccc" }}>Annuler</button>
        <button type="button" onClick={enregistrer} disabled={enCours} style={BTN}>{enCours ? "⏳ …" : client ? "💾 Enregistrer" : "💾 Créer le client"}</button>
      </div>
    </div>
  );
}
