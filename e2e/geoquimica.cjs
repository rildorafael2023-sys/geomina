// Teste ponta a ponta da Etapa 9: importação de laudo, tabela de resultados, QA/QC, resultados na amostra.
// Uso: node e2e/geoquimica.cjs http://127.0.0.1:PORTA laudo.xls [pasta_capturas]
const { chromium } = require("playwright");
const assert = require("assert");

const [URL, LAUDO, CAPTURAS] = process.argv.slice(2);
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
  for (const c of ["BS-RP-468B", "BS-RP-462A", "BMT-TS-458"]) await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: c });
  const lote = await chamar("POST", `/minas/${mina.id}/lotes`, { codigo: "L1", laboratorio: "SGS Geosol", amostras: ["BS-RP-468B", "BS-RP-462A", "BMT-TS-458"] });
  await chamar("POST", `/lotes/${lote.id}/enviar`, { data_envio: "2026-09-24" });

  // 1. Importar o laudo: prévia e confirmação
  await page.getByRole("navigation").getByRole("link", { name: "Laboratório (laudos)" }).click();
  await page.getByRole("tab", { name: "Importar laudo" }).click();
  await page.locator('input[type="file"]').setInputFiles(LAUDO);
  await page.getByText(/formato SGS · certificado GQ2613496/).waitFor();
  await page.getByText("amostra cadastrada: 5").waitFor(); // 3 SMP + DUP e REP de amostras cadastradas
  await shot("e9-01-previa");
  await page.getByRole("button", { name: "Confirmar importação" }).click();
  await page.getByText("Certificado GQ2613496 importado").waitFor();

  // 2. Tabela de resultados com analitos escolhidos
  await page.getByRole("tab", { name: "Resultados" }).click();
  await page.getByRole("textbox", { name: "Analitos (vazio = todos)" }).click();
  for (const a of ["Be (elemento)", "Cr (elemento)", "F (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("columnheader", { name: "Be (ppm)" }).waitFor();
  const linha = page.getByRole("row").filter({ hasText: "BS-RP-468B" });
  await linha.getByRole("cell", { name: "68.1" }).waitFor();
  await linha.getByRole("cell", { name: "6916" }).waitFor();
  await shot("e9-02-tabela");

  // 3. Certificado e QA/QC
  await page.getByRole("tab", { name: "Certificados e QA/QC" }).click();
  await page.getByRole("cell", { name: "GQ2613496" }).click();
  await page.getByText(/par\(es\) acima do limite/).waitFor();
  await page.getByText(/OREAS920B/).first().waitFor();
  await shot("e9-03-qaqc");
  await page.keyboard.press("Escape");

  // 4. Resultados na ficha da amostra e painel
  await page.getByRole("navigation").getByRole("link", { name: "Amostras" }).click();
  await page.getByRole("cell", { name: "BS-RP-468B" }).click();
  await page.getByRole("dialog").getByText(/Resultados de laboratório \(48 analitos/).waitFor();
  await page.getByRole("dialog").getByText("Be: 68.1 ppm").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("navigation").getByRole("link", { name: "Painel" }).click();
  await page.getByText(/0 aguardando resultado · 3 com resultado/).waitFor();

  assert.deepStrictEqual(erros, [], "erros no console");
  await browser.close();
  console.log("E2E GEOQUIMICA OK: 4 cenários aprovados (laudo real)");
})().catch(async (e) => {
  console.error("E2E GEOQUIMICA FALHOU:", e);
  if (CAPTURAS && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: `${CAPTURAS}/falha.png` }).catch(() => {});
  process.exit(1);
});
