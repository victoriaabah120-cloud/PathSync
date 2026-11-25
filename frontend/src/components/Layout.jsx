import { Outlet } from "react-router-dom";
import AppBar from "./AppBar.jsx";
import BottomNav from "./BottomNav.jsx";

// nav  = true  -> tab bar at the bottom and the PathSync wordmark in the top bar
// title / back -> focused screens get a back arrow and their own title
export default function Layout({ nav = false, title = "", back = "" }) {
  const classes = ["screen"];
  if (nav) classes.push("with-nav");
  classes.push("has-bar");

  return (
    <div className="app">
      <AppBar nav={nav} title={title} back={back} />
      <main className={classes.join(" ")}>
        <Outlet />
      </main>
      {nav && <BottomNav />}
    </div>
  );
}
