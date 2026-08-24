export type TransactionType = 'expense' | 'income';

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  icon: string;
  color: string;
  is_preset: boolean;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount: number;
  category_id: string | null;
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
