"""Minimal Symbolic Intelligent Model state transition core."""

from typing import Any, Mapping

from cognitive.state import SIMState


class SIMCore:
    def step(self, state: SIMState, message: Mapping[str, Any]) -> SIMState:
        if not isinstance(message.get("payload", {}), Mapping):
            raise ValueError("SIM message payload must be an object")
        observations = int(state.data.get("observations", 0)) + 1
        return state.evolve({
            "observations": observations,
            "lastMessageId": message.get("id"),
            "lastMessageType": message.get("type"),
            "lastPayload": dict(message.get("payload", {})),
        })
