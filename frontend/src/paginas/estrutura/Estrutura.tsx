import { Alert, Button, ScrollArea, Select, Stack, Switch, TextInput } from "@mantine/core";
import { IconHierarchy2, IconPlus, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Carregando, Pagina, Painel, Vazio } from "../../componentes/ui";
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

  if (minas.isLoading || tipos.isLoading) return <Carregando />;
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
    <Pagina titulo="Estrutura da mina" icone={<IconHierarchy2 size={20} />}
      subtitulo={`${mina.codigo} — ${mina.nome} · coordenadas em ${mina.crs_nome ?? `EPSG:${mina.srid_trabalho}`}`}
      acoes={<>
        {(minas.data?.length ?? 0) > 1 && (
          <Select w={240} data={(minas.data ?? []).map((m) => ({ value: m.id, label: `${m.codigo} — ${m.nome}` }))} value={mina.id}
            onChange={(v) => { setMinaId(v); setSelecionado(null); }} allowDeselect={false} aria-label="Mina" />
        )}
        {podeEditar && <Button leftSection={<IconPlus size={14} />} onClick={() => setNovaRaiz(true)}>Nova unidade na raiz</Button>}
      </>}>
      <div className="gm-explorador">
        <Painel titulo="Árvore da mina" descricao={`${unidades.data?.length ?? 0} unidade(s)`} p={0} className="gm-explorador-lista">
          <Stack gap={6} p={8} style={{ borderBottom: "1px solid var(--gm-borda-suave)" }}>
            <TextInput placeholder="Buscar por código ou nome" leftSection={<IconSearch size={13} />} value={texto} onChange={(e) => setTexto(e.currentTarget.value)} />
            <Switch label="Mostrar inativas" checked={inativas} onChange={(e) => setInativas(e.currentTarget.checked)} />
          </Stack>
          <ScrollArea.Autosize mah="calc(100vh - 230px)">
            <div style={{ padding: 6 }}>
              {unidades.isLoading ? <Carregando /> : nos.length === 0 ? (
                <Vazio compacto titulo="Nenhuma unidade cadastrada." descricao="Comece pelos níveis (ex.: N144) ou pelas rampas." />
              ) : (
                <Arvore nos={nos} cores={cores} selecionado={selecionado} aoSelecionar={setSelecionado} visiveis={visiveis} abrir={abrir} />
              )}
            </div>
          </ScrollArea.Autosize>
        </Painel>
        <div ref={painel} className="gm-explorador-detalhe">
          {selecionado ? (
            <DetalheUnidade key={selecionado} id={selecionado} mina={mina} tipos={tipos.data ?? []} todas={unidades.data ?? []} eu={eu} aoSelecionar={setSelecionado} />
          ) : (
            <Painel><Vazio icone={<IconHierarchy2 size={30} stroke={1.4} />} titulo="Selecione uma unidade na árvore"
              descricao="Os dados, as unidades internas, o eixo, os mapeamentos, as fotos e o histórico aparecem aqui." /></Painel>
          )}
        </div>
      </div>
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
    </Pagina>
  );
}
