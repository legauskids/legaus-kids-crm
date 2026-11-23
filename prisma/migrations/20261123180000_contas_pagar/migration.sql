-- CreateEnum
CREATE TYPE "StatusContaPagar" AS ENUM ('A_CONFIRMAR', 'ABERTA', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "OrigemContaPagar" AS ENUM ('MANUAL', 'ARQUIVO', 'TEXTO', 'AUDIO', 'FIXA');

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaId" TEXT,
    "centroGeralId" TEXT,
    "negocioId" TEXT,
    "status" "StatusContaPagar" NOT NULL DEFAULT 'ABERTA',
    "origem" "OrigemContaPagar" NOT NULL DEFAULT 'MANUAL',
    "codigoPagamento" TEXT,
    "serieId" TEXT,
    "parcela" INTEGER,
    "totalParcelas" INTEGER,
    "repeteTodoMes" BOOLEAN NOT NULL DEFAULT false,
    "diaVencimento" INTEGER,
    "anexoBytes" BYTEA,
    "anexoMime" TEXT,
    "anexoNome" TEXT,
    "textoOriginal" TEXT,
    "extracao" JSONB,
    "telefoneOrigem" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "pagaEm" TIMESTAMP(3),
    "despesaId" TEXT,
    "despesaCriada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_despesaId_key" ON "ContaPagar"("despesaId");

-- CreateIndex
CREATE INDEX "ContaPagar_status_vencimento_idx" ON "ContaPagar"("status", "vencimento");

-- CreateIndex
CREATE INDEX "ContaPagar_negocioId_idx" ON "ContaPagar"("negocioId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_serieId_vencimento_key" ON "ContaPagar"("serieId", "vencimento");

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_centroGeralId_fkey" FOREIGN KEY ("centroGeralId") REFERENCES "CentroGeral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_despesaId_fkey" FOREIGN KEY ("despesaId") REFERENCES "Despesa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

