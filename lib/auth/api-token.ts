import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

export async function getUserFromApiToken(token: string) {
  if (!token) return null;
  return prisma.user.findUnique({ where: { apiToken: token } });
}

export async function gerarApiToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { apiToken: token } });
  return token;
}

/**
 * Autentica uma requisição vinda da extensão (header `Authorization: Bearer <token>`),
 * separado da sessão por cookie usada pelo navegador. Lança uma Response 401
 * pronta pra ser retornada direto pela rota se o token faltar ou for inválido.
 */
export async function requireApiUser(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const user = await getUserFromApiToken(token);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}
