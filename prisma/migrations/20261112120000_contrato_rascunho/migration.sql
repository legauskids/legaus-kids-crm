-- Contrato em rascunho (pedido de 2026-11-12): o contrato nasce RASCUNHO, com
-- o texto editável no CRM, e só vira GERADO (PDF final) quando alguém finaliza.
-- "dados" guarda as respostas do formulário (cliente, produto, pagamento, prazos).

-- AlterEnum
ALTER TYPE "StatusContrato" ADD VALUE 'RASCUNHO' BEFORE 'GERADO';

-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN     "dados" JSONB;
