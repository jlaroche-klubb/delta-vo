import { useMemo, useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { storage, db } from "../firebase";
import { Machine, PhotoSupplementaire } from "../types/machine";
import { useTranslation } from "react-i18next";

interface PhotosModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (machineId: string, photos: PhotoSupplementaire[]) => void;
  onShareTokenChange: (machineId: string, token: string | null) => void;
}

// Les 4 vues officielles de la fiche VO (verrouillées, jamais modifiables ici)
const OFFICIELLES: { key: keyof NonNullable<Machine["photos_commerciales"]>; label: string }[] = [
  { key: "av_droit", label: "modals.photoFrontRight" },
  { key: "av_gauche", label: "modals.photoFrontLeft" },
  { key: "ar_droit", label: "modals.photoRearRight" },
  { key: "ar_gauche", label: "modals.photoRearLeft" },
];

export default function PhotosModal({
  machine,
  userName,
  onClose,
  onSave,
  onShareTokenChange,
}: PhotosModalProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<PhotoSupplementaire[]>(
    machine.photos_supplementaires ? [...machine.photos_supplementaires] : []
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Partage client ──
  const [shareToken, setShareToken] = useState<string | null>(machine.share_token || null);
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const shareUrl = shareToken ? `${window.location.origin}/galerie/${shareToken}` : "";

  // ── 📄 Remplacement des photos de la FICHE DE VENTE (rotation + détourage) ──
  const [ficheSlot, setFicheSlot] = useState<string | null>(null);   // slot en cours de remplacement
  const [pick, setPick] = useState<{ url: string } | null>(null);    // photo choisie
  const [pickRot, setPickRot] = useState(0);                          // quarts de tour
  const [pickDetour, setPickDetour] = useState(true);
  const [ficheBusy, setFicheBusy] = useState(false);
  const [ficheMsg, setFicheMsg] = useState<string | null>(null);
  const [slotOverrides, setSlotOverrides] = useState<Record<string, string>>({});
  const [rotBusy, setRotBusy] = useState<string | null>(null);

  const officielles = machine.photos_commerciales || {};

  // URLs des 4 photos officielles : on les exclut du pool pour éviter les doublons
  const officiellesUrls = useMemo(
    () => new Set(Object.values(officielles).filter(Boolean) as string[]),
    [officielles]
  );

  // Pool Nacelle-Expert (retour puis départ), dédupliqué et sans les 4 officielles
  const pool = useMemo(() => {
    const all = [
      ...(machine.photos_ne_retour || []),
      ...(machine.photos_ne_depart || []),
    ];
    const seen = new Set<string>();
    return all.filter((url) => {
      if (!url || officiellesUrls.has(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  }, [machine.photos_ne_retour, machine.photos_ne_depart, officiellesUrls]);

  const isSelected = (url: string) => photos.some((p) => p.url === url);

  function togglePoolPhoto(url: string) {
    setPhotos((prev) =>
      prev.some((p) => p.url === url)
        ? prev.filter((p) => p.url !== url)
        : [
            ...prev,
            {
              url,
              source: "nacelle_expert" as const,
              ajout_at: new Date().toISOString(),
              ajout_par: userName,
            },
          ]
    );
  }

  // ── Outils image : téléchargement, rotation, upload ──
  async function urlToBase64(url: string): Promise<string> {
    const r = await fetch(url);
    if (!r.ok) throw new Error("téléchargement " + r.status);
    const blob = await r.blob();
    return await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  async function rotateBase64(b64: string, quarter: number, quality = 0.9): Promise<string> {
    if (!quarter) return b64;
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = b64;
    });
    const c = document.createElement("canvas");
    const swap = quarter % 2 === 1;
    c.width = swap ? img.height : img.width;
    c.height = swap ? img.width : img.height;
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(((quarter % 4) * Math.PI) / 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    return c.toDataURL("image/jpeg", quality);
  }

  async function uploadBase64(b64: string, path: string): Promise<string> {
    const blob = await (await fetch(b64)).blob();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  }

  // ↻ Rotation d'une photo supplémentaire (persistée au clic sur Enregistrer)
  async function rotatePhotoSupp(pPhoto: PhotoSupplementaire) {
    try {
      setRotBusy(pPhoto.url);
      const b64 = await rotateBase64(await urlToBase64(pPhoto.url), 1);
      const url = await uploadBase64(b64, `machines/${machine.immat}/supplementaires/rot_${Date.now()}.jpg`);
      setPhotos((prev) => prev.map((x) => (x.url === pPhoto.url ? { ...x, url } : x)));
    } catch (e) {
      console.error("❌ Rotation:", e);
      setError(t("modals.ficheRotateFail"));
    } finally {
      setRotBusy(null);
    }
  }

  // 📄 Applique la photo choisie (rotation + détourage éventuel) au slot de la fiche
  async function applyFichePhoto() {
    if (!ficheSlot || !pick) return;
    setFicheBusy(true);
    setError(null);
    try {
      let b64 = await urlToBase64(pick.url);
      b64 = await rotateBase64(b64, pickRot);
      if (pickDetour) {
        const raw = b64.replace(/^data:image\/\w+;base64,/, "");
        const resp = await fetch("/api/removebg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: raw }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data.imageBase64) throw new Error(data?.error || "détourage indisponible");
        b64 = "data:image/png;base64," + data.imageBase64;
      }
      const url = await uploadBase64(
        b64,
        `machines/${machine.immat}/fiche/${ficheSlot}_${Date.now()}.${pickDetour ? "png" : "jpg"}`
      );
      // Source canonique lue par la fiche VO (machine.photos_ventes)
      await updateDoc(doc(db, "machines_vo", machine.id), {
        [`dossier_nacelle_expert.photos_commerciales.${ficheSlot}`]: { url, type: "storage" },
        updatedAt: new Date().toISOString(),
      });
      setSlotOverrides((prev) => ({ ...prev, [ficheSlot]: url }));
      setFicheMsg(t("modals.ficheDone"));
      setTimeout(() => setFicheMsg(null), 4000);
      setFicheSlot(null);
      setPick(null);
      setPickRot(0);
    } catch (e: any) {
      console.error("❌ Photo de fiche:", e);
      setError(t("modals.ficheFail") + (e?.message ? ` (${e.message})` : ""));
    } finally {
      setFicheBusy(false);
    }
  }

  function removePhoto(url: string) {
    setPhotos((prev) => prev.filter((p) => p.url !== url));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const ajoutees: PhotoSupplementaire[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          setError(t("modals.photoOnlyImages"));
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `machines/${machine.immat}/supplementaires/${Date.now()}_${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        ajoutees.push({
          url,
          nom: file.name,
          source: "upload",
          ajout_at: new Date().toISOString(),
          ajout_par: userName,
        });
      }
      setPhotos((prev) => [...prev, ...ajoutees]);
    } catch (e: any) {
      console.error("❌ Erreur upload photo:", e);
      setError(t("modals.docUploadFail"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Liste des photos partagées = 4 officielles + supplémentaires (dédupliquées, ordre conservé)
  function buildSharePhotos(): string[] {
    const officiellesUrlsArr = Object.values(officielles).filter(Boolean) as string[];
    const suppUrls = photos.map((p) => p.url);
    const seen = new Set<string>();
    return [...officiellesUrlsArr, ...suppUrls].filter((u) => {
      if (!u || seen.has(u)) return false;
      seen.add(u);
      return true;
    });
  }

  function genToken(): string {
    const raw =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return raw.replace(/-/g, "");
  }

  async function generateOrUpdateShare() {
    const sharePhotos = buildSharePhotos();
    if (sharePhotos.length === 0) {
      setError(t("modals.photoNoneToShare"));
      return;
    }
    setShareBusy(true);
    setError(null);
    try {
      // On enregistre d'abord la sélection pour que machine et lien restent cohérents
      onSave(machine.id, photos);

      const token = shareToken || genToken();
      await setDoc(doc(db, "shares", token), {
        immat: machine.immat,
        label: `${machine.type_nacelle || ""} ${machine.modele_porteur || ""}`.trim(),
        photos: sharePhotos,
        created_by: userName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revoked: false,
        expires_at: null,
      });

      if (!shareToken) {
        onShareTokenChange(machine.id, token);
        setShareToken(token);
      }
    } catch (e) {
      console.error("❌ Erreur création lien de partage:", e);
      setError(t("modals.photoLinkFail"));
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare() {
    if (!shareToken) return;
    setShareBusy(true);
    setError(null);
    try {
      await updateDoc(doc(db, "shares", shareToken), {
        revoked: true,
        updated_at: new Date().toISOString(),
      });
      onShareTokenChange(machine.id, null);
      setShareToken(null);
    } catch (e) {
      console.error("❌ Erreur révocation lien:", e);
      setError(t("modals.photoRevokeFail"));
    } finally {
      setShareBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback : sélection manuelle
    }
  }

  function handleSave() {
    onSave(machine.id, photos);
    onClose();
  }

  const nbSupp = photos.length;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 820, width: "92%" }}>
        <div className="modal-header">
          <div>
            <h2>📸 {t("modals.photoTitle")} — {machine.immat}</h2>
            <div className="modal-subtitle">
              {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "8px 20px 20px", maxHeight: "70vh", overflowY: "auto" }}>
          {/* ─── 4 photos officielles (verrouillées) ─── */}
          <h3 style={sectionTitle}>
            🔒 {t("modals.photoOfficial")} <span style={lockNote}>{t("modals.photoOfficialNote")}</span>
          </h3>
          <div style={gridStyle}>
            {OFFICIELLES.map(({ key, label }) => {
              const url = officielles[key];
              return (
                <div key={key} style={tileLocked}>
                  {url ? (
                    <img src={url} alt={t(label)} style={imgStyle} />
                  ) : (
                    <div style={placeholder}>—</div>
                  )}
                  <div style={tileLabel}>{t(label)}</div>
                </div>
              );
            })}
          </div>

          {/* ─── 📄 Photos de la fiche de vente (remplaçables, avec détourage) ─── */}
          <h3 style={sectionTitle}>
            📄 {t("modals.ficheSection")} <span style={lockNote}>{t("modals.ficheSectionNote")}</span>
          </h3>
          {ficheMsg && (
            <div style={{ color: "#1e7e46", fontSize: 13, marginBottom: 8 }}>{ficheMsg}</div>
          )}
          <div style={gridStyle}>
            {([
              ["vente_3_4_av_droit", t("modals.ficheSlotAvD"), machine.photos_ventes?.trois_quart_av_droit],
              ["vente_3_4_ar_gauche", t("modals.ficheSlotArG"), machine.photos_ventes?.trois_quart_ar_gauche],
              ["vente_habitacle_av", t("modals.ficheSlotHabAv"), machine.photos_ventes?.habitacle_av],
              ["vente_habitacle_ar", t("modals.ficheSlotHabAr"), machine.photos_ventes?.habitacle_ar],
            ] as [string, string, string | undefined][]).map(([slot, label, current]) => {
              const url = slotOverrides[slot] || current;
              const active = ficheSlot === slot;
              return (
                <div key={slot} style={{ ...tileLocked, outline: active ? "3px solid #c9a227" : undefined }}>
                  {url ? <img src={url} alt={label} style={imgStyle} /> : <div style={placeholder}>—</div>}
                  <div style={tileLabel}>{label}</div>
                  <button
                    className="btn-secondary"
                    style={{ width: "100%", fontSize: 11, padding: "4px 0" }}
                    disabled={ficheBusy}
                    onClick={() => {
                      setFicheSlot(active ? null : slot);
                      setPick(null);
                      setPickRot(0);
                      setPickDetour(slot.includes("3_4")); // détourage par défaut sur les vues 3/4
                    }}
                  >
                    {active ? t("modals.ficheCancelBtn") : `✏️ ${t("modals.ficheReplace")}`}
                  </button>
                </div>
              );
            })}
          </div>
          {ficheSlot && !pick && (
            <div style={{ background: "#fdf8e8", border: "1px solid #e6d9a8", borderRadius: 8, padding: "10px 14px", fontSize: 13, margin: "10px 0" }}>
              👉 {t("modals.fichePickHint")}
            </div>
          )}
          {ficheSlot && pick && (
            <div style={{ background: "#eef1fb", border: "1px solid #b9c2d0", borderRadius: 8, padding: 14, margin: "10px 0", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <img
                src={pick.url}
                alt=""
                style={{ maxHeight: 140, maxWidth: 200, borderRadius: 6, transform: `rotate(${pickRot * 90}deg)`, transition: "transform .2s" }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="btn-secondary" onClick={() => setPickRot((r) => (r + 1) % 4)} disabled={ficheBusy}>
                  ↻ {t("modals.ficheRotate")}
                </button>
                <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={pickDetour} onChange={(e) => setPickDetour(e.target.checked)} disabled={ficheBusy} />
                  🪄 {t("modals.ficheDetour")}
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={applyFichePhoto} disabled={ficheBusy}>
                    {ficheBusy ? t("modals.ficheApplying") : `✓ ${t("modals.ficheApply")}`}
                  </button>
                  <button className="btn-secondary" onClick={() => { setPick(null); setPickRot(0); }} disabled={ficheBusy}>
                    {t("modals.ficheCancelBtn")}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── Upload ─── */}
          <h3 style={sectionTitle}>➕ {t("modals.photoAddExtra")}</h3>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              className="btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t("modals.photoUploading") : t("modals.photoChooseFiles")}
            </button>
            <span style={{ fontSize: 12, color: "#6a7488" }}>
              {t("modals.photoOptional")}
            </span>
          </div>
          {error && (
            <div style={{ color: "#c8102e", fontSize: 13, marginTop: 8 }}>{error}</div>
          )}

          {/* ─── Photos supplémentaires retenues ─── */}
          <h3 style={sectionTitle}>
            🖼️ {t("modals.photoCurrent")} <span style={lockNote}>({nbSupp} {t("galerie.photos")})</span>
          </h3>
          {nbSupp === 0 ? (
            <div style={emptyBox}>
              {t("modals.photoNoExtra")}
            </div>
          ) : (
            <div style={gridStyle}>
              {photos.map((p) => (
                <div
                  key={p.url}
                  style={{ ...tile, ...(ficheSlot ? { cursor: "pointer", outline: pick?.url === p.url ? "3px solid #c9a227" : undefined } : {}) }}
                  onClick={() => { if (ficheSlot) { setPick({ url: p.url }); setPickRot(0); } }}
                >
                  <img src={p.url} alt={p.nom || "photo"} style={imgStyle} />
                  <button
                    style={{ ...removeBtn, right: 34, background: "rgba(26,42,110,.85)" }}
                    title={t("modals.ficheRotate")}
                    disabled={rotBusy === p.url}
                    onClick={(e) => { e.stopPropagation(); rotatePhotoSupp(p); }}
                  >
                    {rotBusy === p.url ? "…" : "↻"}
                  </button>
                  <button style={removeBtn} title={t("modals.photoRemove")} onClick={(e) => { e.stopPropagation(); removePhoto(p.url); }}>
                    ✕
                  </button>
                  <div style={tileLabel}>
                    {p.source === "upload" ? "📤 Upload" : "🔁 Nacelle-Expert"}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ─── 🔒 Photos internes (état du stock, ajoutées par le super admin) ───
               Sélectionnables comme le pool NE : un clic les ajoute au lien de
               partage client (état réel, sans détourage). Jamais sur la fiche
               VO PDF — seules les 4 officielles y figurent. ─── */}
          {(machine.photos_internes?.length ?? 0) > 0 && (
            <>
              <h3 style={sectionTitle}>
                🔒 {t("modals.photoInternes")} <span style={lockNote}>{t("modals.photoInternesNote")}</span>
              </h3>
              <div style={gridStyle}>
                {(machine.photos_internes || []).map((p) => {
                  const selected = isSelected(p.url);
                  return (
                    <div
                      key={p.url}
                      style={{
                        ...tile,
                        cursor: "pointer",
                        outline: selected ? "3px solid #30a050" : "1px solid #e5e8ec",
                      }}
                      onClick={() => (ficheSlot ? (setPick({ url: p.url }), setPickRot(0)) : togglePoolPhoto(p.url))}
                    >
                      <img src={p.url} alt={p.nom || "photo"} style={imgStyle} />
                      <div
                        style={{
                          ...tileLabel,
                          color: selected ? "#30a050" : "#6a7488",
                          fontWeight: 700,
                        }}
                      >
                        {selected ? t("modals.photoAdded") : `+ ${t("modals.ficheAdd")}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ─── Pool Nacelle-Expert où piocher ─── */}
          {pool.length > 0 && (
            <>
              <h3 style={sectionTitle}>
                🔁 {t("modals.photoNePool")} <span style={lockNote}>{t("modals.photoNePoolNote")}</span>
              </h3>
              <div style={gridStyle}>
                {pool.map((url) => {
                  const selected = isSelected(url);
                  return (
                    <div
                      key={url}
                      style={{
                        ...tile,
                        cursor: "pointer",
                        outline: selected ? "3px solid #30a050" : "1px solid #e5e8ec",
                      }}
                      onClick={() => (ficheSlot ? (setPick({ url }), setPickRot(0)) : togglePoolPhoto(url))}
                    >
                      <img src={url} alt="photo nacelle-expert" style={imgStyle} />
                      <div
                        style={{
                          ...tileLabel,
                          color: selected ? "#30a050" : "#6a7488",
                          fontWeight: 700,
                        }}
                      >
                        {selected ? t("modals.photoAdded") : `+ ${t("modals.ficheAdd")}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ─── Partage client ─── */}
          <h3 style={sectionTitle}>
            🔗 {t("modals.photoShare")} <span style={lockNote}>{t("modals.photoShareNote")}</span>
          </h3>
          {!shareToken ? (
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn-secondary" onClick={generateOrUpdateShare} disabled={shareBusy}>
                {shareBusy ? t("modals.photoCreating") : t("modals.photoGenLink")}
              </button>
              <span style={{ fontSize: 12, color: "#6a7488" }}>
                {t("modals.photoShareDesc")}
              </span>
            </div>
          ) : (
            <div style={shareBox}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} style={shareInput} />
                <button className="btn-secondary" onClick={copyLink} style={{ whiteSpace: "nowrap" }}>
                  {copied ? t("modals.photoCopied") : t("modals.photoCopy")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn-secondary" onClick={generateOrUpdateShare} disabled={shareBusy}>
                  {shareBusy ? "⏳..." : `🔄 ${t("modals.photoUpdateLink")}`}
                </button>
                <button
                  onClick={revokeShare}
                  disabled={shareBusy}
                  style={{
                    background: "#fff",
                    color: "#c8102e",
                    border: "1px solid #c8102e",
                    borderRadius: 4,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  🗑 {t("modals.photoRevoke")}
                </button>
              </div>
              <div style={{ fontSize: 11, color: "#6a7488", marginTop: 8 }}>
                {t("modals.photoShareHint")}
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>
            {t("modals.cancel")}
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={uploading}>
            {t("modals.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── styles inline (grille de vignettes) ───
const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#1a2a6e",
  fontWeight: 700,
  margin: "22px 0 10px",
};
const lockNote: React.CSSProperties = {
  textTransform: "none",
  letterSpacing: 0,
  color: "#6a7488",
  fontWeight: 500,
  fontSize: 12,
};
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 12,
};
const tile: React.CSSProperties = {
  position: "relative",
  border: "1px solid #e5e8ec",
  borderRadius: 8,
  overflow: "hidden",
  background: "#f8f9fb",
};
const tileLocked: React.CSSProperties = {
  ...tile,
  opacity: 0.95,
};
const imgStyle: React.CSSProperties = {
  width: "100%",
  height: 110,
  objectFit: "cover",
  display: "block",
};
const tileLabel: React.CSSProperties = {
  fontSize: 11,
  textAlign: "center",
  padding: "5px 4px",
  color: "#6a7488",
};
const placeholder: React.CSSProperties = {
  height: 110,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#aab",
  fontSize: 22,
};
const removeBtn: React.CSSProperties = {
  position: "absolute",
  top: 4,
  right: 4,
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "none",
  background: "rgba(200,16,46,0.9)",
  color: "white",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
};
const emptyBox: React.CSSProperties = {
  background: "#f8f9fb",
  border: "1px dashed #cfd6e0",
  borderRadius: 8,
  padding: "14px 16px",
  fontSize: 13,
  color: "#6a7488",
};
const shareBox: React.CSSProperties = {
  background: "#f8f9fb",
  border: "1px solid #e5e8ec",
  borderRadius: 8,
  padding: "14px 16px",
};
const shareInput: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  fontSize: 13,
  padding: "8px 10px",
  border: "1px solid #cfd6e0",
  borderRadius: 4,
  background: "#fff",
  color: "#1a2030",
  fontFamily: "monospace",
};
