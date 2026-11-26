import { Alert, List, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { api, type Mina } from "../../api/cliente";
import { parametrosGeo, useGeo, type Pagina } from "./estado";

const TEXTO = {
  comparacao: { titulo: "Comparação geoquímica — Etapa 6", itens: ["Painéis por galeria, trecho, campanha, litologia, furo ou grupo", "Estatísticas descritivas, histograma, boxplot e dispersão", "Filtros de cada grupo sempre identificados"] },
  espacial: { titulo: "Visualização espacial 3D — Etapa 7", itens: ["Topografia, galerias, amostras e furos em 3D", "Cor pelo analito escolhido, com classes e legenda", "Seleção sincronizada com tabela, tracks e painel de contexto"] },
};

/** Ambientes ainda não construídos: diz o que virá e quantos dados já existem — nada de dados de exemplo. */
export function Pendente({ tipo, mina }: { tipo: keyof typeof TEXTO; mina: Mina }) {
  const s = useGeo();
  const p = parametrosGeo(s, { tamanho: "1" });
  const q = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`), placeholderData: (a) => a });
  const t = TEXTO[tipo];
  return (
    <Stack maw={720} gap="xs">
      <Alert color="gray" title={t.titulo}>
        <Text size="sm">Este ambiente ainda não foi construído. Vai trazer:</Text>
        <List size="sm" mt={4}>{t.itens.map((i) => <List.Item key={i}>{i}</List.Item>)}</List>
      </Alert>
      {q.data && <Text size="sm">Com os filtros atuais há <b>{q.data.total}</b> amostra(s); elas já podem ser vistas em <b>Consulta de amostras</b> e na aba <b>Galerias e frentes</b>.</Text>}
    </Stack>
  );
}
