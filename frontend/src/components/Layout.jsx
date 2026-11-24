import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav.jsx";

// nav = true shows the bottom tab bar. Use nav = false for focused screens (lessons, quizzes, setup).
export default function Layout({ nav = false }) {
  return (
    <div className="app">
      <main className={nav ? "screen with-nav" : "screen"}>
        <Outlet />
      </main>
      {nav && <BottomNav />}
    </div>
  );
}
