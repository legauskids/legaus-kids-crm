-- Aviso bancário: push do app do Sicredi encaminhado pelo MacroDroid
-- (pedido de 2026-10-07, aprovado pelo Marcos). Só cria uma tabela nova e o
-- seu enum; nenhum dado existente muda.

-- CreateEnum
CREATE TYPE "StatusAvisoBancario" AS ENUM ('PENDENTE', 'RESPONDIDO', 'IGNORADO');

-- CreateTable
CREATE TABLE "AvisoBancario" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "direcao" "TipoTransacaoBancaria" NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "contraparte" TEXT,
    "documento" TEXT,
    "banco" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL,
    "titulo" TEXT,
    "texto" TEXT NOT NULL,
    "status" "StatusAvisoBancario" NOT NULL DEFAULT 'PENDENTE',
    "despesaId" TEXT,
    "negocioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvisoBancario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvisoBancario_hash_key" ON "AvisoBancario"("hash");
CREATE INDEX "AvisoBancario_direcao_valorCentavos_dataHora_idx" ON "AvisoBancario"("direcao", "valorCentavos", "dataHora");

-- AddForeignKey
ALTER TABLE "AvisoBancario" ADD CONSTRAINT "AvisoBancario_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "Despesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AvisoBancario" ADD CONSTRAINT "AvisoBancario_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
