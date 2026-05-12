import { useAuth } from "./AuthContext";

export default function LoginPage() {
  const { user, login, logout } = useAuth();

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="brand-bar"></div>
        <h1>DELTA VO</h1>
        <p className="subtitle">Gestion des nacelles d'occasion</p>

        {!user ? (
          <>
            <button className="btn-google" onClick={login}>
              🔐 Se connecter avec Google
            </button>
            <p className="hint">Connexion réservée aux utilisateurs autorisés</p>
          </>
        ) : (
          <div className="not-authorized">
            <p>✉️ {user.email}</p>
            <p className="warning">
              ⚠️ Votre compte n'est pas encore autorisé.<br />
              Contactez l'administrateur.
            </p>
            <button className="btn-secondary" onClick={logout}>
              Se déconnecter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}