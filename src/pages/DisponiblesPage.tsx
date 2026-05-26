import { useState, useMemo, useRef } from "react";
import {
  Machine,
  calculAgeStock,
  FicheCommerciale,
  getNextFicheNumber,
} from "../types/machine";
import { useMachinesFiltered } from "../contexts/MachinesContext";
import DisponibleCard from "../components/DisponibleCard";
import EditPriceModal from "../components/EditPriceModal";
import ImportResultModal from "../components/ImportResultModal";
import LldModal from "../components/LldModal";
import FicheCommercialeModal from "../components/FicheCommercialeModal";
import PhoneSetupModal from "../components/PhoneSetupModal";
import ChoixPrixModal from "../components/ChoixPrixModal";
import ExpertiseModal from "../components/ExpertiseModal";
import FicheVoTemplate from "../components/FicheVoTemplate";
import DisponiblesFilters, {
  DispoFilterState,
  EMPTY_DISPO_FILTERS,
  applyDispoFilters,
} from "../components/DisponiblesFilters";
import { exportPricingToExcel } from "../utils/exportPricing";
import { importPricingFromExcel, ImportResult } from "../utils/importPricing";
import { generateFichePdf } from "../utils/generateFichePdf";
import { exportListePrix } from "../utils/exportListePrix";
import {
  canExportExcelPricing,
  canImportExcelPricing,
  canExportListePrix,
  canDeleteMachine,
} from "../utils/permissions";

const SEUIL_REPRICER = 60;
const PHONE_KEY = "delta-vo-user-phone";

interface DisponiblesPageProps {
  userRole: string;
  userName: string;
}

