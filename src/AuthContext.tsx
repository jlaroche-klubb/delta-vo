import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db, googleProvider } from "./firebase";
import { UserProfile } from "./types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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
            setProfile(userDoc.data() as UserProfile);
          } else {
            // Pas trouvé → cherche dans pending_users
            const pendingId = currentUser.email!.replace(/[@.]/g, "_");
            const pendingDoc = await getDoc(doc(db, "pending_users", pendingId));

            if (pendingDoc.exists()) {
              console.log("✨ Migration pending → users");
              const pending = pendingDoc.data();
              const newProfile: UserProfile = {
                email: pending.email,
                nom: pending.nom,
                prenom: pending.prenom,
                role: pending.role,
                activatedAt: new Date().toISOString(),
                createdAt: pending.createdAt,
              };
              await setDoc(doc(db, "users", currentUser.uid), newProfile);
              await deleteDoc(doc(db, "pending_users", pendingId));
              setProfile(newProfile);
          } else {
              // Nouveau utilisateur → créer dans pending_users
              console.log("🆕 Nouvel utilisateur, création pending");
              
              // Extraire nom/prénom du displayName
              const displayName = currentUser.displayName || "";
              const [prenom = "", nom = ""] = displayName.split(" ");
              
              const pendingProfile = {
                email: currentUser.email!,
                nom: nom || "Nom",
                prenom: prenom || "Prénom",
                createdAt: new Date().toISOString(),
              };
              
              // Sauvegarder dans pending_users
              const pendingId = currentUser.email!.replace(/[@.]/g, "_");
              await setDoc(doc(db, "pending_users", pendingId), pendingProfile);
              
              console.log("✅ Demande d'approbation créée");
              setProfile(null); // Pas de profil → affichera message d'attente
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
