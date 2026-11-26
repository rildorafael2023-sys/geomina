import { ActionIcon, Alert, Badge, Button, Group, Loader, Menu, MultiSelect, Select, Tabs, Text, Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { api, baixar, type Eu, type Mina } from "../../api/cliente";
import { Comparacao } from "./Comparacao";
import { Consulta } from "./Consulta";
import { Espacial } from "./Espacial";
import { Relatorio } from "./Relatorio";
import { parametrosGeo, useGeo, type Pagina } from "./estado";
import { Galerias } from "./Galerias";
import { PainelContexto } from "./PainelContexto";
import { PainelFiltros } from "./PainelFiltros";
import { Sondagens } from "./Sondagens";

const ABAS = [
  { valor: "galerias", rotulo: "Galerias e frentes" },
  { valor: "sondagens", rotulo: "Sondagens" },
  { valor: "comparacao", rotulo: "Comparação" },
  { valor: "espacial", rotulo: "Visualização espacial" },
  { valor: "consulta", rotulo: "Consulta de amostras" },
];

/** Geoquímica Operacional: área de trabalho com filtros (esquerda), análise (centro) e contexto da seleção (direita). */
export function GeoOp({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader m="md" />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert m="md" color="yellow">Cadastre a mina primeiro.</Alert>;
  return <Trabalho mina={mina} eu={eu} />;
}

function Trabalho({ mina, eu }: { mina: Mina; eu: Eu }) {
  const local = useLocation();
  const ir = useNavigate();
  const aba = local.pathname.split("/")[2] || "galerias";
  const s = useGeo();
  const analitos = useQuery({ queryKey: ["analitos"], queryFn: () => api<{ codigo: string; tipo: string }[]>("/analitos") });
  // cabeçalho e painel de filtros usam a mesma consulta (só a contagem e as opções: 1 item)
  const p = parametrosGeo(s, { tamanho: "1" });
  const resumo = useQuery({ queryKey: ["geoop", mina.id, p.toString()], queryFn: () => api<Pagina>(`/minas/${mina.id}/geoop/registros?${p}`), placeholderData: (a) => a });
  const caminho = ["nivel", "galeria", "trecho"].map((f) => {
    const sel = s.filtros[f as "nivel"] ?? [];
    if (!sel.length) return null;
    const ops = resumo.data?.opcoes[f as "nivel"] ?? [];
    return sel.map((v) => ops.find((o) => o.valor === v)?.rotulo ?? "…").join(", ");
  }).filter(Boolean);
  return (
    <div className="geoop-trabalho" style={{ display: "grid", gridTemplateRows: "auto auto 1fr", height: "calc(100vh - 48px)", minHeight: 480 }}>
      {/* cabeçalho compacto: contexto da análise, variáveis e exportação */}
      <Group className="nao-imprimir" px="sm" py={6} gap="sm" wrap="nowrap" style={{ borderBottom: "1px solid var(--mantine-color-gray-3)", background: "var(--mantine-color-gray-0)" }}>
        <Text fw={700} size="sm" style={{ whiteSpace: "nowrap" }}>Geoquímica operacional</Text>
        <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} data-testid="caminho">
          {mina.codigo}{caminho.length ? " › " + caminho.join(" › ") : " · toda a mina"}
        </Text>
        <Badge variant="light" style={{ flexShrink: 0 }} data-testid="total">{resumo.data ? `${resumo.data.total.toLocaleString("pt-BR")} amostras` : "…"}</Badge>
        <div style={{ flex: 1 }} />
        <MultiSelect size="xs" w={300} placeholder="Analitos (todos os do laudo)" searchable clearable value={s.analitos} onChange={(v) => s.set({ analitos: v })}
          data={(analitos.data ?? []).map((a) => ({ value: a.codigo, label: `${a.codigo} (${a.tipo})` }))} aria-label="Analitos" maxValues={14} />
        <Tooltip label="Como tratar resultados abaixo/acima do limite de detecção">
          <Select size="xs" w={170} allowDeselect={false} value={s.regraLd} onChange={(v) => s.set({ regraLd: (v ?? "limite") as "limite" })} aria-label="Limite de detecção"
            data={[{ value: "limite", label: "<LD = valor do limite" }, { value: "metade", label: "<LD = metade" }, { value: "omitir", label: "<LD = sem valor" }]} />
        </Tooltip>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target><Button size="compact-sm" variant="default">Exportar</Button></Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Amostras e resultados (seleção atual)</Menu.Label>
            <Menu.Item onClick={() => baixar(`/minas/${mina.id}/geoop/registros.csv?${parametrosGeo(s)}`, "geoquimica_amostras.csv")}>Tabela CSV</Menu.Item>
            <Menu.Item onClick={() => baixar(`/minas/${mina.id}/geoop/registros.xlsx?${parametrosGeo(s)}`, "geoquimica_amostras.xlsx")}>Planilha Excel (com metadados)</Menu.Item>
            <Menu.Label>GIS (amostras com posição; furos como linhas 3D)</Menu.Label>
            <Menu.Item onClick={() => baixar(`/minas/${mina.id}/geoop/espacial.gpkg?${parametrosGeo(s)}`, "geoquimica_amostras.gpkg")}>GeoPackage (.gpkg)</Menu.Item>
            <Menu.Item onClick={() => baixar(`/minas/${mina.id}/geoop/espacial.geojson?${parametrosGeo(s)}`, "geoquimica_amostras.geojson")}>GeoJSON</Menu.Item>
            <Menu.Label>Relatório</Menu.Label>
            <Menu.Item onClick={() => ir("/geoop/relatorio")}>Relatório da seleção (imprimir / PDF)</Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
      <Tabs className="nao-imprimir" value={aba} onChange={(v) => ir(`/geoop/${v}`)} variant="outline" px="sm" pt={4} styles={{ tab: { padding: "6px 14px", fontSize: 13 } }}>
        <Tabs.List>
          <ActionIcon variant="subtle" size="md" mr={6} mt={2} onClick={() => s.set({ filtrosAbertos: !s.filtrosAbertos })} aria-label={s.filtrosAbertos ? "Recolher filtros" : "Mostrar filtros"}>
            {s.filtrosAbertos ? "⟨" : "⟩"}
          </ActionIcon>
          {ABAS.map((a) => <Tabs.Tab key={a.valor} value={a.valor}>{a.rotulo}</Tabs.Tab>)}
        </Tabs.List>
      </Tabs>
      <div style={{ display: "grid", gridTemplateColumns: `${s.filtrosAbertos ? "272px " : ""}minmax(0, 1fr)${s.selecionado ? " 380px" : ""}`, minHeight: 0 }}>
        {s.filtrosAbertos && <PainelFiltros dados={resumo.data} carregando={resumo.isFetching} />}
        <main style={{ overflow: "auto", minWidth: 0, padding: 10 }} data-testid="area-analitica">
          <Routes>
            <Route index element={<Navigate to="galerias" replace />} />
            <Route path="galerias" element={<Galerias mina={mina} />} />
            <Route path="sondagens" element={<Sondagens mina={mina} eu={eu} />} />
            <Route path="comparacao" element={<Comparacao mina={mina} />} />
            <Route path="espacial" element={<Espacial mina={mina} />} />
            <Route path="consulta" element={<Consulta mina={mina} eu={eu} />} />
            <Route path="relatorio" element={<Relatorio mina={mina} eu={eu} />} />
            <Route path="*" element={<Navigate to="galerias" replace />} />
          </Routes>
        </main>
        {s.selecionado && <PainelContexto mina={mina} eu={eu} chave={s.selecionado} />}
      </div>
    </div>
  );
}
