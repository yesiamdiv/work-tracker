# Work Tracker — plan

A personal system of record for QA / automation / testing work. Log what you
did, against what, with every reference kept — then look it up months later.

## 1. Model

Three levels, because a spreadsheet flattens three different things into one
grid and then can't aggregate any of them.

```
Subject ──M:N──▶ Task ──1:N──▶ Event
  │ (parent)                     │
  └─▶ Subject   refs ── refs ────┘
                                 └── attachments (Drive)
```

- **Subject** — the thing that persists for months: a client, an SDK, a firmware
  line, a mobile app, a feature area. Nests **two levels deep** — "ClientX" as a
  parent, "ClientX firmware 2.x" and "ClientX Android app" beneath it. No
  deeper: three levels is a filesystem, and you'd spend your time filing rather
  than logging.
- **Task** — a unit of work with a start and an end. "Regression suite for FW
  2.4.1", "Automate onboarding for ClientX", "QA release 3.2".
- **Event** — the append-only log inside a task. Where the value actually lives.
  Bugs found, decisions taken, runs passed, meetings held, blockers hit.

Task↔Subject is **many-to-many** — one SDK bug affects two clients, and you
don't want to log it twice.

### Subjects are filter dimensions, not a navigation spine

This is the load-bearing decision. You do **not** browse down into ClientX to
find your work; subjects behave like labels on tasks, and everything is reached
by filtering the stream. A task is tagged with whichever subjects it concerns,
events hang off the task, and "show me everything for ClientX" is a filter
query — not a folder you opened.

Two consequences:

1. **Filtering by a parent includes its children.** Filter "ClientX" and you get
   ClientX firmware and ClientX Android app events too, without needing to know
   those children exist. One `subjectFilterIds()` helper expands a parent to
   itself plus its children, and every query uses it.
2. **Nothing breaks when a subject is missing or wrong.** Log the event first,
   attach the subject later or never. The app must never block capture on
   filing — that's the failure mode that kills these tools.

### Non-obvious choices, and why

| Choice | Reason |
|---|---|
| `refs` is a table, not a URL field | "Every event that touched JIRA-4421" becomes one indexed query, not a text scan. `externalKey` is stored apart from the URL for exactly this. |
| `occurredAt` ≠ `createdAt` | You log the morning's testing at 6pm. Collapsing these makes the timeline lie. |
| `tasks.lastActivityAt` denormalised | "Recently touched" ordering on every page load without an aggregate. |
| Only 10 event kinds | Every extra option is a decision you make while typing. Hesitation kills a capture habit. |
| `subjects.parentId` self-reference, depth capped at 2 | Nesting you asked for, without becoming a filesystem. Cap enforced in the server action, not a DB trigger. |
| A task may have zero subjects | Capture must never block on filing. Attach the subject later. |
| `events.meta` is jsonb | Device, OS version, build number, suite name, env — varies per task type, not worth a column each. |
| Summaries cached on the row | AI calls are slow and cost money; regenerate on demand, not on every view. |

Schema is written: [src/db/schema.ts](src/db/schema.ts).

## 2. Stack

| Layer | Pick |
|---|---|
| Framework | Next.js 15, App Router, server actions (no separate API layer) |
| DB | Neon Postgres (`pgvector` available for step 5) |
| ORM | Drizzle + drizzle-kit migrations |
| Auth | Auth.js v5, Google provider, allowlist of one email |
| Files | Google Drive API, `drive.file` scope, direct browser→Drive upload |
| Styling | Tailwind v4, hand-rolled components in the shadcn idiom |
| AI | Anthropic API — `claude-sonnet-5-5` default, `claude-opus-5-5` for cross-history synthesis |
| Search | Postgres FTS (`tsvector`) blended with pgvector semantic |
| Host | Vercel |

**Drive specifics.** `drive.file` scope means the app only ever sees files it
created — far smaller blast radius than full `drive`, and much easier if you
ever need Google's verification. One app folder, a subfolder per subject.
Uploads go **browser → Drive directly** with the access token; only the
resulting `fileId` + `webViewLink` are POSTed back. Never proxy bytes through a
Vercel function — the first screen recording of a flaky test would blow the
payload limit.

**The Google consent-screen trap**, hit and worked around on 3 Oct 2026: a
*published* app requesting any Drive scope is blocked pending Google
verification ("has not completed the Google verification process"). A *testing*
app is not blocked but expires refresh tokens after 7 days. So you may have
Drive, or a published app, but not both without verification.

Resolved for now by requesting sign-in scopes only (`openid email profile`,
all non-sensitive) and leaving the app published. Step 4 has to choose one of:
unpublish to Testing and re-login weekly, submit for verification, or put files
somewhere other than Drive. Worth deciding before building that step, since it
may make Vercel Blob the better answer after all.

## 3. Views

Explicitly **not** a spreadsheet. No literal row/column grid anywhere.

### Today — the landing page
Open tasks as cards, and one always-focused capture box at the top. Type, hit
enter, event logged against the task you last touched. Inline syntax so your
hands never leave the keyboard:

- `/` — switch target task (fuzzy)
- `#` — tag
- `!bug` `!pass` `!fail` `!blocked` — set kind/outcome
- a pasted URL — auto-classified as Jira / Sheet / Doc / PR and filed as a ref

**This screen is the whole app's success condition.** If logging an event takes
more than ten seconds you'll stop doing it and the app dies.

### Stream — the lookup view
One vertical chronological feed of every event across all subjects, grouped by
day. A filter bar of chips above it:

`subject` · `event kind` · `outcome` · `tag` · `date range` ·
`has attachments` · `has Jira ref` · free text

