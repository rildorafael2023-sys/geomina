import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Pagination, ScrollArea, SegmentedControl, Stack, Table, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Eu, type Mina } from "../../api/cliente";
import { SemLocal } from "../analise/SemLocal";
import { parametrosGeo, useGeo, type Pagina } from "./estado";

const COR_STATUS: Record<string, string> = { com_resultado: "teal", aguardando: "yellow", sem_envio: "gray", so_laudo: "orange", cancelada: "red" };
const TAMANHO = 200;

/** Tabela de amostras e resultados (cadastradas e só no laudo) com os filtros do painel; clique seleciona. */
export function Consulta({ mina, eu }: { mina: Mina; eu: Eu }) {
  const s = useGeo();
  const [pagina, setPagina] = useState(1);
  const [ordem, setOrdem] = useState("codigo");
  const p = parametrosGeo(s, { pagina: String(pagina), tamanho: String(TAMANHO), ordem });
  const q = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`), placeholderData: (a) => a });
  const d = q.data;
  const paginas = d ? Math.max(1, Math.ceil(d.total / TAMANHO)) : 1;
  return (
    <Stack gap={8}>
      <Conciliacao mina={mina} pode={eu.permissoes.includes("amostra:editar")} />
      <SemLocal mina={mina} pode={eu.permissoes.includes("amostra:editar")} />
      <Group justify="space-between" gap="xs">
        <Group gap={4}>
          {d && Object.entries(d.resumo_status).filter(([, n]) => n).map(([k, n]) => <Badge key={k} size="sm" variant="light" color={COR_STATUS[k]}>{d.status_rotulos[k]}: {n}</Badge>)}
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed">Ordenar</Text>
          <SegmentedControl size="xs" value={ordem} onChange={(v) => { setOrdem(v); setPagina(1); }} data={[{ value: "codigo", label: "Código" }, { value: "local", label: "Local" }, { value: "data", label: "Data" }]} />
        </Group>
      </Group>
      {!d ? <Loader size="sm" /> : (
        <ScrollArea type="auto" offsetScrollbars>
          <Table fz={12} verticalSpacing={2} horizontalSpacing={6} striped highlightOnHover stickyHeader withTableBorder data-testid="tabela-consulta" miw={760 + s.analitos.length * 74}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Amostra</Table.Th><Table.Th>Status</Table.Th><Table.Th>Nível</Table.Th><Table.Th>Galeria</Table.Th><Table.Th>Trecho / local</Table.Th>
                <Table.Th>Coleta</Table.Th><Table.Th>Litologia</Table.Th>
                {s.analitos.length ? s.analitos.map((a) => <Table.Th key={a} ta="right">{a}</Table.Th>) : <Table.Th>Analitos no laudo</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {d.itens.map((r) => (
                <Table.Tr key={r.chave} style={{ cursor: "pointer" }} bg={s.selecionado === r.chave ? "var(--mantine-color-blue-1)" : undefined}
                  onClick={() => s.set({ selecionado: r.chave })} data-chave={r.chave}>
                  <Table.Td fw={600} style={{ whiteSpace: "nowrap" }}>{r.codigo}</Table.Td>
                  <Table.Td><Badge size="xs" variant="dot" color={COR_STATUS[r.status]}>{d.status_rotulos[r.status]?.split(" (")[0]}</Badge></Table.Td>
                  <Table.Td>{r.nivel?.codigo ?? ""}</Table.Td>
                  <Table.Td>{r.galeria?.codigo ?? ""}</Table.Td>
                  <Table.Td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.trecho?.codigo ?? r.local ?? ""}</Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{r.data ? new Date(r.data + "T00:00").toLocaleDateString("pt-BR") : ""}</Table.Td>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{r.litologia ? <><span style={{ display: "inline-block", width: 8, height: 8, background: r.litologia.cor ?? "#ccc", marginRight: 4 }} />{r.litologia.nome}</> : ""}</Table.Td>
                  {s.analitos.length ? s.analitos.map((a) => {
                    const v = r.valores?.[a];
                    return <Table.Td key={a} ta="right" c={v && v.situacao !== "medido" ? "dimmed" : undefined}>{v?.texto ?? ""}</Table.Td>;
                  }) : <Table.Td c="dimmed">{r.analitos.length ? `${r.analitos.length} analitos` : ""}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
      {d && d.total > TAMANHO && <Group justify="center"><Pagination size="sm" total={paginas} value={pagina} onChange={setPagina} /></Group>}
      {d && !d.total && <Text c="dimmed" size="sm">Nenhuma amostra com os filtros atuais.</Text>}
    </Stack>
  );
}

interface Conc { subamostras: { codigo: string; resultados: number; certificados: string[]; pai: { codigo: string; local: string | null; tem_xyz: boolean } }[]; nao_cadastradas: { codigo: string; resultados: number; serie: string }[]; fora_das_regras: { codigo: string; resultados: number }[]; controles_laboratorio: { codigo: string }[] }

/** Conciliação laudo × cadastro: resultados de códigos não cadastrados viram amostras (com confirmação). */
function Conciliacao({ mina, pode }: { mina: Mina; pode: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["conciliacao", mina.id], queryFn: () => api<Conc>(`/minas/${mina.id}/geoop/conciliacao`) });
  const [aberto, setAberto] = useState(false);
  const [sub, setSub] = useState<Set<string>>(new Set());
  const [novas, setNovas] = useState<Set<string>>(new Set());
  const acao = useMutation({
    mutationFn: ({ rota, codigos }: { rota: string; codigos: string[] }) => api<{ criadas: string[]; resultados_ligados: number }>(`/minas/${mina.id}/geoop/conciliacao/${rota}`, { method: "POST", body: json({ codigos }) }),
    onSuccess: (r) => { qc.invalidateQueries(); setSub(new Set()); setNovas(new Set()); notifications.show({ color: "teal", message: `${r.criadas.length} amostra(s) cadastrada(s); ${r.resultados_ligados} resultado(s) ligados.` }); },
    onError: (e) => notifications.show({ color: "red", message: e instanceof ErroApi ? e.message : String(e) }),
  });
  const k = q.data;
  if (!k) return null;
  const pend = k.subamostras.length + k.nao_cadastradas.length + k.fora_das_regras.length;
  if (!pend) return null;
  const marcar = (setter: typeof setSub, c: string) => setter((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const lista = (itens: { codigo: string; resultados: number }[], sel: Set<string>, setter: typeof setSub, extra: (i: never) => string) => (
    <ScrollArea.Autosize mah={220}>
      <Table fz={12} verticalSpacing={1}>
        <Table.Tbody>
          {itens.map((i) => (
            <Table.Tr key={i.codigo}>
              <Table.Td w={30}><Checkbox size="xs" checked={sel.has(i.codigo)} onChange={() => marcar(setter, i.codigo)} aria-label={`Marcar ${i.codigo}`} /></Table.Td>
              <Table.Td fw={600}>{i.codigo}</Table.Td><Table.Td c="dimmed">{i.resultados} resultados</Table.Td><Table.Td c="dimmed">{extra(i as never)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea.Autosize>
  );
  return (
    <>
      <Alert color="orange" p="xs">
        <Group justify="space-between" wrap="wrap">
          <Text size="sm">{pend} código(s) do laudo não estão no cadastro de amostras. Os resultados já aparecem na análise como "só no laudo"; para ligar local e geologia, concilie.</Text>
          <Button size="compact-sm" variant="light" onClick={() => setAberto(true)}>Conciliar laudo × cadastro…</Button>
        </Group>
      </Alert>
      {aberto && (
        <Modal opened onClose={() => setAberto(false)} size="xl" title="Conciliar laudo × cadastro">
          <Stack gap="sm">
            {k.subamostras.length > 0 && (
              <div>
                <Text fw={600} size="sm">Sub-amostras ({k.subamostras.length}) — o ponto está cadastrado</Text>
                <Text size="xs" c="dimmed">Ex.: BS-RP-428A e 428B são intervalos diferentes da parede no ponto BS-RP-428. Criar herda local, coordenadas, galeria, ficha, data e campanha do ponto; a litologia de cada intervalo fica a informar.</Text>
                {lista(k.subamostras, sub, setSub, (i: Conc["subamostras"][number]) => `ponto ${i.pai.codigo}${i.pai.local ? " · " + i.pai.local : ""}${i.pai.tem_xyz ? "" : " · sem XYZ"}`)}
                <Group gap="xs" mt={4}>
                  <Button size="compact-xs" variant="subtle" onClick={() => setSub(new Set(k.subamostras.map((i) => i.codigo)))}>Marcar todas</Button>
                  {pode && <Button size="compact-sm" disabled={!sub.size} loading={acao.isPending} onClick={() => acao.mutate({ rota: "subamostras", codigos: [...sub] })}>Criar {sub.size} sub-amostra(s)</Button>}
                </Group>
              </div>
            )}
            {k.nao_cadastradas.length > 0 && (
              <div>
                <Text fw={600} size="sm">Amostras não cadastradas ({k.nao_cadastradas.length})</Text>
                <Text size="xs" c="dimmed">Não estão em nenhuma planilha importada. Cadastrar cria a amostra só com o código (local, coordenadas e geologia a completar) e liga os resultados. Se houver planilha de campo com elas, prefira importá-la em Amostras.</Text>
                {lista(k.nao_cadastradas, novas, setNovas, (i: Conc["nao_cadastradas"][number]) => i.serie)}
                <Group gap="xs" mt={4}>
                  <Button size="compact-xs" variant="subtle" onClick={() => setNovas(new Set(k.nao_cadastradas.map((i) => i.codigo)))}>Marcar todas</Button>
                  {pode && <Button size="compact-sm" disabled={!novas.size} loading={acao.isPending} onClick={() => acao.mutate({ rota: "cadastrar", codigos: [...novas] })}>Cadastrar {novas.size} amostra(s)</Button>}
                </Group>
              </div>
            )}
            {k.fora_das_regras.length > 0 && (
              <div>
                <Text fw={600} size="sm">Códigos fora das regras ({k.fora_das_regras.length})</Text>
                <Text size="xs" c="dimmed">Não seguem BS-RP, BMT-TS ou BE (ex.: SAB-CP). Os resultados continuam utilizáveis como "só no laudo"; o cadastro depende de definir a série (pendência P5).</Text>
                <Text size="xs" mt={2}>{k.fora_das_regras.map((i) => `${i.codigo} (${i.resultados})`).join(" · ")}</Text>
              </div>
            )}
            {!pode && <Text size="xs" c="dimmed">Somente usuários que editam amostras podem conciliar.</Text>}
          </Stack>
        </Modal>
      )}
    </>
  );
}
