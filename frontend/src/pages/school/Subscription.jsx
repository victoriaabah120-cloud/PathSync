import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Loader from "../../components/Loader.jsx";
import { SectionCard, SectionTitle, ErrorNote, Notice, EmptyState, dateOf, number } from "../../components/school/SchoolKit.jsx";
import { checkout, getPlans, getSchoolContext, getSubscription, verifyCheckout } from "../../services/schoolApi.js";

function money(kobo, currency = "NGN") {
  const amount = Number(kobo || 0) / 100;
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function stateTone(state) {
  const value = String(state || "").toLowerCase();
  if (value === "active") return "text-emerald-300";
  if (value === "expired") return "text-rose-300";
  if (value === "pending") return "text-amber-300";
  return "text-on-surface-variant";
}

export default function Subscription() {
  const [params, setParams] = useSearchParams();
  const reference = params.get("reference");

  const [plans, setPlans] = useState([]);
  const [detail, setDetail] = useState(null);
  const [context, setContext] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [planList, subscription, school] = await Promise.all([
        getPlans(),
        getSubscription(),
        getSchoolContext().catch(() => null),
      ]);
      setPlans(planList?.plans || planList || []);
      setDetail(subscription || null);
      setContext(school || null);
    } catch (error) {
      setLoadError(error.message || "The subscription could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Paystack sends the administrator back here with ?reference=...
  useEffect(() => {
    if (!reference || !detail) return;
    let alive = true;
    setBusy("verify");
    setActionError("");
    verifyCheckout(reference)
      .then((result) => {
        if (!alive) return;
        const state = String(result?.state || result?.subscription_state || "").toLowerCase();
        setNotice(
          state === "active"
            ? "Payment confirmed. Your plan is active."
            : "We checked that payment. If it does not show as active yet, the confirmation may still be arriving.",
        );
        const next = new URLSearchParams(params);
        next.delete("reference");
        setParams(next, { replace: true });
        load();
      })
      .catch((error) => {
        if (alive) setActionError(error.message || "That payment could not be verified.");
      })
      .finally(() => {
        if (alive) setBusy("");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference, detail]);

  const subscription = detail?.subscription || null;
  const plan = detail?.plan || null;
  const state = detail?.state || "none";
  const testing = detail?.billing_mode === "testing" || context?.billing_mode === "testing";
  const used = Number(detail?.students?.used || 0);
  const capacity = Number(detail?.students?.capacity || 0);
  const invoices = detail?.invoices || [];
  const payments = detail?.payments || [];

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => Number(a.min_students || 0) - Number(b.min_students || 0)),
    [plans],
  );

  async function startCheckout(planCode) {
    setBusy(planCode);
    setActionError("");
    setNotice("");
    try {
      const result = await checkout(planCode, cycle);
      if (result?.authorization_url) {
        window.location.assign(result.authorization_url);
        return;
      }
      throw new Error("The payment page could not be opened. Please try again.");
    } catch (error) {
      setActionError(error.message || "Checkout could not be started.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <Loader text="Loading your subscription..." />;

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4">
        <ErrorNote message={loadError} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4">
      {notice && <Notice>{notice}</Notice>}
      {actionError && <ErrorNote message={actionError} onRetry={() => setActionError("")} retryLabel="Dismiss" />}
      {busy === "verify" && <Notice>Checking your payment with Paystack...</Notice>}

      <SectionCard>
        <SectionTitle icon="workspace_premium" title="Current plan" note={context?.school?.name || ""} />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-headline-sm text-headline-sm font-bold text-on-surface">
              {plan?.name || "No plan yet"}
            </p>
            <p className={`font-label-md text-label-md capitalize ${stateTone(state)}`}>{state}</p>
            {subscription?.current_period_end && (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Renews {dateOf(subscription.current_period_end)}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-headline-sm text-headline-sm font-bold text-on-surface tabular-nums">
              {number(used, 0)} / {capacity ? number(capacity, 0) : "—"}
            </p>
            <p className="font-label-sm text-label-sm text-on-surface-variant">students enrolled</p>
          </div>
        </div>
        {plan && (
          <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
            {plan.name} covers {plan.min_students} to {plan.max_students} students at{" "}
            {money(cycle === "annual" ? plan.annual_price_kobo : plan.monthly_price_kobo, plan.currency)}{" "}
            per {cycle === "annual" ? "year" : "month"}.
          </p>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle
          icon="tune"
          title="Billing cycle"
          note="Annual billing is charged once for the year."
          action={
            <div className="flex rounded-full border border-white/15 p-1">
              {["monthly", "annual"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCycle(option)}
                  className={`rounded-full px-3 py-1 font-label-sm text-label-sm capitalize transition ${
                    cycle === option ? "bg-secondary text-on-secondary" : "text-on-surface-variant"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          }
        />
        <div className="mt-3 space-y-3">
          {sortedPlans.length === 0 && <EmptyState icon="sell" title="No plans published" />}
          {sortedPlans.map((option) => {
            const isCurrent = plan?.code === option.code;
            const price = cycle === "annual" ? option.annual_price_kobo : option.monthly_price_kobo;
            return (
              <div
                key={option.id || option.code}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                      {option.name}
                      {isCurrent && (
                        <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 font-label-sm text-label-sm text-emerald-300">
                          current
                        </span>
                      )}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {option.min_students} to {option.max_students} students
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-headline-sm text-headline-sm font-bold text-on-surface tabular-nums">
                      {money(price, option.currency)}
                    </p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      per {cycle === "annual" ? "year" : "month"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => startCheckout(option.code)}
                  disabled={testing || busy === option.code || isCurrent}
                  className="mt-3 w-full rounded-xl bg-secondary px-4 py-2.5 font-label-md text-label-md text-on-secondary disabled:opacity-50"
                >
                  {testing
                    ? "Subscriptions are switched off"
                    : isCurrent
                    ? "Your current plan"
                    : busy === option.code
                    ? "Opening checkout..."
                    : `Choose ${option.name}`}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
          {testing
            ? "Subscriptions and payments are switched off while the result compiler is being tested, so no school is charged and no plan is needed. The plans stay here, with their prices, ready for when billing is enabled again."
            : "A plan only becomes active after Paystack confirms the payment to our server. Prices come from the plan records, so they change without a code release."}
        </p>
      </SectionCard>

      <SectionCard>
        <SectionTitle icon="receipt_long" title="Invoices" note={`${invoices.length} on record`} />
        {invoices.length === 0 ? (
          <EmptyState icon="receipt" title="No invoices yet">
            Invoices appear here after a payment is confirmed.
          </EmptyState>
        ) : (
          <ul className="mt-3 divide-y divide-white/5">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-body-md text-body-md text-on-surface">
                    {invoice.reference || invoice.id?.slice(0, 8)}
                  </p>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">
                    {dateOf(invoice.created_at)} · {invoice.status || "issued"}
                  </p>
                </div>
                <p className="shrink-0 font-label-md text-label-md tabular-nums text-on-surface">
                  {money(invoice.amount_kobo, invoice.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
        {payments.length > 0 && (
          <p className="mt-2 font-label-sm text-label-sm text-on-surface-variant">
            {payments.length} payment{payments.length === 1 ? "" : "s"} recorded, latest{" "}
            {dateOf(payments[0].created_at)}.
          </p>
        )}
      </SectionCard>

      <p className="pb-2 text-center font-body-sm text-body-sm text-on-surface-variant">
        <Link to="/school/admin" className="underline">
          Back to the admin dashboard
        </Link>
      </p>
    </div>
  );
}
