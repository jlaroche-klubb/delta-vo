import React from 'react';
import { useNacelleExpertSync } from '../hooks/useNacelleExpertSync';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, dbNacelleExpert } from '../firebase'; // ← Importer les 2 bases

export function SyncTestPage() {
  const { syncDossiers, isLoading, error, syncedCount } = useNacelleExpertSync();
  const [testResults, setTestResults] = React.useState<string[]>([]);
  const [isTesting, setIsTesting] = React.useState(false);

  const addLog = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()} - ${message}`]);
  };

  const runTests = async () => {
    setIsTesting(true);
    setTestResults([]);
    
    try {
      addLog('🔍 ÉTAPE 1: Vérification des dossiers non synchronisés dans NACELLE-EXPERT');
      
      // ✅ CORRECTION CRITIQUE: Chercher dans dbNacelleExpert au lieu de db
      const dossiersQuery = query(
        collection(dbNacelleExpert, 'dossiers'),  // ← CORRIGÉ ICI
        where('synced_to_delta_vo', '==', false)
      );
      
      const dossiersSnapshot = await getDocs(dossiersQuery);
      addLog(`   ✅ ${dossiersSnapshot.size} dossier(s) trouvé(s) à synchroniser`);
      
      if (dossiersSnapshot.empty) {
        addLog('   ⚠️ Aucun dossier à tester. Créez un dossier test dans nacelle-expert');
        setIsTesting(false);
        return;
      }

      // Afficher les détails du premier dossier
      const firstDossier = dossiersSnapshot.docs[0].data();
      addLog(`\n📋 Premier dossier à synchroniser:`);
      addLog(`   Immat: ${firstDossier.immat}`);
      addLog(`   Modèle: ${firstDossier.info?.modele || 'NON DÉFINI ⚠️'}`);
      addLog(`   Type: ${firstDossier.info?.type_nacelle || 'NON DÉFINI'}`);
      addLog(`   Année: ${firstDossier.info?.annee_fab || 'NON DÉFINI'}`);
      
      addLog('\n🚀 ÉTAPE 2: Lancement de la synchronisation...');
      await syncDossiers();
      
      addLog('\n🔍 ÉTAPE 3: Vérification de la création dans machines_vo (Delta VO)');
      const machineVORef = doc(db, 'machines_vo', firstDossier.immat);  // ← db = Delta VO
      const machineVODoc = await getDoc(machineVORef);
      
      if (machineVODoc.exists()) {
        const machineData = machineVODoc.data();
        addLog(`   ✅ Fiche VO créée avec succès dans Delta VO!`);
        addLog(`   Modèle: ${machineData.modele}`);
        addLog(`   Type: ${machineData.type_nacelle}`);
        addLog(`   Statut: ${machineData.statut}`);
        addLog(`   Photos départ: ${machineData.dossier_nacelle_expert?.photos_depart?.length || 0}`);
        addLog(`   Photos retour: ${machineData.dossier_nacelle_expert?.photos_retour?.length || 0}`);
        addLog(`   Photos commerciales: ${machineData.dossier_nacelle_expert?.photos_commerciales?.length || 0}`);
      } else {
        addLog(`   ❌ Fiche VO NON créée dans Delta VO!`);
      }
      
      addLog('\n🔍 ÉTAPE 4: Vérification du marqueur synced_to_delta_vo dans Nacelle-Expert');
      const updatedDossierDoc = await getDoc(dossiersSnapshot.docs[0].ref);
      const updatedDossier = updatedDossierDoc.data();
      
      if (updatedDossier?.synced_to_delta_vo === true) {
        addLog(`   ✅ Dossier marqué comme synchronisé dans Nacelle-Expert`);
      } else {
        addLog(`   ❌ Dossier NON marqué comme synchronisé!`);
      }
      
      addLog('\n✨ TESTS TERMINÉS!');
      
    } catch (err) {
      addLog(`❌ ERREUR: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
      console.error(err);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-[#1A2A6E] mb-6">
            🧪 Test de Synchronisation Nacelle-Expert → Delta VO
          </h1>
          
          <div className="space-y-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h2 className="font-semibold text-green-900 mb-2">✅ Corrections appliquées:</h2>
              <ul className="list-disc list-inside text-green-800 space-y-1 text-sm">
                <li>✅ Recherche dans <code className="bg-green-100 px-1 rounded">dbNacelleExpert</code> au lieu de <code className="bg-green-100 px-1 rounded">db</code></li>
                <li>✅ Utilisation de <code className="bg-green-100 px-1 rounded">dossier.info?.modele</code></li>
                <li>✅ Création dans Delta VO avec <code className="bg-green-100 px-1 rounded">db</code></li>
                <li>✅ Marquage dans Nacelle-Expert avec <code className="bg-green-100 px-1 rounded">dbNacelleExpert</code></li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h2 className="font-semibold text-yellow-900 mb-2">⚙️ Ce que le test vérifie:</h2>
              <ol className="list-decimal list-inside text-yellow-800 space-y-1 text-sm">
                <li>Présence de dossiers non synchronisés dans <strong>Nacelle-Expert</strong></li>
                <li>Exécution de la synchronisation</li>
                <li>Création de la fiche VO dans <code className="bg-yellow-100 px-1 rounded">machines_vo</code> de <strong>Delta VO</strong></li>
                <li>Marquage <code className="bg-yellow-100 px-1 rounded">synced_to_delta_vo: true</code> dans <strong>Nacelle-Expert</strong></li>
              </ol>
            </div>
          </div>

          <div className="flex gap-4 mb-6">
            <button
              onClick={runTests}
              disabled={isTesting || isLoading}
              className="flex-1 bg-[#1A2A6E] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#152252] disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isTesting || isLoading ? '⏳ Test en cours...' : '🧪 Lancer les tests'}
            </button>
            
            <button
              onClick={() => setTestResults([])}
              className="px-6 py-3 bg-gray-200 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              🗑️ Effacer les logs
            </button>
          </div>

          {syncedCount > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-green-800 font-semibold">
                ✅ {syncedCount} dossier(s) synchronisé(s) avec succès!
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-800 font-semibold">❌ Erreur: {error}</p>
            </div>
          )}

          {testResults.length > 0 && (
            <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm overflow-auto max-h-96">
              {testResults.map((log, index) => (
                <div key={index} className="mb-1">
                  {log}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
