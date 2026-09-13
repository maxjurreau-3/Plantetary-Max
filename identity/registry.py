"""Identity validation for every Portal-OS message."""

from dataclasses import dataclass, field
import os
from typing import Any, Dict, Iterable, Mapping, Optional


class IdentityError(ValueError):
    """Raised when a message does not carry a registered identity token."""


@dataclass(frozen=True)
class Identity:
    id: str
    name: str
    roles: tuple[str, ...]
    attributes: Mapping[str, Any] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "name": self.name, "roles": list(self.roles), "attributes": dict(self.attributes)}


class IdentityRegistry:
    """Small token registry for the synchronous bridge adapter.

    Deployments should construct this registry from their identity provider. The
    built-ins make local boot and integration tests deterministic.
    """

    def __init__(self) -> None:
        self._tokens: Dict[str, Identity] = {}
        configured = (
            ("PORTAL_SYSTEM_TOKEN", "system", ("admin",)),
            ("PORTAL_SERVICE_TOKEN", "portal-worker", ("operator",)),
            ("PORTAL_OBSERVER_TOKEN", "observer", ("observer",)),
        )
        for variable, name, roles in configured:
            token = os.environ.get(variable)
            if token:
                self.register(token, name, roles)

    def register(self, token: str, name: str, roles: Iterable[str], attributes: Optional[Mapping[str, Any]] = None) -> Identity:
        if not token or not token.strip():
            raise IdentityError("identity token cannot be empty")
        identity = Identity(name, name, tuple(sorted(set(roles))), dict(attributes or {}))
        self._tokens[token] = identity
        return identity

    def validate(self, identity_token: Any) -> Identity:
        if not isinstance(identity_token, str) or not identity_token:
            raise IdentityError("missing identity token")
        identity = self._tokens.get(identity_token)
        if identity is None:
            raise IdentityError("invalid identity token")
        return identity
