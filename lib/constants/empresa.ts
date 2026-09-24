export type DadosEmpresa = {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string | null;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  site: string;
  // Quem assina pela empresa nos contratos.
  representanteNome: string;
  representanteCpf: string;
};

// Dados oficiais da Legaus Kids — cartão CNPJ fornecido em 2026-08-28.
// Usado no cabeçalho de orçamentos e em qualquer documento formal do CRM
// que não seja contrato (orçamento é sempre emitido pela Legaus Kids).
export const EMPRESA: DadosEmpresa = {
  razaoSocial: "GOLDLOG FABRICA E TRANSPORTES LTDA",
  nomeFantasia: "Legaus Kids",
  cnpj: "23.068.179/0001-14",
  inscricaoEstadual: null,
  endereco: "Av. Tuparendi, 659, Sala 01",
  bairro: "Centro",
  cidade: "Santa Rosa",
  uf: "RS",
  cep: "98.780-681",
  telefone: "(55) 9960-3257",
  email: "contato@legauskids.com.br",
  site: "legauskids.com.br",
  representanteNome: "MARCOS ZANCAN",
  representanteCpf: "003.598.010-99",
};

export type ChaveEmpresaEmissora = "LEGAUS" | "IDEZZA";

// A partir de 2026-09-23, contrato pode ser emitido em nome da Legaus Kids
// OU da Idezza — a venda pode acontecer por qualquer uma das duas pessoas
// jurídicas, escolhido na hora de gerar o contrato (ver gerarContrato em
// lib/server/contratos.ts). Dados da Idezza AINDA PRECISAM ser preenchidos
// com o cartão CNPJ de verdade (Marcos vai mandar) — os valores abaixo são
// só placeholder pra não travar o fluxo enquanto isso não chega.
export const EMPRESAS_EMISSORAS: Record<ChaveEmpresaEmissora, DadosEmpresa> = {
  LEGAUS: EMPRESA,
  IDEZZA: {
    razaoSocial: "IDEZZA (dados pendentes — aguardando cartão CNPJ)",
    nomeFantasia: "Idezza",
    cnpj: "(pendente)",
    inscricaoEstadual: null,
    endereco: "(pendente)",
    bairro: "(pendente)",
    cidade: "(pendente)",
    uf: "RS",
    cep: "(pendente)",
    telefone: "(pendente)",
    email: "(pendente)",
    site: "(pendente)",
    representanteNome: "(pendente)",
    representanteCpf: "(pendente)",
  },
};
