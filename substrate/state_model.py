"""In-memory model of Durable Object and eventually-consistent KV state."""

import copy
import threading
from dataclasses import dataclass
from typing import Any, Dict


@dataclass(frozen=True)
class StateRecord:
    value: Any
    version: int


class SubstrateState:
    def __init__(self) -> None:
        self.do_state: Dict[str, StateRecord] = {}
        self.kv_state: Dict[str, StateRecord] = {}
        self._version = 0
        self._lock = threading.RLock()

    def write(self, key: str, value: Any, replicate: bool = True) -> Dict[str, Any]:
        if not isinstance(key, str) or not key:
            raise ValueError("substrate key must be a non-empty string")
        with self._lock:
            self._version += 1
            record = StateRecord(copy.deepcopy(value), self._version)
            self.do_state[key] = record
            if replicate:
                self.kv_state[key] = record
            return {"key": key, "version": record.version, "replicated": replicate}

    def replicate(self, key: str) -> Dict[str, Any]:
        with self._lock:
            record = self.do_state.get(key)
            if record is None:
                raise KeyError(key)
            self.kv_state[key] = record
            return {"key": key, "version": record.version, "replicated": True}

    def read(self, key: str, source: str = "do") -> Any:
        with self._lock:
            store = self.kv_state if source == "kv" else self.do_state
            record = store.get(key)
            return copy.deepcopy(record.value) if record else None

    def is_consistent(self) -> bool:
        with self._lock:
            for key, record in self.do_state.items():
                replica = self.kv_state.get(key)
                if replica is None:
                    continue
                if replica.version > record.version:
                    return False
                if replica.version == record.version and replica.value != record.value:
                    return False
            return True

    def kv_eventually_consistent(self) -> bool:
        with self._lock:
            return all(self.kv_state.get(key) == record for key, record in self.do_state.items())
