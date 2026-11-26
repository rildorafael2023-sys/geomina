import { Alert, Badge, Button, Checkbox, Group, Loader, Paper, Select, Stack, Text, Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, ErroApi, type Mina } from "../../api/cliente";
import { classe, coresClasses, limites, PALETAS, rotulos, type Metodo } from "../../geologia/classes";
import type { Geometria } from "../topografia/Planta";
import { parametrosGeo, useGeo } from "./estado";

interface Valor { y: number | null; texto: string; situacao: string; unidade: string }
interface Base { chave: string; codigo: string; valores: Record<string, Valor>; status: string; galeria: string | null }
interface Cena {
  srid: number; origem: number[]; total: number; unidades: Record<string, string>;
  pontos: (Base & { xyz: number[] })[];
  segmentos: (Base & { furo: string; de: number; ate: number; estimada: boolean; xyz0: number[]; xyz1: number[] })[];
  trajetorias: { id: string; codigo: string; estimada: boolean; motivo: string; pontos: number[][] }[];
  sem_posicao: { codigo: string; motivo: string }[];
}
type Camadas = { topografia: boolean; frente: boolean; trajetorias: boolean; intervalos: boolean };
const CINZA = "#adb5bd";

/** Visualização espacial 3D: topografia, amostras de frente e furos, coloridos pelo analito; seleção sincronizada. */
export function Espacial({ mina }: { mina: Mina }) {
  const s = useGeo();
  const p = parametrosGeo(s);
  const cena = useQuery({ queryKey: ["espacial", mina.id, p.toString()], queryFn: () => api<Cena>(`/minas/${mina.id}/geoop/espacial?${p}`), placeholderData: (a) => a });
  const topo = useQuery({ queryKey: ["geometria-3d", mina.id], queryFn: () => api<Geometria>(`/minas/${mina.id}/topografia/geometria?limite=60000`), staleTime: 300_000 });
  const [camadas, setCamadas] = useState<Camadas>({ topografia: true, frente: true, trajetorias: true, intervalos: true });
  const [analito, setAnalito] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo>("quantis");
  const [nClasses, setNClasses] = useState(5);
  const [paleta, setPaleta] = useState("teor");
  const [coord, setCoord] = useState<number[] | null>(null);
  const an = analito && s.analitos.includes(analito) ? analito : s.analitos[0] ?? null;
  const d = cena.data;

  const classes = useMemo(() => {
    if (!d || !an) return null;
    const vals = [...d.pontos, ...d.segmentos].map((x) => x.valores[an]?.y).filter((v): v is number => v != null);
    const lim = limites(vals, metodo, nClasses);
    return { lim, cores: coresClasses(lim.length + 1, paleta) };
  }, [d, an, metodo, nClasses, paleta]);
  const corDe = (b: Base) => {
    const v = an ? b.valores[an]?.y : null;
    return v != null && classes ? classes.cores[classe(v, classes.lim)] : CINZA;
  };

  return (
    <Stack gap={6}>
      <Group justify="space-between" gap="xs" wrap="wrap">
        <Group gap="sm">
          <Text fw={700}>Visualização espacial</Text>
          {d && <Badge variant="light">{d.pontos.length} amostras de frente · {d.segmentos.length} intervalos de furo · {d.trajetorias.length} furos</Badge>}
          {d && d.sem_posicao.length > 0 && <Tooltip multiline w={420} label={d.sem_posicao.slice(0, 20).map((x) => `${x.codigo}: ${x.motivo}`).join(" · ") + (d.sem_posicao.length > 20 ? " …" : "")}><Badge color="gray" variant="light">{d.sem_posicao.length} sem posição</Badge></Tooltip>}
        </Group>
        <Group gap={8}>
          {(Object.keys(camadas) as (keyof Camadas)[]).map((k) => (
            <Checkbox key={k} size="xs" label={{ topografia: "Topografia", frente: "Amostras de frente", trajetorias: "Trajetórias dos furos", intervalos: "Intervalos de furo" }[k]}
              checked={camadas[k]} onChange={(e) => setCamadas({ ...camadas, [k]: e.currentTarget.checked })} />
          ))}
        </Group>
      </Group>
      <Group gap="xs" align="flex-end">
        <Select size="xs" w={120} label="Cor pelo analito" placeholder="escolha no topo" data={s.analitos} value={an} onChange={setAnalito} allowDeselect={false} />
        <Select size="xs" w={150} label="Classes" allowDeselect={false} value={metodo} onChange={(v) => setMetodo((v ?? "quantis") as Metodo)} data={[{ value: "quantis", label: "Quantis" }, { value: "iguais", label: "Intervalos iguais" }]} />
        <Select size="xs" w={80} label="Nº" allowDeselect={false} value={String(nClasses)} onChange={(v) => setNClasses(Number(v))} data={["3", "4", "5", "6", "7"]} />
        <Select size="xs" w={190} label="Cores" allowDeselect={false} value={paleta} onChange={(v) => setPaleta(v ?? "teor")} data={Object.entries(PALETAS).map(([value, x]) => ({ value, label: x.nome }))} />
        {classes && an && (
          <Group gap={6} data-testid="legenda-3d">
            <Text size="xs" fw={700}>{an} {d?.unidades[an] ?? ""}</Text>
            {rotulos(classes.lim).map((r, k) => <Group key={r} gap={2} wrap="nowrap"><span style={{ width: 12, height: 10, background: classes.cores[k], display: "inline-block", border: "1px solid #999" }} /><Text size="10px">{r}</Text></Group>)}
            <Group gap={2}><span style={{ width: 12, height: 10, background: CINZA, display: "inline-block" }} /><Text size="10px">sem resultado</Text></Group>
          </Group>
        )}
      </Group>
      {cena.isLoading ? <Loader size="sm" /> : cena.error ? <Alert color="orange">{cena.error instanceof ErroApi ? cena.error.message : String(cena.error)}</Alert> : d && (
        <Paper withBorder style={{ position: "relative", overflow: "hidden" }}>
          <Visor cena={d} topo={topo.data} camadas={camadas} corDe={corDe} selecionado={s.selecionado} aoSelecionar={(c) => s.set({ selecionado: c })} aoCoordenada={setCoord} />
          <div style={{ position: "absolute", left: 8, bottom: 6, fontSize: 11, fontFamily: "monospace", background: "rgba(255,255,255,0.85)", padding: "2px 6px", borderRadius: 3 }} data-testid="coordenada-3d">
            {coord ? `E ${coord[0].toFixed(2)}  N ${coord[1].toFixed(2)}  Z ${coord[2].toFixed(2)}  (EPSG:${d.srid})` : "Clique num objeto para ver a coordenada real"}
          </div>
          <Text size="10px" c="dimmed" style={{ position: "absolute", right: 8, top: 6 }}>arrastar: girar · botão direito: deslocar · roda: zoom · tracejado = trajetória estimada</Text>
        </Paper>
      )}
    </Stack>
  );
}

