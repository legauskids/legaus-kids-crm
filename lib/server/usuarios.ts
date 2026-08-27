import "server-only";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { MODULOS, type ModuloKey, type Permissoes } from "@/lib/auth/permissoes";

export type UsuarioPainelVM = {
  id: string;
  username: string;
  nome: string;
  papel: string;
  isAdmin: boolean;
  permissoes: Permissoes;
};

function paraVM(u: { id: string; username: string; nome: string; papel: string; isAdmin: boolean; permissoes: unknown }): UsuarioPainelVM {
  return { ...u, permissoes: (u.permissoes ?? {}) as Permissoes };
}

export async function listarUsuariosParaPainel(usuarioAtual: { id: string; isAdmin: boolean }): Promise<{
  eu: UsuarioPainelVM;
  outros: UsuarioPainelVM[];
}> {
  const usuarios = await prisma.user.findMany({
    select: { id: true, username: true, nome: true, papel: true, isAdmin: true, permissoes: true },
    orderBy: { nome: "asc" },
  });
  const eu = usuarios.find((u) => u.id === usuarioAtual.id);
  if (!eu) throw new Error("Usuário não encontrado");

  const outros = usuarioAtual.isAdmin ? usuarios.filter((u) => u.id !== usuarioAtual.id) : [];
  return { eu: paraVM(eu), outros: outros.map(paraVM) };
}

export async function trocarPropriaSenha(userId: string, senhaAtual: string, novaSenha: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new Error("Usuário não encontrado");

  const senhaOk = await verifyPassword(senhaAtual, user.passwordHash);
  if (!senhaOk) throw new Error("Senha atual incorreta");
  if (novaSenha.length < 6) throw new Error("A nova senha precisa ter pelo menos 6 caracteres");

  const passwordHash = await hashPassword(novaSenha);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

export async function adminTrocarSenhaDeUsuario(
  adminId: string,
  usuarioAlvoId: string,
  novaSenha: string,
): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { isAdmin: true } });
  if (!admin?.isAdmin) throw new Error("Só um administrador pode trocar a senha de outro usuário");
  if (novaSenha.length < 6) throw new Error("A nova senha precisa ter pelo menos 6 caracteres");

  const passwordHash = await hashPassword(novaSenha);
  await prisma.user.update({ where: { id: usuarioAlvoId }, data: { passwordHash } });
}

export async function adminAtualizarPermissoes(
  adminId: string,
  usuarioAlvoId: string,
  modulo: ModuloKey,
  visivel: boolean,
): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId }, select: { isAdmin: true } });
  if (!admin?.isAdmin) throw new Error("Só um administrador pode alterar permissões");
  if (!MODULOS.includes(modulo)) throw new Error("Módulo inválido");

  const alvo = await prisma.user.findUnique({ where: { id: usuarioAlvoId }, select: { permissoes: true } });
  if (!alvo) throw new Error("Usuário não encontrado");

  const permissoesAtuais = (alvo.permissoes ?? {}) as Permissoes;
  const permissoes = { ...permissoesAtuais, [modulo]: visivel };
  await prisma.user.update({ where: { id: usuarioAlvoId }, data: { permissoes } });
}
