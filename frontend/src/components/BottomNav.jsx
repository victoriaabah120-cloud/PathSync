import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";

const ITEMS = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/learn", label: "Learn", icon: "learn" },
  { to: "/certificates", label: "Certificates", icon: "award" },
  { to: "/coach", label: "AI Coach", icon: "chat" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
