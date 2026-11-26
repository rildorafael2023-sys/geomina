import { Alert, Badge, Button, Group, Loader, Paper, ScrollArea, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { api, dataCurta, ESTADOS_FICHA, type Eu, type FichaResumo, type Mina, type UnidadeResumo } from "../../api/cliente";
import { useDicionarios } from "../../api/dicionarios";
import { FichaEditor } from "./FichaEditor";
import { FichaImpressao } from "./FichaImpressao";

export function Mapeamento({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
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
  return (
    <Stack gap="sm">
      {!compacta && (
        <Paper withBorder p="sm">
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
            <Select label="Local (inclui o que está dentro)" clearable searchable value={f.unidade} onChange={(v) => setF({ ...f, unidade: v })}
              data={(unidades.data ?? []).map((u) => ({ value: u.id, label: `${u.codigo} (${u.tipo_nome})` }))} />
            <Select label="Situação" clearable value={f.estado} onChange={(v) => setF({ ...f, estado: v })}
              data={Object.entries(ESTADOS_FICHA).map(([v, e]) => ({ value: v, label: e.rotulo }))} />
            <Select label="Litologia" clearable searchable value={f.litologia} onChange={(v) => setF({ ...f, litologia: v })} data={dic.opcoes("LITOLOGIA", f.litologia)} />
            <TextInput type="date" label="De" value={f.de} onChange={(e) => setF({ ...f, de: e.currentTarget.value })} />
            <TextInput type="date" label="Até" value={f.ate} onChange={(e) => setF({ ...f, ate: e.currentTarget.value })} />
            <TextInput label="Número, descrição ou amostra" value={f.texto} onChange={(e) => setF({ ...f, texto: e.currentTarget.value })} />
          </SimpleGrid>
        </Paper>
      )}
      {fichas.isLoading ? (
        <Loader size="sm" />
      ) : !fichas.data?.length ? (
        <Text size="sm" c="dimmed">Nenhuma ficha encontrada.</Text>
      ) : (
        <ScrollArea>
          <Table striped highlightOnHover miw={640}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                <Table.Th>Ficha</Table.Th>
                <Table.Th>Local</Table.Th>
                <Table.Th>Litologias</Table.Th>
                <Table.Th>Med./Amostras</Table.Th>
                <Table.Th>Geólogo</Table.Th>
                <Table.Th>Situação</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {fichas.data.map((x) => (
                <Table.Tr key={x.id} style={{ cursor: "pointer" }} onClick={() => navegar(`/mapeamento/${x.id}`)}>
                  <Table.Td>{dataCurta(x.data)}</Table.Td>
                  <Table.Td fw={500}>{x.numero}</Table.Td>
                  <Table.Td>{x.unidade}</Table.Td>
                  <Table.Td>{x.litologias.join(", ")}</Table.Td>
                  <Table.Td>{x.medidas} / {x.amostras}</Table.Td>
                  <Table.Td>{x.geologo}</Table.Td>
                  <Table.Td><Badge variant="light" color={ESTADOS_FICHA[x.estado].cor}>{ESTADOS_FICHA[x.estado].rotulo}</Badge></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}

function Lista({ eu, mina }: { eu: Eu; mina: Mina }) {
  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={3}>Mapeamento geológico</Title>
          <Text size="sm" c="dimmed">Fichas digitais de mapeamento da {mina.nome}</Text>
        </div>
        <Group gap={6}>
          <Button variant="subtle" component={Link} to="/mapeamento/ficha-em-branco">Ficha em branco para imprimir</Button>
          {eu.permissoes.includes("mapeamento:editar") && <Button component={Link} to="/mapeamento/nova">Nova ficha</Button>}
        </Group>
      </Group>
      <ListaFichas mina={mina} />
    </Stack>
  );
}
