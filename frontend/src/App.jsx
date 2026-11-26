import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireCareer } from "./components/Guards.jsx";
import Layout from "./components/Layout.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { supabaseReady } from "./services/supabase.js";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import AuthCallback from "./pages/AuthCallback.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
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
import SchoolGate from "./pages/school/SchoolGate.jsx";
import AdminOverview from "./pages/school/AdminOverview.jsx";
import ScoreEntry from "./pages/school/ScoreEntry.jsx";
import TeacherDashboard from "./pages/school/TeacherDashboard.jsx";
import Compilation from "./pages/school/Compilation.jsx";
import Approvals from "./pages/school/Approvals.jsx";
import ReportCard from "./pages/school/ReportCard.jsx";
import CompilerOverview from "./pages/school/CompilerOverview.jsx";
import Subscription from "./pages/school/Subscription.jsx";
import StudentDashboard from "./pages/school/StudentDashboard.jsx";
import Manage from "./pages/school/Manage.jsx";
import CourseAssessment from "./pages/CourseAssessment.jsx";
import VerifyCertificate from "./pages/VerifyCertificate.jsx";

function SetupNotice() {
  return (
    <div className="min-h-screen flex items-center justify-center px-gutter bg-surface">
      <div className="max-w-md w-full bg-surface-container-lowest rounded-2xl p-space-md shadow-md">
        <h1 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-2">PathSync needs its keys</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Create <code className="bg-surface-container px-1 rounded">frontend/.env</code> from{" "}
          <code className="bg-surface-container px-1 rounded">.env.example</code>, fill in{" "}
          <code className="bg-surface-container px-1 rounded">VITE_SUPABASE_URL</code> and{" "}
          <code className="bg-surface-container px-1 rounded">VITE_SUPABASE_ANON_KEY</code>, then restart{" "}
          <code className="bg-surface-container px-1 rounded">npm run dev</code>.
        </p>
      </div>
    </div>
  );
}

// A password recovery link lands on the site root with a recovery session,
// so send the user to the screen where they can set a new password.
function RecoveryRedirect({ children }) {
  const { recovery } = useAuth();
  if (recovery) return <Navigate to="/reset-password" replace />;
  return children;
}

export default function App() {
  if (!supabaseReady) return <SetupNotice />;

  return (
    <RecoveryRedirect>
      <Routes>
        {/* Public welcome page. Signed-in visitors are sent on to the app. */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Public: a confirmation link can land here if the redirect is set to /auth/callback. */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        {/* Public: anyone holding a certificate ID can check it. */}
        <Route path="/verify" element={<VerifyCertificate />} />
        <Route path="/verify/:code" element={<VerifyCertificate />} />

        <Route element={<RequireAuth />}>
          <Route element={<Layout bar="none" mainClass="pt-2 pb-margin-lg" />}>
            <Route path="/intent" element={<CareerIntent />} />
          </Route>

          <Route element={<Layout bar="none" mainClass="pt-2 pb-8" />}>
            <Route path="/assessment" element={<Assessment />} />
            <Route path="/setup" element={<Setup />} />
          </Route>

          <Route element={<Layout bar="back" title="Career Path Overview" mainClass="pt-16 pb-safe" />}>
            <Route path="/categories" element={<Categories />} />
            <Route path="/specializations/:fieldId" element={<Specializations />} />
          </Route>

          {/* School accounts are not learners: they must reach the compiler without a
              career field, so these routes sit outside the career guard. */}
          <Route
            element={<Layout bar="back" title="School Result Compiler" back="/school" home="/school" mainClass="pt-16 pb-8" />}
          >
            <Route path="/school" element={<SchoolGate />} />
            <Route path="/school/admin" element={<AdminOverview />} />
            <Route path="/school/teacher" element={<TeacherDashboard />} />
            <Route path="/school/compiler" element={<CompilerOverview />} />
            <Route path="/school/compile/:classId" element={<Compilation />} />
            <Route path="/school/approvals" element={<Approvals />} />
            <Route path="/school/approvals/:classId" element={<Approvals />} />
            <Route path="/school/report/:studentId" element={<ReportCard />} />
            <Route path="/school/subscription" element={<Subscription />} />
            <Route path="/schools/subscription" element={<Subscription />} />
            <Route path="/school/student" element={<StudentDashboard />} />
            <Route path="/school/manage" element={<Manage />} />
          </Route>

          <Route element={<Layout bar="none" mainClass="pt-2 pb-8" />}>
            <Route path="/school/sheet/:sheetId" element={<ScoreEntry />} />
          </Route>

          <Route element={<RequireCareer />}>
            <Route element={<Layout nav />}>
              <Route path="/home" element={<Home />} />
              <Route path="/learn" element={<Learn />} />
              <Route path="/certificates" element={<Certificates />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/profile" element={<Profile />} />
            </Route>

            <Route element={<Layout bar="back" title="Skill Module Detail" back="/learn" mainClass="pt-16 pb-8" width="wide" />}>
              <Route path="/lesson/:id" element={<Lesson />} />
            </Route>


            <Route element={<Layout bar="none" mainClass="pt-4 pb-8" />}>
              <Route path="/course-assessment" element={<CourseAssessment />} />
              <Route path="/quiz/:id" element={<Quiz />} />
              <Route path="/certificate/:id" element={<Certificate />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </RecoveryRedirect>
  );
}
