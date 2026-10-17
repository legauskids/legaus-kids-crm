import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ImageResponse } from "next/og";
import {
  CORES_MARCA,
  RAIO_FOTO,
  alturaSelo,
  contornoTitulo,
  linhasDoTitulo,
  type DadosArte,
  type ElementoLogo,
  type ElementoSelo,
  type ElementoTitulo,
  type FotoArte,
} from "@/lib/utils/postagem-arte";

// Renderizador ÚNICO das artes dos posts (padrão de 2026-10-16): o editor
// mostra a imagem que sai daqui, então o que o Marcos aprova é exatamente o
// que vai pro Instagram. Mesmo motor do card de produto (next/og + sharp).
// Fontes: Baloo 2 e Nunito (OFL, substitutas da Bjola e da Museo Sans
// Rounded) em instâncias fixas — o motor não lê fonte variável.

type No = { type: string; key: string | null; props: Record<string, unknown> };

const PASTA = path.join(process.cwd(), "public", "marketing");
let recursos: { baloo: Buffer; nunito: Buffer; logo: Buffer; logoProporcao: number } | null = null;

async function carregarRecursos() {
  if (recursos) return recursos;
  const logo = fs.readFileSync(path.join(process.cwd(), "public", "legaus-logo.png"));
  const meta = await sharp(logo).metadata();
  recursos = {
    baloo: fs.readFileSync(path.join(PASTA, "Baloo2-ExtraBold.ttf")),
    nunito: fs.readFileSync(path.join(PASTA, "Nunito-Black.ttf")),
    logo,
    logoProporcao: (meta.height ?? 1) / (meta.width ?? 1),
  };
  return recursos;
}

function no(type: string, key: string, props: Record<string, unknown>): No {
  return { type, key, props };
}

function dataUri(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Tratamento leve (scripts/tratar_foto.py do pacote): corrige a rotação,
 * limita a 2160 px, balanço de branco parcial (gray-world a 50%),
 * autocontraste suave e +5% de saturação. Tem que continuar parecendo foto
 * de celular bem tirada, nunca foto com filtro.
 */
export async function tratarFoto(original: Buffer): Promise<{ buffer: Buffer; largura: number; altura: number }> {
  const base = sharp(original).rotate().resize({ width: 2160, height: 2160, fit: "inside", withoutEnlargement: true }).removeAlpha();
  const reduzida = await base.toBuffer();
  const { channels } = await sharp(reduzida).stats();
  const medias = channels.slice(0, 3).map((c) => Math.max(c.mean, 1));
  const cinza = medias.reduce((a, b) => a + b, 0) / 3;
  const ganhos = medias.map((m) => 1 + 0.5 * (cinza / m - 1));
  const { data, info } = await sharp(reduzida)
    .linear(ganhos, [0, 0, 0])
    .normalise({ lower: 0.5, upper: 99.5 })
    .modulate({ saturation: 1.05 })
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });
  return { buffer: data, largura: info.width, altura: info.height };
}

/** Recorta a foto pra caixa sem distorcer, no ponto focal, com zoom (≥ 1). */
async function recortar(foto: Buffer, f: FotoArte): Promise<Buffer> {
  const [x0, y0, x1, y1] = f.box;
  const w = Math.round(x1 - x0);
  const h = Math.round(y1 - y0);
  const meta = await sharp(foto).metadata();
  const fw = meta.width ?? w;
  const fh = meta.height ?? h;
  const escala = Math.max(w / fw, h / fh) * Math.max(1, f.zoom || 1);
  const rw = Math.max(w, Math.round(fw * escala));
  const rh = Math.max(h, Math.round(fh * escala));
  const left = Math.min(Math.max(Math.round(rw * f.fx - w / 2), 0), rw - w);
  const top = Math.min(Math.max(Math.round(rh * f.fy - h / 2), 0), rh - h);
  return sharp(foto).resize(rw, rh).extract({ left, top, width: w, height: h }).jpeg({ quality: 92 }).toBuffer();
}

