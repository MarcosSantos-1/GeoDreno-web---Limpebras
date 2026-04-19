"use client";

const OPCOES = [1, 2, 3, 4, 5, 6] as const;

type Props = {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  id?: string;
};

/** Select 1–6; se o registro tiver quantidade &gt; 6, mostra opção extra para não perder o valor até corrigir. */
export function QuantidadeSelect({ value, onChange, className, id }: Props) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={className}
    >
      {(value < 1 || value > 6) && Number.isFinite(value) && (
        <option value={value}>
          {value} (valor atual)
        </option>
      )}
      {OPCOES.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}
