import { ActionIcon, Alert, Badge, Button, Checkbox, Divider, Drawer, Group, Loader, Menu, MultiSelect, Paper, ScrollArea, SegmentedControl, Select, Slider, Stack, Table, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, json } from "../../api/cliente";
import { corLitologia, imprimirElemento, m, teor } from "../../componentes/perfil";
import { IconeOcorrencia, Miniatura, SeletorElementos, VisorFoto, useUrlFoto } from "./comuns";
import {
  CLASSES_RQD, CORES_ELEMENTOS, CORES_FUROS, OCORRENCIA, baixarSvg, baixarTexto, consultaPerfil, corMaterial, corRqd, estat, fmt, gravarLocal, lerLocal,
  marcas, nomeLito, padraoElementos, trechoEm, useSondagem, type AmostraP, type FotoP, type PerfilP,
} from "./tipos";

type Coluna = "rqd" | "prof" | "cota" | "testemunho" | "ocorrencias" | "fotos" | "litologia" | "amostras";
const COLUNAS: { chave: Coluna; rotulo: string; largura: number }[] = [
  { chave: "rqd", rotulo: "RQD", largura: 30 },
  { chave: "prof", rotulo: "Prof.", largura: 40 },
  { chave: "cota", rotulo: "Cota", largura: 44 },
  { chave: "testemunho", rotulo: "Testemunho", largura: 58 },
  { chave: "ocorrencias", rotulo: "Ocorr.", largura: 38 },
  { chave: "fotos", rotulo: "Fotos", largura: 66 },
  { chave: "litologia", rotulo: "Litologia", largura: 132 },
  { chave: "amostras", rotulo: "Amostras", largura: 84 },
];
const COLS_PADRAO: Coluna[] = ["rqd", "prof", "testemunho", "ocorrencias", "fotos", "litologia", "amostras"];
const CAB = 50;

export type Sel = { de: number; ate: number; intervalo?: string; amostra?: string; furo: string };
type Escalas = Record<string, { min: number; max: number }>;

const passo = (escala: number) => [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200].find((s) => s * escala >= 26) ?? 500;
const corta = (s: string, px: number, fonte = 10) => (s.length * fonte * 0.55 <= px ? s : s.slice(0, Math.max(1, Math.floor(px / (fonte * 0.55)) - 1)) + "…");

export function faixaFuro(p: PerfilP, modo: "amostrado" | "inteiro"): [number, number] {
  const fim = Math.max(p.furo.profundidade_final || 0, ...p.intervalos.map((i) => i.ate), ...p.amostras.map((a) => a.ate), 1);
  if (modo === "amostrado" && p.amostras.length) {
    const de = Math.min(...p.amostras.map((a) => a.de)), ate = Math.max(...p.amostras.map((a) => a.ate));
    const margem = Math.max(1, (ate - de) * 0.08);
    return [Math.max(0, Math.floor(de - margem)), Math.min(fim, Math.ceil(ate + margem))];
  }
  return [0, fim];
}

export function escalasElementos(perfis: PerfilP[], els: string[]): Escalas {
  const r: Escalas = {};
  for (const e of els) {
    const v = perfis.flatMap((p) => p.amostras.map((a) => a.valores[e]?.y)).filter((x): x is number => x != null && x > 0);
    r[e] = { min: v.length ? Math.min(...v) : 0.1, max: v.length ? Math.max(...v) : 1 };
  }
  return r;
}

