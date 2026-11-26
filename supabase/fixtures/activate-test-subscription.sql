-- Fallback for live testing only.
--
-- The module activates a subscription only after Paystack confirms a payment to
-- the server. When no Paystack key is available, this fixture marks a DEDICATED
-- TEST school's pending subscription active so the score, compilation, approval,
-- publishing and student-access checks can be exercised against real tables.
--
-- Never run this on a real school: it grants a paid plan without a payment.
-- Replace the email below, run it, and the next harness run continues past the
-- 402 gate.

update public.src_subscriptions s
   set status = 'active',
       started_at = now(),
       current_period_start = now(),
       current_period_end = now() + interval '1 month'
  from public.src_schools sc
 where s.school_id = sc.id
   and sc.email = 'REPLACE-WITH-TEST-SCHOOL-EMAIL'
   and s.status = 'pending';

-- To test expiry without deleting anything, push the period into the past:
--
-- update public.src_subscriptions s
--    set current_period_end = now() - interval '1 day'
--   from public.src_schools sc
--  where s.school_id = sc.id
--    and sc.email = 'REPLACE-WITH-TEST-SCHOOL-EMAIL';
