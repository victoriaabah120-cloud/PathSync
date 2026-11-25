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
async function post(path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
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
