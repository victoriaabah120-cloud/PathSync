import { isLocalHost, supabase } from "./supabase.js";

// Same rule as the auth redirect: the dev server talks to a local API, the deployed
// site talks to the deployed API. A missing env var can no longer point production
// at localhost.
const LOCAL_API_URL = "http://localhost:8000";
const PRODUCTION_API_URL = "https://pathsync.onrender.com";

const configuredApiUrl = (import.meta.env.VITE_API_BASE_URL || "").trim();
const BASE = (
  configuredApiUrl || (isLocalHost() ? LOCAL_API_URL : PRODUCTION_API_URL)
).replace(/\/+$/, "");

// Sends a POST request to the PathSync backend with the user's login token.
export async function send(method, path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the PathSync server. Check that the backend is running.");
  }

  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    let result = null;
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") message = payload.detail;
      else if (payload.detail && typeof payload.detail === "object") {
        message = payload.detail.message || message;
        result = payload.detail.result || null;
      }
    } catch {
      /* keep the default message */
    }
    const error = new Error(message);
    error.status = response.status;
    error.result = result;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

// Sends a POST request to the PathSync backend with the user's login token.
export const post = (path, body) => send("POST", path, body);
export const patch = (path, body) => send("PATCH", path, body);
export const put = (path, body) => send("PUT", path, body);
export const del = (path) => send("DELETE", path);

// Authenticated GET: used where the answer depends on who is asking.
export async function authGet(path) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("Cannot reach the PathSync server. Check that the backend is running.");
  }
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") message = payload.detail;
    } catch {
      /* keep the default message */
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Public GET (certificate verification needs no login).
async function get(path) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new Error("Cannot reach the PathSync server. Check that the backend is running.");
  }
  if (!response.ok) {
    let message = "Something went wrong. Please try again.";
    try {
      const payload = await response.json();
      if (typeof payload.detail === "string") message = payload.detail;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  return response.json();
}

export const recommendCareers = (answers, freeText) =>
  post("/assessment/recommend", { answers, free_text: freeText });

export const generatePath = (careerField, specialization) =>
  post("/path/generate", { career_field: careerField, specialization });

export const generateLesson = (careerField, specialization, title, summary) =>
  post("/lessons/generate", { career_field: careerField, specialization, title, summary });

export const generateQuiz = (careerField, specialization, title, lessonSummary) =>
  post("/quiz/generate", {
    career_field: careerField,
    specialization,
    title,
    lesson_summary: lessonSummary,
  });

export const coachChat = (careerField, specialization, currentLesson, messages) =>
  post("/coach/chat", {
    career_field: careerField,
    specialization,
    current_lesson: currentLesson || "",
    messages,
  });

// A certificate is issued by the backend, after it has confirmed the whole course
// is finished and the final assessment has been passed.
export const startCourseAssessment = (careerField, specialization) =>
  post("/course/assessment/start", { career_field: careerField, specialization });

export const submitCourseAssessment = (assessmentId, answers) =>
  post("/course/assessment/submit", { assessment_id: assessmentId, answers });

export const verifyCertificate = (code) =>
  get(`/certificates/verify/${encodeURIComponent(code)}`);

// The backend decides whether a course certificate exists, so the app never infers it.
export const fetchCourseCertificate = (careerField, specialization) =>
  authGet(`/certificates/course?career_field=${encodeURIComponent(careerField)}&specialization=${encodeURIComponent(specialization)}`);
