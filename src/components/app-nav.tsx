"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="grid gap-1">
      {MODULES.map(({ href, label, icon: Icon, ready }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-brand/12 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon aria-hidden className="size-4" />
              <span className="flex-1">{label}</span>
              {!ready && <span className="text-[10px] uppercase tracking-wide text-muted/70">em breve</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppNav() {
  // Links close the drawer themselves (onNavigate), so no effect on route change is needed.
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface px-4 py-5 lg:flex">
        <Brand href="/visao-geral" />
        <nav aria-label="Principal"><NavLinks /></nav>
      </aside>

      {/* Mobile: top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <Brand href="/visao-geral" />
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-controls="menu-movel"
          className="grid size-10 place-items-center rounded-lg text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand"
        >
          {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
          <span className="sr-only">{open ? "Fechar menu" : "Abrir menu"}</span>
        </button>
      </div>
      {open && (
        <nav id="menu-movel" aria-label="Principal" className="fixed inset-x-0 top-[65px] bottom-0 z-20 overflow-y-auto border-t border-line bg-surface px-4 py-4 lg:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      )}
    </>
  );
}
