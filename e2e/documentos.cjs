// Teste ponta a ponta das Etapas 6 e 7: fotos e croquis pela interface.
// Uso: node e2e/documentos.cjs http://127.0.0.1:PORTA pasta_arquivos_teste [pasta_capturas] [pdf_real_opcional]
const { chromium } = require("playwright");
const assert = require("assert");
const path = require("path");

const [URL, FX, CAPTURAS, PDF_REAL] = process.argv.slice(2);
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  globalThis.__pagina = page;
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo) => page.evaluate(async ([metodo, caminho, corpo]) => {
    const r = await fetch("/api/v1" + caminho, { method: metodo, body: corpo ? JSON.stringify(corpo) : undefined,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + localStorage.getItem("geomina.token") } });
    return r.json().catch(() => null);
  }, [metodo, caminho, corpo]);

  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });
  const n = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N144", nome: "N144" });
  await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "GAL-01", nome: "Galeria 01", pai_id: n.id });

  // 1. Fotos em lote na galeria (aba da unidade), com EXIF e miniaturas
  await page.getByRole("navigation").getByRole("link", { name: "Estrutura da mina" }).click();
  await page.getByRole("tree").getByText("GAL-01").click();
  await page.getByRole("tab", { name: "Fotos e croquis" }).click();
  await page.locator('input[type="file"]').first().setInputFiles([path.join(FX, "frente1.jpg"), path.join(FX, "frente2.jpg")]);
  await page.getByText("2 arquivo(s) enviado(s).").waitFor();
  await page.waitForFunction(() => document.querySelectorAll('img[alt^="frente"]').length === 2);

  // 2. Detalhe da foto: imagem, câmera (EXIF), legenda
  await page.locator('img[alt="frente1"]').click();
  const dlg = page.getByRole("dialog");
  await dlg.getByText(/câmera\s+Tablet XYZ/).waitFor();
  await dlg.locator("img").first().waitFor();
  await dlg.getByLabel("Legenda").fill("Contato flogopita xisto / anfibólio gnaisse");
  await dlg.getByRole("button", { name: "Salvar dados" }).click();
  await page.getByText("Dados salvos.").waitFor();
  await shot("e6-01-foto");
  await page.keyboard.press("Escape");

  // 3. Croqui PDF: visualização e separação em páginas
  await page.getByText("Croquis", { exact: true }).click();
  await page.locator('input[type="file"]').first().setInputFiles(PDF_REAL || path.join(FX, "croquis.pdf"));
  await page.getByText("1 arquivo(s) enviado(s).").waitFor();
  await page.getByRole("cell", { name: PDF_REAL ? /OUTUBRO/ : "croquis" }).first().click();
  await page.getByRole("dialog").locator("iframe").waitFor();
  const paginas = PDF_REAL ? 23 : 3;
  await page.getByRole("button", { name: `Separar em ${paginas} páginas` }).click();
  await page.getByText(`${paginas} páginas criadas como croquis separados.`).waitFor();
  await shot("e6-02-croqui");
  await page.keyboard.press("Escape");
  assert.strictEqual(await page.getByRole("row").count(), paginas + 1);

  // 4. Anexo na ficha de mapeamento (seção E)
  const dic = Object.fromEntries((await chamar("GET", "/dicionarios")).map((d) => [d.codigo, Object.fromEntries(d.termos.map((t) => [t.codigo, t]))]));
  const unidades = await chamar("GET", `/minas/${mina.id}/unidades`);
  const gal = unidades.find((u) => u.codigo === "GAL-01");
  const ficha = await chamar("POST", "/mapeamentos", { unidade_id: gal.id, data: "2026-10-14", intervalos: [{ de_m: 0, ate_m: 2, litologia_id: dic.LITOLOGIA.GNP.id }] });
  await page.goto(URL + "mapeamento/" + ficha.id);
  await page.getByText("E. Croqui e fotos").waitFor();
  await page.locator('input[type="file"]').first().setInputFiles(path.join(FX, "frente2.jpg"));
  await page.getByText("1 arquivo(s) enviado(s).").waitFor();
  await page.waitForFunction(() => document.querySelectorAll('img[alt="frente2"]').length === 1);
  await shot("e6-03-ficha-anexo");

  // 5. Página geral com busca pela legenda
  await page.getByRole("navigation").getByRole("link", { name: "Fotos e croquis" }).click();
  await page.getByPlaceholder("Buscar por título, legenda ou identificador").fill("flogopita");
  await page.waitForFunction(() => document.querySelectorAll('img[alt^="Contato"]').length === 1);

  // 6. Celular
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByPlaceholder("Buscar por título, legenda ou identificador").fill("");
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(extra <= 0, `rolagem horizontal de ${extra}px`);

  assert.deepStrictEqual(erros, [], "erros no console da página");
  await browser.close();
  console.log("E2E DOCUMENTOS OK: 6 cenários aprovados" + (PDF_REAL ? " (com o PDF real de 23 páginas)" : ""));
})().catch(async (e) => {
  console.error("E2E DOCUMENTOS FALHOU:", e);
  if (CAPTURAS && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: `${CAPTURAS}/falha.png` }).catch(() => {});
  process.exit(1);
});
