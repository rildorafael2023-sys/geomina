import { Accordion, Alert, Badge, Button, Checkbox, Group, Loader, MultiSelect, Paper, ScrollArea, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useQueries, useQuery } from "@tanstack/react-query";
import { forwardRef, useMemo, useRef, useState } from "react";

import { api, baixar, ErroApi, type Eu, type Mina } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { classe, coresClasses, limites, PALETAS, rotulos, textoSobre, type Metodo } from "../../geologia/classes";
import type { Geometria } from "../topografia/Planta";
import { ConsultaAmostra } from "./ConsultaAmostra";
import { SemLocal } from "./SemLocal";

interface UnidadeLong { id: string; codigo: string; nome: string; tipo: string; amostras: number; eixo_versao: number | null }
interface TermoRef { id: string; nome: string; cor: string | null }
export interface Valor { y: number | null; texto: string; situacao: "medido" | "abaixo_ld" | "acima_ld" | "sem_valor" | "omitido"; unidade: string; certificado: string }
interface Amostra {
  id: string; codigo: string; chainage_m: number; ponto: number; x: number; y: number; z: number | null; data: string | null;
  responsavel: string | null; responsavel_id: string | null; litologia: TermoRef | null; secao_de_m: number | null; secao_ate_m: number | null;
  valores: Record<string, Valor>;
}
interface Serie { chave: string; analito: string; unidade: string | null; pontos: number; abaixo_ld?: number; acima_ld?: number; sem_valor?: number; omitido?: number }
interface Referencia { tipo: "eixo" | "amostras"; inicio: string; invertido: boolean; percurso: number[][]; pontos: number; saltos: { depois_de: string; trecho_m: number }[]; irregular: { caminho_m: number; entre_pontas_m: number } | null }
export interface Dados { unidade: { id: string; codigo: string; nome: string }; referencia: Referencia; regra_ld_descricao: string; series: Serie[]; avisos: string[]; amostras: Amostra[]; sem_posicao: { codigo: string; motivo: string }[] }
interface Filtros { litologias: string[]; alteracoes: string[]; mineralizacoes: string[]; estruturas: string[]; data_de: string; data_ate: string; responsaveis: string[]; tipos: string[]; campanhas: string[]; teor_analito: string | null; teor_min: string; teor_max: string; incluir_duplicatas: boolean }
interface Classes { metodo: Metodo; n: number; paleta: string; manuais: Record<string, string> }

const FILTROS_VAZIOS: Filtros = { litologias: [], alteracoes: [], mineralizacoes: [], estruturas: [], data_de: "", data_ate: "", responsaveis: [], tipos: [], campanhas: [], teor_analito: null, teor_min: "", teor_max: "", incluir_duplicatas: false };
const fmt = (x: number) => x.toLocaleString("pt-BR", { maximumSignificantDigits: 4 });

function parametros(analitos: string[], regra: string, f: Filtros, inverter: boolean): URLSearchParams {
  const p = new URLSearchParams({ analitos: analitos.join(","), regra_ld: regra, referencia: "amostras" });
  if (inverter) p.set("inverter", "true");
  for (const k of ["litologias", "alteracoes", "mineralizacoes", "estruturas", "responsaveis", "tipos", "campanhas"] as const) if (f[k].length) p.set(k, f[k].join(","));
  for (const k of ["data_de", "data_ate"] as const) if (f[k]) p.set(k, f[k]);
  if (f.teor_analito && (f.teor_min || f.teor_max)) {
    p.set("teor_analito", f.teor_analito);
    if (f.teor_min) p.set("teor_min", f.teor_min.replace(",", "."));
    if (f.teor_max) p.set("teor_max", f.teor_max.replace(",", "."));
  }
  if (f.incluir_duplicatas) p.set("incluir_duplicatas", "true");
  return p;
}

