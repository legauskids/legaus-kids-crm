-- CreateTable
CREATE TABLE "ItemChecklistNegocio" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemChecklistNegocio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemChecklistNegocio_negocioId_etapaId_idx" ON "ItemChecklistNegocio"("negocioId", "etapaId");

-- AddForeignKey
ALTER TABLE "ItemChecklistNegocio" ADD CONSTRAINT "ItemChecklistNegocio_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemChecklistNegocio" ADD CONSTRAINT "ItemChecklistNegocio_etapaId_fkey" FOREIGN KEY ("etapaId") REFERENCES "Etapa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
