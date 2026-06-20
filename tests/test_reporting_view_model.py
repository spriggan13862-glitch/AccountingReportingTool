"""Tests for ReportingView (Sprint P2) — presentation-only model."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.taxonomy import Taxonomy, TaxonomyNode
from app.models.reporting_view import ReportingView, ReportingViewRow
from app.services.reporting_view_service import (
    create_view, list_views, get_view, update_view, clone_view,
    add_row, update_row, delete_row,
    ReportingViewImmutableError,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    yield s
    s.close()


@pytest.fixture
def taxonomy(db):
    tx = Taxonomy(code="test_tax", name="Test Taxonomy", is_system=True, is_active=True)
    db.add(tx); db.flush()
    nodes = [
        TaxonomyNode(taxonomy_id=tx.id, code="REVENUE", name="Revenue", sort_order=100, level=0, is_system=True),
        TaxonomyNode(taxonomy_id=tx.id, code="COGS", name="COGS", sort_order=200, level=0, is_system=True),
        TaxonomyNode(taxonomy_id=tx.id, code="OPEX", name="Operating Expenses", sort_order=300, level=0, is_system=True),
    ]
    for n in nodes: db.add(n)
    db.commit()
    return tx


def test_create_view_with_rows(db, taxonomy):
    view = create_view(db, {
        "code": "std_is",
        "name": "Standard Income Statement",
        "taxonomy_id": taxonomy.id,
        "rows": [
            {"sort_order": 10, "row_type": "header", "label": "Revenue", "section_label": "Revenue"},
            {"sort_order": 20, "row_type": "taxonomy_node", "label": "Revenue", "section_label": "Revenue",
             "taxonomy_node_id": taxonomy.nodes[0].id},
            {"sort_order": 30, "row_type": "subtotal", "label": "Gross Profit",
             "formula": "{REVENUE} - {COGS}", "is_bold": True},
        ],
    })
    assert view.id is not None
    assert view.is_system is False
    assert len(view.rows) == 3
    assert view.rows[0].row_type == "header"
    assert view.rows[2].formula == "{REVENUE} - {COGS}"


def test_view_does_not_classify_accounts(db, taxonomy):
    """ReportingView must not have any account-classification fields."""
    view = create_view(db, {"code": "no_class", "name": "Test", "taxonomy_id": taxonomy.id})
    # The model must not have an 'account_id', 'normal_balance', or 'section' field
    # — those belong to the taxonomy layer.
    assert not hasattr(view, "account_id")
    assert not hasattr(view, "normal_balance")
    assert not hasattr(view, "section")
    # It MUST reference a taxonomy
    assert view.taxonomy_id == taxonomy.id


def test_system_view_immutable(db, taxonomy):
    view = ReportingView(
        code="sys_view", name="System View", taxonomy_id=taxonomy.id,
        is_system=True, is_active=True,
    )
    db.add(view); db.commit()
    with pytest.raises(ReportingViewImmutableError):
        update_view(db, view.id, {"name": "Hacked"})


def test_clone_view_preserves_rows_and_unsets_system(db, taxonomy):
    src = ReportingView(
        code="src", name="Source View", taxonomy_id=taxonomy.id,
        is_system=True, is_active=True,
        format_config={"scaling": "thousands", "decimals": 0},
    )
    db.add(src); db.flush()
    db.add(ReportingViewRow(view_id=src.id, sort_order=10, row_type="header", label="Revenue"))
    db.add(ReportingViewRow(view_id=src.id, sort_order=20, row_type="subtotal", label="Net Income",
                            formula="{REVENUE} - {COGS} - {OPEX}", is_bold=True))
    db.commit()

    clone = clone_view(db, src.id, "My Custom View")
    assert clone.is_system is False
    assert clone.parent_view_id == src.id
    assert clone.format_config == {"scaling": "thousands", "decimals": 0}
    assert len(clone.rows) == 2
    assert clone.rows[1].formula == "{REVENUE} - {COGS} - {OPEX}"


def test_add_row_to_custom_view(db, taxonomy):
    view = create_view(db, {"code": "blank", "name": "Blank", "taxonomy_id": taxonomy.id})
    row = add_row(db, view.id, {
        "sort_order": 100,
        "row_type": "calculation",
        "label": "EBITDA",
        "formula": "{OPERATING_INCOME} + {DEPRECIATION_EXPENSE} + {AMORTIZATION_EXPENSE}",
    })
    assert row.id is not None
    assert row.formula.startswith("{OPERATING_INCOME}")


def test_cannot_add_row_to_system_view(db, taxonomy):
    sys_view = ReportingView(code="sys", name="Sys", taxonomy_id=taxonomy.id, is_system=True, is_active=True)
    db.add(sys_view); db.commit()
    with pytest.raises(ReportingViewImmutableError):
        add_row(db, sys_view.id, {"sort_order": 1, "row_type": "header", "label": "X"})


def test_list_views_filters_by_taxonomy(db, taxonomy):
    other_tx = Taxonomy(code="other", name="Other", is_system=True, is_active=True)
    db.add(other_tx); db.flush()
    create_view(db, {"code": "v1", "name": "V1", "taxonomy_id": taxonomy.id})
    create_view(db, {"code": "v2", "name": "V2", "taxonomy_id": other_tx.id})

    assert len(list_views(db, taxonomy_id=taxonomy.id)) == 1
    assert len(list_views(db, taxonomy_id=other_tx.id)) == 1
    assert len(list_views(db)) == 2


def test_view_row_types_supported(db, taxonomy):
    """All four row types must be storable."""
    view = create_view(db, {
        "code": "all_types", "name": "All Types", "taxonomy_id": taxonomy.id,
        "rows": [
            {"sort_order": 10, "row_type": "header", "label": "Section A"},
            {"sort_order": 20, "row_type": "taxonomy_node", "label": "Revenue",
             "taxonomy_node_id": taxonomy.nodes[0].id},
            {"sort_order": 30, "row_type": "subtotal", "label": "Subtotal", "formula": "{REVENUE}"},
            {"sort_order": 40, "row_type": "calculation", "label": "EBITDA", "formula": "{OPERATING_INCOME}+{D&A}"},
            {"sort_order": 50, "row_type": "blank", "label": ""},
        ],
    })
    types = [r.row_type for r in view.rows]
    assert types == ["header", "taxonomy_node", "subtotal", "calculation", "blank"]
