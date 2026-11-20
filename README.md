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
- **Ask** — a chat page where you type or speak things like *"spent 50 on food"* or *"can I afford a 5000 trip?"*, and an AI assistant (OpenRouter) logs, corrects, or deletes transactions and answers questions about your spending. See [How the Ask assistant works](#how-the-ask-assistant-works) below.
- **SMS auto-logging** — forward a bank transaction SMS to a webhook (e.g. via an iOS Shortcut, or MacroDroid on Android), authenticated with a per-user token sent in an `x-sms-token` header, and it's parsed and logged automatically. This path is fully deterministic (no LLM involved) so the same message always produces the same result — see `supabase/functions/sms-webhook`.
- **Push notifications** — a real (Web Push) notification when SMS auto-logging books a transaction, so it reaches you even if the app isn't open at the time. Enabled per-device from Settings → Push notifications. See `src/sw.ts` and `supabase/functions/_shared/push.ts`.
- **Installable PWA** (add to home screen)

## How the Ask assistant works

The **Ask** tab is a natural-language front end for the same `transactions` table the rest of the app uses. There is no separate workflow engine: one Supabase Edge Function does everything.

1. **Frontend** (`src/pages/Ask.tsx`) sends the typed or voice-transcribed message and the user's currency to the `ask-proxy` Edge Function.
2. **`ask-proxy`** (`supabase/functions/ask-proxy/index.ts`) verifies the caller's Supabase session, loads their categories, then calls an LLM through **OpenRouter** with a system prompt (today's date, currency, categories) and four tools:
   - **log_transaction** — inserts an expense or income row (a refund is logged as new income, not an edit of the original expense).
   - **get_transactions** — reads a date range and returns server-computed totals, so the model never does the arithmetic itself.
   - **update_transaction** / **delete_transaction** — correct or remove an existing entry.
3. The tools run through a Supabase client carrying the **caller's own JWT**, so row-level security applies, and every query also filters on the verified `user_id`. The model can never read, edit, or delete another user's data.
4. **Receipt photos**: the camera button on the Ask page lets you snap or pick a photo of a receipt or invoice. The browser downscales it (`src/lib/image.ts`), `ask-proxy` passes it to a vision-capable model, and the model logs one expense for the total, with the merchant as the note. Set `OPENROUTER_VISION_MODEL` to use a different model for photos (defaults to `OPENROUTER_MODEL`).
5. The model can call tools for up to five rounds; its final text reply goes back to the chat UI. If the amount or intent is ambiguous, it asks a short clarifying question instead of guessing.

Voice input is handled entirely client-side by the browser's Web Speech API (no server involvement) — it just transcribes speech into the same text box.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema**: open the SQL editor in your Supabase project and run everything in [`supabase/schema.sql`](supabase/schema.sql). This creates the `profiles`, `categories`, `transactions`, `cards`, and `budgets` tables with row-level security, seeds the preset categories, and wires up a trigger that creates a `profiles` row whenever someone signs up.
3. **Enable Google sign-in** (optional but supported): in Supabase → Authentication → Providers → Google, follow their guide to add your OAuth client ID/secret.
4. **Copy the env file** and fill in your project's values (Settings → API in Supabase):
   ```bash
   cp .env.example .env
   ```
5. **Set up the Ask assistant** (optional): create an [OpenRouter](https://openrouter.ai) API key, then set it as an Edge Function secret and deploy:
   ```bash
   supabase secrets set OPENROUTER_API_KEY=your-openrouter-key
   supabase secrets set OPENROUTER_MODEL=openai/gpt-4o-mini   # optional; any tool-calling model
   supabase functions deploy ask-proxy
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
- **AI assistant**: Supabase Edge Function (`ask-proxy`) calling OpenRouter with tool use, scoped to the signed-in user by RLS
- **Hosting**: Vercel
- **Tests**: Vitest + Testing Library

## Known follow-ups

- The production bundle is ~245 kB gzipped, mostly `recharts`; worth code-splitting the Insights route with `React.lazy` if load time on mobile networks becomes a concern.
- `pwa-icon.svg` is a placeholder app icon — swap it for real artwork before shipping.
