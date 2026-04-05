export function DashfyLogoIcon({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo-icon.png"
      alt="Dashfy"
      width={size}
      height={size}
      className={`object-contain ${className ?? ""}`}
    />
  );
}

export function DashfyLogoFull({ width = 160, className }: { width?: number; className?: string }) {
  return (
    <img
      src="/logo-full.png"
      alt="Dashfy"
      width={width}
      className={`object-contain ${className ?? ""}`}
    />
  );
}
