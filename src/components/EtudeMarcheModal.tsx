import { useState } from "react";
import { Machine, EtudeMarche } from "../types/machine";
import { useTranslation } from "react-i18next";

// 📊 ÉTUDE DE MARCHÉ IA — SUPER ADMIN UNIQUEMENT (validé avec Jonathan).
// Recherche web des annonces comparables (MachineryZone, Truckscorner,
// LeBonCoin, Agriaffaires, Mascus, sites ViaMobilis) et fourchette de prix
// « pour avoir un ordre d'idée ». Le résultat est enregistré sur la machine
// et repris dans l'Export Pricing PDG — la décision de prix reste au PDG.

interface EtudeMarcheModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (machineId: string, etude: EtudeMarche) => void;
}

const eur = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString("fr-FR") + " €";

export default function EtudeMarcheModal({
  machine,
  userName,
  onClose,
  onSave,
}: EtudeMarcheModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etude, setEtude] = useState<EtudeMarche | undefined>(machine.etude_marche);

  async function lancer() {
    setBusy(true);
    setError(null);
    try {
      const fc = machine.fiche_commerciale || {};
      const resp = await fetch("/api/etude-marche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type_nacelle: machine.type_nacelle || "",
          modele_porteur: machine.modele_porteur || "",
          annee: machine.annee_circulation || "",
          heures: machine.heures_nacelle ?? "",
          km: machine.km_porteur ?? "",
          hauteur: fc.hauteur_travail_m ?? "",
          deport: fc.deport_travail_m ?? "",
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || `Erreur ${resp.status}`);
      const nouvelle: EtudeMarche = {
        date: new Date().toISOString().slice(0, 10),
        par: userName,
        fourchette_basse: data.fourchette_basse ?? undefined,
        fourchette_haute: data.fourchette_haute ?? undefined,
        mediane: data.mediane ?? undefined,
        nb_annonces: data.nb_annonces ?? 0,
        commentaire: data.commentaire || "",
        annonces: data.annonces || [],
      };
      setEtude(nouvelle);
      onSave(machine.id, nouvelle); // enregistrement immédiat
    } catch (e: any) {
      console.error("❌ Étude de marché:", e);
      setError(t("modals.etudeFail") + (e?.message ? ` (${e.message})` : ""));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 760, width: "94%" }}>
        <div className="modal-header">
          <div>
            <h2>📊 {t("modals.etudeTitle")} — {machine.immat}</h2>
            <div className="modal-subtitle">
              {machine.type_nacelle} {machine.modele_porteur} · {machine.annee_circulation}
              {machine.heures_nacelle != null ? ` · ${machine.heures_nacelle} h` : ""}
              {machine.km_porteur != null ? ` · ${machine.km_porteur.toLocaleString("fr-FR")} km` : ""}
            </div>
          </div>
          <button className="btn-close" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div style={{ padding: "8px 20px 20px", maxHeight: "72vh", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <button className="btn-primary" onClick={lancer} disabled={busy}>
              {busy
                ? `⏳ ${t("modals.etudeRunning")}`
                : etude
                ? `↻ ${t("modals.etudeRefresh")}`
                : `🔍 ${t("modals.etudeLaunch")}`}
            </button>
            {etude?.date && (
              <span style={{ fontSize: 12.5, color: "#667085" }}>
                {t("modals.etudeLast", { date: new Date(etude.date).toLocaleDateString("fr-FR") })}
                {etude.par ? ` · ${etude.par}` : ""}
              </span>
            )}
          </div>
          {busy && (
            <div style={{ fontSize: 13, color: "#667085", marginBottom: 10 }}>
              {t("modals.etudeWait")}
            </div>
          )}
          {error && <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 10 }}>{error}</div>}

          {etude && !busy && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                {[
                  [t("modals.etudeLow"), etude.fourchette_basse],
                  [t("modals.etudeMedian"), etude.mediane],
                  [t("modals.etudeHigh"), etude.fourchette_haute],
                ].map(([label, val]) => (
                  <div
                    key={label as string}
                    style={{
                      background: "#f6f8fc",
                      border: "1px solid #d8dbe6",
                      borderRadius: 8,
                      padding: "10px 12px",
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#667085", textTransform: "uppercase", letterSpacing: 1 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#1a2a6e" }}>
                      {eur(val as number | undefined)}
                    </div>
                  </div>
                ))}
              </div>

              {etude.commentaire && (
                <div
                  style={{
                    background: "#fdf8e8",
                    border: "1px solid #e6d9a8",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 13,
                    marginBottom: 12,
                  }}
                >
                  💬 {etude.commentaire}
                </div>
              )}

              <h3 style={{ fontSize: 14, color: "#1a2a6e", margin: "10px 0 6px" }}>
                {t("modals.etudeAds")} ({etude.annonces?.length || 0})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(etude.annonces || []).map((a, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      border: "1px solid #e4e7f0",
                      borderRadius: 6,
                      padding: "7px 10px",
                      fontSize: 13,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer" style={{ color: "#1a2a6e" }}>
                            {a.titre || a.url}
                          </a>
                        ) : (
                          a.titre || "—"
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#667085" }}>
                        {[a.site, a.annee, a.heures && `${a.heures} h`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{eur(a.prix_eur)}</div>
                  </div>
                ))}
                {(etude.annonces || []).length === 0 && (
                  <div style={{ color: "#98a2b3", fontSize: 13 }}>{t("modals.etudeNoAds")}</div>
                )}
              </div>

              <div style={{ fontSize: 11.5, color: "#98a2b3", marginTop: 12 }}>
                {t("modals.etudeDisclaimer")}
              </div>
            </>
          )}

          {!etude && !busy && (
            <div style={{ color: "#667085", fontSize: 13.5 }}>{t("modals.etudeEmpty")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
