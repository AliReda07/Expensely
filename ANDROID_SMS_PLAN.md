# Android SMS auto-logging — implementation plan

## Diagnosis: what exists today

SMS auto-logging is **already fully functional on Android**. What is missing is *only the
setup instructions* — every word of the in-app guide is written for iOS Shortcuts.

The backend is platform-agnostic and needs no change to accept Android traffic:

- `supabase/functions/sms-webhook/index.ts` — accepts any `POST` to
  `/functions/v1/sms-webhook/<token>`. It does **not** inspect `Content-Type`, `User-Agent`,
  or `Origin`; CORS is deliberately wide open (see the comment at the top of the file) because
  the caller is a phone-side automation and the URL token is the whole auth story. It reads
  `await req.text()` and hands the raw string to `parseSmsPayload`.
- `supabase/functions/_shared/categorize.ts:69` — `parseSmsPayload(raw)` tries `JSON.parse`
  first and accepts `{ "message": "...", "sender": "..." }`; anything that is not JSON with a
  string `message` is treated as the plain-text message body with `sender = null`.

So any Android automation that can POST either a plain-text body or that JSON shape already
works. The gap is documentation plus one payload-robustness fix that Android makes much more
likely to be hit (see Step 3).

### Files that need to change

| File | Why |
| --- | --- |
| `src/components/SmsAutoLogSheet.tsx` | The whole setup guide. Currently iOS-only ("Set up in iOS Shortcuts", "Ask Before Running", "Shortcut Input"). |
| `src/components/AddCardForm.tsx:177-180` | The `bank_sender` helper text says "an alphanumeric ID that iOS can't filter by" — on Android that restriction largely does not apply, so the copy actively steers Android users away from the path that works best for them. |
| `supabase/functions/_shared/categorize.ts` (`parseSmsPayload`) | Harden JSON parsing against raw newlines inside the message — see Step 3. |
| `supabase/functions/_shared/categorize.test.ts` (`describe('parseSmsPayload')`, line ~855) | Tests for the above. |
| `README.md:16` | Says "(e.g. via an iOS Shortcut)" — widen to cover Android. |

---

## Step 1 — Platform switch in `SmsAutoLogSheet.tsx`

Add local state `platform: 'ios' | 'android'` and render the instruction block for the
selected platform. Everything above the instructions (token generation, webhook URL, copy
button, regenerate button) and everything below it (the "phrase" and "sender" sections) stays
shared and platform-independent.

**Default the switch by user agent**, so most users never touch it:

```ts
const [platform, setPlatform] = useState<'ios' | 'android'>(
  () => (/Android/i.test(navigator.userAgent) ? 'android' : 'ios'),
);
```

`src/hooks/useInstallPrompt.ts:13,37` already does exactly this style of UA sniffing in this
codebase, so this matches house precedent — do **not** add a dependency for it.

**Reuse the existing segmented-control markup**, do not invent a new one. Copy the pattern
from `src/components/AddCardForm.tsx:110-125` (identical to
`src/components/AddTransactionSheet.tsx:127-139`): a `relative flex rounded-xl bg-stone-100
p-1 dark:bg-stone-700` wrapper, an absolutely-positioned sliding `bg-white` pill at
`width: 'calc(50% - 4px)'` with `transform: translateX(...)`, and two `type="button"` options
carrying `aria-pressed`. Place it where the `<p>Set up in iOS Shortcuts</p>` label is today
(line ~89), replacing that label.

Keep the intro paragraph (line ~57) but make it platform-neutral: replace "just a Shortcut on
your phone" with wording like "just a small automation on your phone that watches for the
message and sends its text here."

---

## Step 2 — Android instructions content

Two paths, because they trade off differently. Show **MacroDroid as the primary** (Play Store,
GUI, no sideloading) and the open-source forwarder as a short alternative underneath.

### 2a. Primary: MacroDroid (mirrors the iOS flow step for step)

Ordered list, same `<ol className="mb-2 list-decimal space-y-1.5 pl-4 text-xs ...">` styling as
the iOS list:

1. Install **MacroDroid** from the Play Store and grant it SMS permission.
2. Add a macro → **Trigger** → *SMS/Call* → **SMS Received**. Set the sender to *Any Sender*
   and turn on the message-content filter, set to **contains** a word every bank text has —
   e.g. your currency code. One macro like this can cover every bank you have.
3. **Action** → *Connectivity* → **HTTP Request**. Method **POST**, URL = the link above.
4. Content type **text/plain**, and set the body to the magic text `{sms_message}`.
5. Save the macro, then exclude MacroDroid from battery optimization (Android will otherwise
   kill it in the background and messages will silently stop logging).

