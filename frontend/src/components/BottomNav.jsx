import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/learn", label: "Learn", icon: "alt_route" },
  { to: "/certificates", label: "Certificates", icon: "workspace_premium" },
  { to: "/coach", label: "AI Coach", icon: "auto_awesome" },
  { to: "/profile", label: "Profile", icon: "account_circle" },
];

export default function BottomNav({ wide = false }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface-container-lowest/90 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
      <div className={`${wide ? "max-w-5xl" : "max-w-md"} mx-auto flex justify-around items-center h-16 px-space-xs`}>
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center min-w-[56px] min-h-[44px] gap-0.5 transition-colors ${
                isActive ? "text-secondary" : "text-on-surface-variant"
              }`
            }
          >
            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
            <span className="font-label-sm text-label-sm">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
