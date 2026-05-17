from sqlalchemy import Column, Date, ForeignKey, Integer, Numeric

from app.database import Base


class EntityGroupMember(Base):
    """
    Many-to-many: which operating/sub-entities roll up into a consolidation entity.
    An entity can belong to multiple consolidation groups (e.g. "Total Co" and
    "North America Sub-Group").
    effective_from / effective_to are nullable — NULL means "no boundary on that side".
    """
    __tablename__ = "entity_group_members"

    consolidation_entity_id = Column(
        Integer, ForeignKey("entities.id"), primary_key=True, nullable=False
    )
    member_entity_id = Column(
        Integer, ForeignKey("entities.id"), primary_key=True, nullable=False
    )
    ownership_pct = Column(Numeric(7, 4), nullable=False, default=100.0000)
    effective_from = Column(Date, nullable=True)
    effective_to   = Column(Date, nullable=True)
