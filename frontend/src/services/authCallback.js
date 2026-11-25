import { INITIAL_AUTH_PARAMS, supabase } from "./supabase.js";

// Turns Supabase's technical error codes into something a user can act on.
const FRIENDLY_ERRORS = {
  otp_expired:
    "That confirmation link has expired or was already used. Send yourself a new one and open it soon after it arrives.",
  access_denied: "That confirmation link is no longer valid. Send yourself a new one below.",
  invalid_request: "That confirmation link is incomplete. Send yourself a new one below.",
  server_error: "Supabase could not verify that link just now. Please try again in a moment.",
  email_not_confirmed:
    "Your email is not confirmed yet. Open the link we sent you, or send a new one below.",
};

function friendlyError(code, description) {
  if (code && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];
  if (description) return description.replace(/\+/g, " ");
  return "We could not verify that link. Send yourself a new confirmation email and try again.";
}

const AUTH_QUERY_KEYS = [
  "code",
  "token_hash",
  "token",
  "type",
  "error",
  "error_code",
  "error_description",
  "state",
];

// Removes auth parameters from the address bar without adding a history entry.
function stripAuthQuery() {
  const current = new URL(window.location.href);
  AUTH_QUERY_KEYS.forEach((key) => current.searchParams.delete(key));
  window.history.replaceState({}, document.title, `${current.origin}${current.pathname}${current.search}`);
}

// Drops any leftover #access_token=... values once a session is safely stored.
export function cleanAuthHash() {
  if (typeof window === "undefined" || !window.location.hash) return;
  const hash = window.location.hash.replace(/^#/, "");
  if (!/(access_token|refresh_token|error)/.test(hash)) return;
  const current = new URL(window.location.href);
  window.history.replaceState({}, document.title, `${current.origin}${current.pathname}${current.search}`);
}

/**
 * Finishes an email confirmation / OAuth redirect.
 *
 * Supabase can hand the session back in three ways depending on the project settings:
 *   - #access_token=... in the hash  (implicit flow, the default) - read by supabase-js itself
 *   - ?code=...                      (PKCE flow) - must be exchanged for a session
 *   - ?token_hash=...&type=...       (email OTP template) - must be verified
 *
 * Returns { handled, error }. `error` is a message ready to show to the user.
 */
export async function completeAuthRedirect() {
  if (typeof window === "undefined") return { handled: false, error: "" };

  const { query: params, hash } = INITIAL_AUTH_PARAMS;

  // 1. Supabase reported a problem instead of a session (expired or reused link).
  const errorCode = params.get("error_code") || hash.get("error_code");
  const errorDescription = params.get("error_description") || hash.get("error_description");
  if (errorCode || errorDescription) {
    stripAuthQuery();
    cleanAuthHash();
    return { handled: true, error: friendlyError(errorCode, errorDescription) };
  }

  // 2. Email OTP style link: verify the token hash directly.
  const tokenHash = params.get("token_hash");
  const otpType = params.get("type");
  if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: otpType });
    stripAuthQuery();
    return {
      handled: true,
      error: error ? friendlyError(error.code, error.message) : "",
    };
  }

  // 3. PKCE style link: swap the authorization code for a session.
  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    stripAuthQuery();
    return {
      handled: true,
      error: error
        ? "This link can only be opened in the same browser that created the account. Please sign in, or send yourself a new confirmation email."
        : "",
    };
  }

  // 4. Implicit flow: supabase-js has already read the hash and stored the session.
  return { handled: false, error: "" };
}
