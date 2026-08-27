import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Legaus Kids CRM",
    short_name: "Legaus Kids",
    description: "Sistema de atendimento via WhatsApp e CRM da Legaus Kids",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f5",
    theme_color: "#00a99d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
