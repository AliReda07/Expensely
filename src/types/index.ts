export type TransactionType = 'expense' | 'income';

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  icon: string;
  color: string;
  is_preset: boolean;
}

export type CardType = 'debit' | 'credit';

/**
 * A payment card. Only the last four digits are ever stored, never a full card number.
 *
 * Debit and credit cards run opposite balance math: a debit card's balance is money
 * available (starting_balance + income - expenses); a credit card's balance is a
 * liability, the amount owed (starting_balance + expenses - income).
 */
export interface Card {
  id: string;
  user_id: string;
  name: string;
  last4: string | null;
  color: string;
  type: CardType;
  starting_balance: number;
  /** Credit cards only: the card's limit, used to show available credit (limit - owed). */
  credit_limit: number | null;
  /** The bank's SMS sender name/hotline, used by the SMS webhook as a fallback match
   *  when a bank's texts never include the card's last 4 digits. */
  bank_sender: string | null;
  /** Phrases unique to this bank's SMS templates, used by the SMS webhook as a fallback
   *  match when neither the last 4 digits nor bank_sender resolve the card. A list
   *  because the same bank can describe the same card differently across message types
   *  (e.g. a transfer notice vs. a purchase notice). */
  sms_match_phrases: string[];
  /** Credit cards only: the day of the month (1-31) the bill is due. Null means the
   *  card opts out of payment reminders entirely -- there's no separate toggle. */
  payment_due_day: number | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
  /** null means cash / unassigned rather than a specific card. */
  card_id: string | null;
  date: string;
  note: string | null;
  created_at: string;
}

export interface TransactionWithCategory extends Transaction {
  category: Category | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
}

export interface Profile {
  id: string;
  starting_balance: number;
  overall_budget: number | null;
  currency: string;
  sms_token: string | null;
}
