"""
CRL-D: migration acknowledgment table.

Records that an admin reviewed a CRL migration validation report and
authorized the safe backfill executor to run against that exact report.

The executor refuses to run unless a matching (organization_id, report_hash)
acknowledgment exists.
"""
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from app.database import Base


class CrlMigrationAcknowledgment(Base):
    __tablename__ = "crl_migration_acknowledgments"

    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    # SHA-256 of the validation report JSON (without timestamp) — proves the
    # admin saw the exact state being migrated.
    report_hash = Column(String(64), nullable=False)
    acked_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    acked_at = Column(DateTime, nullable=False, server_default=func.now())
    notes = Column(String(500), nullable=True)
