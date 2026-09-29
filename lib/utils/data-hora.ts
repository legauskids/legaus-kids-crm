/**
 * Converte o valor de um <input type="datetime-local"> ("AAAA-MM-DDTHH:mm",
 * sem fuso) no instante certo do horário de Brasília.
 *
 * O servidor (Vercel) roda em UTC: lá, new Date("2026-09-29T14:00") vira
 * 14:00 UTC, que são 11:00 em Brasília — o prazo de tarefa e a mensagem
 * agendada ficavam 3 horas adiantados (bug relatado em 2026-09-29). Valor
 * que já vem com fuso (ISO com "Z" ou "-03:00") passa direto. -03:00 fixo:
 * o Brasil não tem mais horário de verão.
 */
export function dataHoraDoFormulario(valor: string): Date {
  const limpo = valor.trim();
  const semFuso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(limpo);
  const data = new Date(semFuso ? `${limpo.length === 16 ? `${limpo}:00` : limpo}-03:00` : limpo);
  if (isNaN(data.getTime())) throw new Error("Data/hora inválida.");
  return data;
}
