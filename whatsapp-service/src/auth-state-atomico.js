import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";

// Substitui o useMultiFileAuthState do Baileys (mesma pasta, mesmos nomes de
// arquivo — uma sessão já pareada continua valendo sem parear de novo). A
// única diferença é COMO grava: o original faz writeFile direto em cima do
// arquivo (trunca e reescreve), e o próprio Baileys avisa que isso não é pra
// produção. Numa queda de luz ou encerramento forçado no meio da escrita, o
// arquivo fica vazio/truncado — e o readData original engole o erro e trata
// como "não existe". Pro creds.json isso é o pior caso: o serviço sobe como
// aparelho NOVO, sem pareamento, e precisa parear de novo. Aqui grava num
// .tmp, força ir pro disco (sync) e só então renomeia por cima (troca
// atômica no mesmo volume), então o arquivo "de verdade" é sempre a versão
// antiga inteira ou a nova inteira. Motivado pelo servidor da Legaus
// (Windows, nobreak pequeno), visto em 2026-09-25.

// Fila por arquivo: leituras e escritas do mesmo arquivo nunca se cruzam
// (mesmo papel do Mutex do original, sem depender do async-mutex, que é só
// dependência interna do Baileys).
//
// A chave da fila é o caminho em minúsculas porque o NTFS não diferencia
// maiúsculas: os ids de app-state-sync-key são base64 ("AAAAAFfu" e
// "AAAAAFfU" são chaves diferentes) mas caem no MESMO arquivo. O original
// travava pelo nome exato, então as duas escritas rodavam juntas e se
// misturavam — achado em 2026-09-25 um app-state-sync-key com JSON de uma
// chave + 9 caracteres da outra sobrando no fim. Aqui elas passam a ser
// uma depois da outra (a última vence, arquivo sempre íntegro). A colisão
// em si (duas chaves num arquivo só) continua — mudar o nome dos arquivos
// quebraria a compatibilidade com as chaves já gravadas.
const filas = new Map();

function naFila(caminho, tarefa) {
  const chave = caminho.toLowerCase();
  const anterior = filas.get(chave) || Promise.resolve();
  const atual = anterior.then(tarefa, tarefa);
  const limpar = () => {
    if (filas.get(chave) === atual) filas.delete(chave);
  };
  // then(limpar, limpar) e não finally: finally repassaria a rejeição pra
  // uma promise que ninguém trata, e um unhandledRejection aqui dispara a
  // reconexão do index.js à toa.
  atual.then(limpar, limpar);
  filas.set(chave, atual);
  return atual;
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gravarAtomico(caminho, texto) {
  const temporario = `${caminho}.tmp`;
  const arquivo = await open(temporario, "w");
  try {
    await arquivo.writeFile(texto);
    await arquivo.sync();
  } finally {
    await arquivo.close();
  }
  // No Windows o rename por cima pode falhar por um instante (EPERM/EBUSY/
  // EACCES) se o antivírus estiver lendo o arquivo naquele momento — tenta
  // de novo algumas vezes antes de desistir.
  for (let tentativa = 1; ; tentativa++) {
    try {
      await rename(temporario, caminho);
      return;
    } catch (erro) {
      const transitorio = ["EPERM", "EBUSY", "EACCES"].includes(erro.code);
      if (!transitorio || tentativa >= 5) throw erro;
      await esperar(50 * tentativa);
    }
  }
}

export async function useAuthStateAtomico(pasta) {
  const nomeSeguro = (arquivo) => arquivo?.replace(/\//g, "__")?.replace(/:/g, "-");

  const escrever = (dados, arquivo) => {
    const caminho = join(pasta, nomeSeguro(arquivo));
    return naFila(caminho, () => gravarAtomico(caminho, JSON.stringify(dados, BufferJSON.replacer)));
  };

  const ler = async (arquivo) => {
    const caminho = join(pasta, nomeSeguro(arquivo));
    try {
      const texto = await naFila(caminho, () => readFile(caminho, { encoding: "utf-8" }));
      return JSON.parse(texto, BufferJSON.reviver);
    } catch (erro) {
      // Arquivo que não existe é normal (chave ainda não criada). Qualquer
      // outro erro — principalmente JSON inválido — antes era engolido em
      // silêncio; agora fica no log pra dar pra diagnosticar.
      if (erro.code !== "ENOENT") {
        console.error(`[auth] Não foi possível ler ${arquivo}:`, erro.message);
      }
      return null;
    }
  };

  const remover = (arquivo) => {
    const caminho = join(pasta, nomeSeguro(arquivo));
    return naFila(caminho, () => unlink(caminho).catch(() => {}));
  };

  const infoPasta = await stat(pasta).catch(() => null);
  if (infoPasta && !infoPasta.isDirectory()) {
    throw new Error(`${pasta} existe mas não é uma pasta — apague ou use outro caminho.`);
  }
  if (!infoPasta) {
    await mkdir(pasta, { recursive: true });
  }

  const creds = (await ler("creds.json")) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (tipo, ids) => {
          const dados = {};
          await Promise.all(
            ids.map(async (id) => {
              let valor = await ler(`${tipo}-${id}.json`);
              if (tipo === "app-state-sync-key" && valor) {
                valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
              }
              dados[id] = valor;
            }),
          );
          return dados;
        },
        set: async (dados) => {
          const tarefas = [];
          for (const categoria in dados) {
            for (const id in dados[categoria]) {
              const valor = dados[categoria][id];
              const arquivo = `${categoria}-${id}.json`;
              tarefas.push(valor ? escrever(valor, arquivo) : remover(arquivo));
            }
          }
          await Promise.all(tarefas);
        },
      },
    },
    saveCreds: () => escrever(creds, "creds.json"),
  };
}
