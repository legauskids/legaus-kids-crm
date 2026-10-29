import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { moduloPermitido } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { codificarTrechoMusica } from "@/lib/server/ffmpeg";
import { DURACAO_MINIMA_S, TAMANHO_MAXIMO_TRECHO, duracaoDoWav } from "@/lib/utils/musicas-story";

// Guarda uma música dos stories (pedido de 2026-10-29). O navegador já manda
// só o trecho escolhido, em WAV (cabe no limite de envio da Vercel); aqui ele
// vira AAC com fade e entra na biblioteca. Única rota com ffmpeg além da do
// vídeo do story (next.config.ts).
export const maxDuration = 60;

const texto = (form: FormData, campo: string, max: number) => String(form.get(campo) ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!moduloPermitido(user, "marketing")) return NextResponse.json({ error: "Sem acesso ao Marketing." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get("trecho");
  if (!form || !(arquivo instanceof File)) return NextResponse.json({ error: "Escolha a música." }, { status: 400 });
  const titulo = texto(form, "titulo", 120);
  const artista = texto(form, "artista", 120);
  const fonte = texto(form, "fonte", 200);
  if (!titulo) return NextResponse.json({ error: "Dê um nome pra música." }, { status: 400 });
  if (!fonte) return NextResponse.json({ error: "Diga de onde veio a música (ex.: Pixabay Music, uso comercial livre)." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO_TRECHO) return NextResponse.json({ error: "Trecho grande demais." }, { status: 400 });

  const wav = Buffer.from(await arquivo.arrayBuffer());
  const duracao = duracaoDoWav(wav);
  if (duracao === null) return NextResponse.json({ error: "Não reconheci o áudio enviado." }, { status: 400 });
  if (duracao < DURACAO_MINIMA_S) return NextResponse.json({ error: `O trecho tem que ter pelo menos ${DURACAO_MINIMA_S} segundos.` }, { status: 400 });

  try {
    const audio = await codificarTrechoMusica(wav, duracao);
    const musica = await prisma.musicaStory.create({
      data: { titulo, artista: artista || null, fonte, audio: new Uint8Array(audio), duracaoSeg: Math.round(duracao * 100) / 100 },
      select: { id: true },
    });
    revalidatePath("/marketing/musicas");
    return NextResponse.json({ ok: true, id: musica.id });
  } catch (e) {
    console.error(`[musicas] falha ao guardar: ${e instanceof Error ? e.message : e}`);
    return NextResponse.json({ error: "Não consegui preparar a música — tente outro arquivo." }, { status: 500 });
  }
}
