import {
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Button,
  Group,
  Loader,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  api,
  dataHora,
  ErroApi,
  json,
  type Eu,
  type EventoHistorico,
  type Mina,
  type StatusUnidade,
  type TipoUnidade,
  type UnidadeDetalhe,
  type UnidadeResumo,
} from "../../api/cliente";
import { Avancos } from "./Avancos";
import { FormUnidade } from "./FormUnidade";

interface Props {
  id: string;
  mina: Mina;
  tipos: TipoUnidade[];
  todas: UnidadeResumo[];
  eu: Eu;
  aoSelecionar: (id: string | null) => void;
}

const STATUS = [
  { value: "ativa", label: "Ativa" },
  { value: "paralisada", label: "Paralisada" },
  { value: "encerrada", label: "Encerrada" },
];

export function DetalheUnidade({ id, mina, tipos, todas, eu, aoSelecionar }: Props) {
  const qc = useQueryClient();
  const podeEditar = eu.permissoes.includes("estrutura:editar");
  const u = useQuery({ queryKey: ["unidade", id], queryFn: () => api<UnidadeDetalhe>(`/unidades/${id}`) });
  const [modal, setModal] = useState<"editar" | "nova" | "mover" | "niveis" | "excluir" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["unidades"] });
    qc.invalidateQueries({ queryKey: ["unidade"] });
    qc.invalidateQueries({ queryKey: ["historico", id] });
  };
  const acao = useMutation({
    mutationFn: (p: { caminho: string; metodo: string; corpo?: unknown }) =>
      api(p.caminho, { method: p.metodo, body: p.corpo === undefined ? undefined : json(p.corpo) }),
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha na operação."),
  });
  const executar = (caminho: string, metodo: string, corpo: unknown, msg: string, depois?: () => void) => {
    setErro(null);
    acao.mutate(
      { caminho, metodo, corpo },
      {
        onSuccess: () => {
          recarregar();
          setModal(null);
          notifications.show({ color: "teal", message: msg });
          depois?.();
        },
      },
    );
  };

  if (u.isLoading) return <Loader />;
  if (u.error || !u.data) return <Alert color="red">Unidade não encontrada.</Alert>;
  const d = u.data;
  const tipo = tipos.find((t) => t.codigo === d.tipo);
  const niveis = todas.filter((x) => tipos.find((t) => t.codigo === x.tipo)?.e_nivel);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Breadcrumbs separator="›" style={{ flexWrap: "wrap" }}>
          {d.caminho_nomes.map((n, i) => (
            <Text key={i} size="xs" c="dimmed">
              {n}
            </Text>
          ))}
        </Breadcrumbs>
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs">
              <Badge color={tipo?.cor ?? "gray"}>{d.tipo_nome}</Badge>
              {d.status !== "ativa" && <Badge variant="outline">{d.status}</Badge>}
              {!d.ativo && <Badge color="gray">inativa</Badge>}
            </Group>
            <Title order={4} mt={4}>
              {d.codigo}
              {d.nome !== d.codigo ? ` — ${d.nome}` : ""}
            </Title>
          </div>
          {podeEditar && (
            <Group gap={6}>
              <Button size="xs" variant="light" onClick={() => setModal("editar")}>
                Editar
              </Button>
              {d.ativo && (tipo?.filhos_permitidos.length ?? 0) > 0 && (
                <Button size="xs" onClick={() => setModal("nova")}>
                  Nova unidade dentro
                </Button>
              )}
              <Button size="xs" variant="subtle" onClick={() => setModal("mover")}>
                Mover
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color={d.ativo ? "orange" : "teal"}
                onClick={() =>
                  executar(`/unidades/${d.id}`, "PATCH", { versao: d.versao, ativo: !d.ativo }, d.ativo ? "Unidade inativada." : "Unidade reativada.")
                }
              >
                {d.ativo ? "Inativar" : "Reativar"}
              </Button>
              <Button size="xs" variant="subtle" color="red" onClick={() => setModal("excluir")}>
                Excluir
              </Button>
            </Group>
          )}
        </Group>
        {erro && (
          <Alert color="red" withCloseButton onClose={() => setErro(null)}>
            {erro}
          </Alert>
        )}

        <Tabs defaultValue={tipo?.e_frente ? "avancos" : "dados"} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="dados">Dados</Tabs.Tab>
            {tipo?.e_frente && <Tabs.Tab value="avancos">Avanços</Tabs.Tab>}
            <Tabs.Tab value="historico">Histórico</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="dados" pt="sm">
            <Table>
              <Table.Tbody>
                <Linha r="Situação" v={STATUS.find((s) => s.value === d.status)?.label} />
                {d.cota_referencia !== null && <Linha r="Cota de referência" v={`${d.cota_referencia.toLocaleString("pt-BR")} m`} />}
                <Linha r="Unidades internas" v={String(d.filhos)} />
                {tipo?.multinivel && (
                  <Table.Tr>
                    <Table.Td fw={500}>Níveis</Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        {d.niveis.length ? d.niveis.map((n) => (
                          <Anchor key={n.id} size="sm" onClick={() => aoSelecionar(n.id)}>
                            {n.codigo}
                          </Anchor>
                        )) : <Text size="sm" c="dimmed">nenhum</Text>}
                        {podeEditar && (
                          <Button size="compact-xs" variant="subtle" onClick={() => setModal("niveis")}>
                            alterar
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )}
                <Linha r="Descrição" v={d.descricao ?? "—"} />
                <Linha r="Cadastrada em" v={dataHora(d.criado_em)} />
                {d.atualizado_em && <Linha r="Última alteração" v={dataHora(d.atualizado_em)} />}
              </Table.Tbody>
            </Table>
          </Tabs.Panel>
          {tipo?.e_frente && (
            <Tabs.Panel value="avancos" pt="sm">
              <Avancos frenteId={d.id} mina={mina} podeRegistrar={eu.permissoes.includes("avanco:registrar")} />
            </Tabs.Panel>
          )}
          <Tabs.Panel value="historico" pt="sm">
            <Historico id={d.id} />
          </Tabs.Panel>
        </Tabs>
      </Stack>

      <FormUnidade
        aberto={modal === "nova"}
        aoFechar={() => setModal(null)}
        mina={mina}
        tipos={tipos}
        tiposPermitidos={tipo?.filhos_permitidos ?? []}
        pai={d}
        niveisDisponiveis={niveis}
        aoCriar={(nid) => aoSelecionar(nid)}
      />
      <EditarUnidade d={d} aberto={modal === "editar"} aoFechar={() => setModal(null)} aoSalvar={(corpo) => executar(`/unidades/${d.id}`, "PATCH", corpo, "Unidade atualizada.")} erro={erro} />
      <MoverUnidade d={d} aberto={modal === "mover"} aoFechar={() => setModal(null)} tipos={tipos} todas={todas} erro={erro}
        aoMover={(novo) => executar(`/unidades/${d.id}/mover`, "POST", { versao: d.versao, novo_pai_id: novo }, "Unidade movida.")} />
      <Modal opened={modal === "niveis"} onClose={() => setModal(null)} title={`Níveis de ${d.codigo}`}>
        <NiveisForm d={d} niveis={niveis} erro={erro} aoSalvar={(ids) => executar(`/unidades/${d.id}/niveis`, "PUT", { niveis: ids }, "Níveis atualizados.")} />
      </Modal>
      <Modal opened={modal === "excluir"} onClose={() => setModal(null)} title="Excluir unidade">
        <Stack>
          {erro && <Alert color="red">{erro}</Alert>}
          <Text size="sm">
            A exclusão é só para cadastros feitos por engano e é recusada se a unidade tiver unidades internas ou registros
            vinculados (nesse caso, use "Inativar"). A exclusão fica registrada no histórico de auditoria.
          </Text>
          <Button color="red" onClick={() => executar(`/unidades/${d.id}`, "DELETE", undefined, "Unidade excluída.", () => aoSelecionar(null))}>
            Excluir {d.codigo}
          </Button>
        </Stack>
      </Modal>
    </Paper>
  );
}

