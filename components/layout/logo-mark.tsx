export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/legaus-icon-original.png"
      alt="Legaus Kids"
      className={className}
      style={{ borderRadius: "22%", objectFit: "cover" }}
    />
  );
}
