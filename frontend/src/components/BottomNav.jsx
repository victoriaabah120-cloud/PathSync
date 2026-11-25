import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";

const ITEMS = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/learn", label: "Learn", icon: "learn" },
  { to: "/certificates", label: "Awards", icon: "award" },
  { to: "/coach", label: "Coach", icon: "chat" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} size={22} filled={isActive} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
