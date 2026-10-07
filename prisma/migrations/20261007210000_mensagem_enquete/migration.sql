-- Enquete (pergunta + opções pra tocar) que o whatsapp-service manda logo
-- depois do texto da mensagem. Só acrescenta uma coluna opcional.

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "enquete" JSONB;
