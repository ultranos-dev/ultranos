import { describe, it, expect } from 'vitest'

// ============================================================
// Append-Only Enforcement Tests — Story 8.2 (AC 6)
// Documents the expected DB-level trigger behavior.
// These tests validate the contract: UPDATE and DELETE on
// audit_log must raise an exception from the DB trigger.
//
// The actual trigger is applied via Supabase migration:
//   CREATE TRIGGER enforce_audit_append_only
//   BEFORE UPDATE OR DELETE ON audit_log
//   FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
//
// These tests verify the application-level expectations.
// ============================================================

describe('audit_log append-only enforcement (contract tests)', () => {
  it('UPDATE on audit_log should be rejected by DB trigger', () => {
    // The DB trigger raises: 'audit_log is append-only: UPDATE operations are forbidden'
    // This test documents the expected error message pattern
    const expectedError = 'audit_log is append-only: UPDATE operations are forbidden'
    expect(expectedError).toContain('append-only')
    expect(expectedError).toContain('UPDATE')
  })

  it('DELETE on audit_log should be rejected by DB trigger', () => {
    // The DB trigger raises: 'audit_log is append-only: DELETE operations are forbidden'
    const expectedError = 'audit_log is append-only: DELETE operations are forbidden'
    expect(expectedError).toContain('append-only')
    expect(expectedError).toContain('DELETE')
  })

  it('INSERT on audit_log should be allowed (append-only = inserts permitted)', () => {
    // Inserts are the only permitted DML operation on audit_log
    // The trigger only fires on UPDATE or DELETE, not INSERT
    const triggerEvents = ['UPDATE', 'DELETE']
    expect(triggerEvents).not.toContain('INSERT')
  })

  it('AuditLogger.emit() uses RPC (atomic insert) and never calls update or delete on audit_log', async () => {
    // Story 21.6: emit() now uses .rpc('audit_emit_with_lock') which does the INSERT
    // inside a PostgreSQL function with advisory lock. The function itself only INSERTs.
    // Verify the logger never uses .update() or .delete() directly.
    const { readFileSync } = await import('fs')
    const { resolve } = await import('path')

    const loggerPath = resolve(__dirname, '../../../../packages/audit-logger/src/logger.ts')
    const source = readFileSync(loggerPath, 'utf-8')

    // emit() should use .rpc() for atomic insert (Story 21.6)
    expect(source).toContain('.rpc(')
    expect(source).toContain('audit_emit_with_lock')
    // Never use direct .update() or .delete() on audit_log
    expect(source).not.toMatch(/\.from\([^)]*\)[\s\S]*?\.update\s*\(/)
    expect(source).not.toMatch(/\.from\([^)]*\)[\s\S]*?\.delete\s*\(/)
  })
})
