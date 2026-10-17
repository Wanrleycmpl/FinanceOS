import "server-only";
import { requireUser } from "@/lib/auth";
import type { CategoryKind } from "@/lib/catalog";

export type AccountKind = "checking" | "savings" | "wallet" | "cash";
export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  wallet: "Carteira digital",
  cash: "Dinheiro",
};

export type Account = {
  id: string;
  institution_id: string;
  institution_name: string;
  name: string;
  kind: AccountKind;
  opening_balance_cents: string; // exact cents as text
  opening_date: string;
  archived_at: string | null;
};

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  kind: CategoryKind;
  template_key: string | null;
  sort_order: number;
  archived_at: string | null;
};

// Every read goes through requireUser(): the session is validated and RLS limits rows to the owner.
export async function getAccounts(): Promise<Account[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("accounts_read")
    .select("id, institution_id, institution_name, name, kind, opening_balance_cents, opening_date, archived_at")
    .order("institution_name")
    .order("name");
  if (error) throw new Error("Não foi possível carregar as contas. Confira se a migration foi aplicada.");
  return data as Account[];
}

export async function getCategories(): Promise<Category[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, name, kind, template_key, sort_order, archived_at")
    .order("sort_order")
    .order("name")
    .limit(2000);
  if (error) throw new Error("Não foi possível carregar as categorias. Confira se a migration foi aplicada.");
  return data as Category[];
}

export async function getProfile() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { email: user.email ?? "", displayName: data?.display_name ?? "" };
}
