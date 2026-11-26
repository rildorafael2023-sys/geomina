import { Alert, Badge, Button, Group, Loader, Paper, Stack, Switch, Table, Text, Title } from "@mantine/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, type Saude } from "../api/cliente";

export function Sistema({ podeVerificar = false }: { podeVerificar?: boolean }) {
  const { data, error, isLoading } = useQuery({ queryKey: ["saude"], queryFn: () => api<Saude>("/saude") });
  if (isLoading) return <Loader />;
  if (error || !data) return <Alert color="red">Não foi possível ler a situação do aplicativo.</Alert>;
  const linhas: [string, string][] = [
    ["Situação", data.status === "ok" ? "Funcionando" : data.status],
    ["Modo", data.modo],
    ["Versão do aplicativo", data.versao_app],
    ["Revisão do banco", data.revisao_banco],
    ["Pasta de dados", data.pasta_dados],
    ["SQLite", data.sqlite],
    ["Índice espacial (R*Tree)", data.rtree ? "disponível" : "INDISPONÍVEL"],
    ["Biblioteca de coordenadas (PROJ)", data.proj],
    ["SAD69 / UTM 23S (EPSG:29193)", data.crs_disponiveis["29193"] ? "disponível" : "INDISPONÍVEL"],
    ["SIRGAS 2000 / UTM 23S (EPSG:31983)", data.crs_disponiveis["31983"] ? "disponível" : "INDISPONÍVEL"],
  ];
  return (
    <Stack maw={760}>
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        Sistema
      </Title>
      <Table>
        <Table.Tbody>
          {linhas.map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Td fw={500} w="45%">
                {k}
              </Table.Td>
              <Table.Td style={{ wordBreak: "break-all" }}>{v}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
    {podeVerificar && <Integridade />}
    </Stack>
  );
}

interface ItemIntegridade { nome: string; ok: boolean; detalhe: string; gravidade: "ok" | "aviso" | "erro" }

function Integridade() {
  const [completa, setCompleta] = useState(true);
  const m = useMutation({ mutationFn: () => api<{ ok: boolean; itens: ItemIntegridade[]; segundos: number }>(`/sistema/integridade?completa=${completa}`, { method: "POST" }) });
  const cor = { ok: "teal", aviso: "yellow", erro: "red" } as const;
  return (
    <Paper withBorder p="md" data-testid="integridade">
      <Title order={4} mb={4}>Verificação de integridade</Title>
      <Text size="sm" c="dimmed" mb="sm">Confere o banco de dados, as regras que protegem os registros, o índice espacial e se os arquivos originais (fotos, croquis, laudos) continuam iguais ao que foi enviado. Não altera nada.</Text>
      <Group>
        <Button onClick={() => m.mutate()} loading={m.isPending}>Verificar agora</Button>
        <Switch label="Conferir o conteúdo de cada arquivo (mais lento)" checked={completa} onChange={(e) => setCompleta(e.currentTarget.checked)} />
      </Group>
      {m.error && <Alert color="red" mt="sm">Não foi possível verificar.</Alert>}
      {m.data && (
        <Stack gap={6} mt="md">
          <Alert color={m.data.ok ? "teal" : "red"} data-testid="integridade-resultado">
            {m.data.ok ? "Tudo certo." : "Foram encontrados problemas. Faça um backup e procure o suporte antes de continuar lançando dados."} ({m.data.segundos.toLocaleString("pt-BR")} s)
          </Alert>
          {m.data.itens.map((i) => (
            <Group key={i.nome} wrap="nowrap" align="flex-start" gap="sm">
              <Badge color={cor[i.gravidade]} w={64} style={{ flexShrink: 0 }}>{i.gravidade === "ok" ? "ok" : i.gravidade === "aviso" ? "aviso" : "erro"}</Badge>
              <div><Text size="sm" fw={500}>{i.nome}</Text><Text size="xs" c="dimmed">{i.detalhe}</Text></div>
            </Group>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
