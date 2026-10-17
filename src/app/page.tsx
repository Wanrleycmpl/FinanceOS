import { redirect } from "next/navigation";

// Single-user app: no public landing page. The proxy sends visitors without a session to /entrar.
export default function Home() {
  redirect("/visao-geral");
}