export function fracao(v: number, s: { min: number; max: number }, log: boolean) {
  if (v <= 0) return 0;
  if (!log) return Math.min(1, v / (s.max || 1));
  const lo = Math.log10(s.min / 2), hi = Math.log10(s.max);
  return hi <= lo ? 1 : Math.max(0, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
}

function FotoSvg({ foto, x, y, w, h, aoAbrir }: { foto: FotoP; x: number; y: number; w: number; h: number; aoAbrir: () => void }) {
  const url = useUrlFoto(foto);
  return (
    <g style={{ cursor: "pointer" }} onClick={aoAbrir}>
      <rect x={x} y={y} width={w} height={h} fill="#343a40" stroke="#fff" strokeWidth={0.5} />
      {url && <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />}
      <title>{`${foto.titulo}${foto.caixa ? ` · caixa ${foto.caixa}` : ""} (clique para abrir)`}</title>
    </g>
  );
}

/** Perfil de um furo em SVG: colunas fixas (RQD, profundidade, testemunho…) e uma barra horizontal por elemento escolhido. */
export function PerfilSvg({ p, els, esc, log, topo, base, escala, cols, sel, aoSelecionar, aoFoto, svgRef, titulo, compacto = false }: {
  p: PerfilP; els: string[]; esc: Escalas; log: boolean; topo: number; base: number; escala: number; cols: Coluna[]; sel: Sel | null;
  aoSelecionar: (s: Sel) => void; aoFoto: (f: FotoP) => void; svgRef?: React.Ref<SVGSVGElement>; titulo?: boolean; compacto?: boolean;
}) {
  const LARG_EL = compacto ? 56 : 92;
  const ativos = COLUNAS.filter((c) => cols.includes(c.chave) && !(compacto && ["fotos", "amostras", "cota"].includes(c.chave)));
  const pos: Partial<Record<Coluna, number>> = {};
  let x = 0;
  for (const c of ativos) { pos[c.chave] = x; x += c.largura; }
  const x0el = x + 4;
  const largura = x0el + els.length * LARG_EL + 6;
  const topoSvg = titulo ? 18 : 0;
  const y = (d: number) => topoSvg + CAB + (Math.min(Math.max(d, topo), base) - topo) * escala;
  const altura = topoSvg + CAB + (base - topo) * escala + 16;
  const vis = <T extends { de: number; ate: number }>(l: T[]) => l.filter((i) => i.ate > topo && i.de < base);
  const ints = vis(p.intervalos), ams = vis(p.amostras);
  const fotos = p.fotos.filter((f) => f.de != null && f.ate != null && f.ate > topo && f.de < base);
  const st = passo(escala);
  const ticks: number[] = [];
  for (let d = Math.ceil(topo / st) * st; d <= base + 1e-9; d += st) ticks.push(Number(d.toFixed(2)));
  const furo = p.furo.id;
  const selec = (i: { id: string; de: number; ate: number }) => aoSelecionar({ de: i.de, ate: i.ate, intervalo: i.id, furo });
  const L = (c: Coluna) => ativos.find((a) => a.chave === c)!.largura;
  const yCab = topoSvg + CAB;
  return (
    <svg ref={svgRef} width={largura} height={altura} fontFamily="Arial, Helvetica, sans-serif" fontSize={10} style={{ background: "#fff", display: "block" }}>
      {titulo && <text x={4} y={13} fontWeight={700} fontSize={12}>{p.furo.codigo} <tspan fontWeight={400} fill="#868e96">{p.furo.area ?? ""}</tspan></text>}
      {/* cabeçalhos */}
      {ativos.map((c) => <text key={c.chave} x={pos[c.chave]! + c.largura / 2} y={yCab - 8} textAnchor="middle" fontWeight={700} fill="#343a40">{c.rotulo}</text>)}
      {els.map((e, k) => {
        const x1 = x0el + k * LARG_EL, cor = CORES_ELEMENTOS[k % CORES_ELEMENTOS.length];
        return (
          <g key={e}>
            <rect x={x1} y={yCab - 40} width={LARG_EL - 6} height={4} fill={cor} />
            <text x={x1} y={yCab - 24} fontWeight={700} fill={cor}>{e} <tspan fontWeight={400} fill="#868e96">{p.unidades[e] ?? ""}</tspan></text>
            <text x={x1} y={yCab - 8} fill="#868e96" fontSize={9}>{log ? "log · " : ""}máx {fmt(esc[e]?.max, 3)}</text>
          </g>
        );
      })}
      <line x1={0} x2={largura} y1={yCab} y2={yCab} stroke="#adb5bd" />
      {/* linhas de profundidade */}
      {ticks.map((d) => <line key={d} x1={pos.prof ?? 0} x2={largura} y1={y(d)} y2={y(d)} stroke="#f1f3f5" />)}
      {/* destaque da seleção */}
      {sel && sel.furo === furo && <rect x={0} y={y(sel.de)} width={largura} height={Math.max(2, y(sel.ate) - y(sel.de))} fill="rgba(28,126,214,.10)" stroke="#1c7ed6" strokeWidth={1} />}
      {pos.rqd != null && ints.map((i) => {
        const h = y(i.ate) - y(i.de);
        return (
          <g key={i.id} style={{ cursor: "pointer" }} onClick={() => selec(i)}>
            <rect x={pos.rqd! + 3} y={y(i.de)} width={L("rqd") - 6} height={h} fill={i.rqd == null ? "#f8f9fa" : corRqd(i.classe_rqd)} stroke="#fff" strokeWidth={0.5} />
            {i.rqd != null && h >= 11 && <text x={pos.rqd! + L("rqd") / 2} y={y(i.de) + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#212529">{Math.round(i.rqd)}</text>}
            <title>{i.rqd == null ? "Sem RQD" : `RQD ${fmt(i.rqd, 1)}% (${CLASSES_RQD.find((c) => c.chave === i.classe_rqd)?.rotulo})`}</title>
          </g>
        );
      })}
      {pos.prof != null && ticks.map((d) => <text key={d} x={pos.prof! + L("prof") - 4} y={y(d) + 3} textAnchor="end" fill="#495057">{m(d)}</text>)}
      {pos.cota != null && ticks.map((d) => {
        const c = p.furo.z + d * Math.sin(((p.furo.inclinacao ?? -90) * Math.PI) / 180);
        return <text key={d} x={pos.cota! + L("cota") - 4} y={y(d) + 3} textAnchor="end" fill="#868e96" fontSize={9}>{m(Math.round(c * 10) / 10)}</text>;
      })}
      {pos.testemunho != null && (
        <g>
          <rect x={pos.testemunho! + 8} y={y(topo)} width={L("testemunho") - 16} height={y(base) - y(topo)} fill="#f8f9fa" stroke="#dee2e6" />
          {ints.map((i) => {
            const cor = corMaterial(i.material) ?? corLitologia(i.litologia, i.litologia_texto), h = y(i.ate) - y(i.de), x1 = pos.testemunho! + 8, w = L("testemunho") - 16;
            return (
              <g key={i.id} style={{ cursor: "pointer" }} onClick={() => selec(i)}>
                <rect x={x1} y={y(i.de)} width={w} height={h} fill={cor} stroke="#495057" strokeWidth={0.4} />
                {i.material === "nao_recuperado" && <path d={`M${x1} ${y(i.de)} L${x1 + w} ${y(i.ate)} M${x1 + w} ${y(i.de)} L${x1} ${y(i.ate)}`} stroke="#868e96" strokeWidth={0.6} />}
                {i.material === "saprolito" && h > 6 && <text x={x1 + w / 2} y={y(i.de) + h / 2 + 3} textAnchor="middle" fontSize={8} fill="#7c6a46">∴ ∴</text>}
                <title>{`${m(i.de)}–${m(i.ate)} m · ${nomeLito(i)}${i.material ? ` · ${i.material === "nao_recuperado" ? "não recuperado" : i.material} (marcado pela descrição)` : ""}${i.descricao ? `\n${i.descricao}` : ""}`}</title>
              </g>
            );
          })}
        </g>
      )}
      {pos.ocorrencias != null && ints.flatMap((i) => i.ocorrencias.map((o, k) => {
        const h = y(i.ate) - y(i.de), r = Math.min(7, Math.max(4, h / 2.4)), cx = pos.ocorrencias! + 10 + (k % 2) * 17;
        const cy = Math.min(y(i.ate) - r, y(i.de) + h / 2 + Math.floor(k / 2) * (2 * r + 2) - (i.ocorrencias.length > 2 ? r : 0));
        return <g key={i.id + o} style={{ cursor: "pointer" }} onClick={() => selec(i)}><IconeOcorrencia tipo={o} x={cx} y={Math.max(cy, y(i.de) + r)} r={r} /></g>;
      }))}
      {pos.fotos != null && fotos.map((f) => {
        const y1 = y(f.de!), h = Math.max(6, y(f.ate!) - y1);
        return <FotoSvg key={f.id} foto={f} x={pos.fotos! + 4} y={y1} w={L("fotos") - 8} h={h} aoAbrir={() => aoFoto(f)} />;
      })}
      {pos.litologia != null && ints.map((i) => {
        const h = y(i.ate) - y(i.de), x1 = pos.litologia!;
        return (
          <g key={i.id} style={{ cursor: "pointer" }} onClick={() => selec(i)}>
            <rect x={x1 + 2} y={y(i.de)} width={L("litologia") - 4} height={h} fill="#fff" fillOpacity={0} stroke="#dee2e6" strokeWidth={0.5} />
            <rect x={x1 + 2} y={y(i.de)} width={3} height={h} fill={corLitologia(i.litologia, i.litologia_texto)} />
            {h >= 10 && <text x={x1 + 8} y={y(i.de) + Math.min(h / 2 + 3, 12)} fill="#212529">{corta(nomeLito(i), L("litologia") - 12)}</text>}
            {h >= 22 && i.caixa && <text x={x1 + 8} y={y(i.de) + 23} fill="#868e96" fontSize={8.5}>cx {i.caixa}</text>}
            <title>{`${m(i.de)}–${m(i.ate)} m · ${nomeLito(i)}${i.descricao ? `\n${i.descricao}` : ""}`}</title>
          </g>
        );
      })}
      {pos.amostras != null && ams.map((a) => {
        const h = Math.max(1.5, y(a.ate) - y(a.de)), x1 = pos.amostras!;
        return (
          <g key={a.id} style={{ cursor: "pointer" }} onClick={() => aoSelecionar({ de: a.de, ate: a.ate, amostra: a.id, furo })}>
            <rect x={x1 + 3} y={y(a.de)} width={L("amostras") - 6} height={h} fill={a.com_resultado ? "#e7f5ff" : "#fff9db"} stroke={a.com_resultado ? "#74c0fc" : "#fcc419"} strokeWidth={0.6} />
            {h >= 9 && <text x={x1 + 6} y={y(a.de) + Math.min(h / 2 + 3, 11)} fontSize={8.5} fill="#1864ab">{corta(a.codigo, L("amostras") - 10, 8.5)}</text>}
            <title>{`${a.codigo} · ${m(a.de)}–${m(a.ate)} m${a.com_resultado ? "" : " · sem resultado"}`}</title>
          </g>
        );
      })}
      {/* barras por elemento */}
      {els.map((e, k) => {
        const x1 = x0el + k * LARG_EL, cor = CORES_ELEMENTOS[k % CORES_ELEMENTOS.length], w = LARG_EL - (compacto ? 8 : 40);
        return (
          <g key={e}>
            <line x1={x1} x2={x1} y1={y(topo)} y2={y(base)} stroke="#ced4da" />
            {ams.map((a) => {
              const v = a.valores[e];
              if (!v || v.y == null) return null;
              const h = Math.max(1.5, y(a.ate) - y(a.de) - 0.6), bw = Math.max(1, fracao(v.y, esc[e], log) * w);
              return (
                <g key={a.id} style={{ cursor: "pointer" }} onClick={() => aoSelecionar({ de: a.de, ate: a.ate, amostra: a.id, furo })}>
                  <rect x={x1} y={y(a.de) + 0.3} width={bw} height={h} fill={cor} fillOpacity={v.situacao === "abaixo_ld" ? 0.35 : 0.85} />
                  {h >= 8 && !compacto && <text x={x1 + bw + 2} y={y(a.de) + Math.min(h / 2 + 3, 10)} fontSize={8} fill="#495057">{teor(v.texto)}</text>}
                  <title>{`${a.codigo} · ${e} = ${teor(v.texto)} ${v.unidade} (${v.certificado})`}</title>
                </g>
              );
            })}
          </g>
        );
      })}
      <line x1={0} x2={largura} y1={y(base)} y2={y(base)} stroke="#adb5bd" />
    </svg>
  );
}

function BarraRqd({ p }: { p: PerfilP }) {
  const r = p.rqd;
  if (!r) return <Text size="xs" c="dimmed">Sem RQD no log deste furo (importe a descrição com a coluna RQD).</Text>;
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="xs" fw={700}>RQD {p.furo.codigo}</Text>
      <div style={{ display: "flex", width: 260, height: 14, borderRadius: 3, overflow: "hidden", border: "1px solid #dee2e6" }}>
        {CLASSES_RQD.map((c) => r.classes[c.chave] > 0 && (
          <Tooltip key={c.chave} label={`${c.rotulo}: ${fmt(r.classes[c.chave], 1)}%`}><div style={{ width: `${r.classes[c.chave]}%`, background: c.cor }} /></Tooltip>
        ))}
      </div>
      {CLASSES_RQD.map((c) => <Text key={c.chave} size="xs"><span style={{ color: c.cor }}>■</span> {c.rotulo} {fmt(r.classes[c.chave], 1)}%</Text>)}
      <Text size="xs" fw={600}>média ponderada {fmt(r.media, 1)}% · {m(r.metros)} m em {r.trechos} trechos</Text>
    </Group>
  );
}

/** Painel lateral do trecho clicado: tudo o que se sabe daquele intervalo. */
function PainelTrecho({ p, sel, pode, aoFoto }: { p: PerfilP; sel: Sel; pode: boolean; aoFoto: (f: FotoP) => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { setFuro } = useSondagem();
  const meio = (sel.de + sel.ate) / 2;
  const i = p.intervalos.find((x) => x.id === sel.intervalo) ?? trechoEm(p.intervalos, meio);
  const de = sel.amostra ? sel.de : i?.de ?? sel.de, ate = sel.amostra ? sel.ate : i?.ate ?? sel.ate;
  const ams = p.amostras.filter((a) => a.ate > de && a.de < ate).sort((a, b) => Number(b.id === sel.amostra) - Number(a.id === sel.amostra));
  const fotos = p.fotos.filter((f) => f.de != null && f.ate != null && f.ate > de && f.de < ate);
  const marca = useMutation({
    mutationFn: (v: boolean | null) => api(`/intervalos-furo/${i!.id}`, { method: "PATCH", body: json({ esmeralda: v, campos: ["esmeralda"] }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["log-furo"] }); notifications.show({ color: "teal", message: "Marca de esmeralda atualizada." }); },
    onError: (e: Error) => notifications.show({ color: "red", message: e.message }),
  });
  const esmeralda = i?.ocorrencias.includes("esmeralda");
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={700} size="lg">{m(de)} – {m(ate)} m</Text>
        <Badge variant="light">{p.furo.codigo}</Badge>
      </Group>
      {i ? (
        <>
          <Group gap={6}>
            <Badge color="gray" variant="outline" leftSection={<span style={{ display: "inline-block", width: 10, height: 10, background: corLitologia(i.litologia, i.litologia_texto), borderRadius: 2 }} />}>{nomeLito(i)}</Badge>
            {esmeralda && <Badge color="green">Esmeralda{i.marca_esmeralda === true ? " (marca à mão)" : ""}</Badge>}
            {i.ocorrencias.filter((o) => o !== "esmeralda").map((o) => <Badge key={o} variant="light" color="gray">{OCORRENCIA[o]?.rotulo ?? o}</Badge>)}
            {i.material && <Badge variant="light" color="yellow">{i.material === "nao_recuperado" ? "Não recuperado" : i.material === "solo" ? "Solo" : "Saprolito"}</Badge>}
          </Group>
          <Table withTableBorder fz="xs" verticalSpacing={3}>
            <Table.Tbody>
              <Table.Tr><Table.Th w={120}>Espessura</Table.Th><Table.Td>{m(i.espessura)} m</Table.Td></Table.Tr>
              <Table.Tr><Table.Th>RQD</Table.Th><Table.Td>{i.rqd == null ? "—" : <><span style={{ color: corRqd(i.classe_rqd) }}>■</span> {fmt(i.rqd, 1)}% · {CLASSES_RQD.find((c) => c.chave === i.classe_rqd)?.rotulo}</>}</Table.Td></Table.Tr>
              {i.recuperacao != null && <Table.Tr><Table.Th>Recuperação</Table.Th><Table.Td>{fmt(i.recuperacao, 1)}%</Table.Td></Table.Tr>}
              <Table.Tr><Table.Th>Caixa</Table.Th><Table.Td>{i.caixa ?? "—"}</Table.Td></Table.Tr>
              <Table.Tr><Table.Th>Cota topo / base</Table.Th><Table.Td>{m(i.cota_topo)} / {m(i.cota_base)} m</Table.Td></Table.Tr>
              {i.alteracao && <Table.Tr><Table.Th>Alteração</Table.Th><Table.Td>{i.alteracao.nome}</Table.Td></Table.Tr>}
              {i.mineralizacao && <Table.Tr><Table.Th>Mineralização</Table.Th><Table.Td>{i.mineralizacao.nome}</Table.Td></Table.Tr>}
              {i.estruturas && <Table.Tr><Table.Th>Estruturas</Table.Th><Table.Td>{i.estruturas}</Table.Td></Table.Tr>}
            </Table.Tbody>
          </Table>
          <div>
            <Text size="xs" fw={700} c="dimmed" tt="uppercase">Descrição</Text>
            <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{i.descricao || "—"}</Text>
            {i.observacoes && <Text size="xs" c="dimmed" mt={4}>{i.observacoes}</Text>}
          </div>
          {pode && (
            <Group gap={6}>
              <Button size="compact-xs" color={esmeralda ? "red" : "green"} variant="light" loading={marca.isPending} onClick={() => marca.mutate(!esmeralda)}>
                {esmeralda ? "Tirar marca de esmeralda" : "Marcar esmeralda"}
              </Button>
              {i.marca_esmeralda != null && <Button size="compact-xs" variant="subtle" onClick={() => marca.mutate(null)}>Voltar a seguir a descrição</Button>}
            </Group>
          )}
        </>
      ) : <Text size="sm" c="dimmed">Trecho sem descrição geológica.</Text>}
      <Divider label={`Fotos do trecho (${fotos.length})`} labelPosition="left" />
      {fotos.length ? (
        <Group gap={6}>{fotos.map((f) => <div key={f.id} style={{ width: 120 }}><Miniatura foto={f} altura={80} aoAbrir={() => aoFoto(f)} /></div>)}</Group>
      ) : <Text size="xs" c="dimmed">Nenhuma foto de testemunho cobre este trecho.</Text>}
      <Divider label={`Amostras (${ams.length})`} labelPosition="left" />
      {ams.map((a) => <TeoresAmostra key={a.id} a={a} p={p} destaque={a.id === sel.amostra} />)}
      {!ams.length && <Text size="xs" c="dimmed">Nenhuma amostra neste trecho.</Text>}
      <Group gap={6}>
        <Button size="compact-xs" variant="default" onClick={() => { setFuro(p.furo.id); navegar("/sondagem/tracks"); }}>Tracks do furo</Button>
        <Button size="compact-xs" variant="default" onClick={() => { setFuro(p.furo.id); navegar("/sondagem/fotos"); }}>Fotos do furo</Button>
        <Button size="compact-xs" variant="default" onClick={() => navegar(`/sondagem/furos/${p.furo.id}`)}>Ficha do furo</Button>
      </Group>
    </Stack>
  );
}

function TeoresAmostra({ a, p, destaque }: { a: AmostraP; p: PerfilP; destaque: boolean }) {
  const chaves = p.analitos.filter((x) => a.valores[x]);
  return (
    <Paper withBorder p={6} style={destaque ? { borderColor: "#1c7ed6" } : undefined}>
      <Group justify="space-between" mb={4}>
        <Text size="sm" fw={700}>{a.codigo}</Text>
        <Text size="xs" c="dimmed">{m(a.de)}–{m(a.ate)} m{chaves[0] ? ` · ${a.valores[chaves[0]].certificado}` : ""}</Text>
      </Group>
      {chaves.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0 10px" }}>
          {chaves.map((x) => (
            <Text key={x} size="xs"><b>{x}</b> {teor(a.valores[x].texto)} <span style={{ color: "#868e96" }}>{a.valores[x].unidade}</span></Text>
          ))}
        </div>
      ) : <Text size="xs" c="dimmed">Sem resultado de laboratório.</Text>}
    </Paper>
  );
}

export function PerfilDoFuro() {
  const { furos, furo, setFuro, elementos, setElementos, pode } = useSondagem();
  const [comparar, setComparar] = useState<string[]>([]);
  const [log, setLog] = useState(false);
  const [modo, setModo] = useState<"amostrado" | "inteiro">(() => lerLocal("geomina.sondagem.modo", "amostrado"));
  const [zoom, setZoom] = useState(100);
  const [cols, setColsE] = useState<Coluna[]>(() => lerLocal("geomina.sondagem.colunas", COLS_PADRAO));
  const [mesma, setMesma] = useState(true);
  const [analise, setAnalise] = useState(false);
  const [sel, setSel] = useState<Sel | null>(null);
  const [foto, setFoto] = useState<FotoP | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const setCols = (c: Coluna[]) => { setColsE(c); gravarLocal("geomina.sondagem.colunas", c); };
  useEffect(() => gravarLocal("geomina.sondagem.modo", modo), [modo]);

  const lista = furo ? [furo, ...comparar.filter((c) => c !== furo)] : [];
  const qs = useQueries({ queries: lista.map((id) => consultaPerfil(id)) });
  const perfis = qs.map((q) => q.data).filter((x): x is PerfilP => !!x);
  const p = qs[0]?.data;

  const disponiveis = useMemo(() => [...new Set(perfis.flatMap((x) => x.analitos))], [perfis.map((x) => x.furo.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const grupos = Object.assign({}, ...perfis.map((x) => x.grupos)) as Record<string, string>;
  const unidades = Object.assign({}, ...perfis.map((x) => x.unidades)) as Record<string, string>;
  const padrao = padraoElementos(disponiveis);
  useEffect(() => {
    if (p && !elementos.some((e) => p.analitos.includes(e)) && p.analitos.length) setElementos(padraoElementos(p.analitos));
  }, [p?.furo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const els = elementos.filter((e) => disponiveis.includes(e));
  const esc = escalasElementos(perfis, els);

  if (!furos.length) return <Alert color="gray">Nenhum furo neste filtro.</Alert>;
  const faixas = perfis.map((x) => faixaFuro(x, modo));
  const comum: [number, number] = faixas.length ? [Math.min(...faixas.map((f) => f[0])), Math.max(...faixas.map((f) => f[1]))] : [0, 1];
  const maiorVao = mesma ? comum[1] - comum[0] : Math.max(1, ...faixas.map((f) => f[1] - f[0]));
  const escala = Math.min(60, Math.max(1.2, 620 / Math.max(1, maiorVao))) * (zoom / 100);
  const mover = (k: number, d: number) => {
    const l = [...lista], j = k + d;
    if (j < 0 || j >= l.length) return;
    [l[k], l[j]] = [l[j], l[k]];
    setFuro(l[0]); setComparar(l.slice(1));
  };
  const opcoes = furos.map((f) => ({ value: f.id, label: `${f.codigo}${f.amostras ? ` · ${f.amostras} am.` : ""}` }));
  const selP = sel ? perfis.find((x) => x.furo.id === sel.furo) : null;

  const exportarCsv = () => {
    const linhas = [["furo", "amostra", "de", "ate", "litologia", ...els.map((e) => `${e} (${unidades[e] ?? ""})`)].join(";")];
    for (const x of perfis) for (const a of x.amostras) {
      linhas.push([x.furo.codigo, a.codigo, fmt(a.de, 3), fmt(a.ate, 3), nomeLito(trechoEm(x.intervalos, (a.de + a.ate) / 2)), ...els.map((e) => teor(a.valores[e]?.texto))].join(";"));
    }
    baixarTexto(linhas.join("\n"), `perfil_${perfis.map((x) => x.furo.codigo).join("_")}.csv`);
  };

  return (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Paper withBorder p={6} className="nao-imprimir">
          <Group gap="xs" wrap="wrap">
            <Select size="xs" w={190} label="Ponto / furo" searchable data={opcoes} value={furo} onChange={(v) => { setFuro(v); setSel(null); }} allowDeselect={false} />
            <MultiSelect size="xs" w={240} label="Comparar com" searchable clearable data={opcoes.filter((o) => o.value !== furo)} value={comparar} onChange={setComparar} placeholder="outros furos" maxValues={5} />
            <SegmentedControl size="xs" mt={18} value={modo} onChange={(v) => setModo(v as typeof modo)} data={[{ value: "amostrado", label: "Amostrado" }, { value: "inteiro", label: "Inteiro" }]} />
            <Checkbox size="xs" mt={18} label="Escala log" checked={log} onChange={(e) => setLog(e.currentTarget.checked)} />
            {lista.length > 1 && <Checkbox size="xs" mt={18} label="Mesma profundidade" checked={mesma} onChange={(e) => setMesma(e.currentTarget.checked)} />}
            <Stack gap={0}>
              <Text size="xs">Zoom {zoom}%</Text>
              <Slider w={110} size="sm" min={25} max={400} step={25} value={zoom} onChange={setZoom} label={null} />
            </Stack>
            <Menu closeOnItemClick={false} withinPortal>
              <Menu.Target><Button size="xs" mt={18} variant="default">Colunas</Button></Menu.Target>
              <Menu.Dropdown>
                {COLUNAS.map((c) => (
                  <Menu.Item key={c.chave} onClick={() => setCols(cols.includes(c.chave) ? cols.filter((x) => x !== c.chave) : COLUNAS.map((k) => k.chave).filter((k) => k === c.chave || cols.includes(k)))}>
                    <Checkbox size="xs" readOnly checked={cols.includes(c.chave)} label={c.rotulo} />
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item onClick={() => setCols(COLS_PADRAO)}>Voltar ao padrão</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button size="xs" mt={18} variant={analise ? "filled" : "light"} color="grape" onClick={() => setAnalise((a) => !a)}>Análise geoquímica deste perfil</Button>
            <Menu withinPortal>
              <Menu.Target><Button size="xs" mt={18} variant="default">Exportar</Button></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item disabled={lista.length > 1} onClick={() => baixarSvg(svgRef.current, `perfil_${p?.furo.codigo}`, "png")}>Imagem PNG</Menu.Item>
                <Menu.Item disabled={lista.length > 1} onClick={() => baixarSvg(svgRef.current, `perfil_${p?.furo.codigo}`, "svg")}>Desenho SVG</Menu.Item>
                <Menu.Item onClick={exportarCsv}>Tabela (Excel/CSV)</Menu.Item>
                <Menu.Item onClick={() => imprimirElemento(caixaRef.current, `Perfil ${perfis.map((x) => x.furo.codigo).join(", ")}`)}>Imprimir / PDF</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Paper>
        {qs.some((q) => q.isLoading) && <Loader size="sm" />}
        {p && (
          <div ref={caixaRef}>
            <Stack gap={4} mb={6}>
              {perfis.map((x) => <BarraRqd key={x.furo.id} p={x} />)}
              <Text size="xs" c="dimmed">
                {p.furo.codigo}{p.furo.area ? ` · ${p.furo.area}` : ""} · {m(p.furo.profundidade_final)} m · {p.furo.tipo === "ina" ? "furo INA (água)" : "exploratório"}
                {p.sem_profundidade.length ? ` · ${p.sem_profundidade.length} amostra(s) sem De–Até` : ""} · clique num trecho para ver tudo daquele intervalo
              </Text>
              <Group gap="sm">
                {Object.entries(OCORRENCIA).map(([k, o]) => (
                  <Group key={k} gap={3}><svg width={14} height={14}><IconeOcorrencia tipo={k} x={7} y={7} r={6} /></svg><Text size="xs">{o.rotulo}</Text></Group>
                ))}
              </Group>
            </Stack>
            <ScrollArea type="auto" style={{ border: "1px solid #dee2e6", borderRadius: 4 }}>
              <Group align="flex-start" gap={14} wrap="nowrap" p={4}>
                {perfis.map((x, k) => {
                  const [t, b] = mesma ? comum : faixas[k];
                  return (
                    <Stack key={x.furo.id} gap={2}>
                      {lista.length > 1 && (
                        <Group gap={2} className="nao-imprimir">
                          <Badge size="sm" color={CORES_FUROS[k % CORES_FUROS.length]}>{x.furo.codigo}</Badge>
                          <ActionIcon size="xs" variant="subtle" disabled={k === 0} onClick={() => mover(k, -1)} aria-label="Mover para a esquerda">◀</ActionIcon>
                          <ActionIcon size="xs" variant="subtle" disabled={k === lista.length - 1} onClick={() => mover(k, 1)} aria-label="Mover para a direita">▶</ActionIcon>
                          {k > 0 && <ActionIcon size="xs" variant="subtle" color="red" onClick={() => setComparar(comparar.filter((c) => c !== x.furo.id))} aria-label="Tirar da comparação">✕</ActionIcon>}
                        </Group>
                      )}
                      <PerfilSvg p={x} els={els} esc={esc} log={log} topo={t} base={b} escala={escala} cols={cols} sel={sel}
                        aoSelecionar={setSel} aoFoto={setFoto} svgRef={k === 0 ? svgRef : undefined} titulo={lista.length > 1} compacto={lista.length > 1} />
                    </Stack>
                  );
                })}
              </Group>
            </ScrollArea>
            {analise && <QuimicaComparada perfis={perfis} els={els} unidades={unidades} />}
          </div>
        )}
      </Stack>
      <Paper withBorder p="xs" w={250} className="nao-imprimir" style={{ flexShrink: 0, position: "sticky", top: 8 }}>
        <ScrollArea.Autosize mah="80vh">
          <SeletorElementos disponiveis={disponiveis} grupos={grupos} unidades={unidades} valor={els} aoMudar={setElementos} padrao={padrao} />
        </ScrollArea.Autosize>
      </Paper>
      <Drawer opened={!!(sel && selP)} onClose={() => setSel(null)} position="right" size={440} withOverlay={false} title={<Text fw={700}>Trecho do furo</Text>} zIndex={300}>
        {sel && selP && <PainelTrecho p={selP} sel={sel} pode={pode} aoFoto={setFoto} />}
      </Drawer>
      {foto && <VisorFoto foto={foto} aoFechar={() => setFoto(null)} />}
    </Group>
  );
}

/* ------------------------------------------------------------------ química comparada */

type Ponto = { furo: string; cor: string; prof: number; lito: string; v: number; codigo: string };

/** Comparação química entre furos: por nível (valor × profundidade) e por litologia (boxplots), com a tabela de medianas. */
export function QuimicaComparada({ perfis, els, unidades }: { perfis: PerfilP[]; els: string[]; unidades: Record<string, string> }) {
  const [el, setEl] = useState<string | null>(els[0] ?? null);
  const [vista, setVista] = useState<"nivel" | "litologia">("nivel");
  const [log, setLog] = useState(false);
  const [desdeTopo, setDesdeTopo] = useState(true);
  const e = el && els.includes(el) ? el : els[0];
  if (!e) return <Alert mt="sm" color="gray">Escolha ao menos um elemento no painel à direita para comparar.</Alert>;
  const pontos: Ponto[] = perfis.flatMap((x, k) => {
    const topo = x.amostras.length ? Math.min(...x.amostras.map((a) => a.de)) : 0;
    return x.amostras.filter((a) => a.valores[e]?.y != null && a.valores[e].y! > 0).map((a) => ({
      furo: x.furo.codigo, cor: CORES_FUROS[k % CORES_FUROS.length], prof: (a.de + a.ate) / 2 - (desdeTopo ? topo : 0),
      lito: nomeLito(trechoEm(x.intervalos, (a.de + a.ate) / 2)), v: a.valores[e].y!, codigo: a.codigo,
    }));
  });
  const litos = [...new Set(pontos.map((p) => p.lito))].sort();
  const nomes = perfis.map((x) => x.furo.codigo);
  const tabela = litos.map((l) => ({ lito: l, por: nomes.map((f) => estat(pontos.filter((p) => p.lito === l && p.furo === f).map((p) => p.v))) }));
  const csv = () => baixarTexto([["litologia", ...nomes.flatMap((f) => [`${f} n`, `${f} mediana`, `${f} mín`, `${f} máx`])].join(";"),
    ...tabela.map((t) => [t.lito, ...t.por.flatMap((s) => (s ? [s.n, fmt(s.mediana, 4), fmt(s.min, 4), fmt(s.max, 4)] : ["", "", "", ""]))].join(";"))].join("\n"),
  `quimica_${e}_${nomes.join("_")}.csv`);
  return (
    <Paper withBorder p="sm" mt="sm">
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text fw={700}>Química comparada</Text>
          <SegmentedControl size="xs" value={vista} onChange={(v) => setVista(v as typeof vista)} data={[{ value: "nivel", label: "Por nível" }, { value: "litologia", label: "Por litologia" }]} />
          <Select size="xs" w={110} data={els} value={e} onChange={setEl} allowDeselect={false} />
          <Checkbox size="xs" label="Log" checked={log} onChange={(x) => setLog(x.currentTarget.checked)} />
          {vista === "nivel" && <Checkbox size="xs" label="m desde o topo amostrado" checked={desdeTopo} onChange={(x) => setDesdeTopo(x.currentTarget.checked)} />}
        </Group>
        <Button size="compact-xs" variant="default" onClick={csv}>Exportar Excel (CSV)</Button>
      </Group>
      {!pontos.length ? <Text size="sm" c="dimmed">Nenhum valor de {e} nesses furos.</Text> : (
        <>
          <Group gap="sm" mb={4}>{perfis.map((x, k) => <Text key={x.furo.id} size="xs"><span style={{ color: CORES_FUROS[k % CORES_FUROS.length] }}>●</span> {x.furo.codigo}</Text>)}</Group>
          {vista === "nivel" ? <Dispersao pontos={pontos} log={log} rotulo={`${e} (${unidades[e] ?? ""})`} desdeTopo={desdeTopo} />
            : <Caixas pontos={pontos} litos={litos} nomes={nomes} log={log} rotulo={`${e} (${unidades[e] ?? ""})`} />}
          <ScrollArea mt="xs">
            <Table withTableBorder withColumnBorders fz="xs" verticalSpacing={2} miw={400}>
              <Table.Thead><Table.Tr><Table.Th>Litologia</Table.Th>{nomes.map((f) => <Table.Th key={f}>{f} · mediana (mín–máx)</Table.Th>)}</Table.Tr></Table.Thead>
              <Table.Tbody>
                {tabela.map((t) => (
                  <Table.Tr key={t.lito}>
                    <Table.Td>{t.lito}</Table.Td>
                    {t.por.map((s, k) => <Table.Td key={k}>{s ? <><b>{fmt(s.mediana, 3)}</b> ({fmt(s.min, 3)}–{fmt(s.max, 3)}) <span style={{ color: "#868e96" }}>n={s.n}</span></> : "—"}</Table.Td>)}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}
    </Paper>
  );
}

function eixoX(min: number, max: number, log: boolean, x0: number, w: number) {
  const lo = log ? Math.log10(min) : Math.min(0, min), hi = log ? Math.log10(max) : max;
  const f = (v: number) => x0 + (((log ? Math.log10(v) : v) - lo) / ((hi - lo) || 1)) * w;
  return { f, ticks: marcas(log ? min : lo, max, log).filter((t) => (log ? t >= 10 ** Math.floor(Math.log10(min)) : true)) };
}

function Dispersao({ pontos, log, rotulo, desdeTopo }: { pontos: Ponto[]; log: boolean; rotulo: string; desdeTopo: boolean }) {
  const W = 680, H = 380, x0 = 60, y0 = 16, w = W - x0 - 16, h = H - y0 - 40;
  const vmin = Math.min(...pontos.map((p) => p.v)), vmax = Math.max(...pontos.map((p) => p.v));
  const pmin = Math.min(0, ...pontos.map((p) => p.prof)), pmax = Math.max(...pontos.map((p) => p.prof), 1);
  const lo = log ? 10 ** Math.floor(Math.log10(vmin)) : 0;
  const ex = eixoX(lo, vmax * 1.05, log, x0, w);
  const fy = (d: number) => y0 + ((d - pmin) / (pmax - pmin || 1)) * h;
  return (
    <svg width={W} height={H} fontFamily="Arial, sans-serif" fontSize={10} style={{ background: "#fff", maxWidth: "100%" }}>
      <rect x={x0} y={y0} width={w} height={h} fill="none" stroke="#adb5bd" />
      {ex.ticks.map((t) => <g key={t}><line x1={ex.f(t)} x2={ex.f(t)} y1={y0} y2={y0 + h} stroke="#f1f3f5" /><text x={ex.f(t)} y={y0 + h + 13} textAnchor="middle">{fmt(t, 3)}</text></g>)}
      {marcas(pmin, pmax).map((t) => <g key={t}><line x1={x0} x2={x0 + w} y1={fy(t)} y2={fy(t)} stroke="#f1f3f5" /><text x={x0 - 4} y={fy(t) + 3} textAnchor="end">{fmt(t, 1)}</text></g>)}
      {pontos.map((p, k) => <circle key={k} cx={ex.f(p.v)} cy={fy(p.prof)} r={3.6} fill={p.cor} fillOpacity={0.8} stroke="#fff" strokeWidth={0.5}><title>{`${p.furo} · ${p.codigo} · ${fmt(p.v, 4)} · ${p.lito}`}</title></circle>)}
      <text x={x0 + w / 2} y={H - 6} textAnchor="middle" fontWeight={700}>{rotulo}</text>
      <text transform={`translate(14 ${y0 + h / 2}) rotate(-90)`} textAnchor="middle" fontWeight={700}>{desdeTopo ? "m desde o topo amostrado" : "profundidade (m)"}</text>
    </svg>
  );
}

function Caixas({ pontos, litos, nomes, log, rotulo }: { pontos: Ponto[]; litos: string[]; nomes: string[]; log: boolean; rotulo: string }) {
  const linhas = litos.flatMap((l) => nomes.map((f) => ({ l, f, s: estat(pontos.filter((p) => p.lito === l && p.furo === f).map((p) => p.v)), cor: pontos.find((p) => p.furo === f)?.cor ?? "#868e96" })).filter((x) => x.s));
  const W = 680, x0 = 170, LH = 16, y0 = 10, w = W - x0 - 16, h = linhas.length * LH + litos.length * 6;
  const vmin = Math.min(...pontos.map((p) => p.v)), vmax = Math.max(...pontos.map((p) => p.v));
  const ex = eixoX(log ? 10 ** Math.floor(Math.log10(vmin)) : 0, vmax * 1.05, log, x0, w);
  let yy = y0, ultimo = "";
  return (
    <svg width={W} height={h + y0 + 36} fontFamily="Arial, sans-serif" fontSize={10} style={{ background: "#fff", maxWidth: "100%" }}>
      {ex.ticks.map((t) => <g key={t}><line x1={ex.f(t)} x2={ex.f(t)} y1={y0} y2={y0 + h} stroke="#f1f3f5" /><text x={ex.f(t)} y={y0 + h + 13} textAnchor="middle">{fmt(t, 3)}</text></g>)}
      {linhas.map((x, k) => {
        if (x.l !== ultimo) { if (ultimo) yy += 6; ultimo = x.l; }
        const cy = yy + LH / 2, s = x.s!;
        const novo = k === 0 || linhas[k - 1].l !== x.l;
        yy += LH;
        return (
          <g key={k}>
            {novo && <text x={x0 - 6} y={cy + 3} textAnchor="end" fontWeight={700}>{corta(x.l, 150)}</text>}
            <line x1={ex.f(s.min)} x2={ex.f(s.max)} y1={cy} y2={cy} stroke={x.cor} />
            <rect x={ex.f(s.q1)} y={cy - 5} width={Math.max(1, ex.f(s.q3) - ex.f(s.q1))} height={10} fill={x.cor} fillOpacity={0.35} stroke={x.cor} />
            <line x1={ex.f(s.mediana)} x2={ex.f(s.mediana)} y1={cy - 6} y2={cy + 6} stroke="#212529" strokeWidth={1.6} />
            <title>{`${x.f} · ${x.l}: mediana ${fmt(s.mediana, 4)} (${fmt(s.min, 4)}–${fmt(s.max, 4)}), n=${s.n}`}</title>
          </g>
        );
      })}
      <text x={x0 + w / 2} y={h + y0 + 30} textAnchor="middle" fontWeight={700}>{rotulo}</text>
    </svg>
  );
}
