// Assistente do Marketing (pedido do Marcos de 2026-10-20: "o Claude
// funcionando dentro do módulo"): o Claude conversa sobre um post e faz os
// ajustes nas artes pedindo-os por aqui. Puro e testável — aplicar um ajuste
// é só mexer nos dados da arte; quem confere de novo e salva é o servidor
// (sanitizarDadosArte, em lib/server/marketing.ts), igual ao editor.

import {
  TAMANHO_ARTE,
  alturaTitulo,
  comMaiuscula,
  seloNovo,
  tituloNovo,
  type DadosArte,
  type ElementoArte,
  type ElementoLogo,
  type ElementoSelo,
  type ElementoTitulo,
  type FormatoArte,
} from "./postagem-arte";

export type AlvoAjuste = "titulo" | "selo1" | "selo2" | "logo" | "foto1" | "foto2";

/** Um ajuste pedido pelo assistente. Posição absoluta (x, y…) ou relativa (dx, dy), em px da arte. */
export type AjusteArte = {
  elemento: AlvoAjuste;
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  /** Título: tamanho em relação ao padrão (1 = 100%). */
  escala?: number;
  linha1?: string;
  linha2?: string;
  /** Selo: texto, tamanho da letra e cor. */
  texto?: string;
  tam?: number;
  estilo?: "laranja" | "branco";
  /** Selo: ícone de check (padrão) ou de localização (pino). */
  icone?: "check" | "local";
  /** Logo: largura, centro horizontal e borda de baixo. */
  larg?: number;
  cx?: number;
  base?: number;
  centralizar?: boolean;
  /** Foto: qual foto do post (1, 2, 3…), ponto focal (0 a 1) e zoom (1 a 4). */
  foto?: number;
  fx?: number;
  fy?: number;
  zoom?: number;
  /** Tira o selo ou o título da arte (a logo nunca sai). */
  remover?: boolean;
  /** Título: move/aumenta só o título, sem levar os selos junto. */
  soTitulo?: boolean;
};

const selosDe = (d: DadosArte) => d.elementos.filter((e): e is ElementoSelo => e.tipo === "selo");

export type FotoParaAssistente = { id: string; largura: number; altura: number };

type Resultado = { ok: true; dados: DadosArte; feito: string } | { ok: false; erro: string };

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function trocar(dados: DadosArte, id: string, novo: ElementoArte | null): DadosArte {
  const elementos = novo ? dados.elementos.map((e) => (e.id === id ? novo : e)) : dados.elementos.filter((e) => e.id !== id);
  return { ...dados, elementos };
}

/** Elemento novo entra antes da logo (a logo fica por cima, como no padrão). */
function inserir(dados: DadosArte, novo: ElementoArte): DadosArte {
  return { ...dados, elementos: [...dados.elementos.filter((e) => e.tipo !== "logo"), novo, ...dados.elementos.filter((e) => e.tipo === "logo")] };
}

function posicao<T extends { x: number; y: number }>(e: T, a: AjusteArte): T {
  return { ...e, x: Math.round(num(a.x) ?? e.x + (num(a.dx) ?? 0)), y: Math.round(num(a.y) ?? e.y + (num(a.dy) ?? 0)) };
}

