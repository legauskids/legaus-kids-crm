/**
 * Paleta lúdica compartilhada — pedida pelo Marcos em 2026-08-25 pra dar
 * mais vida visual ao CRM: cada card do dashboard, cada etapa do funil de
 * negócios etc. recebe uma cor diferente da mesma rotação, em vez de tudo
 * na mesma cor. As duas primeiras (teal/laranja) são as cores reais da
 * marca (extraídas do logo); o resto complementa sem brigar com elas.
 *
 * IMPORTANTE: todas as classes aqui são strings literais completas (nunca
 * montadas por concatenação/template) — o Tailwind v4 só inclui no CSS
 * final as classes que consegue achar como texto puro no código-fonte; uma
 * classe montada em runtime (tipo `border-t-${cor}-200`) não aparece no
 * build.
 */
export type CorPaleta = {
  nome: string;
  border: string;
  borderTop: string;
  bg: string;
  icon: string;
  iconBg: string;
  dot: string;
};

export const PALETA_CARDS: CorPaleta[] = [
  {
    nome: "teal",
    border: "border-teal-200 dark:border-teal-900",
    borderTop: "border-t-teal-400 dark:border-t-teal-700",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    icon: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-100 dark:bg-teal-900/50",
    dot: "bg-teal-500",
  },
  {
    nome: "laranja",
    border: "border-orange-200 dark:border-orange-900",
    borderTop: "border-t-orange-400 dark:border-t-orange-700",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    icon: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
    dot: "bg-orange-500",
  },
  {
    nome: "azul",
    border: "border-blue-200 dark:border-blue-900",
    borderTop: "border-t-blue-400 dark:border-t-blue-700",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    icon: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    dot: "bg-blue-500",
  },
  {
    nome: "roxo",
    border: "border-purple-200 dark:border-purple-900",
    borderTop: "border-t-purple-400 dark:border-t-purple-700",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    icon: "text-purple-600 dark:text-purple-400",
    iconBg: "bg-purple-100 dark:bg-purple-900/50",
    dot: "bg-purple-500",
  },
  {
    nome: "âmbar",
    border: "border-amber-200 dark:border-amber-900",
    borderTop: "border-t-amber-400 dark:border-t-amber-700",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    icon: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    dot: "bg-amber-500",
  },
  {
    nome: "rosa",
    border: "border-pink-200 dark:border-pink-900",
    borderTop: "border-t-pink-400 dark:border-t-pink-700",
    bg: "bg-pink-50 dark:bg-pink-950/30",
    icon: "text-pink-600 dark:text-pink-400",
    iconBg: "bg-pink-100 dark:bg-pink-900/50",
    dot: "bg-pink-500",
  },
  {
    nome: "índigo",
    border: "border-indigo-200 dark:border-indigo-900",
    borderTop: "border-t-indigo-400 dark:border-t-indigo-700",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    icon: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/50",
    dot: "bg-indigo-500",
  },
];

export function corDoIndice(indice: number): CorPaleta {
  return PALETA_CARDS[indice % PALETA_CARDS.length];
}
