-- Renomeia "texto" -> "nome" (preserva os 2 lembretes de teste já existentes)
-- e adiciona os campos novos usados pelo formulário de lembrete da extensão.
ALTER TABLE "Lembrete" RENAME COLUMN "texto" TO "nome";
ALTER TABLE "Lembrete" ADD COLUMN "descricao" TEXT;
ALTER TABLE "Lembrete" ADD COLUMN "notificarEm" TIMESTAMP(3);