function Linha({ r, v }: { r: string; v?: string }) {
  return (
    <Table.Tr>
      <Table.Td fw={500} w="35%">
        {r}
      </Table.Td>
      <Table.Td style={{ whiteSpace: "pre-wrap" }}>{v}</Table.Td>
    </Table.Tr>
  );
}

function EditarUnidade({ d, aberto, aoFechar, aoSalvar, erro }: { d: UnidadeDetalhe; aberto: boolean; aoFechar: () => void; aoSalvar: (c: unknown) => void; erro: string | null }) {
  const [f, setF] = useState({ codigo: d.codigo, nome: d.nome, status: d.status as StatusUnidade, cota: (d.cota_referencia ?? "") as number | string, descricao: d.descricao ?? "" });
  return (
    <Modal opened={aberto} onClose={aoFechar} title={`Editar ${d.codigo}`}>
      <Stack>
        {erro && <Alert color="red">{erro}</Alert>}
        <TextInput label="Código" value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.currentTarget.value })} />
        <TextInput label="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} />
        <Select label="Situação" data={STATUS} value={f.status} onChange={(v) => setF({ ...f, status: (v ?? "ativa") as StatusUnidade })} allowDeselect={false} />
        <NumberInput label="Cota de referência (m)" decimalSeparator="," value={f.cota} onChange={(v) => setF({ ...f, cota: v })} />
        <Textarea label="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.currentTarget.value })} />
        <Button
          onClick={() =>
            aoSalvar({ versao: d.versao, codigo: f.codigo, nome: f.nome, status: f.status, cota_referencia: f.cota === "" ? null : Number(f.cota), descricao: f.descricao || null })
          }
        >
          Salvar
        </Button>
      </Stack>
    </Modal>
  );
}

