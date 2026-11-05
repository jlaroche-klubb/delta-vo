/**
 * 🇫🇷 Recherche d'entreprises et d'adresses françaises — API publiques de
 * l'État, gratuites et sans clé (appelées directement depuis le navigateur) :
 *   - Recherche d'entreprises (annuaire-entreprises.data.gouv.fr) : nom ou SIREN
 *     → raison sociale, SIREN, adresse du siège
 *   - Géoplateforme IGN (ex-API Adresse / BAN) : saisie semi-automatique d'adresse
 * Pas de Google : Google Places demande une clé API payante.
 */

export interface EntrepriseFR {
  siren: string;
  raison_sociale: string;
  adresse: string;
  cp: string;
  ville: string;
  tva_intra?: string;
  activite?: string;
  fermee?: boolean;
  // 📄 Mémoire client LLD (fiche locataire) : siège, forme juridique, NAF
  siret_siege?: string;
  forme_juridique?: string;
  naf?: string;
  rcs?: string;
}

export interface AdresseFR {
  label: string;
  adresse: string; // n° + voie
  cp: string;
  ville: string;
}

const enCours = new Map<string, AbortController>();

async function getJson(cle: string, url: string): Promise<any | null> {
  enCours.get(cle)?.abort(); // on annule la requête précédente (frappe rapide)
  const ctrl = new AbortController();
  enCours.set(cle, ctrl);
  const minuterie = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(minuterie);
  }
}

