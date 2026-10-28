/**
 * 📄 Texte du CONTRAT DE LOCATION FINANCIÈRE Delta Services — repris du
 * modèle DSLOCFI2026-10-03 (RENTALOC) fourni par Jonathan le 28/10/2026.
 * Chaque bloc : un titre d'article et des paragraphes ; une ligne qui commence
 * par « - » est une puce. Modifier ici = modifier tous les futurs contrats.
 */

export interface ArticleContrat { titre: string; texte: string[] }

export const CONDITIONS_PARTICULIERES_INTRO =
  "Le locataire reconnaît que le matériel loué a bien un rapport direct avec son activité principale et que se faisant le Code de la Consommation ne trouvera pas à s'appliquer.";

export const CONDITIONS_GENERALES: ArticleContrat[] = [
  {
    titre: "Article 1 - COMMANDE - LIVRAISON - OBJET DU CONTRAT",
    texte: [
      "Le Locataire certifie l'exactitude de tous les renseignements fournis au Bailleur lors de sa demande de location. Il reconnaît avoir librement choisi le Matériel Loué, objet du présent contrat, ainsi que le Fournisseur désigné à la première page du présent contrat.",
      "Les conditions et délais de livraison du Matériel Loué sont déterminés d'un commun accord entre le Bailleur et le Locataire.",
      "La location prend effet à partir de la date de réception du Matériel Loué par le Locataire, étant précisé que le Locataire s'engage à réceptionner le Matériel Loué dans les 5 jours ouvrés à compter de la date de sortie des ateliers du Bailleur, telle que communiquée par écrit par le Bailleur au Locataire (ci-après la « Date Limite de Réception du Matériel Loué »).",
      "Le Locataire reconnaît que les loyers seront dus à compter de la réception du Matériel Loué par le Locataire ou, si la Date Limite de Réception du Matériel Loué est dépassée, à compter du lendemain de la Date Limite de Réception du Matériel Loué, que le Matériel Loué soit en possession du Locataire ou non. Tous frais ou indemnités résultant d'un retard du Locataire à prendre livraison du Matériel Loué seront également à la charge du Locataire.",
      "Le Locataire reconnaît que le fait de prendre possession du Matériel Loué implique sa reconnaissance du bon état et de la conformité du Matériel Loué.",
    ],
  },
  {
    titre: "Article 2 - GARDE DU MATÉRIEL LOUÉ",
    texte: [
      "Le Locataire prend en charge la garde du Matériel Loué et en est pleinement responsable dans les termes de l'article 1242 du Code Civil. A cet égard, le Locataire sera seul responsable de tous dommages causés par le Matériel Loué et de tous dommages causés au Matériel Loué.",
      "Le Locataire s'interdit d'exercer tout recours contre le Bailleur dans le cadre d'une action en justice qui serait dirigée contre lui.",
      "Le Locataire s'engage à veiller sur le Matériel Loué par tous moyens et à avertir dans les plus brefs délais le Bailleur de tout fait dont il aurait eu connaissance et qui pourrait porter préjudice aux droits du Bailleur. Sont interdits, la cession, à titre onéreux ou gratuit, le prêt, le gage, la sous-location, le transfert du Matériel Loué sauf autorisation préalable et écrite du Bailleur.",
      "En cas de cession ou de nantissement de son fonds de commerce, le Locataire devra veiller à ce que le Matériel Loué ne soit pas compris dans cette cession ou ce nantissement et que les droits du Bailleur sur le Matériel Loué soient portés à la connaissance des tiers, dans les plus brefs délais.",
      "En cas de tentative de saisie du Matériel Loué, le Locataire devra élever immédiatement toutes protestations contre la saisie et aviser le Bailleur. Le Locataire fera diligence à ses frais pour obtenir la mainlevée de la saisie. Toute décision émanant d'une autorité, quelle qu'elle soit, qui pourrait avoir un impact sur le Matériel Loué devra être immédiatement portée à la connaissance du Bailleur.",
    ],
  },
  {
    titre: "Article 3 - DURÉE",
    texte: [
      "Le présent contrat de location est consenti pour la durée ferme et irrévocable indiquée aux Conditions Particulières du contrat. Le présent contrat entrera en vigueur à la date de sa signature.",
      "Le premier loyer majoré prévu aux Conditions Particulières devra être réglé par le Locataire au Bailleur, en 1 (une) seule fois, concomitamment à la signature du présent contrat. A défaut, le présent contrat sera réputé nul et non avenu.",
      "Le Locataire reconnaît qu'il est engagé dès la date de signature du présent contrat. En cas d'annulation de la commande par le Locataire avant la réception du Matériel Loué, le Locataire s'engage à payer au Bailleur à titre d'indemnité la somme la plus importante entre une indemnité forfaitaire de 3000,00 (trois mille) euros et 20% du montant des frais engagés sur le Matériel Loué.",
      "La location du Matériel Loué et ainsi le paiement des loyers convenus prennent effet au plus tard à compter du lendemain de la Date Limite de Réception du Matériel ou à compter de la réception du Matériel Loué par le Locataire si cette date se situe avant la Date Limite de Réception du Matériel.",
    ],
  },
  {
    titre: "Article 4 - UTILISATION - ENTRETIEN DU MATÉRIEL LOUÉ",
    texte: [
      "Le Locataire assume l'entière responsabilité de l'usage fait du Matériel Loué. Celui-ci ne peut être mis en service que muni des documents, inscriptions et équipements requis par la réglementation en vigueur. D'une manière générale, le Locataire doit remplir toutes obligations administratives et fiscales, et se conformer en toutes circonstances aux lois et règlements afférents à la détention et à l'utilisation du Matériel Loué. Tous frais, impôts et taxes en résultant sont à la charge exclusive du Locataire, de même que les conséquences à toute infraction du Locataire en lien avec le Matériel Loué.",
      "Le Locataire s'engage à utiliser le Matériel Loué de façon paisible et à en faire usage conformément à sa destination. Il s'engage également à rendre le Matériel Loué en bon état de propreté à l'issue de la location, sous peine de l'application de frais d'entretien d'un montant de 120,00 (cent vingt) euros, exigibles sans délai.",
      "Tous les frais résultants d'une usure normale / anormale du Matériel Loué ou d'une mauvaise utilisation et/ou casse du Matériel Loué par le Locataire demeurent à la charge du Locataire qui prend l'engagement de le maintenir en parfait état de fonctionnement et d'entretien pendant toute la durée du présent contrat.",
      "Le Bailleur se réserve la possibilité d'effectuer, à tout moment, toute vérification concernant l'entretien et l'utilisation du Matériel Loué. Il pourra de ce fait, désigner un de ses agents pour procéder dans les locaux du Locataire aux vérifications qu'il jugera utiles et contrôler en particulier la bonne exécution des réparations.",
      "Le Locataire s'engage à procéder aux Visites Générales Périodiques requises par la règlementation en vigueur (en moyenne tous les 6 mois) qui sera à sa charge.",
      "Le Locataire s'engage par ailleurs à procéder à la révision périodique du porteur du Matériel Loué conformément aux instructions du Bailleur et conformément aux indications du tableau de bord du porteur, ainsi qu'au contrôle technique et au contrôle anti-pollution du porteur, dans un délai maximum d'un mois faisant suite à la demande formulée en ce sens par écrit par le Bailleur. S'agissant de ces deux contrôles, la demande sera accompagnée de la fiche d'identification du porteur.",
      "Dans un délai de 48 heures à l'issue de chaque révision ou de chaque contrôle (technique ou anti-pollution), le Locataire adressera au Bailleur le justificatif (tel que le procès-verbal de contrôle technique) permettant d'établir sa bonne réalisation.",
      "A défaut de transmission de ces justifications par le Locataire, ce dernier supportera seul l'intégralité des frais occasionnés en cas de sinistre ou de dégradation du porteur du Matériel Loué.",
      "Le Locataire s'engage à faire réaliser, tous les 20 000 (vingt mille) kilomètres, les opérations d'entretien courant sur le porteur du Matériel Loué. A charge également pour le Locataire de tenir informé régulièrement le Locataire du kilométrage du porteur du Matériel Loué. Le Locataire s'engage à communiquer au Bailleur toute informations du tableau de bord qui viendrait à s'afficher sur le porteur et à suivre les recommandations du Bailleur quant aux démarches à effectuer.",
      "En cas de pannes résultant d'un défaut d'entretien de la part du Locataire, le locataire supportera tous les frais qui seront engendrés.",
    ],
  },
  {
    titre: "Article 5 - GARANTIE DU MATÉRIEL LOUÉ - RECOURS DU LOCATAIRE",
    texte: [
      "Le Matériel Loué bénéficie de la garantie donnée par le Fournisseur. Pendant toute la durée du présent contrat, le Locataire pourra exercer tous droits et actions en garantie vis-à-vis du Fournisseur du Matériel Loué. Le Bailleur ne saurait être tenu responsable de la non-conformité et des vices cachés du Matériel Loué.",
      "Le Locataire s'engage à ne pas différer ou interrompre le paiement des loyers, résilier le contrat ou demander des dommages et intérêts au Bailleur si, sans faute du Bailleur, le Matériel Loué était défectueux ou atteint d'un vice caché.",
      "De même, le Locataire ne pourra prétendre à aucune diminution du loyer ni indemnité quelconque en cas de non-utilisation du Matériel Loué, pour quelque cause que ce soit.",
      "Le Bailleur n'étant pas le fabricant du Matériel Loué, le Locataire renonce à tout recours contre le Bailleur pour vices cachés ou défaut de conformité, que ce soit pour demander ou obtenir des dommages et intérêts, interrompre le paiement régulier des loyers prévus, demander la résiliation ou la résolution du contrat.",
      "Défaut d'assurance : pour la part non couverte ou non indemnisée des risques, ou en cas de déchéance invoquée par les sociétés d'assurances, la responsabilité du Locataire est pleine et entière. Il s'engage à indemniser sur ses fonds propres le Loueur à hauteur de l'entier préjudice subi par ce dernier, en ce compris celui visé à la section.",
    ],
  },
  {
    titre: "Article 6 - ASSURANCE DU MATÉRIEL LOUÉ – SINISTRES",
    texte: [
      "A compter de la mise à disposition du Matériel Loué et jusqu'à la fin de la location, tant que le Matériel Loué restera sous sa garde, le Locataire en sa qualité de gardien détenteur du Matériel Loué est responsable de tout dommage matériel corporel ou immatériel causé directement ou indirectement par le Matériel Loué à des personnes ou à des biens et de tout dommage subi par le Matériel Loué, même s'ils sont intervenus à la suite d'un vice de construction ou d'un défaut de montage et quelle que soit la cause du dommage, même s'il s'agit d'un cas fortuit ou de force majeure. Le Locataire s'engage à souscrire une police garantissant sa responsabilité civile pour le Matériel Loué en ce compris le porteur et la ou les nacelle(s) pour un montant allant de 75 000 à 250 000 euros HT, dont le montant précis sera arrêté conjointement avec le Bailleur en fonction du modèle du Matériel Loué.",
      "Pendant toute la durée de la location et jusqu'à restitution du Matériel Loué, le Locataire est responsable de tous risques de détérioration, de perte, vol, incendie, bris de machines, explosion, destruction partielle ou totale du Matériel Loué en ce compris le porteur et la ou les nacelle(s), quelle que soit la cause du dommage. Le Locataire s'engage à souscrire une police garantissant tous les dommages précités auprès d'une compagnie notoirement solvable.",
      "Ces polices devront obligatoirement stipuler les engagements suivants :",
      "- L'impossibilité pour le Locataire de les résilier ou les modifier à moins que ce dernier ne se soit dégagé de toutes ses obligations envers le Bailleur ;",
      "- L'abandon de recours contre le Bailleur ;",
      "- Le règlement au seul Bailleur des indemnités consécutives aux dommages subis par le Matériel Loué ;",
      "- L'inopposabilité au Bailleur des causes de déchéance ou de réduction proportionnelle d'indemnité, d'éventuelles omissions, insuffisances de déclarations ou fausses déclarations du Locataire ;",
      "- La notification au Bailleur, avec un préavis d'un mois, de toute annulation, suspension ou réduction des garanties ;",
      "- L'avis au Bailleur de tout retard dans le paiement des primes.",
      "Le Locataire s'engage à retourner au Bailleur, avant toute livraison du Matériel Loué, les attestations justificatives d'assurance du Matériel Loué en ce compris le véhicule et la ou les nacelle(s).",
      "Le Locataire déclare immédiatement à la compagnie d'assurance tout sinistre survenu au Matériel Loué ou provoqué par lui. Il s'engage à adresser au Bailleur une copie de sa déclaration.",
      "En cas de sinistre total ou de vol, le présent contrat est résilié de plein droit et le Locataire est dégagé de son obligation de restitution. Le Locataire devra verser au Bailleur une indemnité égale au montant des loyers restants dus au Bailleur au jour du sinistre, majoré d'une somme forfaitaire de 4 % que le sinistre ou le vol soit couvert par la compagnie d'assurance, déduction faite le cas échéant des sommes reçues de la compagnie d'assurance.",
      "En cas de sinistre, le Locataire se réserve le droit de poursuivre la facturation des loyers mensuels, jusqu'à ce que le rapport d'expertise après sinistre lui ait été communiqué par l'organisme d'assurance.",
      "En cas de sinistre partiel, le Locataire doit procéder à ses frais à la remise en état du Matériel Loué et doit poursuivre le règlement régulier des loyers.",
    ],
  },
  {
    titre: "Article 7 - FRAIS ET TAXES",
    texte: [
      "Toutes amendes, contraventions, impôts et taxes, frais de timbres et d'enregistrement, frais de publicité au greffe, frais de contrôle technique obligatoire, qui peuvent être dus en raison de l'utilisation et de la location du Matériel Loué et plus généralement de l'exécution du présent contrat, sont à la charge exclusive du Locataire. Si le Bailleur est amené à traiter toutes amendes, charges ou autres coûts incombant au Locataire et qui seraient réclamés au Bailleur, ce dernier facturera au Locataire des frais administratifs d'un montant raisonnable en supplément des montants payés par le Bailleur, au titre de son intervention, ce que le Locataire accepte.",
      "En cas de variation dans le régime des impôts et taxes relatifs à la location du Matériel Loué, le Bailleur pourra faire subir au montant toutes taxes comprises du loyer une variation correspondante et en informera préalablement par écrit le Locataire dans un délai raisonnable avant l'entrée en vigueur du nouveau montant du loyer.",
      "Le Locataire devra acquitter toutes sommes que le Bailleur pourrait être appelé à verser à l'administration fiscale. Le Locataire pourra, avant tout règlement, demander un justificatif de ces sommes au Bailleur.",
      "Sont également à la charge du Locataire, qui s'y oblige tous les frais visés ci-dessous, selon les tarifs suivants :",
      "- Changement de domiciliation bancaire : 15,00 (quinze) euros HT",
      "- Changement de date d'échéance : 15,00 (quinze) euros HT",
      "- Changement d'adresse du locataire : 9,00 (neuf) euros HT",
      "- Copie contrat : 15,00 (quinze) euros HT",
      "- Réémission de prélèvement impayé : 22,00 (vingt-deux) euros HT",
      "- Frais de dénonciation des amendes : 20,00 (vingt) euros HT",
      "Si le Bailleur accepte le transfert du contrat du Locataire et ne met pas en œuvre son droit de résiliation anticipée prévu par l'article 12.3 du présent contrat, des frais de 138,00 (cent trente-huit) euros HT seront facturés par le Bailleur au Locataire, qui s'y oblige.",
      "Le Bailleur se réserve la possibilité de modifier les frais susvisés, ce que le Locataire accepte expressément. Le Bailleur en informera le Locataire dans les meilleurs délais.",
      "Le Locataire autorise expressément le Bailleur à prélever les frais en vertu de l'autorisation de prélèvement souscrite lors des présentes. Tout prélèvement par le Bailleur relatif à ces frais supplémentaires fera l'objet d'une information préalable du Locataire.",
    ],
  },
  {
    titre: "Article 8 - PAIEMENT ET RETARDS DE PAIEMENT",
    texte: [
      "Le paiement des loyers débutera à compter du lendemain de la Date Limite de Réception du Matériel ou à compter de la date effective de réception du Matériel Loué par le Locataire si cette date se situe avant la Date Limite de Réception du Matériel.",
      "Le paiement sera réalisé conformément aux modalités prévues aux conditions particulières.",
      "En cas de non-paiement total ou partiel à la date limite de paiement, toutes les sommes dues par le Locataire deviendront immédiatement exigibles sans préavis.",
      "Conformément à l'article L. 441-10 du Code de commerce, des pénalités d'un montant égal à 5 (cinq) fois le taux d'intérêt légal seront appliquées en cas de retard de paiement par le Locataire d'une quelconque somme. En outre, une indemnité forfaitaire d'un montant de 40,00 (quarante) euros correspondant aux frais de recouvrement sera également due. Si cette indemnité ne couvre pas l'ensemble des frais engagés pour tout rappel d'échéance, le Locataire devra payer au Bailleur, au titre d'une indemnité complémentaire et sur justification, l'excédent desdits frais. Cette indemnité et ces pénalités pour retard de paiement sont dues de plein droit sans qu'un rappel soit nécessaire.",
    ],
  },
  {
    titre: "Article 9 - DONNÉES PERSONNELLES",
    texte: [
      "En concluant le présent contrat, le Locataire accepte que le Bailleur procède au stockage et au traitement informatique de ses données nominatives en relation avec le présent contrat, y compris aux fins d'analyses statistiques, de vérifications bancaires et de protection des biens du Bailleur. En conséquence, en cas de violation par le Locataire du présent contrat, les données nominatives du Locataire pourront être divulguées ou communiquées à des tiers, dans la mesure nécessaire à toutes procédures de recouvrement ou pour protéger le Matériel loué contre tous dommages.",
      "Les données collectées par ce dispositif seront conservées conformément aux exigences du Règlement (UE) 2016/679 du Parlement européen et du Conseil du 27 avril 2016 relatif à la protection des personnes physiques à l'égard du traitement des données à caractère personnel et à la libre circulation de ces données, de manière sécurisée, pendant la durée qui est strictement nécessaire à leur traitement par le Bailleur et ne seront accessibles que par un personnel spécialement désigné à cet effet par le Bailleur. Chaque individu concerné par ces données disposera d'un droit d'accès, de rectification et/ou de suppression. Le Locataire devra présenter cette demande au Bailleur qui se conformera aux exigences de l'individu concerné dans les meilleurs délais.",
    ],
  },
  {
    titre: "Article 10 – PERTES D'EXPLOITATION",
    texte: ["Pour quelque raison que ce soit, les pertes d'exploitation, directes et ou indirectes, ne sont jamais prises en charge par le bailleur."],
  },
  {
    titre: "Article 11 - RÉSILIATION ET CONSÉQUENCES DE LA RÉSILIATION",
    texte: [
      "11.1 Résiliation aux torts du Locataire",
      "Tout manquement du Locataire au présent contrat de location, de quelque nature qu'il soit, donnera droit au Bailleur de résilier le présent contrat de plein droit, sans aucune formalité judiciaire, 8 (huit) jours après une mise en demeure restée sans réponse ou suivie d'une exécution du Locataire que le Bailleur ne jugerait pas satisfaisante, et notamment dans les cas suivants :",
      "- Non-paiement d'un loyer ou d'une prime d'assurance à son échéancier, l'arrivée du terme constituant à elle seule la mise en demeure,",
      "- Inexactitude des déclarations du Locataire figurant sur la demande de location ou des pièces jointes,",
      "- Défaut de déclaration de sinistre survenu au Matériel Loué.",
      "Outre la restitution sans délai du Matériel Loué dans les conditions de l'article 13 ainsi que le paiement des loyers échus impayés et tous leurs accessoires et options, la résiliation aux torts du Locataire rend également exigible le montant des loyers restant à courir jusqu'à la fin du contrat et une indemnité égale à 10 % du montant des loyers restant à courir jusqu'à la fin du contrat de location, sans préjudice des dommages et intérêts que le Bailleur pourrait réclamer au Locataire.",
      "11.2 Résiliation anticipée par le Locataire",
      "Le Locataire reconnaît qu'il s'engage irrévocablement à compter de la signature du présent contrat pour la durée prévue aux conditions particulières. Il est ainsi rappelé que l'annulation de la commande par le Locataire avant la réception du Matériel Loué entraînera la facturation d'une indemnité, telle que déterminée à l'article 3 du présent contrat.",
      "En outre, le Locataire aura la faculté de demander la résiliation du présent contrat en cas de non-respect par le Bailleur de l'une de ses obligations au titre du présent contrat après une mise en demeure faite par lettre recommandée avec avis de réception restée sans réponse dans les 30 (trente) jours suivant sa réception. Dans ce cas, seule la restitution du Matériel Loué, dans les conditions de l'article 13, et le paiement des loyers échus impayés seront dus par le Locataire.",
      "11.3 Autres cas de résiliation anticipée",
      "Le contrat de location peut être résilié de plein droit sous réserves de justificatifs :",
      "- En cas de cessation, de suspension de l'activité du Locataire, quelles qu'en soient les causes,",
      "- En cas de dissolution, fusion, scission, absorption, apport partiel d'actif du Locataire,",
      "- En cas de perte ou diminution des garanties et sûretés.",
      "A cet égard, le Locataire s'engage à informer immédiatement et par écrit le Bailleur de tout évènement entrant dans les cas prévus ci-dessus.",
      "Dans les cas visés par l'article 12.3, la restitution du Matériel Loué dans les conditions de l'article 13, le paiement des loyers échus impayés et le montant des loyers restant à courir jusqu'à la fin du contrat de location seront dus par le Locataire.",
    ],
  },
  {
    titre: "Article 12 - RESTITUTION DU MATÉRIEL LOUÉ",
    texte: [
      "En cas de résiliation, le Locataire ne pourra en aucun cas se prévaloir d'un quelconque droit sur le Matériel Loué.",
      "Ainsi, en cas de résiliation, le Locataire est tenu sous sa seule responsabilité et à ses frais de restituer le Matériel Loué et ses accessoires et options au lieu indiqué par le Bailleur, en parfait état de fonctionnement, d'entretien et de propreté.",
      "Le Locataire ne pourra réclamer au Bailleur le remboursement ou une indemnité compensatrice au titre des pièces d'équipement, accessoires et options incorporés au Matériel Loué au cours de la location. Le Bailleur pourra exiger la remise en état initial du Matériel Loué à la fin du présent contrat de location.",
      "Le Locataire est tenu de rendre le Matériel Loué immédiatement en cas de résiliation du contrat.",
      "A défaut de restitution, le Bailleur pourra faire procéder à l'enlèvement du Matériel Loué en tout lieu où il se trouve, aux frais du Locataire.",
      "En cas de refus du Locataire de restituer le Matériel Loué, le Bailleur pourra exercer toute voie de recours. Les frais de justice liés à la défaillance du Locataire pourront être mis à la charge de ce dernier.",
      "Le Locataire accepte de restituer le Matériel Loué dans le même état que lors de sa prise en charge, hormis l'usure normale du Matériel Loué, et muni des mêmes documents, équipements, accessoires et options, au lieu et à la date indiqués par le Bailleur. Le Locataire reconnaît qu'il sera tenu responsable de tout perte ou tout dommage subi par le Matériel Loué, ses documents, équipements, accessoires et options au cours de la location. (Grille Tarifaire en Annexe)",
      "Le Bailleur et le Locataire procèderont à une vérification de l'état du Matériel Loué au début de la location et à la restitution du Matériel Loué. Ils établiront un relevé de toutes les dégradations constatées d'un commun accord.",
      "Tous les frais nécessaires de réparations, d'entretien, de manutention ou de transport seront mis à la charge du Locataire et devront être réglés sans délai après présentation de la facture de remise en l'état.",
    ],
  },
  {
    titre: "Article 13 – CESSION",
    texte: ["Le Locataire reconnaît au Bailleur le droit de transférer la propriété du Matériel Loué et de céder les droits résultant du présent contrat. Le Locataire sera informé de la cession par tout moyen."],
  },
  {
    titre: "Article 14 – REDEVANCES, PEAGES ET INFRACTIONS AU CODE DE LA ROUTE",
    texte: [
      "Le Locataire, ou tout Conducteur autorisé à conduire le Matériel Loué s'engage à respecter, en toute circonstance, le Code de la route, et plus généralement, la règlementation en vigueur à l'occasion de la conduite et de l'utilisation du Matériel Loué dont il a la garde en vertu des présentes Conditions et du Contrat de location.",
      "Le Locataire, ou tout Conducteur autorisé, déclare qu'il est titulaire d'un permis de conduire valable pour la conduite du Matériel Loué.",
      "Le Locataire, ou tout Conducteur autorisé, est tenu de régler personnellement toutes redevance, taxe et somme dues au titre de la réglementation relative au péage et au stationnement du Matériel Loué. Il est responsable personnellement du paiement de toutes les amendes et redevances liées à la conduite et à l'utilisation du Matériel Loué ainsi que de toutes les conséquences pénales, administratives et pécuniaires pouvant résulter des manquements à toutes règlementations applicables (notamment les règlementations relatives au stationnement) concernant le Matériel Loué, pendant la période de location, et ce, jusqu'à la récupération des clés du Matériel Loué par le Bailleur.",
      "Dans les cas où le Bailleur est tenu de payer les amendes et redevances dues par le Locataire, ou tout conducteur autorisé, en vertu du paragraphe précédent, le Locataire autorise expressément le Bailleur à prélever la somme correspondant au montant de l'amende ou de la redevance et, le cas échéant, des majorations dues du fait de l'absence de paiement de ces amendes ou redevances par le Locataire. Pour chaque amende ou redevance due par le Locataire, ou tout conducteur autorisé, et reçue ou notifiée et traitée par le Bailleur, le Locataire sera redevable à l'égard du Bailleur de frais de gestion dont le montant est défini contractuellement. En acceptant le Contrat de location, le Locataire autorise le Bailleur à prélever les sommes correspondant à ces amendes, redevances et frais de gestion, ou bien, lorsque ce débit n'est pas possible, le Locataire s'engage à régler la facture correspondante.",
      "Le propriétaire du véhicule, soit le Bailleur, est, de par la loi, redevable pécuniairement de toute amende relative aux infractions au Code de la route constatées sans interception du véhicule, à moins qu'il ne fournisse aux autorités des renseignements permettant l'identification du Conducteur. Le Locataire est ainsi informé que le Bailleur sera amené à le désigner auprès des autorités de police conformément aux dispositions des articles L. 121-2, L. 121-3 et L. 121-6 du Code de la route. Le Bailleur transmettra pour ce faire les données concernant l'identité du Locataire, ou de tout Conducteur autorisé, ainsi que les informations suivantes : nom, prénom, date et lieu de naissance, adresse, numéro du permis de conduire et date et autorité de délivrance. Le Bailleur pourra également être amené à transmettre aux autorités de police une copie du contrat de location ou tous autres éléments matérialisant la location du véhicule au profit du Locataire, ou du Conducteur autorisé ou permettant son identification. Le Locataire est informé que, dans le cadre des informations qui pourront être communiquées aux autorités par le Bailleur, il doit s'assurer que les informations concernant ses coordonnées personnelles sont à jour au moment de l'établissement du Contrat de location et s'engage le cas échéant à les actualiser.",
    ],
  },
  {
    titre: "Article 15 – COMPÉTENCE",
    texte: ["En cas de différend découlant du présent contrat ou qui en serait lié, les Parties tenteront en premier lieu de régler ce différend par des négociations amiables. Si le litige ne peut être résolu de cette manière, il sera tranché par le Tribunal de commerce de Paris."],
  },
];

