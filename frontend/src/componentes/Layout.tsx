import { AppShell, Burger, Button, Group, NavLink, Text, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import type { Eu } from "../api/cliente";

export function Layout({ usuario, aoSair, children }: { usuario: Eu; aoSair: () => void; children: ReactNode }) {
  const [aberto, { toggle, close }] = useDisclosure();
  const local = useLocation();
  const itens = [
    { para: "/", rotulo: "Painel", visivel: true },
    { para: "/estrutura", rotulo: "Estrutura da mina", visivel: usuario.permissoes.includes("estrutura:ler") },
    { para: "/configuracao/estrutura", rotulo: "Tipos e regras", visivel: usuario.permissoes.includes("estrutura:configurar") },
    { para: "/usuarios", rotulo: "Usuários", visivel: usuario.permissoes.includes("usuario:gerenciar") },
    { para: "/auditoria", rotulo: "Histórico de alterações", visivel: usuario.permissoes.includes("auditoria:ler") },
    { para: "/backup", rotulo: "Backup", visivel: usuario.permissoes.includes("sistema:backup") },
    { para: "/sistema", rotulo: "Sistema", visivel: true },
    { para: "/senha", rotulo: "Trocar minha senha", visivel: true },
  ];
  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 230, breakpoint: "sm", collapsed: { mobile: !aberto } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={aberto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menu" />
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
            <NavLink key={i.para} component={Link} to={i.para} label={i.rotulo} active={local.pathname === i.para} onClick={close} />
          ))}
      </AppShell.Navbar>
      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
