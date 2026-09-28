-- Etapa "Concluído" no fim do Funil de pós-venda (depois da Avaliação) — pra
-- onde a Produção encaminha os negócios terminados. Só adiciona; não roda de
-- novo se já existir uma etapa CONCLUIDO no funil.
INSERT INTO "Etapa" ("id", "funilId", "nome", "ordem", "slaDias", "tipo")
SELECT gen_random_uuid()::text, f."id", 'Concluído', COALESCE(MAX(e."ordem"), -1) + 1, NULL, 'CONCLUIDO'
FROM "Funil" f
LEFT JOIN "Etapa" e ON e."funilId" = f."id"
WHERE f."nome" = 'Funil de pós-venda'
  AND NOT EXISTS (SELECT 1 FROM "Etapa" x WHERE x."funilId" = f."id" AND x."tipo" = 'CONCLUIDO')
GROUP BY f."id";
