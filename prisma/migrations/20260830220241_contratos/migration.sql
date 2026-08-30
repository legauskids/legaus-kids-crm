-- CreateEnum
CREATE TYPE "StatusContrato" AS ENUM ('GERADO', 'ENVIADO', 'ASSINADO', 'CANCELADO');

-- Índices trigram (pg_trgm) da busca aproximada não são declarados via
-- @@index no schema.prisma — removido de propósito, ver migração
-- 20260829211427_busca_similar_trgm e 20260830121408_mensagem_anexo.

-- CreateTable
CREATE TABLE "ModeloContrato" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL DEFAULT 'Modelo padrão',
    "conteudo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloContrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "negocioId" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "status" "StatusContrato" NOT NULL DEFAULT 'GERADO',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_numero_key" ON "Contrato"("numero");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
