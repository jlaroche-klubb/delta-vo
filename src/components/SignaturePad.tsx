import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

/**
 * ✍️ Cadre de signature au doigt / à la souris (même tracé que la page de
 * signature des devis). `ref.png()` renvoie la signature recadrée sur le
 * trait, fond transparent, ou "" si rien n'a été dessiné.
 */
export interface SignaturePadHandle { png: () => string; effacer: () => void; aSigne: boolean }

const SignaturePad = forwardRef<SignaturePadHandle, { hauteur?: number }>(function SignaturePad({ hauteur = 170 }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dessin = useRef(false);
  const [aSigne, setASigne] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    let largeur = 0;
    const ajuster = () => {
      const r = c.getBoundingClientRect();
      if (Math.round(r.width) === largeur) return;
      largeur = Math.round(r.width);
      const d = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * d);
      c.height = Math.round(r.height * d);
      const ctx = c.getContext("2d")!;
      ctx.scale(d, d);
      ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0b1f4d";
      setASigne(false);
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const debut = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId); dessin.current = true;
    const ctx = e.currentTarget.getContext("2d")!; const p = pos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
  };
  const trait = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dessin.current) return;
    const ctx = e.currentTarget.getContext("2d")!; const p = pos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke(); setASigne(true);
  };
  const fin = () => { dessin.current = false; };
  const effacer = () => { const c = canvas.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setASigne(false); };
  const png = () => {
    const c = canvas.current; if (!c || !aSigne) return "";
    const ctx = c.getContext("2d")!; const { width: w, height: h } = c;
    const px = ctx.getImageData(0, 0, w, h).data;
    let x1 = w, y1 = h, x2 = 0, y2 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 10) { if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y; }
    if (x2 <= x1 || y2 <= y1) return "";
    const m = 6; x1 = Math.max(0, x1 - m); y1 = Math.max(0, y1 - m); x2 = Math.min(w - 1, x2 + m); y2 = Math.min(h - 1, y2 + m);
    const out = document.createElement("canvas"); const e2 = Math.min(1, 900 / (x2 - x1));
    out.width = Math.round((x2 - x1) * e2); out.height = Math.round((y2 - y1) * e2);
    out.getContext("2d")!.drawImage(c, x1, y1, x2 - x1, y2 - y1, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };
  useImperativeHandle(ref, () => ({ png, effacer, aSigne }), [aSigne]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={effacer} style={{ background: "none", border: "none", color: "#1f4282", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}>Effacer</button>
      </div>
      <canvas ref={canvas} onPointerDown={debut} onPointerMove={trait} onPointerUp={fin} onPointerCancel={fin} onPointerLeave={fin}
        style={{ width: "100%", height: hauteur, border: "2px dashed #b8c0d0", borderRadius: 8, background: "#fbfcfe", touchAction: "none", cursor: "crosshair", display: "block" }} />
    </div>
  );
});
export default SignaturePad;
