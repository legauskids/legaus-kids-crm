// Busca do cliente no orçamento (pedido de 2026-11-05): por nome, empresa ou
// razão social (sem ligar pra acento nem maiúscula), por CNPJ, CPF ou telefone
// (só os números, com ou sem pontuação).

export type ClienteBuscavel = {
  id: string;
  nome: string;
  empresa: string | null;
  razaoSocial: string | null;
  cnpj: string | null;
  cpf: string | null;
  telefone: string | null;
  tipo: "CONTATO" | "CLIENTE" | "FORNECEDOR" | string;
};

const somenteNumeros = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** 11 números = CPF (000.000.000-00), 14 = CNPJ (00.000.000/0000-00); o resto fica como veio. */
export function formatarDocumento(doc: string | null | undefined): string | null {
  const n = somenteNumeros(doc);
  if (n.length === 11) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
  if (n.length === 14) return `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`;
  return doc?.trim() || null;
}

/**
 * Clientes que batem com o que foi digitado, os mais prováveis primeiro:
 * documento igual, nome começando pelo termo, cadastro de cliente (com CNPJ
 * etc.) antes de contato do WhatsApp, e por fim ordem alfabética.
 */
export function filtrarClientes<T extends ClienteBuscavel>(clientes: T[], termo: string, limite = 30): T[] {
  const texto = semAcento(termo.trim());
  if (!texto) return [];
  const numeros = somenteNumeros(termo);
  // Termo que é só número (com pontuação de CPF/CNPJ/telefone): busca nos documentos e no telefone.
  const ehNumero = numeros.length >= 3 && /^[\d\s./()+-]+$/.test(termo.trim());
  const palavras = texto.split(/\s+/);

  const pontuados: { c: T; pontos: number }[] = [];
  for (const c of clientes) {
    let pontos = 0;
    if (ehNumero) {
      const docs = [somenteNumeros(c.cnpj), somenteNumeros(c.cpf)];
      if (docs.some((d) => d && d === numeros)) pontos = 4;
      else if (docs.some((d) => d.includes(numeros))) pontos = 3;
      else if (somenteNumeros(c.telefone).includes(numeros)) pontos = 2;
    } else {
      const nome = semAcento(c.nome);
      const tudo = `${nome} ${semAcento(c.empresa ?? "")} ${semAcento(c.razaoSocial ?? "")}`;
      if (palavras.every((p) => tudo.includes(p))) pontos = nome.startsWith(texto) ? 3 : 2;
    }
    if (pontos === 0) continue;
    if (c.tipo === "CLIENTE" || c.cnpj || c.cpf) pontos += 0.5;
    pontuados.push({ c, pontos });
  }
  return pontuados
    .sort((a, b) => b.pontos - a.pontos || a.c.nome.localeCompare(b.c.nome, "pt-BR"))
    .slice(0, limite)
    .map((p) => p.c);
}
