import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Profile() {
  const { user, profile, signOut } = useAuth();
  return (
    <div className="stack">
      <h1>Profile</h1>
      <div className="card">
        <p className="muted small" style={{ margin: 0 }}>Name</p>
        <p>{profile.full_name || "Not set"}</p>
        <p className="muted small" style={{ margin: 0 }}>Email</p>
        <p>{user.email}</p>
        <p className="muted small" style={{ margin: 0 }}>Career</p>
        <p style={{ margin: 0 }}>{profile.specialization} ({profile.career_field})</p>
      </div>
      <Link to="/intent" className="btn btn-soft btn-block">Change career</Link>
      <p className="muted small">Changing career replaces your current lessons. Certificates you earned are kept.</p>
      <button className="btn btn-ghost btn-block" onClick={signOut}>Sign out</button>
    </div>
  );
}
