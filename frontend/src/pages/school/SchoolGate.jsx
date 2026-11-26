import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import { checkout, getPlans, getSchoolContext, registerSchool } from "../../services/schoolApi.js";
import Loader from "../../components/Loader.jsx";

const TYPES = ["Secondary school", "Primary school", "Combined school", "College of education", "Other"];

// The API accepts the short codes, not the labels shown here.
const SCHOOL_TYPE_CODES = {
  "Secondary school": "secondary",
  "Primary school": "primary",
  "Combined school": "combined",
  "College of education": "other",
  Other: "other",
};
const HOME = { school_admin: "/school/admin", teacher: "/school/teacher", student: "/school/student" };

const money = (kobo, currency) =>
  `${currency || "NGN"} ${(Number(kobo || 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;

export default function SchoolGate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState("loading"); // loading | register | plans | paying | error
  const [plans, setPlans] = useState([]);
  const [cycle, setCycle] = useState("monthly");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    school_type: TYPES[0],
    email: user?.email || "",
    phone: "",
    address: "",
    city: "",
    state: "",
    country: "Nigeria",
  });

  useEffect(() => {
    let alive = true;
    getSchoolContext()
      .then((ctx) => {
        if (!alive) return;
        navigate(HOME[ctx.role] || "/school/admin", { replace: true });
      })
      .catch((err) => {
        if (!alive) return;
        if (err.status === 403 || err.status === 404) {
          setStage("register");
          return;
        }
        setMessage(err.message);
        setStage("error");
      });
    return () => {
      alive = false;
    };
  }, [navigate]);

  async function submitSchool(event) {
    event.preventDefault();
    setMessage("");
    setStage("paying");
    try {
      await registerSchool({
        ...form,
        school_type: SCHOOL_TYPE_CODES[form.school_type] || "other",
      });
      const data = await getPlans();
      setPlans(data.plans || []);
      setStage("plans");
    } catch (err) {
      setMessage(err.message);
      setStage("register");
    }
  }

  async function choosePlan(plan) {
    setMessage("");
    setStage("paying");
    try {
      const data = await checkout(plan.code, cycle);
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
      setMessage(
        "Your school is registered. Payments are not switched on yet, so the subscription is pending activation."
      );
      setStage("plans");
    } catch (err) {
      setMessage(err.message);
      setStage("plans");
    }
  }

  if (stage === "loading") return <Loader text="Checking your school..." />;

  const field = (name, label, props = {}) => (
    <label className="flex flex-col gap-1">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <input
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        className="w-full rounded-xl bg-surface-container-low px-space-md py-3 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary"
        {...props}
      />
    </label>
  );

  if (stage === "register" || stage === "error") {
    return (
      <div className="flex flex-col gap-space-md pb-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">
            School Result Compiler
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Register your school to compile results, approve them and publish report cards.
          </p>
        </header>

        {message && (
          <p className="rounded-xl bg-error-container px-space-md py-3 font-body-sm text-body-sm text-on-error-container">
            {message}
          </p>
        )}

        <form onSubmit={submitSchool} className="flex flex-col gap-space-sm bg-surface-container-lowest rounded-2xl p-space-lg shadow-md">
          {field("name", "School name", { required: true, placeholder: "Crown Heights International Academy" })}
          <label className="flex flex-col gap-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">School type</span>
            <select
              value={form.school_type}
              onChange={(e) => setForm({ ...form, school_type: e.target.value })}
              className="w-full rounded-xl bg-surface-container-low px-space-md py-3 font-body-md text-body-md text-on-surface border border-outline-variant/40 outline-none focus:border-secondary"
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          {field("email", "School email", { type: "email", required: true })}
          {field("phone", "Phone", { required: true, placeholder: "0803 000 0000" })}
          {field("address", "Address", { required: true })}
          <div className="grid grid-cols-2 gap-space-sm">
            {field("city", "City", { required: true })}
            {field("state", "State", { required: true })}
          </div>
          {field("country", "Country", { required: true })}
          <button
            type="submit"
            className="mt-space-xs h-12 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold"
          >
            Create school
          </button>
          <p className="font-label-sm text-label-sm text-on-surface-variant text-center">
            You are registered as this school&apos;s administrator under {user?.email}.
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-md pb-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">Choose a plan</h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Plans are priced by how many students your school registers.
        </p>
      </header>

      <div className="flex gap-space-xs p-1 rounded-xl bg-surface-container">
        {["monthly", "annual"].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setCycle(option)}
            className={`flex-1 h-9 rounded-lg font-label-md text-label-md capitalize ${
              cycle === option ? "bg-secondary text-on-secondary" : "text-on-surface-variant"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {message && (
        <p className="rounded-xl bg-surface-container-high px-space-md py-3 font-body-sm text-body-sm text-on-surface">
          {message}
        </p>
      )}

      {plans.map((plan) => (
        <div key={plan.code} className="bg-surface-container-lowest rounded-2xl p-space-lg shadow-md flex flex-col gap-space-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">{plan.name}</h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant">{plan.students_label}</p>
            </div>
            <p className="font-headline-sm text-headline-sm text-on-surface font-bold text-right">
              {money(cycle === "annual" ? plan.annual_price_kobo : plan.monthly_price_kobo, plan.currency)}
              <span className="block font-label-sm text-label-sm text-on-surface-variant font-normal">
                per {cycle === "annual" ? "year" : "month"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => choosePlan(plan)}
            disabled={stage === "paying"}
            className="h-11 rounded-xl bg-secondary text-on-secondary font-label-lg text-label-lg font-bold disabled:opacity-50"
          >
            {stage === "paying" ? "Starting checkout..." : "Select this plan"}
          </button>
        </div>
      ))}
    </div>
  );
}
