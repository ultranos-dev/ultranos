"""
Phase 2 — Link verification: Supabase
Connects to Supabase and verifies all required tables exist.
Usage: python tools/verify_supabase.py
"""
import os, sys
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

try:
    from supabase import create_client
except ImportError:
    print("Install: pip install supabase python-dotenv")
    sys.exit(1)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env")
    sys.exit(1)

try:
    client = create_client(url, key)
    print(f"✅ Supabase client created → {url}")

    required_tables = ["practitioners", "patients", "consent_records", "audit_log"]
    all_ok = True

    for table in required_tables:
        resp = client.table(table).select("id").limit(1).execute()
        count = len(resp.data) if resp.data else 0
        print(f"   ✅ Table '{table}' exists (rows in sample: {count})")

    print("\n🏥 Supabase verification PASSED — all tables present")

except Exception as e:
    print(f"❌ Supabase verification FAILED: {e}")
    sys.exit(1)
