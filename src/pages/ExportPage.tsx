import { useState, useEffect } from "react";
import FicheExportTemplate, { FicheExportData } from "../components/FicheExportTemplate";
import { generateExportPdf } from "../utils/generateExportPdf";
import { removeBgViaProxy, composeExportPhoto } from "../utils/detourage";

interface ExportPageProps {
  userName?: string;
  userEmail?: string;
}

const PREVIEW_SCALE = 0.62;
const PAGE_W = 794;
const PAGE_H = 1123;

// 4 emplacements : 1 grande + 3 petites. Par défaut 3 détourées + 1 brute.
const PHOTO_LABELS = ["Photo principale (grande)", "Photo 2", "Photo 3", "Photo 4"];
const DEFAULT_DETOUR = [true, true, true, false];

interface Slot {
  raw?: string;     // upload original (data URL)
  cutout?: string;  // résultat remove.bg (PNG transparent)
  out?: string;     // image composée finale (détourée + logo + bandeau)
  detour: boolean;
  busy: boolean;
  error?: string;
}

const initSlots = (): Slot[] => DEFAULT_DETOUR.map((d) => ({ detour: d, busy: false }));

interface TextForm {
  reference: string;
  workingHeight: string;
  outreach: string;
  basketPersons: string;
  hours: string;
  typeNacelle: string;
  chassisModel: string;
  year: string;
  mileage: string;
  interiorFitting: string;
  price: string;
  currency: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
}

const emptyText = (name?: string, email?: string): TextForm => ({
  reference: "",
  workingHeight: "",
  outreach: "",
  basketPersons: "",
  hours: "",
  typeNacelle: "",
  chassisModel: "",
  year: "",
  mileage: "",
  interiorFitting: "",
  price: "",
  currency: "€",
  contactName: name || "",
  contactEmail: email || "",
  contactPhone: "",
});

