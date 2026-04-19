/**
 * Reduz texto de geocodificação (ex.: Nominatim) a logradouro + número + bairro, sem CEP/país.
 * Mantido em sync com `shared/format-short-address.ts` na raiz do monorepo (mobile).
 */

const CEP_RE = /\b\d{5}-?\d{3}\b/g;

export function formatShortAddressFromGeocoded(full: string | undefined | null): string {
  if (!full?.trim()) return "";
  let s = full.trim().replace(CEP_RE, "").replace(/,\s*,/g, ",").replace(/^\s*,|,\s*$/g, "");
  s = s.replace(/,\s*(Brasil|Brazil)\s*$/i, "").trim();
  const parts = s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const filtered = parts.filter((p) => {
    if (CEP_RE.test(p)) return false;
    if (/^(Brasil|Brazil)$/i.test(p)) return false;
    return true;
  });
  if (filtered.length === 0) return "";
  return filtered.slice(0, 3).join(", ");
}
