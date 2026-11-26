import { Alert, Button, Checkbox, Group, Modal, ScrollArea, Select, Stack, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Mina } from "../../api/cliente";

/** Amostras que vieram só com o texto do local (planilha de campo): ligar em lote à galeria certa. */
export function SemLocal({ mina, pode }: { mina: Mina; pode: boolean }) {
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