export const ANNEXE_SINISTRES: ArticleContrat = {
  titre: "DÉMARCHES POUR SINISTRES PARTIELS ET TOTAUX",
  texte: [
    "En cas de sinistre survenu au Matériel, le Locataire doit en informer le bailleur par lettre recommandée avec accusé réception sous 48 heures.",
    "En cas de sinistre partiel, le Locataire assure la remise en état du Matériel à ses frais, et le Loueur, sur justification de cette remise en état, lui reverse le montant de l'indemnité éventuellement perçue des sociétés d'assurances, déduction faite, le cas échéant, des sommes que le Locataire pourrait lui devoir. Les loyers doivent être honorés sans interruption.",
    "En cas de sinistre total affectant le Matériel, le présent contrat est résilié de plein droit à la date dudit sinistre. Le Locataire s'engage à verser au Bailleur, dans le délai prévu au contrat initial, une indemnité équivalente au montant total des loyers restant à courir, sans que cette indemnité ne puisse excéder la valeur vénale TTC du Matériel au jour du sinistre.",
    "Pour la part non couverte ou non indemnisée des risques, ou en cas de déchéance invoquée par les sociétés d'assurances, la responsabilité du Locataire est pleine et entière. Il s'engage à indemniser sur ses fonds propres le Bailleur à hauteur de l'entier préjudice subi par ce dernier.",
  ],
};

