import "server-only";
import crypto from "node:crypto";

// Cifra segredos guardados no banco (hoje: o acesso da Página do Facebook da
// conexão com a Meta, 2026-10-21). AES-256-GCM com chave derivada do
// SESSION_SECRET — quem tem só o banco não consegue usar o acesso.

function chave(finalidade: string): Buffer {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo) throw new Error("SESSION_SECRET não configurado.");
  return crypto.createHash("sha256").update(`${finalidade}:${segredo}`).digest();
}

/** "v1:<iv>:<tag>:<dados>" em base64url. */
export function cifrar(texto: string, finalidade: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chave(finalidade), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), dados.toString("base64url")].join(":");
}

export function decifrar(cifrado: string, finalidade: string): string {
  const [versao, iv, tag, dados] = cifrado.split(":");
  if (versao !== "v1" || !iv || !tag || !dados) throw new Error("Segredo guardado em formato desconhecido.");
  const d = crypto.createDecipheriv("aes-256-gcm", chave(finalidade), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

/** Assinatura curta (HMAC) pra links públicos temporários. */
export function assinar(texto: string, finalidade: string): string {
  return crypto.createHmac("sha256", chave(finalidade)).update(texto).digest("base64url").slice(0, 32);
}

export function assinaturaConfere(texto: string, assinatura: string, finalidade: string): boolean {
  const esperada = Buffer.from(assinar(texto, finalidade));
  const veio = Buffer.from(assinatura);
  return veio.length === esperada.length && crypto.timingSafeEqual(veio, esperada);
}
