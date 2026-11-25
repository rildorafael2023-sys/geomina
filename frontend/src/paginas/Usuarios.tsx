import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  ScrollArea,
  Stack,
  Switch,
  Table,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, ErroApi, json, type Eu, type Papel, type Usuario } from "../api/cliente";

type Form = { login: string; nome: string; email: string; senha: string; papeis: string[]; ativo: boolean };
const VAZIO: Form = { login: "", nome: "", email: "", senha: "", papeis: ["GEOLOGO"], ativo: true };

export function Usuarios({ eu }: { eu: Eu }) {
  const qc = useQueryClient();
  const usuarios = useQuery({ queryKey: ["usuarios"], queryFn: () => api<Usuario[]>("/usuarios") });
  const papeis = useQuery({ queryKey: ["papeis"], queryFn: () => api<Papel[]>("/papeis") });
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  const [senhaDe, setSenhaDe] = useState<Usuario | null>(null);
  const [f, setF] = useState<Form>(VAZIO);
  const [novaSenha, setNovaSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");

  const abrir = (u: Usuario | "novo") => {
    setErro(null);
    setEditando(u);
    setTitulo(u === "novo" ? "Novo usuário" : "Editar usuário");
    setF(u === "novo" ? VAZIO : { ...VAZIO, login: u.login, nome: u.nome, email: u.email ?? "", papeis: u.papeis.map((p) => p.codigo), ativo: u.ativo });
  };

  const salvar = useMutation({
    mutationFn: () =>
      editando === "novo"
        ? api("/usuarios", { method: "POST", body: json({ login: f.login, nome: f.nome, email: f.email || null, senha: f.senha, papeis: f.papeis }) })
        : api(`/usuarios/${(editando as Usuario).id}`, {
            method: "PATCH",
            body: json({ versao: (editando as Usuario).versao, nome: f.nome, email: f.email || null, papeis: f.papeis, ativo: f.ativo }),
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setEditando(null);
      notifications.show({ color: "teal", message: "Usuário salvo." });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao salvar."),
  });

  const redefinir = useMutation({
    mutationFn: () => api(`/usuarios/${senhaDe!.id}/senha`, { method: "POST", body: json({ nova_senha: novaSenha }) }),
    onSuccess: () => {
      setSenhaDe(null);
      notifications.show({ color: "teal", message: "Senha redefinida. O usuário deverá trocá-la no próximo acesso." });
    },
    onError: (e) => setErro(e instanceof ErroApi ? e.message : "Falha ao redefinir."),
  });

  const opcoesPapeis = (papeis.data ?? []).map((p) => ({ value: p.codigo, label: p.nome }));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={3}>Usuários</Title>
        <Button onClick={() => abrir("novo")}>Novo usuário</Button>
      </Group>
      {usuarios.error && <Alert color="red">Não foi possível carregar os usuários.</Alert>}
      <ScrollArea>
        <Table striped highlightOnHover miw={640}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nome</Table.Th>
              <Table.Th>Login</Table.Th>
              <Table.Th>Papéis</Table.Th>
              <Table.Th>Situação</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(usuarios.data ?? []).map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.nome}</Table.Td>
                <Table.Td>{u.login}</Table.Td>
                <Table.Td>
                  {u.papeis.map((p) => (
                    <Badge key={p.codigo} variant="light" mr={4}>
                      {p.nome}
                    </Badge>
                  ))}
                </Table.Td>
                <Table.Td>{u.ativo ? <Badge color="teal">Ativo</Badge> : <Badge color="gray">Inativo</Badge>}</Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Button size="xs" variant="subtle" onClick={() => abrir(u)}>
                      Editar
                    </Button>
                    <Button size="xs" variant="subtle" onClick={() => { setErro(null); setNovaSenha(""); setSenhaDe(u); }}>
                      Redefinir senha
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Modal opened={editando !== null} onClose={() => setEditando(null)} title={titulo}>
        <Stack>
          {erro && <Alert color="red">{erro}</Alert>}
          <TextInput label="Login" value={f.login} disabled={editando !== "novo"} onChange={(e) => setF({ ...f, login: e.currentTarget.value })} required />
          <TextInput label="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.currentTarget.value })} required />
          <TextInput label="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
          {editando === "novo" && (
            <PasswordInput label="Senha inicial" description="O usuário deverá trocá-la no primeiro acesso" value={f.senha} onChange={(e) => setF({ ...f, senha: e.currentTarget.value })} required />
          )}
          <MultiSelect label="Papéis" data={opcoesPapeis} value={f.papeis} onChange={(v) => setF({ ...f, papeis: v })} required />
          {editando !== "novo" && (
            <Switch label="Ativo" checked={f.ativo} disabled={editando !== null && editando.id === eu.id} onChange={(e) => setF({ ...f, ativo: e.currentTarget.checked })} />
          )}
          <Button loading={salvar.isPending} onClick={() => { setErro(null); salvar.mutate(); }}>
            Salvar
          </Button>
        </Stack>
      </Modal>

      <Modal opened={senhaDe !== null} onClose={() => setSenhaDe(null)} title={`Redefinir senha de ${senhaDe?.nome ?? ""}`}>
        <Stack>
          {erro && <Alert color="red">{erro}</Alert>}
          <PasswordInput label="Nova senha provisória" value={novaSenha} onChange={(e) => setNovaSenha(e.currentTarget.value)} required />
          <Button loading={redefinir.isPending} onClick={() => { setErro(null); redefinir.mutate(); }}>
            Redefinir
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
