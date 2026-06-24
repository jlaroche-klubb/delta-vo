import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";

/** Réduit une image (data URL) à max px sur le plus grand côté. */
export function downscaleDataUrl(dataUrl: string, max = 1600, quality = 0.9): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Appelle le proxy serverless /api/removebg et renvoie le cutout (PNG transparent) en data URL. */
export async function removeBgViaProxy(dataUrl: string): Promise<string> {
  const small = await downscaleDataUrl(dataUrl, 1600, 0.9);
  const imageBase64 = small.split(",")[1];
  const resp = await fetch("/api/removebg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64 }),
  });
  if (!resp.ok) {
    let detail = "";
    try {
      detail = (await resp.json())?.error || "";
    } catch {
      /* ignore */
    }
    throw new Error(`Détourage indisponible (${resp.status})${detail ? " — " + detail : ""}`);
  }
  const json = await resp.json();
  return "data:image/png;base64," + json.imageBase64;
}

/**
 * Compose la photo commerciale : fond dégradé + cutout recadré + barre bleue
 * Delta (logo blanc + bandeau référence). Porté de Nacelle Expert
 * (composeCommercialPhoto). Aucune API : pur canvas, donc rejouable
 * gratuitement (ex. quand la référence change).
 */
export function composeExportPhoto(cutoutDataUrl: string, reference?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const W = 1080,
      H = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const barH = 120;

    // Fond dégradé ciel -> sol
    const horizon = Math.round((H - barH) * 0.62);
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#cfe0f2");
    sky.addColorStop(1, "#eef4fb");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon);
    const ground = ctx.createLinearGradient(0, horizon, 0, H - barH);
    ground.addColorStop(0, "#e7e9ec");
    ground.addColorStop(1, "#cfd3d8");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - barH - horizon);

    // Barre bleue Delta + liseré rouge
    ctx.fillStyle = "#1a2a6e";
    ctx.fillRect(0, H - barH, W, barH);
    ctx.fillStyle = "#c8102e";
    ctx.fillRect(0, H - barH - 5, W, 5);

    const subject = new Image();
    subject.onload = () => {
      // Bounding box du contenu réel (alpha > 20)
      const tmpC = document.createElement("canvas");
      tmpC.width = subject.naturalWidth;
      tmpC.height = subject.naturalHeight;
      const tmpCtx = tmpC.getContext("2d")!;
      tmpCtx.drawImage(subject, 0, 0);
      const pixels = tmpCtx.getImageData(0, 0, tmpC.width, tmpC.height).data;

      let minX = tmpC.width,
        maxX = 0,
        minY = tmpC.height,
        maxY = 0;
      for (let y = 0; y < tmpC.height; y++) {
        for (let x = 0; x < tmpC.width; x++) {
          const a = pixels[(y * tmpC.width + x) * 4 + 3];
          if (a > 20) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      // Image sans contenu détecté : on garde l'image entière
      if (maxX < minX || maxY < minY) {
        minX = 0;
        minY = 0;
        maxX = tmpC.width - 1;
        maxY = tmpC.height - 1;
      }

      const contentW = maxX - minX + 1;
      const contentH = maxY - minY + 1;
      const avail = H - barH - 5;
      const margin = 4;
      const scale = Math.min((W - margin * 2) / contentW, (avail - margin * 2) / contentH);
      const sw = contentW * scale;
      const sh = contentH * scale;
      const sx = (W - sw) / 2;
      const sy = margin + (avail - margin * 2 - sh) / 2;

      ctx.drawImage(subject, minX, minY, contentW, contentH, sx, sy, sw, sh);

      // Logo Delta blanc + bandeau référence
      const logo = new Image();
      logo.onload = () => {
        const logoH = 62,
          logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;
        const tmpLogo = document.createElement("canvas");
        tmpLogo.width = logoW;
        tmpLogo.height = logoH;
        const lCtx = tmpLogo.getContext("2d")!;
        lCtx.filter = "brightness(0) invert(1)";
        lCtx.drawImage(logo, 0, 0, logoW, logoH);
        ctx.drawImage(tmpLogo, 36, H - barH + (barH - logoH) / 2, logoW, logoH);

        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(logoW + 60, H - barH + 18);
        ctx.lineTo(logoW + 60, H - 18);
        ctx.stroke();

        const ref = (reference || "").trim();
        if (ref) {
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 32px monospace";
          ctx.textAlign = "right";
          ctx.fillText(ref.toUpperCase(), W - 36, H - barH + barH / 2 + 11);
        }

        resolve(canvas.toDataURL("image/jpeg", 0.96));
      };
      logo.onerror = () => resolve(canvas.toDataURL("image/jpeg", 0.95));
      logo.src = DELTA_LOGO_BASE64;
    };
    subject.onerror = () => resolve(null);
    subject.src = cutoutDataUrl;
  });
}
