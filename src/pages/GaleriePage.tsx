import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

interface ShareData {
  immat?: string;
  label?: string;
  photos?: string[];
  created_at?: string;
  created_by?: string;
  revoked?: boolean;
  expires_at?: string | null;
}

const BLEU = "#1a2a6e";
const ROUGE = "#c8102e";

export default function GaleriePage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ok" | "invalid">("loading");
  const [data, setData] = useState<ShareData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setState("invalid");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "shares", token));
        if (cancelled) return;
        if (!snap.exists()) {
          setState("invalid");
          return;
        }
        const d = snap.data() as ShareData;
        const expired = d.expires_at ? new Date(d.expires_at) < new Date() : false;
        if (d.revoked || expired || !d.photos || d.photos.length === 0) {
          setState("invalid");
          return;
        }
        setData(d);
        setState("ok");
      } catch (e) {
        console.error("Galerie : erreur de lecture", e);
        if (!cancelled) setState("invalid");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={page}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${BLEU}, ${ROUGE})` }} />
      <header style={header}>
        <div style={{ fontWeight: 800, letterSpacing: 2, fontSize: 18 }}>DELTA VO</div>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 1 }}>Photos du véhicule</div>
      </header>

      <main style={main}>
        {state === "loading" && (
          <div style={center}>Chargement des photos…</div>
        )}

        {state === "invalid" && (
          <div style={center}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
            <div style={{ fontWeight: 700, color: BLEU, marginBottom: 6 }}>Lien indisponible</div>
            <div style={{ fontSize: 14, color: "#6a7488", maxWidth: 360, textAlign: "center" }}>
              Ce lien de partage n'est plus valide. Contactez votre interlocuteur Delta pour en
              obtenir un nouveau.
            </div>
          </div>
        )}

        {state === "ok" && data && (
          <>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: BLEU }}>
                {data.label || "Véhicule"}
              </div>
              {data.immat && (
                <div style={{ fontFamily: "monospace", fontSize: 15, color: "#6a7488", marginTop: 2 }}>
                  {data.immat}
                </div>
              )}
              <div style={{ fontSize: 13, color: "#6a7488", marginTop: 8 }}>
                {data.photos!.length} photo{data.photos!.length > 1 ? "s" : ""}
              </div>
            </div>

            <div style={grid}>
              {data.photos!.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={tile}
                  title="Ouvrir / enregistrer la photo"
                >
                  <img src={url} alt={`Photo ${i + 1}`} style={img} loading="lazy" />
                </a>
              ))}
            </div>

            <div style={{ fontSize: 12, color: "#9aa3b2", marginTop: 22, textAlign: "center" }}>
              Touchez une photo pour l'agrandir et l'enregistrer.
            </div>
          </>
        )}
      </main>

      <footer style={footer}>
        © {new Date().getFullYear()} Delta Services
      </footer>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f0f2f5",
  display: "flex",
  flexDirection: "column",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  color: "#1a2030",
};
const header: React.CSSProperties = {
  background: BLEU,
  color: "#fff",
  padding: "16px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const main: React.CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: 900,
  margin: "0 auto",
  padding: "22px 16px",
};
const center: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "60px 16px",
  color: "#6a7488",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 10,
};
const tile: React.CSSProperties = {
  display: "block",
  border: "1px solid #d0d4da",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
};
const img: React.CSSProperties = {
  width: "100%",
  height: 150,
  objectFit: "cover",
  display: "block",
};
const footer: React.CSSProperties = {
  textAlign: "center",
  padding: "16px",
  fontSize: 11,
  color: "#9aa3b2",
};
