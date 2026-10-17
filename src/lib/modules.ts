import { CreditCard, LayoutDashboard, Landmark, ListTree, ReceiptText, Repeat, Settings, SplitSquareHorizontal, type LucideIcon } from "lucide-react";

export type Module = { href: string; label: string; icon: LucideIcon; ready: boolean };

export const MODULES: Module[] = [
  { href: "/visao-geral", label: "Visão geral", icon: LayoutDashboard, ready: true },
  { href: "/transacoes", label: "Transações", icon: ReceiptText, ready: true },
  { href: "/categorias", label: "Categorias", icon: ListTree, ready: true },
  { href: "/contas", label: "Contas", icon: Landmark, ready: true },
  { href: "/cartoes", label: "Cartões e faturas", icon: CreditCard, ready: false },
  { href: "/parcelamentos", label: "Parcelamentos", icon: SplitSquareHorizontal, ready: false },
  { href: "/assinaturas", label: "Assinaturas", icon: Repeat, ready: false },
  { href: "/configuracoes", label: "Configurações", icon: Settings, ready: true },
];
