from sqlalchemy import Boolean, CheckConstraint, Column, ForeignKey, Integer, String

from app.database import Base


class FsLineItem(Base):
    __tablename__ = "fs_line_items"
    __table_args__ = (
        CheckConstraint("statement IN ('BS', 'IS', 'CF')", name="ck_fs_line_statement"),
    )

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    statement = Column(String(10), nullable=False)        # 'BS', 'IS', 'CF'
    section = Column(String(50), nullable=True)           # 'current_assets', 'opex', etc.
    sort_order = Column(Integer, nullable=False, default=0)
    parent_line_id = Column(Integer, ForeignKey("fs_line_items.id"), nullable=True)
    is_subtotal = Column(Boolean, nullable=False, default=False)
    sign_flip = Column(Boolean, nullable=False, default=False)
