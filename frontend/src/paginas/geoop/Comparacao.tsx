import { Alert, Badge, Button, Checkbox, CloseButton, Group, Loader, Menu, Paper, ScrollArea, SegmentedControl, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Mina } from "../../api/cliente";
import { FACETAS, parametrosGeo, useGeo, type Faceta, type Pagina } from "./estado";
import { Boxplot, CORES_GRUPO, Dispersao, Histograma, MatrizCorrelacao } from "./graficos/Graficos";

interface GrupoDef { nome: string; filtros: Partial<Record<Faceta, string[]>>; texto: string; data_de: string; data_ate: string; descricao: string }
interface Est { n: number; min?: number; q1?: number; mediana?: number; q3?: number; max?: number; media?: number; desvio?: number | null; cv?: number | null; media_geometrica?: number | null }
interface ResultadoGrupo {
  nome: string; amostras: number; filtros: Record<string, string[]>;
  analitos: Record<string, { unidade: string | null; estatistica: Est; no_limite: number; sem_valor: number; pontos: { chave: string; codigo: string; y: number; texto: string; limite: boolean }[] }>;
  correlacao: Record<string, { n: number; pearson: number | null; spearman: number | null }>;
}
const fmt = (x?: number | null) => (x == null ? "—" : x.toLocaleString("pt-BR", { maximumSignificantDigits: 4 }));
const AGRUPAR: Faceta[] = ["galeria", "furo", "nivel", "trecho", "campanha", "litologia", "alteracao", "mineralizacao", "responsavel", "certificado"];

