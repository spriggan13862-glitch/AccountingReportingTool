"""
Seed system taxonomies from data/taxonomies/*.json.
Run: python -m scripts.seed_taxonomies   (or python scripts/seed_taxonomies.py)
Idempotent: existing system taxonomies are skipped.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.services.taxonomy_library_service import seed_system_taxonomies


def main() -> None:
    db = SessionLocal()
    try:
        results = seed_system_taxonomies(db)
        for code, node_count in results.items():
            print(f"  {code:25s} {node_count:5d} nodes")
        print(f"\nSeeded/verified {len(results)} system taxonomies.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
