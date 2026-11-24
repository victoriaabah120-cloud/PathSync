import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Loader from "./Loader.jsx";

// Only logged-in users can see pages inside this guard.
export function RequireAuth() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loader text="Loading PathSync..." />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile === null) return <Loader text="Loading your profile..." />;
  return <Outlet />;
}

// Only users who have chosen a career can see pages inside this guard.
export function RequireCareer() {
  const { profile } = useAuth();
  if (!profile?.career_field) return <Navigate to="/intent" replace />;
  return <Outlet />;
}
