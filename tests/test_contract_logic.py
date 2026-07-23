"""
Policy-focused tests for Smart Bounty Verifier.

These tests validate the safety rules we expect the contract and preview UI to
follow, without requiring a live GenLayer runtime.
"""

import ipaddress
import json
import unittest
from urllib.parse import urlparse


def host_is_public(hostname: str) -> bool:
    host = (hostname or "").strip().lower()
    if not host:
        return False

    blocked_hosts = {
        "localhost",
        "0.0.0.0",
        "127.0.0.1",
        "::1",
        "metadata.google.internal",
    }
    if host in blocked_hosts or host.endswith(".local"):
        return False

    try:
        addr = ipaddress.ip_address(host)
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        )
    except ValueError:
        return True


def validate_public_url(url: str) -> str:
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in ("http", "https"):
        raise ValueError("bad scheme")
    if not parsed.hostname:
        raise ValueError("missing hostname")
    if parsed.username or parsed.password:
        raise ValueError("embedded credentials are not allowed")
    if not host_is_public(parsed.hostname):
        raise ValueError("host must be public")
    return parsed.geturl()


def calculate_threshold(total: int, threshold_pct: int) -> int:
    if threshold_pct < 1 or threshold_pct > 100:
        raise ValueError("threshold_pct must be between 1 and 100")
    return (total * threshold_pct + 99) // 100


def fail_closed_verdict(requirements, reason):
    return {
        "details": [
            {
                "requirement": req,
                "result": "FAIL",
                "reason": reason,
            }
            for req in requirements
        ],
        "passed_count": 0,
        "total_count": len(requirements),
        "verdict": "FAIL",
    }


class TestBountyPolicy(unittest.TestCase):
    def test_public_https_url_is_allowed(self):
        value = validate_public_url("https://github.com/tranhop26/smart-bounty-verifier")
        self.assertEqual(value, "https://github.com/tranhop26/smart-bounty-verifier")

    def test_http_url_is_allowed(self):
        value = validate_public_url("http://example.com/repo")
        self.assertEqual(value, "http://example.com/repo")

    def test_rejects_localhost(self):
        with self.assertRaises(ValueError):
            validate_public_url("http://localhost:8080")

    def test_rejects_private_ip(self):
        with self.assertRaises(ValueError):
            validate_public_url("https://192.168.1.15/private")

    def test_rejects_metadata_host(self):
        with self.assertRaises(ValueError):
            validate_public_url("https://metadata.google.internal/compute")

    def test_rejects_embedded_credentials(self):
        with self.assertRaises(ValueError):
            validate_public_url("https://user:pass@example.com/repo")

    def test_threshold_100_percent_requires_all(self):
        self.assertEqual(calculate_threshold(3, 100), 3)

    def test_threshold_66_percent_rounds_up(self):
        self.assertEqual(calculate_threshold(3, 66), 2)

    def test_threshold_zero_is_rejected(self):
        with self.assertRaises(ValueError):
            calculate_threshold(5, 0)

    def test_fail_closed_verdict_marks_every_requirement_failed(self):
        verdict = fail_closed_verdict(["Has README", "Has tests"], "Submission page unavailable")
        self.assertEqual(verdict["verdict"], "FAIL")
        self.assertEqual(verdict["passed_count"], 0)
        self.assertEqual(verdict["total_count"], 2)
        self.assertTrue(all(item["result"] == "FAIL" for item in verdict["details"]))

    def test_fail_closed_verdict_is_json_safe(self):
        verdict = fail_closed_verdict(["Has README"], "Submission page unavailable")
        encoded = json.dumps(verdict)
        decoded = json.loads(encoded)
        self.assertEqual(decoded["details"][0]["reason"], "Submission page unavailable")


if __name__ == "__main__":
    unittest.main()
