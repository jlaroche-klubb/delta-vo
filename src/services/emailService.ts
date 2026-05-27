import emailjs from '@emailjs/browser';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

// ✅ Configuration EmailJS
const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_up4aegi',
  TEMPLATE_ID: 'template_f2sc6nn',
  PUBLIC_KEY: 'rjoizN7-HjqOIimkF',
};

console.log('📧 [emailService] Module chargé');

/**
 * Récupère tous les emails des admins depuis Firebase
 */
async function getAdminEmails(): Promise<{ email: string; prenom: string }[]> {
  try {
    console.log('📧 [emailService] Recherche des admins dans Firebase...');
    const adminQuery = query(
      collection(db, 'users'),
      where('role', '==', 'admin')
    );
    const snapshot = await getDocs(adminQuery);
    
    const admins = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        email: data.email || '',
        prenom: data.prenom || 'Admin',
      };
    }).filter(admin => admin.email !== '');
    
    console.log(`📧 [emailService] ${admins.length} admin(s) trouvé(s):`, admins.map(a => a.email));
    return admins;
  } catch (err) {
    console.error('❌ [emailService] Erreur récupération admins:', err);
    return [];
  }
}

/**
 * Envoie un email de notification à tous les admins
 * quand un nouvel utilisateur fait sa première connexion
 */
export async function notifyAdminsNewUser(newUser: {
  email: string;
  nom: string;
  prenom: string;
}): Promise<void> {
  console.log('📧 [emailService] notifyAdminsNewUser appelée avec:', newUser);
  
  try {
    // Initialiser EmailJS au moment de l'envoi
    emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
    console.log('📧 [emailService] EmailJS initialisé');
    
    const admins = await getAdminEmails();
    
    if (admins.length === 0) {
      console.warn('⚠️ [emailService] Aucun admin trouvé pour notifier la nouvelle demande');
      return;
    }
    
    console.log(`📧 [emailService] Envoi notification à ${admins.length} admin(s)...`);
    
    const dateFormatted = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    
    // Envoyer un mail à chaque admin
    const sendPromises = admins.map(admin => {
      const templateParams = {
        to_email: admin.email,
        to_name: admin.prenom,
        user_nom: newUser.nom,
        user_prenom: newUser.prenom,
        user_email: newUser.email,
        date_demande: dateFormatted,
      };
      
      console.log(`📧 [emailService] Envoi à ${admin.email}...`, templateParams);
      
      return emailjs.send(
        EMAILJS_CONFIG.SERVICE_ID,
        EMAILJS_CONFIG.TEMPLATE_ID,
        templateParams
      ).then(response => {
        console.log(`✅ [emailService] Mail envoyé à ${admin.email}:`, response.status, response.text);
        return response;
      }).catch(err => {
        console.error(`❌ [emailService] Erreur envoi mail à ${admin.email}:`, err);
        return null;
      });
    });
    
    await Promise.all(sendPromises);
    console.log('✅ [emailService] Toutes les notifications traitées');
  } catch (err) {
    console.error('❌ [emailService] Erreur générale notifyAdminsNewUser:', err);
  }
}
