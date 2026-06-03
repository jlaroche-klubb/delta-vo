import { Machine, calculAgeStock, getAgeStockColor, isFicheComplete } from "../types/machine";

interface DisponibleCardProps {
  machine: Machine;
  seuilRepricer?: number;
  isAdmin?: boolean;
  canLld?: boolean;
  canFiche?: boolean;          // Éditer la fiche commerciale
  canGenerateFiche?: boolean;  // Générer le PDF (différent de l'édition)
  canViewPrixFR?: boolean;
  canViewprixDealer?: boolean;
  onEditPrice?: (machine: Machine) => void;
  onLld?: (machine: Machine) => void;
  onEditFiche?: (machine: Machine) => void;
  onGenerateFiche?: (machine: Machine) => void;
  onViewExpertise?: (machine: Machine) => void;
  onViewNacelleExpert?: (machine: Machine) => void;
  onLocaliteChange?: (machineId: string, localite: string) => void;
  canManagePhotos?: boolean;
  onManagePhotos?: (machine: Machine) => void;
  canDelete?: boolean;
  onDelete?: (id: string) => void;
  // ✅ Offre HubSpot
  canOffre?: boolean;
  isInPanier?: boolean;
  onTogglePanier?: (machine: Machine) => void;
  onAnnulerOffre?: (machine: Machine) => void;
}

