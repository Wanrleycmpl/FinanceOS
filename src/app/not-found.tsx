import Link from "next/link";
import { buttonVariants } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="grid justify-items-center gap-4">
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-muted">O endereço pode ter mudado.</p>
        <Link href="/" className={buttonVariants()}>Voltar ao início</Link>
      </div>
    </main>
  );
}
