-- Orçamento vinculado ao negócio (pedido de 2026-11-23): Orcamento.negocioId e o
-- item ORCAMENTO no histórico (Atividade.orcamentoId). Só colunas novas, opcionais.

-- AlterEnum
ALTER TYPE "TipoAtividade" ADD VALUE 'ORCAMENTO';

-- AlterTable
ALTER TABLE "Atividade" ADD COLUMN     "orcamentoId" TEXT;

-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "negocioId" TEXT;

-- CreateIndex
CREATE INDEX "Atividade_orcamentoId_idx" ON "Atividade"("orcamentoId");

-- CreateIndex
CREATE INDEX "Orcamento_negocioId_idx" ON "Orcamento"("negocioId");

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Orcamento" ADD CONSTRAINT "Orcamento_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