export function aplicarAjuste(dados: DadosArte, formato: FormatoArte, a: AjusteArte, fotosPost: FotoParaAssistente[]): Resultado {
  const { w } = TAMANHO_ARTE[formato];

  if (a.elemento === "foto1" || a.elemento === "foto2") {
    const i = a.elemento === "foto1" ? 0 : 1;
    const f = dados.fotos[i];
    if (!f) return { ok: false, erro: `Essa arte não tem a ${i + 1}ª foto.` };
    const foto = num(a.foto);
    if (foto !== undefined && !fotosPost[foto - 1]) return { ok: false, erro: `O post não tem a foto ${foto}.` };
    const novaFoto = foto !== undefined ? fotosPost[foto - 1].id : f.imagemId;
    const trocouFoto = novaFoto !== f.imagemId;
    const fotos = dados.fotos.map((x, j) =>
      j === i
        ? {
            ...x,
            imagemId: novaFoto,
            fx: num(a.fx) ?? (trocouFoto ? 0.5 : x.fx),
            fy: num(a.fy) ?? (trocouFoto ? 0.5 : x.fy),
            zoom: num(a.zoom) ?? (trocouFoto ? 1 : x.zoom),
          }
        : x,
    );
    const numeroAntes = fotosPost.findIndex((p) => p.id === f.imagemId) + 1;
    const g = fotos[i];
    // Antes → depois explícito: sem isso o assistente lia o estado já trocado
    // e dizia "já estava com a foto 4" (teste de 20/10).
    return {
      ok: true,
      dados: { ...dados, fotos },
      feito: trocouFoto
        ? `foto ${i + 1}: ANTES era a foto ${numeroAntes} do post, AGORA é a foto ${foto}`
        : `foto ${i + 1}: enquadramento fx ${f.fx.toFixed(2)}→${g.fx.toFixed(2)}, fy ${f.fy.toFixed(2)}→${g.fy.toFixed(2)}, zoom ${f.zoom.toFixed(2)}→${g.zoom.toFixed(2)}`,
    };
  }

  if (a.elemento === "logo") {
    const logo = dados.elementos.find((e): e is ElementoLogo => e.tipo === "logo");
    if (!logo) return { ok: false, erro: "Essa arte está sem logo." };
    if (a.remover) return { ok: false, erro: "A logo não sai das artes — só muda de tamanho e de posição." };
    const larg = Math.round(num(a.larg) ?? logo.larg);
    const cx = a.centralizar ? w / 2 : num(a.cx) ?? logo.cx + (num(a.dx) ?? 0);
    const base = num(a.base) ?? logo.base + (num(a.dy) ?? 0);
    const nova = { ...logo, larg, cx: Math.round(cx), base: Math.round(base) };
    const mudancas = [
      nova.larg !== logo.larg && `largura ${logo.larg}→${nova.larg}`,
      nova.cx !== logo.cx && `centro x ${logo.cx}→${nova.cx}`,
      nova.base !== logo.base && `base ${logo.base}→${nova.base}`,
    ].filter(Boolean);
    return { ok: true, dados: trocar(dados, logo.id, nova), feito: `logo: ${mudancas.join(", ") || "sem mudança"}` };
  }

  if (a.elemento === "titulo") {
    const titulo = dados.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo");
    if (a.remover) return titulo ? { ok: true, dados: trocar(dados, titulo.id, null), feito: "tirou o título" } : { ok: false, erro: "Essa arte não tem título." };
    if (!titulo) {
      const linhas: [string, string] = [a.linha1 ?? "", a.linha2 ?? ""];
      const novo = tituloNovo(formato, linhas);
      if (!novo) return { ok: false, erro: "Pra pôr título numa arte sem título, diga o texto (linha1 e/ou linha2)." };
      return { ok: true, dados: inserir(dados, posicao({ ...novo, escala: num(a.escala) ?? 1 }, a)), feito: "pôs um título" };
    }
    let linhas = titulo.linhas.map((l) => ({ ...l }));
    const textos = [a.linha1, a.linha2];
    if (linhas.length === 1 && a.linha1 !== undefined && a.linha2 === undefined) {
      // Título de uma linha só (slide de benefício): "linha1" é o texto dele.
      linhas[0].t = comMaiuscula(a.linha1);
    } else {
      textos.forEach((t, i) => {
        if (t === undefined) return;
        if (linhas[i]) linhas[i].t = comMaiuscula(t);
        else if (i === 1 && linhas.length === 1) linhas.push({ t: comMaiuscula(t), tam: Math.round(linhas[0].tam * 1.72), cor: "laranja" });
      });
    }
    linhas = linhas.filter((l) => l.t);
    if (!linhas.length) return { ok: true, dados: trocar(dados, titulo.id, null), feito: "tirou o título" };
    const novo = posicao({ ...titulo, linhas, escala: num(a.escala) ?? titulo.escala }, a);
    let resultado = trocar(dados, titulo.id, novo);
    // Título e selos são um bloco: mover ou aumentar o título leva os selos de
    // baixo junto, mantendo o espaço — senão o título cobre os selos (visto
    // no teste de 20/10: o assistente descia o título, via a sobreposição e
    // "corrigia" de novo).
    if (!a.soTitulo) {
      const dx = novo.x - titulo.x;
      const dy = novo.y - titulo.y + (alturaTitulo(novo.linhas, novo.escala) - alturaTitulo(titulo.linhas, titulo.escala));
      if (dx || dy) {
        resultado = {
          ...resultado,
          elementos: resultado.elementos.map((e) => (e.tipo === "selo" && e.y >= titulo.y ? { ...e, x: Math.round(e.x + dx), y: Math.round(e.y + dy) } : e)),
        };
      }
    }
    const comSelos = !a.soTitulo && selosDe(dados).some((s) => s.y >= titulo.y);
    const mudancas = [
      novo.x !== titulo.x && `x ${titulo.x}→${novo.x}`,
      novo.y !== titulo.y && `y ${titulo.y}→${novo.y}`,
      novo.escala !== titulo.escala && `escala ${titulo.escala}→${novo.escala}`,
      novo.linhas.map((l) => l.t).join(" / ") !== titulo.linhas.map((l) => l.t).join(" / ") && `texto "${titulo.linhas.map((l) => l.t).join(" / ")}"→"${novo.linhas.map((l) => l.t).join(" / ")}"`,
    ].filter(Boolean);
    return { ok: true, dados: resultado, feito: `título: ${mudancas.join(", ") || "sem mudança"}${comSelos && mudancas.length ? " (os selos foram junto)" : ""}` };
  }

  // Selos
  const i = a.elemento === "selo1" ? 0 : 1;
  const selos = dados.elementos.filter((e): e is ElementoSelo => e.tipo === "selo");
  const selo = selos[i];
  if (a.remover) return selo ? { ok: true, dados: trocar(dados, selo.id, null), feito: `tirou o selo ${i + 1}` } : { ok: false, erro: `Essa arte não tem o selo ${i + 1}.` };
  if (!selo) {
    if (selos.length >= 2) return { ok: false, erro: "Já tem 2 selos — no máximo 3 informações por imagem (título + 2 selos)." };
    const novo = seloNovo(dados, formato, a.texto, a.icone);
    return {
      ok: true,
      dados: inserir(dados, posicao({ ...novo, tam: Math.round(num(a.tam) ?? novo.tam), estilo: a.estilo ?? novo.estilo }, a)),
      feito: `pôs o selo "${novo.t}"`,
    };
  }
  const icone = a.icone === undefined ? selo.icone : a.icone === "local" ? "local" : undefined;
  const novo: ElementoSelo = posicao({ ...selo, t: a.texto !== undefined ? comMaiuscula(a.texto) : selo.t, tam: Math.round(num(a.tam) ?? selo.tam), estilo: a.estilo ?? selo.estilo, icone }, a);
  const mudancas = [
    novo.t !== selo.t && `texto "${selo.t}"→"${novo.t}"`,
    novo.x !== selo.x && `x ${selo.x}→${novo.x}`,
    novo.y !== selo.y && `y ${selo.y}→${novo.y}`,
    novo.tam !== selo.tam && `tam ${selo.tam}→${novo.tam}`,
    novo.estilo !== selo.estilo && `estilo ${selo.estilo}→${novo.estilo}`,
    (novo.icone ?? "check") !== (selo.icone ?? "check") && `ícone ${selo.icone ?? "check"}→${novo.icone ?? "check"}`,
  ].filter(Boolean);
  return { ok: true, dados: trocar(dados, selo.id, novo), feito: `selo ${i + 1}: ${mudancas.join(", ") || "sem mudança"}` };
}

