import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEvent, AuditEventInput } from '@ultranos/shared-types';
export declare class AuditLogger {
    private readonly db;
    constructor(db: SupabaseClient);
    emit(input: AuditEventInput): Promise<AuditEvent>;
    verifyChain(limit?: number): Promise<{
        valid: boolean;
        broken_at?: string;
    }>;
}
//# sourceMappingURL=logger.d.ts.map