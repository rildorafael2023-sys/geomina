// Teste ponta a ponta da Etapa 10: calibração SAD69→SIRGAS, importação do shapefile, planta, eixo e chainage.
// Uso: node e2e/topografia.cjs http://127.0.0.1:PORTA topografia.zip [pasta_capturas]
// O zip deve conter o mesmo levantamento em SAD69 (29193) e em SIRGAS 2000 (31983).
const { chromium } = require("playwright");
const assert = require("assert");

const [URL, ZIP, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
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
  const nivel = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "NIVEL", codigo: "N144", nome: "Nível 144" });
  const gal = await chamar("POST", "/unidades", { mina_id: mina.id, tipo: "GALERIA", codigo: "GAL-01", nome: "Galeria 01", pai_id: nivel.id });

  // 1. Calibração: o par de arquivos é escolhido sozinho (mesmo número de registros) e o resíduo é mostrado
  await page.getByRole("navigation").getByRole("link", { name: "Topografia" }).click();
  await page.getByText("Nenhuma topografia importada ainda.").waitFor();
  await page.getByRole("tab", { name: "Transformações de coordenadas" }).click();
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await page.getByRole("button", { name: "Calcular" }).waitFor({ timeout: 60000 });
  assert.match(await page.getByRole("textbox", { name: "Arquivo no sistema antigo (origem)" }).inputValue(), /SAD\/.*_Piso\.shp$/);
  await page.getByRole("button", { name: "Calcular" }).click();
  await page.getByText(/Translação: dx -46\.3\d* m, dy -43\.\d* m/).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Aprovar" }).click();
  await page.getByText("aprovada", { exact: true }).waitFor();
  await shot("e10-01-transformacao");

  // 2. Importação do levantamento principal em SAD69 com a translação aprovada (recomendada automaticamente)
  await page.getByRole("tab", { name: "Importar shapefile" }).click();
  await page.locator('input[type="file"]').setInputFiles(ZIP);
  await page.getByText("Camadas do CAD (campo Layer)").waitFor({ timeout: 60000 });
  await page.getByRole("radio", { name: /SAD\/[^_]*_Atualização_Topográfica\.shp —/ }).check();
  await page.getByText(/precisa converter para SIRGAS/).waitFor();
  assert.ok(await page.getByRole("radio", { name: /calibrada com a topografia da mina.*recomendada/ }).isChecked(), "translação aprovada deve vir marcada");
  await page.getByText("cota suspeita").first().waitFor();
  await page.getByLabel("Código do levantamento").fill("TOPO-2026-09-28");
  await page.getByLabel("Data do levantamento").fill("2026-09-28");
  await shot("e10-02-previa");
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByText("Importação concluída").waitFor({ timeout: 180000 });
  const txt = await page.getByText(/feições importadas/).textContent();
  assert.match(txt, /44\.273 feições importadas\. Transformação: SAD69/);

  // 3. Levantamentos e planta
  await page.getByRole("tab", { name: "Levantamentos" }).click();
  await page.getByRole("cell", { name: "TOPO-2026-09-28" }).waitFor();
  await page.getByRole("tab", { name: "Planta" }).click();
  await page.getByTestId("planta").waitFor({ timeout: 60000 });
  await page.getByText(/^Camadas \(\d+ feições\)/).waitFor();
  const caixa = await page.getByTestId("planta").boundingBox();
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.getByText(/E \d{6}\.\d{2}\s+N \d{7}\.\d{2}\s+\(EPSG:31983\)/).waitFor();
  await page.mouse.wheel(0, -300);
  await shot("e10-03-planta");

  // 4. Eixo da galeria a partir de uma linha 3D da topografia, amostra e chainage
  const geo = await chamar("GET", `/minas/${mina.id}/topografia/geometria`);
  let linha = null;
  for (const c of geo.camadas) for (const f of c.feicoes) {
    const p = f.c[0];
    if (!linha && p.length >= 4 && p[0].length === 3) {
      let comp = 0; for (let i = 1; i < p.length; i++) comp += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (comp > 30) linha = p.map((v) => [v[0] + geo.origem[0], v[1] + geo.origem[1], v[2] + geo.origem[2]]);
    }
  }
  assert.ok(linha, "nenhuma linha 3D com mais de 30 m");
  const meio = linha[1];
  await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: "BS-RP-900", unidade_id: gal.id, x: meio[0], y: meio[1], z: meio[2], srid: 31983 });
  await page.getByRole("navigation").getByRole("link", { name: "Estrutura da mina" }).click();
  await page.getByText("GAL-01").first().click();
  await page.getByRole("tab", { name: "Eixo e chainage" }).click();
  await page.getByText("Esta unidade ainda não tem eixo").waitFor();
  await page.getByRole("button", { name: "Definir eixo" }).click();
  await page.getByLabel(/Pontos \(X Y Z por linha\)/).fill(linha.map((v) => v.map((n) => n.toFixed(3)).join(" ")).join("\n"));
  await page.getByLabel("Onde fica o 0 m").fill("primeiro vértice da linha");
  await page.getByRole("button", { name: `Salvar eixo com ${linha.length} pontos` }).click();
  await page.getByText(/Eixo v1/).waitFor();
  await page.getByRole("button", { name: /Calcular posições/ }).click();
  const linhaTab = page.getByRole("row").filter({ hasText: "BS-RP-900" });
  await linhaTab.waitFor();
  const ch = Number((await linhaTab.getByRole("cell").first().textContent()).replace(",", "."));
  const esperado = Math.hypot(linha[1][0] - linha[0][0], linha[1][1] - linha[0][1], linha[1][2] - linha[0][2]);
  assert.ok(Math.abs(ch - esperado) < 0.02, `chainage ${ch} ≠ ${esperado}`);
  await shot("e10-04-eixo");

  // 5. Celular: sem rolagem lateral na topografia
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL.replace(/\/$/, "") + "/topografia");
  await page.getByRole("tab", { name: "Levantamentos" }).click();
  await page.getByRole("cell", { name: "TOPO-2026-09-28" }).waitFor();
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(largura <= 392, `rolagem lateral no celular: ${largura}`);
  await shot("e10-05-celular");

  assert.deepStrictEqual(erros, []);
  console.log("E2E topografia: OK");
  await browser.close();
})().catch(async (e) => { console.error(e); process.exit(1); });
