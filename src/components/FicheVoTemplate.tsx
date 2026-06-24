import { Machine } from "../types/machine";
import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";

interface FicheVoTemplateProps {
  machine: Machine;
  prixChoisi: "fr" | "dealer";
  commercial: {
    nom: string;
    email: string;
    phone: string;
  };
}

export default function FicheVoTemplate({
  machine,
  prixChoisi,
  commercial,
}: FicheVoTemplateProps) {
  const fc = machine.fiche_commerciale || {};
  const numero = fc.numero_fiche || "—";
  const prix = prixChoisi === "fr" ? machine.prix_fr : machine.prix_dealer;
  const prixLabel = prixChoisi === "fr" ? "PRIX HT" : "PRIX HT DEALER";

  // === Photos de la fiche : priorité aux photos de ventes, fallback legacy ===
  const pv = machine.photos_ventes || {};
  const legacy = machine.photos_commerciales || {};
  const photos = {
    // grande photo (hero) : 3/4 avant droit détourée
    principale: pv.trois_quart_av_droit ?? legacy.av_droit,
    // 3/4 arrière gauche détourée
    secondaire: pv.trois_quart_ar_gauche ?? legacy.ar_gauche,
    // habitacle avant (brute)
    habitacle: pv.habitacle_av ?? legacy.ar_droit,
  };

  return (
    <>
      {/* PAGE 1 */}
      <div id="fiche-vo-page-1" style={pageStyle}>
        <SideBanner numero={numero} />

        <div style={mainContentStyle}>
          <div style={headerStyle}>
            <img src={DELTA_LOGO_BASE64} alt="Delta Services" style={logoStyle} />
            <div style={titleBlockStyle}>
              <div style={titleStyle}>
                NACELLE ÉLÉVATRICE{" "}
                {fc.hauteur_travail_m
                  ? `${fc.hauteur_travail_m.toString().replace(".", ",")} m`
                  : ""}
              </div>
              <div style={subtitleStyle}>
                SUR FOURGON {machine.modele_porteur.toUpperCase()}
              </div>
            </div>
          </div>

          <div style={separatorStyle}></div>

          <div style={gridStyle}>
            {/* 3 photos : 1 grande + 2 en dessous, proportions conservées */}
            <div style={photoColStyle}>
              <div style={photoBigStyle}>
                <PhotoSlot label="3/4 avant droit" src={photos.principale} caption={false} />
              </div>
              <div style={photoRow2Style}>
                <PhotoSlot label="3/4 arrière gauche" src={photos.secondaire} caption={false} />
                <PhotoSlot label="Habitacle avant" src={photos.habitacle} caption={false} />
              </div>
            </div>

            <div style={specsStyle}>
              <div style={specBlockStyle}>
                <div style={specTitleStyle}>NACELLE ÉLÉVATRICE {machine.type_nacelle}</div>
                <ul style={specListStyle}>
                  {fc.hauteur_travail_m && (
                    <li style={specItemStyle}>
                      - Hauteur de travail :{" "}
                      <strong>{fc.hauteur_travail_m.toString().replace(".", ",")} m</strong>
                    </li>
                  )}
                  {fc.deport_travail_m && (
                    <li style={specItemStyle}>
                      - Déport de travail :{" "}
                      <strong>{fc.deport_travail_m.toString().replace(".", ",")} m</strong>
                    </li>
                  )}
                  {fc.nb_personnes_panier && (
                    <li style={specItemStyle}>
                      - Panier isolé :{" "}
                      <strong>
                        {fc.nb_personnes_panier} personne{fc.nb_personnes_panier > 1 ? "s" : ""}
                      </strong>
                    </li>
                  )}
                  {machine.heures_nacelle !== undefined && (
                    <li style={specItemStyle}>
                      - Nombre d'heures :{" "}
                      <strong>{machine.heures_nacelle.toLocaleString("fr-FR")}H</strong>
                    </li>
                  )}
                </ul>
              </div>

              <div style={specBlockStyle}>
                <div style={specTitleStyle}>PORTEUR</div>
                <ul style={specListStyle}>
                  <li style={specItemStyle}>
                    - Modèle :{" "}
                    <strong>
                      {machine.modele_porteur}
                      {fc.puissance_porteur ? ` ${fc.puissance_porteur}` : ""}
                    </strong>
                  </li>
                  {machine.annee_circulation && (
                    <li style={specItemStyle}>
                      - Année de mise en circulation :{" "}
                      <strong>{machine.annee_circulation.split("/").pop()}</strong>
                    </li>
                  )}
                  {machine.km_porteur !== undefined && (
                    <li style={specItemStyle}>
                      - Kilométrage :{" "}
                      <strong>{machine.km_porteur.toLocaleString("fr-FR")} km</strong>
                    </li>
                  )}
                </ul>
              </div>

              <div style={specBlockStyle}>
                <div style={specTitleStyle}>AMÉNAGEMENT INTÉRIEUR</div>
                <p style={specTextStyle}>{fc.amenagement_interieur || "—"}</p>
              </div>

              <div style={specBlockStyle}>
                <div style={specTitleStyle}>OPTIONS</div>
                {fc.options && fc.options.length > 0 ? (
                  <ul style={specListPlainStyle}>
                    {fc.options.map((opt, idx) => (
                      <li key={idx} style={specItemPlainStyle}>
                        - {opt}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={specTextStyle}>—</p>
                )}
              </div>
            </div>
          </div>

          {prix !== undefined && (
            <div style={priceBlockStyle}>
              <div style={priceLabelStyle}>{prixLabel}</div>
              <div style={priceValueStyle}>
                {prix.toLocaleString("fr-FR")} € <span style={priceUnitStyle}>HT</span>
              </div>
            </div>
          )}

          {/* Coordonnées vendeur sur une ligne, en bas */}
          <div style={sellerLineStyle}>
            <span style={sellerLineLabelStyle}>VOTRE INTERLOCUTEUR</span>
            <span style={sellerLineNameStyle}>{commercial.nom}</span>
            <span style={sellerLineSepStyle}>·</span>
            <span style={sellerLineItemStyle}>📞 {commercial.phone}</span>
            <span style={sellerLineSepStyle}>·</span>
            <span style={sellerLineItemStyle}>✉️ {commercial.email}</span>
          </div>

          <div style={footerStyle}>
            <div style={footerLineStyle}></div>
            <div style={footerContentStyle}>
              <span>84 Bd Courcerin, 77183 Croissy-Beaubourg</span>
              <span style={footerSepStyle}>·</span>
              <span style={footerSiteStyle}>delta-services.fr</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// =============== Sous-composants ===============

function SideBanner({ numero }: { numero: string }) {
  return (
    <div style={sideBannerStyle}>
      <div style={sideBannerTextStyle}>
        <div style={bannerWordStyle}>FICHE</div>
        <div style={bannerWordBigStyle}>D'OCCASION</div>
        <div style={bannerNumStyle}>N°{numero}</div>
      </div>
    </div>
  );
}

/**
 * Emplacement photo qui affiche la vraie photo détourée si disponible,
 * sinon un placeholder.
 */
function PhotoSlot({ label, src, caption = true }: { label: string; src?: string; caption?: boolean }) {
  if (src) {
    return (
      <div style={photoGridItemFilledStyle}>
        <img src={src} alt={label} style={photoGridImgStyle} />
        {caption && <div style={photoGridCaptionStyle}>{label}</div>}
      </div>
    );
  }
  return (
    <div style={photoGridItemStyle}>
      <div style={photoGridIconStyle}>📷</div>
      <div style={photoGridLabelStyle}>{label}</div>
      <div style={photoGridSubStyle}>Photo à venir</div>
    </div>
  );
}

// =============== STYLES ===============

const pageStyle: React.CSSProperties = {
  width: "794px",
  height: "1123px",
  background: "#ffffff",
  position: "relative",
  display: "flex",
  fontFamily: "Arial, sans-serif",
  color: "#1a2030",
  boxSizing: "border-box",
  overflow: "hidden",
};

const sideBannerStyle: React.CSSProperties = {
  width: "80px",
  background: "linear-gradient(180deg, #1a2a6e 0%, #2a3a8e 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
};

const sideBannerTextStyle: React.CSSProperties = {
  transform: "rotate(-90deg)",
  whiteSpace: "nowrap",
  color: "#ffffff",
  display: "flex",
  alignItems: "baseline",
  gap: "16px",
};

const bannerWordStyle: React.CSSProperties = {
  fontSize: "26px",
  fontWeight: 700,
  letterSpacing: "3px",
};

const bannerWordBigStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: 900,
  letterSpacing: "3px",
};

const bannerNumStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  letterSpacing: "2px",
  background: "rgba(255,255,255,0.15)",
  padding: "6px 12px",
  borderRadius: "4px",
};

const mainContentStyle: React.CSSProperties = {
  flex: 1,
  padding: "40px 50px",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "30px",
  marginBottom: "20px",
};

const headerPage2Style: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const logoStyle: React.CSSProperties = {
  height: "70px",
  width: "auto",
  flexShrink: 0,
};

const logoSmallStyle: React.CSSProperties = {
  height: "45px",
  width: "auto",
};

const pageRefStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#1a2a6e",
  letterSpacing: "1px",
};

const titleBlockStyle: React.CSSProperties = {
  flex: 1,
};

const titleStyle: React.CSSProperties = {
  fontSize: "28px",
  fontWeight: 900,
  color: "#1a2a6e",
  lineHeight: 1.1,
  letterSpacing: "0.5px",
  marginBottom: "4px",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#4a5468",
  letterSpacing: "0.5px",
};

const separatorStyle: React.CSSProperties = {
  height: "3px",
  background: "#c8102e",
  marginBottom: "24px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1fr",
  gap: "30px",
  flex: 1,
};

const photoMainStyle: React.CSSProperties = {
  width: "100%",
  height: "320px",
  background: "#f0f2f5",
  border: "2px dashed #c0c4ca",
  borderRadius: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const photoMainImgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  background: "#ffffff",
};

const photoPlaceholderStyle: React.CSSProperties = {
  textAlign: "center",
  color: "#6a7488",
};

const photoIconStyle: React.CSSProperties = {
  fontSize: "60px",
  marginBottom: "12px",
};

const photoLabelStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
};

const photoSubStyle: React.CSSProperties = {
  fontSize: "12px",
  fontStyle: "italic",
  marginTop: "4px",
};

const photoColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const photoBigStyle: React.CSSProperties = {
  height: "240px",
  display: "flex",
};

const photoRow2Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
  height: "120px",
};

const sellerLineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "10px",
  background: "#f3f5fb",
  border: "1px solid #d9deee",
  borderRadius: "8px",
  padding: "12px 18px",
  marginBottom: "16px",
};

const sellerLineLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "1px",
  color: "#c8102e",
};

const sellerLineNameStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 900,
  color: "#1a2a6e",
};

const sellerLineItemStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#1a2030",
};

const sellerLineSepStyle: React.CSSProperties = {
  color: "#c8102e",
  fontWeight: 700,
};

const page2BlockStyle: React.CSSProperties = {
  marginBottom: "24px",
};

const specsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const specBlockStyle: React.CSSProperties = {
  marginBottom: "4px",
};

const specTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 900,
  color: "#c8102e",
  letterSpacing: "1px",
  marginBottom: "6px",
};

const specListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};

const specItemStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#1a2030",
  lineHeight: 1.6,
};

const specListPlainStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};

const specItemPlainStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#1a2030",
  lineHeight: 1.5,
};

const specTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#1a2030",
  lineHeight: 1.5,
};

const priceBlockStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #1a2a6e 0%, #2a3a8e 100%)",
  color: "#ffffff",
  padding: "18px 30px",
  borderRadius: "8px",
  marginTop: "24px",
  marginBottom: "20px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  boxShadow: "0 4px 12px rgba(26, 42, 110, 0.25)",
};

const priceLabelStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 900,
  letterSpacing: "2px",
};

const priceValueStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: 900,
  letterSpacing: "1px",
  fontFamily: "Arial, sans-serif",
};

const priceUnitStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  opacity: 0.85,
};

const footerStyle: React.CSSProperties = {
  marginTop: "auto",
  paddingTop: "20px",
};

const footerLineStyle: React.CSSProperties = {
  height: "2px",
  background: "#c8102e",
  marginBottom: "12px",
};

const footerContentStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  fontSize: "12px",
  color: "#4a5468",
};

const footerSepStyle: React.CSSProperties = {
  color: "#c8102e",
  fontWeight: 700,
};

const footerSiteStyle: React.CSSProperties = {
  color: "#1a2a6e",
  fontWeight: 700,
};

// Page 2 — Grille photos
const photosGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gridTemplateRows: "1fr 1fr",
  gap: "20px",
  height: "550px",
  marginBottom: "30px",
};

const photoGridItemStyle: React.CSSProperties = {
  background: "#f0f2f5",
  border: "2px dashed #c0c4ca",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

const photoGridItemFilledStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d0d4da",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  position: "relative",
  minHeight: 0,
};

const photoGridImgStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  background: "#fafbfc",
};

const photoGridCaptionStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#1a2a6e",
  textAlign: "center",
  padding: "6px",
  background: "#f8f9fb",
  borderTop: "1px solid #e5e8ec",
  letterSpacing: "0.5px",
  textTransform: "uppercase",
};

const photoGridIconStyle: React.CSSProperties = {
  fontSize: "44px",
  marginBottom: "8px",
};

const photoGridLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#1a2a6e",
};

const photoGridSubStyle: React.CSSProperties = {
  fontSize: "11px",
  fontStyle: "italic",
  color: "#6a7488",
  marginTop: "4px",
};

// Page 2 — Bloc commercial
const commercialBlockStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, #f8f9fb 0%, #ffffff 100%)",
  border: "1px solid #d0d4da",
  borderLeft: "4px solid #c8102e",
  borderRadius: "6px",
  padding: "24px 30px",
  marginBottom: "20px",
};

const commercialTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 900,
  color: "#c8102e",
  letterSpacing: "2px",
  marginBottom: "12px",
};

const commercialNameStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: 900,
  color: "#1a2a6e",
  marginBottom: "16px",
  letterSpacing: "0.5px",
};

const commercialInfoStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const commercialRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const commercialIconStyle: React.CSSProperties = {
  fontSize: "18px",
};

const commercialValueStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#1a2030",
  fontWeight: 600,
};
