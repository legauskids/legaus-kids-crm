-- Fotos no agente (pedido do Marcos de 2026-10-13, aprovado): a foto
-- recente da conversa e a foto anterior do produto. Só acrescenta colunas
-- opcionais; nenhum dado existente muda.

-- AlterTable: foto que veio na mensagem e ainda não foi usada
ALTER TABLE "ComandoAgente" ADD COLUMN     "anexoImagem" BYTEA,
ADD COLUMN     "anexoImagemMime" TEXT;

-- AlterTable: foto de antes da última troca, pra desfazer
ALTER TABLE "Produto" ADD COLUMN     "imagemAnteriorBytes" BYTEA,
ADD COLUMN     "imagemAnteriorMime" TEXT,
ADD COLUMN     "imagemAnteriorUrl" TEXT;
