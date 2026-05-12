import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Machine } from "../types/machine";

interface GenerateFicheOptions {
  machine: Machine;
  prixChoisi: "fr" | "export";
  commercial: {
    nom: string;
    email: string;
    phone: string;
  };
}

export async function generateFichePdf({
  machine,
  prixChoisi,
  commercial,
}: GenerateFicheOptions): Promise<void> {
  // On va capturer les 2 pages HTML de la fiche, puis les transformer en PDF A4
  const page1 = document.getElementById("fiche-vo-page-1");
  const page2 = document.getElementById("fiche-vo-page-2");

  if (!page1 || !page2) {
    throw new Error("Les pages de la fiche ne sont pas trouvées dans le DOM");
  }

  // Création du PDF A4 portrait
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Dimensions A4 en mm
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;

  // PAGE 1
  const canvas1 = await html2canvas(page1, {
    scale: 2, // qualité 2x pour avoir un PDF net
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
  const imgData1 = canvas1.toDataURL("image/png");
  pdf.addImage(imgData1, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");

  // PAGE 2
  pdf.addPage();
  const canvas2 = await html2canvas(page2, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
  const imgData2 = canvas2.toDataURL("image/png");
  pdf.addImage(imgData2, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");

  // Nom du fichier : delta-vo_fiche-N2196DS_immat_2026-05-12.pdf
  const today = new Date().toISOString().slice(0, 10);
  const ficheNum = machine.fiche_commerciale?.numero_fiche || "SANS-NUM";
  const filename = `delta-vo_fiche-${ficheNum}_${machine.immat}_${today}.pdf`;

  pdf.save(filename);
}

// Helper pour afficher une valeur ou rien (Q5 = A)
export function showOrSkip<T>(value: T | undefined | null, formatter?: (v: T) => string): string {
  if (value === undefined || value === null || value === "") return "";
  return formatter ? formatter(value) : String(value);
}

// Formatte un nombre avec espaces (32000 → "32 000")
export function formatNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}