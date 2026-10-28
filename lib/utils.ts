import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Primeira letra/número de cada palavra. part[0] cortava emoji ao meio
// ("🌸 Maria" vira meio caractere) e a página dava erro de hidratação —
// comum nos nomes do perfil do WhatsApp.
export function initials(nome: string): string {
  return nome
    .split(/\s+/)
    .map((part) => part.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
