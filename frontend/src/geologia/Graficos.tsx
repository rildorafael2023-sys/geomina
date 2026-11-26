import { Text } from "@mantine/core";

import { grandeCirculo, polo, projetarLinha, type Ponto } from "./estereograma";

export interface MedidaPlot {
  classe: string;
  dip_dir: number | null;
  dip: number | null;
  trend: number | null;
  plunge: number | null;
  rotulo: string;
  cor: string;
}

/** Estereograma (Schmidt, hemisfério inferior): polos e grandes círculos de planos; lineações como triângulos. */
export function Estereograma({ medidas, tamanho = 240, circulos = true }: { medidas: MedidaPlot[]; tamanho?: number; circulos?: boolean }) {
  const R = tamanho / 2 - 18;
  const c = tamanho / 2;
  const tela = (p: Ponto) => [c + p.x * R, c - p.y * R] as const;
  return (
    <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" aria-label="Estereograma das medidas estruturais">
      <circle cx={c} cy={c} r={R} fill="var(--mantine-color-body)" stroke="currentColor" strokeWidth={1} />
      <line x1={c - 4} y1={c} x2={c + 4} y2={c} stroke="currentColor" strokeWidth={0.6} />
      <line x1={c} y1={c - 4} x2={c} y2={c + 4} stroke="currentColor" strokeWidth={0.6} />
      {["N", "E", "S", "W"].map((l, i) => {
        const a = (i * Math.PI) / 2;
        return (
          <text key={l} x={c + Math.sin(a) * (R + 10)} y={c - Math.cos(a) * (R + 10) + 4} fontSize={11} textAnchor="middle" fill="currentColor">
            {l}
          </text>
        );
      })}
      {medidas.map((m, i) => {
        if (m.classe === "planar" && m.dip_dir !== null && m.dip !== null) {
          const [px, py] = tela(polo(m.dip_dir, m.dip));
          const gc = grandeCirculo(m.dip_dir, m.dip).map((p) => tela(p).join(",")).join(" ");
          return (
            <g key={i}>
              <title>{m.rotulo}</title>
              {circulos && <polyline points={gc} fill="none" stroke={m.cor} strokeWidth={1.2} opacity={0.8} />}
              <circle cx={px} cy={py} r={3.5} fill={m.cor} />
            </g>
          );
        }
        if (m.classe === "linear" && m.trend !== null && m.plunge !== null) {
          const [px, py] = tela(projetarLinha(m.trend, m.plunge));
          return (
            <g key={i}>
              <title>{m.rotulo}</title>
              <polygon points={`${px},${py - 5} ${px - 4.5},${py + 3.5} ${px + 4.5},${py + 3.5}`} fill={m.cor} />
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}

export interface FaixaPlot {
  de: number;
  ate: number;
  cor: string;
  sigla: string;
}

/** Coluna da seção mapeada (do piso para o teto), gerada a partir dos intervalos. */
export function ColunaSecao({ faixas, altura, alturaPx = 260 }: { faixas: FaixaPlot[]; altura?: number | null; alturaPx?: number }) {
  const topo = Math.max(altura ?? 0, ...faixas.map((f) => f.ate), 0.001);
  const esc = (m: number) => alturaPx - 10 - (m / topo) * (alturaPx - 20);
  if (!faixas.length) {
    return <Text size="xs" c="dimmed">A coluna aparece quando houver intervalos.</Text>;
  }
  return (
    <svg width={150} height={alturaPx} viewBox={`0 0 150 ${alturaPx}`} role="img" aria-label="Coluna da seção mapeada">
      {faixas.map((f, i) => (
        <g key={i}>
          <rect x={44} y={esc(f.ate)} width={40} height={esc(f.de) - esc(f.ate)} fill={f.cor} stroke="currentColor" strokeWidth={0.8} />
          <text x={90} y={(esc(f.de) + esc(f.ate)) / 2 + 4} fontSize={11} fill="currentColor">{f.sigla}</text>
          <text x={40} y={esc(f.de) + 4} fontSize={10} textAnchor="end" fill="currentColor">{f.de.toLocaleString("pt-BR")}</text>
        </g>
      ))}
      <text x={40} y={esc(faixas[faixas.length - 1].ate) + 4} fontSize={10} textAnchor="end" fill="currentColor">
        {Math.max(...faixas.map((f) => f.ate)).toLocaleString("pt-BR")} m
      </text>
      {altura && altura > Math.max(...faixas.map((f) => f.ate)) && (
        <line x1={44} x2={84} y1={esc(altura)} y2={esc(altura)} stroke="currentColor" strokeDasharray="3 3" />
      )}
    </svg>
  );
}
