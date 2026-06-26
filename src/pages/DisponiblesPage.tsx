import { useState, useMemo, useRef, useEffect } from "react";
import {
  Machine,
  calculAgeStock,
  FicheCommerciale,
  PhotoSupplementaire,
  getNextFicheNumber,
} from "../types/machine";
import { useMachinesFiltered } from "../contexts/MachinesContext";
import DisponibleCard from "../components/DisponibleCard";
import OffreModal from "../components/OffreModal";
import { createHubspotDeal } from "../services/hubspotService";
import EditPriceModal from "../components/EditPriceModal";
import ImportResultModal from "../components/ImportResultModal";
import LldModal from "../components/LldModal";
import FicheCommercialeModal from "../components/FicheCommercialeModal";
import PhoneSetupModal from "../components/PhoneSetupModal";
import ChoixPrixModal from "../components/ChoixPrixModal";
import ExpertiseModal from "../components/ExpertiseModal";
import NacelleExpertModal from "../components/NacelleExpertModal";
import PhotosModal from "../components/PhotosModal";
import FicheVoTemplate from "../components/FicheVoTemplate";
import DisponiblesFilters, {
  DispoFilterState,
  EMPTY_DISPO_FILTERS,
  applyDispoFilters,
} from "../components/DisponiblesFilters";
import { exportPricingToExcel } from "../utils/exportPricing";
import { importPricingFromExcel, ImportResult } from "../utils/importPricing";
import { parseStockExcel } from "../utils/importStock";
import { runNacelleExpertRattrapage } from "../hooks/useNacelleExpertSync";
import { useTranslation } from "react-i18next";
import { generateFichePdf } from "../utils/generateFichePdf";
import { exportListePrix } from "../utils/exportListePrix";
import {
  canExportExcelPricing,
  canImportExcelPricing,
  canExportListePrix,
  canDeleteMachine,
  canCreateLLD,
  canGenerateFicheVO,
  canEditFicheCommerciale,
  canManagePhotosSupplementaires,
} from "../utils/permissions";
import { useAuth } from "../AuthContext";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

const SEUIL_REPRICER = 60;
const PHONE_KEY = "delta-vo-user-phone";

interface DisponiblesPageProps {
  userRole: string;
  userName: string;
  userEmail?: string;
}