export default function ExportPage({ userName, userEmail }: ExportPageProps) {
  const [form, setForm] = useState<TextForm>(emptyText(userName, userEmail));
  const [optionsText, setOptionsText] = useState("");
  const [slots, setSlots] = useState<Slot[]>(initSlots());
  const [generating, setGenerating] = useState(false);

  const set = (key: keyof TextForm, value: string) => setForm((f) => ({ ...f, [key]: value }));

  function patchSlot(i: number, patch: Partial<Slot>) {
    setSlots((arr) => arr.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function processSlot(i: number, raw: string, reference: string) {
    patchSlot(i, { busy: true, error: undefined });
    try {
      const cutout = await removeBgViaProxy(raw);
      const out = (await composeExportPhoto(cutout, reference)) || raw;
      patchSlot(i, { cutout, out, busy: false });
    } catch (e: any) {
      // Échec détourage : on retombe sur la photo brute pour ne pas bloquer la fiche
      patchSlot(i, { busy: false, error: e?.message || "Échec détourage", out: raw });
    }
  }

  function handleFile(i: number, file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      patchSlot(i, { raw, cutout: undefined, out: undefined, error: undefined });
      setSlots((arr) => {
        if (arr[i].detour) processSlot(i, raw, form.reference);
        return arr;
      });
    };
    reader.readAsDataURL(file);
  }

  function toggleDetour(i: number) {
    setSlots((arr) => {
      const s = arr[i];
      const next = !s.detour;
      // Activation : recomposer depuis le cutout si on l'a déjà, sinon détourer
      if (next && s.raw) {
        if (s.cutout) {
          composeExportPhoto(s.cutout, form.reference).then((out) =>
            patchSlot(i, { out: out || s.raw })
          );
        } else {
          processSlot(i, s.raw, form.reference);
        }
      }
      return arr.map((x, idx) => (idx === i ? { ...x, detour: next } : x));
    });
  }

  function removePhoto(i: number) {
    patchSlot(i, { raw: undefined, cutout: undefined, out: undefined, error: undefined });
  }

  // Référence modifiée → recomposer le bandeau des photos déjà détourées (sans rappeler remove.bg)
  useEffect(() => {
    slots.forEach((s, i) => {
      if (s.detour && s.cutout) {
        composeExportPhoto(s.cutout, form.reference).then((out) => {
          if (out) patchSlot(i, { out });
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.reference]);

  function resetAll() {
    setForm(emptyText(userName, userEmail));
    setOptionsText("");
    setSlots(initSlots());
  }

  const anyBusy = slots.some((s) => s.busy);

  async function handleGenerate() {
    setGenerating(true);
    setTimeout(async () => {
      try {
        await generateExportPdf(form.reference);
      } catch (err: any) {
        alert("❌ Erreur lors de la génération du PDF : " + err.message);
        console.error(err);
      } finally {
        setGenerating(false);
      }
    }, 150);
  }

  // Image affichée par emplacement : composée si détourée, sinon brute
  const photoUrls = slots.map((s) => (s.detour ? s.out : s.raw));

  const data: FicheExportData = {
    ...form,
    options: optionsText.split("\n").map((s) => s.trim()).filter(Boolean),
    photos: photoUrls,
  };

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={headerRow}>
        <div>
          <h1 style={pageTitle}>🌍 Fiches export (anglais)</h1>
          <p style={pageSubtitle}>
            Saisie manuelle — la fiche est générée en PDF et n'est <strong>pas</strong> enregistrée
            dans le stock.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={resetAll} style={btnSecondary} disabled={generating}>
            Réinitialiser
          </button>
          <button onClick={handleGenerate} style={btnPrimary} disabled={generating || anyBusy}>
            {generating ? "Génération…" : anyBusy ? "Détourage en cours…" : "📄 Télécharger le PDF"}
          </button>
        </div>
      </div>

      <div style={layout}>
        {/* ---- FORMULAIRE ---- */}
        <div style={formCol}>
          <Section title="Identification">
            <Field label="Référence (REF + bandeau photo)">
              <input style={input} value={form.reference} onChange={(e) => set("reference", e.target.value)} />
            </Field>
          </Section>

          <Section title="Nacelle">
            <Field label="Type (ex. 16 m)">
              <input style={input} value={form.typeNacelle} onChange={(e) => set("typeNacelle", e.target.value)} />
            </Field>
            <Row>
              <Field label="Hauteur de travail (m)">
                <input style={input} value={form.workingHeight} onChange={(e) => set("workingHeight", e.target.value)} />
              </Field>
              <Field label="Déport (m)">
                <input style={input} value={form.outreach} onChange={(e) => set("outreach", e.target.value)} />
              </Field>
            </Row>
            <Row>
              <Field label="Personnes panier">
                <input style={input} value={form.basketPersons} onChange={(e) => set("basketPersons", e.target.value)} />
              </Field>
              <Field label="Heures">
                <input style={input} value={form.hours} onChange={(e) => set("hours", e.target.value)} />
              </Field>
            </Row>
          </Section>

          <Section title="Porteur">
            <Field label="Modèle porteur">
              <input style={input} value={form.chassisModel} onChange={(e) => set("chassisModel", e.target.value)} />
            </Field>
            <Row>
              <Field label="Année">
                <input style={input} value={form.year} onChange={(e) => set("year", e.target.value)} />
              </Field>
              <Field label="Kilométrage (km)">
                <input style={input} value={form.mileage} onChange={(e) => set("mileage", e.target.value)} />
              </Field>
            </Row>
          </Section>

          <Section title="Aménagement & options">
            <Field label="Aménagement intérieur">
              <input style={input} value={form.interiorFitting} onChange={(e) => set("interiorFitting", e.target.value)} />
            </Field>
            <Field label="Options (une par ligne)">
              <textarea
                style={{ ...input, height: 80, resize: "vertical" }}
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
              />
            </Field>
          </Section>

          <Section title="Prix">
            <Row>
              <Field label="Montant">
                <input style={input} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="ex. 32000" />
              </Field>
              <Field label="Devise">
                <input style={{ ...input, width: 80 }} value={form.currency} onChange={(e) => set("currency", e.target.value)} />
              </Field>
            </Row>
          </Section>

          <Section title="Photos — 1 grande + 3 petites">
            <div style={photoHint}>
              ✂️ Détourée = fond + logo Delta + bandeau réf. · ● Brute = photo telle quelle (indiquée ci-dessous).
            </div>
            {PHOTO_LABELS.map((label, i) => {
              const s = slots[i];
              const thumb = s.detour ? s.out : s.raw;
              return (
                <div key={i} style={photoSlotBox}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4a5468" }}>{label}</span>
                    {s.detour ? (
                      <span style={badgeDetour}>✂️ Détourée</span>
                    ) : (
                      <span style={badgeRaw}>● Brute — non détourée</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {thumb ? (
                      <img src={thumb} alt="" style={thumbStyle} />
                    ) : (
                      <div style={{ ...thumbStyle, display: "flex", alignItems: "center", justifyContent: "center", color: "#9aa3b2", fontSize: 18 }}>
                        {s.busy ? "⏳" : "📷"}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <input type="file" accept="image/*" style={{ fontSize: 12 }} onChange={(e) => handleFile(i, e.target.files?.[0] || null)} />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 6, cursor: "pointer" }}>
                        <input type="checkbox" checked={s.detour} onChange={() => toggleDetour(i)} disabled={s.busy} />
                        Détourer cette photo
                      </label>
                      {s.busy && <div style={{ fontSize: 11, color: "#1a2a6e", marginTop: 4 }}>Détourage en cours…</div>}
                      {s.error && <div style={{ fontSize: 11, color: "#c8102e", marginTop: 4 }}>{s.error}</div>}
                    </div>
                    {s.raw && (
                      <button onClick={() => removePhoto(i)} style={btnRemove} type="button">✕</button>
                    )}
                  </div>
                </div>
              );
            })}
          </Section>

          <Section title="Contact">
            <Field label="Nom">
              <input style={input} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </Field>
            <Row>
              <Field label="Téléphone">
                <input style={input} value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
              </Field>
              <Field label="Email">
                <input style={input} value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
              </Field>
            </Row>
          </Section>
        </div>

        {/* ---- APERÇU ---- */}
        <div style={previewCol}>
          <div style={previewSticky}>
            <div style={previewLabel}>Aperçu A4</div>
            <div
              style={{
                width: PAGE_W * PREVIEW_SCALE,
                height: PAGE_H * PREVIEW_SCALE,
                overflow: "hidden",
                border: "1px solid #d9deee",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                background: "#fff",
              }}
            >
              <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
                <FicheExportTemplate data={data} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instance cachée plein format pour la capture PDF */}
      <div style={{ position: "fixed", top: "-10000px", left: "-10000px", zIndex: -1 }}>
        <FicheExportTemplate data={data} domId="fiche-export-page-1" />
      </div>

      {generating && (
        <div className="pdf-loader-overlay">
          <div className="pdf-loader-box">
            <div className="pdf-loader-spinner">📄</div>
            <div className="pdf-loader-text">Génération du PDF en cours...</div>
            <div className="pdf-loader-sub">Le téléchargement va démarrer dans quelques secondes</div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============== Sous-composants UI ===============

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={section}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={field}>
      <span style={fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 12 }}>{children}</div>;
}

// =============== STYLES ===============

const headerRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 };
const pageTitle: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: "#1a2a6e", margin: 0 };
const pageSubtitle: React.CSSProperties = { fontSize: 13, color: "#4a5468", margin: "4px 0 0" };
const layout: React.CSSProperties = { display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" };
const formCol: React.CSSProperties = { flex: "1 1 420px", minWidth: 320, display: "flex", flexDirection: "column", gap: 16 };
const previewCol: React.CSSProperties = { flex: "1 1 500px", minWidth: 300 };
const previewSticky: React.CSSProperties = { position: "sticky", top: 90 };
const previewLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#6a7488", marginBottom: 8 };
const section: React.CSSProperties = { background: "#fff", border: "1px solid #e5e8ec", borderRadius: 8, padding: "14px 16px" };
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 900, letterSpacing: 1, textTransform: "uppercase", color: "#c8102e", marginBottom: 10 };
const field: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, flex: 1 };
const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#4a5468" };
const input: React.CSSProperties = { border: "1px solid #d0d4da", borderRadius: 5, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", width: "100%", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { background: "#1a2a6e", color: "#fff", border: "none", borderRadius: 6, padding: "10px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#1a2a6e", border: "1px solid #1a2a6e", borderRadius: 6, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnRemove: React.CSSProperties = { background: "#c8102e", color: "#fff", border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 12, cursor: "pointer", alignSelf: "flex-start" };
const photoHint: React.CSSProperties = { fontSize: 11, color: "#6a7488", marginBottom: 10, lineHeight: 1.5 };
const photoSlotBox: React.CSSProperties = { border: "1px solid #e5e8ec", borderRadius: 6, padding: 10, marginBottom: 10 };
const thumbStyle: React.CSSProperties = { width: 64, height: 64, objectFit: "cover", borderRadius: 4, border: "1px solid #d0d4da", background: "#f7f8fa", flexShrink: 0 };
const badgeDetour: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#1a2a6e", background: "#e8edff", border: "1px solid #c7d2f5", borderRadius: 4, padding: "2px 6px" };
const badgeRaw: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#9a6a00", background: "#fff4dc", border: "1px solid #f0d79a", borderRadius: 4, padding: "2px 6px" };
