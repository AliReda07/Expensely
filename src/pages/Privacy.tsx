import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { CONTACT_EMAIL, OPERATOR_NAME, PRIVACY_POLICY_UPDATED } from '../lib/legal';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{children}</div>
    </section>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * The privacy policy. Public (no sign-in), because people need to read it before they sign up.
 * It describes what the app actually does today; keep it in step with the code.
 */
export function Privacy() {
  const { user } = useAuth();

  return (
    <div className="mesh-bg h-full overflow-y-auto px-4 pb-16 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          to={user ? '/settings' : '/login'}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white dark:text-stone-200"
        >
          <ArrowLeft size={16} />
          Back
        </Link>

        <article className="space-y-6 rounded-2xl bg-white p-5 shadow-sm shadow-stone-200/60 dark:bg-stone-900 dark:shadow-black/40">
          <header className="space-y-2">
            <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">Privacy policy</h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">Last updated {PRIVACY_POLICY_UPDATED}</p>
            <p className="rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              Expensely is a prototype. This is a plain-language description of what it does with your data today. It has not yet been
              reviewed by a lawyer, and the permits and registrations that Egypt&apos;s Personal Data Protection Law (No. 151 of 2020) may
              require are not in place yet. Please use real financial data only if you are comfortable with that.
            </p>
          </header>

          <Section title="Who is responsible">
            <p>
              {OPERATOR_NAME ? `${OPERATOR_NAME}, an individual in Egypt,` : 'The individual developer of Expensely, in Egypt,'} runs this app
              and decides how your data is used.
            </p>
            <p>
              {CONTACT_EMAIL ? (
                <>
                  Contact for anything in this policy: <a className="font-semibold text-brand" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                </>
              ) : (
                'A contact email will be listed here before the app is opened to other people.'
              )}
            </p>
          </Section>

          <Section title="What we collect">
            <List
              items={[
                <><strong>Your account:</strong> your email address, and either a password (stored only as a hash by our sign-in provider) or the email and name Google shares when you choose &quot;Continue with Google&quot;.</>,
                <><strong>What you enter:</strong> transactions (amount, category, date, and a note), cards (name, last four digits, balance, payment due day), budgets, and installment plans.</>,
                <><strong>Bank SMS, if you turn on auto-logging:</strong> the text of the SMS you forward and who sent it (used to recognise your bank). We use it to create a transaction, and up to 300 characters of the text can be kept in that transaction&apos;s note.</>,
                <><strong>Notifications:</strong> if you enable push, your browser&apos;s push address and keys, so we can send you reminders and alerts.</>,
                <><strong>The AI assistant, when you use it:</strong> your message, your category names, the results of your own transaction look-ups, and any receipt photo you send. We do not keep your chat or your photos; we keep only a count of how many messages you have used. Anything it logs for you is saved as an ordinary transaction.</>,
                <><strong>Family, if you use it:</strong> which family you belong to, your role, what you chose to share, the budgets an owner sets for you, and invitations (stored only as a one-way hash, never as the link itself).</>,
                <><strong>Technical data:</strong> the ordinary logs our hosting providers keep (for example IP address and request times) to run and protect the service.</>,
              ]}
            />
          </Section>

          <Section title="Why we use it">
            <List
              items={[
                'To run the app: show your balance, budgets, insights and installment plans.',
                'To create transactions from your bank SMS when you ask us to.',
                'To send reminders (card payments, installments) and alerts (such as family budget alerts) by push and, for card payment reminders, email.',
                'To answer your questions and log entries when you use the AI assistant, and to read receipts you photograph.',
                'To let family members share what they choose with the family owner.',
                'To keep the service secure and prevent abuse, for example by limiting how many AI messages an account can send.',
              ]}
            />
            <p>We do not sell your data and we do not show ads.</p>
          </Section>

          <Section title="Who else handles your data">
            <p>We use these services to run the app. They process data on our behalf:</p>
            <List
              items={[
                <><strong>Supabase</strong>: our database, sign-in and server functions (hosted in the European Union).</>,
                <><strong>Vercel</strong>: hosts the website and app.</>,
                <><strong>OpenRouter</strong>, and the AI model provider it routes your request to: only when you use the AI assistant or scan a receipt.</>,
                <><strong>Resend</strong>: delivers reminder emails.</>,
                <><strong>Google</strong>: only if you sign in with Google.</>,
                <><strong>Your browser&apos;s push service</strong> (for example Apple, Google or Mozilla): delivers push notifications.</>,
              ]}
            />
            <p>
              If you are in a family, the family owner also sees what you have chosen to share (see below). We share data with authorities only
              where the law requires it.
            </p>
          </Section>

          <Section title="Data leaving Egypt">
            <p>
              The services above store or process data outside Egypt, including in the European Union and, for the AI assistant, in other
              countries such as the United States. Your data leaves Egypt whenever you use the app.
            </p>
          </Section>

          <Section title="Family sharing">
            <p>
              A family owner can see what members share. An <strong>adult</strong> chooses to share everything, only selected cards, or category
              totals only, can hide individual transactions, and can change this or leave at any time. Notes on shared transactions are visible
              to the owner.
            </p>
            <p>
              A <strong>child</strong> member shares everything they log, including notes and transactions created from bank SMS, and cannot hide
              any of it. The child role is part of the prototype and has not been reviewed against Egypt&apos;s special rules for children&apos;s
              data. Please do not use it with real children&apos;s data yet.
            </p>
            <p>Nothing is shared until a member has read what will be shared and agreed. Leaving a family stops the sharing straight away; you keep all your own data.</p>
          </Section>

          <Section title="How long we keep it">
            <p>
              We keep your data until you delete your account. You can delete individual transactions, cards, budgets and installment plans
              yourself at any time. To remove everything, use <strong>Settings → Delete my account</strong>: your data is deleted from our
              database straight away and cannot be recovered. Copies held in our providers&apos; backups or logs are removed on their normal
              schedules, and the AI provider may keep requests for a time under its own policy.
            </p>
          </Section>

          <Section title="Your rights">
            <p>You can:</p>
            <List
              items={[
                <>get a copy of your data: <strong>Settings → Download my data</strong> gives you a file with everything in your account;</>,
                'correct data that is wrong: you can edit your transactions, cards, budgets and plans yourself in the app;',
                <>delete your account and all its data: <strong>Settings → Delete my account</strong>;</>,
                'stop us using your data for a purpose, or withdraw a consent you gave.',
              ]}
            />
            <p>
              For anything the app does not cover, email the contact above. We aim to answer within 6 working days. The download file leaves
              out other people&apos;s data and secrets such as your SMS link and notification keys.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data travels over HTTPS. The database only returns your own rows to you, and family access goes through restricted server
              functions that return only what members have chosen to share. Invitation links are stored only as hashes. No system is perfectly
              secure. If a breach affects your data we will tell you and the authorities as the law requires.
            </p>
          </Section>

          <Section title="Children">
            <p>
              Expensely is not aimed at children. Anyone under 18 should use it only with a parent or guardian&apos;s knowledge. See Family
              sharing above for how the child role works.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>We will update the date at the top when this policy changes in a way that matters, and tell you in the app if the change is significant.</p>
          </Section>
        </article>
      </div>
    </div>
  );
}
