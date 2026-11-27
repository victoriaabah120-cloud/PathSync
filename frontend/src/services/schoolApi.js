// School Result Compiler API. Thin wrappers over the existing authenticated helpers
// in api.js, so the module reuses PathSync's token handling instead of its own.
import { authGet, del, patch, post, put } from "./api.js";

const q = (params) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

const get = (path, params) => authGet(params ? `${path}?${q(params)}` : path);

// POST endpoints that take query parameters instead of a body.
const withQuery = (path, params) => {
  const query = q(params || {});
  return query ? `${path}?${query}` : path;
};

// ---------- school, plans, subscription ----------
export const getSchoolContext = () => get("/schools/me");
export const getPlans = () => get("/schools/plans");
export const registerSchool = (body) => post("/schools/register", body);
export const joinSchool = (inviteCode) => post("/schools/me/join", { invite_code: inviteCode });
export const checkout = (planCode, billingCycle) =>
  post("/schools/me/subscription/checkout", { plan_code: planCode, billing_cycle: billingCycle });
export const verifyCheckout = (reference) =>
  post(`/schools/me/subscription/verify?${q({ reference })}`, {});
export const getSubscription = () => get("/schools/me/subscription");
export const getInvoices = () => get("/schools/me/invoices");

// ---------- structure ----------
export const listSessions = () => get("/schools/me/sessions");
export const createSession = (body) => post("/schools/me/sessions", body);
export const listTerms = () => get("/schools/me/terms");
export const createTerm = (body) => post("/schools/me/terms", body);
export const listClasses = () => get("/schools/me/classes");
export const createClass = (body) => post("/schools/me/classes", body);
export const listSubjects = () => get("/schools/me/subjects");
export const getSubjectLibrary = (query = "") =>
  get("/schools/subject-library", query ? { query } : undefined);
export const createSubject = (body) => post("/schools/me/subjects", body);
export const listClassSubjects = (params) => get("/schools/me/class-subjects", params);
export const createClassSubject = (body) => post("/schools/me/class-subjects", body);

// ---------- people ----------
export const listStudents = (params) => get("/schools/me/students", params);
export const createStudent = (body) => post("/schools/me/students", body);
export const updateStudent = (id, body) => patch(`/schools/me/students/${id}`, body);
export const listTeachers = () => get("/schools/me/teachers");
export const inviteTeacher = (email, fullName) =>
  post("/schools/me/teachers/invite", { email, full_name: fullName });
export const listAssignments = (params) => get("/schools/me/assignments", params);
export const createAssignment = (body) => post("/schools/me/assignments", body);
export const deleteAssignment = (id) => del(`/schools/me/assignments/${id}`);

// ---------- assessment settings ----------
export const getConfig = (params) => get("/schools/me/assessment-config", params);
export const saveConfig = (body) => post("/schools/me/assessment-config", body);

// ---------- teaching ----------
export const getResponsibilities = () => get("/schools/me/responsibilities");
export const getSheet = (sheetId) => authGet(`/schools/me/sheets/${sheetId}`);
export const saveScores = (sheetId, rows) => put(`/schools/me/sheets/${sheetId}/scores`, { rows });
export const submitSheet = (sheetId) => post(`/schools/me/sheets/${sheetId}/submit`, {});
export const reopenSheet = (sheetId, reason) => post(`/schools/me/sheets/${sheetId}/reopen`, { reason });
export const returnSheet = (sheetId, reason) => post(`/schools/me/sheets/${sheetId}/return`, { reason });

// ---------- compilation and approval ----------
export const compileClass = (classId, params) =>
  post(withQuery(`/schools/me/classes/${classId}/compile`, params), {});
export const submitResults = (classId, params) =>
  post(withQuery(`/schools/me/classes/${classId}/submit-results`, params), {});
export const getClassResults = (classId, params) => get(`/schools/me/classes/${classId}/results`, params);
export const approveCompilation = (id) => post(`/schools/me/compilations/${id}/approve`, {});
export const returnCompilation = (id, reason) => post(`/schools/me/compilations/${id}/return`, { reason });
export const publishCompilation = (id) => post(`/schools/me/compilations/${id}/publish`, {});
export const reopenCompilation = (id, reason) => post(`/schools/me/compilations/${id}/reopen`, { reason });

// ---------- student ----------
export const getStudentProfile = () => get("/schools/me/student");
export const getMyResults = () => get("/schools/me/results");
export const getMyReport = (compilationId) => get(`/schools/me/results/${compilationId}`);