/** Valor que define a cor: medido ou limite (conforme a regra escolhida); sem valor → null. */
export const valorCor = (v?: Valor) => (v && v.y != null ? v.y : null);

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
  const [galerias, setGalerias] = useState<string[]>([]);
  const [analitos, setAnalitos] = useState<string[]>([]);
  const [regra, setRegra] = useState("limite");
  const [invertidas, setInvertidas] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [cls, setCls] = useState<Classes>({ metodo: "quantis", n: 5, paleta: "teor", manuais: {} });
  const [aberta, setAberta] = useState<string | null>(null);
  const [soComResultado, setSoComResultado] = useState(false);
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => setFiltros((f) => ({ ...f, [k]: v }));

  const consultas = useQueries({
    queries: galerias.map((id) => {
      const p = parametros(analitos, regra, filtros, invertidas.has(id));
      return { queryKey: ["faixa", id, p.toString()], enabled: analitos.length > 0, queryFn: () => api<Dados>(`/unidades/${id}/longitudinal?${p}`) };
    }),
  });
  const dados = consultas.map((c) => c.data).filter((d): d is Dados => !!d);

  // classes comuns a todas as galerias mostradas: a mesma cor significa o mesmo teor em todas
  const classes = useMemo(() => {
    const out: Record<string, { lim: number[]; cores: string[]; unidade: string }> = {};
    for (const a of analitos) {
      const vals = dados.flatMap((d) => d.amostras.map((x) => valorCor(x.valores[a]))).filter((v): v is number => v != null);
      const manuais = (cls.manuais[a] ?? "").split(/[;\s]+/).map((t) => Number(t.replace(",", "."))).filter((n) => Number.isFinite(n) && n !== 0);
      const lim = limites(vals, cls.metodo, cls.n, manuais);
      const unidade = dados.flatMap((d) => d.series).find((s) => s.chave === a)?.unidade ?? "";
      out[a] = { lim, cores: coresClasses(lim.length + 1, cls.paleta), unidade };
    }
    return out;
  }, [dados, analitos, cls]);

  const responsaveis = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dados) for (const a of d.amostras) if (a.responsavel_id && a.responsavel) m.set(a.responsavel_id, a.responsavel);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [dados]);
  const opUnidades = (unidades.data ?? []).map((u) => ({ value: u.id, label: `${u.codigo} — ${u.nome} (${u.amostras} amostra${u.amostras === 1 ? "" : "s"})` }));
  const nFiltros = Object.entries(filtros).filter(([k, v]) => k !== "incluir_duplicatas" && k !== "teor_analito" && (Array.isArray(v) ? v.length : v !== "" && v !== null)).length;

  return (
    <Stack>
      <Title order={3}>Teores na galeria</Title>
      <Text size="sm" c="dimmed">Escolha a galeria (ou várias) e os analitos. As amostras aparecem lado a lado, do início ao fim da galeria, numa faixa por analito com a cor da classe de teor — para comparar uma amostra com as outras.</Text>
      <Paper withBorder p="sm">
        <Stack gap="xs">
          <Group align="flex-end" wrap="wrap">
            <MultiSelect label="Galerias, travessas ou rampas" searchable w={460} data={opUnidades} value={galerias} onChange={setGalerias} nothingFoundMessage="Nenhuma" />
            <MultiSelect label="Analitos" searchable w={340} value={analitos} onChange={setAnalitos}
              data={(analitosQ.data ?? []).map((a) => ({ value: a.codigo, label: `${a.codigo} (${a.tipo})` }))} />
            <Select label="Abaixo/acima do limite de detecção" w={250} allowDeselect={false} value={regra} onChange={(v) => setRegra(v ?? "limite")}
              data={[{ value: "limite", label: "Usar o valor do limite" }, { value: "metade", label: "Usar metade do limite" }, { value: "omitir", label: "Deixar sem cor" }]} />
            <Checkbox mb={8} label="Só amostras com resultado" checked={soComResultado} onChange={(e) => setSoComResultado(e.currentTarget.checked)} />
          </Group>
          <Accordion variant="contained">
            <Accordion.Item value="c">
              <Accordion.Control>Classes e cores</Accordion.Control>
              <Accordion.Panel>
                <Group align="flex-end" wrap="wrap">
                  <SegmentedControl value={cls.metodo} onChange={(v) => setCls((c) => ({ ...c, metodo: v as Metodo }))}
                    data={[{ value: "quantis", label: "Quantis" }, { value: "iguais", label: "Intervalos iguais" }, { value: "manual", label: "Limites que eu informar" }]} />
                  {cls.metodo !== "manual" && <Select label="Número de classes" w={150} allowDeselect={false} value={String(cls.n)} onChange={(v) => setCls((c) => ({ ...c, n: Number(v) }))} data={["3", "4", "5", "6", "7"]} />}
                  <Select label="Cores" w={220} allowDeselect={false} value={cls.paleta} onChange={(v) => setCls((c) => ({ ...c, paleta: v ?? "teor" }))} data={Object.entries(PALETAS).map(([value, p]) => ({ value, label: p.nome }))} />
                </Group>
                {cls.metodo === "manual" && (
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mt="xs">
                    {analitos.map((a) => <TextInput key={a} label={`Limites de ${a} (${classes[a]?.unidade ?? ""})`} placeholder="ex.: 500; 1000; 1500" value={cls.manuais[a] ?? ""} onChange={(e) => { const t = e.currentTarget.value; setCls((c) => ({ ...c, manuais: { ...c.manuais, [a]: t } })); }} />)}
                  </SimpleGrid>
                )}
                <Text size="xs" c="dimmed" mt="xs">Quantis: cada cor tem mais ou menos o mesmo número de amostras. Intervalos iguais: a faixa de valores é dividida em partes iguais. As classes valem para todas as galerias mostradas.</Text>
              </Accordion.Panel>
            </Accordion.Item>
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
                  <Select label="Faixa de teor: analito" clearable data={(analitosQ.data ?? []).map((a) => a.codigo)} value={filtros.teor_analito} onChange={(v) => set("teor_analito", v)} />
                  <TextInput label="Teor mínimo" value={filtros.teor_min} onChange={(e) => set("teor_min", e.currentTarget.value)} />
                  <TextInput label="Teor máximo" value={filtros.teor_max} onChange={(e) => set("teor_max", e.currentTarget.value)} />
                  <Checkbox mt="lg" label="Incluir duplicatas de campo" checked={filtros.incluir_duplicatas} onChange={(e) => set("incluir_duplicatas", e.currentTarget.checked)} />
                  <Button mt="lg" variant="subtle" onClick={() => setFiltros(FILTROS_VAZIOS)}>Limpar filtros</Button>
                </SimpleGrid>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </Paper>
      <SemLocal mina={mina} pode={eu.permissoes.includes("amostra:editar")} />
      {!galerias.length || !analitos.length ? <Text c="dimmed">Escolha a galeria e pelo menos um analito.</Text> : (
        <>
          <Legenda analitos={analitos} classes={classes} metodo={cls.metodo} />
          {galerias.map((id, i) => {
            const c = consultas[i];
            if (c.isLoading) return <Loader key={id} />;
            if (c.error) return <Alert key={id} color="orange">{c.error instanceof ErroApi ? c.error.message : String(c.error)}</Alert>;
            return c.data ? (
              <PainelGaleria key={id} mina={mina} d={c.data} soComResultado={soComResultado} analitos={analitos} classes={classes} params={parametros(analitos, regra, filtros, invertidas.has(id))}
                aoInverter={() => setInvertidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} aoAbrir={setAberta} />
            ) : null;
          })}
        </>
      )}
      {aberta && <ConsultaAmostra id={aberta} mina={mina} eu={eu} fechar={() => setAberta(null)} />}
    </Stack>
  );
}

