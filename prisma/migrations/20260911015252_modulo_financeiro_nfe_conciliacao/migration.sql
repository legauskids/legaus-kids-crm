-- CreateEnum
CREATE TYPE "StatusNotaFiscal" AS ENUM ('NAO_EMITIDA', 'PROCESSANDO', 'AUTORIZADA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoTransacaoBancaria" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "StatusTransacaoBancaria" AS ENUM ('NAO_CONCILIADA', 'CONCILIADA', 'IGNORADA');

-- DropIndex
DROP INDEX "Contato_nome_trgm_idx";

-- DropIndex
DROP INDEX "Contato_razaoSocial_trgm_idx";

-- DropIndex
DROP INDEX "Negocio_titulo_trgm_idx";

-- DropIndex
DROP INDEX "Produto_codigo_trgm_idx";

-- DropIndex
DROP INDEX "Produto_nome_trgm_idx";

-- DropIndex
DROP INDEX "Tarefa_titulo_trgm_idx";

-- CreateTable
CREATE TABLE "NotaFiscal" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "status" "StatusNotaFiscal" NOT NULL DEFAULT 'NAO_EMITIDA',
    "numero" TEXT,
    "serie" TEXT,
    "chaveAcesso" TEXT,
    "statusSefaz" TEXT,
    "mensagemSefaz" TEXT,
    "motivoRejeicao" TEXT,
    "itensJson" JSONB NOT NULL,
    "valorTotalCentavos" INTEGER NOT NULL,
    "xmlBytes" BYTEA,
    "danfeBytes" BYTEA,
    "criadaPorId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtratoBancarioImportacao" (
    "id" TEXT NOT NULL,
    "nomeArquivo" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3),
    "periodoFim" TIMESTAMP(3),
    "quantidadeTransacoes" INTEGER NOT NULL,
    "importadoPorId" TEXT NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtratoBancarioImportacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransacaoBancaria" (
    "id" TEXT NOT NULL,
    "importacaoId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "tipo" "TipoTransacaoBancaria" NOT NULL,
    "fitId" TEXT,
    "status" "StatusTransacaoBancaria" NOT NULL DEFAULT 'NAO_CONCILIADA',
    "negocioId" TEXT,
    "conciliadaPorId" TEXT,
    "conciliadaEm" TIMESTAMP(3),

    CONSTRAINT "TransacaoBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotaFiscal_referencia_key" ON "NotaFiscal"("referencia");

-- CreateIndex
CREATE UNIQUE INDEX "TransacaoBancaria_fitId_key" ON "TransacaoBancaria"("fitId");

-- CreateIndex
CREATE INDEX "TransacaoBancaria_importacaoId_idx" ON "TransacaoBancaria"("importacaoId");

-- CreateIndex
CREATE INDEX "TransacaoBancaria_negocioId_idx" ON "TransacaoBancaria"("negocioId");

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtratoBancarioImportacao" ADD CONSTRAINT "ExtratoBancarioImportacao_importadoPorId_fkey" FOREIGN KEY ("importadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoBancaria" ADD CONSTRAINT "TransacaoBancaria_importacaoId_fkey" FOREIGN KEY ("importacaoId") REFERENCES "ExtratoBancarioImportacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoBancaria" ADD CONSTRAINT "TransacaoBancaria_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransacaoBancaria" ADD CONSTRAINT "TransacaoBancaria_conciliadaPorId_fkey" FOREIGN KEY ("conciliadaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
