// Contas da própria empresa (regra do Marcos de 2026-10-17): o Sicredi
// (Legaus/Goldlog), a InfinitePay da Legaus e a InfinitePay da Idezza. Pix
// entre elas é movimentação entre contas — fica registrada, mas não é
// receita nem despesa. O push do Sicredi e o extrato trazem o CNPJ da outra
// ponta; o push da InfinitePay só o nome. Pura e testável.
//
// Suposição aprovada: qualquer Pix entre Legaus e Idezza conta como
// transferência entre essas contas.

export type ChaveContaPropria = "LEGAUS" | "IDEZZA";
export type ContaPropria = { chave: ChaveContaPropria; nome: string };

const CONTAS: { chave: ChaveContaPropria; nome: string; cnpj: string; nomes: RegExp }[] = [
  // Razão social da Legaus Kids: GOLDLOG FABRICA E TRANSPORTES LTDA.
  { chave: "LEGAUS", nome: "Legaus (Goldlog)", cnpj: "23068179000114", nomes: /\b(goldlog|legaus)\b/i },
  // Como veio no push do Sicredi de 08/10/2026: "Idezza Comercio Ltda CNPJ 56.135.764/0001-49".
  { chave: "IDEZZA", nome: "Idezza", cnpj: "56135764000149", nomes: /\bidezza\b/i },
];

/** CNPJs (com ou sem máscara) que aparecem no texto, só os dígitos. */
function cnpjsNoTexto(texto: string): string[] {
  return (texto.match(/\d[\d./-]{12,}\d/g) ?? []).map((t) => t.replace(/\D/g, "")).filter((d) => d.length === 14);
}

function resultado(conta: (typeof CONTAS)[number]): ContaPropria {
  return { chave: conta.chave, nome: conta.nome };
}

/** A outra ponta do Pix (quem recebeu ou quem mandou) é uma das contas da empresa? */
export function contaPropriaDoPush(contraparte: string | null | undefined, documento: string | null | undefined): ContaPropria | null {
  const cnpjs = documento ? cnpjsNoTexto(documento) : [];
  const porCnpj = CONTAS.find((c) => cnpjs.includes(c.cnpj));
  if (porCnpj) return resultado(porCnpj);
  const porNome = contraparte ? CONTAS.find((c) => c.nomes.test(contraparte)) : undefined;
  return porNome ? resultado(porNome) : null;
}

/** Lançamento do extrato com o CNPJ ou o nome de uma das contas da empresa ("PAGAMENTO PIX-PIX_DEB 56135764000149 IDEZZA..."). */
export function contaPropriaNoExtrato(descricao: string): ContaPropria | null {
  const cnpjs = cnpjsNoTexto(descricao);
  const conta = CONTAS.find((c) => cnpjs.includes(c.cnpj)) ?? CONTAS.find((c) => c.nomes.test(descricao));
  return conta ? resultado(conta) : null;
}
