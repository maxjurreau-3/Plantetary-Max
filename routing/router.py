"""Identity-aware deterministic routing from the kernel to domain lanes."""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, Mapping, Optional
from uuid import uuid4

from governance.engine import GovernanceEngine
from identity.registry import Identity, IdentityRegistry
from routing.table import LANE_ACTIONS, MESSAGE_ACTIONS, ROUTES

LOGGER = logging.getLogger("portal.routing")


class RoutingError(ValueError):
    pass


@dataclass(frozen=True)
class RouteDecision:
    identity: Identity
    lanes: tuple[str, ...]
    action: str


class Router:
    def __init__(self, identity_registry: Optional[IdentityRegistry] = None, governance: Optional[GovernanceEngine] = None) -> None:
        self.identity_registry = identity_registry or IdentityRegistry()
        self.governance = governance or GovernanceEngine()
        self.sequence = 0
        self.table = RoutingTable()

    def route(self, envelope: Mapping[str, Any]) -> RouteDecision:
        message_type = envelope.get("type")
        if not isinstance(message_type, str) or message_type not in ROUTES:
            raise RoutingError(f"unsupported message type: {message_type!r}")
        identity = self.identity_registry.validate(envelope.get("identity"))
        lanes = ROUTES[message_type]
        message_action = MESSAGE_ACTIONS.get(message_type)
        context = envelope.get("governanceContext") or {}
        if not isinstance(context, Mapping):
            raise RoutingError("governanceContext must be an object")
        actions = [message_action] if message_action else [LANE_ACTIONS[lane] for lane in lanes]
        for action in actions:
            if not self.governance.authorize(identity, action, context):
                LOGGER.warning("route denied message=%s identity=%s action=%s", envelope.get("id"), identity.id, action)
                raise PermissionError(f"not authorized for {action}")
        self.sequence += 1
        LOGGER.info("route accepted message=%s sequence=%d lanes=%s", envelope.get("id"), self.sequence, ",".join(lanes))
        return RouteDecision(identity, lanes, message_action or actions[0])

    def submit_message(self, source: "RoutingDomain", target: "RoutingDomain", identity_id: str, payload: Dict[str, Any]) -> str:
        """Compatibility entrypoint for the original registered-route API."""
        message_id = str(uuid4())
        message = RoutedMessage(message_id, source, target, identity_id, payload)
        return message_id if self.table.route(message) else ""


class RoutingDomain(Enum):
    WORKER = "worker"
    KERNEL = "kernel"
    COGNITIVE = "cognitive"
    TEC = "tec"
    SUBSTRATE = "substrate"


@dataclass
class RoutedMessage:
    id: str
    source_domain: RoutingDomain
    target_domain: RoutingDomain
    identity_id: str
    payload: Dict[str, Any]
    priority: int = 0
    sequence: int = 0


class RoutingTable:
    def __init__(self) -> None:
        self.routes: Dict[str, Callable[[RoutedMessage], Any]] = {}

    def register_route(self, source: RoutingDomain, target: RoutingDomain, handler: Callable) -> None:
        self.routes[f"{source.value}->{target.value}"] = handler

    def route(self, message: RoutedMessage) -> bool:
        handler = self.routes.get(f"{message.source_domain.value}->{message.target_domain.value}")
        if handler is None:
            return False
        handler(message)
        return True
