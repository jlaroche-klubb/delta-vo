import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { LOCALITES } from "../utils/localites";
import {
  chargerConfigNotifPrepa,
  enregistrerConfigNotifPrepa,
  parseEmails,
  type NotifPrepaConfig,
} from "../services/preparationNotify";
import { useTranslation } from "react-i18next";

interface PendingUser {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  role: string;
  createdAt: string;
  activatedAt?: string;
}

type UserRole = "superadmin" | "admin" | "secretaire" | "vendeur_fr" | "dealer" | "chef" | "atelier";

export default function AdminPage() {
  const { user, profile } = useAuth();
  const { t } = useTranslation();
  // 🔒 Seul le propriétaire du compte peut approuver/rejeter les nouveaux entrants.
  // (Les autres admins gèrent les rôles des utilisateurs existants, mais pas les arrivées.)
  const OWNER_EMAIL = "jlaroche@klubb.com";
  const isOwner = (user?.email || "").trim().toLowerCase() === OWNER_EMAIL;
  const ROLES: { value: UserRole; label: string }[] = [
    { value: "superadmin", label: t("admin.roleSuperAdmin") },
    { value: "admin", label: t("admin.roleAdmin") },
    { value: "secretaire", label: t("admin.roleSecretary") },
    { value: "vendeur_fr", label: t("admin.roleSalesFr") },
    { value: "dealer", label: t("admin.roleDealer") },
    { value: "chef", label: t("admin.roleChef") },
    { value: "atelier", label: t("admin.roleWorkshop") },
  ];

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Record<string, UserRole>>({});
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // 📧 Préparateurs par site (notification automatique à la mise en préparation)
  const [notifCfg, setNotifCfg] = useState<NotifPrepaConfig | null>(null);
  const [notifText, setNotifText] = useState<Record<string, string>>({});
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifDirty, setNotifDirty] = useState(false);

  useEffect(() => {
    chargerConfigNotifPrepa()
      .then((cfg) => {
        setNotifCfg(cfg);
        const txt: Record<string, string> = {};
        for (const site of LOCALITES) txt[site] = (cfg.sites[site] || []).join("\n");
        setNotifText(txt);
      })
      .catch((e) => console.warn("Config notif préparateurs illisible :", e));
  }, []);

  async function saveNotifCfg() {
    const sites: Record<string, string[]> = {};
    const invalides: string[] = [];
    for (const site of LOCALITES) {
      const r = parseEmails(notifText[site] || "");
      sites[site] = r.ok;
      invalides.push(...r.invalides);
    }
    if (invalides.length) {
      alert(t("notifPrepa.emailsInvalides", { list: invalides.join(", ") }));
      return;
    }
    setNotifSaving(true);
    try {
      const par = profile ? `${profile.prenom} ${profile.nom}`.trim() : user?.email || "";
      await enregistrerConfigNotifPrepa({ sites }, par);
      setNotifCfg({ sites });
      const txt: Record<string, string> = {};
      for (const site of LOCALITES) txt[site] = sites[site].join("\n");
      setNotifText(txt);
      setNotifDirty(false);
      alert("✅ " + t("notifPrepa.saved"));
    } catch (err: any) {
      console.error("Erreur config notif préparateurs:", err);
      alert("❌ Erreur: " + err.message);
    } finally {
      setNotifSaving(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Load pending users
      const pendingSnap = await getDocs(collection(db, "pending_users"));
      const pending = pendingSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PendingUser[];

      // Load active users
      const usersSnap = await getDocs(collection(db, "users"));
      const activeUsers = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];

      // ⚠️ Un utilisateur déjà actif (présent dans "users") ne doit pas rester
      // dans la liste d'attente. On filtre par email, et on nettoie les docs
      // "pending_users" devenus obsolètes (doublons).
      const activeEmails = new Set(
        activeUsers.map(u => (u.email || "").trim().toLowerCase())
      );
      const stillPending = pending.filter(
        u => !activeEmails.has((u.email || "").trim().toLowerCase())
      );
      const stalePending = pending.filter(
        u => activeEmails.has((u.email || "").trim().toLowerCase())
      );
      // Suppression best-effort des doublons (déjà actifs)
      for (const u of stalePending) {
        try {
          await deleteDoc(doc(db, "pending_users", u.id));
        } catch (e) {
          console.warn("Nettoyage pending impossible:", u.id, e);
        }
      }

      setPendingUsers(stillPending);
      setUsers(activeUsers);

      // Initialize default roles for pending users
      const defaultRoles: Record<string, UserRole> = {};
      stillPending.forEach(u => {
        defaultRoles[u.id] = "atelier";
      });
      setSelectedRole(defaultRoles);
    } catch (err) {
      console.error("Erreur chargement:", err);
      alert("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  }

  async function approveUser(pending: PendingUser) {
    if (!isOwner) {
      alert("🔒 Seul Jonathan peut approuver un nouvel utilisateur.");
      return;
    }
    const role = selectedRole[pending.id];
    if (!role) return;

    const confirmed = window.confirm(
      `Approuver ${pending.prenom} ${pending.nom} comme ${ROLES.find(r => r.value === role)?.label} ?`
    );
    if (!confirmed) return;

    try {
      // Update pending_users with the role (so it can be migrated on next login)
      await updateDoc(doc(db, "pending_users", pending.id), {
        role: role,
        approvedAt: new Date().toISOString(),
      });

      alert("✅ Utilisateur approuvé ! Il pourra se connecter à sa prochaine connexion.");
      loadData();
    } catch (err: any) {
      console.error("Erreur approbation:", err);
      alert("❌ Erreur: " + err.message);
    }
  }

  async function deleteUser(userId: string, isPending: boolean) {
    if (isPending && !isOwner) {
      alert("🔒 Seul Jonathan peut refuser/supprimer un nouvel entrant.");
      return;
    }
    const user = isPending 
      ? pendingUsers.find(u => u.id === userId)
      : users.find(u => u.id === userId);
    
    if (!user) return;

    const confirmed = window.confirm(
      `Supprimer définitivement ${user.prenom} ${user.nom} ?`
    );
    if (!confirmed) return;

    try {
      const collectionName = isPending ? "pending_users" : "users";
      await deleteDoc(doc(db, collectionName, userId));
      alert("✅ Utilisateur supprimé");
      loadData();
    } catch (err: any) {
      console.error("Erreur suppression:", err);
      alert("❌ Erreur: " + err.message);
    }
  }

  async function updateUserRole(user: User, newRole: UserRole) {
    try {
      await updateDoc(doc(db, "users", user.id), {
        role: newRole,
        updatedAt: new Date().toISOString(),
      });
      alert("✅ Rôle mis à jour");
      setEditingUser(null);
      loadData();
    } catch (err: any) {
      console.error("Erreur mise à jour:", err);
      alert("❌ Erreur: " + err.message);
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <h1>⚙️ {t("admin.title")}</h1>
        <div className="loading">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>⚙️ {t("admin.title")}</h1>
      </div>

      {/* PENDING USERS */}
      <section className="admin-section">
        <div className="section-header">
          <h2>
            ⏳ {t("admin.pendingTitle")}
            <span className="section-count">{pendingUsers.length}</span>
          </h2>
          <p className="section-desc">
            {t("admin.pendingDesc")}
          </p>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="empty-state">{t("admin.noPending")}</div>
        ) : (
          <div className="admin-list">
            {pendingUsers.map(user => (
              <div key={user.id} className="admin-card pending-card">
                <div className="admin-card-header">
                  <div>
                    <div className="admin-user-name">
                      {user.prenom} {user.nom}
                    </div>
                    <div className="admin-user-email">{user.email}</div>
                  </div>
                  <div className="admin-user-date">
                    {t("admin.requestedOn")} {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="admin-card-actions">
                  {isOwner ? (
                    <>
                      <select
                        className="role-select"
                        value={selectedRole[user.id] || "atelier"}
                        onChange={(e) => setSelectedRole({
                          ...selectedRole,
                          [user.id]: e.target.value as UserRole
                        })}
                      >
                        {ROLES.map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      <button
                        className="btn-approve"
                        onClick={() => approveUser(user)}
                      >
                        ✅ {t("admin.approve")}
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => deleteUser(user.id, true)}
                      >
                        🗑️
                      </button>
                    </>
                  ) : (
                    <span className="section-desc" style={{ fontStyle: "italic" }}>
                      🔒 {t("admin.ownerOnly")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 📧 PRÉPARATEURS PAR SITE */}
      <section className="admin-section">
        <div className="section-header">
          <h2>📧 {t("notifPrepa.adminTitle")}</h2>
          <p className="section-desc">{t("notifPrepa.adminDesc")}</p>
        </div>
        {!notifCfg ? (
          <div className="loading">{t("common.loading")}</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
              {LOCALITES.map((site) => {
                const n = parseEmails(notifText[site] || "").ok.length;
                return (
                  <div key={site} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontWeight: 700, color: "#1a2a6e" }}>
                      📍 {site}{" "}
                      <span className="section-count" style={{ background: n ? undefined : "#c0392b" }}>{n}</span>
                    </label>
                    <textarea
                      value={notifText[site] || ""}
                      onChange={(e) => { setNotifText({ ...notifText, [site]: e.target.value }); setNotifDirty(true); }}
                      rows={4}
                      placeholder={t("notifPrepa.placeholder")}
                      style={{ width: "100%", boxSizing: "border-box", padding: 8, border: "1px solid #ccd", borderRadius: 6, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="admin-card-actions" style={{ marginTop: 14 }}>
              <button className="btn-approve" onClick={saveNotifCfg} disabled={notifSaving || !notifDirty}>
                {notifSaving ? "…" : `💾 ${t("notifPrepa.save")}`}
              </button>
              {notifDirty && <span className="section-desc" style={{ fontStyle: "italic" }}>{t("notifPrepa.unsaved")}</span>}
            </div>
          </>
        )}
      </section>

      {/* ACTIVE USERS */}
      <section className="admin-section">
        <div className="section-header">
          <h2>
            ✅ {t("admin.activeTitle")}
            <span className="section-count">{users.length}</span>
          </h2>
        </div>

        <div className="admin-list">
          {users.map(user => (
            <div key={user.id} className="admin-card">
              <div className="admin-card-header">
                <div>
                  <div className="admin-user-name">
                    {user.prenom} {user.nom}
                  </div>
                  <div className="admin-user-email">{user.email}</div>
                </div>
                <div className="admin-user-badge">
                  {ROLES.find(r => r.value === user.role)?.label || user.role}
                </div>
              </div>
              
              {editingUser?.id === user.id ? (
                <div className="admin-card-actions">
                  <select
                    className="role-select"
                    defaultValue={user.role}
                    onChange={(e) => updateUserRole(user, e.target.value as UserRole)}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary"
                    onClick={() => setEditingUser(null)}
                  >
                    {t("admin.cancel")}
                  </button>
                </div>
              ) : (
                <div className="admin-card-actions">
                  <button
                    className="btn-edit"
                    onClick={() => setEditingUser(user)}
                  >
                    ✏️ {t("admin.editRole")}
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => deleteUser(user.id, false)}
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
