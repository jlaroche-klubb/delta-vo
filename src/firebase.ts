import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ========== CONFIG DELTA VO (principal) ==========
const firebaseConfigDeltaVO = {
  apiKey: "TODO_REMPLACE_MOI_DELTA_VO",
  authDomain: "delta-vo.firebaseapp.com",
  projectId: "delta-vo",
  storageBucket: "delta-vo.appspot.com",
  messagingSenderId: "TODO_REMPLACE_MOI",
  appId: "TODO_REMPLACE_MOI"
};

// ========== CONFIG NACELLE EXPERT (sync) ==========
const firebaseConfigNacelleExpert = {
  apiKey: "TODO_REMPLACE_MOI_NACELLE_EXPERT",
  authDomain: "nacelle-expert.firebaseapp.com",
  projectId: "nacelle-expert",
  storageBucket: "nacelle-expert.appspot.com",
  messagingSenderId: "TODO_REMPLACE_MOI",
  appId: "TODO_REMPLACE_MOI"
};

// ========== INITIALISATION DELTA VO ==========
const appDeltaVO = getApps().find(app => app.name === '[DEFAULT]')
  || initializeApp(firebaseConfigDeltaVO);

export const auth = getAuth(appDeltaVO);
export const db = getFirestore(appDeltaVO);
export const googleProvider = new GoogleAuthProvider();

// ========== INITIALISATION NACELLE EXPERT ==========
const appNacelleExpert = getApps().find(app => app.name === 'nacelle-expert')
  || initializeApp(firebaseConfigNacelleExpert, 'nacelle-expert');

export const dbNacelleExpert = getFirestore(appNacelleExpert);
export { appNacelleExpert };
