import { Badge, Checkbox, Group, Loader, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../api/cliente";

export interface Geometria {
  origem: number[]; srid: number; feicoes: number; truncado: boolean;
  camadas: { nome: string; feicoes: { id: string; c: number[][][]; s: boolean }[] }[];
}

const PALETA = ["#1c7ed6", "#e8590c", "#2f9e44", "#ae3ec9", "#f08c00", "#0c8599", "#c2255c", "#5c940d", "#6741d9", "#868e96"];
const cor = (nome: string) => PALETA[[...nome].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) % PALETA.length];

export interface Marcador { x: number; y: number; rotulo: string; cor?: string }

/** Planta 2D da topografia (canvas). Coordenadas absolutas = origem + relativas; nada é reprojetado aqui. */
export function Planta({ minaId, altura = 560, aoEscolher, destaque, marcadores, incluirZSuspeito = false }: {
  minaId: string; altura?: number; aoEscolher?: (feicaoId: string, camada: string) => void;
  destaque?: number[][]; marcadores?: Marcador[]; incluirZSuspeito?: boolean;
}) {
  const geo = useQuery({
    queryKey: ["geometria", minaId, incluirZSuspeito],
    queryFn: () => api<Geometria>(`/minas/${minaId}/topografia/geometria?incluir_z_suspeito=${incluirZSuspeito}`),
    staleTime: 60_000,
  });
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<{ id: string; camada: string } | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const vista = useRef({ cx: 0, cy: 0, escala: 1, pronto: false });
  const arrasto = useRef<{ x: number; y: number; moveu: boolean } | null>(null);
  const [, redesenhar] = useState(0);

  const extensao = useMemo(() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of geo.data?.camadas ?? []) for (const f of c.feicoes) for (const p of f.c) for (const v of p) {
      if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0]; if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1];
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }, [geo.data]);

  function enquadrar() {
    const cv = canvas.current;
    if (!cv || !extensao) return;
    const v = vista.current;
    v.cx = (extensao.x0 + extensao.x1) / 2; v.cy = (extensao.y0 + extensao.y1) / 2;
    v.escala = 0.92 * Math.min(cv.clientWidth / Math.max(1, extensao.x1 - extensao.x0), cv.clientHeight / Math.max(1, extensao.y1 - extensao.y0));
    v.pronto = true;
  }

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !geo.data) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
    if (!vista.current.pronto) enquadrar();
    const v = vista.current;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fbfbfa"; ctx.fillRect(0, 0, cv.clientWidth, cv.clientHeight);
    const w2 = cv.clientWidth / 2, h2 = cv.clientHeight / 2;
    const tx = (x: number) => w2 + (x - v.cx) * v.escala, ty = (y: number) => h2 - (y - v.cy) * v.escala;
    ctx.lineWidth = 1;
    for (const c of geo.data.camadas) {
      if (ocultas.has(c.nome)) continue;
      ctx.strokeStyle = cor(c.nome);
      ctx.beginPath();
      for (const f of c.feicoes) for (const p of f.c) {
        if (p.length === 1) { ctx.moveTo(tx(p[0][0]) + 1.5, ty(p[0][1])); ctx.arc(tx(p[0][0]), ty(p[0][1]), 1.5, 0, 7); continue; }
        ctx.moveTo(tx(p[0][0]), ty(p[0][1]));
        for (let i = 1; i < p.length; i++) ctx.lineTo(tx(p[i][0]), ty(p[i][1]));
      }
      ctx.stroke();
    }
    const o = geo.data.origem;
    if (sel) {
      const f = geo.data.camadas.find((c) => c.nome === sel.camada)?.feicoes.find((x) => x.id === sel.id);
      if (f) {
        ctx.strokeStyle = "#e03131"; ctx.lineWidth = 3; ctx.beginPath();
        for (const p of f.c) { ctx.moveTo(tx(p[0][0]), ty(p[0][1])); for (const q of p.slice(1)) ctx.lineTo(tx(q[0]), ty(q[1])); }
        ctx.stroke();
      }
    }
    if (destaque?.length) {
      ctx.strokeStyle = "#f59f00"; ctx.lineWidth = 4; ctx.beginPath();
      destaque.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, tx(p[0] - o[0]), ty(p[1] - o[1])));
      ctx.stroke();
      ctx.fillStyle = "#f59f00"; ctx.font = "bold 12px sans-serif";
      ctx.fillText("início (0 m)", tx(destaque[0][0] - o[0]) + 6, ty(destaque[0][1] - o[1]) - 6);
    }
    for (const m of marcadores ?? []) {
      const x = tx(m.x - o[0]), y = ty(m.y - o[1]);
      ctx.fillStyle = m.cor ?? "#2b8a3e"; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      ctx.font = "11px sans-serif"; ctx.fillText(m.rotulo, x + 6, y + 4);
    }
    // escala gráfica
    const metros = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((m) => m * v.escala > 70) ?? 1000;
    ctx.strokeStyle = "#222"; ctx.fillStyle = "#222"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(16, cv.clientHeight - 16); ctx.lineTo(16 + metros * v.escala, cv.clientHeight - 16); ctx.stroke();
    ctx.font = "11px sans-serif"; ctx.fillText(`${metros} m`, 16, cv.clientHeight - 22);
    ctx.fillText("N ↑", cv.clientWidth - 30, 18);
  });

  function paraMundo(ev: { clientX: number; clientY: number }): [number, number] {
    const cv = canvas.current!, r = cv.getBoundingClientRect(), v = vista.current;
    return [v.cx + (ev.clientX - r.left - cv.clientWidth / 2) / v.escala, v.cy - (ev.clientY - r.top - cv.clientHeight / 2) / v.escala];
  }

  function escolher(ev: React.MouseEvent) {
    if (!geo.data) return;
    const [x, y] = paraMundo(ev), tol = 8 / vista.current.escala;
    let melhor: { id: string; camada: string; d: number } | null = null;
    for (const c of geo.data.camadas) {
      if (ocultas.has(c.nome)) continue;
      for (const f of c.feicoes) for (const p of f.c) for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[Math.min(i + 1, p.length - 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
        const d = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
        if (d < tol && (!melhor || d < melhor.d)) melhor = { id: f.id, camada: c.nome, d };
      }
    }
    setSel(melhor);
    if (melhor) aoEscolher?.(melhor.id, melhor.camada);
  }

  if (geo.isLoading) return <Loader />;
  if (!geo.data?.feicoes) return <Text c="dimmed" size="sm">Nenhuma topografia importada ainda.</Text>;
  const o = geo.data.origem;
  return (
    <Group align="flex-start" wrap="wrap" gap="sm">
      <Paper withBorder style={{ flex: "1 1 420px", minWidth: 0 }}>
        <canvas ref={canvas} data-testid="planta" style={{ width: "100%", height: altura, display: "block", touchAction: "none", cursor: "crosshair" }}
          onWheel={(ev) => {
            const v = vista.current, [x, y] = paraMundo(ev), k = ev.deltaY < 0 ? 1.25 : 0.8;
            v.escala *= k; v.cx = x - (x - v.cx) / k; v.cy = y - (y - v.cy) / k; redesenhar((n) => n + 1);
          }}
          onPointerDown={(ev) => { arrasto.current = { x: ev.clientX, y: ev.clientY, moveu: false }; (ev.target as HTMLElement).setPointerCapture(ev.pointerId); }}
          onPointerMove={(ev) => {
            setCursor(paraMundo(ev));
            const a = arrasto.current;
            if (!a) return;
            const dx = ev.clientX - a.x, dy = ev.clientY - a.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) a.moveu = true;
            if (!a.moveu) return;
            vista.current.cx -= dx / vista.current.escala; vista.current.cy += dy / vista.current.escala;
            a.x = ev.clientX; a.y = ev.clientY; redesenhar((n) => n + 1);
          }}
          onPointerUp={(ev) => { const a = arrasto.current; arrasto.current = null; if (a && !a.moveu) escolher(ev); }}
          onDoubleClick={() => { enquadrar(); redesenhar((n) => n + 1); }}
        />
        <Group justify="space-between" px="xs" py={4}>
          <Text size="xs" c="dimmed">Roda do mouse: zoom · arrastar: mover · duplo clique: ver tudo · clique: selecionar</Text>
          <Text size="xs" ff="monospace">{cursor ? `E ${(o[0] + cursor[0]).toFixed(2)}  N ${(o[1] + cursor[1]).toFixed(2)}  (EPSG:${geo.data.srid})` : ""}</Text>
        </Group>
      </Paper>
      <Stack gap={4} w={230}>
        <Text size="sm" fw={600}>Camadas ({geo.data.feicoes} feições)</Text>
        {geo.data.truncado && <Badge color="orange">Desenho limitado — use filtros</Badge>}
        <ScrollArea h={altura - 40}>
          {geo.data.camadas.map((c) => (
            <Checkbox key={c.nome} size="xs" mb={4} checked={!ocultas.has(c.nome)}
              label={<Text size="xs" span><span style={{ color: cor(c.nome) }}>■</span> {c.nome} ({c.feicoes.length})</Text>}
              onChange={() => setOcultas((s) => { const n = new Set(s); if (n.has(c.nome)) n.delete(c.nome); else n.add(c.nome); return n; })} />
          ))}
        </ScrollArea>
        {sel && <Text size="xs">Selecionada: camada <b>{sel.camada}</b></Text>}
      </Stack>
    </Group>
  );
}
