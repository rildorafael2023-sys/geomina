import { Alert, Button, Grid, Group, Loader, Paper, ScrollArea, Select, Stack, Switch, Text, TextInput, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, type Eu, type Mina, type TipoUnidade, type UnidadeResumo } from "../../api/cliente";
import { ancestrais, Arvore, filtrar, montarArvore } from "./Arvore";
import { CadastroMina } from "./CadastroMina";
import { DetalheUnidade } from "./DetalheUnidade";
import { FormUnidade } from "./FormUnidade";

export function Estrutura({ eu }: { eu: Eu }) {
  const podeEditar = eu.permissoes.includes("estrutura:editar");
  const podeConfigurar = eu.permissoes.includes("estrutura:configurar");
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  const tipos = useQuery({ queryKey: ["tipos-unidade"], queryFn: () => api<TipoUnidade[]>("/tipos-unidade") });
  const [minaId, setMinaId] = useState<string | null>(null);
  const mina = minas.data?.find((m) => m.id === minaId) ?? minas.data?.[0];
  const [inativas, setInativas] = useState(false);
  const [texto, setTexto] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novaRaiz, setNovaRaiz] = useState(false);
  const painel = useRef<HTMLDivElement>(null);
  // Em telas estreitas (tablet/celular) o painel de detalhes fica abaixo da árvore: rola até ele.
  useEffect(() => {
    if (selecionado && window.innerWidth < 992) painel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selecionado]);

  const unidades = useQuery({
    queryKey: ["unidades", mina?.id, inativas],
    queryFn: () => api<UnidadeResumo[]>(`/minas/${mina!.id}/unidades?incluir_inativas=${inativas}`),
    enabled: !!mina,
  });

  const cores = useMemo(() => new Map((tipos.data ?? []).map((t) => [t.codigo, t.cor ?? "gray"])), [tipos.data]);
  const nos = useMemo(() => montarArvore(unidades.data ?? [], tipos.data ?? []), [unidades.data, tipos.data]);
  const visiveis = useMemo(() => filtrar(unidades.data ?? [], texto), [unidades.data, texto]);
  const abrir = useMemo(() => ancestrais(unidades.data ?? [], selecionado), [unidades.data, selecionado]);

  if (minas.isLoading || tipos.isLoading) return <Loader />;
  if (minas.error || tipos.error) return <Alert color="red">Não foi possível carregar a estrutura da mina.</Alert>;
  if (!mina) {
    return podeConfigurar ? (
      <CadastroMina />
    ) : (
      <Alert color="yellow">Nenhuma mina cadastrada. Peça ao administrador para cadastrar a mina.</Alert>
    );
  }

  const tiposRaiz = (tipos.data ?? []).filter((t) => t.pode_ser_raiz && t.ativo).map((t) => t.codigo);

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={3}>Estrutura da mina</Title>
          <Text size="sm" c="dimmed">
            {mina.codigo} — {mina.nome} · coordenadas em {mina.crs_nome ?? `EPSG:${mina.srid_trabalho}`}
          </Text>
        </div>
        {(minas.data?.length ?? 0) > 1 && (
          <Select
            label="Mina"
            data={(minas.data ?? []).map((m) => ({ value: m.id, label: `${m.codigo} — ${m.nome}` }))}
            value={mina.id}
            onChange={(v) => {
              setMinaId(v);
              setSelecionado(null);
            }}
            allowDeselect={false}
          />
        )}
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder p="sm">
            <Stack gap="xs">
              <TextInput placeholder="Buscar por código ou nome" value={texto} onChange={(e) => setTexto(e.currentTarget.value)} />
              <Group justify="space-between">
                <Switch size="xs" label="Mostrar inativas" checked={inativas} onChange={(e) => setInativas(e.currentTarget.checked)} />
                {podeEditar && (
                  <Button size="xs" variant="light" onClick={() => setNovaRaiz(true)}>
                    Nova unidade na raiz
                  </Button>
                )}
              </Group>
              <ScrollArea.Autosize mah="65vh">
                {unidades.isLoading ? (
                  <Loader size="sm" />
                ) : nos.length === 0 ? (
                  <Text size="sm" c="dimmed" p="sm">
                    Nenhuma unidade cadastrada. Comece pelos níveis (ex.: N144) ou pelas rampas.
                  </Text>
                ) : (
                  <Arvore nos={nos} cores={cores} selecionado={selecionado} aoSelecionar={setSelecionado} visiveis={visiveis} abrir={abrir} />
                )}
              </ScrollArea.Autosize>
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }} ref={painel}>
          {selecionado ? (
            <DetalheUnidade
              key={selecionado}
              id={selecionado}
              mina={mina}
              tipos={tipos.data ?? []}
              todas={unidades.data ?? []}
              eu={eu}
              aoSelecionar={setSelecionado}
            />
          ) : (
            <Paper withBorder p="lg">
              <Text c="dimmed" size="sm">
                Selecione uma unidade na árvore para ver os dados, as unidades internas, os avanços (frentes) e o histórico.
              </Text>
            </Paper>
          )}
        </Grid.Col>
      </Grid>
      <FormUnidade
        aberto={novaRaiz}
        aoFechar={() => setNovaRaiz(false)}
        mina={mina}
        tipos={tipos.data ?? []}
        tiposPermitidos={tiposRaiz}
        pai={null}
        niveisDisponiveis={(unidades.data ?? []).filter((u) => u.tipo === "NIVEL" || tipos.data?.find((t) => t.codigo === u.tipo)?.e_nivel)}
        aoCriar={(id) => setSelecionado(id)}
      />
    </Stack>
  );
}
