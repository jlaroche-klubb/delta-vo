import { DELTA_LOGO_BASE64 } from "../assets/deltaLogo";

export interface FicheExportData {
  reference?: string;
  workingHeight?: string;   // m
  outreach?: string;        // m
  basketPersons?: string;
  hours?: string;
  typeNacelle?: string;     // ex. "16 m"
  chassisModel?: string;    // porteur
  year?: string;
  mileage?: string;         // km
  interiorFitting?: string;
  options?: string[];
  price?: string;           // saisie libre (nombre ou texte)
  currency?: string;        // défaut "€"
  photos?: (string | undefined)[]; // [grande, petite1, petite2, petite3]
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

interface FicheExportTemplateProps {
  data: FicheExportData;
  /** id DOM utilisé pour la capture PDF (uniquement sur l'instance à capturer) */
  domId?: string;
}

function formatPrice(raw?: string): string | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw.replace(/[\s,]/g, ""));
  return Number.isFinite(n) && raw.replace(/[\s,]/g, "") !== ""
    ? n.toLocaleString("en-GB")
    : raw.trim();
}

export default function FicheExportTemplate({ data, domId }: FicheExportTemplateProps) {
  const ref = data.reference || "—";
  const photos = data.photos || [];
  const price = formatPrice(data.price);
  const currency = data.currency || "€";

  return (
    <div id={domId} style={pageStyle}>
      {/* Bandeau latéral */}
      <div style={sideBannerStyle}>
        <div style={sideBannerTextStyle}>
          <div style={bannerWordStyle}>USED</div>
          <div style={bannerWordBigStyle}>EQUIPMENT</div>
          <div style={bannerNumStyle}>REF {ref}</div>
        </div>
      </div>

      <div style={mainContentStyle}>
        <div style={headerStyle}>
          <img src={DELTA_LOGO_BASE64} alt="Delta Services" style={logoStyle} />
          <div style={titleBlockStyle}>
            <div style={titleStyle}>
              AERIAL WORK PLATFORM{data.workingHeight ? ` ${data.workingHeight} m` : ""}
            </div>
            <div style={subtitleStyle}>
              MOUNTED ON {(data.chassisModel || "").toUpperCase()}
            </div>
          </div>
        </div>

        <div style={separatorStyle}></div>

        <div style={gridStyle}>
          {/* 4 photos : 1 grande + 3 petites */}
          <div style={photoColStyle}>
            <div style={photoBigStyle}>
              <PhotoSlot label="Main view" src={photos[0]} />
            </div>
            <div style={photoRow3Style}>
              <PhotoSlot label="View 2" src={photos[1]} />
              <PhotoSlot label="View 3" src={photos[2]} />
              <PhotoSlot label="View 4" src={photos[3]} />
            </div>
          </div>

          <div style={specsStyle}>
            <div style={specBlockStyle}>
              <div style={specTitleStyle}>
                AERIAL WORK PLATFORM{data.typeNacelle ? ` ${data.typeNacelle}` : ""}
              </div>
              <ul style={specListStyle}>
                {data.workingHeight && (
                  <li style={specItemStyle}>
                    - Working height: <strong>{data.workingHeight} m</strong>
                  </li>
                )}
                {data.outreach && (
                  <li style={specItemStyle}>
                    - Working outreach: <strong>{data.outreach} m</strong>
                  </li>
                )}
                {data.basketPersons && (
                  <li style={specItemStyle}>
                    - Insulated basket:{" "}
                    <strong>
                      {data.basketPersons} person{data.basketPersons !== "1" ? "s" : ""}
                    </strong>
                  </li>
                )}
                {data.hours && (
                  <li style={specItemStyle}>
                    - Operating hours: <strong>{data.hours} h</strong>
                  </li>
                )}
              </ul>
            </div>

            <div style={specBlockStyle}>
              <div style={specTitleStyle}>CHASSIS</div>
              <ul style={specListStyle}>
                {data.chassisModel && (
                  <li style={specItemStyle}>
                    - Model: <strong>{data.chassisModel}</strong>
                  </li>
                )}
                {data.year && (
                  <li style={specItemStyle}>
                    - Year of registration: <strong>{data.year}</strong>
                  </li>
                )}
                {data.mileage && (
                  <li style={specItemStyle}>
                    - Mileage: <strong>{data.mileage} km</strong>
                  </li>
                )}
              </ul>
            </div>

            <div style={specBlockStyle}>
              <div style={specTitleStyle}>INTERIOR FITTING</div>
              <p style={specTextStyle}>{data.interiorFitting || "—"}</p>
            </div>

            <div style={specBlockStyle}>
              <div style={specTitleStyle}>OPTIONS</div>
              {data.options && data.options.filter((o) => o.trim()).length > 0 ? (
                <ul style={specListPlainStyle}>
                  {data.options
                    .filter((o) => o.trim())
                    .map((opt, idx) => (
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

        {price != null && (
          <div style={priceBlockStyle}>
            <div style={priceLabelStyle}>PRICE</div>
            <div style={priceValueStyle}>
              {price} {currency} <span style={priceUnitStyle}>excl. VAT</span>
            </div>
          </div>
        )}

        <div style={sellerLineStyle}>
          <span style={sellerLineLabelStyle}>YOUR CONTACT</span>
          {data.contactName && <span style={sellerLineNameStyle}>{data.contactName}</span>}
          {data.contactPhone && (
            <>
              <span style={sellerLineSepStyle}>·</span>
              <span style={sellerLineItemStyle}>📞 {data.contactPhone}</span>
            </>
          )}
          {data.contactEmail && (
            <>
              <span style={sellerLineSepStyle}>·</span>
              <span style={sellerLineItemStyle}>✉️ {data.contactEmail}</span>
            </>
          )}
        </div>

        <div style={footerStyle}>
          <div style={footerLineStyle}></div>
          <div style={footerContentStyle}>
            <span>84 Bd Courcerin, 77183 Croissy-Beaubourg — France</span>
            <span style={footerSepStyle}>·</span>
            <span style={footerSiteStyle}>delta-services.fr</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoSlot({ label, src }: { label: string; src?: string }) {
  if (src) {
    return (
      <div style={photoGridItemFilledStyle}>
        <img src={src} alt={label} style={photoGridImgStyle} />
      </div>
    );
  }
  return (
    <div style={photoGridItemStyle}>
      <div style={photoGridIconStyle}>📷</div>
      <div style={photoGridLabelStyle}>{label}</div>
      <div style={photoGridSubStyle}>Photo to come</div>
    </div>
  );
}

// =============== STYLES (alignés sur FicheVoTemplate) ===============

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

const logoStyle: React.CSSProperties = {
  height: "70px",
  width: "auto",
  flexShrink: 0,
};

const titleBlockStyle: React.CSSProperties = { flex: 1 };

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

const photoColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
};

const photoBigStyle: React.CSSProperties = {
  height: "240px",
  display: "flex",
};

const photoRow3Style: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "10px",
  height: "120px",
};

const specsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const specBlockStyle: React.CSSProperties = { marginBottom: "4px" };

const specTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 900,
  color: "#c8102e",
  letterSpacing: "1px",
  marginBottom: "6px",
};

const specListStyle: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };

const specItemStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#1a2030",
  lineHeight: 1.6,
};

const specListPlainStyle: React.CSSProperties = { listStyle: "none", padding: 0, margin: 0 };

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

const footerStyle: React.CSSProperties = { marginTop: "auto", paddingTop: "20px" };

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

const footerSepStyle: React.CSSProperties = { color: "#c8102e", fontWeight: 700 };

const footerSiteStyle: React.CSSProperties = { color: "#1a2a6e", fontWeight: 700 };

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

const photoGridIconStyle: React.CSSProperties = {
  fontSize: "34px",
  marginBottom: "6px",
};

const photoGridLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#1a2a6e",
};

const photoGridSubStyle: React.CSSProperties = {
  fontSize: "10px",
  fontStyle: "italic",
  color: "#6a7488",
  marginTop: "4px",
};
