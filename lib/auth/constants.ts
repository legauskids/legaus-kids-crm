// Constante isolada (sem depender de Prisma/jose) para poder ser importada
// pelo middleware, que roda em runtime Edge.
export const SESSION_COOKIE_NAME = "legaus_session";
