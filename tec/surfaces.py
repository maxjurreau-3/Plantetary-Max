"""Execution surfaces available to TEC pipelines."""

from typing import Any, Callable, Mapping

from substrate.state_model import SubstrateState


class SubstrateSurface:
    def __init__(self, state: SubstrateState) -> None:
        self.state = state

    def execute(self, task: Mapping[str, Any]) -> Any:
        operation = task.get("operation")
        if operation == "substrate.read":
            return self.state.read(str(task.get("key", "")), str(task.get("source", "do")))
        if operation == "substrate.write":
            return self.state.write(str(task.get("key", "")), task.get("value"))
        raise ValueError(f"unsupported substrate operation: {operation}")


class SIMSurface:
    def __init__(self, step: Callable[[Mapping[str, Any]], Any]) -> None:
        self.step = step

    def execute(self, task: Mapping[str, Any]) -> Any:
        return self.step(task)


class HTTPSurface:
    def __init__(self, request: Callable[[Mapping[str, Any]], Any]) -> None:
        self.request = request

    def execute(self, task: Mapping[str, Any]) -> Any:
        return self.request(task)
