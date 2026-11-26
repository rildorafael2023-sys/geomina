import { Group, Select, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api, type Mina } from "../../api/cliente";
import { classe } from "../../geologia/classes";
import type { Geometria } from "../topografia/Planta";
import type { Track, TrackAnalito } from "./tracks/tipos";
import type { Amostra, ClassesTrack } from "./tracks/TracksGaleria";

/** Planta da galeria: topografia em volta, a galeria como fita colorida pelo teor de cada ponto e a amostra selecionada destacada. */
export function PlantaGaleria({ mina, amostras, tracks, classes, selecionado, aoSelecionar }: {
  mina: Mina; amostras: Amostra[]; tracks: Track[]; classes: Record<string, ClassesTrack>; selecionado: string | null; aoSelecionar: (id: string) => void;
}) {
  const an = tracks.filter((t) => t.tipo === "analito") as TrackAnalito[];
  const [escolha, setEscolha] = useState<string | null>(null);
  const track = an.find((t) => t.id === escolha) ?? an[0];
  const pontos = useMemo(() => {
    const m = new Map<number, Amostra[]>();
    for (const a of amostras) m.set(a.ponto, [...(m.get(a.ponto) ?? []), a]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([p, as]) => {
      const vs = track ? as.map((a) => a.valores[track.analito]?.y).filter((v): v is number => v != null) : [];
      return { ponto: p, x: as[0].x, y: as[0].y, amostras: as, media: vs.length ? vs.reduce((t, v) => t + v, 0) / vs.length : null };
    });
  }, [amostras, track]);
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y), M = 20;
  const cx0 = Math.min(...xs) - M, cx1 = Math.max(...xs) + M, cy0 = Math.min(...ys) - M, cy1 = Math.max(...ys) + M;
  const T = 400, MIN = 160, k = T / Math.max(cx1 - cx0, cy1 - cy0, 30);
  const LW = Math.max(MIN, (cx1 - cx0) * k), LH = Math.max(MIN, (cy1 - cy0) * k);
  const x0 = (cx0 + cx1) / 2 - LW / 2 / k, y0 = (cy0 + cy1) / 2 - LH / 2 / k;
  const topo = useQuery({
    queryKey: ["geometria-caixa", mina.id, [x0, y0, LW, LH].map((v) => v.toFixed(0)).join(",")], enabled: pontos.length > 0,
    queryFn: () => api<Geometria>(`/minas/${mina.id}/topografia/geometria?bbox=${x0},${y0},${x0 + LW / k},${y0 + LH / k}&limite=20000`), staleTime: 60_000,
  });
  if (!pontos.length) return null;
  const px = (x: number) => (x - x0) * k, py = (y: number) => LH - (y - y0) * k;
  const c = track ? classes[track.id] : undefined;
  const corDe = (v: number | null) => (v == null || !c ? null : c.cores[classe(v, c.lim)]);
  const larg = Math.max(6, Math.min(14, 3.5 * k));
  const meio = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const escala = [1, 2, 5, 10, 20, 50, 100, 200].find((m) => m * k > 50) ?? 200;
  const o = topo.data?.origem ?? [0, 0, 0];
  const selP = pontos.find((p) => p.amostras.some((a) => a.id === selecionado));
  return (
    <div>
      <Group justify="space-between" mb={2}>
        <Text size="xs" fw={700} c="dimmed" tt="uppercase">Planta</Text>
        {an.length > 1 && <Select size="xs" w={110} allowDeselect={false} value={track?.id ?? null} onChange={setEscolha} data={an.map((t) => ({ value: t.id, label: t.analito }))} aria-label="Analito da planta" />}
      </Group>
      <svg data-testid="planta-galeria" viewBox={`0 0 ${LW} ${LH}`} style={{ width: "100%", maxHeight: 330, border: "1px solid var(--mantine-color-gray-3)", background: "#fbfbfa", display: "block" }}>
        {topo.data?.camadas.map((cm) => cm.feicoes.map((f) => f.c.map((p, i) => (
          <polyline key={`${f.id}-${i}`} points={p.map((v) => `${px(v[0] + o[0]).toFixed(1)},${py(v[1] + o[1]).toFixed(1)}`).join(" ")} fill="none" stroke="#cfcfcf" strokeWidth={0.8} />
        ))))}
        {pontos.length > 1 && pontos.map((p, i) => {
          const a = i > 0 ? meio(pontos[i - 1], p) : p, b = i < pontos.length - 1 ? meio(p, pontos[i + 1]) : p, cor = corDe(p.media);
          return <polyline key={p.ponto} points={`${px(a.x)},${py(a.y)} ${px(p.x)},${py(p.y)} ${px(b.x)},${py(b.y)}`} fill="none" stroke={cor ?? "#c8c8c8"} strokeWidth={larg} strokeDasharray={cor ? undefined : "3 2"} />;
        })}
        {pontos.map((p) => (
          <g key={`m${p.ponto}`} style={{ cursor: "pointer" }} onClick={() => aoSelecionar(p.amostras[0].id)}>
            <title>{`Ponto ${p.ponto}: ${p.amostras.map((a) => `${a.codigo}${track ? " " + (a.valores[track.analito]?.texto ?? "sem resultado") : ""}`).join(" · ")}`}</title>
            <circle cx={px(p.x)} cy={py(p.y)} r={larg / 2 + 2} fill={corDe(p.media) ?? "#fff"} stroke="#222" strokeWidth={1} />
            <text x={px(p.x) + larg / 2 + 4} y={py(p.y) - larg / 2 - 2} fontSize={11} fontWeight={700} fill="#222" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.ponto}</text>
          </g>
        ))}
        {selP && <circle data-testid="planta-selecionado" cx={px(selP.x)} cy={py(selP.y)} r={larg / 2 + 7} fill="none" stroke="#1971c2" strokeWidth={3} />}
        <text x={px(pontos[0].x) + 8} y={py(pontos[0].y) + 18} fontSize={11} fontWeight={700} fill="#e8590c" stroke="#fff" strokeWidth={3} paintOrder="stroke">INÍCIO</text>
        <line x1={10} y1={LH - 10} x2={10 + escala * k} y2={LH - 10} stroke="#222" strokeWidth={2} />
        <text x={10} y={LH - 15} fontSize={10}>{escala} m</text>
        <text x={LW - 24} y={15} fontSize={11}>N ↑</text>
        {!topo.data?.feicoes && <text x={8} y={15} fontSize={10} fill="#888">sem topografia nesta área</text>}
      </svg>
      {track && <Text size="10px" c="dimmed">Cor do ponto: média do {track.analito} das amostras do ponto (classes do track).</Text>}
    </div>
  );
}
