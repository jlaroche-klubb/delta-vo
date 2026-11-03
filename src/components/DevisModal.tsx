import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Machine } from "../types/machine";
import { referenceCommerciale } from "../utils/reference";
import {
  chargerConfigDevis,
  creerDevisVente,
  envoyerContratsGroupes,
  envoyerDevisVente,
  signatureDisponible,
  signerDevisVente,
  type AcompteDevis,
  type ClientDevis,
  type ConfigDevis,
  type DevisVente,
  type LigneDevis,
} from "../services/devisVenteService";
import { genererDevisPdf } from "../utils/generateDevisPdf";
import { calculerLocFi, genererContratLocFiPdf } from "../utils/generateContratLocFiPdf";
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
  /** Autres nacelles disponibles qu'on peut ajouter au devis (vente en lot) */
  autresMachines?: Machine[];
  prixDealer: boolean; // dealer : prix dealer par défaut
  onClose: () => void;
  /** Appelé une fois le devis créé (machines à marquer « offre en cours ») */
  onCree: (r: { numero: string; client: string; montants: Record<string, number>; pdfUrl?: string; enValidation?: boolean }) => Promise<void> | void;
  /** Admin / super admin : pas de plafond de remise */
  estAdmin?: boolean;
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

export default function DevisModal({ machines, autresMachines = [], prixDealer, onClose, onCree, estAdmin = false }: Props) {
  const { i18n } = useTranslation();
  const [langue, setLangue] = useState<LangueDevis>(() => langueDevis(i18n.language));
  const [cfg, setCfg] = useState<ConfigDevis | null>(null);
  const [client, setClient] = useState<ClientDevis>({ raison_sociale: "" });
  const ligneDe = (m: Machine, lg: LangueDevis): LigneDevis => ({
    machine_id: m.id,
    immat: m.immat,
    reference: referenceCommerciale(m),
    designation: designation(m, lg),
    prix_ht: (prixDealer ? m.prix_dealer ?? m.prix_fr : m.prix_fr ?? m.prix_dealer) ?? 0,
  });
  const [lignes, setLignes] = useState<LigneDevis[]>(() => machines.map((m) => ligneDe(m, langue)));
  // 📦 Vente en lot : un prix global pour toutes les nacelles
  const [lot, setLot] = useState(false);
  const [prixLot, setPrixLot] = useState(0);
  const [recherche, setRecherche] = useState("");
  const toutes = useMemo(() => new Map([...machines, ...autresMachines].map((m) => [m.id, m])), [machines, autresMachines]);
  const ajoutables = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return [];
    return autresMachines
      .filter((m) => !lignes.some((l) => l.machine_id === m.id))
      .filter((m) => [referenceCommerciale(m), m.immat, m.type_nacelle, m.modele_porteur, m.numero_dossier].some((v) => String(v || "").toLowerCase().includes(q)))
      .slice(0, 8);
  }, [recherche, autresMachines, lignes]);
  function ajouterLigne(m: Machine) { setLignes((ls) => [...ls, ligneDe(m, langue)]); setRecherche(""); }
  function retirerLigne(id: string) { setLignes((ls) => (ls.length > 1 ? ls.filter((l) => l.machine_id !== id) : ls)); }
  /** Prix du lot réparti sur les nacelles au prorata de leur prix catalogue (somme exacte) */
  function repartirLot(ls: LigneDevis[], total: number): LigneDevis[] {
    const base = ls.reduce((s, l) => s + (Number(l.prix_ht) || 0), 0);
    let reste = Math.round(total * 100);
    return ls.map((l, i) => {
      const part = i === ls.length - 1 ? reste : Math.round((base > 0 ? (Number(l.prix_ht) || 0) / base : 1 / ls.length) * total * 100);
      reste -= part;
      return { ...l, prix_ht: part / 100 };
    });
  }
  const [tva, setTva] = useState<20 | 0>(() => (langue === "fr" ? 20 : 0));
  const [tente, setTente] = useState(false); // a cliqué sur Créer : champs manquants en rouge
  const [exoneration, setExoneration] = useState(() => TEXTES_DEVIS[langue].exonerationDefaut);
  const [acompte, setAcompte] = useState<AcompteDevis>(30);
  // 📄 Location financière (contrat DSLOCFI) : durée + 1er loyer majoré
  const [typeDoc, setTypeDoc] = useState<"vente" | "locfi">("vente");
  const [dureeMois, setDureeMois] = useState(3);
  const [premierLoyer, setPremierLoyer] = useState(0);
  const [validite, setValidite] = useState(30);
  // 📄📄 Loc fi en série (décision Jonathan 03/11/2026) : plusieurs nacelles, prix
  // différents → un contrat par nacelle, saisis l'un après l'autre. Client et
  // préparation saisis au 1er contrat puis grisés ; seule la partie financière
  // change. Un seul email au client, une signature par contrat.
  const [unParNacelle, setUnParNacelle] = useState(true);
  const [etape, setEtape] = useState(0);
  const [finances, setFinances] = useState<Record<string, { duree: number; premier: number }>>({});
  const [progression, setProgression] = useState("");
  // 🔧 À la signature, les nacelles passent seules en préparation avec ces choix
  const [typePrepa, setTypePrepa] = useState<"normale" | "en_etat">("normale");
  const [dateLivraison, setDateLivraison] = useState(() => new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [conditions, setConditions] = useState("");
  const [enCours, setEnCours] = useState<"" | "pdf" | "email" | "signature">("");
  const [docusign, setDocusign] = useState(false);
  const [consentement, setConsentement] = useState("");
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    signatureDisponible().then(setDocusign);
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
    setLignes((ls) => ls.map((l) => { const m = toutes.get(l.machine_id); return m ? { ...l, designation: designation(m, lg) } : l; }));
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

  const serie = typeDoc === "locfi" && unParNacelle && lignes.length > 1 && !lot;
  const idx = Math.min(etape, lignes.length - 1);
  const courante = lignes[idx];
  const derniere = serie && idx === lignes.length - 1;
  /** Client, préparation, validité : saisis au 1er contrat de la série, grisés ensuite */
  const verrou = serie && idx > 0;
  /** Lignes du contrat affiché : en série, la seule nacelle de l'étape en cours */
  const lignesCalc = serie ? [courante] : lignes;
  const totalCatalogue = useMemo(() => lignes.reduce((s, l) => s + (Number(l.prix_ht) || 0), 0), [lignes]);
  const totalHt = serie ? Number(courante?.prix_ht) || 0 : lot ? prixLot : totalCatalogue;
  const totalTtc = totalHt * (1 + tva / 100);

  // 🔒 Remise max 1 000 € HT / nacelle sous le prix catalogue (hors admin) — au-delà : validation Jonathan / Nathalie
  const SEUIL_REMISE = 1000;
  const catalogue = (id: string) => { const m = toutes.get(id); return Number(prixDealer ? m?.prix_dealer ?? m?.prix_fr : m?.prix_fr ?? m?.prix_dealer) || 0; };
  const totalCat = lignes.reduce((t, l) => t + catalogue(l.machine_id), 0);
  const depassements = estAdmin ? [] : lot && !serie
    ? (totalCat - prixLot > SEUIL_REMISE * lignes.length ? [`lot : remise de ${eur(totalCat - prixLot)} (max ${eur(SEUIL_REMISE * lignes.length)} sans validation)`] : [])
    : lignesCalc.filter((l) => catalogue(l.machine_id) - (Number(l.prix_ht) || 0) > SEUIL_REMISE).map((l) => `${l.reference} : remise de ${eur(catalogue(l.machine_id) - (Number(l.prix_ht) || 0))}`);
  // 📄 Location financière : 1er loyer ≥ 30 % du prix HT, 4 loyers mensuels max après le 1er (au-delà : dérogation)
  const locFi = typeDoc === "locfi";
  const calcLf = calculerLocFi(totalHt, premierLoyer, dureeMois);
  const reglesLf = !locFi ? [] : [
    ...(calcLf.pct_premier < 30 ? [`1er loyer majoré à ${calcLf.pct_premier.toFixed(1).replace(".", ",")} % du prix (minimum 30 %)`] : []),
    ...(calcLf.nb_loyers_suivants > 4 ? [`${calcLf.nb_loyers_suivants} loyers mensuels après le 1er (maximum 4)`] : []),
  ];
  if (!estAdmin) depassements.push(...reglesLf);
  const aValider = depassements.length > 0;
  function choisirType(t: "vente" | "locfi") {
    setTypeDoc(t);
    if (t === "locfi") {
      changerLangue("fr");
      setTva(20);
      const enSerie = unParNacelle && lignes.length > 1 && !lot;
      if (!premierLoyer) setPremierLoyer(premierDefaut(enSerie ? Number(lignes[0]?.prix_ht) || 0 : totalHt));
      if (enSerie) setEtape(0);
    }
  }
  const setC = (k: keyof ClientDevis, v: string) => setClient((c) => ({ ...c, [k]: v }));
  const setL = (i: number, k: keyof LigneDevis, v: any) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  // ───────── Loc fi en série : navigation entre les contrats ─────────
  const premierDefaut = (prix: number) => Math.ceil((prix * 0.3) / 10) * 10;
  /** Conditions financières de chaque nacelle, celles de l'écran en cours comprises */
  const financesCompletes = (): Record<string, { duree: number; premier: number }> =>
    courante ? { ...finances, [courante.machine_id]: { duree: dureeMois, premier: premierLoyer } } : finances;
  function allerA(i: number) {
    const f = financesCompletes();
    setFinances(f);
    const cible = lignes[i];
    const fc = f[cible.machine_id];
    setDureeMois(fc?.duree ?? dureeMois);
    setPremierLoyer(fc?.premier ?? premierDefaut(Number(cible.prix_ht) || 0));
    setEtape(i);
    setErreur("");
  }
  /** Contrôle du contrat affiché avant de passer au suivant */
  function contratCourantOk(): boolean {
    setErreur("");
    setTente(true);
    if (Object.keys(manquants).length) return false;
    if (!(Number(courante?.prix_ht) > 0)) { setErreur(`${courante?.reference} : indiquez le prix HT.`); return false; }
    if (!(premierLoyer > 0)) { setErreur("Indiquez le 1er loyer majoré (HT)."); return false; }
    return true;
  }
  /** Règles d'un contrat de la série (récapitulatif final) */
  function horsRegles(l: LigneDevis, f: { duree: number; premier: number }): string[] {
    const prix = Number(l.prix_ht) || 0;
    const c = calculerLocFi(prix, f.premier, f.duree);
    if (estAdmin) return [];
    return [
      ...(catalogue(l.machine_id) - prix > SEUIL_REMISE ? [`remise de ${eur(catalogue(l.machine_id) - prix)}`] : []),
      ...(c.pct_premier < 30 ? [`1er loyer à ${c.pct_premier.toFixed(1).replace(".", ",")} %`] : []),
      ...(c.nb_loyers_suivants > 4 ? [`${c.nb_loyers_suivants} loyers après le 1er`] : []),
    ];
  }

  /** Création des N contrats (un par nacelle), puis un seul email au client si demandé */
  async function validerSerie(mode: "pdf" | "email") {
    if (!contratCourantOk() || !cfg) return;
    if (mode === "email" && !emailValide(client.contact_email)) return setErreur("Indiquez l'email du contact pour l'envoi.");
    const f = financesCompletes();
    setFinances(f);
    setEnCours(mode);
    const crees: { numero: string; contrat: string; reference: string; enValidation: boolean }[] = [];
    try {
      for (const [i, l] of lignes.entries()) {
        const fl = f[l.machine_id] || { duree: dureeMois, premier: premierDefaut(Number(l.prix_ht) || 0) };
        setProgression(`Contrat ${i + 1}/${lignes.length} (${l.reference})…`);
        const r = await creerDevisVente({ type: "locfi", locfi: { duree_mois: fl.duree, premier_loyer_ht: fl.premier }, client, lignes: [l], lot: false, tva_taux: 20, exoneration: "", acompte_pct: acompte, validite_jours: validite, conditions, langue: "fr", type_prepa: typePrepa, date_livraison: dateLivraison, serie: { rang: i + 1, nb: lignes.length } });
        const now = new Date();
        const dv: DevisVente = {
          numero: r.numero, date: now.toISOString(),
          date_expiration: new Date(now.getTime() + validite * 86400000).toISOString().slice(0, 10),
          client, lignes: [l], lot: false, tva_taux: 20, exoneration: "",
          total_ht: r.total_ht, tva: r.tva, total_ttc: r.total_ttc,
          acompte_pct: acompte, acompte_ttc: Math.round(r.total_ttc * acompte) / 100,
          conditions, commercial: r.commercial, langue: "fr", type: "locfi", locfi: r.locfi,
        };
        const m = toutes.get(l.machine_id);
        const pdf = genererContratLocFiPdf({ ...dv, locfi: r.locfi! }, [{ reference: l.reference, type: m?.type_nacelle, immat: m?.immat }]);
        const enValidation = !!r.validation_requise;
        const env = await envoyerDevisVente(r.numero, pdf.base64, false, pdf.zoneSignature, mode);
        if (mode === "pdf" && !enValidation) {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(pdf.blob);
          a.download = pdf.filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        }
        await onCree({ numero: r.numero, client: client.raison_sociale.trim(), montants: { [l.machine_id]: Number(l.prix_ht) || 0 }, pdfUrl: enValidation ? undefined : env.pdf_url, enValidation });
        crees.push({ numero: r.numero, contrat: r.locfi?.numero_contrat || r.numero, reference: l.reference, enValidation });
      }
      const prets = crees.filter((c) => !c.enValidation);
      const attente = crees.filter((c) => c.enValidation);
      let envoi = "";
      if (mode === "email" && prets.length) {
        setProgression("Envoi de l'email au client…");
        const g = await envoyerContratsGroupes(prets.map((c) => c.numero));
        envoi = `📧 ${prets.length} contrat${prets.length > 1 ? "s envoyés" : " envoyé"} à ${g.to} dans un seul email (un bouton « Signer » par contrat).`;
      }
      alert([
        `✅ ${crees.length} contrats de location financière créés :`,
        ...crees.map((c) => `• ${c.contrat} — ${c.reference}${c.enValidation ? " 🔒 dérogation demandée" : ""}`),
        envoi,
        attente.length ? `🔒 ${attente.length} contrat${attente.length > 1 ? "s attendent" : " attend"} la validation de Jonathan ou Nathalie : ${mode === "email" ? "il partira seul par email au client dès validation" : "le PDF sera disponible sur la carte dès validation"}.` : "",
      ].filter(Boolean).join("\n"));
      onClose();
    } catch (e: any) {
      setErreur(`${e?.message || "Erreur lors de la création des contrats"}${crees.length ? ` — déjà créés : ${crees.map((c) => c.contrat).join(", ")} (ne les recréez pas : retrouvez-les sur les cartes des nacelles)` : ""}`);
    } finally {
      setEnCours("");
      setProgression("");
    }
  }

  async function valider(mode: "pdf" | "email" | "signature") {
    setErreur("");
    setConsentement("");
    setTente(true);
    if (Object.keys(manquants).length) return; // message affiché en direct sous le formulaire
    if (mode !== "pdf" && !emailValide(client.contact_email)) return setErreur(mode === "signature" ? "Indiquez l'email du contact : c'est lui qui recevra la demande de signature." : "Indiquez l'email du contact pour l'envoi.");
    if (mode === "signature" && !(client.contact_nom || "").trim()) return setErreur("Indiquez le nom du contact (signataire).");
    if (lot && !(prixLot > 0)) return setErreur("Indiquez le prix global du lot (HT).");
    if (!lot && lignes.some((l) => !(Number(l.prix_ht) > 0))) return setErreur("Chaque nacelle doit avoir un prix HT.");
    if (!cfg) return;
    const lignesDevis = lot ? repartirLot(lignes, prixLot) : lignes;
    setEnCours(mode);
    try {
      if (locFi && !(premierLoyer > 0)) { setEnCours(""); return setErreur("Indiquez le 1er loyer majoré (HT)."); }
      const r = await creerDevisVente({ type: typeDoc, locfi: locFi ? { duree_mois: dureeMois, premier_loyer_ht: premierLoyer } : undefined, client, lignes: lignesDevis, lot, tva_taux: tva, exoneration: tva === 0 ? exoneration : "", acompte_pct: acompte, validite_jours: validite, conditions, langue, type_prepa: typePrepa, date_livraison: dateLivraison });
      const now = new Date();
      const dv: DevisVente = {
        numero: r.numero,
        date: now.toISOString(),
        date_expiration: new Date(now.getTime() + validite * 86400000).toISOString().slice(0, 10),
        client, lignes: lignesDevis, lot, tva_taux: tva, exoneration: tva === 0 ? exoneration : "",
        total_ht: r.total_ht, tva: r.tva, total_ttc: r.total_ttc,
        acompte_pct: acompte, acompte_ttc: Math.round(r.total_ttc * acompte) / 100,
        conditions, commercial: r.commercial, langue,
        ...(r.locfi ? { type: "locfi" as const, locfi: r.locfi } : {}),
      };
      const pdf = r.locfi
        ? genererContratLocFiPdf({ ...dv, locfi: r.locfi }, lignesDevis.map((l) => { const m = toutes.get(l.machine_id); return { reference: l.reference, type: m?.type_nacelle, immat: m?.immat }; }))
        : genererDevisPdf(dv, cfg);
      const enValidation = !!r.validation_requise;
      const env = mode === "signature"
        ? await signerDevisVente(r.numero, pdf.base64)
        : await envoyerDevisVente(r.numero, pdf.base64, mode === "email", pdf.zoneSignature);
      if (mode === "pdf" && !enValidation) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pdf.blob);
        a.download = pdf.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
      await onCree({
        numero: r.numero,
        client: client.raison_sociale.trim(),
        montants: Object.fromEntries(lignesDevis.map((l) => [l.machine_id, Number(l.prix_ht) || 0])),
        pdfUrl: enValidation ? undefined : env.pdf_url,
        enValidation,
      });
      alert(
        enValidation ? `🔒 Devis ${r.numero} : la remise dépasse ${eur(SEUIL_REMISE)} HT par nacelle.\nDemande de validation envoyée à ${(env.valideurs || []).join(", ")}.\n${mode === "pdf" ? "Vous serez prévenu dès la décision : le PDF sera alors disponible sur la carte." : "Le devis partira automatiquement au client dès validation (vous serez prévenu)."}`
        : mode === "signature" ? `✍️ Devis ${r.numero} envoyé pour signature électronique à ${env.to}.\nVous recevrez un email dès qu'il est signé (ou refusé).`
        : mode === "email" ? `✅ Devis ${r.numero} envoyé à ${env.to} (copie à vous-même).`
        : `✅ Devis ${r.numero} créé et téléchargé.`
      );
      onClose();
    } catch (e: any) {
      setErreur(e?.message || "Erreur lors de la création du devis");
      if (e?.details?.consentement_url) setConsentement(e.details.consentement_url);
    } finally {
      setEnCours("");
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !enCours) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: "95%", maxHeight: "92vh", background: "white", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{serie ? `📄 Location financière — contrat ${idx + 1}/${lignes.length} (${courante?.reference})` : locFi ? "📄 Nouveau contrat de location financière" : "🧾 Nouveau devis de vente"}</h2>
          <button onClick={onClose} disabled={!!enCours} style={{ background: "transparent", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>✕</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          {!cfg ? <div>Chargement…</div> : (
            <>
              {/* Langue du devis */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <span style={{ fontWeight: 700, color: "#1a2a6e" }}>Langue du devis</span>
                {LANGUES_DEVIS.map((l) => (
                  <button key={l.code} type="button" disabled={locFi && l.code !== "fr"} onClick={() => changerLangue(l.code)}
                    style={{ padding: "6px 12px", borderRadius: 16, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `2px solid ${langue === l.code ? "#1a73e8" : "#ddd"}`, background: langue === l.code ? "#eef4fd" : "white", color: langue === l.code ? "#1a73e8" : "#444" }}>
                    {l.libelle}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: "#888" }}>{locFi ? "Contrat de location financière : en français" : "PDF et email au client dans cette langue"}</span>
              </div>
              {/* Type de document */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {([["vente", "🧾 Devis de vente"], ["locfi", "📄 Location financière"]] as const).map(([v, lib]) => (
                  <button key={v} type="button" onClick={() => choisirType(v)} disabled={verrou}
                    style={{ flex: "1 1 200px", padding: "9px 12px", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 700, border: `2px solid ${typeDoc === v ? "#1a73e8" : "#ddd"}`, background: typeDoc === v ? "#eef4fd" : "white", color: typeDoc === v ? "#1a73e8" : "#444" }}>
                    {lib}
                  </button>
                ))}
              </div>

              {/* Client — en série, saisi au 1er contrat puis grisé */}
              <fieldset disabled={verrou} style={{ border: "none", padding: 0, margin: 0, minWidth: 0, ...(verrou ? { opacity: 0.55 } : {}) }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "#1a2a6e" }}>Client{verrou ? " 🔒 (repris du contrat 1)" : ""}</span>
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
              </fieldset>

              {/* 📄📄 Loc fi en série : un contrat par nacelle */}
              {locFi && lignes.length > 1 && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: verrou ? "default" : "pointer", marginBottom: 10, padding: "8px 10px", background: "#f5f9fd", border: "1px solid #d6e2f0", borderRadius: 6 }}>
                  <input type="checkbox" checked={unParNacelle} disabled={verrou || !!enCours} onChange={(e) => { setUnParNacelle(e.target.checked); setEtape(0); if (e.target.checked) { setLot(false); setPremierLoyer(premierDefaut(Number(lignes[0]?.prix_ht) || 0)); } else setPremierLoyer(premierDefaut(totalCatalogue)); }} style={{ width: "auto", margin: 0 }} />
                  📄📄 Un contrat par nacelle ({lignes.length} contrats, saisis l'un après l'autre — un seul email au client, une signature par contrat)
                </label>
              )}

              {/* Nacelles */}
              {serie && (
                <div style={{ border: "1px solid #eee", borderRadius: 6, marginBottom: 8 }}>
                  {lignes.map((l, i) => {
                    const f = i === idx ? { duree: dureeMois, premier: premierLoyer } : finances[l.machine_id];
                    const fait = i !== idx && !!finances[l.machine_id];
                    return (
                      <div key={l.machine_id} style={{ padding: "8px 10px", borderBottom: i < lignes.length - 1 ? "1px solid #f0f0f0" : "none", background: i === idx ? "#eef4fd" : "white" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: i === idx ? "#1a73e8" : fait ? "#1e8e3e" : "#999", minWidth: 92 }}>
                            {i === idx ? "● " : fait ? "✓ " : "○ "}Contrat {i + 1}/{lignes.length}
                          </span>
                          <b style={{ fontSize: 13 }} title={l.immat}>{l.reference}</b>
                          {i === idx ? null : (
                            <span style={{ fontSize: 12, color: "#666", flex: 1 }}>
                              {eur(Number(l.prix_ht) || 0)} HT{f ? ` · 1er loyer ${eur(f.premier)} · ${f.duree} mois` : " · à saisir"}
                            </span>
                          )}
                          {i !== idx && (fait || i < idx) && !enCours && (
                            <button type="button" onClick={() => { if (i < idx || contratCourantOk()) allerA(i); }} style={{ border: "none", background: "transparent", color: "#1a73e8", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>modifier</button>
                          )}
                          {idx === 0 && i !== idx && !enCours && (
                            <button type="button" onClick={() => { retirerLigne(l.machine_id); setFinances((fs) => { const n = { ...fs }; delete n[l.machine_id]; return n; }); }} title="Retirer cette nacelle"
                              style={{ border: "none", background: "transparent", color: "#c0392b", fontSize: 14, cursor: "pointer" }}>✕</button>
                          )}
                        </div>
                        {i === idx && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 8, alignItems: "center", marginTop: 6 }}>
                            <input style={{ ...CHAMP, fontSize: 13 }} value={l.designation} onChange={(e) => setL(i, "designation", e.target.value)} />
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <input style={{ ...CHAMP, textAlign: "right" }} value={l.prix_ht || ""} onChange={(e) => setL(i, "prix_ht", Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0)} />
                              <span style={{ fontSize: 12, color: "#666" }}>HT</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!serie && (<>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: "#1a2a6e" }}>Nacelles ({lignes.length})</span>
                {lignes.length > 1 && !(locFi && unParNacelle) && (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    <input type="checkbox" checked={lot} onChange={(e) => { setLot(e.target.checked); if (e.target.checked && !prixLot) setPrixLot(totalCatalogue); }} style={{ width: "auto", margin: 0 }} />
                    📦 Vente en lot (prix global)
                  </label>
                )}
              </div>
              <div style={{ border: "1px solid #eee", borderRadius: 6, marginBottom: 8 }}>
                {lignes.map((l, i) => (
                  <div key={l.machine_id} style={{ display: "grid", gridTemplateColumns: lot ? "80px 1fr 28px" : "80px 1fr 120px 28px", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: i < lignes.length - 1 ? "1px solid #f0f0f0" : "none" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }} title={l.immat}>{l.reference}</div>
                    <input style={{ ...CHAMP, fontSize: 13 }} value={l.designation} onChange={(e) => setL(i, "designation", e.target.value)} />
                    {!lot && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input style={{ ...CHAMP, textAlign: "right" }} value={l.prix_ht || ""} onChange={(e) => setL(i, "prix_ht", Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0)} />
                        <span style={{ fontSize: 12, color: "#666" }}>HT</span>
                      </div>
                    )}
                    <button type="button" onClick={() => retirerLigne(l.machine_id)} disabled={lignes.length < 2} title="Retirer cette nacelle du devis"
                      style={{ border: "none", background: "transparent", color: lignes.length < 2 ? "#ccc" : "#c0392b", fontSize: 16, cursor: lignes.length < 2 ? "default" : "pointer" }}>✕</button>
                  </div>
                ))}
                {lot && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "10px", background: "#f5f8fe", borderTop: "1px solid #e3e9f5" }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Prix global du lot</span>
                    <input style={{ ...CHAMP, width: 140, textAlign: "right", fontWeight: 700 }} value={prixLot || ""} onChange={(e) => setPrixLot(Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0)} />
                    <span style={{ fontSize: 12, color: "#666" }}>HT</span>
                    <span style={{ fontSize: 11, color: "#888" }}>(prix catalogue : {eur(totalCatalogue)})</span>
                  </div>
                )}
              </div>
              </>)}
              {autresMachines.length > 0 && !(serie && idx > 0) && (
                <div style={{ position: "relative", marginBottom: 8 }}>
                  <input style={{ ...CHAMP, fontSize: 13 }} value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="➕ Ajouter une nacelle au devis : référence, type, porteur, D0…" />
                  {ajoutables.length > 0 && (
                    <div style={{ position: "absolute", zIndex: 10, left: 0, right: 0, top: "100%", background: "white", border: "1px solid #ccd", borderRadius: 6, boxShadow: "0 6px 18px rgba(0,0,0,0.15)" }}>
                      {ajoutables.map((m) => (
                        <div key={m.id} onMouseDown={(e) => { e.preventDefault(); ajouterLigne(m); }} style={{ padding: "8px 10px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f2f2f2" }}>
                          <b>{referenceCommerciale(m)}</b> — {designation(m, langue)}{m.prix_fr ? <span style={{ color: "#666" }}> · {eur(m.prix_fr)} HT</span> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, color: "#888", marginBottom: 18 }}>Référence commerciale uniquement : l'immatriculation n'apparaît pas sur le devis.</div>

              {/* TVA + validité + préparation — en série, communs à tous les contrats (grisés après le 1er) */}
              <fieldset disabled={verrou} style={{ border: "none", padding: 0, margin: 0, minWidth: 0, ...(verrou ? { opacity: 0.55 } : {}) }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={LABEL}>TVA</label>
                  <select style={CHAMP} value={tva} disabled={locFi} onChange={(e) => setTva(Number(e.target.value) as 20 | 0)}>
                    <option value={20}>20 % (France)</option>
                    <option value={0}>Exonéré (export / intracommunautaire)</option>
                  </select>
                </div>
                <div><label style={LABEL}>Validité (jours)</label><input style={CHAMP} type="number" min={1} max={180} value={validite} onChange={(e) => setValidite(Number(e.target.value) || 30)} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 4 }}>
                <div>
                  <label style={LABEL}>Préparation si le devis est signé</label>
                  <select style={CHAMP} value={typePrepa} onChange={(e) => setTypePrepa(e.target.value as "normale" | "en_etat")}>
                    <option value="normale">Normale (lavage, CT, VGP, carrosserie, révision, photos)</option>
                    <option value="en_etat">En l'état (lavage + photos)</option>
                  </select>
                </div>
                <div><label style={LABEL}>Livraison souhaitée</label><input style={CHAMP} type="date" value={dateLivraison} onChange={(e) => setDateLivraison(e.target.value)} /></div>
              </div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>🔧 Dès que le client signe, la ou les nacelles passent automatiquement en préparation (vente) et les préparateurs du site sont prévenus.{serie ? " En série : chaque nacelle part en préparation à la signature de son contrat." : ""}</div>
              </fieldset>
              {tva === 0 && (
                <div style={{ marginBottom: 10 }}><label style={LABEL}>Mention d'exonération (imprimée sur le devis)</label><input style={CHAMP} value={exoneration} onChange={(e) => setExoneration(e.target.value)} /></div>
              )}

              {locFi ? (
                <div style={{ border: "1px solid #d6e2f0", background: "#f5f9fd", borderRadius: 6, padding: 12, marginBottom: 14, marginTop: 8 }}>
                  <div style={{ fontWeight: 700, color: "#1a2a6e", marginBottom: 8 }}>📄 Conditions de la location financière{serie ? ` — contrat ${idx + 1}/${lignes.length} : ${courante?.reference} (${eur(totalHt)} HT)` : ""}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><label style={LABEL}>Durée irrévocable (mois)</label><input style={CHAMP} type="number" min={1} max={60} value={dureeMois} onChange={(e) => setDureeMois(Math.max(1, Number(e.target.value) || 1))} /></div>
                    <div><label style={LABEL}>1er loyer majoré HT (à la signature)</label><input style={CHAMP} value={premierLoyer || ""} onChange={(e) => setPremierLoyer(Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0)} /></div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    1er loyer : <b>{calcLf.pct_premier.toFixed(1).replace(".", ",")} %</b> du prix d'achat
                    {calcLf.nb_loyers_suivants > 0 ? <> · puis <b>{calcLf.nb_loyers_suivants} loyer{calcLf.nb_loyers_suivants > 1 ? "s" : ""} de {eur(calcLf.loyer_mensuel_ht)} HT</b> ({eur(calcLf.loyer_mensuel_ht * 1.2)} TTC) prélevé{calcLf.nb_loyers_suivants > 1 ? "s" : ""} le 20 du mois</> : null}
                    {" "}· rachat au terme : offert
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#888" }}>Règles : 1er loyer majoré ≥ 30 % du prix HT et 4 loyers mensuels maximum après le 1er — au-delà, dérogation de Jonathan ou Nathalie.</div>
                  {estAdmin && reglesLf.length > 0 && <div style={{ marginTop: 6, fontSize: 12, color: "#8a5a00" }}>⚠ Hors règles ({reglesLf.join(" ; ")}) — autorisé pour un administrateur.</div>}
                </div>
              ) : (
                <>
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
                </>
              )}

              {!locFi && (
                <>
                  <label style={LABEL}>Conditions (imprimées sur le devis)</label>
                  <textarea style={{ ...CHAMP, resize: "vertical" }} rows={4} value={conditions} onChange={(e) => setConditions(e.target.value)} />
                </>
              )}

              {aValider && (
                <div style={{ marginTop: 14, padding: "10px 14px", background: "#fff6e5", border: "1px solid #f0c36d", borderRadius: 6, fontSize: 13, color: "#7a4b00" }}>
                  🔒 <b>{reglesLf.length && depassements.length === reglesLf.length ? "Location financière hors règles" : `Dérogation nécessaire (remise > ${eur(SEUIL_REMISE)} HT par nacelle ou location financière hors règles)`}</b> : {depassements.join(" ; ")}.<br />
                  {serie
                    ? <>Ce contrat sera d'abord soumis à <b>validation</b> (Jonathan Laroche ou Nathalie Neguy) ; les autres partent sans l'attendre, celui-ci partira seul au client dès qu'elle est donnée.</>
                    : <>Le devis sera d'abord soumis à <b>validation</b> (Jonathan Laroche ou Nathalie Neguy) et partira au client dès qu'elle est donnée.</>}
                </div>
              )}
              {derniere && (
                <div style={{ marginTop: 14, border: "1px solid #d6e2f0", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ padding: "8px 12px", background: "#1f4282", color: "white", fontWeight: 700, fontSize: 13 }}>Récapitulatif des {lignes.length} contrats — {client.raison_sociale || "client"}</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f5f9fd", textAlign: "right" }}>
                          <th style={{ textAlign: "left", padding: "6px 10px" }}>Nacelle</th><th style={{ padding: "6px 10px" }}>Prix HT</th><th style={{ padding: "6px 10px" }}>1er loyer HT</th><th style={{ padding: "6px 10px" }}>Durée</th><th style={{ padding: "6px 10px" }}>Mensualités HT</th><th style={{ textAlign: "left", padding: "6px 10px" }}>Validation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map((l) => {
                          const f = financesCompletes()[l.machine_id] || { duree: dureeMois, premier: premierDefaut(Number(l.prix_ht) || 0) };
                          const c = calculerLocFi(Number(l.prix_ht) || 0, f.premier, f.duree);
                          const hr = horsRegles(l, f);
                          return (
                            <tr key={l.machine_id} style={{ borderTop: "1px solid #eef0f4", textAlign: "right" }}>
                              <td style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700 }}>{l.reference}</td>
                              <td style={{ padding: "6px 10px" }}>{eur(Number(l.prix_ht) || 0)}</td>
                              <td style={{ padding: "6px 10px" }}>{eur(f.premier)} <span style={{ color: c.pct_premier < 30 ? "#c0392b" : "#888" }}>({c.pct_premier.toFixed(0)} %)</span></td>
                              <td style={{ padding: "6px 10px" }}>{f.duree} mois</td>
                              <td style={{ padding: "6px 10px" }}>{c.nb_loyers_suivants ? `${c.nb_loyers_suivants} × ${eur(c.loyer_mensuel_ht)}` : "—"}</td>
                              <td style={{ textAlign: "left", padding: "6px 10px", color: hr.length ? "#8a5a00" : "#1e8e3e" }}>{hr.length ? `🔒 ${hr.join(", ")}` : "✓ OK"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {/* Récap */}
              <div style={{ marginTop: 14, padding: "10px 14px", background: "#f8f9fa", borderRadius: 6, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 14 }}>
                <span>Total : <b>{eur(totalHt)} HT</b>{tva ? <> · {eur(totalTtc)} TTC</> : null}</span>
                <span>{locFi ? <>1er loyer majoré : <b>{eur(premierLoyer * 1.2)} TTC</b></> : acompte ? <>Acompte {acompte} % : <b>{eur((totalTtc * acompte) / 100)} TTC</b></> : "Sans acompte (financement)"}</span>
              </div>
              {!cfg.iban && acompte > 0 && !locFi && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#8a5a00" }}>⚠ IBAN non renseigné (Admin → Paramètres des devis) : il n'apparaîtra pas sur le devis.</div>
              )}
              {tente && Object.keys(manquants).length > 0 && (
                <div style={{ marginTop: 10, color: "#c0392b", fontWeight: 600 }}>⚠ {france ? "Client en France : " : ""}indiquez {Object.values(manquants).join(", ")}.</div>
              )}
              {consentement && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  👉 <a href={consentement} target="_blank" rel="noopener noreferrer">Autoriser Delta VO dans DocuSign</a> (une seule fois, avec le compte DocuSign de l'entreprise), puis recommencez.
                </div>
              )}
              {erreur && <div style={{ marginTop: 10, color: "#c0392b", fontWeight: 600 }}>⚠ {erreur}</div>}
              {progression && <div style={{ marginTop: 10, color: "#1a73e8", fontWeight: 600 }}>⏳ {progression}</div>}
            </>
          )}
        </div>

        {serie ? (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: "1px solid #eee", background: "#fafafa", flexWrap: "wrap" }}>
            <button onClick={onClose} disabled={!!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>Annuler</button>
            {idx > 0 && (
              <button onClick={() => allerA(idx - 1)} disabled={!!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>← Contrat {idx}/{lignes.length}</button>
            )}
            {!derniere ? (
              <button onClick={() => { if (contratCourantOk()) allerA(idx + 1); }} disabled={!cfg || !!enCours}
                style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 600, cursor: "pointer" }}>
                Valider ce contrat → contrat {idx + 2}/{lignes.length}
              </button>
            ) : (
              <>
                <button onClick={() => validerSerie("pdf")} disabled={!cfg || !!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #1a73e8", background: "white", color: "#1a73e8", fontWeight: 600, cursor: "pointer" }}>
                  {enCours === "pdf" ? "⏳ …" : `⬇ Créer les ${lignes.length} contrats et télécharger`}
                </button>
                <button onClick={() => validerSerie("email")} disabled={!cfg || !!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 600, cursor: "pointer" }}>
                  {enCours === "email" ? "⏳ Envoi…" : `📧 Créer et envoyer au client (1 seul email)`}
                </button>
              </>
            )}
          </div>
        ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 14, borderTop: "1px solid #eee", background: "#fafafa", flexWrap: "wrap" }}>
          <button onClick={onClose} disabled={!!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #ccc", background: "white", cursor: "pointer" }}>Annuler</button>
          <button onClick={() => valider("pdf")} disabled={!cfg || !!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "1px solid #1a73e8", background: "white", color: "#1a73e8", fontWeight: 600, cursor: "pointer" }}>
            {enCours === "pdf" ? "⏳ …" : aValider ? "🔒 Demander la validation" : "⬇ Créer et télécharger"}
          </button>
          <button onClick={() => valider("email")} disabled={!cfg || !!enCours} style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#1a73e8", color: "white", fontWeight: 600, cursor: "pointer" }}>
            {enCours === "email" ? "⏳ Envoi…" : aValider ? "🔒 Demander la validation puis envoyer" : "📧 Créer et envoyer au client"}
          </button>
          {docusign && (
            <button onClick={() => valider("signature")} disabled={!cfg || !!enCours} title="Le client reçoit un email DocuSign et signe en ligne ; vous êtes prévenu dès la signature"
              style={{ padding: "10px 16px", borderRadius: 6, border: "none", background: "#1e8e3e", color: "white", fontWeight: 600, cursor: "pointer" }}>
              {enCours === "signature" ? "⏳ Envoi DocuSign…" : "✍️ Créer et envoyer pour signature"}
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
