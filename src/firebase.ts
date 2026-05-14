import { initializeApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// ═══════════════════════════════════════════════════
// FIREBASE 1 : DELTA VO (app principale)
// ═══════════════════════════════════════════════════
const deltaVoConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app: FirebaseApp = initializeApp(deltaVoConfig);

export const db: Firestore = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// ═══════════════════════════════════════════════════
// FIREBASE 2 : NACELLE-EXPERT (lecture seule)
// ═══════════════════════════════════════════════════
// On initialise une 2e app Firebase avec un nom unique
// pour ne pas entrer en conflit avec la 1ère.

const nacelleExpertConfig = {
  apiKey: "AIzaSyCmo1rTFoy1KnUc1rh_QVMtutwLguKnGb8",
  authDomain: "nacelle-expert.firebaseapp.com",
  projectId: "nacelle-expert",
  storageBucket: "nacelle-expert.firebasestorage.app",
  messagingSenderId: "839235044652",
  appId: "1:839235044652:web:ad99f43eae0527239b1889"
};

const nacelleExpertApp: FirebaseApp = initializeApp(
  nacelleExpertConfig,
  "nacelle-expert" // ← Nom unique pour cette 2e app
);

export const nacelleExpertDb: Firestore = getFirestore(nacelleExpertApp);