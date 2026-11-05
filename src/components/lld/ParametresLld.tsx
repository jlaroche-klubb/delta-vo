import { useEffect, useState } from "react";
import type { ConfigLLD } from "../../types/lld";
import { ANNEXE_CONTACTS_DEFAUT, ANNEXE_SINISTRES_DEFAUT, ANNEXE_TARIFS_DEFAUT, ANNEXE_VETUSTE_DEFAUT, CG_LLD_DEFAUT, CG_LLD_VERSION, CP_FULL_SERVICES_DEFAUT, CP_SANS_ENTRETIEN_DEFAUT } from "../../data/contratLldTextes";
import {
  agenceVersTexte, chargerConfigLLD, courteDureeVersTexte, enregistrerConfigLLD, grilleVersTexte, modelesVersTexte, optionsVersTexte, prestationsVersTexte,
  texteVersAgence, texteVersCourteDuree, texteVersGrille, texteVersModeles, texteVersOptions, texteVersPrestations,
} from "../../services/lldService";

/**
 * ⚙️ Admin → Paramètres LLD (Jonathan). Tout ce qui change sans développement :
 * modèles, grille tarifaire, courte durée, options, prestations ✓/✗, société,
 * fournisseur Klubb France, SEPA, équipe « Votre agence ».
 * Listes saisies « une ligne = un élément », champs séparés par « ; ».
 */
const champ: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: 8, border: "1px solid #ccd", borderRadius: 6, fontFamily: "inherit", fontSize: 13 };
const mono: React.CSSProperties = { ...champ, fontFamily: "ui-monospace, Menlo, Consolas, monospace", resize: "vertical" };
const lab: React.CSSProperties = { fontWeight: 700, color: "#1a2a6e", fontSize: 13, display: "block", marginBottom: 4 };
const aide: React.CSSProperties = { fontSize: 11, color: "#777", marginTop: 3 };

const TEXTES_CONTRAT: { cle: keyof NonNullable<ConfigLLD["textes_contrat"]>; lib: string; defaut: string; rows: number }[] = [
  { cle: "cp_full", lib: "Conditions particulières — Full services (p. 2-4)", defaut: CP_FULL_SERVICES_DEFAUT, rows: 10 },
  { cle: "cp_sans", lib: "Conditions particulières — Sans entretien (p. 2-4) — version dérivée, à relire", defaut: CP_SANS_ENTRETIEN_DEFAUT, rows: 10 },
  { cle: "cg", lib: "Conditions générales — articles 1 à 16 (p. 7-14)", defaut: CG_LLD_DEFAUT, rows: 16 },
  { cle: "annexe_vetuste", lib: "Annexe — taux de vétusté", defaut: ANNEXE_VETUSTE_DEFAUT, rows: 6 },
  { cle: "annexe_tarifs", lib: "Annexe — tarifs des frais de remise en état (« libellé Facturé montant € »)", defaut: ANNEXE_TARIFS_DEFAUT, rows: 10 },
  { cle: "annexe_sinistres", lib: "Annexe — démarches sinistres et dépannages", defaut: ANNEXE_SINISTRES_DEFAUT, rows: 10 },
  { cle: "annexe_contacts", lib: "Annexe — liste des contacts Delta Services", defaut: ANNEXE_CONTACTS_DEFAUT, rows: 6 },
];

