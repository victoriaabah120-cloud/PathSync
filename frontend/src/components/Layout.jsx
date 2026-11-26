import { Outlet } from "react-router-dom";
import AppBar from "./AppBar.jsx";
import BottomNav from "./BottomNav.jsx";

/**
 * Page shell reproduced from the Stitch reference: a max-w-md column, fixed 64px
 * app bar, and (for tab screens) a fixed bottom nav.
 *
 * Reading screens pass width="wide", which widens the shell (and its bar and nav)
 * so a lesson can be set as a textbook page instead of a narrow column.
 */
export default function Layout({
  nav = false,
  bar = "brand",
  title = "",
  back = "",
  mainClass = "",
  width = "narrow",
  home = "/home",
}) {
  const wide = width === "wide";
  const padding = nav ? "px-gutter pt-16 pb-24" : "px-gutter pt-16 pb-8";
  const shell = wide ? "max-w-5xl" : "max-w-md";

  return (
    <div className="bg-surface font-body-md text-on-surface flex flex-col min-h-screen">
      <div className={`w-full ${shell} mx-auto flex flex-col min-h-screen relative`}>
        {bar !== "none" && <AppBar variant={bar} title={title} back={back} wide={wide} home={home} />}
        <main className={`flex-1 flex flex-col relative w-full bg-surface ${padding} ${mainClass}`}>
          <Outlet />
        </main>
        {nav && <BottomNav wide={wide} />}
      </div>
    </div>
  );
}
