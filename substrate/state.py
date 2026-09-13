"""
Substrate State Model
Rebuild 2: Durable Objects & KV State

Models the substrate layer: Durable Objects (DO) + Cloudflare KV.
Ensures state coherence and handles eventual consistency.
"""

from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import time


class StateConsistency(Enum):
    """Consistency model for state"""
    STRONG = "strong"              # DO: immediate
    EVENTUAL = "eventual"          # KV: eventually consistent
    CAUSAL = "causal"              # Write-after-read ordering


@dataclass
class StateEntry:
    """A single state entry"""
    key: str
    value: Dict[str, Any]
    version: int
    timestamp: float
    consistency: StateConsistency
    replicated: bool = False


class DurableObjectState:
    """
    Durable Object state.
    Provides strong consistency, immediate durability.
    """
    
    def __init__(self, object_id: str):
        self.object_id = object_id
        self.state: Dict[str, StateEntry] = {}
        self.version = 0
    
    def write(self, key: str, value: Dict[str, Any]) -> bool:
        """Write to DO state (strongly consistent)"""
        self.version += 1
        self.state[key] = StateEntry(
            key=key,
            value=value.copy(),
            version=self.version,
            timestamp=time.time(),
            consistency=StateConsistency.STRONG,
            replicated=True,
        )
        return True
    
    def read(self, key: str) -> Optional[Dict[str, Any]]:
        """Read from DO state"""
        entry = self.state.get(key)
        return entry.value if entry else None


class KVStore:
    """
    Cloudflare KV store.
    Eventually consistent, high replication.
    """
    
    def __init__(self):
        self.store: Dict[str, StateEntry] = {}
    
    def put(self, key: str, value: Dict[str, Any]) -> bool:
        """Write to KV (eventually consistent)"""
        self.store[key] = StateEntry(
            key=key,
            value=value.copy(),
            version=len(self.store),
            timestamp=time.time(),
            consistency=StateConsistency.EVENTUAL,
            replicated=False,  # Pending replication
        )
        return True
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """Read from KV"""
        entry = self.store.get(key)
        return entry.value if entry else None
    
    def list_keys(self, prefix: str = "") -> List[str]:
        """List keys matching prefix"""
        return [k for k in self.store.keys() if k.startswith(prefix)]


class SubstrateState:
    """
    Substrate state layer.
    Manages both DO (strong consistency) and KV (eventual consistency).
    """
    
    def __init__(self):
        self.do_store: Dict[str, DurableObjectState] = {}
        self.kv_store = KVStore()
    
    def write_persistent(self, key: str, value: Dict[str, Any]) -> bool:
        """Write strongly-consistent state (Durable Object)"""
        # Create or get DO
        do = self.do_store.get(key, DurableObjectState(key))
        self.do_store[key] = do
        return do.write(key, value)
    
    def write_replicated(self, key: str, value: Dict[str, Any]) -> bool:
        """Write eventually-consistent state (KV)"""
        return self.kv_store.put(key, value)
    
    def read(self, key: str) -> Optional[Dict[str, Any]]:
        """Read state (checks DO first, then KV)"""
        do = self.do_store.get(key)
        if do:
            return do.read(key)
        
        return self.kv_store.get(key)
    
    def ensure_coherence(self) -> bool:
        """
        Ensure DO and KV state are coherent.
        Syncs DO writes to KV.
        """
        # TODO: Implement sync logic
        return True
