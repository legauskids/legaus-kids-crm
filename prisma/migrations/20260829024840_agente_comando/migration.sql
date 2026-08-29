-- CreateEnum
CREATE TYPE "OrigemComando" AS ENUM ('WHATSAPP', 'CRM_TEXTO');

-- CreateEnum
CREATE TYPE "StatusComando" AS ENUM ('CONCLUIDO', 'AGUARDANDO_CONFIRMACAO', 'CANCELADO', 'ERRO');

-- CreateTable
CREATE TABLE "ComandoAgente" (
    "id" TEXT NOT NULL,
    "origem" "OrigemComando" NOT NULL,
    "identificador" TEXT NOT NULL,
    "usuarioId" TEXT,
    "textoComando" TEXT NOT NULL,
    "resposta" TEXT,
    "ferramentaPendente" TEXT,
    "argumentosPendentes" JSONB,
    "descricaoPendente" TEXT,
    "status" "StatusComando" NOT NULL DEFAULT 'CONCLUIDO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComandoAgente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComandoAgente_identificador_criadoEm_idx" ON "ComandoAgente"("identificador", "criadoEm");

-- AddForeignKey
ALTER TABLE "ComandoAgente" ADD CONSTRAINT "ComandoAgente_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
