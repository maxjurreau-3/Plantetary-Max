"""Minimal immutable SIM state model."""

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Dict, Optional


def _digest(version: int, data: Dict[str, Any], parent_digest: Optional[str]) -> str:
    encoded = json.dumps(
        {"version": version, "data": data, "parent": parent_digest},
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True)
class SIMState:
    data: Dict[str, Any] = field(default_factory=dict)
    version: int = 0
    parent_digest: Optional[str] = None
    digest: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "data", dict(self.data))
        if not self.digest:
            object.__setattr__(self, "digest", _digest(self.version, self.data, self.parent_digest))

    def evolve(self, delta: Dict[str, Any]) -> "SIMState":
        new_data = dict(self.data)
        new_data.update(delta)
        return SIMState(new_data, self.version + 1, self.digest)

    def has_valid_digest(self) -> bool:
        return self.digest == _digest(self.version, self.data, self.parent_digest)
