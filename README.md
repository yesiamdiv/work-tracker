# Work Tracker

A personal record of QA / automation / testing work. Log what you did, against
what, with every reference kept — then look it up months later.

Design and roadmap: [PLAN.md](PLAN.md).

## Setup

**1. Database.** Make a project at [neon.tech](https://neon.tech), copy the
*pooled* connection string.

**2. Google OAuth.** Cloud Console → APIs & Services → Credentials → Create
OAuth client ID → Web application. Add both redirect URIs:

```
http://localhost:3000/api/auth/callback/google
https://<your-vercel-domain>/api/auth/callback/google
```

Request **sign-in scopes only** — `openid`, `email`, `profile`. Do **not** add a
Drive scope: a published app asking for Drive is blocked until Google verifies
it. Leave the app **published**, which keeps refresh tokens from expiring.
Drive, and that trade-off, come back at step 4.

**3. Env.**

```bash
cp .env.example .env.local
openssl rand -base64 32   # paste as AUTH_SECRET
```

Fill in `DATABASE_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and set
`ALLOWED_EMAILS` to your own address. Anyone not on that list is refused at
sign-in.

**4. Schema and run.**

```bash
npm install
npm run db:push     # or db:generate && db:migrate to keep migration files
npm run dev
```

**5. Deploy.** Import the repo on Vercel, paste the same env vars, set
`AUTH_URL` to the deployed origin, and add that origin's callback URL to the
Google client. Do this early — hosting is easier to settle now than later.

## Using it

The capture box on **Today** is the whole point. Type one line, hit enter.

| Marker | Effect |
|---|---|
| `!bug` | bug found |
| `!pass` `!fail` `!partial` `!flaky` | test run, with outcome |
| `!fixed` | bug update, passing |
| `!blocked` `!decision` `!meeting` `!q` `!handoff` `!done` | sets the kind |
| `#tag` | tags the event (stays in the text — it reads as prose) |
| any pasted URL | classified as Jira / Sheet / Doc / PR / build and stored as a ref |

Jira URLs have their key extracted, so "everything that touched QA-4421" is an
indexed lookup rather than a text search. Unrecognised `!words` are left alone.

`Enter` commits, `Shift+Enter` adds a newline, `Esc` clears, `/` from anywhere on
the page returns focus to the box.

**Subjects are for filtering, not filing.** A task needs no subject — log first,
attach later or never. Subjects nest two levels (ClientX → ClientX firmware),
and filtering a parent includes its children.

## Status

Steps 0–2 of [PLAN.md](PLAN.md) are done: schema, auth, Today, task detail,
subject list and detail, both creation forms. `/stream` is a placeholder.

Next up is step 3 — the filterable stream — but **use this for a week first.**
The filters worth building are the ones you actually reach for, and the model's
gaps only show up in use.
