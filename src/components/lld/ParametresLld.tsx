import { useEffect, useState } from "react";
import type { ConfigLLD } from "../../types/lld";
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

export default function ParametresLld() {
  const [cfg, setCfg] = useState<ConfigLLD | null>(null);
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
      <div className="admin-card-actions" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button className="btn-approve" onClick={enregistrer} disabled={saving || !dirty}>{saving ? "…" : "💾 Enregistrer les paramètres LLD"}</button>
        {dirty && <span className="section-desc" style={{ fontStyle: "italic" }}>Modifications non enregistrées</span>}
        {msg && <span className="section-desc">{msg}</span>}
      </div>
    </>
  );
}