export default function DisponibleCard({
  machine,
  seuilRepricer = 60,
  isAdmin = false,
  canLld = false,
  canFiche = false,
  canGenerateFiche = false,
  canViewPrixFR = true,
  canViewprixDealer = true,
  onEditPrice,
  onLld,
  onEditFiche,
  onGenerateFiche,
  onViewExpertise,
  onViewNacelleExpert,
  onLocaliteChange,
  canManagePhotos = false,
  onManagePhotos,
  canDelete = false,
  onDelete,
  canOffre = false,
  isInPanier = false,
  onTogglePanier,
  onAnnulerOffre,
}: DisponibleCardProps) {
  const age = machine.date_mise_stock ? calculAgeStock(machine.date_mise_stock) : 0;
  const ageInfo = getAgeStockColor(age, seuilRepricer);
  const hasPrice = machine.prix_fr !== undefined || machine.prix_dealer !== undefined;
  const ficheComplete = isFicheComplete(machine);

  const offreEnCours = machine.offre_en_cours === true;

  return (
    <div
      className={`dispo-card ${!hasPrice ? "no-price" : ""}`}
      style={isInPanier ? { outline: "3px solid #1a73e8", outlineOffset: 2 } : undefined}
    >
      {offreEnCours && (
        <div
          style={{
            background: "#e8f0fe",
            color: "#1a73e8",
            padding: "4px 10px",
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Partie cliquable : si on a un deal HubSpot, ouvre dans un nouvel onglet */}
          {machine.hubspot_deal_id ? (
            <a
              href={`https://app.hubspot.com/contacts/144239378/deal/${machine.hubspot_deal_id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Ouvrir le deal dans HubSpot"
              style={{
                color: "#1a73e8",
                textDecoration: "none",
                flex: 1,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              🔵 Offre en cours{machine.client_offre ? ` — ${machine.client_offre}` : ""} 🔗
            </a>
          ) : (
            <span style={{ flex: 1 }}>
              🔵 Offre en cours{machine.client_offre ? ` — ${machine.client_offre}` : ""}
            </span>
          )}
          {onAnnulerOffre && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAnnulerOffre(machine);
              }}
              title="Annuler l'offre"
              style={{
                background: "transparent",
                border: "none",
                color: "#1a73e8",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14,
                marginLeft: 8,
              }}
            >
              ✕
            </button>
          )}
        </div>
      )}
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
            {canGenerateFiche && ficheComplete && hasPrice && onGenerateFiche && (
              <button
                className="btn-generate-fiche"
                onClick={() => onGenerateFiche(machine)}
                title="Générer la fiche commerciale en PDF"
              >
                📄 Générer fiche VO
              </button>
            )}
            {canManagePhotos && onManagePhotos && (
              <button
                className="btn-fiche-edit"
                onClick={() => onManagePhotos(machine)}
                title="Gérer les photos supplémentaires (galerie, upload, partage)"
              >
                📸 Photos
                {machine.photos_supplementaires && machine.photos_supplementaires.length > 0
                  ? ` (${machine.photos_supplementaires.length})`
                  : ""}
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
            {canOffre && hasPrice && onTogglePanier && (
              <button
                onClick={() => onTogglePanier(machine)}
                title={isInPanier ? "Retirer de l'offre" : "Ajouter à l'offre HubSpot"}
                style={{
                  background: isInPanier ? "#1a73e8" : "white",
                  color: isInPanier ? "white" : "#1a73e8",
                  border: "1px solid #1a73e8",
                  padding: "6px 12px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {isInPanier ? "✓ Dans l'offre" : "➕ Ajouter à l'offre"}
              </button>
            )}
            {canDelete && onDelete && (
              <button
                className="btn-delete-machine"
                onClick={() => onDelete(machine.id)}
                title="Supprimer définitivement cette machine"
                style={{ background: "#dc3545", color: "white", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}
              >
                🗑️ Supprimer
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
        <span className="dispo-info-item">
          <span className="info-icon">📍</span>
          {onLocaliteChange ? (
            <select
              value={machine.localite || ""}
              onChange={(e) => onLocaliteChange(machine.id, e.target.value)}
              style={{
                border: "1px solid #d0d0d0",
                borderRadius: 6,
                padding: "2px 6px",
                fontSize: 13,
                fontWeight: 600,
                color: machine.localite ? "#1a2a6e" : "#999",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value="">Site —</option>
              {["EGI", "Ferrière", "Croissy", "Avignon", "St-Alban"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <strong>{machine.localite || "—"}</strong>
          )}
        </span>
        {!ficheComplete && hasPrice && (
          <span className="dispo-info-item fiche-warning">
            <span className="info-icon">⚠</span>
            <strong>Fiche commerciale à compléter</strong>
          </span>
        )}
      </div>

      {/* Lien vers l'expertise réalisée dans Nacelle-Expert (sous heures/km/stock) */}
      {machine.dossier_nacelle_expert && onViewNacelleExpert && (
        <div style={{ padding: "8px 4px 0" }}>
          <button
            type="button"
            onClick={() => onViewNacelleExpert(machine)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#1a2a6e",
              fontWeight: 600,
              fontSize: 13,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            🔍 Expertise Nacelle-Expert
            {machine.rapport_expertise?.total_retenue_ht !== undefined
              ? ` — ${machine.rapport_expertise.total_retenue_ht.toLocaleString("fr-FR")} €`
              : ""}
          </button>
        </div>
      )}

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
          {/* ← BOUTON AJOUTÉ ICI */}
          {onViewExpertise && (
            <button 
              className="btn-view-expertise"
              onClick={() => onViewExpertise(machine)}
            >
              🔍 Voir expertise
            </button>
          )}
        </div>
      )}

      <div className="dispo-prices">
        {hasPrice ? (
          <>
            {canViewPrixFR && (
              <div className="price-block">
                <div className="price-label">Prix FR</div>
                <div className="price-value">
                  {machine.prix_fr !== undefined
                    ? machine.prix_fr.toLocaleString("fr-FR") + " €"
                    : "—"}
                </div>
              </div>
            )}
            {canViewPrixFR && canViewprixDealer && <div className="price-divider"></div>}
            {canViewprixDealer && (
              <div className="price-block">
                <div className="price-label">Prix Dealer</div>
                <div className="price-value price-dealer">
                  {machine.prix_dealer !== undefined
                    ? machine.prix_dealer.toLocaleString("fr-FR") + " €"
                    : "—"}
                </div>
              </div>
            )}
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
