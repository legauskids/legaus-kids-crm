-- CreateTable
CREATE TABLE "ItemChecklistTarefa" (
    "id" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemChecklistTarefa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemChecklistTarefa_tarefaId_idx" ON "ItemChecklistTarefa"("tarefaId");

-- AddForeignKey
ALTER TABLE "ItemChecklistTarefa" ADD CONSTRAINT "ItemChecklistTarefa_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
