import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { api, dataHora, ErroApi, json, type Eu, type Papel, type Usuario } from "../api/cliente";
import { IconEdit, IconKey, IconPlus, IconUsers } from "@tabler/icons-react";
import { Pagina, Painel, TabelaDados } from "../componentes/ui";

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
    <Pagina titulo="Usuários" icone={<IconUsers size={20} />} subtitulo="Quem pode entrar no GeoMina neste computador e o que cada um pode fazer (papéis)"
      acoes={<Button leftSection={<IconPlus size={14} />} onClick={() => abrir("novo")}>Novo usuário</Button>}>
      {usuarios.error && <Alert color="red">Não foi possível carregar os usuários.</Alert>}
      <Painel p={0}>
        <TabelaDados dados={usuarios.data ?? []} chave={(u) => u.id} busca minLargura={720}
          colunas={[
            { chave: "nome", titulo: "Nome", valor: (u) => u.nome, render: (u) => <Text size="sm" fw={600}>{u.nome}</Text> },
            { chave: "login", titulo: "Login", valor: (u) => u.login },
            { chave: "email", titulo: "E-mail", valor: (u) => u.email ?? "" },
            { chave: "papeis", titulo: "Papéis", valor: (u) => u.papeis.map((p) => p.nome).join(", "), render: (u) => u.papeis.map((p) => <Badge key={p.codigo} mr={4}>{p.nome}</Badge>) },
            { chave: "ultimo", titulo: "Último acesso", valor: (u) => u.ultimo_acesso ?? "", render: (u) => (u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "—") },
            { chave: "ativo", titulo: "Situação", valor: (u) => (u.ativo ? "Ativo" : "Inativo"), render: (u) => (u.ativo ? <Badge color="green">Ativo</Badge> : <Badge color="gray">Inativo</Badge>) },
            { chave: "acoes", titulo: "", ordenavel: false, render: (u) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                <Button size="compact-xs" variant="subtle" leftSection={<IconEdit size={12} />} onClick={() => abrir(u)}>Editar</Button>
                <Button size="compact-xs" variant="subtle" leftSection={<IconKey size={12} />} onClick={() => { setErro(null); setNovaSenha(""); setSenhaDe(u); }}>Redefinir senha</Button>
              </Group>) },
          ]} />
      </Painel>

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
    </Pagina>
  );
}