/** Estado das artes em formato curto, pro Claude saber onde está cada coisa. */
export function resumoDasArtes(artes: { ordem: number; formato: FormatoArte; dados: DadosArte }[], fotosPost: FotoParaAssistente[]) {
  const numeroDaFoto = (id: string) => fotosPost.findIndex((f) => f.id === id) + 1;
  let slide = 0;
  return artes.map((a) => {
    const tipo = a.formato === "STORY" ? "story (1080×1920)" : slide++ === 0 ? "capa do carrossel (1080×1350)" : `slide ${slide} do carrossel (1080×1350)`;
    const titulo = a.dados.elementos.find((e): e is ElementoTitulo => e.tipo === "titulo");
    const logo = a.dados.elementos.find((e): e is ElementoLogo => e.tipo === "logo");
    return {
      arte: a.ordem + 1,
      tipo,
      fotos: a.dados.fotos.map((f, i) => ({ elemento: `foto${i + 1}`, fotoDoPost: numeroDaFoto(f.imagemId), caixa: f.box, fx: +f.fx.toFixed(2), fy: +f.fy.toFixed(2), zoom: +f.zoom.toFixed(2) })),
      titulo: titulo ? { x: titulo.x, y: titulo.y, escala: titulo.escala, linhas: titulo.linhas.map((l) => `${l.t} (${l.tam}px, ${l.cor})`) } : null,
      selos: a.dados.elementos
        .filter((e): e is ElementoSelo => e.tipo === "selo")
        .map((s, i) => ({ elemento: `selo${i + 1}`, texto: s.t, x: s.x, y: s.y, tam: s.tam, estilo: s.estilo, icone: s.icone ?? "check" })),
      logo: logo ? { cx: logo.cx, base: logo.base, larg: logo.larg } : null,
    };
  });
}

// Resposta honesta (pedido do Marcos de 2026-10-21): o assistente respondia
// "Feito." sem ter feito nada — a IA gastava o limite pensando, voltava sem
// texto e o código completava com "Feito.". Agora a resposta final sempre
// mostra o que mudou de verdade (tirado do resultado das ferramentas) ou diz
// que nada mudou.

const VERBOS_DE_FEITO =
  /\b(feito|pronto|prontinho|fiz|ajustei|troquei|mudei|coloquei|alterei|atualizei|deixei|aumentei|diminu[ií]|desci|subi|tirei|removi|apliquei|criei|refiz|separei|dividi|movi|centralizei|reduzi|enquadrei|reposicionei|organizei|posicionei)\b/i;

/** O texto diz que alguma coisa foi feita? */
export function afirmaQueFez(texto: string): boolean {
  return VERBOS_DE_FEITO.test(texto);
}

/**
 * Texto final pro Marcos: o da IA + a lista do que mudou de verdade. Sem
 * mudança nenhuma, uma resposta que diz que fez vira "não consegui".
 */
export function respostaHonesta(texto: string, feitos: string[]): string {
  const limpo = texto.trim();
  if (feitos.length > 0) {
    return `${limpo || "Fiz o seguinte:"}\n\n✔️ O que mudou:\n${feitos.map((f) => `• ${f}`).join("\n")}`;
  }
  if (!limpo || afirmaQueFez(limpo)) return "⚠️ Não consegui fazer esse pedido — nada foi alterado nas artes nem na legenda. Me diga de outro jeito ou ajuste em Ajustar/Textos das artes.";
  return limpo;
}
