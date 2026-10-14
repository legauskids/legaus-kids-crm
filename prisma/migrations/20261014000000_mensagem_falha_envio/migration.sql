-- Mensagem que o WhatsApp não aceitou (número sem conta), aprovado pelo
-- Marcos em 2026-10-14. Só acrescenta duas colunas opcionais.

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "falhaEnvio" TEXT,
ADD COLUMN     "falhaEnvioEm" TIMESTAMP(3);
