"""Validated SIM state trajectory."""

from dataclasses import dataclass, field
from typing import List

from cognitive.state import SIMState


@dataclass
class SIMTrajectory:
    states: List[SIMState] = field(default_factory=list)
    max_states: int = 1000

    def append(self, state: SIMState) -> None:
        if self.states:
            previous = self.states[-1]
            if state.version != previous.version + 1 or state.parent_digest != previous.digest:
                raise ValueError("SIM trajectory discontinuity")
        elif state.version != 0:
            raise ValueError("SIM trajectory must begin at version zero")
        if len(self.states) >= self.max_states:
            raise RuntimeError("SIM trajectory bound exceeded")
        self.states.append(state)

    @property
    def current(self) -> SIMState:
        if not self.states:
            raise RuntimeError("SIM trajectory is empty")
        return self.states[-1]

    def is_valid(self) -> bool:
        return all(
            state.version == index
            and state.has_valid_digest()
            and (index == 0 or state.parent_digest == self.states[index - 1].digest)
            for index, state in enumerate(self.states)
        )