export const CONTACTS_DELTA: string[] = [
  "Pour toutes demandes liées au contrat de location, vos restitutions de véhicules, vos cautions : assistanat.commerce@delta-services.fr",
  "Pour toutes demandes liées à la livraison d'un véhicule : logistique@delta-services.fr",
  "Pour toutes demandes liées à la facturation : compta@delta-services.fr ou 01.60.95.47.80 (choix n° 3)",
  "En cas de sinistre : gestionparc@delta-services.fr ou 01.60.95.47.80 (choix n° 1)",
  "En cas de panne, pour un suivi des VGP ou du Contrôle Technique : gestionparc@delta-services.fr ou 01.60.95.47.80 (choix n° 1)",
  "Pour toutes demandes liées à la géolocalisation de vos véhicules (si équipés d'un traqueur) : assistanat.commerce@delta-services.fr ou 01.60.95.47.80 (choix n° 3)",
];

export const FOURNISSEUR_DEFAUT = { nom: "KLUBB France", adresse: "12 Avenue James de Rothschild\n77164 FERRIERES-EN-BRIE", siren: "431 418 995" };
export const BAILLEUR_DEFAUT = { nom: "DELTA SERVICES", adresse: "14 Avenue James de Rothschild\n77164 FERRIERES-EN-BRIE", siren: "512 252 792" };
export const PIED_CONTRAT = "DELTA SERVICES / 14 Avenue James de Rothschild / 77164 Ferrières-en-Brie / Tel. +33 (0)1 60 95 47 80 — Siret : 512 252 792 00050 / N° TVA intracommunautaire FR 95 512 252 792";
