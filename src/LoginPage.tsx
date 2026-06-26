import { useAuth } from "./AuthContext";
import { useTranslation } from "react-i18next";
import Logo from "./components/Logo";

export default function LoginPage() {
  const { user, login, logout } = useAuth();
  const { t } = useTranslation();

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
              🔐 {t("login.google")}
            </button>
            <p className="hint">{t("login.hint")}</p>
          </>
        ) : (
          <div className="not-authorized">
            <p>✉️ {user.email}</p>
            <p className="warning">
              ⚠️ {t("login.notAuthorized")}<br />
              {t("login.contactAdmin")}
            </p>
            <button className="btn-secondary" onClick={logout}>
              {t("login.signOut")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