function MoverUnidade({ d, aberto, aoFechar, tipos, todas, aoMover, erro }: { d: UnidadeDetalhe; aberto: boolean; aoFechar: () => void; tipos: TipoUnidade[]; todas: UnidadeResumo[]; aoMover: (id: string | null) => void; erro: string | null }) {
  const [destino, setDestino] = useState<string | null>(null);
  // Destinos possíveis: unidades ativas cujo tipo admite este tipo, fora da própria sub-árvore.
  const porId = new Map(todas.map((x) => [x.id, x]));
  const dentroDeMim = (x: UnidadeResumo) => {
    for (let a: UnidadeResumo | undefined = x; a; a = a.pai_id ? porId.get(a.pai_id) : undefined) if (a.id === d.id) return true;
    return false;
  };
  const admite = new Set(tipos.filter((t) => t.filhos_permitidos.includes(d.tipo)).map((t) => t.codigo));
  const opcoes = todas.filter((x) => x.ativo && admite.has(x.tipo) && !dentroDeMim(x) && x.id !== d.pai_id);
  const podeRaiz = tipos.find((t) => t.codigo === d.tipo)?.pode_ser_raiz && d.pai_id !== null;
  const dados = [
    ...(podeRaiz ? [{ value: "__raiz__", label: "(raiz da mina)" }] : []),
    ...opcoes.map((x) => ({ value: x.id, label: `${x.tipo_nome} ${x.codigo}${x.nome !== x.codigo ? " — " + x.nome : ""}` })),
  ];
  return (
    <Modal opened={aberto} onClose={aoFechar} title={`Mover ${d.codigo}`}>
      <Stack>
        {erro && <Alert color="red">{erro}</Alert>}
        <Text size="sm" c="dimmed">
          As unidades internas acompanham a mudança. Só aparecem destinos permitidos pelas regras de hierarquia.
        </Text>
        <Select label="Novo local" data={dados} value={destino} onChange={setDestino} searchable nothingFoundMessage="Nenhum destino permitido" />
        <Button disabled={!destino} onClick={() => aoMover(destino === "__raiz__" ? null : destino)}>
          Mover
        </Button>
      </Stack>
    </Modal>
  );
}

function NiveisForm({ d, niveis, aoSalvar, erro }: { d: UnidadeDetalhe; niveis: UnidadeResumo[]; aoSalvar: (ids: string[]) => void; erro: string | null }) {
  const [sel, setSel] = useState(d.niveis.map((n) => n.id));
  return (
    <Stack>
      {erro && <Alert color="red">{erro}</Alert>}
      <MultiSelect label="Níveis que esta unidade atravessa" data={niveis.map((n) => ({ value: n.id, label: `${n.codigo} — ${n.nome}` }))} value={sel} onChange={setSel} searchable />
      <Button onClick={() => aoSalvar(sel)}>Salvar</Button>
    </Stack>
  );
}

function Historico({ id }: { id: string }) {
  const h = useQuery({ queryKey: ["historico", id], queryFn: () => api<EventoHistorico[]>(`/unidades/${id}/historico`) });
  if (h.isLoading) return <Loader size="sm" />;
  if (!h.data?.length) return <Text size="sm" c="dimmed">Sem registros.</Text>;
  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Quando</Table.Th>
          <Table.Th>O quê</Table.Th>
          <Table.Th>Quem</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {h.data.map((e, i) => (
          <Table.Tr key={i}>
            <Table.Td style={{ whiteSpace: "nowrap" }}>{dataHora(e.ocorrido_em)}</Table.Td>
            <Table.Td>{e.descricao}</Table.Td>
            <Table.Td>{e.usuario ?? "—"}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
