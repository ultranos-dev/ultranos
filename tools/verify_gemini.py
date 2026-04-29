"""
Phase 2 — Link verification: Gemini AI
Sends a test SOAP generation prompt and validates JSON structure.
Usage: python tools/verify_gemini.py
"""
import os, sys, json
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

try:
    import httpx
except ImportError:
    print("Install: pip install httpx python-dotenv")
    sys.exit(1)

api_key = os.environ.get("GEMINI_API_KEY")
if not api_key:
    print("❌ GEMINI_API_KEY missing from .env")
    sys.exit(1)

MODEL = "gemini-2.0-flash"
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={api_key}"

payload = {
    "contents": [{
        "parts": [{"text": (
            "Return a JSON SOAP note for a 35-year-old with a mild headache. "
            "Keys: subjective, objective, assessment, plan. No patient names."
        )}]
    }],
    "generationConfig": {"responseMimeType": "application/json"}
}

try:
    resp = httpx.post(URL, json=payload, timeout=30)
    resp.raise_for_status()

    content = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    soap = json.loads(content)

    required = {"subjective", "objective", "assessment", "plan"}
    missing = required - set(soap.keys())
    if missing:
        raise ValueError(f"Missing SOAP keys: {missing}")

    print(f"✅ Gemini API connected ({MODEL})")
    print(f"   Subjective preview: {soap['subjective'][:80]}...")
    print(f"\n🤖 Gemini verification PASSED")

except Exception as e:
    print(f"❌ Gemini verification FAILED: {e}")
    sys.exit(1)
