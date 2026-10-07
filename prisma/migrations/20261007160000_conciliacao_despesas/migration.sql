-- Conciliação extrato x despesas: pares descartados ("Não é esse") e o
-- centro geral junto da categoria no rateio. Só acrescenta. Pedido de
-- 2026-10-07.

-- AlterTable
ALTER TABLE "RateioTransacao" ADD COLUMN     "centroGeralId" TEXT;

-- CreateTable
CREATE TABLE "ParRejeitado" (
    "transacaoId" TEXT NOT NULL,
    "despesaId" TEXT NOT NULL,
    "rejeitadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParRejeitado_pkey" PRIMARY KEY ("transacaoId","despesaId")
);

-- CreateIndex
CREATE INDEX "RateioTransacao_centroGeralId_idx" ON "RateioTransacao"("centroGeralId");

-- AddForeignKey
ALTER TABLE "RateioTransacao" ADD CONSTRAINT "RateioTransacao_centroGeralId_fkey" FOREIGN KEY ("centroGeralId") REFERENCES "CentroGeral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParRejeitado" ADD CONSTRAINT "ParRejeitado_transacaoId_fkey" FOREIGN KEY ("transacaoId") REFERENCES "TransacaoBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParRejeitado" ADD CONSTRAINT "ParRejeitado_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "Despesa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParRejeitado" ADD CONSTRAINT "ParRejeitado_rejeitadoPorId_fkey" FOREIGN KEY ("rejeitadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
