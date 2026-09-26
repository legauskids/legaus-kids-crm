-- Painel de reunião (semanal/mensal): reuniões, pauta com opiniões e
-- compromissos como tarefas (Tarefa.reuniaoId). Pedido de 2026-09-25.
-- Só adiciona.

-- CreateEnum
CREATE TYPE "TipoReuniao" AS ENUM ('SEMANAL', 'MENSAL');

-- CreateEnum
CREATE TYPE "StatusReuniao" AS ENUM ('AGENDADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "OrigemItemPauta" AS ENUM ('SUGERIDO', 'MANUAL', 'PENDENTE_ANTERIOR');

-- CreateEnum
CREATE TYPE "StatusItemPauta" AS ENUM ('PENDENTE', 'DISCUTIDO', 'ADIADO');

-- AlterTable
ALTER TABLE "Tarefa" ADD COLUMN     "reuniaoId" TEXT;

-- CreateTable
CREATE TABLE "Reuniao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoReuniao" NOT NULL,
    "titulo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "proximoInicio" TIMESTAMP(3) NOT NULL,
    "proximoFim" TIMESTAMP(3) NOT NULL,
    "status" "StatusReuniao" NOT NULL DEFAULT 'AGENDADA',
    "anotacoes" TEXT,
    "avaliacao" TEXT,
    "resumoEncerramento" JSONB,
    "pautaGeradaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPauta" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "origem" "OrigemItemPauta" NOT NULL DEFAULT 'MANUAL',
    "link" TEXT,
    "status" "StatusItemPauta" NOT NULL DEFAULT 'PENDENTE',
    "decisao" TEXT,
    "itemAnteriorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemPauta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpiniaoPauta" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpiniaoPauta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reuniao_data_idx" ON "Reuniao"("data");

-- CreateIndex
CREATE INDEX "ItemPauta_reuniaoId_idx" ON "ItemPauta"("reuniaoId");

-- CreateIndex
CREATE INDEX "OpiniaoPauta_itemId_idx" ON "OpiniaoPauta"("itemId");

-- CreateIndex
CREATE INDEX "Tarefa_reuniaoId_idx" ON "Tarefa"("reuniaoId");

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "Reuniao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPauta" ADD CONSTRAINT "ItemPauta_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "Reuniao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpiniaoPauta" ADD CONSTRAINT "OpiniaoPauta_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemPauta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpiniaoPauta" ADD CONSTRAINT "OpiniaoPauta_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

