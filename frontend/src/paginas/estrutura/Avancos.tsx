import { Alert, Button, Group, Loader, NumberInput, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, dataCurta, ErroApi, json, type Avanco, type Mina } from "../../api/cliente";

const hoje = () => new Date().toISOString().slice(0, 10);
const num = (v: number | string) => (v === "" ? null : Number(v));
const fmt = (v: number | null, casas = 2) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas }));

export function Avancos({ frenteId, mina, podeRegistrar }: { frenteId: string; mina: Mina; podeRegistrar: boolean }) {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["avancos", frenteId], queryFn: () => api<Avanco[]>(`/unidades/${frenteId}/avancos`) });
  const ultimaRef = lista.data?.find((a) => a.referencia)?.referencia ?? "";
  const vazio = { data: hoje(), distancia: "" as number | string, referencia: "", avanco: "" as number | string, x: "" as number | string, y: "" as number | string, z: "" as number | string, obs: "" };
  const [f, setF] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: () =>
      api(`/unidades/${frenteId}/avancos`, {
        method: "POST",
        body: json({
          data: f.data,
          distancia_m: num(f.distancia),
          referencia: (f.referencia || ultimaRef) || null,
          avanco_m: num(f.avanco),
          x: num(f.x),
          y: num(f.y),
          z: num(f.z),
          observacao: f.obs || null,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avancos", frenteId] });
      qc.invalidateQueries({ queryKey: ["historico", frenteId] });
      setF(vazio);
      notifications.show({ color: "teal", message: "Avanço registrado." });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao registrar."),
  });

  return (
    <Stack>
      {podeRegistrar && (
        <Paper withBorder p="sm" bg="var(--mantine-color-default-hover)">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              Registrar avanço
            </Text>
            {erro && <Alert color="red">{erro}</Alert>}
            <SimpleGrid cols={{ base: 1, xs: 3 }}>
              <TextInput type="date" label="Data" value={f.data} onChange={(e) => setF({ ...f, data: e.currentTarget.value })} />
              <NumberInput label="Distância (m)" description="posição da frente" decimalSeparator="," min={0} value={f.distancia} onChange={(v) => setF({ ...f, distancia: v })} />
              <NumberInput label="Avanço (m)" description="nesta medição" decimalSeparator="," min={0} value={f.avanco} onChange={(v) => setF({ ...f, avanco: v })} />
            </SimpleGrid>
            <TextInput
              label="Referência da distância"
              description="De onde a distância foi medida (ex.: entrada da travessa, estação T-12)"
              placeholder={ultimaRef || undefined}
              value={f.referencia}
              onChange={(e) => setF({ ...f, referencia: e.currentTarget.value })}
            />
            <SimpleGrid cols={{ base: 1, xs: 3 }}>
              <NumberInput label="X (opcional)" decimalSeparator="," value={f.x} onChange={(v) => setF({ ...f, x: v })} />
              <NumberInput label="Y (opcional)" decimalSeparator="," value={f.y} onChange={(v) => setF({ ...f, y: v })} />
              <NumberInput label="Z / cota (opcional)" decimalSeparator="," value={f.z} onChange={(v) => setF({ ...f, z: v })} />
            </SimpleGrid>
            <Text size="xs" c="dimmed">
              Coordenadas em {mina.crs_nome ?? `EPSG:${mina.srid_trabalho}`}. Deixe em branco se não foram medidas: o sistema não estima coordenadas.
            </Text>
            <TextInput label="Observação" value={f.obs} onChange={(e) => setF({ ...f, obs: e.currentTarget.value })} />
            <Group justify="flex-end">
              <Button size="sm" loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>
                Registrar
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      {lista.isLoading ? (
        <Loader size="sm" />
      ) : !lista.data?.length ? (
        <Text size="sm" c="dimmed">
          Nenhum avanço registrado.
        </Text>
      ) : (
        <ScrollArea>
          <Table striped miw={560}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Data</Table.Th>
                <Table.Th>Distância</Table.Th>
                <Table.Th>Referência</Table.Th>
                <Table.Th>Avanço</Table.Th>
                <Table.Th>XYZ</Table.Th>
                <Table.Th>Responsável</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lista.data.map((a) => (
                <Table.Tr key={a.id} title={a.observacao ?? undefined}>
                  <Table.Td>{dataCurta(a.data)}</Table.Td>
                  <Table.Td>{a.distancia_m === null ? "—" : `${fmt(a.distancia_m)} m`}</Table.Td>
                  <Table.Td>{a.referencia ?? "—"}</Table.Td>
                  <Table.Td>{a.avanco_m === null ? "—" : `${fmt(a.avanco_m)} m`}</Table.Td>
                  <Table.Td>{a.x === null ? "—" : `${fmt(a.x, 3)}; ${fmt(a.y, 3)}${a.z !== null ? "; " + fmt(a.z, 3) : ""}`}</Table.Td>
                  <Table.Td>{a.responsavel_nome ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Stack>
  );
}