export default function ParametresLld() {
  const [cfg, setCfg] = useState<ConfigLLD | null>(null);
  const [voirTextes, setVoirTextes] = useState(false);
  const [t, setT] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    chargerConfigLLD().then((c) => {
      setCfg(c);
      setT({
        modeles: modelesVersTexte(c.modeles), grille: grilleVersTexte(c.grille), courte: courteDureeVersTexte(c.courte_duree),
        options: optionsVersTexte(c.options), full: prestationsVersTexte(c.prestations_full), sans: prestationsVersTexte(c.prestations_sans_entretien), agence: agenceVersTexte(c.agence),
      });
    });
  }, []);
  if (!cfg) return <div className="loading">Chargement…</div>;

  const setTxt = (k: string, v: string) => { setT((x) => ({ ...x, [k]: v })); setDirty(true); };
  const setC = (patch: Partial<ConfigLLD>) => { setCfg({ ...cfg, ...patch }); setDirty(true); };
  const setS = (bloc: "societe" | "fournisseur" | "sepa", k: string, v: any) => setC({ [bloc]: { ...(cfg[bloc] as any), [k]: v } } as any);
  const textes = cfg.textes_contrat || {};
  /** Texte vide = texte par défaut (on n'enregistre que ce qui diffère du défaut) */
  const setTexte = (k: keyof NonNullable<ConfigLLD["textes_contrat"]>, v: string, defaut: string) => setC({ textes_contrat: { ...textes, [k]: v.trim() === defaut.trim() ? "" : v } });

  const grille = texteVersGrille(t.grille || "");
  const modeles = texteVersModeles(t.modeles || "");
  const horsListe = [...new Set(grille.map((g) => g.modele))].filter((m) => !modeles.some((x) => x.toLowerCase() === m.toLowerCase()));

  async function enregistrer() {
    if (!cfg) return;
    setSaving(true); setMsg("");
    try {
      const c: ConfigLLD = {
        ...cfg, modeles, grille, courte_duree: texteVersCourteDuree(t.courte || ""), options: texteVersOptions(t.options || ""),
        prestations_full: texteVersPrestations(t.full || ""), prestations_sans_entretien: texteVersPrestations(t.sans || ""), agence: texteVersAgence(t.agence || ""),
      };
      await enregistrerConfigLLD(c);
      setCfg(c); setDirty(false); setMsg(`✅ Enregistré : ${c.modeles.length} modèles, ${c.grille.length} lignes de grille, ${c.options.length} options.`);
    } catch (e: any) { setMsg(`❌ ${e?.message || "Enregistrement impossible"}`); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        <div>
          <label style={lab}>🚐 Modèles de nacelle (un par ligne, dans l'ordre d'affichage)</label>
          <textarea style={mono} rows={6} value={t.modeles || ""} onChange={(e) => setTxt("modeles", e.target.value)} placeholder={"KL26 TRQ\nKL 21B\nKL 32"} />
          {horsListe.length > 0 && <div style={{ ...aide, color: "#8a5a00" }}>⚠ Dans la grille mais pas dans la liste : {horsListe.join(", ")}</div>}
        </div>
        <div>
          <label style={lab}>💶 Grille tarifaire standard — modèle ; durée (mois) ; loyer HT ; neuf ou VO ; assurance HT (facultatif)</label>
          <textarea style={mono} rows={6} value={t.grille || ""} onChange={(e) => setTxt("grille", e.target.value)} placeholder={"KL26 TRQ ; 36 ; 1250 ; VO ; 85\nKL26 TRQ ; 24 ; 1390 ; VO\nKL 32 ; 36 ; 1490 ; neuf ; 95"} />
          <div style={aide}>{grille.length} ligne{grille.length > 1 ? "s" : ""} lue{grille.length > 1 ? "s" : ""}. Le loyer prérempli dans l'offre vient d'ici ; il reste modifiable à la main.</div>
        </div>
        <div>
          <label style={lab}>⏱ Courte durée — modèle ; nombre de mois (1 à 11) ; loyer HT / mois</label>
          <textarea style={mono} rows={4} value={t.courte || ""} onChange={(e) => setTxt("courte", e.target.value)} placeholder={"KL26 TRQ ; 1 ; 1900\nKL26 TRQ ; 6 ; 1600"} />
        </div>
        <div>
          <label style={lab}>➕ Options par défaut — libellé ; prix mensuel HT</label>
          <textarea style={mono} rows={4} value={t.options || ""} onChange={(e) => setTxt("options", e.target.value)} placeholder={"4 pneumatiques / an ; 90\nVéhicule de remplacement ; 130"} />
        </div>
        <div>
          <label style={lab}>✓ Prestations — Full services (libellé ; oui/non)</label>
          <textarea style={mono} rows={7} value={t.full || ""} onChange={(e) => setTxt("full", e.target.value)} />
        </div>
        <div>
          <label style={lab}>✗ Prestations — Sans entretien (libellé ; oui/non)</label>
          <textarea style={mono} rows={7} value={t.sans || ""} onChange={(e) => setTxt("sans", e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignContent: "start" }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={lab}>📏 Valeurs par défaut de l'offre</label></div>
          <div><label style={{ ...lab, fontWeight: 600 }}>Km / an</label><input style={champ} type="number" value={cfg.km_an_defaut} onChange={(e) => setC({ km_an_defaut: Number(e.target.value) || 0 })} /></div>
          <div><label style={{ ...lab, fontWeight: 600 }}>Heures nacelle</label><input style={champ} value={cfg.heures_defaut} onChange={(e) => setC({ heures_defaut: e.target.value })} /></div>
          <div><label style={{ ...lab, fontWeight: 600 }}>Prix du km sup. HT (€)</label><input style={champ} value={cfg.prix_km_sup_defaut} onChange={(e) => setC({ prix_km_sup_defaut: Number(e.target.value.replace(",", ".")) || 0 })} /></div>
          <div><label style={{ ...lab, fontWeight: 600 }}>Validité de l'offre (jours)</label><input style={champ} type="number" value={cfg.validite_offre_jours} onChange={(e) => setC({ validite_offre_jours: Number(e.target.value) || 30 })} /></div>
        </div>
        <div>
          <label style={lab}>👥 Équipe « Votre agence » (page 4 de l'offre) — nom ; fonction ; email ; téléphone</label>
          <textarea style={mono} rows={5} value={t.agence || ""} onChange={(e) => setTxt("agence", e.target.value)} placeholder={"Jonathan Laroche ; Directeur commercial ; jlaroche@klubb.com ; 07 87 91 60 06"} />
        </div>
        <div>
          <label style={lab}>🏢 Delta Services (bailleur)</label>
          <input style={{ ...champ, marginBottom: 6 }} value={cfg.societe.raison_sociale} onChange={(e) => setS("societe", "raison_sociale", e.target.value)} placeholder="Raison sociale" />
          <textarea style={{ ...champ, marginBottom: 6 }} rows={2} value={cfg.societe.adresse} onChange={(e) => setS("societe", "adresse", e.target.value)} placeholder="Adresse (une seule, celle des contrats)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <input style={champ} value={cfg.societe.siren} onChange={(e) => setS("societe", "siren", e.target.value)} placeholder="SIREN" />
            <input style={champ} value={cfg.societe.telephone} onChange={(e) => setS("societe", "telephone", e.target.value)} placeholder="Téléphone" />
            <input style={champ} value={cfg.societe.site_web} onChange={(e) => setS("societe", "site_web", e.target.value)} placeholder="Site web" />
            <input style={champ} value={cfg.societe.email} onChange={(e) => setS("societe", "email", e.target.value)} placeholder="Email (jlaroche@…)" />
          </div>
        </div>
        <div>
          <label style={lab}>🏭 Klubb France (fournisseur, page 1 du contrat)</label>
          <input style={{ ...champ, marginBottom: 6 }} value={cfg.fournisseur.raison_sociale} onChange={(e) => setS("fournisseur", "raison_sociale", e.target.value)} placeholder="Raison sociale" />
          <textarea style={{ ...champ, marginBottom: 6 }} rows={2} value={cfg.fournisseur.adresse} onChange={(e) => setS("fournisseur", "adresse", e.target.value)} placeholder="Adresse" />
          <input style={champ} value={cfg.fournisseur.siren} onChange={(e) => setS("fournisseur", "siren", e.target.value)} placeholder="SIREN" />
        </div>
        <div>
          <label style={lab}>🏦 Mandat SEPA (créancier)</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
            <input style={champ} value={cfg.sepa.ics} onChange={(e) => setS("sepa", "ics", e.target.value)} placeholder="ICS (FR35ZZZ…)" />
            <input style={champ} type="number" min={1} max={28} value={cfg.sepa.jour_prelevement} onChange={(e) => setS("sepa", "jour_prelevement", Number(e.target.value) || 20)} placeholder="Jour de prélèvement" />
          </div>
          <input style={{ ...champ, marginBottom: 6 }} value={cfg.sepa.creancier} onChange={(e) => setS("sepa", "creancier", e.target.value)} placeholder="Nom du créancier" />
          <textarea style={champ} rows={2} value={cfg.sepa.adresse_creancier} onChange={(e) => setS("sepa", "adresse_creancier", e.target.value)} placeholder="Adresse du créancier (celle déclarée à la banque pour l'ICS)" />
          <div style={aide}>À vérifier avec la compta : 12 ou 14 avenue James de Rothschild (doit correspondre à l'ICS).</div>
        </div>
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid #e3e7ee", paddingTop: 12 }}>
        <button type="button" className="btn-secondary" onClick={() => setVoirTextes((v) => !v)} style={{ fontWeight: 700 }}>{voirTextes ? "▲" : "▼"} 📑 Textes du contrat LLD (conditions particulières, générales, annexes)</button>
        <div style={aide}>Textes du contrat DS2026LD-08-01 (août 2026) par défaut. Une ligne = un paragraphe ; « - » ou « o » en début de ligne = puce ; une ligne en MAJUSCULES ou « Article n - TITRE » = titre. Vider un champ remet le texte par défaut. Changer la version des CG fige la nouvelle version sur les contrats créés ensuite.</div>
        {voirTextes && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginTop: 10 }}>
            <div style={{ maxWidth: 260 }}>
              <label style={lab}>Version des conditions générales</label>
              <input style={champ} value={textes.cg_version || ""} onChange={(e) => setC({ textes_contrat: { ...textes, cg_version: e.target.value } })} placeholder={CG_LLD_VERSION} />
            </div>
            {TEXTES_CONTRAT.map((x) => {
              const val = textes[x.cle] || "";
              return (
                <div key={x.cle}>
                  <label style={lab}>{x.lib} {val ? <span style={{ color: "#8a5a00", fontWeight: 600 }}>— modifié</span> : <span style={{ color: "#777", fontWeight: 400 }}>— texte par défaut</span>}</label>
                  <textarea style={{ ...mono, fontSize: 12 }} rows={x.rows} value={val || x.defaut} onChange={(e) => setTexte(x.cle, e.target.value, x.defaut)} />
                  {val && <button type="button" className="btn-secondary" style={{ marginTop: 4, fontSize: 12 }} onClick={() => setTexte(x.cle, "", x.defaut)}>↺ Revenir au texte par défaut</button>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="admin-card-actions" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn-approve" onClick={enregistrer} disabled={saving || !dirty}>{saving ? "…" : "💾 Enregistrer les paramètres LLD"}</button>
        {dirty && <span className="section-desc" style={{ fontStyle: "italic" }}>Modifications non enregistrées</span>}
        {msg && <span className="section-desc">{msg}</span>}
      </div>
    </>
  );
}
