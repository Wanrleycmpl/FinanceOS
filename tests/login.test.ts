import { describe, expect, it } from "vitest";
import { loginToEmail } from "@/lib/login";

describe("login de usuário único", () => {
  it("transforma o nome de usuário no e-mail interno do Supabase", () => {
    expect(loginToEmail("wanrley")).toBe("wanrley@financeos.local");
    expect(loginToEmail("  Wanrley ")).toBe("wanrley@financeos.local");
  });
  it("aceita e-mail completo como está", () => {
    expect(loginToEmail("Pessoa@Exemplo.com")).toBe("pessoa@exemplo.com");
  });
  it("recusa entradas inválidas", () => {
    for (const bad of ["", "ab", "com espaço", "a@b", "x".repeat(41)]) expect(loginToEmail(bad), bad).toBeNull();
  });
});
