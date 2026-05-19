import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuration Firebase pour nacelle-expert
const firebaseConfigNacelleExpert = {
  apiKey: "TODO_REMPLACE_MOI",
  authDomain: "nacelle-expert.firebaseapp.com",
  projectId: "nacelle-expert",
  storageBucket: "nacelle-expert.appspot.com",
  messagingSenderId: "TODO_REMPLACE_MOI",
  appId: "TODO_REMPLACE_MOI"
};

// ✅ Vérifier si l'app existe déjà avant de l'initialiser
const appNacelleExpert = getApps().find(app => app.name === 'nacelle-expert')
  || initializeApp(firebaseConfigNacelleExpert, 'nacelle-expert');

export const dbNacelleExpert = getFirestore(appNacelleExpert);
export { appNacelleExpert };
