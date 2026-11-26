"""layouts salvos da geoquímica operacional

Revisão: 0009
Anterior: 0008
Criada em: 2026-11-26
"""
import sqlalchemy as sa
from alembic import op

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('layout_analise',
                    sa.Column('mina_id', sa.Uuid(), nullable=False),
                    sa.Column('dono_id', sa.Uuid(), nullable=False),
                    sa.Column('nome', sa.String(length=120), nullable=False),
                    sa.Column('tipo', sa.String(length=12), nullable=False),
                    sa.Column('config', sa.JSON(), nullable=False),
                    sa.Column('compartilhado', sa.Boolean(), nullable=False),
                    sa.Column('id', sa.Uuid(), nullable=False),
                    sa.Column('criado_em', sa.DateTime(timezone=True), nullable=False),
                    sa.Column('criado_por', sa.Uuid(), nullable=True),
                    sa.Column('atualizado_em', sa.DateTime(timezone=True), nullable=True),
                    sa.Column('atualizado_por', sa.Uuid(), nullable=True),
                    sa.Column('versao', sa.Integer(), nullable=False),
                    sa.CheckConstraint("tipo IN ('galeria','sondagem','comparacao')", name=op.f('ck_layout_analise_tipo_layout_valido')),
                    sa.ForeignKeyConstraint(['dono_id'], ['usuario.id'], name=op.f('fk_layout_analise_dono_id_usuario'), ondelete='RESTRICT'),
                    sa.ForeignKeyConstraint(['mina_id'], ['mina.id'], name=op.f('fk_layout_analise_mina_id_mina'), ondelete='RESTRICT'),
                    sa.PrimaryKeyConstraint('id', name=op.f('pk_layout_analise')),
                    sa.UniqueConstraint('mina_id', 'dono_id', 'tipo', 'nome', name=op.f('uq_layout_analise_layout_nome_unico')))
    op.create_index(op.f('ix_layout_analise_mina_id'), 'layout_analise', ['mina_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_layout_analise_mina_id'), table_name='layout_analise')
    op.drop_table('layout_analise')
