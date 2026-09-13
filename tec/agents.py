"""TEC agent abstraction."""

from abc import ABC, abstractmethod
from typing import Any, Mapping


class TECAgent(ABC):
    @abstractmethod
    def execute(self, task: Mapping[str, Any]) -> Any:
        """Execute one bounded TEC task."""
