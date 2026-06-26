import { useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../firebase";
import { Machine, DocumentVO } from "../types/machine";
import { useTranslation } from "react-i18next";

interface DocumentsModalProps {
  machine: Machine;
  canManage: boolean;
  userName: string;
  onClose: () => void;
  onSave: (machineId: string, documents: DocumentVO[]) => void;
}

export default function DocumentsModal({
  machine,
  canManage,
  userName,
  onClose,
  onSave,
}: DocumentsModalProps) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<DocumentVO[]>(machine.documents_vo || []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingLabel = useRef<string>("");

  function startUpload(label: string) {
    const clean = label.trim();
    if (!clean) {
      setError(t("modals.docNeedLabel"));
      return;
    }
    setError("");
    pendingLabel.current = clean;
    fileInputRef.current?.click();
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const label = pendingLabel.current || "Document";

    setUploading(true);
    setError("");
    try {
      const ajoutes: DocumentVO[] = [];
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `documents/${machine.immat}/${Date.now()}_${safeName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        ajoutes.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          label,
          nom: file.name,
          url,
          path,
          uploaded_at: new Date().toISOString(),
          uploaded_by: userName,
        });
      }
      const next = [...docs, ...ajoutes];
      setDocs(next);
      onSave(machine.id, next);
      setCustomLabel("");
    } catch (err: any) {
      console.error("❌ Erreur upload document:", err);
      setError(t("modals.docUploadFail"));
    } finally {
      setUploading(false);
      pendingLabel.current = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(d: DocumentVO) {
    if (!window.confirm(t("modals.confirmDeleteDoc", { label: d.label, nom: d.nom || "" }))) return;
    // Supprime le fichier Storage (best-effort)
    try {
      if (d.path) await deleteObject(ref(storage, d.path));
    } catch (err) {
      console.warn("Suppression Storage échouée (ignorée):", err);
    }
    const next = docs.filter((x) => x.id !== d.id);
    setDocs(next);
    onSave(machine.id, next);
  }

  function fmtDate(iso?: string) {
    if (!iso) return "";
    const dt = new Date(iso);
    return isNaN(dt.getTime())
      ? ""
      : dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderBottom: "1px solid #eee",
            position: "sticky",
            top: 0,
            background: "#fff",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#1a2a6e" }}>
              📎 {t("modals.docTitle")} — {machine.immat}
            </div>
            <div style={{ fontSize: 12, color: "#888" }}>
              {machine.type_nacelle} · {machine.modele_porteur}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 22,
              cursor: "pointer",
              color: "#888",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {/* Zone d'ajout */}
          {canManage && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 8 }}>
                {t("modals.docAdd")}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => startUpload("CT")}
                  style={btnQuick}
                >
                  + CT
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => startUpload("VGP")}
                  style={btnQuick}
                >
                  + VGP
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder={t("modals.docLabelPlaceholder")}
                  disabled={uploading}
                  style={{
                    flex: 1,
                    border: "1px solid #d0d0d0",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  disabled={uploading || !customLabel.trim()}
                  onClick={() => startUpload(customLabel)}
                  style={{
                    ...btnQuick,
                    background: customLabel.trim() ? "#1a2a6e" : "#bbb",
                    color: "#fff",
                    borderColor: "transparent",
                  }}
                >
                  {t("modals.docUpload")}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                onChange={onFileChange}
                style={{ display: "none" }}
              />
              {uploading && (
                <div style={{ fontSize: 12, color: "#1a2a6e", marginTop: 8 }}>
                  ⏳ {t("modals.docUploading")}
                </div>
              )}
              {error && (
                <div style={{ fontSize: 12, color: "#c8102e", marginTop: 8 }}>{error}</div>
              )}
            </div>
          )}

          {/* Liste des documents */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 8 }}>
            {t("modals.docUploaded")} ({docs.length})
          </div>
          {docs.length === 0 ? (
            <div style={{ fontSize: 13, color: "#999", padding: "12px 0" }}>
              {t("modals.docNone")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {docs.map((d) => (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: "10px 12px",
                  }}
                >
                  <span style={{ fontSize: 18 }}>📄</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1a2a6e" }}>
                      {d.label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#888",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {d.nom || "fichier"}
                      {d.uploaded_at ? ` · ${fmtDate(d.uploaded_at)}` : ""}
                      {d.uploaded_by ? ` · ${d.uploaded_by}` : ""}
                    </div>
                  </div>
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#1a2a6e",
                      textDecoration: "none",
                      border: "1px solid #1a2a6e",
                      borderRadius: 6,
                      padding: "5px 10px",
                    }}
                  >
                    {t("modals.docOpen")}
                  </a>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(d)}
                      title={t("modals.deleteTitle")}
                      style={{
                        border: "1px solid #f0c0c5",
                        background: "#fff",
                        color: "#c8102e",
                        borderRadius: 6,
                        padding: "5px 9px",
                        cursor: "pointer",
                        fontSize: 13,
                      }}
                    >
                      🗑
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnQuick: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #1a2a6e",
  background: "#fff",
  color: "#1a2a6e",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
