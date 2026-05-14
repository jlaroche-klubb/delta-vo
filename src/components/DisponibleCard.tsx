import { Machine, calculAgeStock, getAgeStockColor, isFicheComplete } from "../types/machine";

interface DisponibleCardProps {
  machine: Machine;
  seuilRepricer?: number;
  isAdmin?: boolean;
  canLld?: boolean;
  canFiche?: boolean;
  onEditPrice?: (machine: Machine) => void;
  onLld?: (machine: Machine) => void;
  onEditFiche?: (machine: Machine) => void;
  onGenerateFiche?: (machine: Machine) => void;
}

export default function DisponibleCard({
  machine,
  seuilRepricer = 60,
  isAdmin = false,
  canLld = false,
  canFiche = false,
  onEditPrice,
  onLld,
  onEditFiche,
  onGenerateFiche,
}: DisponibleCardProps) {
  const age = machine.date_mise_stock ? calculAgeStock(machine.date_mise_stock) : 0;
  const ageInfo = getAgeStockColor(age, seuilRepricer);
  const hasPrice = machine.prix_fr !== undefined || machine.prix_dealer !== undefined;
  const ficheComplete = isFicheComplete(machine);

  return (
    <div className={`dispo-card ${!hasPrice ? "no-price" : ""}`}>
      <div className="dispo-header">
        <div>
          <div className="dispo-immat">
            {machine.immat}
            {machine.fiche_commerciale?.numero_fiche && (
              <span className="dispo-fiche-num">
                · Fiche N°{machine.fiche_commerciale.numero_fiche}
              </span>
            )}
          </div>
          <div className="dispo-modele">
            {machine.type_nacelle} · {machine.modele_porteur}
            <span className="dispo-annee"> · {machine.annee_circulation}</span>
          </div>
        </div>
        <div className="dispo-header-right">
          <div
            className="age-badge"
            style={{ background: ageInfo.bg, color: ageInfo.color, borderColor: ageInfo.color }}
          >
            <span className="age-days">{age} j</span>
            <span className="age-label">{ageInfo.label}</span>
          </div>
          <div className="dispo-actions-col">
            {isAdmin && onEditPrice && (
              <button
                className="btn-edit-price"
                onClick={() => onEditPrice(machine)}
                title="Modifier les prix manuellement"
              >
                ✏️ Modifier prix
              </button>
            )}
            {canFiche && onEditFiche && (
              <button
                className={`btn-fiche-edit ${ficheComplete ? "complete" : ""}`}
                onClick={() => onEditFiche(machine)}
                title={ficheComplete ? "Modifier la fiche commerciale" : "Compléter la fiche commerciale"}
              >
                {ficheComplete ? "✏️ Modifier fiche" : "📝 Compléter fiche"}
              </button>
            )}
            {canFiche && ficheComplete && hasPrice && onGenerateFiche && (
              <button
                className="btn-generate-fiche"
                onClick={() => onGenerateFiche(machine)}
                title="Générer la fiche commerciale en PDF"
              >
                📄 Générer fiche VO
              </button>
            )}
            {canLld && onLld && (
              <button
                className="btn-lld"
                onClick={() => onLld(machine)}
                title="Basculer cette machine en location longue durée"
              >
                🔁 Mise en location
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="dispo-info-bar">
        {machine.heures_nacelle !== undefined && (
          <span className="dispo-info-item">
            <span className="info-icon">⏱</span>
            <strong>{machine.heures_nacelle.toLocaleString("fr-FR")} h</strong>
          </span>
        )}
        {machine.km_porteur !== undefined && (
          <span className="dispo-info-item">
            <span className="info-icon">🛣</span>
            <strong>{machine.km_porteur.toLocaleString("fr-FR")} km</strong>
          </span>
        )}
        <span className="dispo-info-item">
          <span className="info-icon">📅</span>
          Stock depuis le <strong>{formatDate(machine.date_mise_stock || "")}</strong>
        </span>
        {!ficheComplete && hasPrice && (
          <span className="dispo-info-item fiche-warning">
            <span className="info-icon">⚠</span>
            <strong>Fiche commerciale à compléter</strong>
          </span>
        )}
      </div>

      {/* ════════ SECTION FRE (NOUVEAU) ════════ */}
      {machine.rapport_expertise && (
        <div className="fre-section">
          <div className="fre-header">
            <span className="fre-icon">🔧</span>
            <span className="fre-title">Frais de remise en état</span>
          </div>
          <div className="fre-details">
            <div className="fre-item">
              <span className="fre-label">Retenue HT:</span>
              <span className="fre-value">
                {machine.rapport_expertise.total_retenue_ht !== undefined
                  ? `${machine.rapport_expertise.total_retenue_ht.toLocaleString("fr-FR")} €`
                  : "—"}
              </span>
            </div>
            <div className="fre-item">
              <span className="fre-degats">
                {machine.rapport_expertise.degats.length} dégât(s) identifié(s)
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="dispo-prices">
        {hasPrice ? (
          <>
            <div className="price-block">
              <div className="price-label">Prix FR</div>
              <div className="price-value">
                {machine.prix_fr !== undefined
                  ? machine.prix_fr.toLocaleString("fr-FR") + " €"
                  : "—"}
              </div>
            </div>
            <div className="price-divider"></div>
            <div className="price-block">
              <div className="price-label">Prix Dealer</div>
              <div className="price-value price-dealer">
                {machine.prix_dealer !== undefined
                  ? machine.prix_dealer.toLocaleString("fr-FR") + " €"
                  : "—"}
              </div>
            </div>
          </>
        ) : (
          <div className="price-pending">
            <span className="pending-icon">⏳</span>
            <div>
              <strong>Prix à fixer</strong>
              <div className="pending-sub">En attente du PDG</div>
            </div>
          </div>
        )}
      </div>

      {machine.prix_modifie_manuellement && machine.prix_modifie_par && (
        <div className="manual-override-banner">
          ✏️ Prix modifié manuellement par <strong>{machine.prix_modifie_par}</strong> le {formatDate(machine.prix_modifie_le || "")}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}