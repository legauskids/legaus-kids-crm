-- Compromissos (metas recorrentes de hábitos de gestão) + categoria de tarefa.
-- Pedido de 2026-09-30. Só adiciona: tabelas, colunas, trigger e cadastro
-- inicial. Não confundir com os "compromissos firmados" das Reuniões.

-- CreateEnum
CREATE TYPE "CampoExtraCategoria" AS ENUM ('NENHUM', 'LINK', 'PAUTA');

-- CreateEnum
CREATE TYPE "FrequenciaCompromisso" AS ENUM ('DIARIA', 'SEMANAL');

-- CreateEnum
CREATE TYPE "RegraCompromisso" AS ENUM ('CATEGORIA', 'PLANEJAR_DIA_SEGUINTE');

-- AlterTable
ALTER TABLE "Tarefa" ADD COLUMN     "categoriaId" TEXT,
ADD COLUMN     "concluidaEm" TIMESTAMP(3),
ADD COLUMN     "link" TEXT,
ADD COLUMN     "prazoDefinidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "CategoriaTarefa" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#64748b',
    "campoExtra" "CampoExtraCategoria" NOT NULL DEFAULT 'NENHUM',
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoriaTarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compromisso" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "frequencia" "FrequenciaCompromisso" NOT NULL,
    "regra" "RegraCompromisso" NOT NULL DEFAULT 'CATEGORIA',
    "categoriaId" TEXT,
    "metaDeId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compromisso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompromissoUsuario" (
    "compromissoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "CompromissoUsuario_pkey" PRIMARY KEY ("compromissoId","usuarioId")
);

