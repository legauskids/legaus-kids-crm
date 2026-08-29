-- Busca "tipo Google" pro agente de IA: tolera erro de digitação, falta de
-- hífen/espaço e pequenas variações de palavra (ex: "PL010" acha "PL-010").
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Contato_nome_trgm_idx" ON "Contato" USING gin ("nome" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Contato_razaoSocial_trgm_idx" ON "Contato" USING gin ("razaoSocial" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Produto_nome_trgm_idx" ON "Produto" USING gin ("nome" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Produto_codigo_trgm_idx" ON "Produto" USING gin ("codigo" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Negocio_titulo_trgm_idx" ON "Negocio" USING gin ("titulo" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Tarefa_titulo_trgm_idx" ON "Tarefa" USING gin ("titulo" gin_trgm_ops);
