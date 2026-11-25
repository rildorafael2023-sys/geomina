// Teste ponta a ponta da Etapa 4: painel, histórico de alterações, backup e restauração.
// Uso: node e2e/painel_backup.cjs http://127.0.0.1:PORTA [pasta_capturas]   (pasta de dados vazia)
const { chromium } = require("playwright");
const assert = require("assert");

const URL = process.argv[2];
const CAPTURAS = process.argv[3];
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  globalThis.__pagina = page;
  const shot = async (nome) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${nome}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  // chamadas diretas à API local com o token da sessão (para preparar dados rapidamente)
  const chamar = (metodo, caminho, corpo) =>
    page.evaluate(
      async ([metodo, caminho, corpo]) => {
        const r = await fetch("/api/v1" + caminho, {
          method: metodo,
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("geomina.token") },
          body: corpo ? JSON.stringify(corpo) : undefined,
        });
        return { status: r.status, corpo: await r.json().catch(() => null) };
      },
      [metodo, caminho, corpo],
    );
  const entrar = async () => {
    await page.getByLabel("Login").fill("admin");
    await page.getByLabel("Senha").fill(SENHA);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByText("Olá, Administrador").waitFor();
  };

  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();

  // 1. Painel vazio orienta o primeiro passo
  await page.getByText("Comece cadastrando a mina").waitFor();

  // dados: mina, N144 > GAL-01 > FR-01 com avanço
  const mina = (await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 })).corpo;
  const un = async (tipo, codigo, pai) =>
    (await chamar("POST", "/unidades", { mina_id: mina.id, tipo, codigo, nome: codigo, pai_id: pai ?? null })).corpo;
  const n144 = await un("NIVEL", "N144");
  const gal = await un("GALERIA", "GAL-01", n144.id);
  const fr = await un("FRENTE", "FR-01", gal.id);
  const hoje = new Date().toISOString().slice(0, 10);
  assert.strictEqual((await chamar("POST", `/unidades/${fr.id}/avancos`, { data: hoje, avanco_m: 3.2 })).status, 201);

  // 2. Painel com números reais
  await page.reload();
  await page.getByText("MINA01 — Mina 01").waitFor();
  const cartao = (rotulo) => page.locator(".mantine-Paper-root", { has: page.getByText(rotulo, { exact: true }) }).first();
  assert.match(await cartao("Unidades ativas").innerText(), /\n3\b/);
  assert.match(await cartao("Frentes ativas").innerText(), /\n1\b/);
  assert.match(await cartao("Avanço em 30 dias").innerText(), /3,2 m/);
  await page.getByRole("cell", { name: "+3,2 m" }).waitFor();
  await shot("e4-01-painel");

  // 3. Histórico de alterações com filtro e detalhes
  await page.getByRole("link", { name: "Histórico de alterações" }).click();
  await page.getByLabel("Contém o texto").fill("GAL-01");
  await page.getByText("1 registro(s)").waitFor();
  await page.getByRole("button", { name: "detalhes" }).first().click();
  await page.getByRole("dialog").getByText("codigo").waitFor();
  await shot("e4-02-auditoria");
  await page.keyboard.press("Escape");

  // 4. Backup completo
  await page.getByRole("link", { name: "Backup" }).click();
  await page.getByRole("button", { name: "Fazer backup" }).click();
  await page.getByText(/Backup geomina-.*-completo\.zip criado/).waitFor();
  await page.getByRole("cell", { name: "banco + arquivos · por Administrador" }).waitFor();
  await shot("e4-03-backup");

  // 5. Depois do backup, cria N567; restaurar deve removê-lo
  await un("NIVEL", "N567");
  await page.reload();
  const linhaCompleto = page.getByRole("row").filter({ hasText: "banco + arquivos · por Administrador" }).first();
  await linhaCompleto.getByRole("button", { name: "restaurar" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Sua senha").fill(SENHA);
  assert.ok(await d.getByRole("button", { name: "Restaurar" }).isDisabled(), "botão deveria exigir a confirmação");
  await d.getByLabel("Digite RESTAURAR para confirmar").fill("RESTAURAR");
  await d.getByRole("button", { name: "Restaurar" }).click();
  await page.getByRole("button", { name: "Entrar" }).waitFor({ timeout: 60000 });
  await entrar();
  const unidades = (await chamar("GET", `/minas/${mina.id}/unidades`)).corpo.map((u) => u.codigo).sort();
  assert.deepStrictEqual(unidades, ["FR-01", "GAL-01", "N144"]);
  const backups = (await chamar("GET", "/backups")).corpo.map((b) => b.tipo);
  assert.ok(backups.includes("antes-restauracao"), "backup de segurança ausente");
  const eventos = (await chamar("GET", "/auditoria?operacao=R")).corpo;
  assert.strictEqual(eventos.total, 1);

  // 6. Geólogo não vê Backup nem Histórico
  await chamar("POST", "/usuarios", { login: "geo1", nome: "Geo Um", senha: "provisoria1", papeis: ["GEOLOGO"] });
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByLabel("Login").fill("geo1");
  await page.getByLabel("Senha").fill("provisoria1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByLabel("Senha atual").fill("provisoria1");
  await page.getByLabel(/^Nova senha/).fill("minhaSenha789");
  await page.getByLabel("Confirme a nova senha").fill("minhaSenha789");
  await page.getByRole("button", { name: "Salvar" }).click();
  await page.getByLabel("Login").fill("geo1");
  await page.getByLabel("Senha").fill("minhaSenha789");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Olá, Geo Um").waitFor();
  assert.strictEqual(await page.getByRole("link", { name: "Backup" }).count(), 0);
  assert.strictEqual(await page.getByRole("link", { name: "Histórico de alterações" }).count(), 0);
  await page.getByText("Unidades ativas").waitFor();

  // 7. Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText("Unidades ativas").waitFor();
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(extra <= 0, `rolagem horizontal de ${extra}px`);
  await shot("e4-04-celular");

  assert.deepStrictEqual(erros, [], "erros no console da página");
  await browser.close();
  console.log("E2E PAINEL/BACKUP OK: 7 cenários aprovados");
})().catch(async (e) => {
  console.error("E2E PAINEL/BACKUP FALHOU:", e);
  if (CAPTURAS && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: `${CAPTURAS}/falha.png` }).catch(() => {});
  process.exit(1);
});
