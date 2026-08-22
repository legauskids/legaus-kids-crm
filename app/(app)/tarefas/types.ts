export type TarefaVM = {
  id: string;
  titulo: string;
  status: "A_FAZER" | "EM_ANDAMENTO" | "APROVACAO" | "CONCLUIDA";
  prazo: string;
  descricao: string | null;
  automatica: boolean;
  responsavelId: string;
  responsavelNome: string;
  solicitanteId: string;
  negocioId: string | null;
  negocioTitulo: string | null;
  funilId: string | null;
  etapaId: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  A_FAZER: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  APROVACAO: "Aprovação",
  ATRASADA: "Atrasada",
  CONCLUIDA: "Concluída",
};