export default function DisponiblesPage({ userRole, userName }: DisponiblesPageProps) {
  // 🆕 Toggle "Voir archivées"
  const [showArchived, setShowArchived] = useState(false);

  const {
    machines,
    updatePrice,
    basculerEnLld,
    updateFicheCommerciale,
    attribuerNumeroFiche,
    deleteMachine,
  } = useMachinesFiltered(showArchived);

  // Pour le compteur des archivées
  const { machines: allMachinesUnfiltered } = useMachinesFiltered(true);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DispoFilterState>(EMPTY_DISPO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [lldMachine, setLldMachine] = useState<Machine | null>(null);
  const [ficheMachine, setFicheMachine] = useState<Machine | null>(null);
  const [expertiseMachine, setExpertiseMachine] = useState<Machine | null>(null);
  const [phoneSetupOpen, setPhoneSetupOpen] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState<Machine | null>(null);
  const [choixPrixMachine, setChoixPrixMachine] = useState<Machine | null>(null);
  const [generatingMachine, setGeneratingMachine] = useState<Machine | null>(null);
  const [generatingPrix, setGeneratingPrix] = useState<"fr" | "dealer">("fr");
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRole === "admin";
  const canLld = userRole === "admin" || userRole === "secretaire";
  const canFiche =
    userRole === "admin" ||
    userRole === "secretaire" ||
    userRole === "vendeur_fr" ||
    userRole === "dealer" ||
    userRole === "chef";

  const baseDispo = useMemo(
    () => machines.filter((m) => m.statut === "disponible" || (m.statut === "restitution" && m.expertise_ok)),
    [machines]
  );

  // Compteur des archivées en disponibles (pour info)
  const totalArchived = useMemo(
    () =>
      allMachinesUnfiltered.filter(
        (m) => m.archived && (m.statut === "disponible" || (m.statut === "restitution" && m.expertise_ok))
      ).length,
    [allMachinesUnfiltered]
  );

  const filtered = useMemo(() => {
    let result = baseDispo;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.immat.toLowerCase().includes(q) ||
          m.modele_porteur.toLowerCase().includes(q) ||
          m.type_nacelle.toLowerCase().includes(q)
      );
    }
    result = applyDispoFilters(result, filters, userRole, SEUIL_REPRICER);
    return result;
  }, [baseDispo, search, filters, userRole]);

  const sansPrix = filtered.filter(
    (m) => m.prix_fr === undefined && m.prix_dealer === undefined
  );
  const avecPrix = filtered.filter(
    (m) => m.prix_fr !== undefined || m.prix_dealer !== undefined
  );
  const aRepricer = avecPrix.filter(
    (m) => m.date_mise_stock && calculAgeStock(m.date_mise_stock) > SEUIL_REPRICER
  );
  const enVente = avecPrix.filter((m) => !aRepricer.includes(m));

  const totalPricing =
    baseDispo.filter((m) => m.prix_fr === undefined && m.prix_dealer === undefined).length +
    baseDispo.filter(
      (m) =>
        (m.prix_fr !== undefined || m.prix_dealer !== undefined) &&
        m.date_mise_stock &&
        calculAgeStock(m.date_mise_stock) > SEUIL_REPRICER
    ).length;

  function handlePriceUpdate(
    id: string,
    prixFr: number | undefined,
    prixDealer: number | undefined
  ) {
    updatePrice(id, prixFr, prixDealer, userName, true);
  }

  function handleExportPricing() {
    exportPricingToExcel({ machines, seuilRepricer: SEUIL_REPRICER });
  }

  function handleExportListePrix() {
    if (filtered.length === 0) {
      alert("Aucune machine à exporter avec les filtres actuels");
      return;
    }
    exportListePrix(filtered, userRole as any);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleLldBascule(machineId: string, clientLld: string, dateMiseDispo: string) {
    basculerEnLld(machineId, clientLld, dateMiseDispo);
  }

  function handleSaveFiche(machineId: string, fiche: FicheCommerciale) {
    updateFicheCommerciale(machineId, fiche);
  }

  function handleDeleteMachine(machineId: string) {
    const machine = machines.find(m => m.id === machineId);
    if (!machine) return;
    
    const confirmed = window.confirm(
      `⚠️ ATTENTION : Supprimer définitivement la machine ${machine.immat} (${machine.type_nacelle}) ?\n\nCette action est IRRÉVERSIBLE !`
    );
    
    if (confirmed) {
      deleteMachine(machineId);
    }
  }

  // ====== GÉNÉRATION FICHE VO ======
  function handleGenerateFiche(machine: Machine) {
    const phone = localStorage.getItem(PHONE_KEY);
    if (!phone) {
      setPendingGenerate(machine);
      setPhoneSetupOpen(true);
      return;
    }
    routerPrix(machine);
  }

  function routerPrix(machine: Machine) {
    if (userRole === "vendeur_fr") {
      doGeneratePdf(machine, "fr");
      return;
    }
    if (userRole === "dealer") {
      doGeneratePdf(machine, "dealer");
      return;
    }
    setChoixPrixMachine(machine);
  }

  function handlePhoneSaved(phone: string) {
    localStorage.setItem(PHONE_KEY, phone);
    if (pendingGenerate) {
      const m = pendingGenerate;
      setPendingGenerate(null);
      routerPrix(m);
    }
  }

  function handleChoixPrixConfirm(prixChoisi: "fr" | "dealer") {
    if (!choixPrixMachine) return;
    const m = choixPrixMachine;
    setChoixPrixMachine(null);
    doGeneratePdf(m, prixChoisi);
  }

  async function doGeneratePdf(machine: Machine, prixChoisi: "fr" | "dealer") {
    console.log("🎯 [PDF] Début génération pour", machine.immat, "prix:", prixChoisi);
    console.log("🎯 [PDF] Fiche commerciale:", machine.fiche_commerciale);
    console.log("🎯 [PDF] Photos commerciales:", machine.photos_commerciales);
    
    let numero = machine.fiche_commerciale?.numero_fiche;
    if (!numero) {
      numero = getNextFicheNumber(machines);
      attribuerNumeroFiche(machine.id, numero);
      console.log("🎯 [PDF] Nouveau numéro attribué:", numero);
    } else {
      console.log("🎯 [PDF] Numéro existant:", numero);
    }

    setGeneratingPrix(prixChoisi);
    setGeneratingMachine({
      ...machine,
      fiche_commerciale: {
        ...machine.fiche_commerciale,
        numero_fiche: numero,
      },
    });

    setGenerating(true);
    console.log("🎯 [PDF] State mis à jour, attente 300ms pour rendu DOM...");

    setTimeout(async () => {
      console.log("🎯 [PDF] Timeout terminé, lancement de la génération...");
      try {
        const phone = localStorage.getItem(PHONE_KEY) || "Non renseigné";
        const email = `${userName.toLowerCase().replace(/\s+/g, ".")}@klubb.com`;
        console.log("🎯 [PDF] Commercial:", { nom: userName, email, phone });

        // Vérifier que les éléments DOM existent
        const page1 = document.getElementById("fiche-vo-page-1");
        const page2 = document.getElementById("fiche-vo-page-2");
        console.log("🎯 [PDF] DOM page1:", !!page1, "page2:", !!page2);

        await generateFichePdf({
          machine: {
            ...machine,
            fiche_commerciale: {
              ...machine.fiche_commerciale,
              numero_fiche: numero!,
            },
          },
          prixChoisi,
          commercial: {
            nom: userName,
            email,
            phone,
          },
        });
        console.log("🎯 [PDF] ✅ Génération terminée avec succès !");
      } catch (err: any) {
        console.error("❌ [PDF] Erreur:", err);
        alert("❌ Erreur lors de la génération du PDF : " + err.message);
      } finally {
        setGenerating(false);
        setGeneratingMachine(null);
      }
    }, 500);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const result = await importPricingFromExcel({ file, machines });
      if (result.success.length > 0) {
        result.success.forEach((s) => {
          const machine = machines.find(
            (m) => m.immat.toUpperCase() === s.immat.toUpperCase()
          );
          if (machine) {
            updatePrice(
              machine.id,
              s.prixFr !== undefined ? s.prixFr : machine.prix_fr,
              s.prixDealer !== undefined ? s.prixDealer : machine.prix_dealer,
              "Workflow Excel (PDG)",
              false
            );
          }
        });
      }
      setImportResult(result);
    } catch (err: any) {
      alert("Erreur lors de l'import : " + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="page-disponibles">
      <div className="page-header">
        <div>
          <h1>Disponibles</h1>
          <p className="subtitle">Nacelles d'occasion en vente</p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{filtered.length}</span>
            <span className="stat-label">affichées</span>
          </div>
          <div className="stat stat-pending">
            <span className="stat-value">{sansPrix.length}</span>
            <span className="stat-label">à pricer</span>
          </div>
          <div className="stat stat-warn">
            <span className="stat-value">{aRepricer.length}</span>
            <span className="stat-label">à repricer</span>
          </div>
        </div>
      </div>

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder="Rechercher par immatriculation, modèle, type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        {/* Export pricing pour PDG (admin + secrétaire) */}
        {canExportExcelPricing(userRole as any) && (
          <button
            className="btn-pricing"
            onClick={handleExportPricing}
            disabled={totalPricing === 0}
            title="Export technique pour modification PDG"
          >
            📊 Export Pricing PDG
            {totalPricing > 0 && <span className="pricing-count">{totalPricing}</span>}
          </button>
        )}

        {/* Export liste prix commerciale (tous sauf chef/atelier) */}
        {canExportListePrix(userRole as any) && (
          <button
            className="btn-export-liste"
            onClick={handleExportListePrix}
            title="Liste de prix pour envoi clients"
          >
            📄 Export Liste Prix
          </button>
        )}

        {canImportExcelPricing(userRole as any) && (
          <button className="btn-import" onClick={handleImportClick} disabled={importing}>
            {importing ? "⏳ Import..." : "📤 Importer pricing"}
          </button>
        )}

        {isAdmin && (
          <button
            className={`toggle-archived ${showArchived ? "active" : ""}`}
            onClick={() => setShowArchived(!showArchived)}
            title="Voir les machines archivées"
          >
            🗑️ {showArchived ? "Masquer archivées" : "Voir archivées"}
            {totalArchived > 0 && !showArchived && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>({totalArchived})</span>
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      <DisponiblesFilters
        filters={filters}
        onChange={setFilters}
        machines={baseDispo}
        userRole={userRole}
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen(!filtersOpen)}
        seuilRepricer={SEUIL_REPRICER}
      />

      {sansPrix.length > 0 && (
        <section className="dispo-section section-pricing">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-pending"></span>
              En attente de pricing
              <span className="section-count">{sansPrix.length}</span>
            </h2>
            <p className="section-desc">
              Ces machines attendent que le PDG fixe leurs prix de vente
            </p>
          </div>
          <div className="dispo-list">
            {sansPrix.map((m) => (
              <DisponibleCard
                key={m.id}
                machine={m}
                seuilRepricer={SEUIL_REPRICER}
                isAdmin={isAdmin}
                onEditPrice={setEditingMachine}
                onViewExpertise={setExpertiseMachine}
                canDelete={canDeleteMachine(userRole as any)}
                onDelete={handleDeleteMachine}
              />
            ))}
          </div>
        </section>
      )}

      {aRepricer.length > 0 && (
        <section className="dispo-section section-repricer">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-warn"></span>
              À repricer (plus de {SEUIL_REPRICER} jours en stock)
              <span className="section-count">{aRepricer.length}</span>
            </h2>
            <p className="section-desc">Stock long — suggérer une baisse de prix au PDG</p>
          </div>
          <div className="dispo-list">
            {aRepricer.map((m) => (
              <DisponibleCard
                key={m.id}
                machine={m}
                seuilRepricer={SEUIL_REPRICER}
                isAdmin={isAdmin}
                canLld={canLld}
                canFiche={canFiche}
                onEditPrice={setEditingMachine}
                onLld={setLldMachine}
                onEditFiche={setFicheMachine}
                onGenerateFiche={handleGenerateFiche}
                onViewExpertise={setExpertiseMachine}
                canDelete={canDeleteMachine(userRole as any)}
                onDelete={handleDeleteMachine}
              />
            ))}
          </div>
        </section>
      )}

      {enVente.length > 0 && (
        <section className="dispo-section">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-ok"></span>
              En vente
              <span className="section-count">{enVente.length}</span>
            </h2>
          </div>
          <div className="dispo-list">
            {enVente.map((m) => (
              <DisponibleCard
                key={m.id}
                machine={m}
                seuilRepricer={SEUIL_REPRICER}
                isAdmin={isAdmin}
                canLld={canLld}
                canFiche={canFiche}
                onEditPrice={setEditingMachine}
                onLld={setLldMachine}
                onEditFiche={setFicheMachine}
                onGenerateFiche={handleGenerateFiche}
                onViewExpertise={setExpertiseMachine}
                canDelete={canDeleteMachine(userRole as any)}
                onDelete={handleDeleteMachine}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          {search ||
          filters.typeNacelle ||
          filters.prixMin ||
          filters.prixMax ||
          filters.statutPrix !== "tous" ||
          filters.ageMin ||
          filters.ageMax
            ? "Aucune machine ne correspond à vos critères"
            : showArchived
            ? "Aucune machine archivée"
            : "Aucune machine disponible"}
        </div>
      )}

      {editingMachine && (
        <EditPriceModal
          machine={editingMachine}
          userName={userName}
          onClose={() => setEditingMachine(null)}
          onSave={handlePriceUpdate}
        />
      )}

      {importResult && (
        <ImportResultModal
          result={importResult}
          onClose={() => setImportResult(null)}
        />
      )}

      {lldMachine && (
        <LldModal
          machine={lldMachine}
          onClose={() => setLldMachine(null)}
          onConfirm={handleLldBascule}
        />
      )}

      {ficheMachine && (
        <FicheCommercialeModal
          machine={ficheMachine}
          onClose={() => setFicheMachine(null)}
          onSave={handleSaveFiche}
        />
      )}

      {phoneSetupOpen && (
        <PhoneSetupModal
          userName={userName}
          onClose={() => {
            setPhoneSetupOpen(false);
            setPendingGenerate(null);
          }}
          onSave={handlePhoneSaved}
        />
      )}

      {choixPrixMachine && (
        <ChoixPrixModal
          machine={choixPrixMachine}
          onClose={() => setChoixPrixMachine(null)}
          onConfirm={handleChoixPrixConfirm}
        />
      )}

      {expertiseMachine && (
        <ExpertiseModal
          machine={expertiseMachine}
          onClose={() => setExpertiseMachine(null)}
        />
      )}

      {/* Overlay loader pendant génération PDF */}
      {generating && (
        <div className="pdf-loader-overlay">
          <div className="pdf-loader-box">
            <div className="pdf-loader-spinner">📄</div>
            <div className="pdf-loader-text">Génération du PDF en cours...</div>
            <div className="pdf-loader-sub">Le téléchargement va démarrer dans quelques secondes</div>
          </div>
        </div>
      )}

      {/* Zone cachée hors écran pour le rendu de la fiche à capturer */}
      {generatingMachine && (
        <div
          style={{
            position: "fixed",
            top: "-9999px",
            left: "-9999px",
            zIndex: -1,
          }}
        >
          <FicheVoTemplate
            machine={generatingMachine}
            prixChoisi={generatingPrix}
            commercial={{
              nom: userName,
              email: `${userName.toLowerCase().replace(/\s+/g, ".")}@klubb.com`,
              phone: localStorage.getItem(PHONE_KEY) || "—",
            }}
          />
        </div>
      )}
    </div>
  );
}
