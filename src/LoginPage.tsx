import { useAuth } from "./AuthContext";
import Logo from "./components/Logo";

export default function LoginPage() {
  const { user, login, logout } = useAuth();

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="brand-bar"></div>
        
        <div className="login-logo-wrapper">
          <Logo theme="light" showSubtitle={true} />
        </div>

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
