// Teste ponta a ponta — Geoquímica Operacional, Etapa 7: visualização espacial 3D.
// Uso: node e2e/geoop_espacial.cjs http://127.0.0.1:PORTA/ [topografia.zip] [pasta_capturas]
// As coordenadas das amostras são calculadas a partir da extensão da topografia importada (nenhuma coordenada real no código).
const { chromium } = require("playwright");
const assert = require("assert");

const [URL, ZIP, CAPTURAS] = process.argv.slice(2);
const SENHA = "senhaForte123";

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const shot = async (n) => CAPTURAS && page.screenshot({ path: `${CAPTURAS}/${n}.png` });
  const erros = [];
  page.on("pageerror", (e) => erros.push(e.message));
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && !/GPU stall|WebGL/i.test(m.text()) && erros.push(m.text()));
  const chamar = (metodo, caminho, corpo, form) => page.evaluate(async ([metodo, caminho, corpo, form]) => {
    let body, headers = { Authorization: "Bearer " + localStorage.getItem("geomina.token") };
    if (form) { body = new FormData(); for (const [k, v] of Object.entries(form.campos ?? {})) body.append(k, v); for (const [k, v] of Object.entries(form.arquivos)) body.append(k, new Blob([v.conteudo]), v.nome); }
    else if (corpo) { body = JSON.stringify(corpo); headers["Content-Type"] = "application/json"; }
    const r = await fetch("/api/v1" + caminho, { method: metodo, body, headers });
    return r.json().catch(() => null);
  }, [metodo, caminho, corpo, form]);
  await page.goto(URL);
  await page.getByLabel("Login").fill("admin");
  await page.getByLabel("Nome completo").fill("Administrador");
  await page.getByLabel(/^Senha/).fill(SENHA);
  await page.getByLabel("Confirme a senha").fill(SENHA);
  await page.getByRole("button", { name: "Criar administrador" }).click();
  await page.getByText("Olá, Administrador").waitFor();
  const mina = await chamar("POST", "/minas", { codigo: "MINA01", nome: "Mina 01", srid_trabalho: 31983 });

  // topografia (opcional): importa a camada SIRGAS do zip e usa o centro da extensão como referência
  let X0 = 500000, Y0 = 7800000, Z0 = 500;
  if (ZIP) {
    const zip = require("fs").readFileSync(ZIP);
    const imp = await page.evaluate(async ([bytes, mid]) => {
      const fd = new FormData(); fd.append("arquivo", new Blob([new Uint8Array(bytes)]), "topo.zip");
      const r = await fetch(`/api/v1/minas/${mid}/topografia/importacoes`, { method: "POST", body: fd, headers: { Authorization: "Bearer " + localStorage.getItem("geomina.token") } });
      return r.json();
    }, [[...zip], mina.id]);
    const cam = imp.camadas.find((c) => c.epsg === 31983);
    await chamar("POST", `/importacoes/${imp.id}/confirmar-topografia`, { membro: cam.membro, codigo: "TOPO" });
    const lev = (await chamar("GET", `/minas/${mina.id}/levantamentos`))[0];
    const [minx, miny, minz, maxx, maxy, maxz] = lev.extensao;
    X0 = (minx + maxx) / 2; Y0 = (miny + maxy) / 2; Z0 = (minz + maxz) / 2;
  }
  // 6 amostras de frente numa linha e um furo com 4 intervalos
  let laudo = "Amostra;Tipo;Cr (ppm);Be (ppm)\n";
  for (let i = 0; i < 6; i++) {
    await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: `BS-RP-${900 + i}`, x: X0 + i * 15, y: Y0, z: Z0, srid: 31983 });
    laudo += `BS-RP-${900 + i};SMP;${100 + i * 300};${10 - i}\n`;
  }
  await chamar("POST", `/minas/${mina.id}/amostras`, { codigo: "BS-RP-990", x: X0, y: Y0 + 5, srid: 31983 }); // sem Z → sem posição
  const collar = `furo;x;y;z;azimute;dip;eoh\nF-3D;${X0 + 40};${Y0 + 30};${Z0 + 20};90;-60;60\n`;
  let am = "furo;amostra;de;ate\n";
  for (let i = 0; i < 4; i++) { am += `F-3D;BMT-TS-${900 + i};${i * 12};${i * 12 + 6}\n`; laudo += `BMT-TS-${900 + i};SMP;${2000 - i * 400};${i + 1}\n`; }
  const p = await chamar("POST", `/minas/${mina.id}/sondagem/importacoes`, null, { campos: { srid: "31983" }, arquivos: { collar: { nome: "c.csv", conteudo: collar }, amostras: { nome: "a.csv", conteudo: am } } });
  await chamar("POST", `/importacoes/${p.id}/confirmar-sondagem`, {});
  const l = await chamar("POST", `/minas/${mina.id}/laudos`, null, { arquivos: { arquivo: { nome: "l.csv", conteudo: laudo } } });
  await chamar("POST", `/importacoes/${l.id}/confirmar-laudo`, { certificado: "C-3D" });
  const amostras = Object.fromEntries((await chamar("GET", `/minas/${mina.id}/amostras`)).map((a) => [a.codigo, a.id]));

  // 1. Cena: amostras de frente, intervalos do furo, trajetória e topografia
  await page.goto(URL.replace(/\/$/, "") + "/geoop/espacial");
  await page.getByRole("textbox", { name: "Analitos" }).click();
  for (const a of ["Cr (elemento)", "Be (elemento)"]) await page.getByRole("option", { name: a }).click();
  await page.keyboard.press("Escape");
  await page.getByText("6 amostras de frente · 4 intervalos de furo · 1 furos").waitFor({ timeout: 30000 });
  await page.waitForFunction(() => window.geomina3d && window.geomina3d.contagem.frente === 6, null, { timeout: 30000 });
  const cont = await page.evaluate(() => window.geomina3d.contagem);
  assert.strictEqual(cont.intervalos, 4);
  assert.strictEqual(cont.trajetorias, 1);
  if (ZIP) assert.ok(cont.topografia > 100, `topografia desenhada: ${cont.topografia} segmentos`);
  await page.getByText("1 sem posição").waitFor();
  await page.getByTestId("legenda-3d").getByText("Cr ppm").waitFor();

  // 2. Cor pela classe do analito: teor alto ≠ teor baixo; trocar o analito recolore SEM reconstruir a cena
  const cor = (c) => page.evaluate((k) => window.geomina3d.cor(k), c);
  const [baixo, alto] = [await cor(amostras["BS-RP-900"]), await cor(amostras["BS-RP-905"])];
  assert.notStrictEqual(baixo, alto, "Cr 100 e Cr 1600 em classes diferentes");
  await page.evaluate(() => { window.__antes = window.geomina3d; });
  await page.getByRole("textbox", { name: "Cor pelo analito" }).click();
  await page.getByRole("option", { name: "Be", exact: true }).click();
  await page.waitForFunction(([a, b]) => window.geomina3d.cor(a) !== b, [amostras["BS-RP-900"], baixo]);
  assert.ok(await page.evaluate(() => window.__antes === window.geomina3d), "a geometria não foi reconstruída");
  await shot("go7-01-cena");

  // 3. Clique numa amostra de frente e num intervalo do furo → seleção, painel de contexto e coordenada real
  for (const [cod, esperado] of [["BS-RP-903", "BS-RP-903"], ["BMT-TS-901", "BMT-TS-901"]]) {
    const xy = await page.evaluate((k) => window.geomina3d.projetar(k), amostras[cod]);
    await page.mouse.click(xy.x, xy.y);
    await page.getByTestId("painel-contexto").getByText(esperado, { exact: true }).waitFor();
    await page.getByTestId("coordenada-3d").getByText(/E \d+[.]\d{2}\s+N \d+[.]\d{2}\s+Z \d+[.]\d{2}\s+\(EPSG:31983\)/).waitFor();
  }
  await page.getByTestId("painel-contexto").getByText(/F-3D · 12–18 m/).waitFor();
  await page.getByTestId("painel-contexto").getByText(/meio do intervalo, calculado na trajetória ESTIMADA/).waitFor();
  await shot("go7-02-selecao");

  // 4. Desligar a camada de amostras de frente: o clique na posição dela não seleciona mais
  await page.getByLabel("Amostras de frente").uncheck();
  const xy = await page.evaluate((k) => window.geomina3d.projetar(k), amostras["BS-RP-902"]);
  await page.mouse.click(xy.x, xy.y);
  await page.waitForTimeout(400);
  assert.strictEqual(await page.getByTestId("painel-contexto").getByText("BS-RP-902", { exact: true }).count(), 0);
  await page.getByLabel("Amostras de frente").check();

  // 5. Filtros do painel valem no 3D (só o furo)
  await page.getByTestId("painel-filtros").locator('[data-faceta="furo"]').getByText("F-3D").click();
  await page.getByText("0 amostras de frente · 4 intervalos de furo · 1 furos").waitFor();

  assert.deepStrictEqual(erros, []);
  console.log("E2E GEOQUÍMICA OPERACIONAL (ETAPA 7 — 3D) OK: 5 cenários aprovados");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
