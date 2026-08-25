import { requireUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db";
import { gerarApiToken } from "@/lib/auth/api-token";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenDisplay } from "@/app/(app)/extensao/token-display";

export default async function ExtensaoPage() {
  const sessionUser = await requireUser();

  const usuario = await prisma.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  const token = usuario.apiToken ?? (await gerarApiToken(usuario.id));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Extensão de WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Conecte a extensão de Chrome ao seu usuário para sincronizar conversas reais do WhatsApp Web.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Seu token de acesso</CardTitle>
        </CardHeader>
        <CardContent>
          <TokenDisplay token={token} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Como instalar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>
              No Chrome, acesse <code className="text-foreground">chrome://extensions</code>.
            </li>
            <li>Ative o &quot;Modo do desenvolvedor&quot; no canto superior direito.</li>
            <li>
              Clique em &quot;Carregar sem compactação&quot; e selecione a pasta <code className="text-foreground">extension/</code> deste
              projeto.
            </li>
            <li>Clique no ícone da extensão na barra do Chrome.</li>
            <li>Cole o token acima e a URL deste sistema, depois salve.</li>
            <li>
              Abra <code className="text-foreground">web.whatsapp.com</code> e escaneie o QR code normalmente pelo WhatsApp Business do
              celular.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