const propre = (s: any) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Codes INSEE de nature juridique les plus courants (l'annuaire ne renvoie que le code) */
const NATURES_JURIDIQUES: Record<string, string> = {
  "1000": "Entrepreneur individuel", "5202": "Société en nom collectif", "5306": "Société en commandite simple", "5308": "Société en commandite par actions",
  "5410": "SARL nationale", "5415": "SARL d'économie mixte", "5422": "SARL immobilière de gestion", "5426": "SARL (ordre des avocats)", "5431": "SARL (sport)", "5432": "SARL d'intérêt collectif agricole",
  "5442": "SARL d'attribution", "5443": "SARL coopérative de construction", "5451": "SARL coopérative de consommation", "5453": "SARL coopérative artisanale", "5454": "SARL coopérative d'intérêt maritime",
  "5455": "SARL coopérative de transport", "5458": "SARL coopérative ouvrière de production (SCOP)", "5459": "SARL union de sociétés coopératives", "5460": "Autre SARL coopérative", "5485": "Société d'exercice libéral à responsabilité limitée",
  "5498": "EURL", "5499": "SARL", "5505": "SA à participation ouvrière (conseil d'administration)", "5510": "SA à conseil d'administration", "5515": "SA d'économie mixte (conseil d'administration)",
  "5520": "SA d'intérêt collectif agricole", "5522": "SA immobilière d'investissement", "5525": "SA immobilière de gestion", "5530": "SA d'aménagement foncier", "5531": "SA mixte d'intérêt agricole",
  "5532": "SA d'intérêt collectif agricole", "5542": "SA d'attribution", "5543": "SA coopérative de construction", "5546": "SA de HLM", "5547": "SA coopérative de production HLM", "5548": "SA de crédit immobilier",
  "5551": "SA coopérative de consommation", "5552": "SA coopérative de commerçants", "5553": "SA coopérative artisanale", "5554": "SA coopérative maritime", "5555": "SA coopérative de transport",
  "5558": "SA coopérative ouvrière de production (SCOP)", "5559": "SA union de sociétés coopératives", "5560": "Autre SA coopérative (conseil d'administration)", "5585": "Société d'exercice libéral à forme anonyme",
  "5599": "SA à directoire", "5605": "SA à participation ouvrière (directoire)", "5610": "SA à directoire", "5699": "SA à directoire", "5710": "SAS", "5720": "SASU", "5785": "Société d'exercice libéral par actions simplifiée",
  "5800": "Société européenne", "6100": "Caisse d'épargne et de prévoyance", "6210": "Groupement européen d'intérêt économique", "6220": "GIE", "6316": "Coopérative d'utilisation de matériel agricole (CUMA)",
  "6317": "Société coopérative agricole", "6318": "Union de sociétés coopératives agricoles", "6411": "Société d'assurance à forme mutuelle", "6511": "Société civile coopérative de consommation", "6521": "Société civile de placement collectif immobilier",
  "6532": "Société civile d'intérêt collectif agricole", "6533": "Groupement agricole d'exploitation en commun (GAEC)", "6534": "Groupement foncier agricole", "6535": "Groupement agricole foncier", "6536": "Groupement forestier",
  "6537": "Groupement pastoral", "6538": "Groupement foncier et rural", "6539": "Société civile foncière", "6540": "SCI", "6541": "SCI de construction-vente", "6542": "Société civile d'attribution", "6543": "Société civile coopérative de construction",
  "6544": "Société civile immobilière d'accession progressive à la propriété", "6551": "Société civile coopérative de consommation", "6554": "Société civile coopérative d'intérêt maritime", "6558": "Société civile coopérative entre médecins",
  "6560": "Autre société civile coopérative", "6561": "SCP d'avocats", "6562": "SCP d'avocats aux conseils", "6563": "SCP d'avoués d'appel", "6564": "SCP d'huissiers", "6565": "SCP de notaires", "6566": "SCP de commissaires-priseurs",
  "6567": "SCP de greffiers de tribunal de commerce", "6568": "SCP de conseils juridiques", "6569": "SCP de commissaires aux comptes", "6571": "SCP de médecins", "6572": "SCP de dentistes", "6573": "SCP d'infirmiers", "6574": "SCP de masseurs-kinésithérapeutes",
  "6575": "SCP de directeurs de laboratoires d'analyse médicale", "6576": "SCP de vétérinaires", "6577": "SCP de géomètres experts", "6578": "SCP d'architectes", "6585": "Autre société civile professionnelle", "6588": "Société civile laitière",
  "6589": "Société civile de moyens", "6595": "Caisse locale de crédit mutuel", "6596": "Caisse de crédit agricole mutuel", "6597": "Société civile d'exploitation agricole", "6598": "Exploitation agricole à responsabilité limitée (EARL)", "6599": "Autre société civile",
  "6901": "Autre personne de droit privé inscrite au registre du commerce et des sociétés", "7111": "Autorité constitutionnelle", "7112": "Autorité administrative ou publique indépendante", "7113": "Ministère", "7120": "Service central d'un ministère",
  "7150": "Service du ministère de la Défense", "7160": "Service déconcentré à compétence nationale d'un ministère", "7171": "Service déconcentré de l'État à compétence (inter)régionale", "7172": "Service déconcentré de l'État à compétence (inter)départementale",
  "7179": "Autre service déconcentré de l'État", "7190": "Écoles nationales non dotées de la personnalité morale", "7210": "Commune et commune nouvelle", "7220": "Département", "7225": "Collectivité et territoire d'outre-mer", "7229": "Autre collectivité territoriale",
  "7230": "Région", "7312": "Commune associée et commune déléguée", "7313": "Section de commune", "7314": "Ensemble urbain", "7321": "Association syndicale autorisée", "7322": "Association foncière urbaine", "7323": "Association foncière de remembrement",
  "7331": "Établissement public local d'enseignement", "7340": "Pôle métropolitain", "7341": "Secteur de commune", "7342": "District urbain", "7343": "Communauté urbaine", "7344": "Métropole", "7345": "Syndicat intercommunal à vocation multiple (SIVOM)",
  "7346": "Communauté de communes", "7347": "Communauté de villes", "7348": "Communauté d'agglomération", "7349": "Autre établissement public local de coopération non spécialisé ou entente", "7351": "Institution interdépartementale ou entente",
  "7352": "Institution interrégionale ou entente", "7353": "Syndicat intercommunal à vocation unique (SIVU)", "7354": "Syndicat mixte fermé", "7355": "Syndicat mixte ouvert", "7356": "Commission syndicale pour la gestion des biens indivis des communes",
  "7357": "Pôle d'équilibre territorial et rural (PETR)", "7361": "Centre communal d'action sociale", "7362": "Caisse des écoles", "7363": "Caisse de crédit municipal", "7364": "Établissement d'hospitalisation", "7365": "Syndicat inter hospitalier",
  "7366": "Établissement public local social et médico-social", "7367": "Centre intercommunal d'action sociale (CIAS)", "7371": "Office public d'habitation à loyer modéré (OPHLM)", "7372": "Service départemental d'incendie et de secours (SDIS)",
  "7373": "Établissement public local culturel", "7378": "Régie d'une collectivité locale à caractère administratif", "7379": "Autre établissement public administratif local", "7381": "Organisme consulaire", "7382": "Établissement public national ayant fonction d'administration centrale",
  "7383": "Établissement public national à caractère scientifique culturel et professionnel", "7384": "Autre établissement public national d'enseignement", "7385": "Autre établissement public national administratif à compétence territoriale limitée",
  "7389": "Établissement public national à caractère administratif", "7410": "Groupement d'intérêt public (GIP)", "7430": "Établissement public des cultes d'Alsace-Lorraine", "7450": "Étab. public, cercle et fondation des armées", "7470": "Groupement de coopération sanitaire à gestion publique",
  "7490": "Autre personne morale de droit administratif", "8110": "Régime général de la Sécurité sociale", "8120": "Régime spécial de Sécurité sociale", "8130": "Institution de retraite complémentaire", "8140": "Mutualité sociale agricole",
  "8150": "Régime maladie des non-salariés non agricoles", "8160": "Régime vieillesse ne dépendant pas du régime général de la Sécurité sociale", "8170": "Régime d'assurance chômage", "8190": "Autre régime de prévoyance sociale",
  "8210": "Mutuelle", "8250": "Assurance mutuelle agricole", "8290": "Autre organisme mutualiste", "8310": "Comité social économique d'entreprise", "8311": "Comité social économique d'établissement", "8410": "Syndicat de salariés", "8420": "Syndicat patronal",
  "8450": "Ordre professionnel ou assimilé", "8470": "Centre technique industriel ou comité professionnel du développement économique", "8490": "Autre organisme professionnel", "8510": "Institution de prévoyance", "8520": "Institution de retraite supplémentaire",
  "9110": "Syndicat de copropriété", "9150": "Association syndicale libre", "9210": "Association non déclarée", "9220": "Association déclarée", "9221": "Association déclarée d'insertion par l'économique", "9222": "Association intermédiaire", "9223": "Groupement d'employeurs",
  "9224": "Association d'avocats à responsabilité professionnelle individuelle", "9230": "Association déclarée, reconnue d'utilité publique", "9240": "Congrégation", "9260": "Association de droit local (Alsace-Moselle)", "9300": "Fondation",
  "9900": "Autre personne morale de droit privé", "9970": "Groupement de coopération sanitaire à gestion privée",
};

export async function rechercherEntreprises(q: string): Promise<EntrepriseFR[]> {
  const t = q.replace(/\s/g, "").match(/^\d{9}$/) ? q.replace(/\s/g, "") : q.trim();
  if (t.length < 3) return [];
  const j = await getJson("entreprise", `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(t)}&per_page=6&page=1`);
  return (j?.results || []).map((e: any) => {
    const s = e.siege || {};
    const voie = propre([s.numero_voie, s.indice_repetition, s.type_voie, s.libelle_voie].filter(Boolean).join(" "));
    return {
      siren: String(e.siren || ""),
      raison_sociale: propre(e.nom_raison_sociale || e.nom_complet || ""),
      adresse: voie || propre(String(s.adresse || "").replace(new RegExp(`\\s*${s.code_postal || "#"}.*$`), "")),
      cp: String(s.code_postal || ""),
      ville: propre(s.libelle_commune || ""),
      tva_intra: Array.isArray(e.tva) ? String(e.tva[0] || "") : "",
      activite: propre(e.libelle_activite_principale || e.activite_principale || ""),
      fermee: e.etat_administratif === "C",
      siret_siege: String(s.siret || ""),
      forme_juridique: NATURES_JURIDIQUES[String(e.nature_juridique || "")] || propre(e.libelle_nature_juridique || e.nature_juridique || ""),
      naf: String(e.activite_principale || ""),
      rcs: e.siren && s.libelle_commune ? `${propre(s.libelle_commune)} ${String(e.siren)}` : "",
    } as EntrepriseFR;
  });
}

export async function rechercherAdresses(q: string): Promise<AdresseFR[]> {
  if (q.trim().length < 4) return [];
  const j = await getJson("adresse", `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q.trim())}&autocomplete=1&limit=6&index=address`);
  return (j?.features || []).map((f: any) => {
    const p = f.properties || {};
    return { label: String(p.label || ""), adresse: String(p.name || ""), cp: String(p.postcode || ""), ville: String(p.city || "") };
  });
}

export const sirenValide = (s?: string) => /^\d{9}$/.test(String(s || "").replace(/\s/g, ""));
export const cpValide = (s?: string) => /^\d{5}$/.test(String(s || "").trim());
export const emailValide = (s?: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
export const telValide = (s?: string) => String(s || "").replace(/\D/g, "").length >= 9;
