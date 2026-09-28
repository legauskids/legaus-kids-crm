-- Tipo de etapa CONCLUIDO (etapa final do pós-venda, depois da Avaliação).
-- Pedido de 2026-09-28. Migração separada da que usa o valor: o Postgres
-- não deixa usar um valor novo de enum na mesma transação que o criou.

-- AlterEnum
ALTER TYPE "TipoEtapa" ADD VALUE 'CONCLUIDO';