/** Comparação geoquímica entre grupos de amostras (cada grupo = um conjunto de filtros, sempre identificado). */
export function Comparacao({ mina }: { mina: Mina }) {
  const s = useGeo();
  const [grupos, setGrupos] = useState<GrupoDef[]>([]);
  const [vista, setVista] = useState("estatisticas");
  const [log, setLog] = useState(false);
  const [incluirLimite, setIncluirLimite] = useState(false);
  const [par, setPar] = useState<[string | null, string | null]>([null, null]);
  const p = parametrosGeo(s, { tamanho: "1" });
  const resumo = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`), placeholderData: (a) => a });
  const rotulo = (f: Faceta, v: string) => resumo.data?.opcoes[f]?.find((o) => o.valor === v)?.rotulo ?? v;
  const descrever = (filtros: Partial<Record<Faceta, string[]>>, texto: string, de: string, ate: string) =>
    [...Object.entries(filtros).filter(([, v]) => v && v.length).map(([f, v]) => `${FACETAS.find((x) => x.chave === f)?.rotulo}: ${v!.map((x) => rotulo(f as Faceta, x)).join(", ")}`),
      texto && `texto "${texto}"`, (de || ate) && `coleta ${de || "…"} a ${ate || "…"}`].filter(Boolean).join(" · ") || "todas as amostras";

  const daSelecao = () => {
    const nome = `Grupo ${String.fromCharCode(65 + grupos.length)}`;
    setGrupos([...grupos, { nome, filtros: { ...s.filtros }, texto: s.texto, data_de: s.dataDe, data_ate: s.dataAte, descricao: descrever(s.filtros, s.texto, s.dataDe, s.dataAte) }]);
  };
  const agruparPor = (f: Faceta) => {
    const ops = (resumo.data?.opcoes[f] ?? []).filter((o) => o.valor !== "_nenhum" && o.n > 0).slice(0, 12);
    setGrupos(ops.map((o) => {
      const filtros = { ...s.filtros, [f]: [o.valor] };
      return { nome: o.rotulo, filtros, texto: s.texto, data_de: s.dataDe, data_ate: s.dataAte, descricao: descrever(filtros, s.texto, s.dataDe, s.dataAte) };
    }));
  };

  const corpo = { analitos: s.analitos, regra_ld: s.regraLd, incluir_limite: incluirLimite,
    grupos: grupos.map((g) => ({ nome: g.nome, filtros: g.filtros, texto: g.texto || null, data_de: g.data_de || null, data_ate: g.data_ate || null })) };
  const q = useQuery({ queryKey: ["comparacao", mina.id, JSON.stringify(corpo)], enabled: grupos.length > 0 && s.analitos.length > 0,
    queryFn: () => api<{ grupos: ResultadoGrupo[]; observacao: string }>(`/minas/${mina.id}/geoop/comparacao`, { method: "POST", body: json(corpo) }) });
  const d = q.data;
  const cor = (i: number) => CORES_GRUPO[i % CORES_GRUPO.length];
  const [ax, ay] = [par[0] ?? s.analitos[0] ?? null, par[1] ?? s.analitos[1] ?? s.analitos[0] ?? null];

  return (
    <Stack gap={8}>
      <Group justify="space-between" gap="xs">
        <Text fw={700}>Comparação geoquímica</Text>
        <Group gap={6}>
          <Button size="compact-sm" onClick={daSelecao}>+ Grupo da seleção atual</Button>
          <Menu withinPortal position="bottom-end">
            <Menu.Target><Button size="compact-sm" variant="default">Agrupar por…</Button></Menu.Target>
            <Menu.Dropdown>{AGRUPAR.map((f) => <Menu.Item key={f} onClick={() => agruparPor(f)}>{FACETAS.find((x) => x.chave === f)?.rotulo}</Menu.Item>)}</Menu.Dropdown>
          </Menu>
          {grupos.length > 0 && <Button size="compact-sm" variant="subtle" onClick={() => setGrupos([])}>Limpar grupos</Button>}
        </Group>
      </Group>
      <Text size="xs" c="dimmed">Cada grupo guarda os filtros escolhidos no painel à esquerda no momento em que foi criado ("+ Grupo") — ou um grupo para cada galeria, furo, litologia… ("Agrupar por", respeitando os demais filtros). Grupos diferentes não são tratados como equivalentes no espaço: comparam-se só as distribuições.</Text>
      {!grupos.length ? <Alert color="gray">Monte a seleção no painel e clique em <b>+ Grupo da seleção atual</b>, ou use <b>Agrupar por…</b>.</Alert> : (
        <Stack gap={4} data-testid="grupos">
          {grupos.map((g, i) => (
            <Group key={i} gap={6} wrap="nowrap">
              <span style={{ width: 12, height: 12, background: cor(i), borderRadius: 2, flexShrink: 0 }} />
              <TextInput size="xs" w={170} value={g.nome} onChange={(e) => { const v = e.currentTarget.value; setGrupos(grupos.map((x, k) => (k === i ? { ...x, nome: v } : x))); }} aria-label={`Nome do grupo ${i + 1}`} />
              <Text size="xs" c="dimmed" style={{ flex: 1 }} lineClamp={1}>{g.descricao}</Text>
              {d?.grupos[i] && <Badge size="sm" variant="light" color="gray">{d.grupos[i].amostras} amostras</Badge>}
              <CloseButton size="sm" onClick={() => setGrupos(grupos.filter((_, k) => k !== i))} aria-label={`Remover ${g.nome}`} />
            </Group>
          ))}
        </Stack>
      )}
      {grupos.length > 0 && !s.analitos.length && <Alert color="blue" p="xs">Escolha os analitos no topo.</Alert>}
      {grupos.length > 0 && s.analitos.length > 0 && (
        <>
          <Group gap="sm">
            <SegmentedControl size="xs" value={vista} onChange={setVista} data={[{ value: "estatisticas", label: "Estatísticas" }, { value: "boxplot", label: "Boxplot" }, { value: "histograma", label: "Histograma" }, { value: "dispersao", label: "Dispersão" }, { value: "correlacao", label: "Correlação" }]} />
            <Checkbox size="xs" label="Escala log" checked={log} onChange={(e) => setLog(e.currentTarget.checked)} />
            <Checkbox size="xs" label="Incluir valores no limite (<LD)" checked={incluirLimite} onChange={(e) => setIncluirLimite(e.currentTarget.checked)} />
            {d && <Text size="xs" c="dimmed">{d.observacao}.</Text>}
          </Group>
          {q.isLoading ? <Loader size="sm" /> : q.error ? <Alert color="orange">{q.error instanceof ErroApi ? q.error.message : String(q.error)}</Alert> : d && (
            <Paper withBorder p="sm">
              {vista === "estatisticas" && (
                <ScrollArea type="auto">
                  <Table fz={11} verticalSpacing={2} striped withTableBorder data-testid="tabela-estatisticas">
                    <Table.Thead><Table.Tr><Table.Th>Analito</Table.Th><Table.Th>Grupo</Table.Th>{["n", "mín", "Q1", "mediana", "Q3", "máx", "média", "desvio", "CV %", "média geom.", "no limite", "sem valor"].map((c) => <Table.Th key={c} ta="right">{c}</Table.Th>)}</Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {s.analitos.map((a) => d.grupos.map((g, i) => {
                        const r = g.analitos[a], e = r?.estatistica;
                        return (
                          <Table.Tr key={a + g.nome} data-linha={`${a}|${g.nome}`}>
                            {i === 0 && <Table.Td rowSpan={d.grupos.length} fw={700}>{a} <Text span size="xs" c="dimmed">{r?.unidade}</Text></Table.Td>}
                            <Table.Td><Group gap={4} wrap="nowrap"><span style={{ width: 8, height: 8, background: cor(i) }} />{g.nome}</Group></Table.Td>
                            <Table.Td ta="right">{e?.n ?? 0}</Table.Td>
                            {[e?.min, e?.q1, e?.mediana, e?.q3, e?.max, e?.media, e?.desvio, e?.cv, e?.media_geometrica].map((v, k) => <Table.Td key={k} ta="right">{fmt(v)}</Table.Td>)}
                            <Table.Td ta="right">{r?.no_limite ?? 0}</Table.Td><Table.Td ta="right">{r?.sem_valor ?? 0}</Table.Td>
                          </Table.Tr>
                        );
                      }))}
                    </Table.Tbody>
                  </Table>
                  <Button size="compact-xs" variant="subtle" mt={6} onClick={() => exportarCsv(d.grupos, grupos, s.analitos)}>Exportar estatísticas (CSV)</Button>
                </ScrollArea>
              )}
              {vista === "boxplot" && (
                <Group gap="md" align="flex-start">
                  {s.analitos.map((a) => <Boxplot key={a} titulo={a} unidade={d.grupos.find((g) => g.analitos[a]?.unidade)?.analitos[a].unidade ?? ""} log={log}
                    series={d.grupos.map((g, i) => ({ nome: g.nome, cor: cor(i), est: g.analitos[a].estatistica, valores: g.analitos[a].pontos.map((x) => x.y) }))} />)}
                </Group>
              )}
              {vista === "histograma" && (
                <Group gap="md" align="flex-start">
                  {s.analitos.map((a) => <Histograma key={a} titulo={a} unidade={d.grupos.find((g) => g.analitos[a]?.unidade)?.analitos[a].unidade ?? ""} log={log}
                    series={d.grupos.map((g, i) => ({ nome: g.nome, cor: cor(i), est: g.analitos[a].estatistica, valores: g.analitos[a].pontos.map((x) => x.y) }))} />)}
                </Group>
              )}
              {vista === "dispersao" && ax && ay && (
                <Stack gap={6}>
                  <Group gap="xs">
                    <Select size="xs" w={110} label="Eixo X" allowDeselect={false} data={s.analitos} value={ax} onChange={(v) => setPar([v, ay])} />
                    <Select size="xs" w={110} label="Eixo Y" allowDeselect={false} data={s.analitos} value={ay} onChange={(v) => setPar([ax, v])} />
                  </Group>
                  <Dispersao ax={ax} ay={ay} log={log}
                    ux={d.grupos.find((g) => g.analitos[ax]?.unidade)?.analitos[ax].unidade ?? ""} uy={d.grupos.find((g) => g.analitos[ay]?.unidade)?.analitos[ay].unidade ?? ""}
                    pontos={d.grupos.flatMap((g, i) => {
                      const yv = new Map(g.analitos[ay].pontos.map((x) => [x.chave, x.y]));
                      return g.analitos[ax].pontos.filter((x) => yv.has(x.chave)).map((x) => ({ x: x.y, y: yv.get(x.chave)!, cor: cor(i), grupo: g.nome, codigo: x.codigo }));
                    })}
                    r={d.grupos.map((g, i) => ({ grupo: g.nome, cor: cor(i), ...(ax === ay ? { n: g.analitos[ax].pontos.length, pearson: 1, spearman: 1 } : (g.correlacao[`${ax}|${ay}`] ?? g.correlacao[`${ay}|${ax}`] ?? { n: 0, pearson: null, spearman: null })) }))} />
                </Stack>
              )}
              {vista === "correlacao" && (
                s.analitos.length < 2 ? <Text size="sm" c="dimmed">Escolha pelo menos dois analitos.</Text> :
                  <Group gap="lg" align="flex-start">{d.grupos.map((g) => <MatrizCorrelacao key={g.nome} grupo={g.nome} analitos={s.analitos} corr={g.correlacao} />)}</Group>
              )}
            </Paper>
          )}
        </>
      )}
    </Stack>
  );
}

function exportarCsv(res: ResultadoGrupo[], grupos: GrupoDef[], analitos: string[]) {
  const n = (x?: number | null) => (x == null ? "" : String(x).replace(".", ","));
  const linhas = ["analito;unidade;grupo;filtros;n;min;q1;mediana;q3;max;media;desvio;cv_pct;media_geometrica;no_limite;sem_valor"];
  for (const a of analitos) res.forEach((g, i) => {
    const r = g.analitos[a], e = r.estatistica;
    linhas.push([a, r.unidade ?? "", g.nome, grupos[i]?.descricao ?? "", e.n, n(e.min), n(e.q1), n(e.mediana), n(e.q3), n(e.max), n(e.media), n(e.desvio), n(e.cv), n(e.media_geometrica), r.no_limite, r.sem_valor].join(";"));
  });
  const b = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const u = URL.createObjectURL(b), l = document.createElement("a");
  l.href = u; l.download = "comparacao_estatisticas.csv"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
}
