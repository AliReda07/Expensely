# Expensely

Mobile-format expense tracker — React + TypeScript + Vite + Tailwind, installable as a PWA, backed by Supabase.

**Live app:** [expense-tracker-bice-mu-77.vercel.app](https://expense-tracker-bice-mu-77.vercel.app)

## What it does

- **Email/password + Google sign-in** (Supabase Auth)
- **Balance tracking** — a starting balance plus every income/expense transaction rolls up into a live balance, split across multiple debit/credit **cards**
- **Budgets** — an overall monthly budget and per-category budgets, both shown as progress bars
- **Categories** — preset categories plus user-created custom ones (icon + color)
- **History** — full searchable/filterable transaction list with edit & delete, reachable via "View all" on Home
- **Insights** — category breakdown (pie chart) and a 6-month spending trend, browsable by month
- **Ask** — a chat page where you type or speak things like *"spent 50 on food"* or *"can I afford a 5000 trip?"*, and an AI agent (built in n8n) logs, corrects, or deletes transactions and answers questions about your spending. See [How the Ask assistant works](#how-the-ask-assistant-n8n-ai-workflow-works) below.
- **SMS auto-logging** — forward a bank transaction SMS to a private webhook URL (e.g. via an iOS Shortcut) and it's parsed and logged automatically. This path is fully deterministic (no LLM involved) so the same message always produces the same result — see `supabase/functions/sms-webhook`.
- **Push notifications** — a real (Web Push) notification when SMS auto-logging books a transaction, so it reaches you even if the app isn't open at the time. Enabled per-device from Settings → Push notifications. See `src/sw.ts` and `supabase/functions/_shared/push.ts`.
- **Installable PWA** (add to home screen)

## How the Ask assistant (n8n AI workflow) works

The **Ask** tab is a natural-language front end for the same `transactions` table the rest of the app uses. The actual language understanding and decision-making happens in an n8n workflow, not in the app itself:

1. **Frontend** (`src/pages/Ask.tsx`) sends the typed or voice-transcribed message, plus the user's currency and category list, to a Supabase Edge Function called `ask-proxy`.
2. **`ask-proxy`** (`supabase/functions/ask-proxy/index.ts`) verifies the caller's Supabase session server-side, then forwards the message to the n8n workflow's webhook — authenticated with a shared secret header (`X-Webhook-Secret`) — along with the *already-verified* `user_id`. n8n never sees the user's access token or password, only that one verified id.
3. **n8n workflow** ("Expense Tracker – Ask", hosted on n8n Cloud):
   - A **Webhook** node receives the request and checks the shared secret.
   - A **Verify User** step resolves the request to the correct `profiles` row.
   - An **AI Agent** node ("Expense Agent"), running an LLM via **OpenRouter**, reads the message against a system prompt describing the user's categories and today's date, and decides what to do.
   - The agent calls one of four **Supabase tools** to act on that decision:
     - **Log Transaction** — inserts a new expense or income row (a refund is logged as new income under a "refund" category rather than editing the original expense).
     - **Get Transactions** — reads the user's transactions to answer questions like "how much did I spend this week?", then summarizes them in the reply instead of dumping raw rows.
     - **Update Transaction** — corrects a mistake (wrong amount/category/date) in something already logged.
     - **Delete Transaction** — permanently removes an entry the user wants gone entirely.
   - Every one of those tools has its `user_id` filter **hard-coded to the verified user's id** (not something the AI fills in), so the model can never read, edit, or delete another user's data even if it tried.
   - If the amount or intent is ambiguous, the agent asks a short clarifying question instead of guessing.
4. The workflow's reply text flows back through `ask-proxy` to the chat UI, which also renders a small bar chart when the reply includes a category breakdown.

Voice input is handled entirely client-side by the browser's Web Speech API (no n8n or server involvement) — it just transcribes speech into the same text box.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema**: open the SQL editor in your Supabase project and run everything in [`supabase/schema.sql`](supabase/schema.sql). This creates the `profiles`, `categories`, `transactions`, `cards`, and `budgets` tables with row-level security, seeds the preset categories, and wires up a trigger that creates a `profiles` row whenever someone signs up.
3. **Enable Google sign-in** (optional but supported): in Supabase → Authentication → Providers → Google, follow their guide to add your OAuth client ID/secret.
4. **Copy the env file** and fill in your project's values (Settings → API in Supabase):
   ```bash
   cp .env.example .env
   ```
5. **Set up the Ask assistant** (optional): build the n8n workflow described above (webhook → verify user → AI Agent with OpenRouter → Supabase tools scoped to `user_id`), then set the Edge Function's secrets so `ask-proxy` can reach it:
   ```bash
   supabase secrets set N8N_ASK_WEBHOOK_URL=https://your-instance.app.n8n.cloud/webhook/your-path
   supabase secrets set N8N_ASK_WEBHOOK_SECRET=your-shared-secret
   ```
6. **Set up push notifications** (optional): generate a VAPID key pair —
   ```bash
   npx web-push generate-vapid-keys
   ```
   put the public key in `.env` as `VITE_VAPID_PUBLIC_KEY`, then set all three as Edge Function secrets so `sms-webhook` can send from them:
   ```bash
   supabase secrets set VAPID_PUBLIC_KEY=your-public-key
   supabase secrets set VAPID_PRIVATE_KEY=your-private-key
   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
   ```
   Without these three secrets set, `sendPushNotification` silently no-ops — SMS auto-logging still works, it just won't push a notification.
7. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
8. **Run tests**:
   ```bash
   npm test
   ```

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, React Router, Recharts, `vite-plugin-pwa`
- **Backend**: Supabase (Postgres + Auth + Row-Level Security + Edge Functions)
- **AI workflow**: n8n (Cloud), AI Agent node via OpenRouter, calling back into Supabase
- **Hosting**: Vercel
- **Tests**: Vitest + Testing Library

## Known follow-ups

- The production bundle is ~245 kB gzipped, mostly `recharts`; worth code-splitting the Insights route with `React.lazy` if load time on mobile networks becomes a concern.
- `pwa-icon.svg` is a placeholder app icon — swap it for real artwork before shipping.
