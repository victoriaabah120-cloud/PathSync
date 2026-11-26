import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { supabase } from "../services/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";

const GOAL_KEY = "pathsync.dailyGoal";
const GOALS = [10, 15, 30, 45];

function initials(name, email) {
  const source = (name || email || "").trim();
  if (!source) return "PS";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`;
  return source.slice(0, 2);
}

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { preference, setTheme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.full_name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [goal, setGoal] = useState(() => Number(localStorage.getItem(GOAL_KEY)) || 15);
  const [goalOpen, setGoalOpen] = useState(false);
  const [stats, setStats] = useState({ completed: 0, certificates: 0, streak: 0 });

  useEffect(() => {
    async function load() {
      const { data: lessons } = await supabase
        .from("user_lessons")
        .select("status,completed_at")
        .eq("user_id", user.id);
      const { count } = await supabase
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      const rows = lessons || [];
      const days = [...new Set(rows.filter((l) => l.completed_at).map((l) => new Date(l.completed_at).toDateString()))];
      setStats({
        completed: rows.filter((l) => l.status === "completed").length,
        certificates: count || 0,
        streak: days.length ? Math.min(days.length, 1) : 0,
      });
    }
    load();
  }, [user.id]);

  async function saveName(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() })
        .eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      setError(err.message || "We could not save your name.");
    } finally {
      setSaving(false);
    }
  }

  function chooseGoal(value) {
    setGoal(value);
    localStorage.setItem(GOAL_KEY, String(value));
    setGoalOpen(false);
  }

  const providers = user.app_metadata?.providers || [user.app_metadata?.provider || "email"];

  return (
    <div className="flex flex-col w-full pb-8 space-y-4">
      <div className="flex items-center justify-between pt-1">
        <div>
          <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider font-semibold">Learner Workspace</span>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold text-on-surface">Profile &amp; Settings</h1>
        </div>
        <div className="flex items-center gap-1.5 bg-surface-container-high px-2.5 py-1 rounded-full text-on-surface-variant shadow-sm">
          <span className="material-symbols-outlined text-[16px] text-secondary">verified</span>
          <span className="font-label-sm text-label-sm">Active Member</span>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm relative overflow-hidden flex flex-col space-y-4">
        <div className="absolute -right-10 -top-10 w-36 h-36 bg-secondary/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-space-md relative z-10">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-sm bg-secondary-fixed flex items-center justify-center">
              <span className="font-headline-sm text-headline-sm font-bold text-secondary">
                {initials(profile.full_name, user.email)}
              </span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-on-secondary shadow-sm">
              <span className="material-symbols-outlined text-[12px]">bolt</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface truncate">
                {profile.full_name || "Your profile"}
              </h2>
              <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">{user.email}</p>
            <div className="mt-1.5 flex items-center">
              <span className="inline-flex items-center gap-1 bg-surface-container text-secondary font-label-sm text-label-sm font-semibold px-2.5 py-0.5 rounded-full shadow-sm">
                <span className="material-symbols-outlined text-[14px]">architecture</span>
                {profile.specialization}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 bg-surface-container-low rounded-xl p-2.5 text-center">
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant">Day Streak</p>
            <div className="flex items-center justify-center gap-1 text-on-surface font-headline-sm text-headline-sm font-bold">
              <span className="material-symbols-outlined text-secondary text-[18px]">local_fire_department</span>
              <span>{stats.streak}</span>
            </div>
          </div>
          <div className="bg-surface-container-lowest/60 rounded-lg">
            <p className="font-label-sm text-label-sm text-on-surface-variant">Completed</p>
            <div className="flex items-center justify-center gap-1 text-on-surface font-headline-sm text-headline-sm font-bold">
              <span className="material-symbols-outlined text-secondary text-[18px]">task_alt</span>
              <span>{stats.completed}</span>
            </div>
          </div>
          <div>
            <p className="font-label-sm text-label-sm text-on-surface-variant">Certificates</p>
            <div className="flex items-center justify-center gap-1 text-on-surface font-headline-sm text-headline-sm font-bold">
              <span className="material-symbols-outlined text-secondary text-[18px]">military_tech</span>
              <span>{stats.certificates}</span>
            </div>
          </div>
        </div>

        {editing ? (
          <form className="flex flex-col gap-2" onSubmit={saveName}>
            <label className="font-label-md text-label-md text-on-surface font-semibold" htmlFor="profile-name">
              Your name
            </label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              className="w-full h-12 px-4 bg-surface-container-lowest text-on-surface rounded-xl font-body-md text-body-md shadow-sm outline-none focus:bg-surface-container-low transition-colors"
            />
            {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setEditing(false); setName(profile.full_name || ""); setError(""); }}
                className="h-11 rounded-xl bg-surface-container text-on-surface font-label-lg text-label-lg font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="h-11 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-semibold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full h-11 bg-surface-container-high hover:bg-surface-container text-on-surface rounded-xl font-label-lg text-label-lg font-semibold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
          >
            <span className="material-symbols-outlined text-[18px]">edit</span>
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Appearance</h3>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Saved on this device</span>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm">
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Theme">
            {[
              { id: "light", label: "Light", icon: "light_mode" },
              { id: "dark", label: "Dark", icon: "dark_mode" },
              { id: "system", label: "System", icon: "contrast" },
            ].map((option) => {
              const active = preference === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id)}
                  aria-pressed={active}
                  aria-label={`${option.label} theme`}
                  data-theme-option={option.id}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl font-label-md text-label-md font-semibold transition-colors ${
                    active
                      ? "bg-secondary text-on-secondary shadow-sm"
                      : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px]">{option.icon}</span>
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Learning Preferences</h3>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Customized for you</span>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm space-y-3">
          <div className="p-2.5 rounded-xl">
            <button
              type="button"
              onClick={() => setGoalOpen((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[20px]">timer</span>
                </div>
                <div>
                  <p className="font-label-lg text-label-lg font-bold text-on-surface">Daily Learning Goal</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">Paced for steady retention</p>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-surface-container text-secondary px-3 py-1 rounded-full font-label-md text-label-md font-bold shrink-0">
                <span>{goal} mins / day</span>
                <span className="material-symbols-outlined text-[16px]">edit</span>
              </div>
            </button>
            {goalOpen && (
              <div className="flex flex-wrap gap-2 mt-3 pl-13">
                {GOALS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseGoal(value)}
                    className={`px-3 py-1.5 rounded-full font-label-md text-label-md font-semibold transition-colors ${
                      goal === value ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {value} mins
                  </button>
                ))}
              </div>
            )}
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-2 pl-13">Saved on this device</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Account &amp; System</h3>
          <span className="font-label-sm text-label-sm text-on-surface-variant">Sync status: Active</span>
        </div>
        <div className="bg-surface-container-lowest rounded-2xl p-space-md shadow-sm space-y-1">
          <div className="w-full flex items-center justify-between p-2.5 rounded-xl text-left">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[20px]">link</span>
              </div>
              <div className="truncate">
                <p className="font-label-lg text-label-lg font-bold text-on-surface">Linked Accounts</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Single sign-on provider</p>
              </div>
            </div>
            <span className="font-label-sm text-label-sm font-medium text-secondary bg-surface-container px-2 py-0.5 rounded-md shrink-0">
              {providers.map((p) => (p === "email" ? "Email" : p === "google" ? "Google" : p)).join(", ")} (Connected)
            </span>
          </div>

          <Link to="/intent" className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-low transition-colors text-left group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-secondary transition-colors">
                <span className="material-symbols-outlined text-[20px]">psychology_alt</span>
              </div>
              <div className="truncate">
                <p className="font-label-lg text-label-lg font-bold text-on-surface">Career Interests &amp; Reset</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Retake diagnostic roadmap test</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
          </Link>

          <Link to="/school" className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-low transition-colors text-left group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-secondary transition-colors">
                <span className="material-symbols-outlined text-[20px]">school</span>
              </div>
              <div className="truncate">
                <p className="font-label-lg text-label-lg font-bold text-on-surface">School Result Compiler</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Compile, approve and publish results</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant shrink-0">chevron_right</span>
          </Link>

          <Link to="/certificates" className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-container-low transition-colors text-left group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface-variant group-hover:text-secondary transition-colors">
                <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
              </div>
              <div className="truncate">
                <p className="font-label-lg text-label-lg font-bold text-on-surface">My Certificates</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">Every lesson you have passed</p>
              </div>
            </div>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
          </Link>
        </div>
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={signOut}
          className="w-full h-12 rounded-xl bg-error-container/40 hover:bg-error-container text-error font-label-lg text-label-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-sm"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span>Log Out from PathSync</span>
        </button>
        <p className="text-center font-label-sm text-label-sm text-on-surface-variant mt-2">PathSync v0.1.0</p>
      </div>
    </div>
  );
}
