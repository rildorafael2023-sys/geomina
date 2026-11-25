"""Abertura do GeoMina em janela própria e encerramento automático.

- Abre a interface numa janela de aplicativo (Microsoft Edge ou Google Chrome no modo
  ``--app``: sem barra de endereço nem abas), com perfil próprio dentro da pasta de dados.
- Se nenhum desses navegadores for encontrado, usa o navegador padrão (aba comum).
- Instância única: se o GeoMina já estiver aberto com a mesma pasta de dados, apenas abre
  outra janela para ele.
- Encerramento: a interface envia sinais de presença; quando a última janela é fechada,
  o servidor local se encerra sozinho (ver ``Presenca``).
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path

log = logging.getLogger("geomina.janela")

# Tempos (segundos)
TOLERANCIA_INICIAL = 120  # tempo para a janela abrir e enviar o primeiro sinal
TOLERANCIA_SEM_SINAL = 180  # navegadores reduzem timers de janelas minimizadas para 1/min
ESPERA_APOS_FECHAR = 8  # recarregar a página não deve encerrar o aplicativo


def _candidatos_windows() -> list[Path]:
    bases = [os.environ.get(v) for v in ("PROGRAMFILES(X86)", "PROGRAMFILES", "LOCALAPPDATA")]
    rel = [
        Path("Microsoft/Edge/Application/msedge.exe"),
        Path("Google/Chrome/Application/chrome.exe"),
    ]
    return [Path(b) / r for r in rel for b in bases if b]


def localizar_navegador_app() -> Path | None:
    """Navegador capaz de abrir em modo aplicativo. Variável GEOMINA_NAVEGADOR tem prioridade."""
    definido = os.environ.get("GEOMINA_NAVEGADOR")
    if definido:
        return Path(definido) if Path(definido).exists() else None
    if sys.platform.startswith("win"):
        for c in _candidatos_windows():
            if c.exists():
                return c
        return None
    for nome in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser"):
        achado = shutil.which(nome)
        if achado:
            return Path(achado)
    return None


def comando_janela(navegador: Path, url: str, perfil: Path) -> list[str]:
    return [
        str(navegador),
        f"--app={url}",
        f"--user-data-dir={perfil}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate",
        "--window-size=1366,860",
    ]


def abrir_interface(url: str, pasta_dados: Path, preferir_janela: bool = True) -> str:
    """Abre a interface. Retorna 'janela' ou 'navegador'."""
    navegador = localizar_navegador_app() if preferir_janela else None
    if navegador:
        perfil = pasta_dados / "janela"
        perfil.mkdir(parents=True, exist_ok=True)
        opcoes = {}
        if sys.platform.startswith("win"):
            opcoes["creationflags"] = 0x00000008 | 0x00000200  # DETACHED_PROCESS | NEW_PROCESS_GROUP
        subprocess.Popen(comando_janela(navegador, url, perfil), stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, **opcoes)
        log.info("Interface aberta em janela própria (%s)", navegador.name)
        return "janela"
    webbrowser.open(url)
    log.info("Interface aberta no navegador padrão")
    return "navegador"


def instancia_existente(host: str, porta_inicial: int, pasta_dados: Path, tentativas: int = 20) -> str | None:
    """URL de um GeoMina já em execução com a mesma pasta de dados, se houver."""
    alvo = str(pasta_dados.resolve())
    for porta in range(porta_inicial, porta_inicial + tentativas):
        url = f"http://{host}:{porta}/"
        try:
            with urllib.request.urlopen(url + "api/v1/saude", timeout=0.5) as r:
                dados = json.loads(r.read())
        except Exception:
            continue
        if isinstance(dados, dict) and str(Path(dados.get("pasta_dados", "")).resolve()) == alvo:
            return url
    return None


def avisar_erro(mensagem: str) -> None:
    """Mostra o erro mesmo quando o aplicativo roda sem janela de console."""
    log.error(mensagem)
    if sys.platform.startswith("win"):
        try:
            import ctypes

            ctypes.windll.user32.MessageBoxW(None, mensagem, "GeoMina", 0x10)
            return
        except Exception:
            pass
    print(mensagem, file=sys.stderr)


@dataclass
class Presenca:
    """Sinais de vida das janelas abertas. Só encerra o aplicativo quando ``ativo``."""

    ativo: bool = False
    inicio: float = field(default_factory=time.monotonic)
    ultimo_sinal: float | None = None
    fechando_em: float | None = None

    def sinal(self) -> None:
        self.ultimo_sinal = time.monotonic()
        self.fechando_em = None

    def fechando(self) -> None:
        self.fechando_em = time.monotonic()

    def deve_encerrar(self, agora: float | None = None) -> bool:
        if not self.ativo:
            return False
        agora = time.monotonic() if agora is None else agora
        if self.ultimo_sinal is None:
            return agora - self.inicio > TOLERANCIA_INICIAL
        if self.fechando_em is not None and agora - self.fechando_em > ESPERA_APOS_FECHAR:
            return True
        return agora - self.ultimo_sinal > TOLERANCIA_SEM_SINAL
