import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";

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

/**
 * Rotas que servem arquivo tanto pro whatsapp-service (Bearer token) quanto
 * pro navegador de um usuário logado (cookie de sessão) — ex: PDFs que
 * precisam ser baixados tanto no fluxo automático de WhatsApp quanto
 * clicados direto no chat do CRM.
 */
export async function requireApiOuSessaoUser(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) {
    const usuario = await getUserFromApiToken(token);
    if (usuario) return usuario;
  }
  const usuarioSessao = await getSessionUser();
  if (usuarioSessao) return usuarioSessao;
  throw new Response(JSON.stringify({ error: "Não autenticado" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
