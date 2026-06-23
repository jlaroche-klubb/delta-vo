import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Machine } from "../types/machine";

interface GenerateFicheOptions {
  machine: Machine;
  prixChoisi: "fr" | "dealer";
  commercial: {
    nom: string;
    email: string;
    phone: string;
  };
}

/**
 * Télécharge une image (Firebase Storage notamment) et la convertit
 * en data URL base64. Permet à html2canvas de la consommer sans
 * problème CORS, car les data URLs sont same-origin.
 */
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[generateFichePdf] Échec téléchargement image: ${url} (${response.status})`);
      return null;
    }
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn(`[generateFichePdf] Erreur fetch image: ${url}`, e);
    return null;
  }
}

/**
 * Précharge toutes les <img> d'un élément racine (et de ses enfants)
 * dont la src commence par http(s)://, et remplace src par la version
 * base64. Bypasse le CORS pour html2canvas.
 */
async function preloadImagesAsBase64(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      // On ne convertit que les URLs distantes (http/https), pas les data URIs ni le logo
      if (!/^https?:\/\//.test(src)) return;
      const base64 = await imageUrlToBase64(src);
      if (base64) {
        img.setAttribute("src", base64);
        // Attendre que la nouvelle image soit décodée pour html2canvas
        try {
          await img.decode();
        } catch {
          // Si decode pas dispo (vieux navigateur), on ignore - le timing du render suffit en général
        }
      }
    })
  );
}

export async function generateFichePdf({
  machine,
  prixChoisi,
  commercial,
}: GenerateFicheOptions): Promise<void> {
  // Fiche sur une seule page A4
  const page1 = document.getElementById("fiche-vo-page-1");

  if (!page1) {
    throw new Error("La page de la fiche n'est pas trouvée dans le DOM");
  }

  // 🆕 Préchargement des photos distantes (Firebase Storage) en base64
  // pour contourner les restrictions CORS de html2canvas
  console.log("[generateFichePdf] Préchargement des images distantes...");
  await preloadImagesAsBase64(page1);
  console.log("[generateFichePdf] Préchargement terminé, génération du PDF...");

  // Création du PDF A4 portrait
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Dimensions A4 en mm
  const PAGE_WIDTH = 210;
  const PAGE_HEIGHT = 297;

  // PAGE UNIQUE
  const canvas1 = await html2canvas(page1, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });
  const imgData1 = canvas1.toDataURL("image/png");
  pdf.addImage(imgData1, "PNG", 0, 0, PAGE_WIDTH, PAGE_HEIGHT, undefined, "FAST");


  // Nom du fichier
  const today = new Date().toISOString().slice(0, 10);
  const ficheNum = machine.fiche_commerciale?.numero_fiche || "SANS-NUM";
  const filename = `delta-vo_fiche-${ficheNum}_${machine.immat}_${today}.pdf`;

  pdf.save(filename);
}

// Helper pour afficher une valeur ou rien
export function showOrSkip<T>(value: T | undefined | null, formatter?: (v: T) => string): string {
  if (value === undefined || value === null || value === "") return "";
  return formatter ? formatter(value) : String(value);
}

// Formatte un nombre avec espaces (32000 → "32 000")
export function formatNumber(n: number): string {
  return n.toLocaleString("fr-FR");
}
