import { Accordion, Alert, Badge, Button, Checkbox, Group, Loader, Modal, MultiSelect, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import type { Data, Layout, PlotlyHTMLElement } from "plotly.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { api, baixar, ErroApi, json, type Amostra, type Eu, type Mina } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { ResultadosAmostra } from "../amostras/Amostras";
import { PainelDocumentos } from "../documentos/PainelDocumentos";
import type { Geometria } from "../topografia/Planta";

interface UnidadeLong { id: string; codigo: string; nome: string; tipo: string; ativo: boolean; amostras: number; eixo_versao: number | null; comprimento_eixo: number | null }
interface TermoRef { id: string; nome: string; cor: string | null }
interface Valor { y: number | null; texto: string; situacao: "medido" | "abaixo_ld" | "acima_ld" | "sem_valor" | "omitido"; unidade: string; certificado: string }
interface PontoAmostra {
  id: string; codigo: string; chainage_m: number; afastamento_m: number; ponto: number; x: number; y: number; z: number | null;
  data: string | null; responsavel: string | null; responsavel_id: string | null; litologia: TermoRef | null; alteracao: TermoRef | null;
  mineralizacao: TermoRef | null; campanha: string | null; tipo: string | null; ficha: string | null; local: string | null; unidade: string;
  secao_de_m: number | null; secao_ate_m: number | null; valores: Record<string, Valor>;
}
interface Serie { chave: string; analito: string; unidade: string | null; n: number; pontos: number; min: number | null; max: number | null; abaixo_ld?: number; acima_ld?: number; sem_valor?: number; omitido?: number }
interface Referencia { tipo: "eixo" | "amostras"; eixo_versao: number | null; tem_eixo: boolean; inicio: string; comprimento_m: number; invertido: boolean; percurso: number[][]; pontos: number; saltos: { depois_de: string; trecho_m: number }[]; irregular: { caminho_m: number; entre_pontas_m: number } | null; srid: number }
export interface Longitudinal {
  unidade: { id: string; codigo: string; nome: string }; referencia: Referencia;
  regra_ld: string; regra_ld_descricao: string; series: Serie[]; avisos: string[]; amostras: PontoAmostra[]; sem_posicao: { codigo: string; motivo: string }[];
}
interface Escala { log: boolean; min: string; max: string }
interface Filtros {
  litologias: string[]; alteracoes: string[]; mineralizacoes: string[]; estruturas: string[]; data_de: string; data_ate: string;
  responsaveis: string[]; tipos: string[]; campanhas: string[]; chainage_de: string; chainage_ate: string; teor_analito: string | null; teor_min: string; teor_max: string; incluir_duplicatas: boolean;
}
const FILTROS_VAZIOS: Filtros = { litologias: [], alteracoes: [], mineralizacoes: [], estruturas: [], data_de: "", data_ate: "", responsaveis: [], tipos: [], campanhas: [], chainage_de: "", chainage_ate: "", teor_analito: null, teor_min: "", teor_max: "", incluir_duplicatas: false };
const ESCALA_TEOR: [number, string][] = [[0, "#2c7bb6"], [0.25, "#00a6ca"], [0.5, "#90eb9d"], [0.75, "#f9d057"], [1, "#d7191c"]];

function corTeor(t: number): string {
  const k = Math.max(0, Math.min(1, t));
  for (let i = 1; i < ESCALA_TEOR.length; i++) {
    const [a, ca] = ESCALA_TEOR[i - 1], [b, cb] = ESCALA_TEOR[i];
    if (k <= b) {
      const f = (k - a) / (b - a), h = (c: string, j: number) => parseInt(c.slice(1 + 2 * j, 3 + 2 * j), 16);
      return `rgb(${[0, 1, 2].map((j) => Math.round(h(ca, j) + f * (h(cb, j) - h(ca, j)))).join(",")})`;
    }
  }
  return ESCALA_TEOR[ESCALA_TEOR.length - 1][1];
}

function parametros(analitos: string[], regra: string, f: Filtros, referencia: string, inverter: boolean): URLSearchParams {
  const p = new URLSearchParams({ analitos: analitos.join(","), regra_ld: regra, referencia });
  if (inverter) p.set("inverter", "true");
  for (const k of ["litologias", "alteracoes", "mineralizacoes", "estruturas", "responsaveis", "tipos", "campanhas"] as const) if (f[k].length) p.set(k, f[k].join(","));
  for (const k of ["data_de", "data_ate", "chainage_de", "chainage_ate", "teor_min", "teor_max"] as const) if (f[k] !== "") p.set(k, String(f[k]).replace(",", "."));
  if (f.teor_analito) p.set("teor_analito", f.teor_analito);
  if (f.incluir_duplicatas) p.set("incluir_duplicatas", "true");
  return p;
}

export function AnaliseLongitudinal({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  const mina = minas.data?.[0];
  if (minas.isLoading) return <Loader />;
  if (!mina) return <Alert color="yellow">Cadastre a mina primeiro.</Alert>;
  return <Tela mina={mina} eu={eu} />;
}

function Tela({ mina, eu }: { mina: Mina; eu: Eu }) {
  const unidades = useQuery({ queryKey: ["longitudinal-unidades", mina.id], queryFn: () => api<UnidadeLong[]>(`/minas/${mina.id}/longitudinal/unidades`) });
  const analitosQ = useQuery({ queryKey: ["analitos"], queryFn: () => api<{ codigo: string; tipo: string }[]>("/analitos") });
  const tipos = useQuery({ queryKey: ["tipos-amostra"], queryFn: () => api<{ id: string; nome: string }[]>("/tipos-amostra") });
  const campanhas = useQuery({ queryKey: ["campanhas", mina.id], queryFn: () => api<{ id: string; codigo: string; nome: string }[]>(`/minas/${mina.id}/campanhas`) });
  const dic = useDicionarios();
  const [principal, setPrincipal] = useState<string | null>(null);
  const [comparar, setComparar] = useState<string[]>([]);
  const [analitos, setAnalitos] = useState<string[]>([]);
  const [regra, setRegra] = useState("limite");
  const [referencia, setReferencia] = useState("amostras");
  const [inverter, setInverter] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [escalas, setEscalas] = useState<Record<string, Escala>>({});
  const [corPor, setCorPor] = useState<"litologia" | "unica">("litologia");
  const [ligar, setLigar] = useState(true);
  const [aberta, setAberta] = useState<string | null>(null);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }));

  const base = useQuery({
    queryKey: ["longitudinal-base", principal, analitos[0]], enabled: !!principal && analitos.length > 0,
    queryFn: () => api<Longitudinal>(`/unidades/${principal}/longitudinal?analitos=${analitos[0]}`),
  });
  const responsaveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of base.data?.amostras ?? []) if (a.responsavel_id && a.responsavel) m.set(a.responsavel_id, a.responsavel);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [base.data]);

  const lista = unidades.data ?? [];
  const sel = lista.find((u) => u.id === principal);
  const opUnidades = lista.map((u) => ({ value: u.id, label: `${u.codigo} — ${u.nome} (${u.tipo} · ${u.amostras} amostra${u.amostras === 1 ? "" : "s"} com coordenadas)` }));
  const params = parametros(analitos, regra, filtros, sel?.eixo_versao ? referencia : "amostras", inverter);
  const ids = principal ? [principal, ...comparar.filter((c) => c !== principal)] : [];
  const nFiltros = Object.entries(filtros).filter(([k, v]) => k !== "incluir_duplicatas" && (Array.isArray(v) ? v.length : v !== "" && v !== null)).length;

  return (
    <Stack>
      <Title order={3}>Teores ao longo da galeria</Title>
      <Text size="sm" c="dimmed">Escolha a galeria, travessa ou rampa e os analitos: as amostras aparecem do início ao fim da galeria, com a distância percorrida entre elas, para comparar os teores do começo, do meio e do fim.</Text>
      <Paper withBorder p="sm">
        <Stack gap="xs">
          <Group align="flex-end" wrap="wrap">
            <Select label="Galeria, travessa ou rampa" searchable w={420} data={opUnidades} value={principal} onChange={(v) => { setPrincipal(v); setInverter(false); }} nothingFoundMessage="Nenhuma" />
            <MultiSelect label="Analitos" searchable w={360} value={analitos} onChange={setAnalitos}
              data={(analitosQ.data ?? []).map((a) => ({ value: a.codigo, label: `${a.codigo} (${a.tipo})` }))} />
            <Select label="Abaixo/acima do limite de detecção" w={250} allowDeselect={false} value={regra} onChange={(v) => setRegra(v ?? "limite")}
              data={[{ value: "limite", label: "Mostrar no limite (vazado)" }, { value: "metade", label: "Mostrar na metade do limite" }, { value: "omitir", label: "Não mostrar (contar)" }]} />
          </Group>
          {sel && (
            <Group gap="sm">
              {sel.eixo_versao ? (
                <SegmentedControl size="xs" value={referencia} onChange={setReferencia}
                  data={[{ value: "amostras", label: "Distância pelas amostras" }, { value: "eixo", label: `Pelo eixo desenhado (v${sel.eixo_versao})` }]} />
              ) : <Text size="xs" c="dimmed">Distância medida pelo caminho entre as amostras (a galeria não tem eixo desenhado — não é necessário).</Text>}
              <Button size="compact-sm" variant="light" onClick={() => setInverter((x) => !x)}>Inverter início ⇄ fim</Button>
            </Group>
          )}
          <Accordion variant="contained">
            <Accordion.Item value="f">
              <Accordion.Control>Filtros {nFiltros > 0 && <Badge ml="xs">{nFiltros}</Badge>}</Accordion.Control>
              <Accordion.Panel>
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                  <MultiSelect label="Litologia" searchable data={dic.opcoes("LITOLOGIA")} value={filtros.litologias} onChange={(v) => set("litologias", v)} />
                  <MultiSelect label="Alteração" searchable data={dic.opcoes("ALTERACAO")} value={filtros.alteracoes} onChange={(v) => set("alteracoes", v)} />
                  <MultiSelect label="Mineralização" searchable data={dic.opcoes("MINERALIZACAO")} value={filtros.mineralizacoes} onChange={(v) => set("mineralizacoes", v)} />
                  <MultiSelect label="Estrutura medida na ficha" searchable data={dic.opcoes("TIPO_ESTRUTURA")} value={filtros.estruturas} onChange={(v) => set("estruturas", v)} />
                  <TextInput label="Coleta de" type="date" value={filtros.data_de} onChange={(e) => set("data_de", e.currentTarget.value)} />
                  <TextInput label="Coleta até" type="date" value={filtros.data_ate} onChange={(e) => set("data_ate", e.currentTarget.value)} />
                  <MultiSelect label="Responsável" data={responsaveis} value={filtros.responsaveis} onChange={(v) => set("responsaveis", v)} />
                  <MultiSelect label="Tipo de amostragem" data={(tipos.data ?? []).map((t) => ({ value: t.id, label: t.nome }))} value={filtros.tipos} onChange={(v) => set("tipos", v)} />
                  <MultiSelect label="Campanha" data={(campanhas.data ?? []).map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))} value={filtros.campanhas} onChange={(v) => set("campanhas", v)} />
                  <TextInput label="Trecho de (m)" value={filtros.chainage_de} onChange={(e) => set("chainage_de", e.currentTarget.value)} />
                  <TextInput label="Trecho até (m)" value={filtros.chainage_ate} onChange={(e) => set("chainage_ate", e.currentTarget.value)} />
                  <Checkbox mt="lg" label="Incluir duplicatas de campo" checked={filtros.incluir_duplicatas} onChange={(e) => set("incluir_duplicatas", e.currentTarget.checked)} />
                  <Select label="Faixa de teor: analito" clearable data={(analitosQ.data ?? []).map((a) => a.codigo)} value={filtros.teor_analito} onChange={(v) => set("teor_analito", v)} />
                  <TextInput label="Teor mínimo" value={filtros.teor_min} onChange={(e) => set("teor_min", e.currentTarget.value)} />
                  <TextInput label="Teor máximo" value={filtros.teor_max} onChange={(e) => set("teor_max", e.currentTarget.value)} />
                  <Button mt="lg" variant="subtle" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button>
                </SimpleGrid>
                <Text size="xs" c="dimmed" mt="xs">Os filtros só escondem amostras: a distância de cada uma continua sendo a da galeria inteira.</Text>
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="e">
              <Accordion.Control>Escalas e aparência</Accordion.Control>
              <Accordion.Panel>
                <Group mb="xs">
                  <SegmentedControl value={corPor} onChange={(v) => setCorPor(v as "litologia" | "unica")} data={[{ value: "litologia", label: "Pontos do gráfico pela litologia" }, { value: "unica", label: "Cor única" }]} />
                  <Checkbox label="Ligar os pontos" checked={ligar} onChange={(e) => setLigar(e.currentTarget.checked)} />
                </Group>
                {analitos.map((a) => {
                  const e = escalas[a] ?? { log: false, min: "", max: "" };
                  const mudar = (n: Partial<Escala>) => setEscalas((s) => ({ ...s, [a]: { ...e, ...n } }));
                  return (
                    <Group key={a} gap="xs" mb={4}>
                      <Text w={70} fw={600} size="sm">{a}</Text>
                      <Checkbox label="log" checked={e.log} onChange={(ev) => mudar({ log: ev.currentTarget.checked })} />
                      <TextInput size="xs" w={100} placeholder="mín (auto)" value={e.min} onChange={(ev) => mudar({ min: ev.currentTarget.value })} />
                      <TextInput size="xs" w={100} placeholder="máx (auto)" value={e.max} onChange={(ev) => mudar({ max: ev.currentTarget.value })} />
                    </Group>
                  );
                })}
                {!analitos.length && <Text size="sm" c="dimmed">Escolha os analitos primeiro.</Text>}
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="c">
              <Accordion.Control>Comparar com outras galerias {comparar.length > 0 && <Badge ml="xs">{comparar.length}</Badge>}</Accordion.Control>
              <Accordion.Panel>
                <MultiSelect label="Outras galerias (cada uma no seu painel, com o seu próprio início)" searchable value={comparar} onChange={setComparar} data={opUnidades.filter((o) => o.value !== principal)} />
                <Text size="xs" c="dimmed" mt={4}>As distâncias de galerias diferentes não correspondem ao mesmo lugar: por isso cada galeria fica em painel separado.</Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </Paper>
      <SemLocal mina={mina} pode={eu.permissoes.includes("amostra:editar")} />
      {!principal || !analitos.length ? <Text c="dimmed">Escolha a galeria e pelo menos um analito.</Text> : (
        <Stack>
          {ids.map((id) => (
            <Painel key={id} unidadeId={id} mina={mina} params={id === principal ? params : parametros(analitos, regra, filtros, "auto", false)} escalas={escalas} corPor={corPor} ligar={ligar}
              aoAbrir={setAberta} aoTrecho={(de, ate) => setFiltros((f) => ({ ...f, chainage_de: de.toFixed(1), chainage_ate: ate.toFixed(1) }))} />
          ))}
        </Stack>
      )}
      {aberta && <ConsultaAmostra id={aberta} mina={mina} eu={eu} fechar={() => setAberta(null)} />}
    </Stack>
  );
}

