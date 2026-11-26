import { Alert, Button, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api, json, type Eu, type Mina } from "../../api/cliente";
import { FACETAS, parametrosGeo, useGeo, type Pagina } from "./estado";

interface Est { n: number; min?: number; q1?: number; mediana?: number; q3?: number; max?: number; media?: number; desvio?: number | null }
const fmt = (x?: number | null) => (x == null ? "—" : x.toLocaleString("pt-BR", { maximumSignificantDigits: 4 }));
const LIMITE = 1000;

/** Relatório da seleção atual, pensado para imprimir ou salvar como PDF (janela de impressão do navegador). */
export function Relatorio({ mina, eu }: { mina: Mina; eu: Eu }) {
  const s = useGeo();
  const p = parametrosGeo(s, { tamanho: String(LIMITE) });
  const q = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`) });
  const corpo = { analitos: s.analitos, regra_ld: s.regraLd, grupos: [{ nome: "Seleção", filtros: s.filtros, texto: s.texto || null, data_de: s.dataDe || null, data_ate: s.dataAte || null }] };
  const est = useQuery({ queryKey: ["relatorio-est", mina.id, JSON.stringify(corpo)], enabled: s.analitos.length > 0,
    queryFn: () => api<{ grupos: { analitos: Record<string, { unidade: string | null; estatistica: Est; no_limite: number; sem_valor: number }> }[] }>(`/minas/${mina.id}/geoop/comparacao`, { method: "POST", body: json(corpo) }) });
  const d = q.data;
  const filtros = d ? Object.entries(s.filtros).filter(([, v]) => v && v.length).map(([f, v]) =>
    `${FACETAS.find((x) => x.chave === f)?.rotulo}: ${v!.map((x) => d.opcoes[f as "nivel"]?.find((o) => o.valor === x)?.rotulo ?? x).join(", ")}`) : [];
  if (s.texto) filtros.push(`texto "${s.texto}"`);
  if (s.dataDe || s.dataAte) filtros.push(`coleta ${s.dataDe || "…"} a ${s.dataAte || "…"}`);
  if (s.teor.analito && (s.teor.min || s.teor.max)) filtros.push(`${s.teor.analito} entre ${s.teor.min || "…"} e ${s.teor.max || "…"}`);
  return (
    <Stack gap="sm" maw={1100} data-testid="relatorio">
      <Group justify="space-between" className="nao-imprimir">
        <Text size="sm" c="dimmed">Confira e use <b>Imprimir / salvar PDF</b> (na janela de impressão, escolha "Salvar como PDF").</Text>
        <Button size="compact-sm" onClick={() => window.print()}>Imprimir / salvar PDF</Button>
      </Group>
      <div>
        <Title order={3}>Relatório geoquímico — {mina.codigo} {mina.nome}</Title>
        <Text size="sm">Gerado em {new Date().toLocaleString("pt-BR")} por {eu.nome} · GeoMina · coordenadas EPSG:{mina.srid_trabalho}</Text>
        <Text size="sm"><b>Seleção:</b> {filtros.length ? filtros.join(" · ") : "todas as amostras"}</Text>
        <Text size="sm"><b>Abaixo/acima do limite:</b> {{ limite: "valor do limite", metade: "metade do limite", omitir: "sem valor" }[s.regraLd]} (nas estatísticas, só valores medidos)</Text>
      </div>
      {!d ? <Loader size="sm" /> : (
        <>
          <Table fz={12} withTableBorder verticalSpacing={2} w="fit-content">
            <Table.Thead><Table.Tr><Table.Th>Situação</Table.Th><Table.Th ta="right">Amostras</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {Object.entries(d.resumo_status).filter(([, n]) => n).map(([k, n]) => <Table.Tr key={k}><Table.Td>{d.status_rotulos[k]}</Table.Td><Table.Td ta="right">{n}</Table.Td></Table.Tr>)}
              <Table.Tr><Table.Td fw={700}>Total</Table.Td><Table.Td ta="right" fw={700}>{d.total}</Table.Td></Table.Tr>
            </Table.Tbody>
          </Table>
          {s.analitos.length === 0 ? <Alert color="blue" p="xs" className="nao-imprimir">Escolha analitos no topo para incluir estatísticas e valores no relatório.</Alert> : est.data && (
            <>
              <Text fw={700} size="sm">Estatísticas por analito</Text>
              <Table fz={11} withTableBorder verticalSpacing={1} data-testid="relatorio-estatisticas">
                <Table.Thead><Table.Tr><Table.Th>Analito</Table.Th>{["n", "mín", "Q1", "mediana", "Q3", "máx", "média", "desvio", "no limite", "sem valor"].map((c) => <Table.Th key={c} ta="right">{c}</Table.Th>)}</Table.Tr></Table.Thead>
                <Table.Tbody>
                  {s.analitos.map((a) => {
                    const r = est.data!.grupos[0].analitos[a], e = r.estatistica;
                    return <Table.Tr key={a}><Table.Td fw={600}>{a} {r.unidade}</Table.Td><Table.Td ta="right">{e.n}</Table.Td>{[e.min, e.q1, e.mediana, e.q3, e.max, e.media, e.desvio].map((v, i) => <Table.Td key={i} ta="right">{fmt(v)}</Table.Td>)}<Table.Td ta="right">{r.no_limite}</Table.Td><Table.Td ta="right">{r.sem_valor}</Table.Td></Table.Tr>;
                  })}
                </Table.Tbody>
              </Table>
            </>
          )}
          <Text fw={700} size="sm">Amostras {d.total > LIMITE ? `(primeiras ${LIMITE} de ${d.total} — exporte em Excel para a lista completa)` : `(${d.total})`}</Text>
          <Table fz={10} withTableBorder verticalSpacing={0} horizontalSpacing={4} striped>
            <Table.Thead><Table.Tr><Table.Th>Amostra</Table.Th><Table.Th>Local / furo</Table.Th><Table.Th>Coleta</Table.Th><Table.Th>Litologia</Table.Th>{s.analitos.map((a) => <Table.Th key={a} ta="right">{a}</Table.Th>)}</Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.itens.map((r) => (
                <Table.Tr key={r.chave}>
                  <Table.Td>{r.codigo}</Table.Td>
                  <Table.Td>{r.furo_ref ? `${r.furo_ref.codigo} ${r.prof_de_m}–${r.prof_ate_m} m` : [r.galeria?.codigo, r.trecho?.codigo].filter(Boolean).join(" / ") || r.local || ""}</Table.Td>
                  <Table.Td>{r.data ? new Date(r.data + "T00:00").toLocaleDateString("pt-BR") : ""}</Table.Td>
                  <Table.Td>{r.litologia?.nome ?? ""}</Table.Td>
                  {s.analitos.map((a) => <Table.Td key={a} ta="right">{r.valores?.[a]?.texto ?? ""}</Table.Td>)}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Stack>
  );
}
