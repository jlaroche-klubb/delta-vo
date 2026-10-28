/**
 * 🌍 Textes des devis de vente en français, anglais et espagnol
 * (PDF + désignation des nacelles). L'email au client est traduit côté
 * serveur (api/devis.ts) avec la même langue, stockée sur le devis.
 */

export type LangueDevis = "fr" | "en" | "es";
export const LANGUES_DEVIS: { code: LangueDevis; libelle: string }[] = [
  { code: "fr", libelle: "🇫🇷 Français" },
  { code: "en", libelle: "🇬🇧 English" },
  { code: "es", libelle: "🇪🇸 Español" },
];

export function langueDevis(v: any): LangueDevis {
  const l = String(v || "").slice(0, 2).toLowerCase();
  return l === "en" || l === "es" ? l : "fr";
}

const LOCALE: Record<LangueDevis, string> = { fr: "fr-FR", en: "en-GB", es: "es-ES" };

/** Montant « 12 345,00 € » / « €12,345.00 » / « 12.345,00 € » (espaces insécables remplacés : jsPDF) */
export function eurDevis(n: number, lg: LangueDevis): string {
  return (Number(n) || 0)
    .toLocaleString(LOCALE[lg], { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
}

export const nombreDevis = (n: number, lg: LangueDevis) => Number(n).toLocaleString(LOCALE[lg]).replace(/[  ]/g, " ");

export interface TextesDevis {
  devis: string;
  date: string;
  valable: string;
  etabli: string;
  siren: string;
  reference: string;
  designation: string;
  prixHt: string;
  totalHt: string;
  tva: string;
  totalTtc: string;
  total: string;
  exonerationCourte: string;
  financement: string;
  acompte: (pct: number) => string;
  reglementTitre: string;
  reglementFinancement: string;
  reglement100: string;
  reglementAcompte: (pct: number) => string;
  conditions: string;
  bonPourAccord: string;
  signature1: string;
  signature2: string;
  cgv: string;
  /** Mention par défaut quand la TVA est à 0 */
  exonerationDefaut: string;
  /** Conditions par défaut (si non paramétrées dans Admin pour cette langue) */
  conditionsDefaut: string;
  nacelle: string;
  lot: (n: number) => string;
  sur: string;
}

export const TEXTES_DEVIS: Record<LangueDevis, TextesDevis> = {
  fr: {
    devis: "Devis",
    date: "Date",
    valable: "Valable jusqu'au",
    etabli: "Établi par",
    siren: "SIREN",
    reference: "Référence",
    designation: "Désignation",
    prixHt: "Prix HT",
    totalHt: "Total HT",
    tva: "TVA",
    totalTtc: "TOTAL TTC",
    total: "TOTAL",
    exonerationCourte: "Exonération de TVA",
    financement: "Financement bancaire — sans acompte",
    acompte: (p) => `Acompte à la commande (${p} %)`,
    reglementTitre: "Règlement",
    reglementFinancement: "Financement bancaire : aucun acompte demandé, règlement de la totalité par l'organisme de financement avant livraison.",
    reglement100: "Règlement de la totalité à la commande, par virement.",
    reglementAcompte: (p) => `Acompte de ${p} % à la commande par virement, solde avant livraison ou enlèvement.`,
    conditions: "Conditions",
    bonPourAccord: "Bon pour accord",
    signature1: "Date, nom, signature et cachet du client",
    signature2: "précédés de la mention « Bon pour accord »",
    cgv: "Conditions générales de vente",
    exonerationDefaut: "Exonération de TVA — livraison intracommunautaire (art. 262 ter I du CGI)",
    conditionsDefaut:
      "Matériel d'occasion vendu en l'état, visible sur site avant enlèvement. " +
      "Livraison ou enlèvement après encaissement de la totalité du prix. " +
      "Le transfert de propriété intervient au paiement intégral.",
    nacelle: "Nacelle",
    lot: (n) => `Prix global du lot (${n} nacelles)`,
    sur: "sur",
  },
  en: {
    devis: "Quotation",
    date: "Date",
    valable: "Valid until",
    etabli: "Issued by",
    siren: "Company no.",
    reference: "Reference",
    designation: "Description",
    prixHt: "Price excl. VAT",
    totalHt: "Total excl. VAT",
    tva: "VAT",
    totalTtc: "TOTAL incl. VAT",
    total: "TOTAL",
    exonerationCourte: "VAT exempt",
    financement: "Bank financing — no deposit",
    acompte: (p) => `Deposit on order (${p} %)`,
    reglementTitre: "Payment",
    reglementFinancement: "Bank financing: no deposit required; the full amount is paid by the financing institution before delivery.",
    reglement100: "Full payment on order, by bank transfer.",
    reglementAcompte: (p) => `${p} % deposit on order by bank transfer, balance before delivery or collection.`,
    conditions: "Terms",
    bonPourAccord: "Approved and accepted",
    signature1: "Date, name, signature and company stamp",
    signature2: "preceded by the words “Approved and accepted”",
    cgv: "General terms and conditions of sale",
    exonerationDefaut: "VAT exempt — intra-Community supply (Art. 138 of Directive 2006/112/EC; Art. 262 ter I French Tax Code)",
    conditionsDefaut:
      "Used equipment sold as is, available for inspection on site before collection. " +
      "Delivery or collection after receipt of the full price. " +
      "Ownership is transferred upon full payment.",
    nacelle: "Aerial platform",
    lot: (n) => `Total price for the lot (${n} aerial platforms)`,
    sur: "on",
  },
  es: {
    devis: "Presupuesto",
    date: "Fecha",
    valable: "Válido hasta",
    etabli: "Elaborado por",
    siren: "N.º empresa (SIREN)",
    reference: "Referencia",
    designation: "Descripción",
    prixHt: "Precio sin IVA",
    totalHt: "Total sin IVA",
    tva: "IVA",
    totalTtc: "TOTAL IVA incl.",
    total: "TOTAL",
    exonerationCourte: "Exento de IVA",
    financement: "Financiación bancaria — sin anticipo",
    acompte: (p) => `Anticipo al realizar el pedido (${p} %)`,
    reglementTitre: "Forma de pago",
    reglementFinancement: "Financiación bancaria: no se requiere anticipo; la entidad financiera abona el importe total antes de la entrega.",
    reglement100: "Pago del importe total al realizar el pedido, por transferencia bancaria.",
    reglementAcompte: (p) => `Anticipo del ${p} % al realizar el pedido por transferencia, saldo antes de la entrega o recogida.`,
    conditions: "Condiciones",
    bonPourAccord: "Conforme",
    signature1: "Fecha, nombre, firma y sello del cliente",
    signature2: "precedidos de la mención «Conforme»",
    cgv: "Condiciones generales de venta",
    exonerationDefaut: "Exento de IVA — entrega intracomunitaria (art. 138 Directiva 2006/112/CE; art. 262 ter I CGI francés)",
    conditionsDefaut:
      "Material de ocasión vendido en el estado en que se encuentra, visible en nuestras instalaciones antes de la recogida. " +
      "Entrega o recogida tras el cobro del importe total. " +
      "La transmisión de la propiedad se produce con el pago íntegro.",
    nacelle: "Plataforma elevadora",
    lot: (n) => `Precio global del lote (${n} plataformas)`,
    sur: "sobre",
  },
};
