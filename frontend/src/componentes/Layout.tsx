import { AppShell, Avatar, Burger, Group, Menu, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAdjustmentsHorizontal, IconChevronDown, IconChevronRight, IconClipboardText, IconDatabaseExport, IconFlask, IconHierarchy2, IconHistory, IconInfoCircle, IconKey,
  IconLayoutDashboard, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconLogout, IconMap2, IconMapPin, IconPhoto, IconReportAnalytics, IconSettings, IconStack2,
  IconTestPipe, IconUsers, IconVocabulary,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { api, CRS_OPCOES, type Eu, type Mina } from "../api/cliente";
import "./layout.css";

interface Item { para: string; rotulo: string; icone: ReactNode; visivel: boolean }
interface Grupo { titulo: string; itens: Item[] }

const I = 17;

/** Nomes das subpáginas para o caminho na barra superior. */
const SUBPAGINAS: Record<string, string> = {
  "/sondagem/amostragem": "Amostragem geoquímica", "/sondagem/fotos": "Fotos de testemunho", "/sondagem/tracks": "Tracks geoquímicos", "/sondagem/furos": "Cadastro de furos",
  "/mapeamento/nova": "Nova ficha", "/mapeamento/ficha-em-branco": "Ficha em branco",
};
/** Páginas fora do menu lateral (acessadas pelo menu do usuário). */
const AVULSAS: Record<string, string> = { "/senha": "Trocar minha senha" };

export function Layout({ usuario, aoSair, children }: { usuario: Eu; aoSair: () => void; children: ReactNode }) {
  const [aberto, { toggle, close }] = useDisclosure();
  const local = useLocation();
  const estreito = useMediaQuery("(max-width: 1280px)");
  const [preferencia, setPreferencia] = useState<"aberto" | "recolhido" | null>(() => {
    try { return localStorage.getItem("geomina.menu") as "aberto" | "recolhido" | null; } catch { return null; }
  });
  const recolhido = preferencia ? preferencia === "recolhido" : !!estreito;
  const alternarMenu = () => {
    const v = recolhido ? "aberto" : "recolhido";
    setPreferencia(v);
    try { localStorage.setItem("geomina.menu", v); } catch { /* sem armazenamento */ }
  };
  const tem = (p: string) => usuario.permissoes.includes(p);
  const grupos: Grupo[] = [
    { titulo: "", itens: [{ para: "/", rotulo: "Painel", icone: <IconLayoutDashboard size={I} />, visivel: true }] },
    { titulo: "Mina", itens: [
      { para: "/estrutura", rotulo: "Estrutura da mina", icone: <IconHierarchy2 size={I} />, visivel: tem("estrutura:ler") },
      { para: "/topografia", rotulo: "Topografia", icone: <IconMap2 size={I} />, visivel: tem("topografia:ler") },
    ] },
    { titulo: "Geologia", itens: [
      { para: "/mapeamento", rotulo: "Mapeamento geológico", icone: <IconClipboardText size={I} />, visivel: tem("mapeamento:ler") },
      { para: "/sondagem", rotulo: "Sondagem", icone: <IconStack2 size={I} />, visivel: tem("sondagem:ler") },
    ] },
    { titulo: "Amostragem e química", itens: [
      { para: "/amostras", rotulo: "Amostras", icone: <IconTestPipe size={I} />, visivel: tem("amostra:ler") },
      { para: "/geoquimica", rotulo: "Laboratório (laudos)", icone: <IconFlask size={I} />, visivel: tem("geoquimica:ler") },
    ] },
    { titulo: "Documentos", itens: [
      { para: "/documentos", rotulo: "Fotos e croquis", icone: <IconPhoto size={I} />, visivel: tem("arquivo:ler") },
      { para: "/relatorios", rotulo: "Relatórios", icone: <IconReportAnalytics size={I} />, visivel: tem("mapeamento:ler") || tem("auditoria:ler") },
      { para: "/dicionarios", rotulo: "Dicionários", icone: <IconVocabulary size={I} />, visivel: true },
    ] },
    { titulo: "Administração", itens: [
      { para: "/configuracao/estrutura", rotulo: "Tipos e regras", icone: <IconAdjustmentsHorizontal size={I} />, visivel: tem("estrutura:configurar") },
      { para: "/usuarios", rotulo: "Usuários", icone: <IconUsers size={I} />, visivel: tem("usuario:gerenciar") },
      { para: "/auditoria", rotulo: "Histórico de alterações", icone: <IconHistory size={I} />, visivel: tem("auditoria:ler") },
      { para: "/backup", rotulo: "Backup", icone: <IconDatabaseExport size={I} />, visivel: tem("sistema:backup") },
      { para: "/sistema", rotulo: "Sistema", icone: <IconInfoCircle size={I} />, visivel: true },
    ] },
  ];
  const todos = grupos.flatMap((g) => g.itens.filter((i) => i.visivel).map((i) => ({ ...i, grupo: g.titulo })));
  const ativo = (p: string) => (p === "/" ? local.pathname === "/" : local.pathname === p || local.pathname.startsWith(p + "/"));
  const atual = [...todos].sort((a, b) => b.para.length - a.para.length).find((i) => ativo(i.para));
  const sub = Object.entries(SUBPAGINAS).find(([k]) => local.pathname.startsWith(k))?.[1]
    ?? (local.pathname.startsWith("/sondagem/furos/") ? "Ficha do furo" : local.pathname.match(/^\/mapeamento\/[^/]+/) ? "Ficha" : null);
  const minas = useQuery({ queryKey: ["minas"], queryFn: () => api<Mina[]>("/minas"), staleTime: 60_000 });
  const mina = minas.data?.[0];
  const crs = mina ? CRS_OPCOES.find((c) => c.value === String(mina.srid_trabalho))?.label ?? `EPSG:${mina.srid_trabalho}` : null;
  const iniciais = usuario.nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  const largura = recolhido ? 56 : 224;

  return (
    <AppShell header={{ height: 44 }} navbar={{ width: largura, breakpoint: "sm", collapsed: { mobile: !aberto } }} padding={0}>
      <AppShell.Header className="gm-topo">
        <Group h="100%" px={10} gap={8} wrap="nowrap">
          <Burger opened={aberto} onClick={toggle} hiddenFrom="sm" size="sm" color="#c3ccd6" aria-label="Menu" />
          <Link to="/" className="gm-marca" style={{ width: recolhido ? 36 : 204 }}>
            <img src="/favicon.png" alt="" width={22} height={22} />
            {!recolhido && <span>GeoMina</span>}
          </Link>
          <Tooltip label={recolhido ? "Mostrar menu" : "Recolher menu"}>
            <UnstyledButton visibleFrom="sm" className="gm-topo-botao" onClick={alternarMenu} aria-label={recolhido ? "Mostrar menu" : "Recolher menu"}>
              {recolhido ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
            </UnstyledButton>
          </Tooltip>
          <div className="gm-caminho" aria-label="Caminho">
            {atual?.grupo && <span className="gm-caminho-grupo">{atual.grupo}</span>}
            {atual?.grupo && <IconChevronRight size={13} />}
            {!atual && AVULSAS[local.pathname] ? <span>{AVULSAS[local.pathname]}</span> : <Link to={atual?.para ?? "/"}>{atual?.rotulo ?? "Painel"}</Link>}
            {sub && <><IconChevronRight size={13} /><span>{sub}</span></>}
          </div>
          <Group gap={10} ml="auto" wrap="nowrap">
            {mina && (
              <Tooltip label={`Sistema de coordenadas de trabalho: ${crs}`}>
                <div className="gm-contexto" >
                  <IconMapPin size={14} />
                  <b>{mina.codigo}</b>
                  <span className="gm-contexto-nome">{mina.nome}</span>
                  <span className="gm-contexto-crs">{crs}</span>
                </div>
              </Tooltip>
            )}
            <Menu position="bottom-end" width={220} withinPortal>
              <Menu.Target>
                <UnstyledButton className="gm-usuario" aria-label="Menu do usuário">
                  <Avatar size={26} radius="xl" color="geo" variant="filled">{iniciais}</Avatar>
                  <Text size="sm" visibleFrom="md" c="#e6ebf0">{usuario.nome}</Text>
                  <IconChevronDown size={14} />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{usuario.login} · {usuario.papeis?.map((p) => p.nome).join(", ")}</Menu.Label>
                <Menu.Item component={Link} to="/senha" leftSection={<IconKey size={15} />}>Trocar minha senha</Menu.Item>
                <Menu.Item component={Link} to="/sistema" leftSection={<IconSettings size={15} />}>Sobre o sistema</Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={15} />} onClick={aoSair}>Sair</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar className="gm-menu" data-recolhido={recolhido}>
        <AppShell.Section grow style={{ overflowY: "auto", paddingTop: 6 }}>
          {grupos.map((g) => {
            const itens = g.itens.filter((i) => i.visivel);
            if (!itens.length) return null;
            return (
              <div key={g.titulo || "inicio"} className="gm-menu-grupo">
                {g.titulo && (recolhido ? <div className="gm-menu-sep" /> : <div className="gm-menu-titulo">{g.titulo}</div>)}
                {itens.map((i) => {
                  const el = (
                    <Link key={i.para} to={i.para} className="gm-menu-item" data-ativo={ativo(i.para)} onClick={close} aria-label={i.rotulo}>
                      {i.icone}
                      {!recolhido && <span>{i.rotulo}</span>}
                    </Link>
                  );
                  return recolhido ? <Tooltip key={i.para} label={i.rotulo} position="right">{el}</Tooltip> : el;
                })}
              </div>
            );
          })}
        </AppShell.Section>
        {!recolhido && <div className="gm-menu-rodape">GeoMina · uso local neste computador</div>}
      </AppShell.Navbar>
      <AppShell.Main className="gm-trabalho">
        <div className="gm-trabalho-corpo">{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}
