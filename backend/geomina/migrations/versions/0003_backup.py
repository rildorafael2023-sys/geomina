"""permissao de backup

Revisão: 0003
Anterior: 0002
Criada em: 2026-11-25 23:44:55.526422
"""
from alembic import op
import sqlalchemy as sa
import uuid


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    t_perm = sa.table("permissao", sa.column("id", sa.Uuid), sa.column("codigo"), sa.column("descricao"))
    op.bulk_insert(t_perm, [{"id": uuid.uuid4(), "codigo": "sistema:backup",
                             "descricao": "Criar, baixar e restaurar backups"}])
    op.execute(sa.text("INSERT INTO papel_permissao (papel_id, permissao_id) SELECT p.id, m.id FROM papel p, "
                       "permissao m WHERE p.codigo = 'ADMIN' AND m.codigo = 'sistema:backup'"))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM papel_permissao WHERE permissao_id IN "
                       "(SELECT id FROM permissao WHERE codigo = 'sistema:backup')"))
    op.execute(sa.text("DELETE FROM permissao WHERE codigo = 'sistema:backup'"))
