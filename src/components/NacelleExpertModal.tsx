import { Machine } from "../types/machine";

interface NacelleExpertModalProps {
  machine: Machine;
  onClose: () => void;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function NacelleExpertModal({ machine, onClose }: NacelleExpertModalProps) {
  const d = machine.dossier_nacelle_expert;
  if (!d) return null;

  // Les données Nacelle-Expert ne sont pas toujours des tableaux (parfois objets/undefined).
  const asArray = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return Object.values(v);
    return [];
  };
  const asText = (v: any): string => {
    if (v == null) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object") return v.description || v.label || v.libelle || v.zone || JSON.stringify(v);
    return String(v);
  };
  const asUrl = (v: any): string => {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") return v.url || v.src || v.downloadURL || "";
    return "";
  };

  const degats = asArray(d.degats).map(asText).filter(Boolean);
  const photosDepart = asArray(machine.photos_ne_depart ?? d.photos_depart).map(asUrl).filter(Boolean);
  const photosRetour = asArray(machine.photos_ne_retour ?? d.photos_retour).map(asUrl).filter(Boolean);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-expertise">
        {/* Header */}
        <div className="expertise-header">
          <div>
            <div className="expertise-eyebrow">INSPECTION · NACELLE-EXPERT</div>
            <h2 className="expertise-title">{machine.immat}</h2>
            <div className="expertise-subtitle">
              {machine.type_nacelle} · {machine.modele_porteur} · {machine.annee_circulation}
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Identification */}
        <div className="expertise-section">
          <div className="section-label">Identification</div>
          <div className="info-grid">
            <InfoCell label="Client" value={d.client || machine.client_precedent || "—"} />
            <InfoCell label="N° Contrat" value={d.contrat || machine.contrat || "—"} />
            <InfoCell label="Date départ" value={formatDate(d.date_depart)} />
            <InfoCell label="Date retour" value={formatDate(d.date_retour)} />
            <InfoCell label="Agent départ" value={d.agent_depart || "—"} />
            <InfoCell label="Agent retour" value={d.agent_retour || "—"} />
          </div>
        </div>

        {/* Dégâts */}
        <div className="expertise-section">
          <div className="section-label">
            Dégâts constatés
            {degats.length > 0 && (
              <span className="section-count">
                {degats.length} poste{degats.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
          {degats.length === 0 ? (
            <div className="no-damage">✓ Aucun dégât constaté</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {degats.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Note de l'expert */}
        {d.note_expert && (
          <div className="expertise-section">
            <div className="section-label">Note de l'expert</div>
            <div className="notes-box">{d.note_expert}</div>
          </div>
        )}

        {/* Photos */}
        {(photosDepart.length > 0 || photosRetour.length > 0) && (
          <div className="expertise-section">
            <div className="section-label">
              Photos
              <span className="section-count">
                {photosDepart.length + photosRetour.length}
              </span>
            </div>
            <PhotoRow titre="Départ" photos={photosDepart} />
            <PhotoRow titre="Retour" photos={photosRetour} />
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function PhotoRow({ titre, photos }: { titre: string; photos: string[] }) {
  if (!photos || photos.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>{titre}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {photos.map((url, i) => (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer">
            <img
              src={url}
              alt={`${titre} ${i + 1}`}
              style={{
                width: 90,
                height: 90,
                objectFit: "cover",
                borderRadius: 6,
                border: "1px solid #e0e0e0",
              }}
            />
          </a>
        ))}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-cell">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}
