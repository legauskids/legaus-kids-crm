import { z } from "zod";

const tipoContatoSchema = z.enum(["CONTATO", "CLIENTE", "FORNECEDOR"]);

export const criarContatoSchema = z.object({
  nome: z.string().min(1, "Informe um nome"),
  telefone: z.string().optional(),
  empresa: z.string().optional(),
  tipo: tipoContatoSchema.default("CONTATO"),
  cnpj: z.string().optional(),
  razaoSocial: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  cep: z.string().optional(),
});

export const atualizarContatoSchema = z.object({
  contatoId: z.string().min(1),
  nome: z.string().min(1, "Informe um nome"),
  empresa: z.string().optional(),
  telefone: z.string().optional(),
  tags: z.string().optional(),
  cnpj: z.string().optional(),
  razaoSocial: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  cep: z.string().optional(),
});
