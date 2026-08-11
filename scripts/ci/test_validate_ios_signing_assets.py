#!/usr/bin/env python3
"""Tests for iOS production signing asset validation helpers."""
import unittest

from validate_ios_signing_assets import associated_domains_allowed


class AssociatedDomainsAllowedTests(unittest.TestCase):
    def test_accepts_explicit_authorized_domain(self) -> None:
        self.assertTrue(
            associated_domains_allowed(
                {"applinks:bytspot.app"},
                {"applinks:bytspot.app"},
            )
        )

    def test_accepts_apple_wildcard_profile_authorization(self) -> None:
        self.assertTrue(associated_domains_allowed({"applinks:bytspot.app"}, {"*"}))

    def test_rejects_missing_or_unrelated_domain(self) -> None:
        self.assertFalse(associated_domains_allowed({"applinks:bytspot.app"}, set()))
        self.assertFalse(
            associated_domains_allowed(
                {"applinks:bytspot.app"},
                {"applinks:other.example"},
            )
        )


if __name__ == "__main__":
    unittest.main()
