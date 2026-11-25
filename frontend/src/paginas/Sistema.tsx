import { Alert, Loader, Paper, Table, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api, type Saude } from "../api/cliente";

export function Sistema() {
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
    <Paper withBorder p="md" maw={760}>
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
  );
}
