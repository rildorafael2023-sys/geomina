import { Alert, Button, Group, Loader, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { api, ErroApi, type Mina } from "../../api/cliente";
import { coresClasses, limites } from "../../geologia/classes";
import { Legenda, PainelGaleria, valorCor, type Dados } from "../analise/Longitudinal";
import { parametrosGeo, useGeo, type Pagina } from "./estado";

const UUID = /^[0-9a-f-]{36}$/i;

/** Aba Galerias (Etapa 2): a faixa de teores da galeria escolhida no painel. Os tracks configuráveis chegam na Etapa 3. */
export function Galerias({ mina }: { mina: Mina }) {
  const s = useGeo();
  const p = parametrosGeo(s, { tamanho: "1" });
  const resumo = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`), placeholderData: (a) => a });
  const galerias = (resumo.data?.opcoes.galeria ?? []).filter((o) => o.valor !== "_nenhum");
  const sel = s.filtros.galeria ?? [];
  const [invertida, setInvertida] = useState(false);
  const id = sel.length === 1 ? sel[0] : null;

  const params = useMemo(() => {
    const q = new URLSearchParams({ analitos: s.analitos.join(","), regra_ld: s.regraLd, referencia: "amostras" });
    if (invertida) q.set("inverter", "true");
    const ids = (f: string) => (s.filtros[f as "litologia"] ?? []).filter((v) => UUID.test(v));
    for (const [f, api_] of [["litologia", "litologias"], ["alteracao", "alteracoes"], ["mineralizacao", "mineralizacoes"], ["campanha", "campanhas"], ["tipo", "tipos"], ["responsavel", "responsaveis"]])
      if (ids(f).length) q.set(api_, ids(f).join(","));
    if (s.dataDe) q.set("data_de", s.dataDe);
    if (s.dataAte) q.set("data_ate", s.dataAte);
    if (s.teor.analito && (s.teor.min || s.teor.max)) { q.set("teor_analito", s.teor.analito); if (s.teor.min) q.set("teor_min", s.teor.min); if (s.teor.max) q.set("teor_max", s.teor.max); }
    return q;
  }, [s.analitos, s.regraLd, s.filtros, s.dataDe, s.dataAte, s.teor, invertida]);
  const dados = useQuery({ queryKey: ["faixa", id, params.toString()], enabled: !!id && s.analitos.length > 0, queryFn: () => api<Dados>(`/unidades/${id}/longitudinal?${params}`) });

  const classes = useMemo(() => {
    const out: Record<string, { lim: number[]; cores: string[]; unidade: string }> = {};
    for (const a of s.analitos) {
      const vals = (dados.data?.amostras ?? []).map((x) => valorCor(x.valores[a])).filter((v): v is number => v != null);
      const lim = limites(vals, "quantis", 5);
      out[a] = { lim, cores: coresClasses(lim.length + 1), unidade: dados.data?.series.find((x) => x.chave === a)?.unidade ?? "" };
    }
    return out;
  }, [dados.data, s.analitos]);

  if (!id) {
    return (
      <Stack gap="xs" maw={760}>
        <Text fw={600}>Escolha uma galeria, travessa ou rampa</Text>
        <Text size="sm" c="dimmed">No painel à esquerda (Local) ou aqui. Os números são as amostras com os filtros atuais.</Text>
        <Group gap={6}>
          {galerias.map((g) => <Button key={g.valor} size="compact-sm" variant="default" onClick={() => s.definir("galeria", [g.valor])}>{g.rotulo} · {g.n}</Button>)}
          {!galerias.length && <Text size="sm" c="dimmed">Nenhuma amostra ligada a galerias com os filtros atuais.</Text>}
        </Group>
      </Stack>
    );
  }
  if (!s.analitos.length) return <Alert color="blue" p="xs">Escolha os analitos no topo da tela (qualquer analito dos laudos).</Alert>;
  if (dados.isLoading) return <Loader size="sm" />;
  if (dados.error) return <Alert color="orange">{dados.error instanceof ErroApi ? dados.error.message : String(dados.error)}</Alert>;
  if (!dados.data) return null;
  return (
    <Stack gap="xs">
      <Legenda analitos={s.analitos} classes={classes} metodo="quantis" />
      <PainelGaleria mina={mina} d={dados.data} soComResultado={false} analitos={s.analitos} classes={classes} params={params}
        aoInverter={() => setInvertida((x) => !x)} aoAbrir={(amostraId) => s.set({ selecionado: amostraId })} />
    </Stack>
  );
}