/** Amostras que vieram só com o texto do local (planilha de campo): ligar em lote à galeria certa. */
function SemLocal({ mina, pode }: { mina: Mina; pode: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sem-local", mina.id], queryFn: () => api<{ local: string | null; amostras: number; com_coordenadas: number; exemplo: string }[]>(`/minas/${mina.id}/amostras/sem-local`) });
  const unidades = useQuery({ queryKey: ["unidades", mina.id], queryFn: () => api<{ id: string; codigo: string; nome: string; tipo_nome?: string }[]>(`/minas/${mina.id}/unidades`), enabled: pode });
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [unidade, setUnidade] = useState<string | null>(null);
  const ligar = useMutation({
    mutationFn: () => api<{ ligadas: number; unidade: string }>(`/minas/${mina.id}/amostras/ligar-unidade`, { method: "POST", body: json({ unidade_id: unidade, locais: [...marcados].map((k) => k || null) }) }),
    onSuccess: (r) => { qc.invalidateQueries(); setMarcados(new Set()); notifications.show({ color: "teal", message: `${r.ligadas} amostra(s) ligadas a ${r.unidade}.` }); },
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  const total = (q.data ?? []).reduce((t, x) => t + x.amostras, 0);
  if (!total) return null;
  const sem = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s-]+/g, " ");
  const visiveis = (q.data ?? []).filter((x) => !busca || sem(x.local ?? "").includes(sem(busca))).sort((a, b) => (a.local ?? "").localeCompare(b.local ?? "", "pt-BR"));
  const nMarcadas = (q.data ?? []).filter((x) => marcados.has(x.local ?? "")).reduce((t, x) => t + x.amostras, 0);
  const alternar = (k: string) => setMarcados((m) => { const n = new Set(m); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <>
      <Alert color="yellow" p="xs">
        <Group justify="space-between" wrap="wrap">
          <Text size="sm">{total} amostra(s) ainda não estão ligadas a uma galeria (vieram só com o texto do local) e por isso não aparecem aqui.</Text>
          {pode && <Button size="compact-sm" variant="light" onClick={() => setAberto(true)}>Ligar às galerias…</Button>}
        </Group>
      </Alert>
      {aberto && (
        <Modal opened onClose={() => setAberto(false)} size="xl" title="Ligar amostras às galerias">
          <Stack gap="xs">
            <Text size="sm">O mesmo lugar costuma estar escrito de jeitos diferentes ("Travessa 1F5 - A - Reta", "Travessa 1F5 - A - RETA"…). Busque (ex.: <b>1F5</b>), marque as variações do <b>mesmo lugar</b>, escolha a unidade da mina e ligue todas de uma vez. Atenção: "Direita", "Esquerda", "Subindo", "Câmara" costumam ser <b>ramos diferentes</b> — ligue cada ramo a uma unidade própria, senão a distância ao longo da galeria perde o sentido. Fica no histórico de alterações.</Text>
            <Group align="flex-end">
              <TextInput label="Buscar local" placeholder="ex.: 1F5" w={220} value={busca} onChange={(e) => setBusca(e.currentTarget.value)} />
              <Button size="xs" variant="subtle" onClick={() => setMarcados((m) => new Set([...m, ...visiveis.map((x) => x.local ?? "")]))}>Marcar os {visiveis.length} visíveis</Button>
              <Button size="xs" variant="subtle" onClick={() => setMarcados(new Set())}>Desmarcar</Button>
            </Group>
            <ScrollArea h={320}>
              <Table fz="sm" striped>
                <Table.Thead><Table.Tr><Table.Th /><Table.Th>Local escrito nas amostras</Table.Th><Table.Th>Amostras</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {visiveis.map((x) => {
                    const k = x.local ?? "";
                    return (
                      <Table.Tr key={k} style={{ cursor: "pointer" }} onClick={() => alternar(k)}>
                        <Table.Td><Checkbox checked={marcados.has(k)} onChange={() => alternar(k)} aria-label={`Marcar ${x.local ?? "sem local"}`} /></Table.Td>
                        <Table.Td>{x.local ?? <Text span c="dimmed" size="sm">(sem local)</Text>}<Text size="xs" c="dimmed">{x.exemplo}</Text></Table.Td>
                        <Table.Td>{x.amostras}{x.com_coordenadas < x.amostras && <Text size="xs" c="dimmed">{x.com_coordenadas} com XYZ</Text>}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Group align="flex-end">
              <Select label="Unidade da mina" searchable w={320} value={unidade} onChange={setUnidade} data={(unidades.data ?? []).map((u) => ({ value: u.id, label: `${u.codigo} — ${u.nome}` }))} />
              <Button disabled={!unidade || !marcados.size} loading={ligar.isPending} onClick={() => ligar.mutate()}>Ligar {nMarcadas} amostra(s)</Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </>
  );
}

function usePlotly(div: React.RefObject<HTMLDivElement | null>, desenhar: (P: typeof import("plotly.js")) => [Data[], Partial<Layout>] | null, eventos?: (el: PlotlyHTMLElement) => void) {
  useEffect(() => {
    let vivo = true;
    import("plotly.js-dist-min").then(({ default: Plotly }) => {
      if (!vivo || !div.current) return;
      const r = desenhar(Plotly);
      if (!r) return;
      Plotly.react(div.current, r[0], r[1], { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["select2d", "lasso2d"] });
      const el = div.current as unknown as PlotlyHTMLElement;
      el.removeAllListeners?.("plotly_click");
      el.removeAllListeners?.("plotly_relayout");
      eventos?.(el);
    });
    return () => { vivo = false; };
  });
}

function Painel({ unidadeId, mina, params, escalas, corPor, ligar, aoAbrir, aoTrecho }: {
  unidadeId: string; mina: Mina; params: URLSearchParams; escalas: Record<string, Escala>; corPor: "litologia" | "unica"; ligar: boolean;
  aoAbrir: (id: string) => void; aoTrecho: (de: number, ate: number) => void;
}) {
  const q = useQuery({ queryKey: ["longitudinal", unidadeId, params.toString()], queryFn: () => api<Longitudinal>(`/unidades/${unidadeId}/longitudinal?${params}`) });
  const d = q.data;
  const series = (d?.series ?? []).filter((s) => s.unidade);
  const [corDe, setCorDe] = useState<string | null>(null);
  const serieCor = series.find((s) => s.chave === corDe) ?? series[0];
  const [trecho, setTrecho] = useState<[number, number] | null>(null);
  const divPlanta = useRef<HTMLDivElement>(null);
  const divGraf = useRef<HTMLDivElement>(null);
  const altura = Math.max(240, 70 + series.length * 190);

  // topografia em volta das amostras (paredes da galeria), se houver
  const caixa = useMemo(() => {
    const p = d?.referencia.percurso ?? [];
    if (!p.length) return null;
    const xs = p.map((v) => v[0]), ys = p.map((v) => v[1]), m = 25;
    return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  }, [d]);
  const topo = useQuery({
    queryKey: ["geometria-caixa", mina.id, caixa?.map((v) => v.toFixed(0)).join(",")], enabled: !!caixa,
    queryFn: () => api<Geometria>(`/minas/${mina.id}/topografia/geometria?bbox=${caixa!.join(",")}&limite=20000`),
    staleTime: 60_000,
  });

  const valoresCor = d && serieCor ? d.amostras.map((a) => a.valores[serieCor.chave]?.y).filter((y): y is number => y != null) : [];
  const vmin = valoresCor.length ? Math.min(...valoresCor) : 0, vmax = valoresCor.length ? Math.max(...valoresCor) : 1;
  const escalaCor = (y: number) => corTeor(vmax > vmin ? (y - vmin) / (vmax - vmin) : 0.5);

  usePlotly(divPlanta, () => {
    if (!d || !d.referencia.percurso.length) return null;
    const traces: Data[] = [];
    const o = topo.data?.origem ?? [0, 0, 0];
    if (topo.data?.feicoes) {
      const xs: (number | null)[] = [], ys: (number | null)[] = [];
      for (const c of topo.data.camadas) for (const f of c.feicoes) for (const p of f.c) { for (const v of p) { xs.push(v[0] + o[0]); ys.push(v[1] + o[1]); } xs.push(null); ys.push(null); }
      traces.push({ type: "scattergl", mode: "lines", x: xs, y: ys, line: { color: "#ced4da", width: 1 }, hoverinfo: "skip", name: "topografia" });
    }
    const p = d.referencia.percurso;
    traces.push({ type: "scatter", mode: "lines", x: p.map((v) => v[0]), y: p.map((v) => v[1]), line: { color: "#495057", width: 2, dash: d.referencia.tipo === "eixo" ? "solid" : "dot" }, hoverinfo: "skip", name: "percurso" });
    const porPonto = new Map<number, PontoAmostra[]>();
    for (const a of d.amostras) porPonto.set(a.ponto, [...(porPonto.get(a.ponto) ?? []), a]);
    const pts = [...porPonto.values()];
    const valorPonto = (g: PontoAmostra[]) => { const ys = g.map((a) => (serieCor ? a.valores[serieCor.chave]?.y : null)).filter((y): y is number => y != null); return ys.length ? Math.max(...ys) : null; };
    traces.push({
      type: "scatter", mode: "text+markers", x: pts.map((g) => g[0].x), y: pts.map((g) => g[0].y), text: pts.map((g) => String(g[0].ponto)), textposition: "top center",
      customdata: pts.map((g) => g[0].id),
      hovertext: pts.map((g) => `<b>Ponto ${g[0].ponto}</b> · ${g[0].chainage_m.toFixed(1)} m<br>` + g.map((a) => `${a.codigo}${a.secao_de_m != null ? ` (${a.secao_de_m}–${a.secao_ate_m} m)` : ""}: ${serieCor ? a.valores[serieCor.chave]?.texto ?? "—" : ""}`).join("<br>")),
      hovertemplate: "%{hovertext}<extra></extra>",
      marker: { size: 14, line: { width: 1, color: "#212529" }, color: pts.map((g) => { const v = valorPonto(g); return v == null ? "#ffffff" : escalaCor(v); }) },
    } as Data);
    const ini = p[0];
    traces.push({ type: "scatter", mode: "text", x: [ini[0]], y: [ini[1]], text: ["  INÍCIO"], textposition: "bottom right", textfont: { color: "#e8590c", size: 12 }, hoverinfo: "skip" });
    return [traces, {
      height: 380, margin: { l: 10, r: 10, t: 10, b: 10 }, showlegend: false, hovermode: "closest", dragmode: "pan",
      xaxis: { visible: false, scaleanchor: "y", range: caixa ? [caixa[0], caixa[2]] : undefined }, yaxis: { visible: false, range: caixa ? [caixa[1], caixa[3]] : undefined },
      plot_bgcolor: "#fbfbfa",
    }];
  }, (el) => el.on("plotly_click", (ev) => { const id = ev.points[0]?.customdata as unknown as string | undefined; if (id) aoAbrir(id); }));

  usePlotly(divGraf, () => {
    if (!d || !series.length) return null;
    const n = series.length, gap = 0.05, h = (1 - gap * (n - 1)) / n;
    const traces: Data[] = [];
    const layout: Partial<Layout> = {
      height: altura, separators: ",.", margin: { l: 70, r: 20, t: 10, b: 50 }, showlegend: false, hovermode: "closest", dragmode: "zoom",
      xaxis: { title: { text: "Distância desde o início da galeria (m)" }, range: [-d.referencia.comprimento_m * 0.03, d.referencia.comprimento_m * 1.03], zeroline: false, anchor: `y${n > 1 ? n : ""}` as Layout["xaxis"]["anchor"] },
    };
    series.forEach((s, i) => {
      const eixoY = i === 0 ? "y" : `y${i + 1}`;
      const chave = (i === 0 ? "yaxis" : `yaxis${i + 1}`) as "yaxis";
      const e = escalas[s.analito] ?? { log: false, min: "", max: "" };
      const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
      const mn = num(e.min), mx = num(e.max);
      const pts = d.amostras.filter((a) => a.valores[s.chave]?.y != null);
      const cor = (a: PontoAmostra) => (corPor === "litologia" ? a.litologia?.cor ?? "#868e96" : "#1c7ed6");
      if (ligar && pts.length > 1) {
        // uma linha pela média de cada ponto (sub-pontos da parede ficam empilhados no mesmo lugar)
        const porPonto = new Map<number, number[]>();
        for (const a of pts) if (a.valores[s.chave].situacao === "medido") porPonto.set(a.chainage_m, [...(porPonto.get(a.chainage_m) ?? []), a.valores[s.chave].y as number]);
        const xs = [...new Set(pts.map((a) => a.chainage_m))].sort((a, b) => a - b);
        traces.push({ type: "scatter", mode: "lines", x: xs, y: xs.map((x) => { const v = porPonto.get(x); return v ? v.reduce((t, k) => t + k, 0) / v.length : null; }), yaxis: eixoY, xaxis: "x", line: { color: "#adb5bd", width: 1 }, connectgaps: false, hoverinfo: "skip" });
      }
      for (const sit of ["medido", "abaixo_ld", "acima_ld"] as const) {
        const p = pts.filter((a) => a.valores[s.chave].situacao === sit);
        if (!p.length) continue;
        traces.push({
          type: "scatter", mode: "markers", x: p.map((a) => a.chainage_m), y: p.map((a) => a.valores[s.chave].y), yaxis: eixoY, xaxis: "x",
          customdata: p.map((a) => a.id),
          text: p.map((a) => `<b>${a.codigo}</b> (ponto ${a.ponto})<br>${s.analito}: ${a.valores[s.chave].texto} ${a.valores[s.chave].unidade}<br>${a.chainage_m.toFixed(1)} m do início${a.secao_de_m != null ? `<br>seção ${a.secao_de_m}–${a.secao_ate_m} m` : ""}<br>${a.litologia?.nome ?? "sem litologia"}`),
          hovertemplate: "%{text}<extra></extra>",
          marker: { size: sit === "medido" ? 10 : 12, color: p.map(cor), symbol: sit === "medido" ? "circle" : sit === "abaixo_ld" ? "triangle-down-open" : "triangle-up-open", line: { width: sit === "medido" ? 0 : 2 } },
        } as Data);
      }
      const faixa = mn != null || mx != null ? (e.log ? [Math.log10(mn ?? s.min ?? 1), Math.log10(mx ?? s.max ?? 10)] : [mn ?? s.min ?? 0, mx ?? s.max ?? 1]) : undefined;
      layout[chave] = { title: { text: `${s.analito} (${s.unidade})`, font: { size: 12 } }, type: e.log ? "log" : "linear", domain: [1 - (i + 1) * h - i * gap, 1 - i * h - i * gap], range: faixa, autorange: faixa ? false : true, zeroline: false };
    });
    return [traces, layout];
  }, (el) => {
    el.on("plotly_click", (ev) => { const id = ev.points[0]?.customdata as unknown as string | undefined; if (id) aoAbrir(id); });
    el.on("plotly_relayout", (ev) => {
      const r = ev as Record<string, number>;
      if (r["xaxis.range[0]"] != null && d) setTrecho([Math.max(0, r["xaxis.range[0]"]), Math.min(d.referencia.comprimento_m, r["xaxis.range[1]"])]);
      else if ("xaxis.autorange" in r) setTrecho(null);
    });
  });

  async function imagem(formato: "png" | "svg") {
    const { default: Plotly } = await import("plotly.js-dist-min");
    if (divGraf.current) await Plotly.downloadImage(divGraf.current, { format: formato, filename: `teores_${d?.unidade.codigo ?? ""}`, width: 1400, height: altura });
  }

  if (q.isLoading) return <Loader />;
  if (q.error) return <Alert color="orange">{q.error instanceof ErroApi ? q.error.message : String(q.error)}</Alert>;
  if (!d) return null;
  const r = d.referencia;
  const maximos = Object.fromEntries(series.map((s) => [s.chave, s.max ?? 0]));
  const minimos = Object.fromEntries(series.map((s) => [s.chave, s.min ?? 0]));
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Text fw={700}>{d.unidade.codigo} — {d.unidade.nome}</Text>
            <Text size="xs" c="dimmed">{r.pontos} pontos de amostragem ao longo de {r.comprimento_m.toFixed(1)} m · {r.tipo === "eixo" ? `distância pelo eixo desenhado (v${r.eixo_versao})` : "distância pelo caminho entre as amostras"} · início: {r.inicio}</Text>
          </div>
          <Group gap={6}>
            {trecho && <Button size="compact-xs" variant="light" onClick={() => aoTrecho(trecho[0], trecho[1])}>Filtrar este trecho ({trecho[0].toFixed(0)}–{trecho[1].toFixed(0)} m)</Button>}
            <Button size="compact-xs" variant="default" onClick={() => baixar(`/unidades/${unidadeId}/longitudinal.csv?${params}`, `teores_${d.unidade.codigo}.csv`)}>CSV</Button>
            <Button size="compact-xs" variant="default" onClick={() => imagem("png")}>PNG</Button>
            <Button size="compact-xs" variant="default" onClick={() => imagem("svg")}>SVG</Button>
          </Group>
        </Group>
        <Group gap={6}>
          <Badge variant="light">{d.amostras.length} amostras</Badge>
          {series.map((s) => <Badge key={s.chave} variant="outline" color={s.abaixo_ld || s.acima_ld ? "orange" : "gray"}>{s.chave}: {s.pontos} valores{s.abaixo_ld ? ` · ${s.abaixo_ld} <LD` : ""}{s.acima_ld ? ` · ${s.acima_ld} >LS` : ""}{s.omitido ? ` · ${s.omitido} fora` : ""}{s.sem_valor ? ` · ${s.sem_valor} sem valor` : ""}</Badge>)}
          {d.series.filter((s) => !s.unidade).map((s) => <Badge key={s.chave} color="gray" variant="light">{s.analito}: sem resultados</Badge>)}
        </Group>
        {r.irregular && (
          <Alert color="orange" p="xs" title="As amostras não seguem uma linha única">
            <Text size="sm">O caminho entre elas tem {r.irregular.caminho_m} m, mas as pontas estão a só {r.irregular.entre_pontas_m} m: provavelmente há ramos diferentes juntos nesta unidade (ex.: lado direito e esquerdo, subida, câmara). Assim a distância não representa a galeria. Separe cada ramo em uma unidade própria (Estrutura da mina → nova unidade dentro desta) e ligue as amostras a ela, ou desenhe o eixo da galeria.</Text>
          </Alert>
        )}
        {r.saltos.map((s) => <Alert key={s.depois_de} color="yellow" p="xs">Trecho longo sem amostras depois de {s.depois_de} ({s.trecho_m} m): confira se as amostras são todas desta galeria.</Alert>)}
        {d.avisos.map((a) => <Alert key={a} color="yellow" p="xs">{a}</Alert>)}
        {!d.amostras.length ? <Text c="dimmed" size="sm">Nenhuma amostra com coordenadas nesta unidade{d.sem_posicao.length ? "" : " (com os filtros atuais)"}.</Text> : (
          <>
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <div>
                <Group justify="space-between" mb={4}>
                  <Text size="sm" fw={600}>Planta: pontos numerados do início ao fim</Text>
                  {series.length > 1 && <Select size="xs" w={140} allowDeselect={false} value={serieCor?.chave ?? null} onChange={setCorDe} data={series.map((s) => s.chave)} aria-label="Cor dos pontos na planta" />}
                </Group>
                <div ref={divPlanta} data-testid={`planta-${d.unidade.codigo}`} style={{ width: "100%", height: 380, border: "1px solid var(--mantine-color-gray-3)" }} />
                {serieCor && valoresCor.length > 0 && (
                  <Group gap={6} mt={4} wrap="nowrap">
                    <Text size="xs">{serieCor.chave} {vmin.toLocaleString("pt-BR")}</Text>
                    <div style={{ flex: 1, height: 10, borderRadius: 3, background: `linear-gradient(90deg, ${ESCALA_TEOR.map(([k, c]) => `${c} ${k * 100}%`).join(",")})` }} />
                    <Text size="xs">{vmax.toLocaleString("pt-BR")} {serieCor.unidade}</Text>
                  </Group>
                )}
                {!topo.data?.feicoes && <Text size="xs" c="dimmed">Sem topografia importada nesta área (só o caminho e as amostras).</Text>}
              </div>
              <div>
                <Text size="sm" fw={600} mb={4}>Teor × distância desde o início</Text>
                {series.length ? <div ref={divGraf} data-testid={`grafico-${d.unidade.codigo}`} style={{ width: "100%", minHeight: altura }} /> : <Text c="dimmed" size="sm">Nenhum resultado para os analitos escolhidos.</Text>}
              </div>
            </SimpleGrid>
            {corPor === "litologia" && series.length > 0 && (
              <Group gap="sm">
                <Text size="xs" c="dimmed">Pontos do gráfico:</Text>
                {[...new Map(d.amostras.map((a) => [a.litologia?.id ?? "-", a.litologia] as const)).values()].map((t) => (
                  <Group key={t?.id ?? "-"} gap={4}><span style={{ width: 10, height: 10, borderRadius: 5, background: t?.cor ?? "#868e96", display: "inline-block" }} /><Text size="xs">{t?.nome ?? "sem litologia"}</Text></Group>
                ))}
              </Group>
            )}
            <Text size="xs" c="dimmed">Símbolo cheio = valor medido; triângulo vazado = abaixo (▽) ou acima (△) do limite: {d.regra_ld_descricao}. A linha liga a média de cada ponto (só valores medidos). Clique num ponto (na planta, no gráfico ou na tabela) para ver a amostra.</Text>
            <ScrollArea.Autosize mah={420}>
              <Table.ScrollContainer minWidth={620}>
                <Table fz="xs" striped highlightOnHover stickyHeader>
                  <Table.Thead><Table.Tr><Table.Th>Ponto</Table.Th><Table.Th>Distância (m)</Table.Th><Table.Th>Amostra</Table.Th><Table.Th>Seção (m)</Table.Th><Table.Th>Litologia</Table.Th>{series.map((s) => <Table.Th key={s.chave} miw={130}>{s.chave} ({s.unidade})</Table.Th>)}</Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {d.amostras.map((a, i) => {
                      const novoPonto = i === 0 || d.amostras[i - 1].ponto !== a.ponto;
                      return (
                        <Table.Tr key={a.id} style={{ cursor: "pointer", borderTop: novoPonto && i ? "2px solid var(--mantine-color-gray-4)" : undefined }} onClick={() => aoAbrir(a.id)}>
                          <Table.Td fw={600}>{novoPonto ? a.ponto : ""}</Table.Td>
                          <Table.Td>{novoPonto ? a.chainage_m.toFixed(1) : ""}</Table.Td>
                          <Table.Td fw={500}>{a.codigo}</Table.Td>
                          <Table.Td>{a.secao_de_m != null ? `${a.secao_de_m}–${a.secao_ate_m}` : ""}</Table.Td>
                          <Table.Td>{a.litologia?.nome ?? ""}</Table.Td>
                          {series.map((s) => {
                            const v = a.valores[s.chave];
                            const pct = v?.y != null && maximos[s.chave] > 0 ? (v.y / maximos[s.chave]) * 100 : 0;
                            const destaque = v?.y != null && series.length && s.pontos > 1 ? (v.y === maximos[s.chave] ? "maior" : v.y === minimos[s.chave] ? "menor" : null) : null;
                            return (
                              <Table.Td key={s.chave}>
                                <Group gap={6} wrap="nowrap">
                                  <Text size="xs" w={52} ta="right" fw={destaque ? 700 : 400} c={destaque === "maior" ? "red.8" : destaque === "menor" ? "blue.8" : undefined}>{v?.texto ?? "—"}</Text>
                                  <div style={{ height: 8, width: `${Math.max(pct, v?.y != null ? 2 : 0) * 0.7}px`, background: v?.situacao === "medido" ? "#4dabf7" : "#dee2e6", borderRadius: 2 }} />
                                </Group>
                              </Table.Td>
                            );
                          })}
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </ScrollArea.Autosize>
          </>
        )}
        {d.sem_posicao.length > 0 && (
          <Alert color="gray" p="xs" title={`${d.sem_posicao.length} amostra(s) desta unidade fora da análise`}>
            <Text size="xs">{d.sem_posicao.slice(0, 30).map((s) => `${s.codigo} (${s.motivo})`).join(" · ")}{d.sem_posicao.length > 30 ? " …" : ""}</Text>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}

/** Consulta completa da amostra (dados, resultados, ficha, fotos e croquis). Reutilizada no 3D. */
export function ConsultaAmostra({ id, mina, eu, fechar }: { id: string; mina: Mina; eu: Eu; fechar: () => void }) {
  const a = useQuery({ queryKey: ["amostra", id], queryFn: () => api<Amostra>(`/amostras/${id}`) });
  const dic = useDicionarios();
  const nome = (t: string | null) => (t ? dic.porId.get(t)?.nome ?? "" : "");
  const linha = (rotulo: string, valor: React.ReactNode) => valor ? <Group gap="xs" wrap="nowrap"><Text size="sm" c="dimmed" w={150}>{rotulo}</Text><Text size="sm">{valor}</Text></Group> : null;
  return (
    <Modal opened onClose={fechar} size="xl" title={a.data ? `Amostra ${a.data.codigo}` : "Amostra"}>
      {!a.data ? <Loader size="sm" /> : (
        <Stack gap="sm">
          <Stack gap={2}>
            {linha("Local", [a.data.unidade, a.data.local_descricao].filter(Boolean).join(" — "))}
            {linha("Coordenadas", a.data.x != null ? `E ${a.data.x.toFixed(2)} · N ${a.data.y?.toFixed(2)} · Z ${a.data.z?.toFixed(2) ?? "—"} (EPSG:${a.data.srid})` : "não informadas")}
            {linha("Coleta", a.data.data_coleta ? new Date(a.data.data_coleta + "T00:00").toLocaleDateString("pt-BR") : null)}
            {linha("Responsável", a.data.responsavel)}
            {linha("Litologia", a.data.litologia)}
            {linha("Alteração", nome(a.data.alteracao_id))}
            {linha("Mineralização", nome(a.data.mineralizacao_id))}
            {linha("Seção (de–até)", a.data.secao_de_m != null ? `${a.data.secao_de_m} – ${a.data.secao_ate_m} m` : null)}
            {linha("Descrição", a.data.descricao)}
            {linha("Observações", a.data.observacoes)}
            {linha("Ficha de mapeamento", a.data.mapeamento_id ? <Link to={`/mapeamento/${a.data.mapeamento_id}`} onClick={fechar}>{a.data.ficha}</Link> : null)}
            {linha("Lotes", a.data.lotes.join(", "))}
          </Stack>
          <Text fw={600} size="sm">Resultados</Text>
          <ResultadosAmostra id={id} />
          {a.data.mapeamento_id && eu.permissoes.includes("arquivo:ler") && (
            <>
              <Text fw={600} size="sm">Fotos e croquis da ficha</Text>
              <PainelDocumentos minaId={mina.id} mapeamentoId={a.data.mapeamento_id} podeEnviar={false} compacto />
            </>
          )}
          <Group><Button component={Link} to="/amostras" variant="light" size="xs" onClick={fechar}>Abrir em Amostras</Button></Group>
        </Stack>
      )}
    </Modal>
  );
}
