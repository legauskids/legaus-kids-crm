-- CreateEnum
CREATE TYPE "TipoCotacao" AS ENUM ('PLAYGROUND', 'KIDPLAY', 'BRINQUEDOS', 'OUTROS');

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" "TipoCotacao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "maoDeObra" JSONB NOT NULL DEFAULT '[]',
    "markup" DOUBLE PRECISION NOT NULL DEFAULT 1.9,
    "adicionalCentavos" INTEGER NOT NULL DEFAULT 0,
    "instalacaoPercentual" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "freteKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fretePrecoPorKmCentavos" INTEGER NOT NULL DEFAULT 500,
    "impostoCentavos" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoItem" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "secao" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "custoUnitarioCentavos" INTEGER NOT NULL DEFAULT 0,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CotacaoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cotacao_numero_key" ON "Cotacao"("numero");

-- CreateIndex
CREATE INDEX "Cotacao_tipo_idx" ON "Cotacao"("tipo");

-- CreateIndex
CREATE INDEX "CotacaoItem_cotacaoId_idx" ON "CotacaoItem"("cotacaoId");

-- AddForeignKey
ALTER TABLE "Cotacao" ADD CONSTRAINT "Cotacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoItem" ADD CONSTRAINT "CotacaoItem_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
