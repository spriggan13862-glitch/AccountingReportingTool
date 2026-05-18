"""
Storage abstraction service.

Design
------
All file I/O goes through a StorageBackend implementation.
LocalStorageBackend persists files under a configurable base directory.

To add S3, Azure Blob, or GCS later:
  1. Implement a new class matching the StorageBackend Protocol.
  2. Swap the default_storage instance (or inject via dependency injection).
  No application code needs to change.

Storage path convention
-----------------------
  {org_slug}/{document_type}/{uuid}{ext}

This keeps files isolated per organization and queryable by type.
The relative path is stored in Document.storage_path and is portable
across backend implementations (S3 key, local path, etc.).
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Protocol, runtime_checkable


@runtime_checkable
class StorageBackend(Protocol):
    """Protocol that all storage backends must satisfy."""

    def save(self, relative_path: str, data: bytes) -> None:
        """Write data to relative_path, creating directories as needed."""

    def load(self, relative_path: str) -> bytes:
        """Read and return bytes from relative_path. Raises FileNotFoundError if absent."""

    def delete(self, relative_path: str) -> None:
        """Remove the file at relative_path. No-op if not found."""

    def exists(self, relative_path: str) -> bool:
        """Return True if relative_path exists in storage."""


class LocalStorageBackend:
    """
    Filesystem-backed storage. Files live at {base_path}/{relative_path}.
    base_path is typically ./storage or a mounted volume.
    """

    def __init__(self, base_path: str | Path) -> None:
        self.base_path = Path(base_path)

    def save(self, relative_path: str, data: bytes) -> None:
        full = self.base_path / relative_path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)

    def load(self, relative_path: str) -> bytes:
        full = self.base_path / relative_path
        if not full.exists():
            raise FileNotFoundError(f"Storage path not found: {relative_path}")
        return full.read_bytes()

    def delete(self, relative_path: str) -> None:
        full = self.base_path / relative_path
        if full.exists():
            full.unlink()

    def exists(self, relative_path: str) -> bool:
        return (self.base_path / relative_path).exists()


def compute_checksum(data: bytes) -> str:
    """Return the hex-encoded SHA-256 digest of data."""
    return hashlib.sha256(data).hexdigest()


# Module-level default instance.
# Override STORAGE_PATH env var or replace default_storage for testing/production.
_default_base = os.environ.get("STORAGE_PATH", "./storage")
default_storage: LocalStorageBackend = LocalStorageBackend(_default_base)