-- CreateTable
CREATE TABLE "CompromissoVersao" (
    "id" TEXT NOT NULL,
    "compromissoId" TEXT NOT NULL,
    "vigenteDesde" TIMESTAMP(3) NOT NULL,
    "meta" INTEGER,
    "diasUteis" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "horarioCorte" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompromissoVersao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaTarefa_nome_key" ON "CategoriaTarefa"("nome");

-- CreateIndex
CREATE INDEX "CompromissoVersao_compromissoId_vigenteDesde_idx" ON "CompromissoVersao"("compromissoId", "vigenteDesde");

-- CreateIndex
CREATE INDEX "Tarefa_categoriaId_concluidaEm_idx" ON "Tarefa"("categoriaId", "concluidaEm");

-- AddForeignKey
ALTER TABLE "Tarefa" ADD CONSTRAINT "Tarefa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaTarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaTarefa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compromisso" ADD CONSTRAINT "Compromisso_metaDeId_fkey" FOREIGN KEY ("metaDeId") REFERENCES "Compromisso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompromissoUsuario" ADD CONSTRAINT "CompromissoUsuario_compromissoId_fkey" FOREIGN KEY ("compromissoId") REFERENCES "Compromisso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompromissoUsuario" ADD CONSTRAINT "CompromissoUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompromissoVersao" ADD CONSTRAINT "CompromissoVersao_compromissoId_fkey" FOREIGN KEY ("compromissoId") REFERENCES "Compromisso"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Tarefas que já existiam (antes do trigger, pra ele não interferir):
-- concluída em = última alteração (melhor estimativa disponível); prazo
-- definido em = criação.
UPDATE "Tarefa" SET "concluidaEm" = "updatedAt" WHERE "status" = 'CONCLUIDA';
UPDATE "Tarefa" SET "prazoDefinidoEm" = "createdAt";

-- ---------------------------------------------------------------------------
-- concluidaEm e prazoDefinidoEm mantidos pelo próprio banco, em qualquer
-- caminho que mexa na tarefa (telas, arrastar no quadro, agente do WhatsApp,
-- reuniões, automações): concluir marca a hora, reabrir limpa; mudar o prazo
-- registra quando ele foi definido.
CREATE OR REPLACE FUNCTION tarefa_datas_automaticas() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" = 'CONCLUIDA' AND NEW."concluidaEm" IS NULL THEN
      NEW."concluidaEm" := now();
    END IF;
    IF NEW."prazoDefinidoEm" IS NULL THEN
      NEW."prazoDefinidoEm" := now();
    END IF;
  ELSE
    IF NEW."status" = 'CONCLUIDA' AND OLD."status" <> 'CONCLUIDA' THEN
      NEW."concluidaEm" := now();
    ELSIF NEW."status" <> 'CONCLUIDA' THEN
      NEW."concluidaEm" := NULL;
    END IF;
    IF NEW."prazo" IS DISTINCT FROM OLD."prazo" THEN
      NEW."prazoDefinidoEm" := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tarefa_datas_automaticas
BEFORE INSERT OR UPDATE ON "Tarefa"
FOR EACH ROW EXECUTE FUNCTION tarefa_datas_automaticas();

-- ---------------------------------------------------------------------------
-- Cadastro inicial (editável em Configurações). Compromissos só do Marcos.
INSERT INTO "CategoriaTarefa" ("id", "nome", "cor", "campoExtra", "ordem") VALUES
  ('cat-gerar-receita', 'Gerar Receita', '#16a34a', 'NENHUM', 1),
  ('cat-melhoria', 'Melhoria', '#2563eb', 'NENHUM', 2),
  ('cat-postagem-feed', 'Postagem no Feed', '#c026d3', 'LINK', 3),
  ('cat-reuniao-equipe', 'Reunião de Equipe', '#d97706', 'PAUTA', 4);

INSERT INTO "Compromisso" ("id", "nome", "frequencia", "regra", "categoriaId", "metaDeId", "ordem") VALUES
  ('comp-gerar-receita', 'Gerar Receita', 'DIARIA', 'CATEGORIA', 'cat-gerar-receita', NULL, 1),
  ('comp-planejar-dia', 'Planejar o dia seguinte', 'DIARIA', 'PLANEJAR_DIA_SEGUINTE', 'cat-gerar-receita', 'comp-gerar-receita', 2),
  ('comp-melhoria', 'Melhoria', 'SEMANAL', 'CATEGORIA', 'cat-melhoria', NULL, 3),
  ('comp-postagem-feed', 'Postagem no Feed', 'SEMANAL', 'CATEGORIA', 'cat-postagem-feed', NULL, 4),
  ('comp-reuniao-equipe', 'Reunião de Equipe', 'SEMANAL', 'CATEGORIA', 'cat-reuniao-equipe', NULL, 5);

-- Primeira versão das metas: diárias valem a partir de hoje, semanais a partir
-- desta semana (segunda-feira), ambas à meia-noite de Brasília (gravado em UTC).
INSERT INTO "CompromissoVersao" ("id", "compromissoId", "vigenteDesde", "meta", "diasUteis", "horarioCorte")
SELECT v.id, v.cid,
       CASE WHEN c."frequencia" = 'DIARIA' THEN t.dia ELSE t.semana END,
       v.meta, ARRAY[1, 2, 3, 4, 5], v.corte
FROM (VALUES
  ('ver-gerar-receita-1', 'comp-gerar-receita', 2, NULL::text),
  ('ver-planejar-dia-1', 'comp-planejar-dia', NULL::int, '19:00'),
  ('ver-melhoria-1', 'comp-melhoria', 1, NULL::text),
  ('ver-postagem-feed-1', 'comp-postagem-feed', 1, NULL::text),
  ('ver-reuniao-equipe-1', 'comp-reuniao-equipe', 1, NULL::text)
) AS v(id, cid, meta, corte)
JOIN "Compromisso" c ON c."id" = v.cid
CROSS JOIN (
  SELECT ((date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC') AS dia,
         ((date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC') AS semana
) t;

INSERT INTO "CompromissoUsuario" ("compromissoId", "usuarioId")
SELECT c."id", u."id" FROM "Compromisso" c CROSS JOIN "User" u WHERE u."username" = 'marcos';
