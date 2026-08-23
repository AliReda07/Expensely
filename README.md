# Expense Tracker

Mobile-format expense tracker — React + TypeScript + Vite + Tailwind, installable as a PWA, backed by Supabase.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the schema**: open the SQL editor in your Supabase project and run everything in [`supabase/schema.sql`](supabase/schema.sql). This creates the `profiles`, `categories`, `transactions`, and `budgets` tables with row-level security, seeds the preset categories, and wires up a trigger that creates a `profiles` row whenever someone signs up.
3. **Enable Google sign-in** (optional but supported): in Supabase → Authentication → Providers → Google, follow their guide to add your OAuth client ID/secret.
4. **Copy the env file** and fill in your project's values (Settings → API in Supabase):
   ```bash
   cp .env.example .env
   ```
5. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
6. **Run tests**:
   ```bash
   npm test
   ```

## What's here

- Email/password + Google auth (Supabase Auth)
- Starting balance + income/expense transactions → live balance
- Overall + per-category monthly budgets with progress bars
- Preset categories plus user-created custom categories (icon + color)
- Recent transactions on Home, full searchable/filterable History with edit & delete
- Insights: category breakdown (pie) + 6-month spending trend, browsable by month
- Installable PWA (add to home screen)

## Known follow-ups

- The production bundle is ~245 kB gzipped, mostly `recharts`; worth code-splitting the Insights route with `React.lazy` if load time on mobile networks becomes a concern.
- `pwa-icon.svg` is a placeholder app icon — swap it for real artwork before shipping.
- Chatbot + voice-message expense entry are planned next; the data model (a single `transactions` table with `type`/`amount`/`category_id`/`note`) is deliberately entry-source-agnostic so a chatbot or voice flow can insert rows the same way the UI does.