Filters compose and **live in the URL**, so any filtered view is a bookmarkable
saved search — "all `bug_found` on ClientX firmware, last 90 days". Rows are
compact: subject colour bar, kind icon, one-line body preview, ref chips;
click expands in place rather than navigating away. Infinite scroll, keyboard
`j`/`k` to move, `enter` to expand.

### Subjects — a plain nested list
Not cards, not a grid. A quiet indented list: parents at the left margin,
children indented once under them, each line showing name, open-task count and
last-activity age as dim right-aligned text. Filter by kind and status. This
screen is for *managing* subjects; it is not how you find your work.

### Subject detail
Header with status and links. Every task ever, reverse-chronological, collapsed
to one line and expandable to its event stream. Includes child-subject tasks by
default, with a toggle to exclude them. Sidebar: **every ref ever attached to
this subject**, grouped by kind — all the Jira tickets, all the sheets, all the
docs for ClientX in one list. Plus the cached AI "where this stands" paragraph,
regenerated on demand.

### Task detail
The event stream vertically, oldest→newest like a chat log. Each event: kind
icon, timestamp, markdown body, ref chips, attachment thumbnails. Inline edit.
Add-event box pinned to the bottom.

### Search / Ask
One input, two modes. Literal → event cards with highlights. Ask → retrieval
over history, answered in prose with citations that link to the real events.

### Command palette (`Cmd-K`)
Jump to any subject or task, log an event, start a task, run a saved filter.
Once this exists you'll barely touch the nav.

### Look

Plain, black, thin, quiet. Deliberately *not* the default AI-app look — no
gradients, no purple, no glass, no emoji, no fat rounded cards with drop
shadows, no coloured status pills.

**Rules, so this doesn't drift:**

- **Black.** Background `#000`. Surfaces are the same black — separation comes
  from hairlines, never from lighter grey panels.
- **Hairlines only.** Every border is `1px` at `#1c1c1c`–`#242424`. No `2px`, no
  heavy dividers, no shadows anywhere. If two things need separating, use space
  first and a hairline second.
- **Thin type.** Weight `400` for body, `500` for the few headings that need it.
  **Never `600`+, never bold.** Size 13–14px body, 11–12px meta. Meta text in
  `#6b6b6b`, body in `#d4d4d4`, headings `#ededed`.
- **Generous space.** 16–24px inside containers, 10–14px between rows, 32–48px
  between sections. This is the one place not to economise — the density note
  from the earlier draft is withdrawn, spacing wins.
- **Almost no colour.** Monochrome throughout. Colour appears only as a 5px dim
  dot for subject identity and a muted underline on links. Even `fail` and
  `blocked` are conveyed by a thin left rule and dim label text, not red fills.
- **Square-ish.** `radius: 2px` maximum. Nothing pill-shaped except the filter
  chips, and those are hairline outlines, not fills.
- **No icon soup.** Icons only where they replace a word entirely; `1.5px`
  stroke, `#6b6b6b`, 14px.

System font stack, tabular numerals for timestamps. A real PWA with a maskable
icon; mobile gets Today, capture and search only.

## 4. AI, in order of real usefulness

1. **Ask across history** — FTS + vector retrieval, answer with citations.
   "What was the workaround for the ClientX provisioning bug?" This is the
   reason the app exists.
2. **Task summary** — 40 events down to six bullets: tested, broke, outstanding.
3. **Polish this note** — tighten one event body, preserving Jira keys and
   technical terms. Shown as a diff, never a silent overwrite.
4. **Structure a dump** — paste raw session notes, get proposed events with
   kinds and extracted refs. You approve or edit before anything is saved.
5. **Weekly digest** — Vercel cron on Fridays, grouped by subject. Useful for
   standups and self-appraisals.
6. **Subject state paragraph** — the "where does ClientX stand" on each subject.

Hard rules: AI never writes to the DB without confirmation; every generated
claim cites its source events; embeddings are generated in a background job so
saving an event is never slow.

## 5. Build order

- [x] **0** — Config, schema, plan
- [x] **1** — Neon + Drizzle, Auth.js Google sign-in locked to one email
- [x] **2** — Subjects / tasks / entries, link auto-detection, task and subject pages
- [x] **3** — Legibility pass. The first UI was too quiet to use: 13.5px type,
      greys too dark, and no signal for what was clickable. Type up to 15px,
      greys lifted, hover-plus-chevron as the single "this navigates" cue,
      every control labelled, parent/child stated in words
- [x] **4** — Dashboard: static stat tiles, 28-day activity bars, stale-task
      detection, task sidebar that filters the feed and aims the capture box
- [x] **5** — Search and filters over everything logged, held in the URL so any
      narrowed view is bookmarkable
- [x] **6** — Delete for subjects, tasks and entries, two-step with the cascade
      spelled out before confirming
- [ ] **7** — AI, first group. Needs no retrieval infrastructure, so it comes
      now: summarise a day / week / month / subject / task; "improve this" on
      the capture box, shown as a before-and-after, never a silent overwrite;
      prompt-to-create, proposing a subject, task and entries for approval
      before anything is written
- [ ] **8** — File uploads on an entry. Not Google Drive: a published Google app
      requesting a Drive scope is blocked pending verification, and the Testing
      alternative expires refresh tokens weekly. Vercel Blob instead, or R2 if
      screen recordings are in scope
- [ ] **9** — Stats page, `Cmd-K` palette, Friday digest
- [ ] **10** — AI, second group. Open-ended questions over the whole history,
      which needs embeddings and pgvector. Deferred deliberately: it only earns
      its keep once there is a lot of history, and every AI feature actually
      asked for lives in group one

**Deployment is still outstanding** — the app runs locally only, so it cannot
be reached from a phone. That is the largest remaining gap between this and
something usable day to day.
