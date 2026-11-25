// Teste ponta a ponta da Etapa 3: estrutura da mina pela interface, com o aplicativo real.
// Uso: node e2e/estrutura.cjs http://127.0.0.1:PORTA [pasta_capturas]   (pasta de dados vazia)
const { chromium } = require("playwright");
const assert = require("assert");

const URL = process.argv[2];
const CAPTURAS = process.argv[3];
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  const shot = async (nome) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${nome}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  // Respostas 4xx esperadas (ex.: regra recusada no cenário 7) aparecem como "Failed to load resource"; não são erros de JavaScript.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));

  // Administrador
  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();

  // 1. Cadastro da mina (SIRGAS 2000 por padrão)
  await page.getByRole("link", { name: "Estrutura da mina" }).click();
  await page.getByText("Cadastrar a mina").waitFor();
  await page.getByLabel("Código").fill("MINA01");
  await page.getByLabel("Nome").fill("Mina 01");
  await page.getByRole("button", { name: "Cadastrar mina" }).click();
  await page.getByText("coordenadas em SIRGAS 2000 / UTM zone 23S").waitFor();

  const dialogo = () => page.getByRole("dialog");
  async function criar(tipo, codigo, nome) {
    const d = dialogo();
    await d.waitFor();
    if (tipo) {
      await d.getByLabel("Tipo").click();
      await page.getByRole("option", { name: tipo, exact: true }).click();
    }
    await d.getByLabel("Código").fill(codigo);
    if (nome) await d.getByLabel("Nome", { exact: true }).fill(nome);
    await d.getByRole("button", { name: "Salvar" }).click();
    await page.getByText(`Unidade ${codigo} cadastrada (${tipo}).`).first().waitFor();
    await dialogo().waitFor({ state: "hidden" });
  }
  const selecionar = (texto) => page.getByRole("tree").getByText(texto, { exact: false }).first().click();

  // 2. Níveis na raiz
  for (const n of ["N144", "N567"]) {
    await page.getByRole("button", { name: "Nova unidade na raiz" }).click();
    await criar("Nível", n);
  }
  // 3. Galeria > Travessa > Frente dentro do N144 (o formulário só oferece tipos permitidos)
  await selecionar("N144");
  await page.getByRole("button", { name: "Nova unidade dentro" }).click();
  await dialogo().getByLabel("Tipo").click();
  const opcoes = await page.getByRole("option").allTextContents();
  assert.ok(!opcoes.includes("Nível"), "Nível não deveria ser oferecido dentro de nível");
  await page.keyboard.press("Escape");
  await criar("Galeria", "GAL-01", "Galeria principal");
  await page.getByRole("button", { name: "Nova unidade dentro" }).click();
  await criar("Travessa", "TR-1F", "Travessa 1F");
  await page.getByRole("button", { name: "Nova unidade dentro" }).click();
  await criar("Frente", "FR-1F");

  // 4. Avanço da frente (selecionada após criar; aba Avanços aberta por padrão)
  await page.getByText("Registrar avanço").waitFor();
  await page.getByLabel("Data").fill("2026-10-14");
  await page.getByLabel(/^Distância/).fill("26");
  await page.getByLabel("Referência da distância").fill("entrada da travessa");
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.getByRole("cell", { name: "entrada da travessa" }).waitFor();
  await page.getByRole("cell", { name: "26 m" }).waitFor();
  await shot("e3-01-frente-avancos");

  // 5. Rampa multinível ligada aos dois níveis
  await page.getByRole("button", { name: "Nova unidade na raiz" }).click();
  const d = dialogo();
  await d.getByLabel("Tipo").click();
  await page.getByRole("option", { name: "Rampa", exact: true }).click();
  await d.getByLabel("Código").fill("RAMPA-SUL");
  await d.getByLabel("Níveis que esta unidade atravessa").click();
  await page.getByRole("option", { name: /N144/ }).click();
  await page.getByRole("option", { name: /N567/ }).click();
  await page.keyboard.press("Escape");
  await d.getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Unidade RAMPA-SUL cadastrada (Rampa).").waitFor();
  await page.getByRole("tabpanel").getByText("N567").waitFor();

  // 6. Histórico da travessa mostra cadastro e frente criada dentro
  await selecionar("TR-1F");
  await page.getByRole("tab", { name: "Histórico" }).click();
  await page.getByText("Unidade criada dentro desta: FR-1F").waitFor();
  await page.getByText("Unidade cadastrada").waitFor();
  await shot("e3-02-historico");

  // 7. Inativar travessa com frente ativa é recusado com mensagem clara
  await page.getByRole("button", { name: "Inativar" }).click();
  await page.getByText(/Inative antes as 1 unidade/).waitFor();

  // 8. Busca na árvore
  await page.getByPlaceholder("Buscar por código ou nome").fill("FR-1F");
  assert.strictEqual(await page.getByRole("tree").getByText("N567").count(), 0, "busca deveria esconder N567");
  await page.getByRole("tree").getByText("FR-1F").first().waitFor();
  await page.getByPlaceholder("Buscar por código ou nome").fill("");
  await shot("e3-03-arvore");

  // 9. Tipos e regras
  await page.getByRole("link", { name: "Tipos e regras" }).click();
  await page.getByText("Regras de hierarquia").waitFor();
  assert.ok(await page.getByLabel("Frente dentro de Travessa").isChecked());
  await shot("e3-04-regras");

  // 10. Celular: estrutura sem rolagem horizontal
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL + "estrutura");
  await page.getByRole("tree").waitFor();
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(extra <= 0, `rolagem horizontal de ${extra}px`);
  await shot("e3-05-celular");

  assert.deepStrictEqual(erros, [], "erros no console da página");
  await browser.close();
  console.log("E2E ESTRUTURA OK: 10 cenários aprovados");
})().catch((e) => {
  console.error("E2E ESTRUTURA FALHOU:", e);
  process.exit(1);
});
