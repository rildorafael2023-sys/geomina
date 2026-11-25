// Teste ponta a ponta da Etapa 2: aplicativo real (python -m geomina) + navegador Chromium.
// Uso: node e2e/fluxo_basico.cjs http://127.0.0.1:PORTA [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");

const URL = process.argv[2];
const CAPTURAS = process.argv[3];
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const shot = async (nome) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${nome}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));

  // 1. Primeiro acesso: criar administrador
  await page.goto(URL);
  await page.getByText("Primeiro acesso").waitFor();
  await shot("01-primeiro-acesso");
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador da Mina");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador da Mina").waitFor();
  await shot("02-inicio");

  // 2. Página Sistema mostra dados reais do backend
  await page.getByRole("link", { name: "Sistema" }).click();
  await page.getByText("SIRGAS 2000 / UTM 23S (EPSG:31983)").waitFor();
  assert.ok(await page.getByText("local (somente este computador)").isVisible());
  await shot("03-sistema");

  // 3. Criar um geólogo
  await page.getByRole("link", { name: "Usuários" }).click();
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Login").fill("joao.geologo");
  await modal.getByLabel("Nome").fill("João Geólogo");
  await modal.getByLabel("Senha inicial").fill("provisoria1");
  await modal.getByRole("button", { name: "Salvar" }).click();
  await page.getByRole("cell", { name: "joao.geologo" }).waitFor();
  await shot("04-usuarios");

  // 4. Sair e entrar como geólogo: troca de senha obrigatória
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByLabel("Login").fill("joao.geologo");
  await page.getByLabel("Senha").fill("provisoria1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Defina uma nova senha").waitFor();
  await page.getByLabel("Senha atual").fill("provisoria1");
  await page.getByLabel(/^Nova senha/).fill("minhaSenha789");
  await page.getByLabel("Confirme a nova senha").fill("minhaSenha789");
  await page.getByRole("button", { name: "Salvar" }).click();

  // 5. Entrar com a nova senha; geólogo não vê administração de usuários
  await page.getByRole("button", { name: "Entrar" }).waitFor();
  await page.getByLabel("Login").fill("joao.geologo");
  await page.getByLabel("Senha").fill("minhaSenha789");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Olá, João Geólogo").waitFor();
  assert.strictEqual(await page.getByRole("link", { name: "Usuários" }).count(), 0);

  // 6. Senha errada mostra mensagem
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByLabel("Login").fill("joao.geologo");
  await page.getByLabel("Senha").fill("errada000");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Login ou senha incorretos.").waitFor();

  // 7. Largura de tablet/celular sem rolagem horizontal
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByLabel("Login").fill("admin");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Olá, Administrador da Mina").waitFor();
  const larguraExtra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(larguraExtra <= 0, `rolagem horizontal de ${larguraExtra}px no celular`);
  await shot("05-celular");

  assert.deepStrictEqual(erros, [], "erros de JavaScript na página");
  await browser.close();
  console.log("E2E OK: 7 cenários aprovados");
})().catch((e) => {
  console.error("E2E FALHOU:", e);
  process.exit(1);
});
