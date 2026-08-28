import { z } from "zod";

// Campo em branco deve virar "não informado ainda" (null), não R$ 0,00 —
// z.coerce.number() sozinho transformaria "" em 0.
const valorOpcional = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().min(0).optional());

export const criarProdutoSchema = z.object({
  nome: z.string().min(1, "Informe um nome"),
  codigo: z.string().optional(),
  categoria: z.string().min(1, "Informe uma categoria"),
  descricao: z.string().optional(),
  imagemUrl: z.string().optional(),
  valorReais: valorOpcional,
});

export const atualizarProdutoSchema = z.object({
  produtoId: z.string().min(1),
  nome: z.string().min(1, "Informe um nome"),
  codigo: z.string().optional(),
  categoria: z.string().min(1, "Informe uma categoria"),
  descricao: z.string().optional(),
  imagemUrl: z.string().optional(),
  valorReais: valorOpcional,
  ativo: z.string().optional(),
});
