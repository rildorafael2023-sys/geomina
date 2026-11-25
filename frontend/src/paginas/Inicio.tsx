import { Badge, Group, List, Paper, Stack, Text, Title } from "@mantine/core";

import type { Eu } from "../api/cliente";

// Página inicial honesta: mostra apenas o que existe nesta versão.
// O painel com indicadores do banco entra quando houver módulos com dados (Etapa 4).
export function Inicio({ usuario }: { usuario: Eu }) {
  return (
    <Stack maw={760}>
      <Title order={3}>Olá, {usuario.nome}</Title>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text fw={600}>Versão 0.2 — Etapa 2 (infraestrutura)</Text>
          <Text size="sm">
            Disponível nesta versão: banco de dados local, usuários e permissões, registro de todas as alterações (auditoria) e
            armazenamento seguro de arquivos originais.
          </Text>
          <Group gap={4}>
            <Text size="sm" c="dimmed">
              Seus papéis:
            </Text>
            {usuario.papeis.map((p) => (
              <Badge key={p.codigo} variant="light">
                {p.nome}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Paper>
      <Paper withBorder p="md">
        <Text fw={600} mb="xs">
          Próximos módulos (ainda não disponíveis)
        </Text>
        <List size="sm">
          <List.Item>Estrutura operacional da mina (níveis, galerias, travessas, rampas, frentes)</List.Item>
          <List.Item>Mapeamento geológico com ficha digital</List.Item>
          <List.Item>Croquis, fotografias e documentos</List.Item>
          <List.Item>Amostragem (BS-RP, BMT-TS, BE) e laudos SGS</List.Item>
          <List.Item>Topografia SAD69/SIRGAS 2000, visualização 3D e análise longitudinal</List.Item>
        </List>
      </Paper>
    </Stack>
  );
}
