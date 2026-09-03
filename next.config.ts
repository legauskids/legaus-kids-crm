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
};

export default nextConfig;
