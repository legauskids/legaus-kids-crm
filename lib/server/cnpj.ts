import "server-only";

export type DadosCnpj = {
  razaoSocial: string;
  nomeFantasia: string | null;
  telefone: string | null;
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
};

function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/**
 * Busca dados públicos de uma empresa pelo CNPJ via BrasilAPI (gratuita, sem
 * chave). Usado no cadastro de cliente/fornecedor pessoa jurídica pra
 * preencher razão social e endereço automaticamente.
 */
export async function buscarDadosCnpj(cnpjBruto: string): Promise<DadosCnpj> {
  const cnpj = normalizarCnpj(cnpjBruto);
  if (cnpj.length !== 14) {
    throw new Error("CNPJ inválido — precisa ter 14 dígitos.");
  }

  const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    cache: "no-store",
    // A BrasilAPI bloqueia (403) requisições sem um User-Agent de
    // navegador — visto ao vivo em 2026-08-28 testando essa busca.
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (resposta.status === 404) {
    throw new Error("CNPJ não encontrado.");
  }
  if (resposta.status === 429) {
    throw new Error("Muitas consultas de CNPJ em pouco tempo — espere um minuto e tente de novo.");
  }
  if (!resposta.ok) {
    throw new Error("Não foi possível consultar o CNPJ agora. Tente de novo em instantes.");
  }

  const dados = await resposta.json();

  const partesEndereco = [dados.logradouro, dados.numero, dados.complemento, dados.bairro]
    .filter(Boolean)
    .join(", ");

  return {
    razaoSocial: dados.razao_social,
    nomeFantasia: dados.nome_fantasia || null,
    telefone: dados.ddd_telefone_1 || null,
    endereco: partesEndereco,
    cidade: dados.municipio,
    uf: dados.uf,
    cep: dados.cep,
  };
}
