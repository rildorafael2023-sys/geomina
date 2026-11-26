import { AppShell, Burger, Button, Group, NavLink, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import type { Eu } from "../api/cliente";

export function Layout({ usuario, aoSair, children }: { usuario: Eu; aoSair: () => void; children: ReactNode }) {
  const [aberto, { toggle, close }] = useDisclosure();
  const local = useLocation();
  const trabalho = local.pathname.startsWith("/geoop"); // áreas de trabalho usam a tela inteira
  const [recolhido, setRecolhido] = useState<boolean>(() => { try { return localStorage.getItem("geomina.menu") === "recolhido"; } catch { return false; } });
  const alternarMenu = () => setRecolhido((r) => { try { localStorage.setItem("geomina.menu", r ? "aberto" : "recolhido"); } catch { /* sem armazenamento */ } return !r; });
  const itens = [
    { para: "/", rotulo: "Painel", visivel: true },
    { para: "/estrutura", rotulo: "Estrutura da mina", visivel: usuario.permissoes.includes("estrutura:ler") },
    { para: "/mapeamento", rotulo: "Mapeamento geológico", visivel: usuario.permissoes.includes("mapeamento:ler") },
    { para: "/amostras", rotulo: "Amostras", visivel: usuario.permissoes.includes("amostra:ler") },
    { para: "/geoop", rotulo: "Geoquímica operacional", visivel: usuario.permissoes.includes("geoquimica:ler") },
    { para: "/geoquimica", rotulo: "Laboratório (laudos)", visivel: usuario.permissoes.includes("geoquimica:ler") },
    { para: "/topografia", rotulo: "Topografia", visivel: usuario.permissoes.includes("topografia:ler") },
    { para: "/relatorios", rotulo: "Relatórios", visivel: usuario.permissoes.includes("mapeamento:ler") || usuario.permissoes.includes("auditoria:ler") },
    { para: "/documentos", rotulo: "Fotos e croquis", visivel: usuario.permissoes.includes("arquivo:ler") },
    { para: "/dicionarios", rotulo: "Dicionários", visivel: true },
    { para: "/configuracao/estrutura", rotulo: "Tipos e regras", visivel: usuario.permissoes.includes("estrutura:configurar") },
    { para: "/usuarios", rotulo: "Usuários", visivel: usuario.permissoes.includes("usuario:gerenciar") },
    { para: "/auditoria", rotulo: "Histórico de alterações", visivel: usuario.permissoes.includes("auditoria:ler") },
    { para: "/backup", rotulo: "Backup", visivel: usuario.permissoes.includes("sistema:backup") },
    { para: "/sistema", rotulo: "Sistema", visivel: true },
    { para: "/senha", rotulo: "Trocar minha senha", visivel: true },
  ];
  return (
    <AppShell header={{ height: 48 }} navbar={{ width: 220, breakpoint: "sm", collapsed: { mobile: !aberto, desktop: recolhido } }} padding={trabalho ? 0 : "md"}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={aberto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu" />
            <Burger opened={!recolhido} onClick={alternarMenu} visibleFrom="sm" size="sm" aria-label={recolhido ? "Mostrar menu" : "Recolher menu"} />
            <Title order={4}>GeoMina</Title>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" visibleFrom="xs">
              {usuario.nome}
            </Text>
            <Button variant="light" size="xs" onClick={aoSair}>
              Sair
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {itens
          .filter((i) => i.visivel)
          .map((i) => (
            <NavLink key={i.para} component={Link} to={i.para} label={i.rotulo} active={i.para === "/" ? local.pathname === "/" : local.pathname.startsWith(i.para)} onClick={close} />
          ))}
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
