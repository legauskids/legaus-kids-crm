export type EmProducaoVM = {
  id: string;
  titulo: string;
  contatoNome: string;
  responsavelNome: string;
  progressoProducao: number | null;
  previsaoProducao: string | null;
  /** Etapa atual — pro aviso de concluir sem passar pela Avaliação. */
  etapaNome: string;
  /** Negócio em andamento num funil que tem etapa "Concluído" (pós-venda). */
  podeConcluir: boolean;
};

export type InstalacaoVM = {
  id: string;
  titulo: string;
  contatoNome: string;
  responsavelNome: string;
  dataInstalacao: string;
  equipeInstalacao: string | null;
  etapaNome: string;
  podeConcluir: boolean;
  /** Já concluído — some do painel, mas continua no calendário (histórico). */
  concluido: boolean;
};

export type AvaliacaoVM = {
  id: string;
  titulo: string;
  contatoNome: string;
  responsavelNome: string;
  dataInstalacao: string | null;
  /** Desde quando está na Avaliação (ISO). */
  desde: string;
  /** Prazo (SLA) da etapa Avaliação, pra destacar quem passou dele. */
  slaDias: number | null;
};

export type ConcluidoVM = {
  id: string;
  titulo: string;
  contatoNome: string;
  responsavelNome: string;
  valorCentavos: number;
  dataInstalacao: string | null;
  concluidoEm: string;
};
