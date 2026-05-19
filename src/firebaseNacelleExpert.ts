import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

/**
 * Configuration Firebase pour nacelle-expert2
 * 
 * ⚠️ IMPORTANT : Remplace ces valeurs par les vraies credentials
 * de ton projet Firebase nacelle-expert
 * 
 * Où trouver ces infos :
 * 1. Va sur https://console.firebase.google.com
 * 2. Ouvre le projet "nacelle-expert" ou "nacelle-expert2"
 * 3. Paramètres du projet → Applications → Configuration
 */
const firebaseConfigNacelleExpert = {
  apiKey: "AIza...", // ← Remplace par la vraie clé
  authDomain: "nacelle-expert.firebaseapp.com", // ← Vérifie le nom exact
  projectId: "nacelle-expert", // ← Vérifie le project ID exact
  storageBucket: "nacelle-expert.appspot.com",
  messagingSenderId: "123456789", // ← Remplace
  appId: "1:123456789:web:abc123" // ← Remplace
};

// Initialiser l'app Firebase pour nacelle-expert
// Le deuxième paramètre "nacelle-expert" permet d'avoir 2 apps Firebase en parallèle
const appNacelleExpert = initializeApp(firebaseConfigNacelleExpert, "nacelle-expert");

// Exporter l'instance Firestore
export const db = getFirestore(appNacelleExpert);
