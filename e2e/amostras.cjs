// Teste ponta a ponta da Etapa 8: importação de planilha, cadastro, lote de envio.
// Uso: node e2e/amostras.cjs http://127.0.0.1:PORTA pasta_arquivos_teste [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");
const path = require("path");

const [URL, FX, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  globalThis.__pagina = page;
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  await page.evaluate(async () => fetch("/api/v1/minas", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("geomina.token") },
    body: JSON.stringify({ codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 }) }));

  // 1. Importar planilha: prévia, decisões, confirmação
  await page.getByRole("navigation").getByRole("link", { name: "Amostras" }).click();
  await page.getByRole("tab", { name: "Importar planilha" }).click();
  await page.locator('input[type="file"]').setInputFiles(path.join(FX, "amostras.xlsx"));
  await page.getByText("amostras.xlsx: 3 linha(s) com amostra").waitFor();
  await page.getByText("confirmar código: 1").waitFor();
  await page.getByRole("cell", { name: "BS-RP-227A" }).waitFor();
  await page.getByText("Rocha Nova", { exact: false }).first().waitFor();
  await page.getByLabel(/Aceitar as 1 sugestões/).check();
  await page.getByRole("textbox", { name: /Sistema das coordenadas da planilha/ }).click();
  await page.getByRole("option", { name: "SAD69 / UTM 23S (EPSG:29193)" }).click();
  await shot("e8-01-previa");
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByText("3 amostra(s) importada(s)").first().waitFor();

  // 2. Lista e ficha da amostra
  await page.getByRole("tab", { name: "Amostras" }).click();
  await page.getByText("3 amostra(s)", { exact: true }).waitFor();
  await page.getByRole("cell", { name: "BS-RP-226" }).click();
  await page.getByText("Perfil da frente — BS-RP-226").first().waitFor();
  await page.getByRole("button", { name: "Dados da amostra" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText(/Código original na planilha: RP 226/).waitFor().catch(async () => {
    assert.ok((await dlg.getByLabel("Observações").inputValue()).includes("RP 226"));
  });
  await page.keyboard.press("Escape");

  // 3. Nova amostra com próximo código
  await page.getByRole("button", { name: "Nova amostra" }).click();
  await page.getByRole("button", { name: "Próximo BS-RP" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] input')].some((i) => i.value === "BS-RP-228"));
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await page.getByText("Amostra salva.").waitFor();

  // 4. Lote de envio
  await page.getByRole("tab", { name: "Lotes de envio" }).click();
  await page.getByLabel("Código do lote").fill("L-2026-10");
  await page.getByLabel("Amostras (códigos, um por linha)").fill("BS-RP-225\nbs - rp - 226");
  await page.getByRole("button", { name: "Criar lote" }).click();
  await page.getByText("2 amostra(s): BS-RP-225, BS-RP-226").waitFor();
  await page.getByRole("button", { name: "Marcar como enviado hoje" }).click();
  await page.getByText(/enviado em/).waitFor();
  await page.getByRole("tab", { name: "Amostras" }).click();
  assert.strictEqual(await page.getByRole("cell", { name: "Enviada ao laboratório" }).count(), 2);
  await shot("e8-02-lista");

  // 5. Painel
  await page.getByRole("navigation").getByRole("link", { name: "Painel" }).click();
  await page.getByText("2 aguardando resultado").waitFor();

  assert.deepStrictEqual(erros, [], "erros no console");
  await browser.close();
  console.log("E2E AMOSTRAS OK: 5 cenários aprovados");
})().catch(async (e) => {
  console.error("E2E AMOSTRAS FALHOU:", e);
  if (CAPTURAS && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: `${CAPTURAS}/falha.png` }).catch(() => {});
  process.exit(1);
});
