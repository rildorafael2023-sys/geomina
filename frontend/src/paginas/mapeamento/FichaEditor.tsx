import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Collapse,
  Grid,
  Group,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import {
  api,
  dataHora,
  ErroApi,
  ESTADOS_FICHA,
  json,
  type Eu,
  type Ficha,
  type Mina,
  type UnidadeResumo,
} from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { ColunaSecao, Estereograma } from "../../geologia/Graficos";
import { PainelDocumentos } from "../documentos/PainelDocumentos";

type Num = number | string;
interface IntervaloF {
  id?: string;
  de_m: Num;
  ate_m: Num;
  litologia_id: string | null;
  textura_id: string | null;
  granulacao: string;
  cor: string;
  alteracao_id: string | null;
  intensidade_id: string | null;
  mineralizacao_id: string | null;
  minerais: string;
  percentual: Num;
  contato_id: string | null;
  descricao: string;
  aberto?: boolean;
}
interface MedidaF {
  id?: string;
  tipo_id: string | null;
  convencao: string;
  valor_a: Num;
  valor_b: Num;
  familia: string;
  espessura_m: Num;
  preenchimento: string;
  movimento: string;
  intervalo_indice: string | null;
  observacao: string;
}
interface AmostraF {
  id?: string;
  codigo: string;
  tipo: string;
  de_m: Num;
  ate_m: Num;
  destino_id: string | null;
  leitura_campo: string;
  observacao: string;
  verificacao?: { codigo: string | null; sugestao: string | null; aviso: string | null };
}
interface Form {
  unidade_id: string | null;
  data: string;
  hora: string;
  acompanhantes: string;
  exposicao_id: string | null;
  distancia_m: Num;
  referencia: string;
  x: Num;
  y: Num;
  z: Num;
  azimute_eixo: Num;
  largura_m: Num;
  altura_m: Num;
  norte_referencia: string;
  declinacao: Num;
  descricao: string;
  agua_id: string | null;
  obs_geotecnicas: string;
  intervalos: IntervaloF[];
  medidas: MedidaF[];
  amostras: AmostraF[];
}

const hoje = () => new Date().toISOString().slice(0, 10);
const n = (v: Num) => (v === "" || v === null || v === undefined ? null : Number(v));
const s = (v: string) => (v.trim() ? v.trim() : null);
const vazioIntervalo = (de: Num = ""): IntervaloF => ({
  de_m: de, ate_m: "", litologia_id: null, textura_id: null, granulacao: "", cor: "", alteracao_id: null,
  intensidade_id: null, mineralizacao_id: null, minerais: "", percentual: "", contato_id: null, descricao: "", aberto: false,
});
const vaziaMedida = (): MedidaF => ({
  tipo_id: null, convencao: "dipdir_dip", valor_a: "", valor_b: "", familia: "", espessura_m: "", preenchimento: "",
  movimento: "", intervalo_indice: null, observacao: "",
});
const vaziaAmostra = (): AmostraF => ({ codigo: "", tipo: "", de_m: "", ate_m: "", destino_id: null, leitura_campo: "", observacao: "" });

function deFicha(f: Ficha): Form {
  const idx = new Map(f.intervalos.map((i, k) => [i.id, String(k)]));
  return {
    unidade_id: f.unidade_id, data: f.data, hora: f.hora ?? "", acompanhantes: f.acompanhantes ?? "",
    exposicao_id: f.exposicao_id, distancia_m: f.distancia_m ?? "", referencia: f.referencia ?? "", x: f.x ?? "",
    y: f.y ?? "", z: f.z ?? "", azimute_eixo: f.azimute_eixo ?? "", largura_m: f.largura_m ?? "",
    altura_m: f.altura_m ?? "", norte_referencia: f.norte_referencia, declinacao: f.declinacao ?? "",
    descricao: f.descricao ?? "", agua_id: f.agua_id, obs_geotecnicas: f.obs_geotecnicas ?? "",
    intervalos: f.intervalos.map((i) => ({
      ...i, granulacao: i.granulacao ?? "", cor: i.cor ?? "", minerais: i.minerais ?? "", percentual: i.percentual ?? "",
      descricao: i.descricao ?? "", aberto: false,
    })),
    medidas: f.medidas.map((m) => ({
      id: m.id, tipo_id: m.tipo_id, convencao: m.valor_digitado?.convencao ?? m.convencao,
      valor_a: m.valor_digitado?.a ?? (m.classe === "planar" ? m.dip_dir! : m.trend!),
      valor_b: m.valor_digitado?.b ?? (m.classe === "planar" ? m.dip! : m.plunge!), familia: m.familia ?? "",
      espessura_m: m.espessura_m ?? "", preenchimento: m.preenchimento ?? "", movimento: m.movimento ?? "",
      intervalo_indice: m.intervalo_id ? idx.get(m.intervalo_id) ?? null : null, observacao: m.observacao ?? "",
    })),
    amostras: f.amostras.map((a) => ({
      ...a, tipo: a.tipo ?? "", de_m: a.de_m ?? "", ate_m: a.ate_m ?? "", leitura_campo: a.leitura_campo ?? "",
      observacao: a.observacao ?? "",
    })),
  };
}

