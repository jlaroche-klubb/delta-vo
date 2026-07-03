import { Machine } from "../types/machine";
import { getMachinePhotoUrl } from "../utils/machinePhoto";

interface MachineThumbProps {
  machine: Machine;
  size?: number;
}

/**
 * Vignette photo d'une machine (première photo dispo).
 * Affiche un repli 📷 si aucune photo n'est trouvée.
 * Fonctionne aussi bien dans un conteneur flex que dans une cellule de tableau.
 */
export default function MachineThumb({ machine, size = 56 }: MachineThumbProps) {
  const url = getMachinePhotoUrl(machine);

  const base: React.CSSProperties = {
    width: size,
    height: size,
    flex: "0 0 auto",
    borderRadius: 8,
    border: "1px solid #e0e0e0",
    background: "#f1f3f4",
    display: "inline-block",
    verticalAlign: "middle",
  };

  if (!url) {
    return (
      <div
        style={{
          ...base,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: Math.round(size * 0.45),
          color: "#9aa0a6",
        }}
        aria-hidden="true"
      >
        📷
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={machine.immat}
      loading="lazy"
      style={{ ...base, objectFit: "cover" }}
    />
  );
}
