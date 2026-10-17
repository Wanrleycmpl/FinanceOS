import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xl shadow-black/20">{children}</div>
      </div>
    </main>
  );
}
