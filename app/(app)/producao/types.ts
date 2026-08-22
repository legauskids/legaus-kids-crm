export type EmProducaoVM = {
  id: string;
  titulo: string;
  contatoNome: string;
  responsavelNome: string;
  progressoProducao: number | null;
  previsaoProducao: string | null;
};

export type InstalacaoVM = {
  id: string;
  titulo: string;
  contatoNome: string;
  responsavelNome: string;
  dataInstalacao: string;
  equipeInstalacao: string | null;
};
