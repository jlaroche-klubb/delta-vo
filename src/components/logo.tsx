interface LogoProps {
  variant?: "full" | "compact";
  showSubtitle?: boolean;
  className?: string;
  theme?: "dark" | "light";
}

export default function Logo({ 
  variant = "full", 
  showSubtitle = true, 
  className = "",
  theme = "dark"
}: LogoProps) {
  const isDark = theme === "dark";
  const textColor = isDark ? "#fff" : "#1A2A6E";
  const subtitleColor = isDark ? "rgba(255, 255, 255, 0.7)" : "rgba(26, 42, 110, 0.6)";
  
  return (
    <div className={`delta-logo ${variant} ${className}`}>
      <div className="logo-icon">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Triangle Delta stylisé */}
          <path
            d="M20 5 L35 32 L5 32 Z"
            fill="url(#gradient)"
            stroke="#C8102E"
            strokeWidth="2"
          />
          {/* Détails internes pour effet "plateforme élévatrice" */}
          <line x1="20" y1="15" x2="20" y2="28" stroke="#C8102E" strokeWidth="1.5" />
          <rect x="16" y="25" width="8" height="4" fill="#C8102E" rx="1" />
          
          {/* Dégradé */}
          <defs>
            <linearGradient id="gradient" x1="20" y1="5" x2="20" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1A2A6E" />
              <stop offset="100%" stopColor="#0F1A3E" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="logo-text">
        <div className="logo-main">
          <span className="logo-delta" style={{ color: textColor }}>DELTA</span>
          <span className="logo-vo">VO</span>
        </div>
        {showSubtitle && <div className="logo-subtitle" style={{ color: subtitleColor }}>Nacelles d'occasion</div>}
      </div>
    </div>
  );
}
