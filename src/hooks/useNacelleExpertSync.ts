import { useEffect } from 'react';
import { useMachines } from '../contexts/MachinesContext';

export function useNacelleExpertSync() {
  const { syncExpertiseFromNacelleExpert } = useMachines();

  useEffect(() => {
    console.log('⚠️ Synchronisation DÉSACTIVÉE temporairement');
    
    // HOOK DÉSACTIVÉ pour éviter la création de milliers de restitutions
    // À réactiver après nettoyage + mise en place d'un filtre fonctionnel
    
    return () => {};
  }, [syncExpertiseFromNacelleExpert]);
}
