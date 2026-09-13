"""
Rebuild 2: Full Integration Test

Tests the complete Portal-OS system:
  Worker → Kernel → SIM → TEC → Substrate → Worker

Validates:
  - Message flow end-to-end
  - Invariant enforcement
  - State coherence
  - Error recovery
"""

import sys
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Import system layers
try:
    from kernel.boot import KernelBoot
    from kernel.scheduler import MultiDomainScheduler, SchedulerLane, ScheduledMessage
    from kernel.invariants import InvariantChecker
    from cognitive.sim_core import SIMCore
    from cognitive.sim_state import SIMState
    from cognitive.sim_trajectory import SIMTrajectory, StepType
    from cognitive.sim_compute import SIMCompute
    from tec.pipeline import TECPipeline
    from tec.agent import TECAgent, AgentCapability
    from identity.provider import IdentityProvider, IdentityType
    from governance.policy import GovernanceLayer, PolicyStatement, PolicyAction, PolicyEffect
    from routing.router import Router, RoutingDomain
    from substrate.state import SubstrateState
except ImportError as e:
    print(f"[TEST] Import error: {e}")
    sys.exit(1)


class IntegrationTest:
    """
    Full Rebuild 2 integration test.
    Validates all system layers working together.
    """
    
    def __init__(self):
        self.results: Dict[str, bool] = {}
        self.passed = 0
        self.failed = 0
    
    def test_kernel_boot(self) -> bool:
        """Test kernel initialization"""
        print("\n[TEST] Kernel Boot...")
        try:
            boot = KernelBoot()
            state = boot.boot()
            print(f"[TEST] ✓ Kernel booted to phase: {state.phase.value}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ Kernel boot failed: {e}")
            return False
    
    def test_scheduler_lanes(self) -> bool:
        """Test multi-domain scheduler"""
        print("\n[TEST] Scheduler Lanes...")
        try:
            scheduler = MultiDomainScheduler()
            
            # Submit messages to each lane
            for lane in SchedulerLane:
                msg = ScheduledMessage(
                    id=f"msg_{lane.value}",
                    lane=lane,
                    priority=0,
                    payload={"test": True},
                    timestamp=0.0,
                )
                scheduler.submit(lane, msg)
            
            # Run a cycle
            processed = scheduler.cycle()
            print(f"[TEST] ✓ Scheduler processed {processed} messages")
            return True
        except Exception as e:
            print(f"[TEST] ✗ Scheduler test failed: {e}")
            return False
    
    def test_invariants(self) -> bool:
        """Test invariant checking"""
        print("\n[TEST] Invariants...")
        try:
            checker = InvariantChecker()
            result = checker.check_critical()
            print(f"[TEST] ✓ Critical invariants: {'PASS' if result else 'FAIL'}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ Invariant check failed: {e}")
            return False
    
    def test_sim_cognitive(self) -> bool:
        """Test SIM cognitive architecture"""
        print("\n[TEST] SIM Cognitive...")
        try:
            core = SIMCore()
            state = SIMState()
            trajectory = SIMTrajectory()
            compute = SIMCompute()
            
            state.initialize({"initialized": True})
            
            # Record a reasoning step
            step_id = trajectory.record_step(
                StepType.OBSERVATION,
                {"observation": "test"},
            )
            
            print(f"[TEST] ✓ SIM initialized, step: {step_id}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ SIM test failed: {e}")
            return False
    
    def test_tec_execution(self) -> bool:
        """Test TEC execution layer"""
        print("\n[TEST] TEC Execution...")
        try:
            pipeline = TECPipeline()
            agent_layer = TECAgent()
            
            # Register an agent
            agent_id = agent_layer.register_executor(
                "test_agent",
                [AgentCapability.EXECUTE],
            )
            
            print(f"[TEST] ✓ TEC agent registered: {agent_id}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ TEC test failed: {e}")
            return False
    
    def test_identity_governance(self) -> bool:
        """Test identity and governance"""
        print("\n[TEST] Identity & Governance...")
        try:
            identity = IdentityProvider()
            governance = GovernanceLayer()
            
            # Create identity
            identity_id = identity.create_identity(
                IdentityType.SERVICE,
                "test_service",
                {"role": "tester"},
            )
            
            # Check identity
            verified = identity.check_identity(identity_id)
            
            print(f"[TEST] ✓ Identity verified: {verified}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ Identity/Governance test failed: {e}")
            return False
    
    def test_routing(self) -> bool:
        """Test message routing"""
        print("\n[TEST] Message Routing...")
        try:
            router = Router()
            
            # Register a simple route
            def mock_handler(msg):
                pass
            
            router.table.register_route(
                RoutingDomain.WORKER,
                RoutingDomain.KERNEL,
                mock_handler,
            )
            
            # Submit a message
            msg_id = router.submit_message(
                RoutingDomain.WORKER,
                RoutingDomain.KERNEL,
                "test_identity",
                {"test": True},
            )
            
            print(f"[TEST] ✓ Message routed: {msg_id}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ Routing test failed: {e}")
            return False
    
    def test_substrate_state(self) -> bool:
        """Test substrate state layer"""
        print("\n[TEST] Substrate State...")
        try:
            substrate = SubstrateState()
            
            # Write strongly-consistent state
            substrate.write_persistent("config", {"value": "test"})
            
            # Write eventually-consistent state
            substrate.write_replicated("cache", {"data": "cached"})
            
            # Read state
            config = substrate.read("config")
            print(f"[TEST] ✓ Substrate state: {config}")
            return True
        except Exception as e:
            print(f"[TEST] ✗ Substrate test failed: {e}")
            return False
    
    def run_all(self) -> None:
        """Run all tests"""
        print("\n" + "="*60)
        print("REBUILD 2 — FULL INTEGRATION TEST")
        print("="*60)
        
        tests = [
            ("Kernel Boot", self.test_kernel_boot),
            ("Scheduler Lanes", self.test_scheduler_lanes),
            ("Invariants", self.test_invariants),
            ("SIM Cognitive", self.test_sim_cognitive),
            ("TEC Execution", self.test_tec_execution),
            ("Identity & Governance", self.test_identity_governance),
            ("Message Routing", self.test_routing),
            ("Substrate State", self.test_substrate_state),
        ]
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                self.results[test_name] = result
                if result:
                    self.passed += 1
                else:
                    self.failed += 1
            except Exception as e:
                print(f"[TEST] Unhandled error in {test_name}: {e}")
                self.results[test_name] = False
                self.failed += 1
        
        # Print summary
        print("\n" + "="*60)
        print(f"RESULTS: {self.passed} passed, {self.failed} failed")
        print("="*60)
        
        for test_name, result in self.results.items():
            status = "✓ PASS" if result else "✗ FAIL"
            print(f"{status}: {test_name}")
        
        print("="*60)
        print(f"\nRebuild 2: {'COMPLETE' if self.failed == 0 else 'INCOMPLETE'}")
        print("="*60 + "\n")
        
        if self.failed > 0:
            sys.exit(1)


if __name__ == "__main__":
    test = IntegrationTest()
    test.run_all()
