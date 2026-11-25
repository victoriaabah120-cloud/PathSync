# PathSync upgrade notes (25 Nov 2026)

This release adds four things. Nothing else in the app was restructured.

## 1. AI Coach formatting

Answers are rendered with `react-markdown` + `remark-gfm`, then passed through
`rehype-sanitize`, so headings, lists, code blocks, tables and bold text render
properly while scripts and event handlers are stripped. Formulas render with KaTeX,
loaded lazily the first time a message contains maths.

The coach prompt in `backend/app/routers/coach.py` now asks for clean Markdown
(`###` headings, `-` lists, fenced code, tables, `$$` maths) and allows longer answers.

## 2. Certification after the whole course

A lesson quiz no longer issues anything. A certificate is created only by the API,
and only when:

1. every lesson in the course has `status = 'completed'`, and
2. the final course assessment has been passed with 80% or more.

Flow: `POST /course/assessment/start` (checks completion, writes the exam, keeps the
answer key server-side) → `POST /course/assessment/submit` (grades, re-checks
completion, issues once) → `GET /certificates/verify/{code}` (public check).

Certificates are unique per learner per course (database unique index) and the
certificate code is derived from the learner and the course, so a second certificate
cannot be issued. Row-level security lets learners read their certificates but never
insert one.

**Run `supabase/schema.sql`** on a fresh project, or
`supabase/migrations/2026-11-25-course-certificates.sql` on an existing one.

## 3. Deeper lessons

`/lessons/generate` now writes objectives, a full introduction, 5-7 detailed sections,
worked examples, common mistakes, key takeaways, practice questions with answers, and
further learning. Older stored lessons keep working because the new fields are additive.

## 4. Light and dark themes

Every colour token in `tailwind.config.js` now reads a CSS variable, with light values in
`:root` and dark values in `.dark` (see `frontend/src/styles.css`). `ThemeContext` stores
the choice under `pathsync.theme` (`light` or `dark`); with nothing stored it follows the
device and keeps following it. A sun/moon toggle sits in the app bar and on the
authentication screens, and Profile has Light / Dark / System controls.