function paraApi(f: Form) {
  return {
    unidade_id: f.unidade_id, data: f.data, hora: s(f.hora), acompanhantes: s(f.acompanhantes), exposicao_id: f.exposicao_id,
    distancia_m: n(f.distancia_m), referencia: s(f.referencia), x: n(f.x), y: n(f.y), z: n(f.z),
    azimute_eixo: n(f.azimute_eixo), largura_m: n(f.largura_m), altura_m: n(f.altura_m),
    norte_referencia: f.norte_referencia, declinacao: n(f.declinacao), descricao: s(f.descricao), agua_id: f.agua_id,
    obs_geotecnicas: s(f.obs_geotecnicas),
    intervalos: f.intervalos.map((i) => ({
      id: i.id, de_m: n(i.de_m), ate_m: n(i.ate_m), litologia_id: i.litologia_id, textura_id: i.textura_id,
      granulacao: s(i.granulacao), cor: s(i.cor), alteracao_id: i.alteracao_id, intensidade_id: i.intensidade_id,
      mineralizacao_id: i.mineralizacao_id, minerais: s(i.minerais), percentual: n(i.percentual), contato_id: i.contato_id,
      descricao: s(i.descricao),
    })),
    medidas: f.medidas.map((m) => ({
      id: m.id, tipo_id: m.tipo_id, convencao: m.convencao, valor_a: n(m.valor_a), valor_b: n(m.valor_b),
      familia: s(m.familia), espessura_m: n(m.espessura_m), preenchimento: s(m.preenchimento), movimento: s(m.movimento),
      intervalo_indice: m.intervalo_indice === null ? null : Number(m.intervalo_indice), observacao: s(m.observacao),
    })),
    amostras: f.amostras.map((a) => ({
      id: a.id, codigo: a.codigo, tipo: s(a.tipo), de_m: n(a.de_m), ate_m: n(a.ate_m), destino_id: a.destino_id,
      leitura_campo: s(a.leitura_campo), observacao: s(a.observacao),
    })),
  };
}

