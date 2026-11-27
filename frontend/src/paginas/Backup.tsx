import { Alert, Badge, Button, Group, Loader, Modal, Paper, PasswordInput, ScrollArea, Stack, Switch, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { api, baixar, dataHora, ErroApi, json, tamanhoLegivel, type Backup as TBackup } from "../api/cliente";
import { IconDatabaseExport } from "@tabler/icons-react";
import { Pagina } from "../componentes/ui";

const TIPOS: Record<string, { rotulo: string; cor: string }> = {
  completo: { rotulo: "Completo", cor: "teal" },
  diario: { rotulo: "Diário automático", cor: "blue" },
  semanal: { rotulo: "Semanal completo", cor: "indigo" },
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
    <Pagina titulo="Backup e restauração" icone={<IconDatabaseExport size={20} />} subtitulo={<>Todos os dados ficam neste computador. Faça backups completos com frequência e guarde uma cópia fora dele (pendrive ou disco externo).</>}>
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

      <BackupAutomatico aoErro={setErro} />

      <Paper withBorder p="md">
        <Text fw={600} mb="xs">Backups disponíveis</Text>
        <Text size="xs" c="dimmed" mb="sm">
          Também são feitos sozinhos: um backup antes de cada atualização do aplicativo e outro antes de cada restauração. "Testar" confere o backup sem alterar os dados em uso.
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
                        {b.nome.endsWith(".zip") && <Testar nome={b.nome} />}
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
    </Pagina>
  );
}

interface ItemEstado { nome: string; criado_em: string; teste: { ok: boolean; detalhe: string }; copia?: { ok: boolean; destino: string; erro?: string } }
interface Agenda { agenda: { semanal_completo: boolean; pasta_copia: string | null }; estado: { diario?: ItemEstado; semanal?: ItemEstado; verificado_em?: string } }

function Testar({ nome }: { nome: string }) {
  const m = useMutation({ mutationFn: () => api<{ ok: boolean; detalhe: string }>(`/backups/${encodeURIComponent(nome)}/testar`, { method: "POST" }) });
  if (m.data) return <Badge color={m.data.ok ? "teal" : "red"} variant="light" title={m.data.detalhe}>{m.data.ok ? "íntegro" : "com defeito"}</Badge>;
  return <Button size="compact-xs" variant="subtle" loading={m.isPending} onClick={() => m.mutate()}>testar</Button>;
}

function LinhaEstado({ rotulo, item }: { rotulo: string; item?: ItemEstado }) {
  if (!item) return <Text size="sm">{rotulo}: <Text span c="dimmed">ainda não feito</Text></Text>;
  return (
    <Group gap="xs" wrap="wrap">
      <Text size="sm">{rotulo}: <b>{dataHora(item.criado_em)}</b></Text>
      <Badge size="sm" color={item.teste.ok ? "teal" : "red"} title={item.teste.detalhe}>{item.teste.ok ? "restauração testada" : "teste falhou"}</Badge>
      {item.copia && <Badge size="sm" color={item.copia.ok ? "teal" : "orange"} title={item.copia.erro ?? item.copia.destino}>{item.copia.ok ? "cópia feita" : "cópia não feita"}</Badge>}
      {item.copia && !item.copia.ok && <Text size="xs" c="orange">{item.copia.erro}</Text>}
      {!item.teste.ok && <Text size="xs" c="red">{item.teste.detalhe}</Text>}
    </Group>
  );
}

function BackupAutomatico({ aoErro }: { aoErro: (e: string | null) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["backup-agenda"], queryFn: () => api<Agenda>("/backups/agenda") });
  const [pasta, setPasta] = useState<string | null>(null);
  const [semanal, setSemanal] = useState<boolean | null>(null);
  const salvar = useMutation({
    mutationFn: () => api<Agenda>("/backups/agenda", { method: "PUT", body: json({ semanal_completo: semanal ?? q.data?.agenda.semanal_completo ?? true, pasta_copia: (pasta ?? q.data?.agenda.pasta_copia ?? "") || null }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["backup-agenda"] }); setPasta(null); setSemanal(null); notifications.show({ color: "teal", message: "Preferências do backup automático salvas." }); },
    onError: (e) => aoErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });
  if (q.isLoading || !q.data) return <Loader size="sm" />;
  const a = q.data.agenda, e = q.data.estado;
  return (
    <Paper withBorder p="md" data-testid="backup-automatico">
      <Stack gap="xs">
        <Text fw={600}>Backup automático</Text>
        <Text size="sm" c="dimmed">
          Enquanto o GeoMina estiver aberto (e ao abrir), ele faz sozinho um backup <b>diário</b> do banco (guarda 14) e, se ativado, um backup <b>semanal completo</b> com
          os arquivos originais (guarda 4). Cada backup é <b>testado</b> (restauração simulada, sem mexer nos dados) e, se houver, <b>copiado</b> para a segunda pasta.
        </Text>
        <LinhaEstado rotulo="Último diário" item={e.diario} />
        <LinhaEstado rotulo="Último semanal completo" item={e.semanal} />
        <Switch label="Fazer também o backup semanal completo (com fotos, croquis e laudos)" checked={semanal ?? a.semanal_completo} onChange={(ev) => setSemanal(ev.currentTarget.checked)} />
        <TextInput label="Segunda pasta para cópia automática" description="Pendrive, HD externo ou pasta da rede (ex.: E:\\Backups GeoMina). Se não estiver conectada, o backup é feito assim mesmo e a cópia fica para a próxima vez."
          placeholder="nenhuma" value={pasta ?? a.pasta_copia ?? ""} onChange={(ev) => setPasta(ev.currentTarget.value)} />
        <Group><Button variant="light" loading={salvar.isPending} disabled={pasta === null && semanal === null} onClick={() => { aoErro(null); salvar.mutate(); }}>Salvar preferências</Button></Group>
      </Stack>
    </Paper>
  );
}
