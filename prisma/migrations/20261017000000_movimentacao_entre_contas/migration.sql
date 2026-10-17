-- Movimentação entre as contas da própria empresa (Sicredi, InfinitePay
-- Legaus e InfinitePay Idezza) fica registrada sem contar como receita nem
-- despesa — aprovado pelo Marcos em 2026-10-17. Só acrescenta um valor em
-- cada enum.

-- AlterEnum
ALTER TYPE "StatusTransacaoBancaria" ADD VALUE 'TRANSFERENCIA';

-- AlterEnum
ALTER TYPE "StatusAvisoBancario" ADD VALUE 'TRANSFERENCIA';
