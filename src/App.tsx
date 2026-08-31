import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { MachinesProvider } from "./contexts/MachinesContext";
import LoginPage from "./LoginPage";
import GaleriePage from "./pages/GaleriePage";
import RestitutionsPage from "./pages/RestitutionsPage";
import DisponiblesPage from "./pages/DisponiblesPage";
import ExportPage from "./pages/ExportPage";
import EnCoursPage from "./pages/EnCoursPage";
import ClotureesPage from "./pages/ClotureesPage";
import StatsPage from "./pages/StatsPage";
import Logo from "./components/Logo";
import UpdateBanner from "./components/UpdateBanner";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
import AdminPage from "./pages/AdminPage";
import { useNacelleExpertSync } from "./hooks/useNacelleExpertSync";
import { getAccessiblePages } from "./utils/permissions";
import "./App.css";

const DEV_MODE = false;
const FAKE_PROFILE = {
  email: "jlaroche@klubb.com",
  nom: "Laroche",
  prenom: "Jonathan",
  role: "superadmin" as const,
  createdAt: new Date().toISOString(),
};

type Page = "restitutions" | "disponibles" | "export" | "encours" | "cloturees" | "stats" | "admin";

function AppContent() {
  const { user, profile, loading, logout, demoVendeur, setDemoVendeur, realProfile } = useAuth();
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("restitutions");
  const [menuOpen, setMenuOpen] = useState(false);

  // ✅ SYNCHRONISATION AUTOMATIQUE NACELLE-EXPERT → DELTA VO
  useNacelleExpertSync();

  // Fermer le menu mobile quand on change de page
  useEffect(() => {
    setMenuOpen(false);
  }, [page]);

  // Empêcher le scroll du body quand le menu est ouvert
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  if (loading && !DEV_MODE) {
    return <div className="loading-screen"><p>{t("common.loading")}</p></div>;
  }

  const activeProfile = DEV_MODE ? FAKE_PROFILE : profile;

  if (!DEV_MODE && (!user || !profile)) {
    return <LoginPage />;
  }

  const userName = `${activeProfile!.prenom} ${activeProfile!.nom}`;
  const userEmail = activeProfile!.email;
  const userRole = activeProfile!.role;
  const isAdmin = userRole === "admin" || userRole === "superadmin";

  const pageLabel = (p: Page): string => {
    switch (p) {
      case "restitutions": return t("nav.restitutions");
      case "disponibles": return t("nav.disponibles");
      case "export": return "🌍 " + t("nav.export");
      case "encours": return t("nav.encours");
      case "cloturees": return t("nav.cloturees");
      case "stats": return "📊 " + t("nav.stats");
      case "admin": return "⚙️ " + t("nav.admin");
    }
  };

  // ✅ Liste des onglets selon les permissions du rôle
  const accessiblePages = getAccessiblePages(userRole as any);
  // Ordre d'affichage souhaité
  const pageOrder: Page[] = ["restitutions", "disponibles", "export", "encours", "cloturees", "stats", "admin"];
  const tabs: Page[] = pageOrder.filter((p) => accessiblePages.includes(p));
  
  // ✅ Si la page active n'est pas accessible pour ce rôle, basculer sur la première dispo
  const currentPageAccessible = tabs.includes(page);
  const effectivePage = currentPageAccessible ? page : (tabs[0] || "disponibles");

  return (
    <div className="app">
      {/* 🔄 Bandeau « nouvelle version » — onglets restés ouverts longtemps */}
      <UpdateBanner />
      {/* 👁 Rappel : mode vendeur (démo) actif */}
      {demoVendeur && realProfile?.role === "superadmin" && (
        <div
          style={{
            background: "#e8a13a",
            color: "#1a2a6e",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 8px",
          }}
        >
          👁 Mode vendeur (démonstration) — vous voyez le site comme un vendeur France.{" "}
          <button
            onClick={() => setDemoVendeur(false)}
            style={{ border: "none", background: "transparent", color: "#1a2a6e", textDecoration: "underline", cursor: "pointer", fontSize: 12, fontWeight: 700 }}
          >
            Revenir en super admin
          </button>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <Logo showSubtitle={true} />
          {DEV_MODE && <span className="dev-badge">DEV MODE</span>}
        </div>

        {/* NAV DESKTOP */}
        <nav className="app-nav">
          {tabs.map((t) => (
            <button
              key={t}
              className={`nav-link ${t === "stats" ? "nav-link-admin" : ""} ${page === t ? "active" : ""}`}
              onClick={() => setPage(t)}
            >
              {pageLabel(t)}
            </button>
          ))}
        </nav>

        {/* USER INFO DESKTOP */}
        <div className="user-info">
          {/* 👁 Mode vendeur (démonstrations) — réservé au super admin RÉEL */}
          {realProfile?.role === "superadmin" && (
            <button
              onClick={() => setDemoVendeur(!demoVendeur)}
              title={demoVendeur ? "Revenir en super admin" : "Voir le site comme un vendeur (démonstration)"}
              style={{
                border: "1px solid " + (demoVendeur ? "#e8a13a" : "rgba(255,255,255,.4)"),
                background: demoVendeur ? "#e8a13a" : "transparent",
                color: demoVendeur ? "#1a2a6e" : "#fff",
                padding: "4px 10px",
                borderRadius: 5,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {demoVendeur ? "👁 Quitter le mode vendeur" : "👁 Mode vendeur"}
            </button>
          )}
          <span>👤 {userName}</span>
          <span className="role-badge">{userRole}</span>
          <LanguageSwitcher />
          {!DEV_MODE && (
            <button className="btn-logout" onClick={logout}>{t("common.logout")}</button>
          )}
        </div>

        {/* BOUTON BURGER (mobile uniquement, masqué par CSS sur desktop) */}
        <button
          className="burger-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </header>

      {/* DRAWER MOBILE */}
      {menuOpen && (
        <>
          <div
            className="drawer-overlay"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="drawer">
            <div className="drawer-header">
              <Logo variant="compact" showSubtitle={false} />
              <button
                className="drawer-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Fermer le menu"
              >
                ✕
              </button>
            </div>

            <nav className="drawer-nav">
              {tabs.map((t) => (
                <button
                  key={t}
                  className={`drawer-link ${page === t ? "active" : ""}`}
                  onClick={() => setPage(t)}
                >
                  {pageLabel(t)}
                </button>
              ))}
            </nav>

            <div className="drawer-user">
              <div className="drawer-user-name">👤 {userName}</div>
              <span className="role-badge">{userRole}</span>
              {realProfile?.role === "superadmin" && (
                <button
                  onClick={() => setDemoVendeur(!demoVendeur)}
                  style={{ marginTop: 10, border: "1px solid #e8a13a", background: demoVendeur ? "#e8a13a" : "transparent", color: demoVendeur ? "#1a2a6e" : "#e8a13a", padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 700 }}
                >
                  {demoVendeur ? "👁 Quitter le mode vendeur" : "👁 Mode vendeur"}
                </button>
              )}
              <div style={{ marginTop: 12 }}><LanguageSwitcher /></div>
              {DEV_MODE && <span className="dev-badge" style={{ marginTop: 8 }}>DEV MODE</span>}
              {!DEV_MODE && (
                <button className="btn-logout" onClick={logout} style={{ marginTop: 12 }}>
                  {t("common.logout")}
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      <main className="app-main">
        {effectivePage === "restitutions" && <RestitutionsPage />}
        {effectivePage === "disponibles" && (
          <DisponiblesPage userRole={userRole} userName={userName} userEmail={userEmail} />
        )}
        {effectivePage === "export" && (
          <ExportPage userName={userName} userEmail={userEmail} />
        )}
        {effectivePage === "encours" && (
          <EnCoursPage userRole={userRole} userName={userName} />
        )}
        {effectivePage === "cloturees" && (
          <ClotureesPage userRole={userRole} userName={userName} />
        )}
        {effectivePage === "stats" && isAdmin && <StatsPage />}
        {effectivePage === "admin" && isAdmin && <AdminPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Page PUBLIQUE : galerie partagée au client. Aucune authentification,
            rendue hors AuthProvider/MachinesProvider (pas de sync, pas de login). */}
        <Route path="/galerie/:token" element={<GaleriePage />} />

        {/* Toute le reste de l'app interne, avec authentification + contextes. */}
        <Route
          path="*"
          element={
            <AuthProvider>
              <MachinesProvider>
                <AppContent />
              </MachinesProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
