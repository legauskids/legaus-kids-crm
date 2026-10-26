-- Mensagem agendada a partir de uma tarefa (aprovada pelo Marcos em
-- 2026-10-26): liga a mensagem à tarefa pra cada tarefa mostrar só as dela.
-- Só acrescenta; as agendadas do Atendimento ficam com tarefaId vazio.

-- AlterTable
ALTER TABLE "MensagemAgendada" ADD COLUMN     "tarefaId" TEXT;

-- CreateIndex
CREATE INDEX "MensagemAgendada_tarefaId_idx" ON "MensagemAgendada"("tarefaId");

-- AddForeignKey
ALTER TABLE "MensagemAgendada" ADD CONSTRAINT "MensagemAgendada_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "Tarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
