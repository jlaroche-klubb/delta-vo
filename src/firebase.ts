import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// ========================================
// CONFIGURATION DELTA VO (projet principal)
// ========================================
const firebaseConfig = {
  apiKey: "AIzaSyD9BhTym5Rjm-UK2-F2ES4PV5NUjxJR8HY",
  authDomain: "delta-vo.firebaseapp.com",
  projectId: "delta-vo",
  storageBucket: "delta-vo.firebasestorage.app",
  messagingSenderId: "44936008146",
  appId: "1:44936008146:web:420cef581cae468764380b"
};

// ========================================
// CONFIGURATION NACELLE EXPERT (projet sync)
// ========================================
const firebaseConfigNacelleExpert = {
  apiKey: "AIzaSyCmo1rTFoy1KnUc1rh_QVMtutwLguKnGb8",
  authDomain: "nacelle-expert.firebaseapp.com",
  projectId: "nacelle-expert",
  storageBucket: "nacelle-expert.firebasestorage.app",
  messagingSenderId: "839235044652",
  appId: "1:839235044652:web:ad99f43eae0527239b1889"
};

// ========================================
// INITIALISATION DELTA VO (app par défaut)
// ========================================
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// ========================================
// INITIALISATION NACELLE EXPERT (app nommée)
// ========================================
const appNacelleExpert = getApps().find(app => app.name === 'nacelle-expert')
  || initializeApp(firebaseConfigNacelleExpert, 'nacelle-expert');

export const dbNacelleExpert = getFirestore(appNacelleExpert);
export { appNacelleExpert };
