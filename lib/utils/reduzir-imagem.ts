/** Reduz no próprio aparelho antes de mandar — foto de celular passa do limite de envio. Só no navegador. */
export async function reduzirImagem(arquivo: File, ladoMaximo = 2400): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
    if (blob) return blob;
  } catch {
    // Formato que o navegador não abre (ex.: HEIC no computador): manda como veio.
  }
  return arquivo;
}
