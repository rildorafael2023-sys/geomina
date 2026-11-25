// Sinais de presença: com o GeoMina aberto em janela própria, o aplicativo se encerra
// sozinho quando a última janela é fechada (ver backend/geomina/janela.py).
const CABECALHO = { "X-GeoMina": "1" };

export function iniciarPresenca(): () => void {
  const sinal = () => fetch("/api/v1/sistema/presenca", { method: "POST", headers: CABECALHO }).catch(() => undefined);
  const fechando = () =>
    fetch("/api/v1/sistema/fechando", { method: "POST", headers: CABECALHO, keepalive: true }).catch(() => undefined);
  sinal();
  const id = window.setInterval(sinal, 15000);
  const aoVoltar = () => document.visibilityState === "visible" && sinal();
  window.addEventListener("pagehide", fechando);
  document.addEventListener("visibilitychange", aoVoltar);
  return () => {
    window.clearInterval(id);
    window.removeEventListener("pagehide", fechando);
    document.removeEventListener("visibilitychange", aoVoltar);
  };
}
