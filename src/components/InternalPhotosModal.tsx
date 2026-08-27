import { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import { Machine, PhotoSupplementaire } from "../types/machine";
import { useTranslation } from "react-i18next";

// 🔒 PHOTOS INTERNES DU STOCK — réservé au SUPER ADMIN.
// Un simple dépôt de photos « telles quelles » (état réel des machines en
// stock) : pas de détourage, pas de vues officielles, et surtout JAMAIS
// utilisées par la fiche VO, le lien de partage client ou la galerie.
// Chaque ajout / suppression est enregistré immédiatement.

interface InternalPhotosModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (machineId: string, photos: PhotoSupplementaire[]) => void;
}

export default function InternalPhotosModal({
  machine,
  userName,
  onClose,
  onSave,
}: InternalPhotosModalProps) {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<PhotoSupplementaire[]>(
    machine.photos_internes ? [...machine.photos_internes] : []
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** ⏱ Garde-fou : l'upload ne peut pas rester bloqué indéfiniment */
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, rej) =>
        setTimeout(() => rej(new Error(`Délai dépassé (${label})`)), ms)
      ),
    ]);
  }

  /** 🗜 Compression côté navigateur : photos d'état « telles quelles »,
   *  1600 px max, JPEG — uploads rapides même depuis le téléphone */
  async function compress(file: File): Promise<Blob> {
    try {
      const bitmap = await createImageBitmap(file);
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", 0.82)
      );
      return blob && blob.size < file.size ? blob : file;
    } catch {
      return file; // format non décodable par le navigateur : envoi tel quel
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    const ajoutees: PhotoSupplementaire[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          setError(t("modals.photoOnlyImages"));
          continue;
        }
        const blob = await compress(file);
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "");
        // 📁 Même dossier de stockage que les photos supplémentaires (chemin
        // déjà autorisé par les règles Storage) — préfixe "interne_" pour les
        // distinguer. La confidentialité est portée par le champ Firestore
        // photos_internes, jamais lu par la fiche VO / le partage / la galerie.
        const path = `machines/${machine.immat}/supplementaires/interne_${Date.now()}_${safeName}.jpg`;
        const storageRef = ref(storage, path);
        await withTimeout(
          uploadBytes(storageRef, blob, { contentType: "image/jpeg" }),
          90000,
          file.name
        );
        const url = await withTimeout(getDownloadURL(storageRef), 30000, file.name);
        ajoutees.push({
          url,
          nom: file.name,
          source: "upload",
          ajout_at: new Date().toISOString(),
          ajout_par: userName,
        });
      }
    } catch (e: any) {
      console.error("❌ Erreur upload photo interne:", e);
      const code = e?.code ? ` [${e.code}]` : e?.message ? ` — ${e.message}` : "";
      setError(`${t("modals.docUploadFail")}${code}`);
    } finally {
      // Les photos déjà envoyées sont conservées même si une suivante a échoué
      if (ajoutees.length > 0) {
        const next = [...photos, ...ajoutees];
        setPhotos(next);
        onSave(machine.id, next); // enregistrement immédiat
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removePhoto(url: string) {
    const next = photos.filter((p) => p.url !== url);
    setPhotos(next);
    onSave(machine.id, next); // enregistrement immédiat
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 820, width: "92%" }}>
        <div className="modal-header">
          <div>
            <h2>🔒 {t("modals.internalTitle")} — {machine.immat}</h2>
            <div className="modal-subtitle">
              {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "8px 20px 20px", maxHeight: "70vh", overflowY: "auto" }}>
          <div
            style={{
              background: "#fdf8e8",
              border: "1px solid #e6d9a8",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {t("modals.internalNote")}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              className="btn-primary"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? t("modals.photoUploading") : `➕ ${t("modals.internalAdd")}`}
            </button>
            <span style={{ fontSize: 13, color: "#667085" }}>
              {photos.length} {t("galerie.photos")}
            </span>
          </div>
          {error && (
            <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 10 }}>{error}</div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 12,
            }}
          >
            {photos.map((p) => (
              <div
                key={p.url}
                style={{
                  border: "1px solid #d8dbe6",
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <img
                  src={p.url}
                  alt={p.nom || ""}
                  style={{ width: "100%", height: 110, objectFit: "cover", display: "block", cursor: "zoom-in" }}
                  onClick={() => setPreview(p.url)}
                />
                <button
                  title={t("modals.internalRemove")}
                  onClick={() => removePhoto(p.url)}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    background: "rgba(192,57,43,.92)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 6,
                    width: 26,
                    height: 26,
                    cursor: "pointer",
                    fontSize: 13,
                    lineHeight: "26px",
                    padding: 0,
                  }}
                >
                  🗑
                </button>
                {p.ajout_at && (
                  <div style={{ fontSize: 10, color: "#667085", padding: "4px 6px" }}>
                    {new Date(p.ajout_at).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
            {photos.length === 0 && (
              <div style={{ gridColumn: "1 / -1", color: "#98a2b3", fontSize: 13, padding: "18px 0", textAlign: "center" }}>
                {t("modals.internalEmpty")}
              </div>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,14,25,.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1200,
            cursor: "zoom-out",
          }}
        >
          <img src={preview} alt="" style={{ maxWidth: "92%", maxHeight: "92%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}
