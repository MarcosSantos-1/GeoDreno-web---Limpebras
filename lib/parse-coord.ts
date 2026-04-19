/**
 * Converte texto em latitude/longitude.
 * Aceita vírgula ou ponto decimal (ex.: `-23,488481`, `-46.609392`).
 */
export function parseCoordText(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Valor inicial nos inputs de texto a partir de um número. */
export function coordToInputText(n: number): string {
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Filtra entrada de coordenada: só `-` opcional no início, dígitos e um separador decimal (`,` ou `.`).
 * Bloqueia letras e demais símbolos.
 */
export function sanitizeCoordInput(raw: string): string {
  let s = raw.replace(/[^\d.,\-]/g, "");
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  let intPart = "";
  let fracPart = "";
  let sep: "." | "," | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c >= "0" && c <= "9") {
      if (sep === null) intPart += c;
      else fracPart += c;
    } else if ((c === "." || c === ",") && sep === null) {
      sep = c;
    }
  }
  const body = intPart + (sep !== null ? sep + fracPart : "");
  return neg ? `-${body}` : body;
}
