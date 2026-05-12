import { useState } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { MachinesProvider } from "./contexts/MachinesContext";
import LoginPage from "./LoginPage";
import RestitutionsPage from "./pages/RestitutionsPage";
import DisponiblesPage from "./pages/DisponiblesPage";
import EnCoursPage from "./pages/EnCoursPage";
import ClotureesPage from "./pages/ClotureesPage";
import StatsPage from "./pages/StatsPage";
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

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <strong>DELTA VO</strong>
          <span> · Nacelles d'occasion</span>
          {DEV_MODE && <span className="dev-badge">DEV MODE</span>}
        </div>
        <nav className="app-nav">
          <button
            className={`nav-link ${page === "restitutions" ? "active" : ""}`}
            onClick={() => setPage("restitutions")}
          >
            Restitutions
          </button>
          <button
            className={`nav-link ${page === "disponibles" ? "active" : ""}`}
            onClick={() => setPage("disponibles")}
          >
            Disponibles
          </button>
          <button
            className={`nav-link ${page === "encours" ? "active" : ""}`}
            onClick={() => setPage("encours")}
          >
            En cours
          </button>
          <button
            className={`nav-link ${page === "cloturees" ? "active" : ""}`}
            onClick={() => setPage("cloturees")}
          >
            Clôturées
          </button>
          {isAdmin && (
            <button
              className={`nav-link nav-link-admin ${page === "stats" ? "active" : ""}`}
              onClick={() => setPage("stats")}
            >
              📊 Stats
            </button>
          )}
        </nav>
        <div className="user-info">
          <span>👤 {userName}</span>
          <span className="role-badge">{userRole}</span>
          {!DEV_MODE && (
            <button className="btn-logout" onClick={logout}>Déconnexion</button>
          )}
        </div>
      </header>

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