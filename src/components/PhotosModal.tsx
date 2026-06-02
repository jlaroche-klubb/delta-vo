import { useMemo, useRef, useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import { Machine, PhotoSupplementaire } from "../types/machine";

interface PhotosModalProps {
  machine: Machine;
  userName: string;
  onClose: () => void;
  onSave: (machineId: string, photos: PhotoSupplementaire[]) => void;
}

// Les 4 vues officielles de la fiche VO (verrouillées, jamais modifiables ici)
const OFFICIELLES: { key: keyof NonNullable<Machine["photos_commerciales"]>; label: string }[] = [
  { key: "av_droit", label: "3/4 avant droit" },
  { key: "av_gauche", label: "3/4 avant gauche" },
  { key: "ar_droit", label: "3/4 arrière droit" },
  { key: "ar_gauche", label: "3/4 arrière gauche" },
];

export default function PhotosModal({
  machine,
  userName,
  onClose,
  onSave,
}: PhotosModalProps) {
  const [photos, setPhotos] = useState<PhotoSupplementaire[]>(
    machine.photos_supplementaires ? [...machine.photos_supplementaires] : []
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setError("Seules les images sont acceptées.");
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
      setError("Échec de l'upload. Réessaie ou vérifie ta connexion.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
            <h2>📸 Photos — {machine.immat}</h2>
            <div className="modal-subtitle">
              {machine.type_nacelle} {machine.modele_porteur}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "8px 20px 20px", maxHeight: "70vh", overflowY: "auto" }}>
          {/* ─── 4 photos officielles (verrouillées) ─── */}
          <h3 style={sectionTitle}>
            🔒 Photos de la fiche VO <span style={lockNote}>(automatiques, non modifiables)</span>
          </h3>
          <div style={gridStyle}>
            {OFFICIELLES.map(({ key, label }) => {
              const url = officielles[key];
              return (
                <div key={key} style={tileLocked}>
                  {url ? (
                    <img src={url} alt={label} style={imgStyle} />
                  ) : (
                    <div style={placeholder}>—</div>
                  )}
                  <div style={tileLabel}>{label}</div>
                </div>
              );
            })}
          </div>

          {/* ─── Upload ─── */}
          <h3 style={sectionTitle}>➕ Ajouter des photos supplémentaires</h3>
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
              {uploading ? "⏳ Upload en cours..." : "📤 Choisir des fichiers"}
            </button>
            <span style={{ fontSize: 12, color: "#6a7488" }}>
              Optionnel — formats image, plusieurs fichiers possibles.
            </span>
          </div>
          {error && (
            <div style={{ color: "#c8102e", fontSize: 13, marginTop: 8 }}>{error}</div>
          )}

          {/* ─── Photos supplémentaires retenues ─── */}
          <h3 style={sectionTitle}>
            🖼️ Sélection actuelle <span style={lockNote}>({nbSupp} photo{nbSupp > 1 ? "s" : ""})</span>
          </h3>
          {nbSupp === 0 ? (
            <div style={emptyBox}>
              Aucune photo supplémentaire. La fiche VO gardera ses 4 photos officielles uniquement.
            </div>
          ) : (
            <div style={gridStyle}>
              {photos.map((p) => (
                <div key={p.url} style={tile}>
                  <img src={p.url} alt={p.nom || "photo"} style={imgStyle} />
                  <button style={removeBtn} title="Retirer" onClick={() => removePhoto(p.url)}>
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
                🔁 Photos Nacelle-Expert <span style={lockNote}>(clique pour ajouter/retirer)</span>
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
                        {selected ? "✓ Ajoutée" : "+ Ajouter"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>
            Annuler
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={uploading}>
            Enregistrer
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
