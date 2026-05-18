import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { MachinesProvider } from "./contexts/MachinesContext";
import LoginPage from "./LoginPage";
import RestitutionsPage from "./pages/RestitutionsPage";
import DisponiblesPage from "./pages/DisponiblesPage";
import EnCoursPage from "./pages/EnCoursPage";
import ClotureesPage from "./pages/ClotureesPage";
import StatsPage from "./pages/StatsPage";
import Logo from "./components/Logo";
import "./App.css";

const DEV_MODE = true;
const FAKE_PROFILE = {
  email: "jlaroche@klubb.com",
  nom: "Laroche",
  prenom: "Jonathan",
  role: "admin" as const,
  createdAt: new Date().toISOString(),
};

type Page = "restitutions" | "disponibles" | "encours" | "cloturees" | "stats";

function AppContent() {
  const { user, profile, loading, logout } = useAuth();
  const [page, setPage] = useState<Page>("restitutions");
  const [menuOpen, setMenuOpen] = useState(false);

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
    return <div className="loading-screen"><p>Chargement…</p></div>;
  }

  const activeProfile = DEV_MODE ? FAKE_PROFILE : profile;

  if (!DEV_MODE && (!user || !profile)) {
    return <LoginPage />;
  }

  const userName = `${activeProfile!.prenom} ${activeProfile!.nom}`;
  const userRole = activeProfile!.role;
  const isAdmin = userRole === "admin";

  const pageLabel = (p: Page): string => {
    switch (p) {
      case "restitutions": return "Restitutions";
      case "disponibles": return "Disponibles";
      case "encours": return "Préparation";
      case "cloturees": return "Clôturées";
      case "stats": return "📊 Stats";
    }
  };

  // Liste des onglets dans l'ordre
  const tabs: Page[] = ["restitutions", "disponibles", "encours", "cloturees"];
  if (isAdmin) tabs.push("stats");

  return (
    <div className="app">
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
          <span>👤 {userName}</span>
          <span className="role-badge">{userRole}</span>
          {!DEV_MODE && (
            <button className="btn-logout" onClick={logout}>Déconnexion</button>
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
              {DEV_MODE && <span className="dev-badge" style={{ marginTop: 8 }}>DEV MODE</span>}
              {!DEV_MODE && (
                <button className="btn-logout" onClick={logout} style={{ marginTop: 12 }}>
                  Déconnexion
                </button>
              )}
            </div>
          </aside>
        </>
      )}

      <main className="app-main">
        {page === "restitutions" && <RestitutionsPage />}
        {page === "disponibles" && (
          <DisponiblesPage userRole={userRole} userName={userName} />
        )}
        {page === "encours" && (
          <EnCoursPage userRole={userRole} userName={userName} />
        )}
        {page === "cloturees" && (
          <ClotureesPage userRole={userRole} userName={userName} />
        )}
        {page === "stats" && isAdmin && <StatsPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MachinesProvider>
        <AppContent />
      </MachinesProvider>
    </AuthProvider>
  );
}
