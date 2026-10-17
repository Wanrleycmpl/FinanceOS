import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink">
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-brand text-brand-ink">F</span>
      FinanceOS
    </Link>
  );
}
