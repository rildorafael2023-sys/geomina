import { Alert, Button, Group, Loader, SegmentedControl, Stack, Tabs, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { api, type Eu, type Mina } from "../../api/cliente";
import { AmostragemFuros } from "./Amostragem";
import { ImportarSondagem, ListaFuros, LogFuro, NovoFuro } from "./Cadastro";
import { FotosTestemunho } from "./Fotos";
import { PerfilDoFuro } from "./Perfil";
import { TracksGeoquimicos } from "./Tracks";
import { SondagemCtx, type FiltroTipo, type FuroResumo } from "./tipos";

const ABAS = [
  { valor: "perfil", rotulo: "Perfil do furo" },
  { valor: "amostragem", rotulo: "Amostragem geoquímica" },
  { valor: "fotos", rotulo: "Fotos de testemunho" },
  { valor: "tracks", rotulo: "Tracks geoquímicos" },
  { valor: "furos", rotulo: "Cadastro de furos" },
];

function ler<T>(k: string, padrao: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
}
function gravar(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ }
}

export function Sondagem({ eu }: { eu: Eu }) {
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas") });
  if (minas.isLoading) return <Loader />;
  const mina = minas.data?.[0];
  if (!mina) return <Alert color="yellow">Cadastre a mina antes de registrar sondagens.</Alert>;
  return <Area mina={mina} pode={eu.permissoes.includes("sondagem:importar")} />;
}

function Area({ mina, pode }: { mina: Mina; pode: boolean }) {
  const local = useLocation();
  const navegar = useNavigate();
  const furos = useQuery({ queryKey: ["furos", mina.id], queryFn: () => api<FuroResumo[]>(`/minas/${mina.id}/furos`) });
  const [filtro, setFiltro] = useState<FiltroTipo>(() => ler("geomina.sondagem.filtro", "todos"));
  const [furo, setFuroE] = useState<string | null>(() => ler("geomina.sondagem.furo", null));
  const [elementos, setElementosE] = useState<string[]>(() => ler("geomina.sondagem.elementos", []));
  const [novo, setNovo] = useState(false);
  const [importar, setImportar] = useState(false);
  const setFuro = (id: string | null) => { setFuroE(id); gravar("geomina.sondagem.furo", id); };
  const setElementos = (e: string[]) => { setElementosE(e); gravar("geomina.sondagem.elementos", e); };
  useEffect(() => gravar("geomina.sondagem.filtro", filtro), [filtro]);
  const todos = furos.data ?? [];
  const visiveis = todos.filter((f) => filtro === "todos" || f.tipo === filtro);
  // furo escolhido: o último aberto, senão o primeiro com amostras
  useEffect(() => {
    if (!todos.length) return;
    if (!furo || !visiveis.some((f) => f.id === furo)) setFuro((visiveis.find((f) => f.amostras > 0) ?? visiveis[0] ?? todos[0]).id);
  }, [furos.data, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const aba = local.pathname.replace(/^\/sondagem\/?/, "").split("/")[0];
  const ex = todos.filter((f) => f.tipo === "exploratorio").length, ina = todos.length - ex;
  return (
    <SondagemCtx.Provider value={{ mina, pode, filtro, furos: visiveis, furo, setFuro, elementos, setElementos }}>
      <Stack gap="xs">
        <Group justify="space-between" gap="xs" className="nao-imprimir">
          <Tabs value={aba === "" ? "perfil" : ABAS.some((a) => a.valor === aba) ? aba : "furos"} onChange={(v) => navegar(v === "perfil" ? "/sondagem" : `/sondagem/${v}`)} variant="pills" radius="xl">
            <Tabs.List>
              {ABAS.map((a) => <Tabs.Tab key={a.valor} value={a.valor}>{a.rotulo}</Tabs.Tab>)}
            </Tabs.List>
          </Tabs>
          <Group gap={6}>
            <SegmentedControl size="xs" value={filtro} onChange={(v) => setFiltro(v as FiltroTipo)}
              data={[{ value: "todos", label: `Todos os furos (${todos.length})` }, { value: "exploratorio", label: `Exploratórios (F) ${ex}` }, { value: "ina", label: `INA (água) ${ina}` }]} />
            {pode && <Button size="xs" variant="default" onClick={() => setNovo(true)}>Novo furo</Button>}
            {pode && <Button size="xs" onClick={() => setImportar(true)}>Importar</Button>}
          </Group>
        </Group>
        {furos.isLoading ? <Loader size="sm" /> : !todos.length && aba !== "furos" ? (
          <Alert color="gray">
            <Text size="sm">Nenhum furo cadastrado. Use <b>Importar</b> com as planilhas de collar, desvio, descrição geológica (com RQD e caixa, se tiver) e amostras, ou <b>Novo furo</b>.</Text>
          </Alert>
        ) : (
          <Routes>
            <Route index element={<PerfilDoFuro />} />
            <Route path="amostragem" element={<AmostragemFuros />} />
            <Route path="fotos" element={<FotosTestemunho />} />
            <Route path="tracks" element={<TracksGeoquimicos />} />
            <Route path="furos" element={<ListaFuros mina={mina} pode={pode} />} />
            <Route path="furos/:id" element={<FichaComId pode={pode} />} />
          </Routes>
        )}
      </Stack>
      {novo && <NovoFuro mina={mina} aoFechar={() => setNovo(false)} aoCriar={(id) => { setNovo(false); setFuro(id); navegar("/sondagem"); }} />}
      {importar && <ImportarSondagem mina={mina} fechar={() => setImportar(false)} />}
    </SondagemCtx.Provider>
  );
}

function FichaComId({ pode }: { pode: boolean }) {
  const { id } = useParams();
  return <LogFuro key={id} id={id!} pode={pode} />;
}
