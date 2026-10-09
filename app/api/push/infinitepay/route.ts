import { receberPush } from "@/lib/server/push-http";

/**
 * Notificação do app da InfinitePay encaminhada pelo MacroDroid (ver
 * lib/server/push-http.ts). As contas da Legaus e da Idezza ficam no mesmo
 * app e a notificação não diz de qual é: entra tudo com a etiqueta
 * InfinitePay (decisão do Marcos, 2026-10-08).
 */
export function POST(request: Request) {
  return receberPush(request, "INFINITEPAY");
}
