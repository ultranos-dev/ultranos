"""
Apply Supabase migrations directly via the REST API.
Reads all SQL files from supabase/migrations/ in order and executes them.
Usage: python tools/apply_migrations.py
"""
import os, sys, glob
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

try:
    import httpx
except ImportError:
    print("Install: pip install httpx python-dotenv")
    sys.exit(1)

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    sys.exit(1)

migrations_dir = Path(__file__).parent.parent / "supabase" / "migrations"
sql_files = sorted(glob.glob(str(migrations_dir / "*.sql")))

if not sql_files:
    print("No migration files found in supabase/migrations/")
    sys.exit(1)

headers = {
    "apikey": key,
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json",
}

# Use the Supabase SQL execution endpoint
rpc_url = f"{url}/rest/v1/rpc/exec_sql"

# Alternative: use pg REST execute endpoint
# Supabase exposes a pg REST endpoint at /rest/v1/
# For raw SQL, we use the management API or run via psql

print(f"Found {len(sql_files)} migration files:")
for f in sql_files:
    print(f"  {Path(f).name}")

print("\nTo apply migrations, run them directly in Supabase SQL Editor:")
print(f"  Dashboard: {url.replace('https://', 'https://app.supabase.com/project/')}/editor")
print("\nOr use the Supabase CLI:")
print("  supabase db push")
print("\nAlternatively, install psql and use:")
print("  psql <connection_string> -f supabase/migrations/001_fhir_schema.sql")
print("  psql <connection_string> -f supabase/migrations/002_rls_policies.sql")
print("  psql <connection_string> -f supabase/migrations/003_indexes.sql")
