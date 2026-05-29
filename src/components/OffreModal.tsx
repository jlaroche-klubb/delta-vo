import { useState } from "react";
import { Machine } from "../types/machine";

interface OffreModalProps {
  machines: Machine[]; // nacelles sélectionnées (panier)
  onClose: () => void;
  onConfirm: (clientOffre: string, montants: Record<string, number>) => void;
}

export default function OffreModal({ machines, onClose, onConfirm }: OffreModalProps) {
  const [client, setClient] = useState("");

  // Montants pré-remplis avec le prix de base (prix_dealer en priorité, sinon prix_fr)
  const [montants, setMontants] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    machines.forEach((m) => {
      init[m.id] = m.prix_dealer ?? m.prix_fr ?? 0;
    });
    return init;
  });

  const total = Object.values(montants).reduce((sum, v) => sum + (v || 0), 0);

  function handleMontantChange(machineId: string, value: string) {
    const num = parseFloat(value.replace(/\s/g, "").replace(",", "."));
    setMontants((prev) => ({ ...prev, [machineId]: isNaN(num) ? 0 : num }));
  }

  function handleConfirm() {
    if (!client.trim()) {
      alert("Merci de renseigner le nom du client.");
      return;
    }
    onConfirm(client.trim(), montants);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 600, width: "90%" }}
      >
        <div className="modal-header">
          <h2>📤 Créer une offre HubSpot</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body" style={{ padding: 20 }}>
          {/* Nom du client */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
              Nom du client *
            </label>
            <input
              type="text"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Ex : Société Dupont"
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 6,
                border: "1px solid #ccc",
                fontSize: 14,
              }}
            />
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
              Le deal HubSpot s'appellera : <strong>VO - {client || "..."}</strong>
            </div>
          </div>

          {/* Liste des nacelles avec montants modifiables */}
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            Nacelles sélectionnées ({machines.length})
          </div>
          <div style={{ border: "1px solid #eee", borderRadius: 6, overflow: "hidden" }}>
            {machines.map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{m.immat}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {m.type_nacelle} {m.modele_porteur ? `· ${m.modele_porteur}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="text"
                    value={montants[m.id] ?? 0}
                    onChange={(e) => handleMontantChange(m.id, e.target.value)}
                    style={{
                      width: 110,
                      padding: "6px 8px",
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      textAlign: "right",
                      fontSize: 14,
                    }}
                  />
                  <span style={{ color: "#666" }}>€</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 12,
              padding: "10px 12px",
              background: "#f8f9fa",
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            <span>Total de l'offre</span>
            <span>{total.toLocaleString("fr-FR")} €</span>
          </div>
        </div>

        <div
          className="modal-footer"
          style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: 16 }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "white",
              cursor: "pointer",
            }}
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: "10px 18px",
              borderRadius: 6,
              border: "none",
              background: "#1a73e8",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            📤 Créer l'offre ({machines.length})
          </button>
        </div>
      </div>
    </div>
  );
}
