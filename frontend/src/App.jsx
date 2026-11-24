import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireCareer } from "./components/Guards.jsx";
import Layout from "./components/Layout.jsx";
import { supabaseReady } from "./services/supabase.js";

import Login from "./pages/Login.jsx";
import CareerIntent from "./pages/CareerIntent.jsx";
import Assessment from "./pages/Assessment.jsx";
import Categories from "./pages/Categories.jsx";
import Specializations from "./pages/Specializations.jsx";
import Setup from "./pages/Setup.jsx";
import Home from "./pages/Home.jsx";
import Learn from "./pages/Learn.jsx";
import Lesson from "./pages/Lesson.jsx";
import Quiz from "./pages/Quiz.jsx";
import Certificate from "./pages/Certificate.jsx";
import Certificates from "./pages/Certificates.jsx";
import Coach from "./pages/Coach.jsx";
import Profile from "./pages/Profile.jsx";

function SetupNotice() {
  return (
    <div className="app">
      <main className="screen">
        <h1>PathSync needs its keys</h1>
        <p>
          Create <code>frontend/.env</code> from <code>.env.example</code>, fill in
          <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart
          <code> npm run dev</code>.
        </p>
      </main>
    </div>
  );
}

export default function App() {
  if (!supabaseReady) return <SetupNotice />;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/intent" element={<CareerIntent />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/specializations/:fieldId" element={<Specializations />} />
          <Route path="/setup" element={<Setup />} />
        </Route>

        <Route element={<RequireCareer />}>
          <Route element={<Layout nav />}>
            <Route path="/home" element={<Home />} />
            <Route path="/learn" element={<Learn />} />
            <Route path="/certificates" element={<Certificates />} />
            <Route path="/coach" element={<Coach />} />
            <Route path="/profile" element={<Profile />} />
          </Route>

          <Route element={<Layout />}>
            <Route path="/lesson/:id" element={<Lesson />} />
            <Route path="/quiz/:id" element={<Quiz />} />
            <Route path="/certificate/:id" element={<Certificate />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
