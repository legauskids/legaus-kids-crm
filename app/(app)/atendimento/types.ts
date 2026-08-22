export type ConversaListItem = {
  id: string;
  contatoNome: string;
  setorNome: string;
  setorId: string;
  status: "FILA" | "ATENDENDO";
  atendenteNome: string | null;
  ultimaMensagem: string | null;
  ultimaMensagemEm: string | null;
};

export type MensagemVM = {
  id: string;
  texto: string;
  direcao: "ENTRADA" | "SAIDA";
  origem: "MANUAL" | "SISTEMA" | "WHATSAPP";
  autorNome: string | null;
  enviadaEm: string;
};

export type NotaVM = {
  id: string;
  texto: string;
  autorNome: string;
  criadaEm: string;
};

export type AgendadaVM = {
  id: string;
  texto: string;
  agendadaPara: string;
  status: "PENDENTE" | "ENVIADA" | "CANCELADA";
};

export type ConversaDetalhada = {
  id: string;
  status: "FILA" | "ATENDENDO";
  contatoId: string;
  contatoNome: string;
  setorId: string;
  atendenteId: string | null;
  mensagens: MensagemVM[];
  notas: NotaVM[];
  agendadas: AgendadaVM[];
};

export type RespostaRapidaVM = {
  id: string;
  titulo: string;
  texto: string;
  escopo: "COMPARTILHADA" | "PESSOAL";
  donoId: string | null;
};

export type NegocioLinkVM = {
  id: string;
  titulo: string;
  funilId: string;
  funilNome: string;
  etapaNome: string;
  valorCentavos: number;
};
