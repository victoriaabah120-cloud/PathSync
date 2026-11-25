import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Loader from "./Loader.jsx";

// Supabase normally refuses to create a session until the email is confirmed,
// so this is a safety net for projects where confirmation is switched off and
// then on again: an unconfirmed account never reaches a protected page.
export function isEmailConfirmed(user) {
  if (!user) return false;
  if (user.email_confirmed_at || user.confirmed_at) return true;
  // Phone-only or provider accounts have no email to confirm.
  if (!user.email) return true;
  return false;
}

// Only logged-in users can see pages inside this guard.
export function RequireAuth() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loader text="Loading PathSync..." />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isEmailConfirmed(session.user)) return <Navigate to="/verify-email" replace />;
  if (profile === null) return <Loader text="Loading your profile..." />;
  return <Outlet />;
}

// Only users who have chosen a career can see pages inside this guard.
export function RequireCareer() {
  const { profile } = useAuth();
  if (!profile?.career_field) return <Navigate to="/intent" replace />;
  return <Outlet />;
}
