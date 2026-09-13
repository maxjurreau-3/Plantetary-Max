"""Thin optional adapter to the external MAX-OS-1 universe engine.

Set ``MAXOS_MODULE`` to the import name of the installed MAX-OS-1 package. A
deterministic in-memory engine keeps Portal-OS locally testable when that
separate repository is not installed.
"""

import importlib
import os
import threading
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, Mapping, Optional


def _json_value(value: Any) -> Any:
    if is_dataclass(value):
        return _json_value(asdict(value))
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_value(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


class _LocalUniverse:
    def __init__(self) -> None:
        self.started = False
        self.tick = 0
        self.ecosystem: Dict[str, Any] = {"population": 0, "resources": 100}

    def start_universe(self) -> Dict[str, Any]:
        self.started = True
        return self.get_universe_state()

    def tick_universe(self, payload: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
        if not self.started:
            self.start_universe()
        self.tick += 1
        changes = dict((payload or {}).get("changes", {}))
        for key, value in changes.items():
            if isinstance(value, (int, float)) and isinstance(self.ecosystem.get(key, 0), (int, float)):
                self.ecosystem[key] = self.ecosystem.get(key, 0) + value
            else:
                self.ecosystem[key] = value
        return self.get_universe_state()

    def get_universe_state(self) -> Dict[str, Any]:
        return {"started": self.started, "tick": self.tick, "ecosystem": dict(self.ecosystem)}

    def get_umbrella_status(self) -> Dict[str, Any]:
        return {"active": self.started, "governance": "umbrella", "violations": []}


class _ExternalUniverse:
    def __init__(self, engine: Any) -> None:
        self.engine = engine

    def _invoke(self, names: tuple[str, ...], *args: Any) -> Any:
        for name in names:
            method = getattr(self.engine, name, None)
            if callable(method):
                return method(*args)
        raise AttributeError(f"MAX-OS-1 engine does not implement any of {names}")

    def start_universe(self) -> Any:
        return self._invoke(("start_universe", "start", "boot"))

    def tick_universe(self, payload: Optional[Mapping[str, Any]] = None) -> Any:
        method = next((getattr(self.engine, name, None) for name in ("tick_universe", "tick") if callable(getattr(self.engine, name, None))), None)
        if method is None:
            raise AttributeError("MAX-OS-1 engine has no tick method")
        try:
            return method(dict(payload or {}))
        except TypeError:
            return method()

    def get_universe_state(self) -> Any:
        return self._invoke(("get_universe_state", "get_state", "state"))

    def get_umbrella_status(self) -> Any:
        return self._invoke(("get_umbrella_status", "umbrella_status"))


def _create_engine() -> tuple[Any, str]:
    module_name = os.environ.get("MAXOS_MODULE")
    if not module_name:
        return _LocalUniverse(), "local-fallback"
    module = importlib.import_module(module_name)
    engine_type = getattr(module, "MaxOsUnifiedOrchestrator", None)
    if engine_type is None:
        raise ImportError(f"{module_name} does not export MaxOsUnifiedOrchestrator")
    return _ExternalUniverse(engine_type()), module_name


_ENGINE, _BACKEND = _create_engine()
_LOCK = threading.RLock()


def _response(operation: str, value: Any) -> Dict[str, Any]:
    return {"ok": True, "operation": operation, "backend": _BACKEND, "data": _json_value(value)}


def start_universe() -> Dict[str, Any]:
    with _LOCK:
        return _response("start", _ENGINE.start_universe())


def tick_universe(payload: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    with _LOCK:
        return _response("tick", _ENGINE.tick_universe(payload))


def get_universe_state() -> Dict[str, Any]:
    with _LOCK:
        return _response("state", _ENGINE.get_universe_state())


def get_umbrella_status() -> Dict[str, Any]:
    with _LOCK:
        return _response("umbrella", _ENGINE.get_umbrella_status())
