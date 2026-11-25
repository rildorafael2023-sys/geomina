import { Alert, Badge, Button, Code, Group, Loader, Modal, Pagination, Paper, ScrollArea, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, dataHora, type ItemAuditoria, type Usuario } from "../api/cliente";

const OPERACOES = [
  { value: "I", label: "Inclusão" },
  { value: "U", label: "Alteração" },
  { value: "D", label: "Exclusão" },
  { value: "B", label: "Backup" },
  { value: "R", label: "Restauração" },
];
const CORES: Record<string, string> = { I: "teal", U: "blue", D: "red", B: "gray", R: "orange" };
const TAMANHO = 50;

export function Auditoria({ podeVerUsuarios }: { podeVerUsuarios: boolean }) {
  const [f, setF] = useState({ tabela: null as string | null, operacao: null as string | null, usuario: null as string | null, de: "", ate: "", texto: "" });
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<ItemAuditoria | null>(null);
  const tabelas = useQuery({ queryKey: ["aud-tabelas"], queryFn: () => api<{ valor: string; rotulo: string }[]>("/auditoria/tabelas") });
  const usuarios = useQuery({ queryKey: ["usuarios"], queryFn: () => api<Usuario[]>("/usuarios"), enabled: podeVerUsuarios });
  const params = new URLSearchParams({ pagina: String(pagina), tamanho: String(TAMANHO) });
  if (f.tabela) params.set("tabela", f.tabela);
  if (f.operacao) params.set("operacao", f.operacao);
  if (f.usuario) params.set("usuario_id", f.usuario);
  if (f.de) params.set("de", f.de);
  if (f.ate) params.set("ate", f.ate);
  if (f.texto.trim()) params.set("texto", f.texto.trim());
  const dados = useQuery({
    queryKey: ["auditoria", params.toString()],
    queryFn: () => api<{ total: number; itens: ItemAuditoria[] }>(`/auditoria?${params}`),
  });
  const mudar = (parcial: Partial<typeof f>) => {
    setF({ ...f, ...parcial });
    setPagina(1);
  };

  return (
    <Stack>
      <div>
        <Title order={3}>Histórico de alterações (auditoria)</Title>
        <Text size="sm" c="dimmed">
          Todo cadastro, alteração e exclusão feito no GeoMina. Os registros não podem ser alterados nem apagados.
        </Text>
      </div>
      <Paper withBorder p="sm">
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }}>
          <Select label="Assunto" clearable data={(tabelas.data ?? []).map((t) => ({ value: t.valor, label: t.rotulo }))} value={f.tabela} onChange={(v) => mudar({ tabela: v })} />
          <Select label="Operação" clearable data={OPERACOES} value={f.operacao} onChange={(v) => mudar({ operacao: v })} />
          {podeVerUsuarios && (
            <Select label="Usuário" clearable searchable data={(usuarios.data ?? []).map((u) => ({ value: u.id, label: u.nome }))} value={f.usuario} onChange={(v) => mudar({ usuario: v })} />
          )}
          <TextInput type="date" label="De" value={f.de} onChange={(e) => mudar({ de: e.currentTarget.value })} />
          <TextInput type="date" label="Até" value={f.ate} onChange={(e) => mudar({ ate: e.currentTarget.value })} />
          <TextInput label="Contém o texto" placeholder="ex.: N144" value={f.texto} onChange={(e) => mudar({ texto: e.currentTarget.value })} />
        </SimpleGrid>
      </Paper>
      {dados.error && <Alert color="red">Não foi possível consultar a auditoria.</Alert>}
      {dados.isLoading ? (
        <Loader />
      ) : (
        <>
          <Text size="sm" c="dimmed">{dados.data?.total ?? 0} registro(s)</Text>
          <ScrollArea>
            <Table striped highlightOnHover miw={680}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Quando</Table.Th>
                  <Table.Th>Assunto</Table.Th>
                  <Table.Th>Operação</Table.Th>
                  <Table.Th>Registro</Table.Th>
                  <Table.Th>Quem</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(dados.data?.itens ?? []).map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>{dataHora(a.ocorrido_em)}</Table.Td>
                    <Table.Td>{a.tabela_nome}</Table.Td>
                    <Table.Td><Badge variant="light" color={CORES[a.operacao] ?? "gray"}>{a.operacao_nome}</Badge></Table.Td>
                    <Table.Td>{a.resumo}</Table.Td>
                    <Table.Td>{a.usuario ?? (a.origem === "aplicativo" ? "—" : a.origem)}</Table.Td>
                    <Table.Td>
                      <Button size="compact-xs" variant="subtle" onClick={() => setAberto(a)}>detalhes</Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          {(dados.data?.total ?? 0) > TAMANHO && (
            <Group justify="center">
              <Pagination total={Math.ceil((dados.data?.total ?? 0) / TAMANHO)} value={pagina} onChange={setPagina} />
            </Group>
          )}
        </>
      )}
      <Modal opened={aberto !== null} onClose={() => setAberto(null)} title="Detalhes do registro" size="lg">
        {aberto && <Detalhes a={aberto} />}
      </Modal>
    </Stack>
  );
}

function Detalhes({ a }: { a: ItemAuditoria }) {
  const campos = Array.from(new Set([...Object.keys(a.antes ?? {}), ...Object.keys(a.depois ?? {})]));
  const mostrar = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return (
    <Stack gap="xs">
      <Text size="sm">
        {dataHora(a.ocorrido_em)} · {a.tabela_nome} · {a.operacao_nome} · {a.usuario ?? a.origem}
      </Text>
      <Text size="xs" c="dimmed">Identificador: <Code>{a.registro_id}</Code></Text>
      <ScrollArea>
        <Table withTableBorder miw={480}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Campo</Table.Th>
              <Table.Th>Antes</Table.Th>
              <Table.Th>Depois</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {campos.map((c) => (
              <Table.Tr key={c}>
                <Table.Td fw={500}>{c}</Table.Td>
                <Table.Td style={{ wordBreak: "break-all" }}>{mostrar(a.antes?.[c])}</Table.Td>
                <Table.Td style={{ wordBreak: "break-all" }}>{mostrar(a.depois?.[c])}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}