function Visor({ cena, topo, camadas, corDe, selecionado, aoSelecionar, aoCoordenada }: {
  cena: Cena; topo?: Geometria; camadas: Camadas; corDe: (b: Base) => string; selecionado: string | null; aoSelecionar: (c: string) => void; aoCoordenada: (c: number[] | null) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const motor = useRef<{ atualizar: (cfg: { camadas: Camadas; corDe: (b: Base) => string; selecionado: string | null }) => void; destruir: () => void; reenquadrar: () => void } | null>(null);
  const cb = useRef({ aoSelecionar, aoCoordenada });
  cb.current = { aoSelecionar, aoCoordenada };

  useEffect(() => {
    let vivo = true;
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (!vivo || !caixa.current) return;
      const el = caixa.current;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      } catch {
        setErro("Este computador/navegador não oferece WebGL (gráficos 3D). Use as abas Galerias e Sondagens, ou atualize o driver de vídeo.");
        return;
      }
      const o = cena.origem;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.setClearColor("#f8f9fa");
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100000);
      camera.up.set(0, 0, 1); // Z para cima (cota)
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const luz = new THREE.DirectionalLight(0xffffff, 1.4); luz.position.set(1, -1, 2); scene.add(luz);
      const local = (p: number[]) => new THREE.Vector3(p[0] - o[0], p[1] - o[1], p[2] - o[2]);

      // tamanho da cena → tamanho dos símbolos
      const pts = [...cena.pontos.map((x) => x.xyz), ...cena.segmentos.flatMap((x) => [x.xyz0, x.xyz1]), ...cena.trajetorias.flatMap((t) => t.pontos)];
      const bb = new THREE.Box3();
      pts.forEach((p) => bb.expandByPoint(local(p)));
      if (bb.isEmpty()) bb.expandByPoint(new THREE.Vector3(0, 0, 0)).expandByScalar(50);
      const tam = Math.max(20, bb.getSize(new THREE.Vector3()).length());
      const raio = Math.max(0.4, tam / 250);

      // topografia (linhas com cota; recorta pela caixa da cena + margem)
      const grupoTopo = new THREE.Group();
      if (topo?.feicoes) {
        const lim = bb.clone().expandByScalar(Math.max(60, tam * 0.3));
        const pos: number[] = [];
        const ot = topo.origem;
        for (const c of topo.camadas) for (const f of c.feicoes) for (const parte of f.c) {
          if (parte.length < 2 || parte[0].length < 3) continue;
          for (let i = 0; i < parte.length - 1; i++) {
            const a = [parte[i][0] + ot[0] - o[0], parte[i][1] + ot[1] - o[1], parte[i][2] + ot[2] - o[2]];
            const b = [parte[i + 1][0] + ot[0] - o[0], parte[i + 1][1] + ot[1] - o[1], parte[i + 1][2] + ot[2] - o[2]];
            if (!lim.containsPoint(new THREE.Vector3(a[0], a[1], a[2])) && !lim.containsPoint(new THREE.Vector3(b[0], b[1], b[2]))) continue;
            pos.push(...a, ...b);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        grupoTopo.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9aa0a6, transparent: true, opacity: 0.55 })));
        grupoTopo.userData.segmentos = pos.length / 6;
      }
      scene.add(grupoTopo);

      // trajetórias
      const grupoTraj = new THREE.Group();
      for (const t of cena.trajetorias) {
        const g = new THREE.BufferGeometry().setFromPoints(t.pontos.map(local));
        const mat = t.estimada ? new THREE.LineDashedMaterial({ color: 0x343a40, dashSize: raio * 3, gapSize: raio * 2 }) : new THREE.LineBasicMaterial({ color: 0x343a40 });
        const l = new THREE.Line(g, mat);
        if (t.estimada) l.computeLineDistances();
        grupoTraj.add(l);
        const boca = new THREE.Mesh(new THREE.ConeGeometry(raio * 1.6, raio * 3, 12), new THREE.MeshStandardMaterial({ color: 0x343a40 }));
        boca.position.copy(local(t.pontos[0])); boca.rotation.x = -Math.PI / 2;
        grupoTraj.add(boca);
      }
      scene.add(grupoTraj);

      // amostras de frente (esferas) e intervalos de furo (cilindros entre de e até)
      const esfera = new THREE.SphereGeometry(raio, 16, 12);
      const matI = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const frente = new THREE.InstancedMesh(esfera, matI, Math.max(1, cena.pontos.length));
      frente.count = cena.pontos.length;
      const m4 = new THREE.Matrix4();
      cena.pontos.forEach((x, i) => { m4.makeTranslation(local(x.xyz)); frente.setMatrixAt(i, m4); });
      scene.add(frente);
      const cil = new THREE.CylinderGeometry(raio * 0.9, raio * 0.9, 1, 12);
      const furos = new THREE.InstancedMesh(cil, matI.clone(), Math.max(1, cena.segmentos.length));
      furos.count = cena.segmentos.length;
      const cima = new THREE.Vector3(0, 1, 0);
      cena.segmentos.forEach((x, i) => {
        const a = local(x.xyz0), b = local(x.xyz1), dir = b.clone().sub(a), comp = Math.max(dir.length(), raio * 0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(cima, dir.clone().normalize());
        m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, comp, 1));
        furos.setMatrixAt(i, m4);
      });
      scene.add(furos);
      const destaque = new THREE.Mesh(new THREE.SphereGeometry(raio * 2.2, 20, 14), new THREE.MeshBasicMaterial({ color: 0x1971c2, wireframe: true }));
      destaque.visible = false;
      scene.add(destaque);

      const controles = new OrbitControls(camera, renderer.domElement);
      const centro = bb.getCenter(new THREE.Vector3());
      const reenquadrar = () => {
        controles.target.copy(centro);
        camera.position.copy(centro.clone().add(new THREE.Vector3(tam * 0.6, -tam * 0.8, tam * 0.6)));
        camera.near = tam / 2000; camera.far = tam * 50; camera.updateProjectionMatrix();
        controles.update();
      };
      reenquadrar();
      const render = () => renderer.render(scene, camera);
      controles.addEventListener("change", render);

      // seleção por clique (raycast) e coordenada real
      const ray = new THREE.Raycaster();
      ray.params.Line = { threshold: raio * 1.5 };
      const ndc = new THREE.Vector2();
      let baixo: { x: number; y: number } | null = null;
      renderer.domElement.addEventListener("pointerdown", (e) => { baixo = { x: e.clientX, y: e.clientY }; });
      renderer.domElement.addEventListener("pointerup", (e) => {
        if (!baixo || Math.hypot(e.clientX - baixo.x, e.clientY - baixo.y) > 4) return;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const alvos = [frente, furos, grupoTraj, grupoTopo].filter((x) => x.visible);
        const hit = ray.intersectObjects(alvos, true)[0];
        if (!hit) { cb.current.aoCoordenada(null); return; }
        cb.current.aoCoordenada([hit.point.x + o[0], hit.point.y + o[1], hit.point.z + o[2]]);
        if (hit.object === frente && hit.instanceId != null) cb.current.aoSelecionar(cena.pontos[hit.instanceId].chave);
        if (hit.object === furos && hit.instanceId != null) cb.current.aoSelecionar(cena.segmentos[hit.instanceId].chave);
      });
      const ro = new ResizeObserver(() => { renderer.setSize(el.clientWidth, el.clientHeight); camera.aspect = el.clientWidth / el.clientHeight; camera.updateProjectionMatrix(); render(); });
      ro.observe(el);

      const cor = new THREE.Color();
      motor.current = {
        atualizar: ({ camadas: cam, corDe: cd, selecionado: sel }) => {
          cena.pontos.forEach((x, i) => frente.setColorAt(i, cor.set(cd(x))));
          cena.segmentos.forEach((x, i) => furos.setColorAt(i, cor.set(cd(x))));
          if (frente.instanceColor) frente.instanceColor.needsUpdate = true;
          if (furos.instanceColor) furos.instanceColor.needsUpdate = true;
          grupoTopo.visible = cam.topografia; frente.visible = cam.frente; grupoTraj.visible = cam.trajetorias; furos.visible = cam.intervalos;
          const p = cena.pontos.find((x) => x.chave === sel), sg = cena.segmentos.find((x) => x.chave === sel);
          destaque.visible = !!(p || sg);
          if (p) destaque.position.copy(local(p.xyz));
          if (sg) destaque.position.copy(local(sg.xyz0).add(local(sg.xyz1)).multiplyScalar(0.5));
          render();
        },
        reenquadrar: () => { reenquadrar(); render(); },
        destruir: () => { ro.disconnect(); controles.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); },
      };
      // ganchos de inspeção (testes e suporte): projeta um objeto na tela e conta o que foi desenhado
      (window as unknown as { geomina3d: unknown }).geomina3d = {
        contagem: { frente: cena.pontos.length, intervalos: cena.segmentos.length, trajetorias: cena.trajetorias.length, topografia: grupoTopo.userData.segmentos ?? 0 },
        projetar: (chave: string) => {
          const p = cena.pontos.find((x) => x.chave === chave), sg = cena.segmentos.find((x) => x.chave === chave);
          const v = p ? local(p.xyz) : sg ? local(sg.xyz0).add(local(sg.xyz1)).multiplyScalar(0.5) : null;
          if (!v) return null;
          v.project(camera);
          const r = renderer.domElement.getBoundingClientRect();
          return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
        },
        cor: (chave: string) => {
          const i = cena.pontos.findIndex((x) => x.chave === chave), j = cena.segmentos.findIndex((x) => x.chave === chave);
          const c = new THREE.Color();
          if (i >= 0) frente.getColorAt(i, c); else if (j >= 0) furos.getColorAt(j, c); else return null;
          return "#" + c.getHexString();
        },
      };
      motor.current.atualizar({ camadas, corDe, selecionado });
    })();
    return () => { vivo = false; motor.current?.destruir(); motor.current = null; };
  }, [cena, topo]); // eslint-disable-line react-hooks/exhaustive-deps

  // trocar analito/classes/camadas/seleção NÃO reconstrói a geometria: só recolore/mostra
  useEffect(() => { motor.current?.atualizar({ camadas, corDe, selecionado }); });

  return (
    <>
      {erro && <Alert color="orange" m="sm">{erro}</Alert>}
      <div ref={caixa} data-testid="visor-3d" style={{ width: "100%", height: "calc(100vh - 330px)", minHeight: 400 }} />
      <Button size="compact-xs" variant="default" style={{ position: "absolute", right: 8, bottom: 6 }} onClick={() => motor.current?.reenquadrar()}>Enquadrar</Button>
    </>
  );
}
