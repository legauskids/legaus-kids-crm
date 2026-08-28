"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/guards";
import { criarContato, atualizarContato, excluirContato } from "@/lib/server/contatos";
import { buscarDadosCnpj } from "@/lib/server/cnpj";
import { criarContatoSchema, atualizarContatoSchema } from "@/lib/validators/contato";

export type ContatoFormState = { error?: string; success?: boolean };

export async function criarContatoAction(
  _prevState: ContatoFormState,
  formData: FormData,
): Promise<ContatoFormState> {
  await requireUser();
  const parsed = criarContatoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    await criarContato({
      nome: parsed.data.nome,
      telefone: parsed.data.telefone || null,
      empresa: parsed.data.empresa || null,
      tipo: parsed.data.tipo,
      cnpj: parsed.data.cnpj || null,
      razaoSocial: parsed.data.razaoSocial || null,
      endereco: parsed.data.endereco || null,
      cidade: parsed.data.cidade || null,
      uf: parsed.data.uf || null,
      cep: parsed.data.cep || null,
      email: parsed.data.email || null,
    });
  } catch {
    return { error: "Já existe um cadastro com esse telefone." };
  }

  revalidatePath("/cadastros");
  return { success: true };
}

export async function atualizarContatoAction(
  _prevState: ContatoFormState,
  formData: FormData,
): Promise<ContatoFormState> {
  await requireUser();
  const parsed = atualizarContatoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const tags = parsed.data.tags
    ? parsed.data.tags.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  await atualizarContato(parsed.data.contatoId, {
    nome: parsed.data.nome,
    empresa: parsed.data.empresa || null,
    telefone: parsed.data.telefone || null,
    tags,
    cnpj: parsed.data.cnpj || null,
    razaoSocial: parsed.data.razaoSocial || null,
    endereco: parsed.data.endereco || null,
    cidade: parsed.data.cidade || null,
    uf: parsed.data.uf || null,
    cep: parsed.data.cep || null,
    email: parsed.data.email || null,
  });

  revalidatePath("/cadastros");
  return { success: true };
}

export async function excluirContatoAction(contatoId: string): Promise<void> {
  await requireUser();
  await excluirContato(contatoId);
  revalidatePath("/cadastros");
}

export type BuscarCnpjState = {
  error?: string;
  dados?: {
    razaoSocial: string;
    nomeFantasia: string | null;
    telefone: string | null;
    endereco: string;
    cidade: string;
    uf: string;
    cep: string;
  };
};

export async function buscarCnpjAction(cnpj: string): Promise<BuscarCnpjState> {
  await requireUser();
  try {
    const dados = await buscarDadosCnpj(cnpj);
    return { dados };
  } catch (erro) {
    return { error: erro instanceof Error ? erro.message : "Não foi possível buscar o CNPJ." };
  }
}
