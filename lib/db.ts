import { PrismaClient } from "@prisma/client";

// Negócio é soft-delete (excluidoEm) — nunca sai da tabela de verdade, só
// fica de fora de toda listagem. Em vez de lembrar de filtrar
// `excluidoEm: null` em cada findMany/findFirst/count espalhado pelo código
// (board, dashboard, produção, financeiro, agente...), a extensão abaixo
// injeta isso automaticamente pra qualquer consulta nova ou existente.
// findUnique/findUniqueOrThrow por id NÃO são filtrados de propósito — a
// página do negócio ainda precisa conseguir abrir um negócio excluído pra
// mostrar o aviso de exclusão.
function criarPrismaClient() {
  return new PrismaClient().$extends({
    query: {
      negocio: {
        async findMany({ args, query }) {
          args.where = { ...args.where, excluidoEm: null };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, excluidoEm: null };
          return query(args);
        },
        async count({ args, query }) {
          args.where = { ...args.where, excluidoEm: null };
          return query(args);
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof criarPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? criarPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