export function Legenda({ analitos, classes, metodo }: { analitos: string[]; classes: Record<string, { lim: number[]; cores: string[]; unidade: string }>; metodo: Metodo }) {
  return (
    <Paper withBorder p="xs" data-testid="legenda">
      <Group gap="xl" align="flex-start" wrap="wrap">
        {analitos.map((a) => {
          const c = classes[a];
          if (!c) return null;
          return (
            <Stack key={a} gap={2}>
              <Text size="xs" fw={700}>{a} {c.unidade && `(${c.unidade})`}</Text>
              {rotulos(c.lim).map((r, k) => (
                <Group key={r} gap={6} wrap="nowrap"><span style={{ width: 22, height: 12, background: c.cores[k], border: "1px solid #999", display: "inline-block" }} /><Text size="xs">{r}</Text></Group>
              ))}
            </Stack>
          );
        })}
        <Stack gap={2}>
          <Text size="xs" fw={700}>Símbolos</Text>
          <Group gap={6}><span style={{ width: 22, height: 12, background: "repeating-linear-gradient(45deg,#fff,#fff 3px,#bbb 3px,#bbb 5px)", border: "1px solid #999", display: "inline-block" }} /><Text size="xs">sem resultado</Text></Group>
          <Group gap={6}><span style={{ width: 22, height: 12, border: "2px dashed #333", display: "inline-block" }} /><Text size="xs">abaixo/acima do limite (ex.: &lt;10)</Text></Group>
          <Text size="xs" c="dimmed">Classes por {metodo === "quantis" ? "quantis" : metodo === "iguais" ? "intervalos iguais" : "limites informados"}</Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export function PainelGaleria({ mina, d, soComResultado, analitos, classes, params, aoInverter, aoAbrir }: {
  mina: Mina; d: Dados; soComResultado: boolean; analitos: string[]; classes: Record<string, { lim: number[]; cores: string[]; unidade: string }>; params: URLSearchParams;
  aoInverter: () => void; aoAbrir: (id: string) => void;
}) {
  const [corPlanta, setCorPlanta] = useState<string | null>(null);
  const anPlanta = corPlanta && analitos.includes(corPlanta) ? corPlanta : analitos[0];
  const faixa = useRef<SVGSVGElement>(null);
  const r = d.referencia;
  const cor = (a: string, v?: Valor) => { const y = valorCor(v); const c = classes[a]; return y == null || !c ? null : c.cores[classe(y, c.lim)]; };
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Text fw={700}>{d.unidade.codigo} — {d.unidade.nome}</Text>
            <Text size="xs" c="dimmed">{d.amostras.length} amostras em {r.pontos} pontos, numerados do início ao fim da galeria · início: {r.inicio}</Text>
          </div>
          <Group gap={6}>
            <Button size="compact-xs" variant="light" onClick={aoInverter}>Inverter início ⇄ fim</Button>
            <Button size="compact-xs" variant="default" onClick={() => baixar(`/unidades/${d.unidade.id}/longitudinal.csv?${params}`, `teores_${d.unidade.codigo}.csv`)}>Tabela (CSV)</Button>
            <Button size="compact-xs" variant="default" onClick={() => faixa.current && baixarSvg(faixa.current, `faixa_${d.unidade.codigo}`, "svg")}>Faixa (SVG)</Button>
            <Button size="compact-xs" variant="default" onClick={() => faixa.current && baixarSvg(faixa.current, `faixa_${d.unidade.codigo}`, "png")}>Faixa (PNG)</Button>
          </Group>
        </Group>
        {r.irregular && (
          <Alert color="orange" p="xs" title="As amostras não seguem uma linha única">
            <Text size="sm">Parece haver ramos diferentes juntos nesta unidade (ex.: lado direito e esquerdo, subida, câmara), então a ordem das amostras não acompanha a galeria. Separe cada ramo em uma unidade própria e ligue as amostras a ela.</Text>
          </Alert>
        )}
        {r.saltos.map((s) => <Alert key={s.depois_de} color="yellow" p="xs">Trecho longo sem amostras depois de {s.depois_de} ({s.trecho_m} m): confira se as amostras são todas desta galeria.</Alert>)}
        {d.avisos.map((a) => <Alert key={a} color="yellow" p="xs">{a}</Alert>)}
        {!d.amostras.length ? <Text c="dimmed" size="sm">Nenhuma amostra com coordenadas nesta unidade (com os filtros atuais).</Text> : (
          <>
            <ScrollArea type="auto" offsetScrollbars>
              <Faixa ref={faixa} d={soComResultado ? { ...d, amostras: d.amostras.filter((a) => analitos.some((x) => a.valores[x])) } : d} analitos={analitos} classes={classes} cor={cor} aoAbrir={aoAbrir} />
            </ScrollArea>
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <div>
                <Group justify="space-between" mb={4}>
                  <Text size="sm" fw={600}>Planta: galeria colorida pelo teor</Text>
                  {analitos.length > 1 && <Select size="xs" w={120} allowDeselect={false} value={anPlanta} onChange={setCorPlanta} data={analitos} aria-label="Analito da planta" />}
                </Group>
                <PlantaFita mina={mina} d={d} analito={anPlanta} cor={cor} aoAbrir={aoAbrir} />
              </div>
              <Resumo d={d} analitos={analitos} />
            </SimpleGrid>
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

/** Faixa de teores ("ribbon"): uma coluna por amostra, na ordem da galeria; uma linha por analito, na cor da classe. */
const Faixa = forwardRef<SVGSVGElement, {
  d: Dados; analitos: string[]; classes: Record<string, { lim: number[]; cores: string[]; unidade: string }>;
  cor: (a: string, v?: Valor) => string | null; aoAbrir: (id: string) => void;
}>(function Faixa({ d, analitos, classes, cor, aoAbrir }, ref) {
  const W = 76, ESQ = 120, H_PONTO = 20, H_COD = 22, H_LIT = 26, H = 34;
  const n = d.amostras.length;
  const largura = ESQ + n * W + 2;
  const yAn = H_PONTO + H_COD + H_LIT + 4;
  const altura = yAn + analitos.length * H + 4;
  const corta = (t: string, k: number) => (t.length > k ? t.slice(0, k - 1) + "…" : t);
  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" data-testid={`faixa-${d.unidade.codigo}`} width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} style={{ fontFamily: "Inter, Arial, sans-serif", display: "block" }}>
      <defs>
        <pattern id="semres" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><rect width="2" height="6" fill="#ccc" /></pattern>
      </defs>
      <rect width={largura} height={altura} fill="#fff" />
      <text x={4} y={14} fontSize={11} fill="#666">Ponto</text>
      <text x={4} y={H_PONTO + 15} fontSize={11} fill="#666">Amostra</text>
      <text x={4} y={H_PONTO + H_COD + 17} fontSize={11} fill="#666">Litologia</text>
      {analitos.map((a, j) => <text key={a} x={4} y={yAn + j * H + 21} fontSize={12} fontWeight={700} fill="#222">{a} <tspan fontWeight={400} fontSize={10} fill="#666">{classes[a]?.unidade}</tspan></text>)}
      {d.amostras.map((am, i) => {
        const x = ESQ + i * W;
        const novo = i === 0 || d.amostras[i - 1].ponto !== am.ponto;
        const lit = am.litologia;
        return (
          <g key={am.id} style={{ cursor: "pointer" }} onClick={() => aoAbrir(am.id)} data-amostra={am.codigo}>
            <title>{`${am.codigo} — ponto ${am.ponto}${am.secao_de_m != null ? ` (seção ${am.secao_de_m}–${am.secao_ate_m} m)` : ""}\n${lit?.nome ?? "sem litologia"}\n${analitos.map((a) => `${a}: ${am.valores[a]?.texto ?? "sem resultado"} ${am.valores[a]?.unidade ?? ""}`).join("\n")}`}</title>
            {novo && <><line x1={x} y1={0} x2={x} y2={altura} stroke="#888" strokeWidth={i === 0 ? 0 : 1.5} /><text x={x + 4} y={14} fontSize={12} fontWeight={700} fill="#222">{am.ponto}</text></>}
            <text x={x + W / 2} y={H_PONTO + 15} fontSize={10} textAnchor="middle" fill="#222">{am.codigo.replace(/^BS-RP-/, "RP-").replace(/^BMT-TS-/, "TS-")}</text>
            <rect x={x + 2} y={H_PONTO + H_COD} width={W - 4} height={H_LIT - 4} fill={lit?.cor ?? "#eee"} stroke="#999" strokeWidth={0.5} />
            <text x={x + W / 2} y={H_PONTO + H_COD + 15} fontSize={9} textAnchor="middle" fill={textoSobre(lit?.cor ?? "#eeeeee")}>{corta(lit?.nome ?? "—", 13)}</text>
            {analitos.map((a, j) => {
              const v = am.valores[a];
              const c = cor(a, v);
              const ld = v && (v.situacao === "abaixo_ld" || v.situacao === "acima_ld" || v.situacao === "omitido");
              return (
                <g key={a}>
                  <rect x={x + 2} y={yAn + j * H + 2} width={W - 4} height={H - 4} fill={c ?? "url(#semres)"} stroke={ld ? "#333" : "#999"} strokeWidth={ld ? 1.5 : 0.5} strokeDasharray={ld ? "4 2" : undefined} />
                  <text x={x + W / 2} y={yAn + j * H + 21} fontSize={11} fontWeight={600} textAnchor="middle" fill={c ? textoSobre(c) : "#555"}>{v?.texto ?? "—"}</text>
                </g>
              );
            })}
            <rect x={x} y={0} width={W} height={altura} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
});

/** Planta com a galeria desenhada como uma fita colorida pelo teor de cada ponto (média das amostras do ponto). */
function PlantaFita({ mina, d, analito, cor, aoAbrir }: { mina: Mina; d: Dados; analito: string; cor: (a: string, v?: Valor) => string | null; aoAbrir: (id: string) => void }) {
  const pontos = useMemo(() => {
    const m = new Map<number, Amostra[]>();
    for (const a of d.amostras) m.set(a.ponto, [...(m.get(a.ponto) ?? []), a]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([p, as]) => {
      const vs = as.map((a) => valorCor(a.valores[analito])).filter((v): v is number => v != null);
      const media = vs.length ? vs.reduce((t, v) => t + v, 0) / vs.length : null;
      return { ponto: p, x: as[0].x, y: as[0].y, amostras: as, media };
    });
  }, [d, analito]);
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  const margem = 20;
  const cx0 = Math.min(...xs) - margem, cx1 = Math.max(...xs) + margem, cy0 = Math.min(...ys) - margem, cy1 = Math.max(...ys) + margem;
  // a planta acompanha o formato da galeria (sem quadrado vazio para galerias compridas)
  const T = 400, MIN = 150;
  const k = T / Math.max(cx1 - cx0, cy1 - cy0, 30);
  const LW = Math.max(MIN, (cx1 - cx0) * k), LH = Math.max(MIN, (cy1 - cy0) * k);
  const [x0, y0] = [(cx0 + cx1) / 2 - LW / 2 / k, (cy0 + cy1) / 2 - LH / 2 / k];
  const topo = useQuery({
    queryKey: ["geometria-caixa", mina.id, [x0, y0, LW, LH].map((v) => v.toFixed(0)).join(",")],
    queryFn: () => api<Geometria>(`/minas/${mina.id}/topografia/geometria?bbox=${x0},${y0},${x0 + LW / k},${y0 + LH / k}&limite=20000`),
    staleTime: 60_000,
  });
  const px = (x: number) => (x - x0) * k, py = (y: number) => LH - (y - y0) * k;
  const corDe = (v: number | null) => (v == null ? null : cor(analito, { y: v, texto: "", situacao: "medido", unidade: "", certificado: "" }));
  const largura = Math.max(6, Math.min(16, 3.5 * k));
  const meio = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const escala = [1, 2, 5, 10, 20, 50, 100, 200].find((m) => m * k > 50) ?? 200;
  const o = topo.data?.origem ?? [0, 0, 0];
  return (
    <svg data-testid={`planta-${d.unidade.codigo}`} viewBox={`0 0 ${LW} ${LH}`} style={{ width: "100%", maxWidth: 460, border: "1px solid var(--mantine-color-gray-3)", background: "#fbfbfa", display: "block" }}>
      {topo.data?.camadas.map((c) => c.feicoes.map((f) => f.c.map((p, i) => (
        <polyline key={`${f.id}-${i}`} points={p.map((v) => `${px(v[0] + o[0]).toFixed(1)},${py(v[1] + o[1]).toFixed(1)}`).join(" ")} fill="none" stroke="#c8c8c8" strokeWidth={0.8} />
      ))))}
      {pontos.map((p, i) => {
        const a = i > 0 ? meio(pontos[i - 1], p) : p, b = i < pontos.length - 1 ? meio(p, pontos[i + 1]) : p;
        const c = corDe(p.media);
        return (
          <g key={p.ponto}>
            {pontos.length > 1 && <polyline points={`${px(a.x)},${py(a.y)} ${px(p.x)},${py(p.y)} ${px(b.x)},${py(b.y)}`} fill="none" stroke={c ?? "#bbb"} strokeWidth={largura} strokeLinecap="butt" strokeLinejoin="round" strokeDasharray={c ? undefined : "3 2"} />}
          </g>
        );
      })}
      {pontos.map((p) => (
        <g key={`m${p.ponto}`} style={{ cursor: "pointer" }} onClick={() => aoAbrir(p.amostras[0].id)}>
          <title>{`Ponto ${p.ponto}: ${p.amostras.map((a) => `${a.codigo} ${a.valores[analito]?.texto ?? "sem resultado"}`).join(" · ")}`}</title>
          <circle cx={px(p.x)} cy={py(p.y)} r={largura / 2 + 2} fill={corDe(p.media) ?? "#fff"} stroke="#222" strokeWidth={1} />
          <text x={px(p.x) + largura / 2 + 4} y={py(p.y) - largura / 2 - 2} fontSize={11} fontWeight={700} fill="#222" stroke="#fff" strokeWidth={3} paintOrder="stroke">{p.ponto}</text>
        </g>
      ))}
      {pontos[0] && <text x={px(pontos[0].x) + 8} y={py(pontos[0].y) + 18} fontSize={11} fontWeight={700} fill="#e8590c" stroke="#fff" strokeWidth={3} paintOrder="stroke">INÍCIO</text>}
      <line x1={12} y1={LH - 12} x2={12 + escala * k} y2={LH - 12} stroke="#222" strokeWidth={2} />
      <text x={12} y={LH - 17} fontSize={10}>{escala} m</text>
      <text x={LW - 24} y={16} fontSize={11}>N ↑</text>
      {!topo.data?.feicoes && <text x={8} y={16} fontSize={10} fill="#888">sem topografia nesta área</text>}
    </svg>
  );
}

/** Comparação numérica entre as amostras da galeria: menor, maior, média e mediana de cada analito. */
function Resumo({ d, analitos }: { d: Dados; analitos: string[] }) {
  const linhas = analitos.map((a) => {
    const vs = d.amostras.map((x) => ({ cod: x.codigo, v: x.valores[a] })).filter((x) => x.v && x.v.situacao === "medido" && x.v.y != null) as { cod: string; v: Valor }[];
    const ord = [...vs].sort((p, q) => (p.v.y as number) - (q.v.y as number));
    const nums = ord.map((x) => x.v.y as number);
    const media = nums.length ? nums.reduce((t, v) => t + v, 0) / nums.length : null;
    const mediana = nums.length ? (nums.length % 2 ? nums[(nums.length - 1) / 2] : (nums[nums.length / 2 - 1] + nums[nums.length / 2]) / 2) : null;
    const s = d.series.find((x) => x.chave === a);
    return { a, unidade: s?.unidade ?? "", n: nums.length, ld: (s?.abaixo_ld ?? 0) + (s?.acima_ld ?? 0), sem: d.amostras.length - (s?.pontos ?? 0) - (s?.omitido ?? 0), menor: ord[0], maior: ord[ord.length - 1], media, mediana };
  });
  return (
    <div>
      <Text size="sm" fw={600} mb={4}>Comparação entre as amostras</Text>
      <Table.ScrollContainer minWidth={460}>
        <Table fz="xs" striped>
          <Table.Thead><Table.Tr><Table.Th>Analito</Table.Th><Table.Th>Menor</Table.Th><Table.Th>Maior</Table.Th><Table.Th>Média</Table.Th><Table.Th>Mediana</Table.Th><Table.Th>Medidas</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {linhas.map((l) => (
              <Table.Tr key={l.a}>
                <Table.Td fw={700}>{l.a} <Text span size="xs" c="dimmed">{l.unidade}</Text></Table.Td>
                <Table.Td>{l.menor ? <>{l.menor.v.texto} <Text span size="xs" c="dimmed">{l.menor.cod}</Text></> : "—"}</Table.Td>
                <Table.Td>{l.maior ? <>{l.maior.v.texto} <Text span size="xs" c="dimmed">{l.maior.cod}</Text></> : "—"}</Table.Td>
                <Table.Td>{l.media != null ? fmt(l.media) : "—"}</Table.Td>
                <Table.Td>{l.mediana != null ? fmt(l.mediana) : "—"}</Table.Td>
                <Table.Td>{l.n}{l.ld ? ` + ${l.ld} no limite` : ""}{l.sem > 0 ? ` · ${l.sem} sem resultado` : ""}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt={4}>Média e mediana só com valores medidos (os que estão abaixo/acima do limite não entram). Clique numa amostra da faixa ou da planta para ver os dados completos.</Text>
    </div>
  );
}

async function baixarSvg(svg: SVGSVGElement, nome: string, formato: "svg" | "png") {
  const texto = new XMLSerializer().serializeToString(svg);
  const blobSvg = new Blob([texto], { type: "image/svg+xml;charset=utf-8" });
  const salvar = (b: Blob, ext: string) => { const u = URL.createObjectURL(b); const l = document.createElement("a"); l.href = u; l.download = `${nome}.${ext}`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); };
  if (formato === "svg") return salvar(blobSvg, "svg");
  const img = new Image();
  const url = URL.createObjectURL(blobSvg);
  await new Promise((ok, erro) => { img.onload = ok; img.onerror = erro; img.src = url; });
  const w = svg.width.baseVal.value, h = svg.height.baseVal.value, escala = 2;
  const cv = document.createElement("canvas");
  cv.width = w * escala; cv.height = h * escala;
  const ctx = cv.getContext("2d")!;
  ctx.scale(escala, escala); ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  cv.toBlob((b) => b && salvar(b, "png"), "image/png");
}
