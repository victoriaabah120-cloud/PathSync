import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// False until frontend/.env is filled in. The app shows a setup message instead of crashing.
export const supabaseReady = Boolean(url && key);

// The deployed PathSync site. Auth emails must always come back here, never to localhost.
export const PRODUCTION_SITE_URL = (
  import.meta.env.VITE_SITE_URL || "https://pathsync-frontend-ddee.onrender.com"
).replace(/\/+$/, "");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export function isLocalHost(hostname = window.location.hostname) {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".local");
}

// Where Supabase sends people after they click an auth email link.
// On a dev machine that is the dev server; anywhere else it is the deployed site,
// so a confirmation link can never open localhost for a real user.
export function siteUrl() {
  if (typeof window === "undefined") return PRODUCTION_SITE_URL;
  return isLocalHost() ? window.location.origin : PRODUCTION_SITE_URL;
}

// A dedicated callback route is available, but confirmation links land on the
// site root by default: the root always resolves on Render, while a deep link
// such as /auth/callback needs a rewrite rule to serve the app.
export const AUTH_CALLBACK_PATH = "/auth/callback";

export function authRedirectUrl(path = "/") {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${suffix}`;
}

// Captured the moment this module loads, before supabase-js rewrites the address bar.
// Supabase reads the URL itself on startup and strips the auth parameters, so anything
// that needs to inspect them later (an expired link, a PKCE code) must look here.
export const INITIAL_AUTH_PARAMS = (() => {
  if (typeof window === "undefined") return { query: new URLSearchParams(), hash: new URLSearchParams() };
  const here = new URL(window.location.href);
  return {
    query: new URLSearchParams(here.search),
    hash: new URLSearchParams(here.hash.replace(/^#/, "")),
  };
})();

export const supabase = createClient(url || "http://localhost", key || "missing-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Reads the tokens Supabase puts in the URL after an email confirmation or OAuth redirect.
    detectSessionInUrl: true,
    storageKey: "pathsync-auth",
  },
});
