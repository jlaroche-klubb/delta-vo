import { useState, useMemo } from "react";
import {
  Machine,
  prepaTerminee,
  isLivraisonEnRetard,
  isMiseDispoEnRetard,
} from "../types/machine";
import { useMachines } from "../contexts/MachinesContext";
import EnCoursCard from "../components/EnCoursCard";
import { exportEnPreparationExcel } from "../utils/exportEnPreparation";
import ChangerNacelleModal from "../components/ChangerNacelleModal";
import { chargerConfigDevis, lireDevisAdmin, resignerDevis } from "../services/devisVenteService";
import { genererDevisPdf } from "../utils/generateDevisPdf";
import { genererContratLocFiPdf } from "../utils/generateContratLocFiPdf";
import DocumentsModal from "../components/DocumentsModal";
import { useTranslation } from "react-i18next";
import ConfigEnCoursModal, {
  ConfigEnCoursPayload,
} from "../components/ConfigEnCoursModal";
import ConfirmFactureModal from "../components/ConfirmFactureModal";
import EnCoursFilters, {
  EnCoursFilterState,
  EMPTY_ENCOURS_FILTERS,
  applyEnCoursFilters,
} from "../components/EnCoursFilters";
import { canEditEtapesPreparation } from "../utils/permissions";
import { notifierPreparateurs } from "../services/preparationNotify";

interface EnCoursPageProps {
  userRole: string;
  userName: string;
}

