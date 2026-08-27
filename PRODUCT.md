# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are individuals tracking their own personal spending, starting with the app's own creator/owner. The app also supports other people signing up and using it themselves (Supabase auth with login/signup), so it is not purely single-tenant, but the core workflows (SMS-based auto-logging, budgets, insights) are built around one person managing their own finances rather than shared/team accounts.

## Product Purpose

Expensely is a mobile-first personal expense tracker. It logs transactions (manually or automatically by parsing incoming bank/telecom SMS messages, including Arabic-language SMS), organizes them by card and category, tracks budgets, and surfaces spending insights. It also has an "Ask" page for AI-assisted queries about the user's own financial data.

## Positioning

Auto-logging transactions directly from SMS notifications (rather than requiring manual entry or bank API integration) is the app's differentiating mechanism, paired with a conversational "Ask" interface over the user's own transaction history.

## Operating Context

Installed as a PWA (manifest, apple-touch-icon, standalone/mobile-web-app meta tags) and used primarily on a phone. Core screens: Home (balance + recent transactions), History, Insights, Ask, Settings, plus Login/Signup. Data is stored in Supabase; an edge function (`ask-proxy`) backs the AI "Ask" feature.

## Capabilities and Constraints

- React 19 + TypeScript + Vite + Tailwind CSS v4, React Router, Supabase client, Recharts for charts.
- Light/dark/system theme already implemented via `ThemeContext` (toggles a `.dark` class on `<html>`); this is being kept as the mechanism, only the visual tokens/backgrounds change.
- Mobile-first layout with a bottom nav; pages own their own scroll (`h-full overflow-y-auto`) rather than the document scrolling, to keep fixed elements (bottom nav) stable during scroll.

## Brand Commitments

Name stays "Expensely" (confirmed — not open to renaming). The wordmark font is Sora (loaded via Google Fonts, `--font-brand`), kept distinct from the app's system-sans body text. The existing green identity (`#16a34a` / `#15803d`) is being fully retired in favor of a new blue-gradient identity (blue/black/white), per explicit user direction — this is a deliberate rebrand of color/mark, not the name or product mechanism.

## Evidence on Hand

No existing marketing copy, testimonials, or press — this is a personal/small-audience app, not a marketed product. Visual references for the new identity were supplied by the user as reference photos (iOS-style blurred mesh/blob wallpapers in blue/black/teal for dark mode and white/cream with pale blue blobs for light mode; blue-gradient abstract logo marks) and a reference screenshot of a banking-app home screen layout (balance header, pill action buttons, dark transactions card, pill bottom nav) — described in the design brief, not attached as files.

## Product Principles

- Keep the SMS-auto-logging and Ask-AI mechanisms untouched — this is a visual/brand rebrand, not a functional rework.
- Preserve the existing light/dark/system theme mechanism; only its color tokens and backgrounds change.
- Mobile-first: every screen must hold up on a real phone viewport first, desktop second.
- The new brand mark must work legibly on both light and dark surfaces without needing a different asset per theme where avoidable.
