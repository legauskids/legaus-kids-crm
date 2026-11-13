import "server-only";
import { prisma } from "@/lib/db";
import { EMPRESAS_EMISSORAS, type ChaveEmpresaEmissora, type DadosEmpresa } from "@/lib/constants/empresa";
import { formatarDocumento } from "@/lib/utils/busca-cliente";
import {
  assinaturaComprador,
  assinaturaVendedor,
  lerDadosContrato,
  nomeProprio,
  separarContrato,
  type BlocoContrato,
} from "@/lib/utils/contrato";

// O contrato já dividido em título, seções e parágrafos, com as assinaturas —
// o mesmo pro PDF (lib/server/pdf/contrato-pdf.tsx) e pro Word
// (lib/server/contrato-docx.ts).
export type DocumentoContrato = {
  numero: string;
  titulo: string;
  blocos: BlocoContrato[];
  rascunho: boolean;
  empresa: DadosEmpresa;
  empresaEmissora: ChaveEmpresaEmissora;
  vendedor: string[];
  comprador: string[];
  nomeArquivo: string;
};

export async function carregarDocumentoContrato(contratoId: string): Promise<DocumentoContrato> {
  const contrato = await prisma.contrato.findUnique({
    where: { id: contratoId },
    include: { negocio: { include: { contato: true } } },
  });
  if (!contrato) throw new Error("Contrato não encontrado.");

  const { titulo, blocos } = separarContrato(contrato.conteudo);
  const empresa = EMPRESAS_EMISSORAS[contrato.empresaEmissora];
  const dados = lerDadosContrato(contrato.dados);
  const c = contrato.negocio.contato;
  // Contrato de antes do formulário (sem dados): assina quem está no cadastro.
  const comprador = dados
    ? assinaturaComprador(dados)
    : [
        nomeProprio(c?.razaoSocial || c?.nome || "Comprador"),
        ...(c?.representanteLegalNome ? [`Representante: ${nomeProprio(c.representanteLegalNome)}`] : []),
        ...(c?.representanteLegalCpf ? [`CPF nº ${formatarDocumento(c.representanteLegalCpf)}`] : []),
      ];
  const numero = String(contrato.numero).padStart(4, "0");

  return {
    numero,
    titulo,
    blocos,
    rascunho: contrato.status === "RASCUNHO",
    empresa,
    empresaEmissora: contrato.empresaEmissora,
    vendedor: assinaturaVendedor(empresa),
    comprador,
    nomeArquivo: `contrato-${numero}`,
  };
}
