import { Alert, Badge, Button, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconClipboardText, IconPlus, IconPrinter, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { BarraFiltros, Carregando, Pagina, Painel, TabelaDados, Vazio } from "../../componentes/ui";
import { api, dataCurta, ESTADOS_FICHA, type Eu, type FichaResumo, type Mina, type UnidadeResumo } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { FichaEditor } from "./FichaEditor";
import { FichaImpressao } from "./FichaImpressao";

export function Mapeamento({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Carregando />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina e suas unidades em "Estrutura da mina" antes de mapear.</Alert>;
  return (
    <Routes>
      <Route index element={<Lista eu={eu} mina={mina} />} />
      <Route path="nova" element={<FichaEditor eu={eu} mina={mina} />} />
      <Route path="ficha-em-branco" element={<FichaImpressao mina={mina} />} />
      <Route path=":id" element={<EditorComId eu={eu} mina={mina} />} />
      <Route path=":id/imprimir" element={<ImpressaoComId mina={mina} />} />
    </Routes>
  );
}

function EditorComId({ eu, mina }: { eu: Eu; mina: Mina }) {
  const { id } = useParams();
  return <FichaEditor key={id} id={id} eu={eu} mina={mina} />;
}

function ImpressaoComId({ mina }: { mina: Mina }) {
  const { id } = useParams();
  return <FichaImpressao id={id} mina={mina} />;
}

/** Lista de fichas (também usada na aba "Mapeamentos" de uma unidade). */
export function ListaFichas({ mina, unidadeId, compacta = false }: { mina: Mina; unidadeId?: string; compacta?: boolean }) {
  const navegar = useNavigate();
  const dic = useDicionarios();
  const [f, setF] = useState({ estado: null as string | null, litologia: null as string | null, de: "", ate: "", texto: "", unidade: unidadeId ?? null });
  const unidades = useQuery({ queryKey: ["unidades", mina.id, true], queryFn: () => api<UnidadeResumo[]>(`/minas/${mina.id}/unidades?incluir_inativas=true`), enabled: !compacta });
  const p = new URLSearchParams();
  if (f.unidade) p.set("unidade_id", f.unidade);
  if (f.estado) p.set("estado", f.estado);
  if (f.litologia) p.set("litologia_id", f.litologia);
  if (f.de) p.set("de", f.de);
  if (f.ate) p.set("ate", f.ate);
  if (f.texto.trim()) p.set("texto", f.texto.trim());
  const fichas = useQuery({ queryKey: ["fichas", mina.id, p.toString()], queryFn: () => api<FichaResumo[]>(`/minas/${mina.id}/mapeamentos?${p}`) });
  const limpar = () => setF({ estado: null, litologia: null, de: "", ate: "", texto: "", unidade: unidadeId ?? null });
  const tabela = (
    <TabelaDados dados={fichas.data ?? []} chave={(x) => x.id} aoClicar={(x) => navegar(`/mapeamento/${x.id}`)} minLargura={720} alturaMax={compacta ? 360 : "calc(100vh - 250px)"}
      ordemInicial={{ chave: "data", desc: true }}
      vazio={fichas.isLoading ? <Carregando /> : <Vazio titulo="Nenhuma ficha encontrada." descricao={compacta ? undefined : "Mude os filtros ou crie uma nova ficha."} />}
      colunas={[
        { chave: "data", titulo: "Data", largura: 96, render: (x) => dataCurta(x.data), valor: (x) => x.data },
        { chave: "numero", titulo: "Ficha", fixa: true, render: (x) => <Text size="sm" fw={600} c="geo.8">{x.numero}</Text>, valor: (x) => x.numero },
        { chave: "unidade", titulo: "Local", valor: (x) => x.unidade },
        { chave: "litologias", titulo: "Litologias", valor: (x) => x.litologias.join(", ") },
        { chave: "medidas", titulo: "Medidas", numero: true, largura: 80, valor: (x) => x.medidas },
        { chave: "amostras", titulo: "Amostras", numero: true, largura: 80, valor: (x) => x.amostras },
        { chave: "geologo", titulo: "Geólogo", valor: (x) => x.geologo },
        { chave: "estado", titulo: "Situação", largura: 140, valor: (x) => ESTADOS_FICHA[x.estado].rotulo,
          render: (x) => <Badge color={ESTADOS_FICHA[x.estado].cor}>{ESTADOS_FICHA[x.estado].rotulo}</Badge> },
      ]} />
  );
  if (compacta) return tabela;
  return (
    <Stack gap={10}>
      <BarraFiltros aoLimpar={limpar} fim={<Text size="xs" c="dimmed">{fichas.data?.length ?? 0} ficha(s)</Text>}>
        <Select w={230} label="Local (inclui o que está dentro)" clearable searchable value={f.unidade} onChange={(v) => setF({ ...f, unidade: v })}
          data={(unidades.data ?? []).map((u) => ({ value: u.id, label: `${u.codigo} (${u.tipo_nome})` }))} />
        <Select w={170} label="Situação" clearable value={f.estado} onChange={(v) => setF({ ...f, estado: v })}
          data={Object.entries(ESTADOS_FICHA).map(([v, e]) => ({ value: v, label: e.rotulo }))} />
        <Select w={200} label="Litologia" clearable searchable value={f.litologia} onChange={(v) => setF({ ...f, litologia: v })} data={dic.opcoes("LITOLOGIA", f.litologia)} />
        <TextInput w={140} type="date" label="De" value={f.de} onChange={(e) => setF({ ...f, de: e.currentTarget.value })} />
        <TextInput w={140} type="date" label="Até" value={f.ate} onChange={(e) => setF({ ...f, ate: e.currentTarget.value })} />
        <TextInput w={220} label="Número, descrição ou amostra" leftSection={<IconSearch size={13} />} value={f.texto} onChange={(e) => setF({ ...f, texto: e.currentTarget.value })} />
      </BarraFiltros>
      <Painel p={0}>{tabela}</Painel>
    </Stack>
  );
}

function Lista({ eu, mina }: { eu: Eu; mina: Mina }) {
  return (
    <Pagina titulo="Mapeamento geológico" icone={<IconClipboardText size={20} />} subtitulo={`Fichas digitais de mapeamento da ${mina.nome}`}
      acoes={<>
        <Button variant="default" leftSection={<IconPrinter size={14} />} component={Link} to="/mapeamento/ficha-em-branco">Ficha em branco para imprimir</Button>
        {eu.permissoes.includes("mapeamento:editar") && <Button leftSection={<IconPlus size={14} />} component={Link} to="/mapeamento/nova">Nova ficha</Button>}
      </>}>
      <ListaFichas mina={mina} />
    </Pagina>
  );
}
