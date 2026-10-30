import importlib
import os
import sys
import types
import unittest
from unittest.mock import patch

# Test API guardrails without connecting to Polestar or importing the real client.
fake=types.ModuleType("polestar_api")
fake.PolestarApi=object
sys.modules["polestar_api"]=fake
main=importlib.import_module("main")
from fastapi import HTTPException

class SafetyTests(unittest.TestCase):
    def test_missing_token_rejected(self):
        with patch.dict(os.environ, {"POLESTAR_GATEWAY_TOKEN":"sample123","POLESTAR_EMAIL":"user@example.com","POLESTAR_PASSWORD":"test"},clear=True):
            with self.assertRaises(HTTPException) as cm:
                main.auth(None)
            self.assertEqual(cm.exception.status_code,401)

    def test_invalid_token_rejected(self):
        with patch.dict(os.environ, {"POLESTAR_GATEWAY_TOKEN":"sample123","POLESTAR_EMAIL":"user@example.com","POLESTAR_PASSWORD":"test"},clear=True):
            with self.assertRaises(HTTPException) as cm:
                main.auth("Bearer wrong")
            self.assertEqual(cm.exception.status_code,401)

    def test_no_credentials_rejected(self):
        with patch.dict(os.environ, {"POLESTAR_GATEWAY_TOKEN":"sample123"},clear=True):
            with self.assertRaises(HTTPException) as cm:
                main.auth("Bearer sample123")
            self.assertEqual(cm.exception.status_code,503)

    def test_valid_auth(self):
        with patch.dict(os.environ, {"POLESTAR_GATEWAY_TOKEN":"sample123","POLESTAR_EMAIL":"user@example.com","POLESTAR_PASSWORD":"test"},clear=True):
            self.assertEqual(main.auth("Bearer sample123"),("user@example.com","test"))

if __name__=="__main__":
    unittest.main()