export default function DisponiblesPage({ userRole, userName, userEmail }: DisponiblesPageProps) {
  // ✅ Récupérer le profil Firebase de l'utilisateur connecté
  const { user, profile } = useAuth();
  
  // ✅ State local pour le téléphone (mise à jour immédiate après sauvegarde)
  const [currentPhone, setCurrentPhone] = useState<string | undefined>(
    profile?.phone || localStorage.getItem(PHONE_KEY) || undefined
  );
  
  // Synchroniser quand profile change
  useEffect(() => {
    if (profile?.phone) {
      setCurrentPhone(profile.phone);
    }
  }, [profile?.phone]);
  
  // 🆕 Toggle "Voir archivées"
  const [showArchived, setShowArchived] = useState(false);

  const {
    machines,
    updatePrice,
    basculerEnLld,
    updateFicheCommerciale,
    updatePhotosSupplementaires,
    updateShareToken,
    updateLocalite,
    attribuerNumeroFiche,
    deleteMachine,
    creerOffre,
    annulerOffre,
    importStockMachines,
    refreshExpertiseMontants,
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
  const [neMachine, setNeMachine] = useState<Machine | null>(null);
  const [photosMachine, setPhotosMachine] = useState<Machine | null>(null);
  const [phoneSetupOpen, setPhoneSetupOpen] = useState(false);
  const [pendingGenerate, setPendingGenerate] = useState<Machine | null>(null);
  const [choixPrixMachine, setChoixPrixMachine] = useState<Machine | null>(null);
  const [generatingMachine, setGeneratingMachine] = useState<Machine | null>(null);
  const [generatingPrix, setGeneratingPrix] = useState<"fr" | "dealer">("fr");
  const [generating, setGenerating] = useState(false);
  // ✅ Panier offre HubSpot (vente en lot)
  const [panier, setPanier] = useState<Machine[]>([]);
  const [offreModalOpen, setOffreModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stockInputRef = useRef<HTMLInputElement>(null);
  const [importingStock, setImportingStock] = useState(false);
  const [refreshingExpertise, setRefreshingExpertise] = useState(false);
  const [rattrapage, setRattrapage] = useState(false);
  const { t } = useTranslation();

  const isAdmin = userRole === "admin";
  // ✅ Visible par TOUS les rôles (demande) : Mise en location, Compléter fiche, Photos
  const canLld = true;
  const canFiche = true;
  // ✅ Générer le PDF (fiche VO) : visible par tous (demande)
  const canGenFiche = true;
  const canManagePhotos = true;
  // ✅ Créer une offre HubSpot : admin, vendeur_fr, dealer
  const canOffre = ["admin", "vendeur_fr", "dealer"].includes(userRole);

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
    prixDealer: number | undefined,
    numeroDossier?: string
  ) {
    updatePrice(id, prixFr, prixDealer, userName, true, numeroDossier);
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

  function handleSavePhotos(machineId: string, photos: PhotoSupplementaire[]) {
    updatePhotosSupplementaires(machineId, photos);
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
  function togglePanier(machine: Machine) {
    setPanier((prev) => {
      const exists = prev.find((m) => m.id === machine.id);
      if (exists) return prev.filter((m) => m.id !== machine.id);
      return [...prev, machine];
    });
  }

  function isInPanier(machineId: string): boolean {
    return panier.some((m) => m.id === machineId);
  }

  async function handleCreerOffre(
    clientOffre: string,
    montants: Record<string, number>
  ) {
    const ids = panier.map((m) => m.id);

    // Préparer les nacelles pour HubSpot
    const nacelles = panier.map((m) => ({
      immat: m.immat,
      modele: m.type_nacelle || m.modele_porteur || "",
      montant: montants[m.id] ?? 0,
    }));

    // Ouvre l'onglet TOUT DE SUITE (dans le geste de clic) pour éviter le
    // blocage de pop-up : la création du deal est asynchrone, donc on ne peut
    // pas ouvrir la fenêtre après coup. On y chargera l'URL du deal une fois prêt.
    const hubspotTab = window.open("about:blank", "_blank");

    // 1. Tenter la création du Deal + Devis HubSpot
    let hubspotDealId: string | undefined;
    let quoteWarning: string | null | undefined;
    try {
      const result = await createHubspotDeal(clientOffre, nacelles, userEmail);
      hubspotDealId = result.dealId;
      quoteWarning = result.quoteWarning;
      console.log(`✅ Deal HubSpot créé : ${result.dealName} (id: ${result.dealId})`);
      if (result.quoteId) {
        console.log(`✅ Devis brouillon HubSpot créé : ${result.quoteId}`);
      }
      if (quoteWarning) {
        console.warn("⚠️ Devis non créé : " + quoteWarning);
      }
    } catch (err: any) {
      console.error("❌ Erreur HubSpot:", err);
      if (hubspotTab) hubspotTab.close();
      const confirmContinue = window.confirm(
        `⚠️ La création du Deal HubSpot a échoué :\n${err.message}\n\n` +
        `Voulez-vous quand même marquer les nacelles comme "Offre en cours" dans Delta VO ?\n` +
        `(Le Deal HubSpot devra être créé manuellement)`
      );
      if (!confirmContinue) {
        return;
      }
    }

    // 2. Marquer les nacelles "Offre en cours" dans Firebase (avec ou sans hubspot_deal_id)
    await creerOffre(ids, clientOffre, montants, hubspotDealId);

    setPanier([]);
    setOffreModalOpen(false);

    if (hubspotDealId) {
      // ✅ Charge la fiche Deal HubSpot dans l'onglet déjà ouvert (le devis brouillon y figure)
      const dealUrl = `https://app.hubspot.com/contacts/144239378/deal/${hubspotDealId}`;
      if (hubspotTab) {
        hubspotTab.location.href = dealUrl;
      } else {
        // Au cas où l'onglet n'a pas pu être pré-ouvert
        window.open(dealUrl, "_blank", "noopener,noreferrer");
      }
      console.log(`✅ Deal HubSpot ouvert : ${dealUrl}`);
    } else {
      if (hubspotTab) hubspotTab.close();
      alert(
        `⚠️ Offre créée localement pour ${clientOffre} (${ids.length} nacelle(s))\n` +
        `Le Deal HubSpot n'a pas pu être créé.`
      );
    }
  }

  function handleAnnulerOffre(machine: Machine) {
    if (window.confirm(`Annuler l'offre en cours sur ${machine.immat} ?`)) {
      annulerOffre(machine.id);
    }
  }

  function handleGenerateFiche(machine: Machine) {
    // ✅ Récupérer le téléphone depuis le state local (synchro avec Firebase)
    if (!currentPhone) {
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

  async function handlePhoneSaved(phone: string) {
    // ✅ Sauvegarder le téléphone dans le PROFIL UTILISATEUR Firebase
    if (user) {
      try {
        await updateDoc(doc(db, "users", user.uid), { phone });
        console.log("✅ Téléphone enregistré dans le profil:", phone);
      } catch (err) {
        console.error("❌ Erreur sauvegarde phone:", err);
        // Fallback localStorage si Firebase échoue
        localStorage.setItem(PHONE_KEY, phone);
      }
    }
    
    // ✅ CRITIQUE : Mettre à jour le state local immédiatement
    // (sinon profile?.phone reste undefined jusqu'au prochain reload)
    setCurrentPhone(phone);
    
    if (pendingGenerate) {
      const m = pendingGenerate;
      setPendingGenerate(null);
      // Passer la machine ET le phone pour éviter race condition
      setTimeout(() => routerPrix(m), 100);
    }
  }

  function handleChoixPrixConfirm(prixChoisi: "fr" | "dealer") {
    if (!choixPrixMachine) return;
    const m = choixPrixMachine;
    setChoixPrixMachine(null);
    doGeneratePdf(m, prixChoisi);
  }

  async function doGeneratePdf(machine: Machine, prixChoisi: "fr" | "dealer") {
    let numero = machine.fiche_commerciale?.numero_fiche;
    if (!numero) {
      numero = getNextFicheNumber(machines);
      attribuerNumeroFiche(machine.id, numero);
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

    setTimeout(async () => {
      try {
        const phone = currentPhone || "Non renseigné";
        const email = user?.email || `${userName.toLowerCase().replace(/\s+/g, ".")}@klubb.com`;

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

  async function handleStockFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingStock(true);
    try {
      const { parsed, skipped, totalRows } = await parseStockExcel(file);
      if (parsed.length === 0) {
        alert(
          `Aucune machine "à vendre" trouvée dans le fichier (${totalRows} lignes lues).`
        );
        return;
      }
      const ok = window.confirm(
        `Import du stock VOG :\n\n` +
          `• ${parsed.length} machine(s) à vendre détectée(s)\n` +
          `• ${skipped.length} ligne(s) ignorée(s) (pas à vendre)\n\n` +
          `Les machines déjà présentes seront complétées (sans écraser prix/fiche).\n\n` +
          `Lancer l'import ?`
      );
      if (!ok) return;

      const res = await importStockMachines(parsed);
      alert(
        `✅ Import terminé :\n\n` +
          `• ${res.created} machine(s) créée(s)\n` +
          `• ${res.merged} machine(s) complétée(s)\n` +
          `• ${res.skipped} inchangée(s) / ignorée(s)`
      );
    } catch (err: any) {
      alert("Erreur lors de l'import du stock : " + err.message);
    } finally {
      setImportingStock(false);
      if (stockInputRef.current) stockInputRef.current.value = "";
    }
  }

  async function handleRefreshExpertise() {
    setRefreshingExpertise(true);
    try {
      const res = await refreshExpertiseMontants();
      alert(
        `✅ Montants d'expertise récupérés :\n\n` +
          `• ${res.matched} machine(s) avec une expertise trouvée\n` +
          `• ${res.updated} machine(s) mise(s) à jour\n` +
          `(sur ${res.total} machines au total)`
      );
    } catch (err: any) {
      alert("Erreur lors de la récupération des expertises : " + err.message);
    } finally {
      setRefreshingExpertise(false);
    }
  }

  async function handleRattrapage() {
    setRattrapage(true);
    try {
      const res = await runNacelleExpertRattrapage();
      alert(
        `✅ Rattrapage terminé :\n\n` +
          `• ${res.scanned} dossier(s) Nacelle-Expert scanné(s)\n` +
          `• ${res.updated} machine(s) mise(s) à jour (photos / PDF)`
      );
    } catch (err: any) {
      alert("Erreur lors du rattrapage : " + err.message);
    } finally {
      setRattrapage(false);
    }
  }

  return (
    <div className="page-disponibles">
      <div className="page-header">
        <div>
          <h1>{t("dispo.title")}</h1>
          <p className="subtitle">{t("dispo.subtitle")}</p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{filtered.length}</span>
            <span className="stat-label">{t("dispo.statShown")}</span>
          </div>
          <div className="stat stat-pending">
            <span className="stat-value">{sansPrix.length}</span>
            <span className="stat-label">{t("dispo.statToPrice")}</span>
          </div>
          <div className="stat stat-warn">
            <span className="stat-value">{aRepricer.length}</span>
            <span className="stat-label">{t("dispo.statToReprice")}</span>
          </div>
        </div>
      </div>

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder={t("dispo.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        
        {/* Export pricing pour PDG (admin + secrétaire) */}
        {canExportExcelPricing(userRole as any) && (
          <button
            className="btn-pricing"
            onClick={handleExportPricing}
            disabled={totalPricing === 0}
            title={t("dispo.exportPricingTitle")}
          >
            📊 {t("dispo.exportPricingPdg")}
            {totalPricing > 0 && <span className="pricing-count">{totalPricing}</span>}
          </button>
        )}

        {/* Export liste prix commerciale (tous sauf chef/atelier) */}
        {canExportListePrix(userRole as any) && (
          <button
            className="btn-export-liste"
            onClick={handleExportListePrix}
            title={t("dispo.exportListTitle")}
          >
            📄 {t("dispo.exportList")}
          </button>
        )}

        {canImportExcelPricing(userRole as any) && (
          <button className="btn-import" onClick={handleImportClick} disabled={importing}>
            {importing ? `⏳ ${t("dispo.importing")}` : `📤 ${t("dispo.importPricing")}`}
          </button>
        )}

        {isAdmin && (
          <button
            className="btn-import"
            onClick={() => stockInputRef.current?.click()}
            disabled={importingStock}
            title={t("dispo.importStockTitle")}
          >
            {importingStock ? `⏳ ${t("dispo.importingStock")}` : `📦 ${t("dispo.importStock")}`}
          </button>
        )}

        {isAdmin && (
          <button
            className="btn-import"
            onClick={handleRefreshExpertise}
            disabled={refreshingExpertise}
            title={t("dispo.expertiseTitle")}
          >
            {refreshingExpertise ? `⏳ ${t("dispo.refreshingExpertise")}` : `🧰 ${t("dispo.expertiseAmounts")}`}
          </button>
        )}

        {isAdmin && (
          <button
            className="btn-import"
            onClick={handleRattrapage}
            disabled={rattrapage}
            title={t("dispo.rattrapageTitle")}
          >
            {rattrapage ? `⏳ ${t("dispo.rattrapaging")}` : `🖼️ ${t("dispo.rattrapage")}`}
          </button>
        )}

        {isAdmin && (
          <button
            className={`toggle-archived ${showArchived ? "active" : ""}`}
            onClick={() => setShowArchived(!showArchived)}
            title={t("dispo.archivedTitle")}
          >
            🗑️ {showArchived ? t("dispo.hideArchived") : t("dispo.showArchived")}
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
        <input
          ref={stockInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleStockFileChange}
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

      {enVente.length > 0 && (
        <section className="dispo-section">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-ok"></span>
              {t("dispo.sectionForSale")}
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
                canGenerateFiche={canGenFiche}
                canOffre={canOffre}
                isInPanier={isInPanier(m.id)}
                onTogglePanier={togglePanier}
                onAnnulerOffre={handleAnnulerOffre}
                onEditPrice={setEditingMachine}
                onLld={setLldMachine}
                onEditFiche={setFicheMachine}
                onGenerateFiche={handleGenerateFiche}
                onViewExpertise={setExpertiseMachine}
                onViewNacelleExpert={setNeMachine}
                onLocaliteChange={updateLocalite}
                canManagePhotos={canManagePhotos}
                onManagePhotos={setPhotosMachine}
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
              {t("dispo.sectionToReprice", { days: SEUIL_REPRICER })}
              <span className="section-count">{aRepricer.length}</span>
            </h2>
            <p className="section-desc">{t("dispo.sectionToRepriceDesc")}</p>
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
                canGenerateFiche={canGenFiche}
                canOffre={canOffre}
                isInPanier={isInPanier(m.id)}
                onTogglePanier={togglePanier}
                onAnnulerOffre={handleAnnulerOffre}
                onEditPrice={setEditingMachine}
                onLld={setLldMachine}
                onEditFiche={setFicheMachine}
                onGenerateFiche={handleGenerateFiche}
                onViewExpertise={setExpertiseMachine}
                onViewNacelleExpert={setNeMachine}
                onLocaliteChange={updateLocalite}
                canManagePhotos={canManagePhotos}
                onManagePhotos={setPhotosMachine}
                canDelete={canDeleteMachine(userRole as any)}
                onDelete={handleDeleteMachine}
              />
            ))}
          </div>
        </section>
      )}

      {sansPrix.length > 0 && (
        <section className="dispo-section section-pricing">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-pending"></span>
              {t("dispo.sectionPending")}
              <span className="section-count">{sansPrix.length}</span>
            </h2>
            <p className="section-desc">
              {t("dispo.sectionPendingDesc")}
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
                onViewNacelleExpert={setNeMachine}
                onLocaliteChange={updateLocalite}
                canManagePhotos={canManagePhotos}
                onManagePhotos={setPhotosMachine}
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
          filters.typeNacelle.length > 0 ||
          filters.prixMin ||
          filters.prixMax ||
          filters.statutPrix !== "tous" ||
          filters.kmMin ||
          filters.kmMax ||
          filters.anneeMin ||
          filters.anneeMax ||
          filters.ageMin ||
          filters.ageMax
            ? t("dispo.emptyNoMatch")
            : showArchived
            ? t("dispo.emptyArchived")
            : t("dispo.emptyAvailable")}
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

      {neMachine && (
        <NacelleExpertModal
          machine={neMachine}
          onClose={() => setNeMachine(null)}
        />
      )}

      {expertiseMachine && (
        <ExpertiseModal
          machine={expertiseMachine}
          onClose={() => setExpertiseMachine(null)}
        />
      )}

      {photosMachine && (
        <PhotosModal
          machine={photosMachine}
          userName={userName}
          onClose={() => setPhotosMachine(null)}
          onSave={handleSavePhotos}
          onShareTokenChange={updateShareToken}
        />
      )}

      {/* Overlay loader pendant génération PDF */}
      {generating && (
        <div className="pdf-loader-overlay">
          <div className="pdf-loader-box">
            <div className="pdf-loader-spinner">📄</div>
            <div className="pdf-loader-text">{t("dispo.pdfGenerating")}</div>
            <div className="pdf-loader-sub">{t("dispo.pdfGeneratingSub")}</div>
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
              email: user?.email || `${userName.toLowerCase().replace(/\s+/g, ".")}@klubb.com`,
              phone: currentPhone || "—",
            }}
          />
        </div>
      )}

      {/* ✅ Barre flottante du panier d'offre */}
      {canOffre && panier.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1a73e8",
            color: "white",
            padding: "12px 20px",
            borderRadius: 50,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 16,
            zIndex: 1000,
          }}
        >
          <span style={{ fontWeight: 600 }}>
            🛒 {panier.length}{" "}
            {panier.length > 1 ? t("dispo.platformsSelected") : t("dispo.platformSelected")}
          </span>
          <button
            onClick={() => setOffreModalOpen(true)}
            style={{
              background: "white",
              color: "#1a73e8",
              border: "none",
              padding: "8px 16px",
              borderRadius: 50,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            📤 {t("dispo.createOffer")}
          </button>
          <button
            onClick={() => setPanier([])}
            title={t("dispo.clearSelection")}
            style={{
              background: "transparent",
              color: "white",
              border: "1px solid white",
              padding: "8px 12px",
              borderRadius: 50,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ✅ Modal de création d'offre */}
      {offreModalOpen && panier.length > 0 && (
        <OffreModal
          machines={panier}
          onClose={() => setOffreModalOpen(false)}
          onConfirm={handleCreerOffre}
        />
      )}
    </div>
  );
}