export default function EnCoursPage({ userRole, userName }: EnCoursPageProps) {
  const { forcerFinPrepa, archiverDoublon } = useMachines();
  const { machines, toggleEtapePrepa, setEtapeNonNecessaire, addEtapePrepa, removeEtapePrepa, configureEnCours, modifierInfosVente, cancelEnCours, marquerFacturee, marquerLivree, updateDocumentsVO } = useMachines();
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const [filters, setFilters] = useState<EnCoursFilterState>(EMPTY_ENCOURS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [configMachine, setConfigMachine] = useState<Machine | null>(null);
  const [factureMachine, setFactureMachine] = useState<Machine | null>(null);
  const [docsMachine, setDocsMachine] = useState<Machine | null>(null);

  const canEditPrepa = canEditEtapesPreparation(userRole as any);
  const canConfigure = ["secretaire", "admin", "superadmin"].includes(userRole);
  const canFacturer = ["secretaire", "admin", "superadmin"].includes(userRole);
  const canCancel = ["admin", "superadmin"].includes(userRole); // annulation simple (retour en Disponibles)
  const canManageDocuments = canEditPrepa || canConfigure; // atelier + secrétaire + admin

  const baseEnCours = useMemo(
    () => machines.filter((m) => m.statut === "en_cours"),
    [machines]
  );

  const filtered = useMemo(() => {
    let result = baseEnCours;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.immat.toLowerCase().includes(q) ||
          m.modele_porteur.toLowerCase().includes(q) ||
          m.type_nacelle.toLowerCase().includes(q) ||
          (m.acheteur && m.acheteur.toLowerCase().includes(q)) ||
          (m.client_lld && m.client_lld.toLowerCase().includes(q)) ||
          (m.commercial_vendeur && m.commercial_vendeur.toLowerCase().includes(q))
      );
    }
    result = applyEnCoursFilters(result, filters);
    return result;
  }, [baseEnCours, search, filters]);

  const nonConfigurees = filtered.filter((m) => !m.type_prepa);
  const enPrepa = filtered.filter(
    (m) => m.type_prepa === "normale" && !prepaTerminee(m.etapes_prepa)
  );
  const pretes = filtered.filter(
    (m) =>
      m.type_prepa &&
      (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa))
  );

  const nonConfigureesSorted = [...nonConfigurees].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const enPrepaSorted = [...enPrepa].sort((a, b) => {
    const pctA =
      (a.etapes_prepa?.filter((e) => e.done).length || 0) /
      (a.etapes_prepa?.length || 1);
    const pctB =
      (b.etapes_prepa?.filter((e) => e.done).length || 0) /
      (b.etapes_prepa?.length || 1);
    return pctB - pctA;
  });

  const pretesSorted = [...pretes].sort((a, b) => {
    const dateA = a.date_vente || a.date_mise_en_cours || a.createdAt;
    const dateB = b.date_vente || b.date_mise_en_cours || b.createdAt;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  const totalEnCours = baseEnCours.length;
  const totalNonConfigurees = baseEnCours.filter((m) => !m.type_prepa).length;
  const totalPretes = baseEnCours.filter(
    (m) =>
      m.type_prepa &&
      (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa))
  ).length;
  const totalEnRetard = baseEnCours.filter((m) => {
    if (m.type_sortie === "lld") return isMiseDispoEnRetard(m.date_mise_dispo_lld);
    return isLivraisonEnRetard(m.date_livraison_prevue);
  }).length;

  const machinesAvecPrepa = baseEnCours.filter(
    (m) =>
      m.type_prepa === "normale" &&
      prepaTerminee(m.etapes_prepa) &&
      m.date_mise_en_cours &&
      m.etapes_prepa
  );
  const delaiMoyenPrepa =
    machinesAvecPrepa.length > 0
      ? Math.round(
          machinesAvecPrepa.reduce((acc, m) => {
            const lastDoneStr = m.etapes_prepa
              ?.filter((e) => e.done_at)
              .map((e) => e.done_at!)
              .sort()
              .pop();
            if (!lastDoneStr || !m.date_mise_en_cours) return acc;
            const debut = new Date(m.date_mise_en_cours);
            const fin = new Date(lastDoneStr);
            const jours = Math.floor(
              (fin.getTime() - debut.getTime()) / (1000 * 60 * 60 * 24)
            );
            return acc + jours;
          }, 0) / machinesAvecPrepa.length
        )
      : null;

  function handleToggleEtape(machineId: string, etapeId: string) {
    toggleEtapePrepa(machineId, etapeId, userName);
  }

  function handleConfigure(machineId: string, config: ConfigEnCoursPayload) {
    // ✏️ Machine déjà configurée → simple correction des infos (acheteur,
    // commercial, dates, contrat/email) sans toucher au type ni aux étapes.
    const m = machines.find((x) => x.id === machineId);
    if (m?.type_prepa) {
      modifierInfosVente(machineId, {
        acheteur: config.acheteur,
        commercial_vendeur: config.commercial_vendeur,
        date_vente: config.date_vente,
        date_livraison_prevue: config.date_livraison_prevue,
        contrat: config.contrat,
        email_client: config.email_client,
      });
      return;
    }
    configureEnCours(
      machineId,
      config.type_prepa,
      config.acheteur,
      config.commercial_vendeur,
      config.date_vente,
      config.date_livraison_prevue,
      config.contrat,
      config.email_client
    );
    // 📧 Notification automatique aux préparateurs du site (validé Jonathan) —
    // best-effort : n'interrompt jamais la mise en préparation.
    if (m) {
      notifierPreparateurs(m, config, userName).then((r) => {
        if (r.status === "envoye") {
          alert(t("notifPrepa.envoye", { count: r.to.length, site: r.site, immat: m.immat }));
        } else if (r.status === "sans_destinataire") {
          alert(t("notifPrepa.sansDestinataire", { site: r.site, immat: m.immat }));
        } else if (r.status === "sans_site") {
          alert(t("notifPrepa.sansSite", { immat: m.immat }));
        } else {
          alert(t("notifPrepa.erreur", { immat: m.immat, message: r.message }));
        }
      });
    }
  }

  // 🧹 NETTOYAGE (super admin) : sélection multiple, retour en dispo (doublons
  // gérés : une fiche en double d'une autre fiche active est archivée), fin de
  // préparation forcée
  const estSuperAdmin = userRole === "superadmin";
  const [nettoyage, setNettoyage] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [nettoyageEnCours, setNettoyageEnCours] = useState(false);
  const basculer = (id: string) => setSelection((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cle = (v?: string) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const doublonDe = (m: Machine) =>
    machines.find((x) => x.id !== m.id && !x.archived && x.statut !== "cloturee" &&
      ((cle(x.immat) && cle(x.immat) === cle(m.immat)) || (m.numero_dossier && x.numero_dossier === m.numero_dossier)));
  async function retourDispo(liste: Machine[]) {
    const doubles = liste.map((m) => [m, doublonDe(m)] as const).filter(([, d]) => d);
    const msg = `↩ Remettre ${liste.length} nacelle(s) en Disponibles ?\n\n` +
      `• Les données de vente / location et les étapes de préparation seront effacées.\n` +
      `• Une nacelle dont les frais Nacelle Expert ne sont pas réglés repart en Restitutions.\n` +
      (doubles.length ? `• ${doubles.length} fiche(s) en double d'une autre fiche active seront ARCHIVÉES (pas remises en vente) :\n${doubles.slice(0, 8).map(([m, d]) => `   ${m.immat} = ${d!.immat} (${d!.statut})`).join("\n")}${doubles.length > 8 ? "\n   …" : ""}\n` : "");
    if (!window.confirm(msg)) return;
    setNettoyageEnCours(true);
    let dispo = 0, resti = 0, archives = 0;
    const dejaArchivees = new Set<string>(); // deux fiches en double sélectionnées : on garde la première
    for (const m of liste) {
      const d = doublonDe(m);
      if (d && !dejaArchivees.has(d.id)) { await archiverDoublon(m.id, d.immat || d.id, userName); dejaArchivees.add(m.id); archives++; continue; }
      const fraisImpayes = !!m.expertise_recue && !m.facture_reglee_ok;
      await cancelEnCours(m.id);
      if (fraisImpayes) resti++; else dispo++;
    }
    setNettoyageEnCours(false);
    setSelection(new Set());
    alert(`🧹 Nettoyage terminé :\n• ${dispo} remise(s) en Disponibles\n• ${resti} en Restitutions (frais Nacelle Expert non réglés)\n• ${archives} fiche(s) en double archivée(s)`);
  }
  async function forcerFin(liste: Machine[]) {
    const aFaire = liste.filter((m) => !(m.type_prepa && (m.type_prepa === "en_etat" || prepaTerminee(m.etapes_prepa))));
    if (!aFaire.length) { alert("Ces nacelles sont déjà prêtes à facturer."); return; }
    if (!window.confirm(`✅ Forcer la fin de préparation de ${aFaire.length} nacelle(s) ?\n\nToutes les étapes seront cochées (préparation « en l'état » si la vente n'était pas configurée) : elles passeront dans « Prêtes à facturer ».`)) return;
    setNettoyageEnCours(true);
    for (const m of aFaire) await forcerFinPrepa(m.id, userName);
    setNettoyageEnCours(false);
    setSelection(new Set());
    alert(`✅ ${aFaire.length} nacelle(s) passée(s) en « Prêtes à facturer ».`);
  }

  // 🔁 Changer de nacelle (devis signé) + re-signature quand c'est définitif
  const [changerMachine, setChangerMachine] = useState<Machine | null>(null);
  async function handleResigner(m: Machine) {
    if (!m.devis_vente_numero) return;
    if (!window.confirm(`Envoyer le devis ${m.devis_vente_numero} à jour au client pour re-signature ?\n\nÀ faire seulement quand la nacelle est définitive : le client reçoit le nouveau devis avec le bouton « Accepter et signer ».`)) return;
    try {
      const { devis } = await lireDevisAdmin(m.devis_vente_numero);
      const cfg = await chargerConfigDevis();
      const pdf = devis.type === "locfi" && devis.locfi
        ? genererContratLocFiPdf({ ...devis, locfi: devis.locfi }, devis.lignes.map((l) => { const mm = machines.find((x) => x.id === l.machine_id); return { reference: l.reference, type: mm?.type_nacelle, immat: mm?.immat || l.immat }; }))
        : genererDevisPdf(devis, cfg);
      const r = await resignerDevis(m.devis_vente_numero, pdf.base64, pdf.zoneSignature);
      alert(`✍️ Devis ${m.devis_vente_numero} renvoyé à ${r.to} pour re-signature.`);
    } catch (e: any) {
      alert(`❌ ${e?.message || "Envoi impossible"}`);
    }
  }

  function handleCancel(machineId: string) {
    cancelEnCours(machineId);
  }

  function handleFacturer(machineId: string, numeroFacture: string, dateFacturation: string) {
    marquerFacturee(machineId, numeroFacture, dateFacturation);
  }

  // 🚚 « ✓ Livrée » (ventes) : la machine est physiquement partie chez le
  // client — éteint l'alerte « retard de livraison ». En location, c'est
  // l'expertise départ Nacelle Expert qui joue ce rôle automatiquement.
  function handleLivree(machine: Machine) {
    if (!window.confirm(t("encard.confirmDelivered", { immat: machine.immat }))) return;
    marquerLivree(machine.id, userName);
  }

  function clickUrgence() {
    setFilters({ ...EMPTY_ENCOURS_FILTERS, statut: "en_retard" });
    setFiltersOpen(true);
  }

  return (
    <div className="page-encours">
      <div className="page-header">
        <div>
        <h1>{t("encours.title")}</h1>
          <p className="subtitle">{t("encours.subtitle")}</p>
        </div>
        <div className="page-stats">
          <div className="stat">
            <span className="stat-value">{totalEnCours}</span>
            <span className="stat-label">{t("encours.statInProgress")}</span>
          </div>
          <div className="stat stat-pending">
            <span className="stat-value">{totalNonConfigurees}</span>
            <span className="stat-label">{t("encours.statToConfigure")}</span>
          </div>
          <div className="stat stat-ready">
            <span className="stat-value">{totalPretes}</span>
            <span className="stat-label">{t("encours.statToInvoice")}</span>
          </div>
          <div className="stat stat-warn">
            <span className="stat-value">{totalEnRetard}</span>
            <span className="stat-label">{t("encours.statLate")}</span>
          </div>
          {delaiMoyenPrepa !== null && (
            <div className="stat stat-info">
              <span className="stat-value">{delaiMoyenPrepa}{t("card.daysShort")}</span>
              <span className="stat-label">{t("encours.statAvgDelay")}</span>
            </div>
          )}
        </div>
      </div>

      {totalEnRetard > 0 && (
        <div className="urgent-banner" onClick={clickUrgence}>
          <div className="urgent-icon">⚠</div>
          <div className="urgent-text">
            <strong>
              {totalEnRetard} {t("encours.urgentLate")}
            </strong>
            <span className="urgent-sub">
              {t("encours.urgentSub")}
            </span>
          </div>
          <div className="urgent-action">→</div>
        </div>
      )}

      <div className="actions-bar">
        <input
          className="search-input"
          type="text"
          placeholder={t("encours.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-secondary" onClick={() => exportEnPreparationExcel(filtered)}
          title="Télécharger la liste affichée (filtres et recherche appliqués) en Excel" style={{ whiteSpace: "nowrap" }}>
          ⬇ Export Excel ({filtered.length})
        </button>
        {estSuperAdmin && (
          <button className="btn-secondary" onClick={() => { setNettoyage(!nettoyage); setSelection(new Set()); }}
            title="Super admin : sélectionner plusieurs nacelles pour les remettre en dispo ou forcer la fin de leur préparation"
            style={{ whiteSpace: "nowrap", ...(nettoyage ? { background: "#fff6e5", borderColor: "#d9a441", color: "#8a5a00" } : {}) }}>
            🧹 {nettoyage ? "Quitter le nettoyage" : "Nettoyage"}
          </button>
        )}
      </div>

      <EnCoursFilters
        filters={filters}
        onChange={setFilters}
        machines={baseEnCours}
        isOpen={filtersOpen}
        onToggle={() => setFiltersOpen(!filtersOpen)}
      />

      {nonConfigureesSorted.length > 0 && (
        <section className="encours-section section-unconfigured">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-pending"></span>
              {t("encours.sectionToConfigure")}
              <span className="section-count">{nonConfigureesSorted.length}</span>
            </h2>
            <p className="section-desc">{t("encours.sectionToConfigureDesc")}</p>
          </div>
          <div className="encours-list">
            {nonConfigureesSorted.map((m) => (
              <EnCoursCard
                key={m.id}
                machine={m}
                canEditPrepa={canEditPrepa}
                canConfigure={canConfigure}
                canFacturer={false}
                onToggleEtape={handleToggleEtape}
                onSetNonNecessaire={setEtapeNonNecessaire}
                onAddEtape={addEtapePrepa}
                onRemoveEtape={removeEtapePrepa}
                onConfigure={setConfigMachine}
                canManageDocuments={canManageDocuments}
                onOpenDocuments={setDocsMachine}
                canCancel={canCancel}
                onCancel={handleCancel}
                onChangerNacelle={canCancel ? setChangerMachine : undefined}
                selection={estSuperAdmin && nettoyage ? { checked: selection.has(m.id), onToggle: () => basculer(m.id) } : undefined}
                onRetourDispo={estSuperAdmin ? (x: Machine) => retourDispo([x]) : undefined}
                onForcerFin={estSuperAdmin ? (x: Machine) => forcerFin([x]) : undefined}
                onResigner={canCancel ? handleResigner : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {enPrepaSorted.length > 0 && (
        <section className="encours-section section-prepa">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-prepa"></span>
              {t("encours.sectionInPrep")}
              <span className="section-count">{enPrepaSorted.length}</span>
            </h2>
            <p className="section-desc">{t("encours.sectionInPrepDesc")}</p>
          </div>
          <div className="encours-list">
            {enPrepaSorted.map((m) => (
              <EnCoursCard
                key={m.id}
                machine={m}
                canEditPrepa={canEditPrepa}
                canConfigure={canConfigure}
                canFacturer={canFacturer}
                onToggleEtape={handleToggleEtape}
                onSetNonNecessaire={setEtapeNonNecessaire}
                onAddEtape={addEtapePrepa}
                onRemoveEtape={removeEtapePrepa}
                onConfigure={setConfigMachine}
                canManageDocuments={canManageDocuments}
                onOpenDocuments={setDocsMachine}
                onFacturer={setFactureMachine}
                onLivree={handleLivree}
                canCancel={canCancel}
                onCancel={handleCancel}
                onChangerNacelle={canCancel ? setChangerMachine : undefined}
                selection={estSuperAdmin && nettoyage ? { checked: selection.has(m.id), onToggle: () => basculer(m.id) } : undefined}
                onRetourDispo={estSuperAdmin ? (x: Machine) => retourDispo([x]) : undefined}
                onForcerFin={estSuperAdmin ? (x: Machine) => forcerFin([x]) : undefined}
                onResigner={canCancel ? handleResigner : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {pretesSorted.length > 0 && (
        <section className="encours-section section-pretes">
          <div className="section-header">
            <h2>
              <span className="section-dot section-dot-ok"></span>
              {t("encours.sectionReady")}
              <span className="section-count">{pretesSorted.length}</span>
            </h2>
            <p className="section-desc">{t("encours.sectionReadyDesc")}</p>
          </div>
          <div className="encours-list">
            {pretesSorted.map((m) => (
              <EnCoursCard
                key={m.id}
                machine={m}
                canEditPrepa={canEditPrepa}
                canConfigure={canConfigure}
                canFacturer={canFacturer}
                onToggleEtape={handleToggleEtape}
                onSetNonNecessaire={setEtapeNonNecessaire}
                onAddEtape={addEtapePrepa}
                onRemoveEtape={removeEtapePrepa}
                onConfigure={setConfigMachine}
                canManageDocuments={canManageDocuments}
                onOpenDocuments={setDocsMachine}
                onFacturer={setFactureMachine}
                onLivree={handleLivree}
                canCancel={canCancel}
                onCancel={handleCancel}
                onChangerNacelle={canCancel ? setChangerMachine : undefined}
                selection={estSuperAdmin && nettoyage ? { checked: selection.has(m.id), onToggle: () => basculer(m.id) } : undefined}
                onRetourDispo={estSuperAdmin ? (x: Machine) => retourDispo([x]) : undefined}
                onForcerFin={estSuperAdmin ? (x: Machine) => forcerFin([x]) : undefined}
                onResigner={canCancel ? handleResigner : undefined}
              />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          {search
            ? t("encours.emptyNoMatch")
            : t("encours.emptyNone")}
        </div>
      )}

      {configMachine && (
        <ConfigEnCoursModal
          machine={configMachine}
          onClose={() => setConfigMachine(null)}
          onSave={handleConfigure}
        />
      )}

      {factureMachine && (
        <ConfirmFactureModal
          machine={factureMachine}
          onClose={() => setFactureMachine(null)}
          onConfirm={handleFacturer}
        />
      )}

      {estSuperAdmin && nettoyage && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#3d2c00", color: "white", padding: "10px 16px", borderRadius: 40, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", display: "flex", gap: 10, alignItems: "center", zIndex: 1000, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700 }}>🧹 {selection.size} sélectionnée(s)</span>
          <button onClick={() => setSelection(new Set(filtered.map((m) => m.id)))} disabled={nettoyageEnCours}
            style={{ background: "transparent", color: "white", border: "1px solid white", borderRadius: 20, padding: "6px 12px", cursor: "pointer" }}>Tout sélectionner ({filtered.length})</button>
          <button onClick={() => retourDispo(filtered.filter((m) => selection.has(m.id)))} disabled={!selection.size || nettoyageEnCours}
            style={{ background: "white", color: "#8a5a00", border: "none", borderRadius: 20, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>↩ Retour en dispo</button>
          <button onClick={() => forcerFin(filtered.filter((m) => selection.has(m.id)))} disabled={!selection.size || nettoyageEnCours}
            style={{ background: "white", color: "#1e8e3e", border: "none", borderRadius: 20, padding: "6px 14px", fontWeight: 700, cursor: "pointer" }}>✅ Forcer fin de prépa</button>
          {nettoyageEnCours && <span>⏳ …</span>}
          <button onClick={() => setSelection(new Set())} disabled={nettoyageEnCours} title="Vider la sélection"
            style={{ background: "transparent", color: "white", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}
      {changerMachine && (
        <ChangerNacelleModal
          machine={changerMachine}
          disponibles={machines.filter((x) => x.statut === "disponible" && !x.archived && !x.devis_vente_signe_le)}
          onClose={() => setChangerMachine(null)}
        />
      )}
      {docsMachine && (
        <DocumentsModal
          machine={docsMachine}
          canManage={canManageDocuments}
          userName={userName}
          onClose={() => setDocsMachine(null)}
          onSave={updateDocumentsVO}
        />
      )}
    </div>
  );
}
