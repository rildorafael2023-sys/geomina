import { Alert, Button, Checkbox, Group, Loader, Menu, NumberInput, Paper, Popover, ScrollArea, SegmentedControl, Select, Stack, Table, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { corLitologia, m, teor } from "../../componentes/perfil";
import { SeletorElementos, VisorFoto } from "./comuns";
import { CORES_ELEMENTOS, baixarSvg, baixarTexto, consultaPerfil, corMaterial, fmt, marcas, nomeLito, padraoElementos, trechoEm, useSondagem, type FotoP, type PerfilP } from "./tipos";

type Ajuste = { log: boolean; min: number | null; max: number | null };
const LARG_TRACK = 150, CAB = 54;

/** Tracks geoquímicos: um gráfico por elemento contra a profundidade, com litologia e registros (fotos, minério, amostras). */
export function TracksGeoquimicos() {
  const { furos, furo, setFuro, elementos, setElementos } = useSondagem();
  const [regra, setRegra] = useState("limite");
  const [intervalos, setIntervalos] = useState(true);
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [altura, setAltura] = useState(640);
  const [foto, setFoto] = useState<FotoP | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const q = useQuery({ ...consultaPerfil(furo ?? "", regra), enabled: !!furo });
  const p = q.data;
  useEffect(() => {
    if (p && !elementos.some((e) => p.analitos.includes(e)) && p.analitos.length) setElementos(padraoElementos(p.analitos));
  }, [p?.furo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!furos.length) return <Alert color="gray">Nenhum furo neste filtro.</Alert>;
  const els = p ? elementos.filter((e) => p.analitos.includes(e)) : [];
  const aj = (e: string): Ajuste => ajustes[e] ?? { log: false, min: null, max: null };
  const setAj = (e: string, v: Partial<Ajuste>) => setAjustes({ ...ajustes, [e]: { ...aj(e), ...v } });
  const csv = () => p && baixarTexto([["furo", "amostra", "de", "ate", "litologia", ...els.map((e) => `${e} (${p.unidades[e] ?? ""})`)].join(";"),
    ...p.amostras.map((a) => [p.furo.codigo, a.codigo, fmt(a.de, 3), fmt(a.ate, 3), nomeLito(trechoEm(p.intervalos, (a.de + a.ate) / 2)), ...els.map((e) => teor(a.valores[e]?.texto))].join(";"))].join("\n"),
  `tracks_${p.furo.codigo}.csv`);

  return (
    <Group align="flex-start" gap="sm" wrap="nowrap">
      <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
        <Paper withBorder p={6}>
          <Group gap="xs" align="flex-end">
            <Select size="xs" w={170} label="Furo" searchable allowDeselect={false} data={furos.map((f) => ({ value: f.id, label: f.codigo }))} value={furo} onChange={setFuro} />
            <Select size="xs" w={210} label="Abaixo do limite de detecção" allowDeselect={false} value={regra} onChange={(v) => setRegra(v ?? "limite")}
              data={[{ value: "limite", label: "Usar o LD" }, { value: "metade", label: "Usar metade do LD" }, { value: "omitir", label: "Omitir" }]} />
            <Checkbox size="xs" label="Intervalos (De–Até)" checked={intervalos} onChange={(e) => setIntervalos(e.currentTarget.checked)} mb={6} />
            <Select size="xs" w={110} label="Altura" allowDeselect={false} value={String(altura)} onChange={(v) => setAltura(Number(v))} data={["480", "640", "900", "1300", "2000"].map((v) => ({ value: v, label: `${v} px` }))} />
            <Popover width={260} position="bottom-start" shadow="md">
              <Popover.Target><Button size="xs" variant="default">Elementos ({els.length})</Button></Popover.Target>
              <Popover.Dropdown>{p && <SeletorElementos disponiveis={p.analitos} grupos={p.grupos} unidades={p.unidades} valor={els} aoMudar={setElementos} padrao={padraoElementos(p.analitos)} />}</Popover.Dropdown>
            </Popover>
            <Menu withinPortal>
              <Menu.Target><Button size="xs" variant="default">Exportar</Button></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => baixarSvg(svgRef.current, `tracks_${p?.furo.codigo}`, "png")}>Imagem PNG</Menu.Item>
                <Menu.Item onClick={() => baixarSvg(svgRef.current, `tracks_${p?.furo.codigo}`, "svg")}>Desenho SVG</Menu.Item>
                <Menu.Item onClick={csv}>Tabela CSV / Excel</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
          {els.length > 0 && (
            <Group gap="sm" mt={6}>
              {els.map((e, k) => (
                <Group key={e} gap={4} wrap="nowrap">
                  <Text size="xs" fw={700} c={CORES_ELEMENTOS[k % CORES_ELEMENTOS.length]}>{e}</Text>
                  <SegmentedControl size="xs" value={aj(e).log ? "log" : "lin"} onChange={(v) => setAj(e, { log: v === "log" })} data={[{ value: "lin", label: "Linear" }, { value: "log", label: "Log" }]} />
                  <NumberInput size="xs" w={70} placeholder="mín" value={aj(e).min ?? ""} onChange={(v) => setAj(e, { min: typeof v === "number" ? v : null })} hideControls decimalSeparator="," />
                  <NumberInput size="xs" w={70} placeholder="máx" value={aj(e).max ?? ""} onChange={(v) => setAj(e, { max: typeof v === "number" ? v : null })} hideControls decimalSeparator="," />
                </Group>
              ))}
            </Group>
          )}
        </Paper>
        {q.isLoading && <Loader size="sm" />}
        {p && (!p.amostras.length ? <Alert color="gray">Este furo não tem amostras com De–Até.</Alert> : (
          <ScrollArea type="auto" style={{ border: "1px solid #dee2e6", borderRadius: 4 }}>
            <Tracks p={p} els={els} aj={aj} intervalos={intervalos} altura={altura} svgRef={svgRef} aoFoto={setFoto} />
          </ScrollArea>
        ))}
      </Stack>
      {p && <Contexto p={p} />}
      {foto && <VisorFoto foto={foto} aoFechar={() => setFoto(null)} />}
    </Group>
  );
}

function Tracks({ p, els, aj, intervalos, altura, svgRef, aoFoto }: {
  p: PerfilP; els: string[]; aj: (e: string) => Ajuste; intervalos: boolean; altura: number; svgRef: React.Ref<SVGSVGElement>; aoFoto: (f: FotoP) => void;
}) {
  const fim = Math.max(p.furo.profundidade_final, ...p.intervalos.map((i) => i.ate), ...p.amostras.map((a) => a.ate), 1);
  const y = (d: number) => CAB + (d / fim) * altura;
  const X = { prof: 0, lito: 42, reg: 132, el: 232 };
  const W = X.el + els.length * (LARG_TRACK + 10) + 10;
  const pd = marcas(0, fim);
  const minerio = p.intervalos.filter((i) => i.ocorrencias.some((o) => ["esmeralda", "berilo", "molibdenita", "sulfeto"].includes(o)) || i.mineralizacao);
  return (
    <svg ref={svgRef} width={W} height={CAB + altura + 20} fontFamily="Arial, Helvetica, sans-serif" fontSize={10} style={{ background: "#fff", display: "block" }}>
      <text x={4} y={14} fontWeight={700} fontSize={12}>{p.furo.codigo}</text>
      <text x={X.lito + 45} y={CAB - 8} textAnchor="middle" fontWeight={700}>Litologia</text>
      <text x={X.reg + 44} y={CAB - 22} textAnchor="middle" fontWeight={700}>Registros</text>
      {["Fotos", "Minério", "Amostras"].map((r, k) => <text key={r} x={X.reg + 12 + k * 32} y={CAB - 8} textAnchor="middle" fontSize={8} fill="#495057">{r}</text>)}
      {pd.map((d) => (
        <g key={d}>
          <line x1={X.lito} x2={W} y1={y(d)} y2={y(d)} stroke="#f1f3f5" />
          <text x={X.lito - 4} y={y(d) + 3} textAnchor="end" fill="#495057">{m(d)}</text>
        </g>
      ))}
      {p.intervalos.map((i) => (
        <rect key={i.id} x={X.lito} y={y(i.de)} width={86} height={Math.max(0.5, y(i.ate) - y(i.de))} fill={corMaterial(i.material) ?? corLitologia(i.litologia, i.litologia_texto)} stroke="#495057" strokeWidth={0.3}>
          <title>{`${m(i.de)}–${m(i.ate)} m · ${nomeLito(i)}`}</title>
        </rect>
      ))}
      {p.fotos.filter((f) => f.de != null && f.ate != null).map((f) => (
        <rect key={f.id} x={X.reg + 4} y={y(f.de!)} width={16} height={Math.max(2, y(f.ate!) - y(f.de!))} fill="#1c7ed6" opacity={0.8} style={{ cursor: "pointer" }} onClick={() => aoFoto(f)}><title>{f.titulo}</title></rect>
      ))}
      {minerio.map((i) => (
        <rect key={i.id} x={X.reg + 36} y={y(i.de)} width={16} height={Math.max(2, y(i.ate) - y(i.de))} fill={i.ocorrencias.includes("esmeralda") ? "#2b8a3e" : "#e0b400"}>
          <title>{`${m(i.de)}–${m(i.ate)} m · ${i.ocorrencias.join(", ") || i.mineralizacao?.nome}`}</title>
        </rect>
      ))}
      {p.amostras.map((a) => (
        <rect key={a.id} x={X.reg + 68} y={y(a.de)} width={16} height={Math.max(1.5, y(a.ate) - y(a.de))} fill={a.com_resultado ? "#868e96" : "#fab005"}><title>{a.codigo}</title></rect>
      ))}
      {els.map((e, k) => {
        const x0 = X.el + k * (LARG_TRACK + 10), cor = CORES_ELEMENTOS[k % CORES_ELEMENTOS.length], a = aj(e);
        const pts = p.amostras.filter((s) => s.valores[e]?.y != null && (!a.log || s.valores[e].y! > 0)).map((s) => ({ s, v: s.valores[e].y! }));
        const vals = pts.map((x) => x.v);
        const lo = a.min ?? (a.log ? 10 ** Math.floor(Math.log10(Math.min(...vals, 1e9))) : 0);
        const hi = a.max ?? Math.max(...vals, lo + 1e-9) * 1.05;
        const fx = (v: number) => {
          const t = a.log ? (Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo) || 1) : (v - lo) / (hi - lo || 1);
          return x0 + Math.max(0, Math.min(1, t)) * LARG_TRACK;
        };
        const ordem = [...pts].sort((p1, p2) => p1.s.de - p2.s.de);
        const tk = a.log && lo > 0 ? marcas(lo, hi, true).filter((t) => t >= lo && t <= hi) : marcas(lo, hi).filter((t) => t >= lo && t <= hi);
        return (
          <g key={e}>
            <text x={x0 + LARG_TRACK / 2} y={CAB - 30} textAnchor="middle" fontWeight={700} fill={cor}>{e} ({p.unidades[e] ?? ""}){a.log ? " · log" : ""}</text>
            <rect x={x0} y={CAB} width={LARG_TRACK} height={altura} fill="none" stroke="#adb5bd" />
            {tk.slice(0, 6).map((t) => (
              <g key={t}><line x1={fx(t)} x2={fx(t)} y1={CAB} y2={CAB + altura} stroke="#f1f3f5" /><text x={fx(t)} y={CAB - 6} textAnchor="middle" fontSize={8} fill="#868e96">{fmt(t, 3)}</text></g>
            ))}
            <polyline points={ordem.map((x) => `${fx(x.v)},${y((x.s.de + x.s.ate) / 2)}`).join(" ")} fill="none" stroke={cor} strokeWidth={1} opacity={0.6} />
            {ordem.map(({ s, v }) => (
              <g key={s.id}>
                {intervalos && <line x1={fx(v)} x2={fx(v)} y1={y(s.de)} y2={y(s.ate)} stroke={cor} strokeWidth={3} opacity={0.5} />}
                <circle cx={fx(v)} cy={y((s.de + s.ate) / 2)} r={2.6} fill={s.valores[e].situacao === "abaixo_ld" ? "#fff" : cor} stroke={cor}>
                  <title>{`${s.codigo} · ${m(s.de)}–${m(s.ate)} m · ${e} = ${teor(s.valores[e].texto)} ${s.valores[e].unidade}`}</title>
                </circle>
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function Contexto({ p }: { p: PerfilP }) {
  const f = p.furo;
  const comRes = p.amostras.filter((a) => a.com_resultado).length;
  return (
    <Paper withBorder p="xs" w={240} style={{ flexShrink: 0 }}>
      <Text fw={700} mb={4}>{f.codigo}</Text>
      <Table fz="xs" verticalSpacing={2}>
        <Table.Tbody>
          <Table.Tr><Table.Th>Tipo</Table.Th><Table.Td>{f.tipo === "ina" ? "INA (água)" : "Exploratório"}</Table.Td></Table.Tr>
          {f.area && <Table.Tr><Table.Th>Local</Table.Th><Table.Td>{f.area}</Table.Td></Table.Tr>}
          {f.projeto && <Table.Tr><Table.Th>Projeto</Table.Th><Table.Td>{f.projeto}</Table.Td></Table.Tr>}
          <Table.Tr><Table.Th>Boca</Table.Th><Table.Td>{fmt(f.x, 1)} E · {fmt(f.y, 1)} N · {fmt(f.z, 1)} m</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Az / Inc</Table.Th><Table.Td>{f.azimute ?? "—"}° / {f.inclinacao ?? "—"}°</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Profundidade</Table.Th><Table.Td>{m(f.profundidade_final)} m</Table.Td></Table.Tr>
          {f.data_inicio && <Table.Tr><Table.Th>Data</Table.Th><Table.Td>{f.data_inicio}{f.data_fim ? ` a ${f.data_fim}` : ""}</Table.Td></Table.Tr>}
          {f.responsavel && <Table.Tr><Table.Th>Responsável</Table.Th><Table.Td>{f.responsavel}</Table.Td></Table.Tr>}
          <Table.Tr><Table.Th>Trechos</Table.Th><Table.Td>{p.intervalos.length}</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Amostras</Table.Th><Table.Td>{p.amostras.length} ({comRes} com química)</Table.Td></Table.Tr>
          <Table.Tr><Table.Th>Fotos</Table.Th><Table.Td>{p.fotos.length}</Table.Td></Table.Tr>
          {p.rqd && <Table.Tr><Table.Th>RQD médio</Table.Th><Table.Td>{fmt(p.rqd.media, 1)}%</Table.Td></Table.Tr>}
        </Table.Tbody>
      </Table>
      {f.descricao && <Text size="xs" c="dimmed" mt={4}>{f.descricao}</Text>}
      <Stack gap={2} mt="xs">
        <Text size="xs" fw={700}>Registros</Text>
        <Text size="xs"><span style={{ color: "#1c7ed6" }}>■</span> Fotos de testemunho</Text>
        <Text size="xs"><span style={{ color: "#2b8a3e" }}>■</span> Esmeralda · <span style={{ color: "#e0b400" }}>■</span> outro minério</Text>
        <Text size="xs"><span style={{ color: "#868e96" }}>■</span> Amostra com química · <span style={{ color: "#fab005" }}>■</span> sem</Text>
        <Text size="xs">○ ponto vazado = abaixo do limite de detecção</Text>
      </Stack>
    </Paper>
  );
}