export function FichaEditor({ id, eu, mina }: { id?: string; eu: Eu; mina: Mina }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const dic = useDicionarios();
  const ficha = useQuery({ queryKey: ["ficha", id], queryFn: () => api<Ficha>(`/mapeamentos/${id}`), enabled: !!id });
  const unidades = useQuery({ queryKey: ["unidades", mina.id, false], queryFn: () => api<UnidadeResumo[]>(`/minas/${mina.id}/unidades?incluir_inativas=false`) });
  const [f, setF] = useState<Form | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState<{ acao: string; titulo: string } | null>(null);
  const [textoMotivo, setTextoMotivo] = useState("");
  const [geotec, setGeotec] = useState(false);

  useEffect(() => {
    if (id && ficha.data) setF(deFicha(ficha.data));
    if (!id && !f) {
      setF({
        unidade_id: params.get("unidade"), data: hoje(), hora: "", acompanhantes: "", exposicao_id: null, distancia_m: "",
        referencia: "", x: "", y: "", z: "", azimute_eixo: "", largura_m: "", altura_m: "", norte_referencia: "magnetico",
        declinacao: mina.declinacao_magnetica ?? "", descricao: "", agua_id: null, obs_geotecnicas: "",
        intervalos: [vazioIntervalo(0)], medidas: [], amostras: [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ficha.data]);

  const editavel = !id || (ficha.data?.pode_editar ?? false);
  const salvar = useMutation({
    mutationFn: () =>
      id
        ? api<Ficha>(`/mapeamentos/${id}`, { method: "PUT", body: json({ ...paraApi(f!), versao: ficha.data!.versao }) })
        : api<Ficha>("/mapeamentos", { method: "POST", body: json(paraApi(f!)) }),
    onSuccess: (r) => {
      qc.setQueryData(["ficha", r.id], r);
      qc.invalidateQueries({ queryKey: ["fichas"] });
      notifications.show({ color: "teal", message: `Ficha ${r.numero} salva.` });
      if (!id) navegar(`/mapeamento/${r.id}`, { replace: true });
      else setF(deFicha(r));
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar a ficha."),
  });
  const transicao = useMutation({
    mutationFn: (p: { acao: string; motivo?: string }) =>
      api<Ficha>(`/mapeamentos/${id}/${p.acao}`, { method: "POST", body: p.motivo ? json({ motivo: p.motivo }) : undefined }),
    onSuccess: (r) => {
      qc.setQueryData(["ficha", r.id], r);
      qc.invalidateQueries({ queryKey: ["fichas"] });
      setF(deFicha(r));
      setMotivo(null);
      notifications.show({ color: "teal", message: `Ficha ${r.numero}: ${ESTADOS_FICHA[r.estado].rotulo.toLowerCase()}.` });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha na operação."),
  });

  const faixas = useMemo(
    () =>
      (f?.intervalos ?? [])
        .filter((i) => n(i.de_m) !== null && n(i.ate_m) !== null && i.litologia_id)
        .map((i) => {
          const t = dic.porId.get(i.litologia_id!);
          return { de: Number(i.de_m), ate: Number(i.ate_m), cor: t?.cor ?? "#ccc", sigla: t?.sigla ?? t?.nome ?? "" };
        }),
    [f?.intervalos, dic.porId],
  );
  const medidasPlot = useMemo(
    () =>
      (f?.medidas ?? []).flatMap((m) => {
        const t = m.tipo_id ? dic.porId.get(m.tipo_id) : undefined;
        const a = n(m.valor_a);
        const b = n(m.valor_b);
        if (!t || a === null || b === null || b < 0 || b > 90) return [];
        const dd = m.convencao === "strike_rhr_dip" ? (a + 90) % 360 : a;
        const cor = t.codigo.startsWith("S") ? "#1c7ed6" : t.codigo === "FRATURA" ? "#e8590c" : t.classe === "linear" ? "#2f9e44" : "#862e9c";
        return [{ classe: t.classe ?? "planar", dip_dir: t.classe === "planar" ? dd : null, dip: t.classe === "planar" ? b : null,
          trend: t.classe === "linear" ? a : null, plunge: t.classe === "linear" ? b : null,
          rotulo: `${t.sigla ?? t.nome} ${a}/${b}${m.familia ? " " + m.familia : ""}`, cor }];
      }),
    [f?.medidas, dic.porId],
  );

  if ((id && ficha.isLoading) || dic.isLoading || !f) return <Loader />;
  if (id && ficha.error) return <Alert color="red">Ficha não encontrada.</Alert>;
  const d = ficha.data;
  const up = (p: Partial<Form>) => setF({ ...f, ...p });
  const upI = (k: number, p: Partial<IntervaloF>) => up({ intervalos: f.intervalos.map((x, i) => (i === k ? { ...x, ...p } : x)) });
  const upM = (k: number, p: Partial<MedidaF>) => up({ medidas: f.medidas.map((x, i) => (i === k ? { ...x, ...p } : x)) });
  const upA = (k: number, p: Partial<AmostraF>) => up({ amostras: f.amostras.map((x, i) => (i === k ? { ...x, ...p } : x)) });
  const ro = !editavel;
  const opcoesUnidades = (unidades.data ?? []).map((u) => ({ value: u.id, label: `${u.codigo}${u.nome !== u.codigo ? " — " + u.nome : ""} (${u.tipo_nome})` }));
  if (d && !opcoesUnidades.some((o) => o.value === d.unidade_id)) opcoesUnidades.push({ value: d.unidade_id, label: d.unidade });
  const opcoesIntervalos = f.intervalos.map((i, k) => ({ value: String(k), label: `${k + 1}: ${i.de_m}–${i.ate_m} m` }));

  async function verificarCodigo(k: number) {
    const c = f!.amostras[k].codigo;
    if (!c.trim()) return;
    const v = await api<{ codigo: string | null; sugestao: string | null; aviso: string | null }>(
      `/codigos-amostra/verificar?codigo=${encodeURIComponent(c)}`,
    ).catch(() => undefined);
    if (v) upA(k, v.codigo ? { codigo: v.codigo, verificacao: v } : { verificacao: v });
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="xs">
            <Title order={3}>{d ? `Ficha ${d.numero}` : "Nova ficha de mapeamento"}</Title>
            {d && <Badge color={ESTADOS_FICHA[d.estado].cor}>{ESTADOS_FICHA[d.estado].rotulo}</Badge>}
            {d && d.revisao > 0 && <Badge variant="outline">revisão {d.revisao}</Badge>}
          </Group>
          {d && (
            <Text size="sm" c="dimmed">
              {d.geologo} · {d.unidade_caminho.join(" › ")} {d.revisado_por && `· revisada por ${d.revisado_por} em ${dataHora(d.revisado_em!)}`}
            </Text>
          )}
        </div>
        <Group gap={6} className="nao-imprimir">
          <Button variant="subtle" component={Link} to="/mapeamento">Voltar à lista</Button>
          {d && <Button variant="light" component={Link} to={`/mapeamento/${d.id}/imprimir`}>Imprimir / PDF</Button>}
        </Group>
      </Group>

      {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}
      {d?.motivo && d.estado !== "aprovado" && (
        <Alert color={d.estado === "cancelado" ? "red" : "yellow"} title={d.estado === "cancelado" ? "Motivo do cancelamento" : "Observação do revisor"}>
          {d.motivo}
        </Alert>
      )}
      {d && d.avisos.length > 0 && (
        <Alert color="yellow" title="Avisos">
          {d.avisos.map((a, i) => <div key={i}>• {a}</div>)}
        </Alert>
      )}

      <Grid>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack>
            <Secao titulo="A. Identificação">
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                <Select label="Local (unidade da mina)" required searchable data={opcoesUnidades} value={f.unidade_id} onChange={(v) => up({ unidade_id: v })} readOnly={ro} />
                <TextInput type="date" label="Data" required value={f.data} onChange={(e) => up({ data: e.currentTarget.value })} readOnly={ro} />
                <TextInput type="time" label="Hora" value={f.hora} onChange={(e) => up({ hora: e.currentTarget.value })} readOnly={ro} />
                <Select label="Exposição mapeada" data={dic.opcoes("EXPOSICAO", f.exposicao_id)} value={f.exposicao_id} onChange={(v) => up({ exposicao_id: v })} readOnly={ro} clearable />
                <NumberInput label="Distância (m)" decimalSeparator="," min={0} value={f.distancia_m} onChange={(v) => up({ distancia_m: v })} readOnly={ro} />
                <TextInput label="Medida a partir de" placeholder="ex.: entrada da travessa" value={f.referencia} onChange={(e) => up({ referencia: e.currentTarget.value })} readOnly={ro} />
                <NumberInput label="Altura da seção (m)" decimalSeparator="," min={0} value={f.altura_m} onChange={(v) => up({ altura_m: v })} readOnly={ro} />
                <NumberInput label="Largura da seção (m)" decimalSeparator="," min={0} value={f.largura_m} onChange={(v) => up({ largura_m: v })} readOnly={ro} />
                <NumberInput label="Azimute do eixo da galeria (°)" min={0} max={359.9} value={f.azimute_eixo} onChange={(v) => up({ azimute_eixo: v })} readOnly={ro} />
                <NumberInput label="X (opcional)" decimalSeparator="," value={f.x} onChange={(v) => up({ x: v })} readOnly={ro} />
                <NumberInput label="Y (opcional)" decimalSeparator="," value={f.y} onChange={(v) => up({ y: v })} readOnly={ro} />
                <NumberInput label="Z / cota (opcional)" decimalSeparator="," value={f.z} onChange={(v) => up({ z: v })} readOnly={ro} />
                <TextInput label="Acompanhantes" value={f.acompanhantes} onChange={(e) => up({ acompanhantes: e.currentTarget.value })} readOnly={ro} />
              </SimpleGrid>
              <Text size="xs" c="dimmed" mt={4}>Coordenadas em {d?.crs ?? mina.crs_nome}. Deixe em branco se não foram medidas.</Text>
            </Secao>

            <Secao titulo="B. Seção mapeada (intervalos do piso para o teto)">
              <Stack gap="xs">
                {f.intervalos.map((i, k) => (
                  <Paper key={k} withBorder p="xs" style={{ borderLeft: `6px solid ${(i.litologia_id && dic.porId.get(i.litologia_id)?.cor) || "#ccc"}` }}>
                    <Grid gutter="xs" align="flex-end">
                      <Grid.Col span={{ base: 6, sm: 2 }}>
                        <NumberInput label={`${k + 1}. De (m)`} decimalSeparator="," min={0} value={i.de_m} onChange={(v) => upI(k, { de_m: v })} readOnly={ro} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, sm: 2 }}>
                        <NumberInput label="Até (m)" decimalSeparator="," min={0} value={i.ate_m} onChange={(v) => upI(k, { ate_m: v })} readOnly={ro} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select label="Litologia" required searchable data={dic.opcoes("LITOLOGIA", i.litologia_id)} value={i.litologia_id} onChange={(v) => upI(k, { litologia_id: v })} readOnly={ro} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 8, sm: 3 }}>
                        <Select label="Contato com o seguinte" data={dic.opcoes("CONTATO", i.contato_id)} value={i.contato_id} onChange={(v) => upI(k, { contato_id: v })} readOnly={ro} clearable />
                      </Grid.Col>
                      <Grid.Col span={{ base: 4, sm: 1 }}>
                        {!ro && (
                          <ActionIcon variant="subtle" color="red" aria-label={`Remover intervalo ${k + 1}`} onClick={() => up({ intervalos: f.intervalos.filter((_, x) => x !== k) })}>✕</ActionIcon>
                        )}
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select label="Alteração" data={dic.opcoes("ALTERACAO", i.alteracao_id)} value={i.alteracao_id} onChange={(v) => upI(k, { alteracao_id: v })} readOnly={ro} clearable />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 3 }}>
                        <Select label="Intensidade" data={dic.opcoes("INTENSIDADE", i.intensidade_id)} value={i.intensidade_id} onChange={(v) => upI(k, { intensidade_id: v })} readOnly={ro} clearable />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 5 }}>
                        <Select label="Mineralização (estilo)" data={dic.opcoes("MINERALIZACAO", i.mineralizacao_id)} value={i.mineralizacao_id} onChange={(v) => upI(k, { mineralizacao_id: v })} readOnly={ro} clearable />
                      </Grid.Col>
                      <Grid.Col span={12}>
                        <Textarea label="Descrição" autosize minRows={1} value={i.descricao} onChange={(e) => upI(k, { descricao: e.currentTarget.value })} readOnly={ro} />
                      </Grid.Col>
                    </Grid>
                    <Button size="compact-xs" variant="subtle" mt={4} onClick={() => upI(k, { aberto: !i.aberto })}>
                      {i.aberto ? "menos campos" : "textura, granulação, cor, minerais, %"}
                    </Button>
                    <Collapse in={!!i.aberto}>
                      <SimpleGrid cols={{ base: 1, sm: 3 }} mt="xs">
                        <Select label="Textura / estrutura" data={dic.opcoes("TEXTURA", i.textura_id)} value={i.textura_id} onChange={(v) => upI(k, { textura_id: v })} readOnly={ro} clearable />
                        <TextInput label="Granulação" value={i.granulacao} onChange={(e) => upI(k, { granulacao: e.currentTarget.value })} readOnly={ro} />
                        <TextInput label="Cor" value={i.cor} onChange={(e) => upI(k, { cor: e.currentTarget.value })} readOnly={ro} />
                        <TextInput label="Minerais (mineralização)" placeholder="ex.: esmeralda, berilo" value={i.minerais} onChange={(e) => upI(k, { minerais: e.currentTarget.value })} readOnly={ro} />
                        <NumberInput label="% visual estimado" min={0} max={100} value={i.percentual} onChange={(v) => upI(k, { percentual: v })} readOnly={ro} />
                      </SimpleGrid>
                    </Collapse>
                  </Paper>
                ))}
                {!ro && (
                  <Button variant="light" onClick={() => up({ intervalos: [...f.intervalos, vazioIntervalo(f.intervalos.at(-1)?.ate_m ?? 0)] })}>
                    + Intervalo
                  </Button>
                )}
              </Stack>
            </Secao>

            <Secao titulo="C. Medidas estruturais">
              <Stack gap="xs">
                {f.medidas.map((m, k) => {
                  const t = m.tipo_id ? dic.porId.get(m.tipo_id) : undefined;
                  const linear = t?.classe === "linear";
                  return (
                    <Paper key={k} withBorder p="xs">
                      <Grid gutter="xs" align="flex-end">
                        <Grid.Col span={{ base: 12, sm: 3 }}>
                          <Select label={`${k + 1}. Estrutura`} searchable data={dic.opcoes("TIPO_ESTRUTURA", m.tipo_id)} value={m.tipo_id} readOnly={ro}
                            onChange={(v) => {
                              const c = v ? dic.porId.get(v)?.classe : null;
                              upM(k, { tipo_id: v, convencao: c === "linear" ? "trend_plunge" : m.convencao === "trend_plunge" ? "dipdir_dip" : m.convencao });
                            }} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 3 }}>
                          {linear ? (
                            <TextInput label="Convenção" value="Rumo/caimento" readOnly />
                          ) : (
                            <Select label="Convenção" readOnly={ro} allowDeselect={false} value={m.convencao} onChange={(v) => upM(k, { convencao: v ?? "dipdir_dip" })}
                              data={[{ value: "dipdir_dip", label: "Dir. mergulho / mergulho" }, { value: "strike_rhr_dip", label: "Rumo (mão direita) / mergulho" }]} />
                          )}
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, sm: 2 }}>
                          <NumberInput label={linear ? "Rumo (°)" : m.convencao === "strike_rhr_dip" ? "Rumo (°)" : "Dir. merg. (°)"} min={0} max={360} value={m.valor_a} onChange={(v) => upM(k, { valor_a: v })} readOnly={ro} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, sm: 2 }}>
                          <NumberInput label={linear ? "Caimento (°)" : "Mergulho (°)"} min={0} max={90} value={m.valor_b} onChange={(v) => upM(k, { valor_b: v })} readOnly={ro} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 8, sm: 1 }}>
                          <TextInput label="Família" placeholder="FR-I" value={m.familia} onChange={(e) => upM(k, { familia: e.currentTarget.value })} readOnly={ro} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 4, sm: 1 }}>
                          {!ro && <ActionIcon variant="subtle" color="red" aria-label={`Remover medida ${k + 1}`} onClick={() => up({ medidas: f.medidas.filter((_, x) => x !== k) })}>✕</ActionIcon>}
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 3 }}>
                          <Select label="Intervalo" clearable data={opcoesIntervalos} value={m.intervalo_indice} onChange={(v) => upM(k, { intervalo_indice: v })} readOnly={ro} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, sm: 2 }}>
                          <NumberInput label="Espessura (m)" decimalSeparator="," min={0} value={m.espessura_m} onChange={(v) => upM(k, { espessura_m: v })} readOnly={ro} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, sm: 3 }}>
                          <TextInput label="Preenchimento" value={m.preenchimento} onChange={(e) => upM(k, { preenchimento: e.currentTarget.value })} readOnly={ro} />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput label="Movimento / observação" value={m.observacao} onChange={(e) => upM(k, { observacao: e.currentTarget.value })} readOnly={ro} />
                        </Grid.Col>
                      </Grid>
                    </Paper>
                  );
                })}
                {!ro && <Button variant="light" onClick={() => up({ medidas: [...f.medidas, vaziaMedida()] })}>+ Medida</Button>}
                <Text size="xs" c="dimmed">
                  Norte de referência das medidas: {f.norte_referencia === "magnetico" ? "magnético" : f.norte_referencia === "quadricula" ? "da quadrícula" : "verdadeiro"}
                  {n(f.declinacao) !== null ? ` · declinação ${f.declinacao}°` : ""} — os valores são guardados como medidos (sem correção automática).
                </Text>
                {!ro && (
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Select label="Norte de referência" allowDeselect={false} value={f.norte_referencia} onChange={(v) => up({ norte_referencia: v ?? "magnetico" })}
                      data={[{ value: "magnetico", label: "Magnético (bússola)" }, { value: "quadricula", label: "Quadrícula (UTM)" }, { value: "verdadeiro", label: "Verdadeiro" }]} />
                    <NumberInput label="Declinação magnética (°)" decimalSeparator="," value={f.declinacao} onChange={(v) => up({ declinacao: v })} />
                  </SimpleGrid>
                )}
              </Stack>
            </Secao>

            <Secao titulo="D. Amostras coletadas">
              <Stack gap="xs">
                {f.amostras.map((a, k) => (
                  <Paper key={k} withBorder p="xs">
                    <Grid gutter="xs" align="flex-end">
                      <Grid.Col span={{ base: 12, sm: 3 }}>
                        <TextInput label={`${k + 1}. Código`} placeholder="BS-RP-474A" value={a.codigo} readOnly={ro}
                          onChange={(e) => upA(k, { codigo: e.currentTarget.value, verificacao: undefined })} onBlur={() => verificarCodigo(k)}
                          error={a.verificacao && !a.verificacao.codigo ? a.verificacao.aviso : undefined} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, sm: 2 }}>
                        <NumberInput label="De (m)" decimalSeparator="," min={0} value={a.de_m} onChange={(v) => upA(k, { de_m: v })} readOnly={ro} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 6, sm: 2 }}>
                        <NumberInput label="Até (m)" decimalSeparator="," min={0} value={a.ate_m} onChange={(v) => upA(k, { ate_m: v })} readOnly={ro} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select label="Destino" data={dic.opcoes("DESTINO_AMOSTRA", a.destino_id)} value={a.destino_id} onChange={(v) => upA(k, { destino_id: v })} readOnly={ro} clearable />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 1 }}>
                        {!ro && <ActionIcon variant="subtle" color="red" aria-label={`Remover amostra ${k + 1}`} onClick={() => up({ amostras: f.amostras.filter((_, x) => x !== k) })}>✕</ActionIcon>}
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 3 }}>
                        <TextInput label="Tipo" placeholder="canal, chip, rocha…" value={a.tipo} onChange={(e) => upA(k, { tipo: e.currentTarget.value })} readOnly={ro} />
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, sm: 9 }}>
                        <TextInput label="Leitura de campo (não laboratorial)" placeholder="ex.: XRF portátil Be 40 ppm" value={a.leitura_campo} onChange={(e) => upA(k, { leitura_campo: e.currentTarget.value })} readOnly={ro} />
                      </Grid.Col>
                    </Grid>
                    {a.verificacao?.sugestao && !ro && (
                      <Button size="compact-xs" variant="light" mt={4} onClick={() => upA(k, { codigo: a.verificacao!.sugestao!, verificacao: undefined })}>
                        Usar {a.verificacao.sugestao}
                      </Button>
                    )}
                  </Paper>
                ))}
                {!ro && <Button variant="light" onClick={() => up({ amostras: [...f.amostras, vaziaAmostra()] })}>+ Amostra</Button>}
                <Text size="xs" c="dimmed">Os resultados de laboratório aparecerão aqui quando os laudos forem importados (Etapa 9).</Text>
              </Stack>
            </Secao>

            <Secao titulo="E. Croqui e fotos">
              {d ? (
                <PainelDocumentos minaId={mina.id} mapeamentoId={d.id} podeEnviar={eu.permissoes.includes("arquivo:enviar") && d.estado !== "cancelado"} compacto />
              ) : (
                <Text size="sm" c="dimmed">Crie a ficha (rascunho) para anexar croquis e fotos.</Text>
              )}
            </Secao>

            <Secao titulo="F. Descrição e interpretação">
              <Stack gap="xs">
                <Textarea label="Descrição / interpretação" autosize minRows={3} value={f.descricao} onChange={(e) => up({ descricao: e.currentTarget.value })} readOnly={ro} />
                <Select label="Água" data={dic.opcoes("AGUA", f.agua_id)} value={f.agua_id} onChange={(v) => up({ agua_id: v })} readOnly={ro} clearable maw={300} />
                <Button size="compact-xs" variant="subtle" onClick={() => setGeotec(!geotec)} w="fit-content">
                  {geotec ? "ocultar observações geotécnicas" : "observações geotécnicas (opcional)"}
                </Button>
                <Collapse in={geotec || !!f.obs_geotecnicas}>
                  <Textarea autosize minRows={2} value={f.obs_geotecnicas} onChange={(e) => up({ obs_geotecnicas: e.currentTarget.value })} readOnly={ro} />
                </Collapse>
              </Stack>
            </Secao>
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack style={{ position: "sticky", top: 70 }}>
            <Paper withBorder p="sm">
              <Text fw={600} size="sm" mb={4}>Coluna da seção</Text>
              <ColunaSecao faixas={faixas} altura={n(f.altura_m)} />
            </Paper>
            <Paper withBorder p="sm">
              <Text fw={600} size="sm" mb={4}>Estereograma (Schmidt, hemisfério inferior)</Text>
              <Estereograma medidas={medidasPlot} />
              <Text size="xs" c="dimmed">● polos e grandes círculos de planos · ▲ lineações</Text>
            </Paper>
            <Paper withBorder p="sm" className="nao-imprimir">
              <Stack gap="xs">
                {editavel && (
                  <Button loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>
                    {id ? "Salvar alterações" : "Criar ficha (rascunho)"}
                  </Button>
                )}
                {d?.estado === "rascunho" && d.pode_editar && (
                  <Button variant="light" color="yellow" onClick={() => { setErro(null); transicao.mutate({ acao: "submeter" }); }}>
                    Submeter para revisão
                  </Button>
                )}
                {d?.estado === "submetido" && d.pode_aprovar && (
                  <>
                    <Button color="teal" onClick={() => { setErro(null); transicao.mutate({ acao: "aprovar" }); }}>Aprovar</Button>
                    <Button variant="light" onClick={() => { setTextoMotivo(""); setMotivo({ acao: "devolver", titulo: "Devolver ao autor" }); }}>Devolver ao autor</Button>
                  </>
                )}
                {d?.estado === "aprovado" && d.pode_aprovar && (
                  <Button variant="light" onClick={() => { setTextoMotivo(""); setMotivo({ acao: "reabrir", titulo: "Reabrir para correção" }); }}>
                    Reabrir para correção
                  </Button>
                )}
                {d && d.estado !== "cancelado" && (d.pode_editar || d.pode_aprovar || d.geologo_id === eu.id) && (
                  <Button variant="subtle" color="red" onClick={() => { setTextoMotivo(""); setMotivo({ acao: "cancelar", titulo: "Cancelar ficha" }); }}>
                    Cancelar ficha
                  </Button>
                )}
                {d && (
                  <Text size="xs" c="dimmed">
                    {d.estado === "aprovado"
                      ? "Ficha aprovada: não pode ser alterada. Uma correção exige reabrir (a versão aprovada fica guardada)."
                      : d.estado === "submetido"
                        ? "Aguardando revisão: a ficha fica bloqueada até ser aprovada ou devolvida."
                        : d.estado === "rascunho"
                          ? "Rascunho: pode ser editado pelo autor."
                          : "Ficha cancelada (mantida para rastreabilidade)."}
                  </Text>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal opened={motivo !== null} onClose={() => setMotivo(null)} title={motivo?.titulo}>
        <Stack>
          {erro && <Alert color="red">{erro}</Alert>}
          <Textarea label="Motivo" autosize minRows={3} value={textoMotivo} onChange={(e) => setTextoMotivo(e.currentTarget.value)} />
          <Button disabled={textoMotivo.trim().length < 3} onClick={() => { setErro(null); transicao.mutate({ acao: motivo!.acao, motivo: textoMotivo.trim() }); }}>
            Confirmar
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Paper withBorder p="md">
      <Text fw={700} mb="sm">{titulo}</Text>
      {children}
    </Paper>
  );
}
