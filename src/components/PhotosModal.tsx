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
                <div key={p.url} style={tile}>
                  <img src={p.url} alt={p.nom || "photo"} style={imgStyle} />
                  <button style={removeBtn} title={t("modals.photoRemove")} onClick={() => removePhoto(p.url)}>
                    ✕
                  </button>
                  <div style={tileLabel}>
                    {p.source === "upload" ? "📤 Upload" : "🔁 Nacelle-Expert"}
                  </div>
                </div>
              ))}
            </div>
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
                      onClick={() => togglePoolPhoto(url)}
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
