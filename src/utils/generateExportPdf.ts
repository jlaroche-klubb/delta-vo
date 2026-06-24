import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/**
 * Génère et télécharge le PDF de la fiche export (anglaise) en capturant
 * l'élément #fiche-export-page-1 rendu dans le DOM.
 * Les photos étant des data URLs (saisie manuelle locale), aucun
 * préchargement CORS n'est nécessaire.
 */
export async function generateExportPdf(reference?: string): Promise<void> {
  const page = document.getElementById("fiche-export-page-1");
  if (!page) {
    throw new Error("La fiche export n'est pas trouvée dans le DOM");
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;

  const canvas = await html2canvas(page, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  pdf.addImage(imgData, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");

  const today = new Date().toISOString().slice(0, 10);
  const ref = (reference || "no-ref").replace(/[^a-zA-Z0-9_-]/g, "-");
  pdf.save(`delta-export_${ref}_${today}.pdf`);
}