function noTitulo(e: ElementoTitulo): No {
  const escala = e.escala || 1;
  const { topos, altura: alturaTotal } = linhasDoTitulo(e.linhas, escala);
  const linhas = e.linhas.map((l, i) => {
    const tam = Math.round(l.tam * escala);
    const contorno = contornoTitulo(tam);
    const altura = Math.round(tam * 1.4);
    // Com lineHeight 1, a letra fica 0,31 × tamanho mais alta que no
    // legaus_render.py (medido nas artes aprovadas): desce isso.
    const topo = topos[i] + Math.round(tam * 0.31);
    const texto = (key: string, estilo: Record<string, unknown>) =>
      no("div", key, {
        style: { position: "absolute", left: 0, top: 0, display: "flex", whiteSpace: "nowrap", fontFamily: "Baloo2", fontSize: tam, lineHeight: 1, ...estilo },
        children: l.t,
      });
    return no("div", `linha${i}`, {
      style: { position: "absolute", left: 0, top: topo, display: "flex", height: altura, width: 1080 },
      children: [
        // Contorno branco por fora + sombra, e a cor por cima (como o título "adesivo" aprovado).
        texto("contorno", {
          color: CORES_MARCA.branco,
          WebkitTextStroke: `${contorno * 2}px ${CORES_MARCA.branco}`,
          textShadow: "0px 10px 12px rgba(0,0,0,0.32)",
        }),
        texto("cor", { color: CORES_MARCA[l.cor] }),
      ],
    });
  });
  return no("div", e.id, { style: { position: "absolute", left: e.x, top: e.y, display: "flex", width: 1080 - e.x, height: alturaTotal + 60 }, children: linhas });
}

function iconeCheck(raio: number, fundo: string, traco: string): string {
  const d = raio * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}"><circle cx="${raio}" cy="${raio}" r="${raio}" fill="${fundo}"/><polyline points="${raio * 0.55},${raio * 1.02} ${raio * 0.88},${raio * 1.35} ${raio * 1.48},${raio * 0.68}" fill="none" stroke="${traco}" stroke-width="${Math.max(4, Math.round(raio * 0.28))}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return dataUri(Buffer.from(svg), "image/svg+xml");
}

function noSelo(e: ElementoSelo): No {
  const fundo = e.estilo === "laranja" ? CORES_MARCA.laranja : CORES_MARCA.branco;
  const cor = e.estilo === "laranja" ? CORES_MARCA.branco : CORES_MARCA.teal;
  const h = alturaSelo(e.tam);
  const raio = Math.round(h * 0.28);
  return no("div", e.id, {
    style: {
      position: "absolute",
      left: e.x,
      top: e.y,
      height: h,
      display: "flex",
      alignItems: "center",
      gap: Math.round(e.tam * 0.45),
      paddingLeft: Math.round(e.tam * 0.75),
      paddingRight: Math.round(e.tam * 0.75),
      borderRadius: h / 2,
      background: fundo,
      boxShadow: "0px 10px 12px rgba(0,0,0,0.27)",
    },
    children: [
      no("img", "check", { src: iconeCheck(raio, cor, fundo), width: raio * 2, height: raio * 2 }),
      no("div", "texto", { style: { display: "flex", fontFamily: "Nunito", fontSize: e.tam, color: cor, lineHeight: 1, whiteSpace: "nowrap" }, children: e.t }),
    ],
  });
}

function noLogo(e: ElementoLogo, logo: string, proporcao: number): No {
  const altura = Math.round(e.larg * proporcao);
  return no("img", e.id, { src: logo, width: e.larg, height: altura, style: { position: "absolute", left: Math.round(e.cx - e.larg / 2), top: Math.round(e.base - altura) } });
}

/** Desenha a arte e devolve o JPEG final (a API do Instagram só aceita JPEG). */
export async function renderizarArte(dados: DadosArte, fotos: Map<string, Buffer>): Promise<Buffer> {
  const r = await carregarRecursos();
  const logo = dataUri(r.logo, "image/png");
  const nosFotos = await Promise.all(
    dados.fotos.map(async (f, i) => {
      const foto = fotos.get(f.imagemId);
      const [x0, y0, x1, y1] = f.box;
      const estilo = { position: "absolute", left: x0, top: y0, width: x1 - x0, height: y1 - y0, borderRadius: RAIO_FOTO };
      if (!foto) return no("div", `foto${i}`, { style: { ...estilo, background: CORES_MARCA.claro } });
      const recorte = await recortar(foto, f);
      return no("img", `foto${i}`, { src: dataUri(recorte, "image/jpeg"), width: x1 - x0, height: y1 - y0, style: estilo });
    }),
  );
  const nosElementos = dados.elementos.map((e) =>
    e.tipo === "titulo" ? noTitulo(e) : e.tipo === "selo" ? noSelo(e) : noLogo(e, logo, r.logoProporcao),
  );

  const resposta = new ImageResponse(
    no("div", null as unknown as string, {
      style: { width: dados.w, height: dados.h, display: "flex", position: "relative", background: CORES_MARCA.teal },
      children: [...nosFotos, ...nosElementos],
    }) as unknown as ConstructorParameters<typeof ImageResponse>[0],
    {
      width: dados.w,
      height: dados.h,
      fonts: [
        { name: "Baloo2", data: r.baloo, weight: 800, style: "normal" },
        { name: "Nunito", data: r.nunito, weight: 900, style: "normal" },
      ],
    },
  );
  const png = Buffer.from(await resposta.arrayBuffer());
  return sharp(png).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();
}
