import { useState, useMemo, useRef } from "react";
import {
  Machine,
  calculAgeStock,
  FicheCommerciale,
  getNextFicheNumber,
} from "../types/machine";
import { useMachines } from "../contexts/MachinesContext";
import DisponibleCard from "../components/DisponibleCard";
import EditPriceModal from "../components/EditPriceModal";
import ImportResultModal from "../components/ImportResultModal";
import LldModal from "../components/LldModal";
import FicheCommercialeModal from "../components/FicheCommercialeModal";
import PhoneSetupModal from "../components/PhoneSetupModal";
import ChoixPrixModal from "../components/ChoixPrixModal";
import FicheVoTemplate from "../components/FicheVoTemplate";
import DisponiblesFilters, {
  DispoFilterState,
  EMPTY_DISPO_FILTERS,
  applyDispoFilters,
} from "../components/DisponiblesFilters";
import { exportPricingToExcel } from "../utils/exportPricing";
import { importPricingFromExcel, ImportResult } from "../utils/importPricing";
import { generateFichePdf } from "../utils/generateFichePdf";

const SEUIL_REPRICER = 60;
const PHONE_KEY = "delta-vo-user-phone";

interface DisponiblesPageProps {
  userRole: string;
  userName: string;
}

export default function DisponiblesPage({ userRole, userName }: DisponiblesPageProps) {
  const {
    machines,
    updatePrice,
    basculerEnLld,
    updateFicheCommerciale,
    attribuerNumeroFiche,
  } = useMachines();

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<DispoFilterState>(EMPTY_DISPO_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [lldMachine, setLldMachine] = useState<Machine | null>(null);
  const [ficheMachine, setFicheMachine] = useState<Machine | null>(null);
  const [phoneSetupOpen, setPhoneSetupOpen] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState<Machine | null>(null);
  const [choixPrixMachine, setChoixPrixMachine] = useState<Machine | null>(null);
  const [generatingMachine, setGeneratingMachine] = useState<Machine | null>(null);
  const [generatingPrix, setGeneratingPrix] = useState<"fr" | "export">("fr");
  const [generating, setGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = userRole === "admin";
  const canLld = userRole === "admin" || userRole === "secretaire";
  const canFiche =
    userRole === "admin" ||
    userRole === "secretaire" ||
    userRole === "vendeur_fr" ||
    userRole === "vendeur_export" ||
    userRole === "chef";

  const baseDispo = useMemo(
    () => machines.filter((m) => m.statut === "disponible"),
    [machines]
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
    (m) => m.prix_fr === undefined && m.prix_export === undefined
  );
  const avecPrix = filtered.filter(
    (m) => m.prix_fr !== undefined || m.prix_export !== undefined
  );
  const aRepricer = avecPrix.filter(
    (m) => m.date_mise_stock && calculAgeStock(m.date_mise_stock) > SEUIL_REPRICER
  );
  const enVente = avecPrix.filter((m) => !aRepricer.includes(m));

  const totalPricing =
    baseDispo.filter((m) => m.prix_fr === undefined && m.prix_export === undefined).length +
    baseDispo.filter(
      (m) =>
        (m.prix_fr !== undefined || m.prix_export !== undefined) &&
        m.date_mise_stock &&
        calculAgeStock(m.date_mise_stock) > SEUIL_REPRICER
    ).length;

  function handlePriceUpdate(
    id: string,
    prixFr: number | undefined,
    prixExport: number | undefined
  ) {
    updatePrice(id, prixFr, prixExport, userName, true);
  }

  function handleExportPricing() {
    exportPricingToExcel({ machines, seuilRepricer: SEUIL_REPRICER });
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

  // ====== GÉNÉRATION FICHE VO ======
  function handleGenerateFiche(machine: Machine) {
    // Étape 1 : vérifier le téléphone
    const phone = localStorage.getItem(PHONE_KEY);
    if (!phone) {
      setPendingGenerate(machine);
      setPhoneSetupOpen(true);
      return;
    }
    // Étape 2 : déterminer le prix à afficher selon le rôle
    routerPrix(machine);
  }

  function routerPrix(machine: Machine) {
    // Si le rôle force un prix, on génère directement
    if (userRole === "vendeur_fr") {
      doGeneratePdf(machine, "fr");
      return;
    }
    if (userRole === "vendeur_export") {
      doGeneratePdf(machine, "export");
      return;
    }
    // Sinon (admin / secretaire / chef) → choix manuel
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

  function handleChoixPrixConfirm(prixChoisi: "fr" | "export") {
    if (!choixPrixMachine) return;
    const m = choixPrixMachine;
    setChoixPrixMachine(null);
    doGeneratePdf(m, prixChoisi);
  }

  async function doGeneratePdf(machine: Machine, prixChoisi: "fr" | "export") {
    // Attribution du numéro de fiche si pas encore fait
    let numero = machine.fiche_commerciale?.numero_fiche;
    if (!numero) {
      numero = getNextFicheNumber(machines);
      attribuerNumeroFiche(machine.id, numero);
    }

    // On déclenche le rendu du composant FicheVoTemplate
    setGeneratingPrix(prixChoisi);
    setGeneratingMachine({
      ...machine,
      fiche_commerciale: {
        ...machine.fiche_commerciale,
        numero_fiche: numero,
      },
    });

    setGenerating(true);

    // On attend que le DOM se mette à jour, puis on capture
    setTimeout(async () => {
      try {
        const phone = localStorage.getItem(PHONE_KEY) || "Non renseigné";
        // userName arrive sous forme "Prénom Nom"
        const email = `${userName.toLowerCase().replace(/\s+/g, ".")}@klubb.com`;

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
      } catch (err: any) {
        alert("❌ Erreur lors de la génération du PDF : " + err.message);
        console.error(err);
      } finally {
        setGenerating(false);
        setGeneratingMachine(null);
      }
    }, 300);
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
              s.prixExport !== undefined ? s.prixExport : machine.prix_export,
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
        <button
          className="btn-pricing"
          onClick={handleExportPricing}
          disabled={totalPricing === 0}
        >
          📋 Export Pricing
          {totalPricing > 0 && <span className="pricing-count">{totalPricing}</span>}
        </button>
        <button className="btn-import" onClick={handleImportClick} disabled={importing}>
          {importing ? "⏳ Import..." : "📤 Importer pricing"}
        </button>
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