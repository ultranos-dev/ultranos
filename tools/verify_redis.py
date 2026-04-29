"""
Phase 2 — Link verification: Upstash Redis
PING, SET, GET, TTL, DEL cycle.
Usage: python tools/verify_redis.py
"""
import os, sys, json
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

try:
    import httpx
except ImportError:
    print("Install: pip install httpx python-dotenv")
    sys.exit(1)

url   = os.environ.get("UPSTASH_REDIS_REST_URL")
token = os.environ.get("UPSTASH_REDIS_REST_TOKEN")

if not url or not token:
    print("❌ UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing from .env")
    sys.exit(1)

headers = {"Authorization": f"Bearer {token}"}

def redis_cmd(*args):
    resp = httpx.post(f"{url}", headers=headers, json=list(args))
    resp.raise_for_status()
    return resp.json().get("result")

try:
    pong = redis_cmd("PING")
    assert pong == "PONG", f"Expected PONG, got {pong}"
    print(f"✅ PING → {pong}")

    redis_cmd("SET", "ultranos:verify", "ok", "EX", "10")
    val = redis_cmd("GET", "ultranos:verify")
    assert val == "ok", f"GET mismatch: {val}"
    print(f"✅ SET/GET → '{val}'")

    ttl = redis_cmd("TTL", "ultranos:verify")
    assert int(ttl) > 0, "TTL should be positive"
    print(f"✅ TTL → {ttl}s remaining")

    redis_cmd("DEL", "ultranos:verify")
    print("✅ DEL → key cleaned up")

    print("\n🔴 Upstash Redis verification PASSED")

except Exception as e:
    print(f"❌ Redis verification FAILED: {e}")
    sys.exit(1)
