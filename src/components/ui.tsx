// Small UI kit in the shadcn/ui style (Tailwind + cva), kept in one file while it is small.
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-ink hover:bg-brand/90",
        secondary: "border border-line bg-surface-2 text-ink hover:bg-surface-3",
        ghost: "text-muted hover:bg-surface-2 hover:text-ink",
        danger: "border border-danger/40 text-danger hover:bg-danger/10",
      },
      size: { md: "h-10 px-4", sm: "h-8 px-3 text-xs" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const fieldClass = "h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-muted/70 focus-visible:outline-2 focus-visible:outline-brand aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClass, "pr-8", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-xl border border-line bg-surface p-5", className)} {...props} />;
}

export function Badge({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center rounded-full border border-line px-2 py-0.5 text-xs text-muted", className)} {...props} />;
}

export function FormMessage({ state }: { state: { error?: string; ok?: string } | undefined }) {
  if (!state?.error && !state?.ok) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={cn("rounded-lg px-3 py-2 text-sm", state.error ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand")}>
      {state.error ?? state.ok}
    </p>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}
