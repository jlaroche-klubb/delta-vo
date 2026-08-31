import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import { UserProfile } from "./types";
import { notifyAdminsNewUser } from "./services/emailService";
import i18n from "./i18n";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  // 👁 MODE VENDEUR (démonstrations) : le super admin voit le site exactement
  // comme un vendeur France. Bascule locale à l'onglet, aucun impact en base.
  demoVendeur: boolean;
  setDemoVendeur: (on: boolean) => void;
  /** Profil réel, non déguisé (pour afficher le bouton de sortie du mode) */
  realProfile: UserProfile | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // 👁 Mode vendeur (démo) — mémorisé par onglet : survit au F5 pendant la
  // démonstration, disparaît à la fermeture de l'onglet.
  const [demoVendeur, setDemoVendeurState] = useState<boolean>(() => {
    try { return sessionStorage.getItem("demo_vendeur") === "1"; } catch { return false; }
  });
  function setDemoVendeur(on: boolean) {
    setDemoVendeurState(on);
    try {
      if (on) sessionStorage.setItem("demo_vendeur", "1");
      else sessionStorage.removeItem("demo_vendeur");
    } catch { /* stockage indisponible : le mode reste actif pour la session React */ }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("🔐 Auth state:", currentUser?.email);
      setUser(currentUser);

      if (currentUser) {
        try {
          // Cherche le profil dans 'users'
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));

          if (userDoc.exists()) {
            console.log("✅ Profil trouvé");
            {
              const data = userDoc.data() as UserProfile;
              // 👑 Amorçage super admin : le compte propriétaire est élevé
              // automatiquement (évite tout verrouillage au déploiement).
              if (data.role === "admin" && (data.email || currentUser.email) === "jlaroche@klubb.com") {
                data.role = "superadmin" as any;
              }
              setProfile(data);
            }
            // Nettoyage : si un ancien doc pending_users traîne encore, on le supprime
            const pendingId = currentUser.email!.replace(/[@.]/g, "_");
            deleteDoc(doc(db, "pending_users", pendingId)).catch(() => {});
          } else {
            // Pas trouvé dans users → chercher dans pending_users
            const pendingId = currentUser.email!.replace(/[@.]/g, "_");
            const pendingDoc = await getDoc(doc(db, "pending_users", pendingId));
            
            if (pendingDoc.exists()) {
              // Pending user existe déjà
              const pendingData = pendingDoc.data();
              
              if (pendingData.role) {
                // A été approuvé → migrer vers users
                console.log("✨ Migration pending → users");
                const newProfile: UserProfile = {
                  email: pendingData.email,
                  nom: pendingData.nom,
                  prenom: pendingData.prenom,
                  role: pendingData.role,
                  activatedAt: new Date().toISOString(),
                  createdAt: pendingData.createdAt,
                };
                await setDoc(doc(db, "users", currentUser.uid), newProfile);
                await deleteDoc(doc(db, "pending_users", pendingId));
                setProfile(newProfile);
              } else {
                // En attente d'approbation
                console.log("⏳ En attente d'approbation");
                setProfile(null);
              }
            } else {
              // Nouveau utilisateur → créer dans pending_users
              console.log("🆕 Nouvel utilisateur, création pending");
              
              const displayName = currentUser.displayName || "";
              const [prenom = "", nom = ""] = displayName.split(" ");
              
              const pendingProfile = {
                email: currentUser.email!,
                nom: nom || "Nom",
                prenom: prenom || "Prénom",
                createdAt: new Date().toISOString(),
              };
              
              await setDoc(doc(db, "pending_users", pendingId), pendingProfile);
              console.log("✅ Demande d'approbation créée");
              
              // ✅ Envoyer un mail de notification à tous les admins
              notifyAdminsNewUser({
                email: currentUser.email!,
                nom: nom || "Nom",
                prenom: prenom || "Prénom",
              }).catch(err => {
                console.error("⚠️ Erreur notification admins (non bloquant):", err);
              });
              
              setProfile(null);
            }
          }
        } catch (e) {
          console.error("Erreur chargement profil:", e);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Applique la langue d'interface mémorisée dans le profil (autorité cross-device).
  useEffect(() => {
    if (profile?.lang && profile.lang !== i18n.resolvedLanguage) {
      i18n.changeLanguage(profile.lang);
    }
  }, [profile]);

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login error:", e);
      alert("Erreur de connexion : " + (e as Error).message);
    }
  }

  async function logout() {
    await signOut(auth);
  }

  // 👁 Le déguisement ne s'applique QU'AU super admin : pour tout autre rôle
  // le mode est ignoré (et donc sans effet même si le flag traînait).
  const effectiveProfile =
    demoVendeur && profile?.role === "superadmin"
      ? ({ ...profile, role: "vendeur_fr" } as UserProfile)
      : profile;

  return (
    <AuthContext.Provider
      value={{ user, profile: effectiveProfile, loading, login, logout, demoVendeur, setDemoVendeur, realProfile: profile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
