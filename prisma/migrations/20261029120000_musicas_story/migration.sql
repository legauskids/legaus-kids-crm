-- Músicas pros stories que o CRM publica (pedido do Marcos de 2026-10-29).
-- Só acrescenta: tabela de músicas, a música escolhida no post e o vídeo do
-- story (arte + trecho da música). Nada existente muda.
-- AlterTable
ALTER TABLE "Postagem" ADD COLUMN     "musicaId" TEXT;

-- CreateTable
CREATE TABLE "MusicaStory" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "artista" TEXT,
    "fonte" TEXT NOT NULL,
    "audio" BYTEA NOT NULL,
    "duracaoSeg" DOUBLE PRECISION NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicaStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostagemArteVideo" (
    "arteId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "video" BYTEA NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostagemArteVideo_pkey" PRIMARY KEY ("arteId")
);

-- AddForeignKey
ALTER TABLE "Postagem" ADD CONSTRAINT "Postagem_musicaId_fkey" FOREIGN KEY ("musicaId") REFERENCES "MusicaStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostagemArteVideo" ADD CONSTRAINT "PostagemArteVideo_arteId_fkey" FOREIGN KEY ("arteId") REFERENCES "PostagemArte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

