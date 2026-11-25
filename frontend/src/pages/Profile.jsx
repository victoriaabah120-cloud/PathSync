import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Icon from "../components/Icon.jsx";

function initials(name, email) {
  const source = (name || email || "").trim();
  if (!source) return "PS";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return source.slice(0, 2);
}

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  return (
    <div className="stack" style={{ marginTop: -4 }}>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="avatar lg">{initials(profile.full_name, user.email)}</div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{profile.full_name || "Your profile"}</h2>
          <p className="muted small" style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</p>
        </div>
      </div>

      <div>
        <div className="section-title"><h3>Account</h3></div>
        <div className="card" style={{ padding: "4px 16px" }}>
          <div className="list-row">
            <Icon name="person" size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Name</p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem" }}>{profile.full_name || "Not set"}</p>
            </div>
          </div>
          <div className="list-row">
            <Icon name="mail" size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Email</p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</p>
            </div>
          </div>
          <div className="list-row">
            <Icon name="school" size={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="muted small" style={{ margin: 0 }}>Career</p>
              <p style={{ margin: 0, fontWeight: 600, fontSize: "0.88rem" }}>{profile.specialization}</p>
              <p className="muted small" style={{ margin: 0 }}>{profile.career_field}</p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="section-title"><h3>Learning</h3></div>
        <Link to="/intent" className="card card-link" style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit" }}>
          <div className="tile-icon" style={{ margin: 0, width: 34, height: 34, flex: "none" }}>
            <Icon name="refresh" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem" }}>Change career</p>
            <p className="muted small" style={{ margin: 0 }}>Starts a new path. Certificates you earned are kept.</p>
          </div>
          <Icon name="chevron" size={18} />
        </Link>
        <Link to="/certificates" className="card card-link" style={{ display: "flex", alignItems: "center", gap: 12, color: "inherit", marginTop: 10 }}>
          <div className="tile-icon" style={{ margin: 0, width: 34, height: 34, flex: "none" }}>
            <Icon name="award" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "0.88rem" }}>My certificates</p>
            <p className="muted small" style={{ margin: 0 }}>Every lesson you have passed</p>
          </div>
          <Icon name="chevron" size={18} />
        </Link>
      </div>

      <button className="btn btn-ghost btn-block" onClick={signOut} style={{ marginTop: 6 }}>
        <Icon name="logout" size={18} />
        Sign out
      </button>
    </div>
  );
}