Accuracy notes for the executor: MacroDroid's magic text for the message body is
`{sms_message}` and the sender number is `{sms_number}` (per the MacroDroid wiki,
https://macrodroidforum.com/wiki/index.php/Magic_text). Use those exact tokens in the copy — a
wrong variable name is a silent failure the user cannot debug.

Step 5 (battery optimization) has no iOS equivalent and is the single most common reason
Android SMS automations stop firing after a day. Do not drop it for brevity.

Plain text is the right default body here (not JSON) for the same reason it is on iOS: it
sidesteps every quoting problem, and the endpoint accepts it directly.

### 2b. Alternative: open-source forwarder

One short paragraph, not a numbered list:

> Prefer an app that does only this? **Incoming SMS to URL forwarder**
> (`github.com/bogkonstantin/android_income_sms_gateway_webhook`, free and open source) works
> too — point it at the link above and set its JSON template to
> `{"message":"%text%","sender":"%from%"}`. It is not on the Play Store (Google restricts SMS
> permissions), so you install it from F-Droid or its GitHub releases.

Flag the sideloading honestly rather than burying it — that is the user's call to make.

### 2c. Rewrite the "Advanced: matching by sender" section for both platforms

This is the section whose meaning changes most on Android. Today (line ~114) it says sender
matching "Only works if your phone's Message automation can actually filter by that bank as a
sender — many banks send from an alphanumeric ID rather than a real contact, which iOS often
can't filter by at all."

On Android that caveat largely disappears: MacroDroid's SMS Received trigger and the forwarder
app both filter on the raw sender string, alphanumeric sender IDs included. So the rewritten
section should say, in effect: on iOS this is often impractical; on Android it is the
*recommended* path when your bank never prints the card's last 4 digits.

Android mechanics for it:

- MacroDroid: give that bank its own macro with the trigger's sender set to the bank's sender
  ID, content type **application/json**, and body
  `{"message":"{sms_message}","sender":"HSBC"}` — where `HSBC` is any label you type yourself,
  entered identically as the card's "Bank SMS sender" in Settings → Cards.
- Forwarder app: set its sender filter to the bank and its template's `sender` to that label.

Keep the existing "If your bank never mentions the card's last 4 digits" phrase section
unchanged and platform-independent — it is matched server-side against the message text and
needs no phone-side cooperation at all (`matchCardByPhrase`, `categorize.ts:102`).

---

## Step 3 — Harden `parseSmsPayload` against raw newlines in JSON bodies

**Why this belongs in this change:** on iOS the sender path is a rarely-used advanced fallback,
so the JSON body shape is rarely exercised. On Android it becomes the *mainstream* path for
banks without last-4 digits (Step 2c). Both Android tools build that JSON by string
substitution — MacroDroid pastes `{sms_message}` straight into the body, the forwarder pastes
`%text%`. Bank SMS are routinely multi-line. A literal newline inside a JSON string is invalid
JSON, so `JSON.parse` throws and `parseSmsPayload` falls through to its plain-text branch —
silently storing `{"message":"EGP 300 debited` … as the message text and losing the sender
entirely. The transaction may still parse (the amount survives), so the failure is invisible:
the note is polluted with JSON scaffolding and the card is never resolved.

**Fix** in `supabase/functions/_shared/categorize.ts:69`. Keep the current behavior exactly as
it is, and add one retry between the failed parse and the plain-text fallback: if the trimmed
body starts with `{`, re-attempt `JSON.parse` on a copy with unescaped control characters
inside the string escaped (newline → `\\n`, carriage return → `\\r`, tab → `\\t`). If that
retry also fails, fall through to the existing plain-text return unchanged. Do not attempt to
repair unescaped double quotes — that is ambiguous and risks mangling a legitimate message;
leave it to the plain-text fallback.

Add a comment explaining *why*, in the style of the surrounding comments in that file.

**Tests** — extend `describe('parseSmsPayload')` in
`supabase/functions/_shared/categorize.test.ts` (~line 855) with:

- a JSON body whose `message` contains a real newline, asserting message and sender both come
  out intact and the newline survives in the message;
- a body starting with `{` that is unrepairable, asserting the existing plain-text fallback
  still returns the raw string with `sender: null` (guards against the retry swallowing the
  fallback);
- confirm the existing seven cases at lines 857-899 still pass unchanged.

Run with:

```bash
npm test
```

---

## Step 4 — Copy fixes outside the sheet

- `src/components/AddCardForm.tsx:177-180`: change "(many banks send from an alphanumeric ID
  that iOS can't filter by)" to something like "(on iOS many banks send from an alphanumeric ID
  that can't be filtered by; Android automation apps generally can)". Same meaning, no longer
  discourages the Android user from the path that works best for them.
- `README.md:16`: "(e.g. via an iOS Shortcut)" → "(e.g. via an iOS Shortcut or an Android
  automation app)".

---

## Explicitly out of scope

- No backend endpoint changes, no new route, no auth change — the existing webhook already
  accepts Android traffic as-is.
- No database migration. `sms_token`, `bank_sender`, and `sms_match_phrases` are all
  platform-neutral and unchanged.
- No native Android app and no Play Store listing. This app is a PWA; the automation lives in
  a third-party app the user installs.

## Verification

1. `npm test` — the `parseSmsPayload` suite, including the new cases.
2. `npm run lint` and `npm run build`.
3. Open Settings → SMS auto-logging in the dev server; confirm the segmented control defaults
   to Android under a mobile Android user agent and to iOS otherwise, that both instruction
   sets render, and that the sliding pill animates like the one in Add Card.
4. Optional end-to-end check without a phone — plain text and the multi-line JSON shape should
   both log, and the JSON one should resolve the card by sender:

```bash
printf '{"message":"EGP 300.00 debited\nfrom card 1234","sender":"HSBC"}' | curl -X POST "$SUPABASE_URL/functions/v1/sms-webhook/$SMS_TOKEN" --data-binary @-
```
