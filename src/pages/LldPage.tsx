import { useEffect, useMemo, useState } from "react";
import type { UserRole } from "../types";
import { canEditClientsLld, canManageOffresLld, canViewBanqueLld } from "../utils/permissions";
import ClientsLld from "../components/lld/ClientsLld";
import OffresLld from "../components/lld/OffresLld";
import ContratsLld from "../components/lld/ContratsLld";

/**
 * 📄 Onglet LLD — locations longue durée (cahier des charges Jonathan 05/11/2026).
 * Lot 1 : mémoire client · lot 2 : offres (Jonathan) · lot 3 : contrats
 * (Jonathan gère, assistantes consultent, commerciaux voient les leurs).
 * Lot 5 : À affecter (assistantes).
 */
interface Props {
  userRole: UserRole;
  userName: string;
  userEmail: string;
}

type Onglet = "offres" | "contrats" | "affecter" | "clients";

export default function LldPage({ userRole, userName, userEmail }: Props) {
  const estJonathan = canManageOffresLld(userRole);
  const onglets = useMemo<{ id: Onglet; label: string; dispo: boolean }[]>(() => [
    ...(estJonathan ? [{ id: "offres" as Onglet, label: "Offres", dispo: true }] : []),
    { id: "contrats", label: "Contrats", dispo: true },
    ...(canEditClientsLld(userRole) ? [{ id: "affecter" as Onglet, label: "À affecter", dispo: false }] : []),
    { id: "clients", label: "Clients", dispo: true },
  ], [estJonathan, userRole]);
  const [onglet, setOnglet] = useState<Onglet>(estJonathan ? "offres" : "clients");
  useEffect(() => { if (!onglets.some((o) => o.id === onglet && o.dispo)) setOnglet("clients"); }, [onglets, onglet]);

  return (
    <div className="page" style={{ padding: "16px 20px 40px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 24, color: "#1a2a6e" }}>Locations longue durée</h1>
        <span style={{ fontSize: 12, color: "#777" }}>Signature des contrats et affectation des nacelles arrivent aux lots suivants.</span>
      </div>
      <div role="tablist" aria-label="Sections LLD" style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "2px solid #dfe4ec", marginBottom: 16 }}>
        {onglets.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={onglet === o.id} disabled={!o.dispo} onClick={() => setOnglet(o.id)}
            title={o.dispo ? undefined : "Bientôt (lot suivant)"}
            style={{ background: onglet === o.id ? "white" : "transparent", border: "none", borderBottom: `3px solid ${onglet === o.id ? "#1a73e8" : "transparent"}`, marginBottom: -2, padding: "10px 14px", fontSize: 14, fontWeight: onglet === o.id ? 700 : 600, color: !o.dispo ? "#aab2c0" : onglet === o.id ? "#1a2a6e" : "#4a5465", cursor: o.dispo ? "pointer" : "default" }}>
            {o.label}{!o.dispo ? " · bientôt" : ""}
          </button>
        ))}
      </div>
      {onglet === "offres" && estJonathan && <OffresLld userName={userName} userEmail={userEmail} />}
      {onglet === "contrats" && <ContratsLld userName={userName} userEmail={userEmail} peutGerer={estJonathan} voitTout={canEditClientsLld(userRole)} />}
      {onglet === "clients" && (
        <ClientsLld userName={userName} userEmail={userEmail} peutModifier={canEditClientsLld(userRole)} voitBanque={canViewBanqueLld(userRole)} />
      )}
    </div>
  );
}
