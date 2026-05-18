import { useState, useEffect } from "react";
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

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

type UserRole = "admin" | "secretaire" | "vendeur_fr" | "dealer" | "chef" | "atelier";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "👑 Administrateur" },
  { value: "secretaire", label: "📋 Secrétaire / ADV" },
  { value: "vendeur_fr", label: "🇫🇷 Vendeur France" },
  { value: "dealer", label: "🌍 Dealer Export" },
  { value: "chef", label: "👔 Chef d'équipe" },
  { value: "atelier", label: "🔧 Atelier" },
];

export default function AdminPage() {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Record<string, UserRole>>({});
  const [editingUser, setEditingUser] = useState<User | null>(null);

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

      setPendingUsers(pending);
      setUsers(activeUsers);

      // Initialize default roles for pending users
      const defaultRoles: Record<string, UserRole> = {};
      pending.forEach(u => {
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
        <h1>⚙️ Administration</h1>
        <div className="loading">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>⚙️ Administration</h1>
      </div>

      {/* PENDING USERS */}
      <section className="admin-section">
        <div className="section-header">
          <h2>
            ⏳ En attente d'approbation
            <span className="section-count">{pendingUsers.length}</span>
          </h2>
          <p className="section-desc">
            Ces personnes ont tenté de se connecter mais n'ont pas encore été approuvées
          </p>
        </div>

        {pendingUsers.length === 0 ? (
          <div className="empty-state">Aucun utilisateur en attente</div>
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
                    Demande le {new Date(user.createdAt).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="admin-card-actions">
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
                    ✅ Approuver
                  </button>
                  <button
                    className="btn-delete"
                    onClick={() => deleteUser(user.id, true)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ACTIVE USERS */}
      <section className="admin-section">
        <div className="section-header">
          <h2>
            ✅ Utilisateurs actifs
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
                    Annuler
                  </button>
                </div>
              ) : (
                <div className="admin-card-actions">
                  <button
                    className="btn-edit"
                    onClick={() => setEditingUser(user)}
                  >
                    ✏️ Modifier rôle
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
