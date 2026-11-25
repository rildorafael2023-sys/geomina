from alembic import context
from sqlalchemy import create_engine

import geomina.modelos  # noqa: F401  (registra as tabelas)
from geomina.db import Base

config = context.config
target_metadata = Base.metadata


def run_migrations_online() -> None:
    engine = create_engine(config.get_main_option("sqlalchemy.url"))
    with engine.connect() as connection:
        # PRAGMA só tem efeito fora de transação; o commit encerra o autobegin do SQLAlchemy 2.
        connection.exec_driver_sql("PRAGMA foreign_keys = OFF")
        connection.commit()
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys = ON")
    engine.dispose()


if context.is_offline_mode():
    raise SystemExit("Modo offline do Alembic não é usado neste projeto.")
run_migrations_online()
