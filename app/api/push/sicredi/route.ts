import { receberPush } from "@/lib/server/push-http";

/** Notificação do app do Sicredi encaminhada pelo MacroDroid (ver lib/server/push-http.ts). */
export function POST(request: Request) {
  return receberPush(request, "SICREDI");
}
