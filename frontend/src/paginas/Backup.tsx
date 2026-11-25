import { Alert, Badge, Button, Group, Loader, Modal, Paper, PasswordInput, ScrollArea, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, baixar, dataHora, ErroApi, json, tamanhoLegivel, type Backup as TBackup } from "../api/cliente";

const TIPOS: Record<string, { rotulo: string; cor: string }> = {
  completo: { rotulo: "Completo", cor: "teal" },
  diario: { rotulo: "Diário automático", cor: "blue" },
  "antes-restauracao": { rotulo: "Antes de restaurar", cor: "orange" },
  "antes-migracao": { rotulo: "Antes de atualizar", cor: "gray" },
};

export function Backup({ aoRestaurar }: { aoRestaurar: () => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const lista = useQuery({ queryKey: ["backups"], queryFn: () => api<TBackup[]>("/backups") });
  const [destino, setDestino] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [restaurar, setRestaurar] = useState<TBackup | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");

  const criar = useMutation({
    mutationFn: () => api<{ backup: TBackup; copia: string | null }>("/backups", { method: "POST", body: json({ copiar_para: destino.trim() || null }) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      notifications.show({ color: "teal", message: r.copia ? `Backup criado e copiado para ${r.copia}.` : `Backup ${r.backup.nome} criado.` });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao criar o backup."),
  });
  const abrir = useMutation({
    mutationFn: () => api<{ pasta: string; aberta: boolean }>("/backups/abrir-pasta", { method: "POST" }),
    onSuccess: (r) => !r.aberta && notifications.show({ message: `Pasta de backups: ${r.pasta}` }),
  });
  const restaurarM = useMutation({
    mutationFn: () => api<{ restaurado: string; backup_de_seguranca: string }>("/backups/restaurar", { method: "POST", body: json({ nome: restaurar!.nome, senha, confirmacao }) }),
    onSuccess: (r) => {
      setRestaurar(null);
      notifications.show({ color: "teal", autoClose: 8000, message: `Dados restaurados de ${r.restaurado}. O estado anterior foi guardado em ${r.backup_de_seguranca}. Entre novamente.` });
      // os dados mudaram por completo: volta ao painel e exige novo login
      navegar("/");
      aoRestaurar();
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha na restauração."),
  });

  return (
    <Stack>
      <div>
        <Title order={3}>Backup e restauração</Title>
        <Text size="sm" c="dimmed">
          Todos os dados ficam neste computador. Faça backups completos com frequência e guarde uma cópia fora dele (pendrive ou disco externo).
        </Text>
      </div>
      {erro && <Alert color="red" withCloseButton onClose={() => setErro(null)}>{erro}</Alert>}

      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text fw={600}>Fazer backup completo agora</Text>
          <Text size="sm" c="dimmed">Inclui o banco de dados e todos os arquivos originais (croquis, fotos, laudos).</Text>
          <TextInput
            label="Copiar também para (opcional)"
            description="Pasta de um pendrive ou disco externo, ex.: E:\ ou E:\Backups GeoMina"
            value={destino}
            onChange={(e) => setDestino(e.currentTarget.value)}
          />
          <Group>
            <Button loading={criar.isPending} onClick={() => { setErro(null); criar.mutate(); }}>Fazer backup</Button>
            <Button variant="light" onClick={() => abrir.mutate()}>Abrir pasta de backups</Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Text fw={600} mb="xs">Backups disponíveis</Text>
        <Text size="xs" c="dimmed" mb="sm">
          O GeoMina faz sozinho um backup diário do banco (mantém os 14 mais recentes), um backup antes de cada atualização e outro antes de cada restauração.
        </Text>
        {lista.isLoading ? (
          <Loader size="sm" />
        ) : (
          <ScrollArea>
            <Table striped miw={640}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Tamanho</Table.Th>
                  <Table.Th>Conteúdo</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(lista.data ?? []).map((b) => (
                  <Table.Tr key={b.nome}>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>{dataHora(b.criado_em)}</Table.Td>
                    <Table.Td><Badge variant="light" color={TIPOS[b.tipo]?.cor ?? "gray"}>{TIPOS[b.tipo]?.rotulo ?? b.tipo}</Badge></Table.Td>
                    <Table.Td>{tamanhoLegivel(b.tamanho)}</Table.Td>
                    <Table.Td fz="xs">{b.com_arquivos ? "banco + arquivos" : "só o banco"}{b.usuario ? ` · por ${b.usuario}` : ""}</Table.Td>
                    <Table.Td>
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Button size="compact-xs" variant="subtle" onClick={() => baixar(`/backups/${encodeURIComponent(b.nome)}/download`, b.nome).catch(() => setErro("Falha ao baixar."))}>
                          baixar
                        </Button>
                        {b.nome.endsWith(".zip") && (
                          <Button size="compact-xs" variant="subtle" color="orange" onClick={() => { setErro(null); setSenha(""); setConfirmacao(""); setRestaurar(b); }}>
                            restaurar
                          </Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Paper>

      <Modal opened={restaurar !== null} onClose={() => setRestaurar(null)} title="Restaurar backup">
        {restaurar && (
          <Stack>
            {erro && <Alert color="red">{erro}</Alert>}
            <Alert color="orange">
              Todos os dados atuais serão substituídos pelos do backup de {dataHora(restaurar.criado_em)}. O que foi feito depois dessa data
              deixará de aparecer. Antes disso, o GeoMina guarda automaticamente um backup completo do estado atual.
            </Alert>
            {!restaurar.com_arquivos && (
              <Text size="sm" c="dimmed">Este backup tem só o banco: os arquivos originais atuais são mantidos.</Text>
            )}
            <PasswordInput label="Sua senha" value={senha} onChange={(e) => setSenha(e.currentTarget.value)} />
            <TextInput label='Digite RESTAURAR para confirmar' value={confirmacao} onChange={(e) => setConfirmacao(e.currentTarget.value)} />
            <Button color="orange" disabled={confirmacao !== "RESTAURAR" || !senha} loading={restaurarM.isPending} onClick={() => { setErro(null); restaurarM.mutate(); }}>
              Restaurar
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
