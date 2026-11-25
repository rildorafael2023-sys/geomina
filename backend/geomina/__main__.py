"""Inicia o GeoMina no computador local: `python -m geomina`."""

from __future__ import annotations

import argparse
import logging
import socket
import threading
import webbrowser
from pathlib import Path

import uvicorn

from geomina.config import VERSAO_APP, Config


def _porta_livre(host: str, preferida: int) -> int:
    for porta in [preferida, *range(preferida + 1, preferida + 20)]:
        with socket.socket() as s:
            try:
                s.bind((host, porta))
                return porta
            except OSError:
                continue
    raise SystemExit("Nenhuma porta local disponível.")


def main() -> None:
    p = argparse.ArgumentParser(prog="geomina", description="GeoMina — aplicativo local")
    p.add_argument("--dados", type=Path, help="pasta de dados (banco, arquivos, backups)")
    p.add_argument("--porta", type=int, help="porta local (padrão 8765)")
    p.add_argument("--sem-navegador", action="store_true", help="não abrir o navegador automaticamente")
    args = p.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    extras = {k: v for k, v in {"dados": args.dados, "porta": args.porta}.items() if v is not None}
    cfg = Config(**extras)
    cfg.porta = _porta_livre(cfg.host, cfg.porta)

    from geomina.main import criar_app

    app = criar_app(cfg)
    url = f"http://{cfg.host}:{cfg.porta}/"
    print(f"\nGeoMina {VERSAO_APP} — dados em {cfg.dados}\nAbra {url} (feche esta janela para encerrar)\n")
    if not args.sem_navegador:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host=cfg.host, port=cfg.porta, log_level="warning")


if __name__ == "__main__":
    main()
