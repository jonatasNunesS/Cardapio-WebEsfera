const HEXADECIMAL = /^#[0-9A-F]{6}$/;

export function ehHexadecimal(valor: string): boolean {
  return HEXADECIMAL.test(valor.toUpperCase());
}

function canal(valor: number): number {
  const c = valor / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function canais(hex: string): [number, number, number] {
  const numero = Number.parseInt(hex.slice(1), 16);
  return [(numero >> 16) & 255, (numero >> 8) & 255, numero & 255];
}

export function paraHexadecimal([r, g, b]: readonly [number, number, number]): string {
  const parte = (valor: number) =>
    Math.round(Math.min(255, Math.max(0, valor)))
      .toString(16)
      .padStart(2, '0');
  return `#${parte(r)}${parte(g)}${parte(b)}`.toUpperCase();
}

function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map(canal) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function razaoDeContraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (clara + 0.05) / (escura + 0.05);
}
