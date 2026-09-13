"""
Comprehensive Test Suite
Rebuild 3: Feature Testing

Unit tests, integration tests, and E2E tests.
"""

import sys
import unittest
from pathlib import Path
from typing import Dict, Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Test imports
try:
    from inference.unification import Unifier, Substitution
    from inference.confidence import ConfidencePropagator
    from tec.rollback import RollbackManager, CheckpointManager
    from substrate.recovery import CrashRecovery
    from messaging.http_handler import HTTPMessageHandler
    from messaging.queue import MessageQueue, QueuedMessage
    from integration.end_to_end import EndToEndMessageFlow
except ImportError as e:
    print(f"Import error: {e}")
    sys.exit(1)


class TestUnification(unittest.TestCase):
    """Test unification algorithm"""
    
    def setUp(self):
        self.unifier = Unifier()
    
    def test_identical_terms(self):
        """Test unifying identical terms"""
        term = {"predicate": "likes", "subject": "alice", "object": "bob"}
        result = self.unifier.unify(term, term)
        self.assertIsNotNone(result)
    
    def test_variable_unification(self):
        """Test unifying with variables"""
        term1 = {"subject": "?X", "predicate": "likes", "object": "bob"}
        term2 = {"subject": "alice", "predicate": "likes", "object": "bob"}
        result = self.unifier.unify(term1, term2)
        self.assertIsNotNone(result)
        self.assertEqual(result.bindings.get("?X"), "alice")
    
    def test_no_unification(self):
        """Test when terms cannot unify"""
        term1 = {"predicate": "likes", "object": "alice"}
        term2 = {"predicate": "hates", "object": "alice"}
        result = self.unifier.unify(term1, term2)
        self.assertIsNone(result)


class TestConfidence(unittest.TestCase):
    """Test confidence propagation"""
    
    def test_combine_confidence(self):
        """Test combining confidence values"""
        confidences = [0.8, 0.9, 0.7]
        result = ConfidencePropagator.combine_confidence(confidences)
        self.assertGreater(result, 0.0)
        self.assertLessEqual(result, 1.0)
    
    def test_chain_propagation(self):
        """Test confidence through chain"""
        chain = [0.9, 0.8, 0.7]
        result = ConfidencePropagator.propagate_through_chain(chain)
        # Should be product
        self.assertAlmostEqual(result, 0.9 * 0.8 * 0.7)
    
    def test_bayesian_update(self):
        """Test Bayesian update"""
        prior = 0.5
        likelihood = 0.9
        evidence = 0.7
        result = ConfidencePropagator.bayesian_update(prior, likelihood, evidence)
        self.assertGreater(result, 0.0)
        self.assertLessEqual(result, 1.0)


class TestRollback(unittest.TestCase):
    """Test rollback mechanism"""
    
    def setUp(self):
        self.manager = RollbackManager()
        self.checkpoint = CheckpointManager()
    
    def test_checkpoint_creation(self):
        """Test creating checkpoints"""
        state = {"key": "value"}
        checkpoint_id = self.checkpoint.create_checkpoint("test", state)
        self.assertIsNotNone(checkpoint_id)
    
    def test_checkpoint_restore(self):
        """Test restoring from checkpoint"""
        state = {"key": "value", "counter": 42}
        checkpoint_id = self.checkpoint.create_checkpoint("test", state)
        restored = self.checkpoint.restore_checkpoint(checkpoint_id)
        self.assertEqual(restored, state)


class TestHTTPHandler(unittest.TestCase):
    """Test HTTP message handling"""
    
    def setUp(self):
        self.handler = HTTPMessageHandler()
    
    def test_parse_request(self):
        """Test parsing HTTP request"""
        http_req = {
            "method": "POST",
            "path": "/message",
            "headers": {"Content-Type": "application/json"},
            "body": '{"goal": "test"}',
        }
        result = self.handler.parse_request(http_req)
        self.assertIsNotNone(result)
        self.assertEqual(result.method, "POST")
        self.assertEqual(result.body.get("goal"), "test")
    
    def test_build_response(self):
        """Test building HTTP response"""
        response = self.handler.build_response(
            200,
            {"result": "success"},
            "req-123",
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(response.body["result"], "success")


class TestMessageQueue(unittest.TestCase):
    """Test message queue"""
    
    def setUp(self):
        self.queue = MessageQueue(max_size=100)
    
    def test_enqueue_dequeue(self):
        """Test basic queue operations"""
        msg = QueuedMessage(
            id="msg-1",
            source="test",
            payload={"data": "test"},
        )
        
        self.assertTrue(self.queue.enqueue(msg))
        dequeued = self.queue.dequeue()
        self.assertEqual(dequeued.id, "msg-1")
    
    def test_queue_full(self):
        """Test queue capacity"""
        small_queue = MessageQueue(max_size=1)
        
        msg1 = QueuedMessage(id="msg-1", source="test", payload={})
        msg2 = QueuedMessage(id="msg-2", source="test", payload={})
        
        self.assertTrue(small_queue.enqueue(msg1))
        self.assertFalse(small_queue.enqueue(msg2))


def run_tests():
    """
    Run all tests
    """
    print("\n" + "="*60)
    print("REBUILD 3 — TEST SUITE")
    print("="*60 + "\n")
    
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestUnification))
    suite.addTests(loader.loadTestsFromTestCase(TestConfidence))
    suite.addTests(loader.loadTestsFromTestCase(TestRollback))
    suite.addTests(loader.loadTestsFromTestCase(TestHTTPHandler))
    suite.addTests(loader.loadTestsFromTestCase(TestMessageQueue))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "="*60)
    if result.wasSuccessful():
        print("✅ ALL TESTS PASSED")
    else:
        print(f"✗ FAILURES: {len(result.failures)}, ERRORS: {len(result.errors)}")
    print("="*60 + "\n")
    
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(run_tests())
