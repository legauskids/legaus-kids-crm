import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default é 1MB — estoura fácil com PDF escaneado (cartão CNPJ, orçamento)
    // ou foto de produto tirada de celular, que chegam ao servidor como
    // Server Action (base64/multipart) antes de qualquer redimensionamento.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // As artes dos posts são desenhadas no servidor com as fontes e a logo lidas
  // do disco (lib/server/postagem-render.ts): vão junto no pacote da função.
  outputFileTracingIncludes: {
    "/api/imagem/postagem-arte/[id]": ["./public/fontes-marca/*.ttf", "./public/legaus-logo.png"],
  },
};

export default nextConfig;
