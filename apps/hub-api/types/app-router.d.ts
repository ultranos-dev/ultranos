// ⚠️ GENERATED — do not edit by hand.
// Self-contained AppRouter type bundle for cross-app consumption (admin-portal tRPC
// client) without deep-typechecking hub-api source. Regenerate after changing the
// router API:  pnpm -F hub-api build:types

/**
 * Root tRPC router — aggregates all domain routers.
 * New domain routers should be added here.
 */
export declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: import("../init").TRPCContext;
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: true;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    health: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        check: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                timestamp: string;
                warnings?: string[] | undefined;
                status: "ok" | "degraded";
                version: string;
                services: {
                    db: string;
                    redis: "connected" | "disconnected" | "not_configured";
                };
            };
            meta: object;
        }>;
        auditChainIntegrity: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
            } | undefined;
            output: {
                valid: boolean;
                checkedCount: number;
                brokenAt: string | undefined;
            };
            meta: object;
        }>;
    }>>;
    patient: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
            };
            output: {
                patients: {
                    id: unknown;
                    resourceType: "Patient";
                    name: {
                        text: string;
                    }[];
                    gender: unknown;
                    birthDate: unknown;
                    birthYearOnly: unknown;
                    maritalStatus: string;
                    contact: {
                        relationship: "GUARDIAN" | "OTHER" | "SPOUSE" | "PARENT" | "SIBLING" | "CHILD" | "FRIEND";
                        name: string;
                        phone?: string | undefined;
                        gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                    }[] | undefined;
                    telecom: {
                        system: "phone";
                        value: string;
                        use: "home" | "work" | "mobile";
                    }[];
                    _ultranos: {
                        nameLocal: unknown;
                        nameLatin: unknown;
                        nationalIdHash: unknown;
                        isActive: unknown;
                        createdAt: unknown;
                        nameGiven: unknown;
                        nameFather: unknown;
                        nameGrandfather: unknown;
                        nameFamily: {} | undefined;
                        birthYear: unknown;
                        addressOrigin: {
                            province: string;
                            district: string;
                            village: string | undefined;
                        } | undefined;
                        addressCurrent: {
                            province: string;
                            district: string;
                            village: string | undefined;
                        } | undefined;
                        isNomadic: boolean;
                        bloodGroup: string;
                        photoUrl: string;
                        preferredLanguage: string;
                        mpiScore: unknown;
                        mpiWarn: boolean;
                        displacementCategory: string;
                        nationality: string;
                        occupation: string;
                        educationLevel: string;
                        disability: boolean;
                        hasAllergies: boolean;
                        lastVisitAt: string | undefined;
                    };
                    meta: {
                        lastUpdated: string;
                    };
                }[];
                nextCursor: string | null;
            };
            meta: object;
        }>;
        search: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                query: string;
            };
            output: {
                patients: {
                    id: unknown;
                    resourceType: "Patient";
                    name: {
                        text: string;
                    }[];
                    gender: unknown;
                    birthDate: unknown;
                    birthYearOnly: unknown;
                    maritalStatus: string;
                    contact: {
                        relationship: "GUARDIAN" | "OTHER" | "SPOUSE" | "PARENT" | "SIBLING" | "CHILD" | "FRIEND";
                        name: string;
                        phone?: string | undefined;
                        gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                    }[] | undefined;
                    telecom: {
                        system: "phone";
                        value: string;
                        use: "home" | "work" | "mobile";
                    }[];
                    _ultranos: {
                        nameLocal: unknown;
                        nameLatin: unknown;
                        nationalIdHash: unknown;
                        isActive: unknown;
                        createdAt: unknown;
                        nameGiven: unknown;
                        nameFather: unknown;
                        nameGrandfather: unknown;
                        nameFamily: {} | undefined;
                        birthYear: unknown;
                        addressOrigin: {
                            province: string;
                            district: string;
                            village: string | undefined;
                        } | undefined;
                        addressCurrent: {
                            province: string;
                            district: string;
                            village: string | undefined;
                        } | undefined;
                        isNomadic: boolean;
                        bloodGroup: string;
                        photoUrl: string;
                        preferredLanguage: string;
                        mpiScore: unknown;
                        mpiWarn: boolean;
                        displacementCategory: string;
                        nationality: string;
                        occupation: string;
                        educationLevel: string;
                        disability: boolean;
                    };
                    meta: {
                        lastUpdated: string;
                    };
                }[];
            };
            meta: object;
        }>;
        checkDuplicates: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                gender?: "unknown" | "male" | "female" | "other" | undefined;
                phone?: string | undefined;
                nameGiven?: string | undefined;
                nameFather?: string | undefined;
                nameGrandfather?: string | undefined;
                birthYear?: number | undefined;
                addressDistrictOrigin?: string | undefined;
                addressProvinceOrigin?: string | undefined;
                nationalId?: string | undefined;
                tazkiraPaperHash?: string | undefined;
                biometricFingerprintHash?: string | undefined;
            };
            output: {
                decision: import("@ultranos/mpi-engine").MpiDecision;
                topScore: number;
                proceedToken: string | undefined;
                candidates: {
                    id: string;
                    nameGiven: string | undefined;
                    nameFather: string | undefined;
                    birthYear: number | undefined;
                    gender: string | undefined;
                    districtOrigin: string | undefined;
                    mpiScore: number;
                    scoreBreakdown: import("@ultranos/mpi-engine").MpiScoreBreakdown;
                }[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                nameLocal: string;
                consent: {
                    version: string;
                    language: "en" | "ar" | "prs" | "ps";
                    method: "WRITTEN" | "VERBAL_WITNESSED";
                    witnessedBy?: string | undefined;
                };
                phone?: string | undefined;
                gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                nameLatin?: string | undefined;
                guardianId?: string | undefined;
                preferredLanguage?: "en" | "ar" | "prs" | "ps" | undefined;
                nameGiven?: string | undefined;
                nameFather?: string | undefined;
                nameGrandfather?: string | undefined;
                nameFamily?: string | undefined;
                birthYear?: number | undefined;
                addressOrigin?: {
                    province: "Badakhshan" | "Badghis" | "Baghlan" | "Balkh" | "Bamyan" | "Daykundi" | "Farah" | "Faryab" | "Ghazni" | "Ghor" | "Helmand" | "Herat" | "Jawzjan" | "Kabul" | "Kandahar" | "Kapisa" | "Khost" | "Kunar" | "Kunduz" | "Laghman" | "Logar" | "Nangarhar" | "Nimroz" | "Nuristan" | "Paktia" | "Paktika" | "Panjshir" | "Parwan" | "Samangan" | "Sar-e-Pol" | "Takhar" | "Urozgan" | "Wardak" | "Zabul";
                    district: string;
                    village?: string | undefined;
                } | undefined;
                addressCurrent?: {
                    province: "Badakhshan" | "Badghis" | "Baghlan" | "Balkh" | "Bamyan" | "Daykundi" | "Farah" | "Faryab" | "Ghazni" | "Ghor" | "Helmand" | "Herat" | "Jawzjan" | "Kabul" | "Kandahar" | "Kapisa" | "Khost" | "Kunar" | "Kunduz" | "Laghman" | "Logar" | "Nangarhar" | "Nimroz" | "Nuristan" | "Paktia" | "Paktika" | "Panjshir" | "Parwan" | "Samangan" | "Sar-e-Pol" | "Takhar" | "Urozgan" | "Wardak" | "Zabul";
                    district: string;
                    village?: string | undefined;
                } | undefined;
                isNomadic?: boolean | undefined;
                biometricFingerprintHash?: string | undefined;
                biometricAlgorithmVersion?: string | undefined;
                identifiers?: {
                    system: "AFGHAN_ETAZKIRA" | "AFGHAN_TAZKIRA_PAPER" | "PASSPORT" | "HEALTH_PASSPORT_QR";
                    valueHash: string;
                    displayType: string;
                    jild?: string | undefined;
                    safa?: string | undefined;
                    shumara?: string | undefined;
                }[] | undefined;
                displacementCategory?: "IDP" | "RETURNEE" | "REFUGEE" | "HOST_COMMUNITY" | undefined;
                nationality?: string | undefined;
                occupation?: string | undefined;
                educationLevel?: "NONE" | "PRIMARY" | "SECONDARY" | "TERTIARY" | "UNKNOWN" | undefined;
                disability?: boolean | undefined;
                birthDate?: string | undefined;
                birthYearOnly?: boolean | undefined;
                maritalStatus?: "M" | "S" | "D" | "W" | "UNK" | undefined;
                nationalId?: string | undefined;
                firstName?: string | undefined;
                mpiProceedToken?: string | undefined;
                contacts?: {
                    relationship: "GUARDIAN" | "OTHER" | "SPOUSE" | "PARENT" | "SIBLING" | "CHILD" | "FRIEND";
                    name: string;
                    phone?: string | undefined;
                    gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                }[] | undefined;
                phoneUse?: "home" | "work" | "mobile" | undefined;
            };
            output: {
                id: string;
                resourceType: "Patient";
                meta: {
                    lastUpdated: string;
                };
                mpiWarn: boolean;
                _ultranos: {
                    createdAt: string;
                };
            };
            meta: object;
        }>;
        syncCreate: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                nameLocal: string;
                consent: {
                    version: string;
                    language: "en" | "ar" | "prs" | "ps";
                    method: "WRITTEN" | "VERBAL_WITNESSED";
                    witnessedBy?: string | undefined;
                };
                phone?: string | undefined;
                gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                nameLatin?: string | undefined;
                guardianId?: string | undefined;
                preferredLanguage?: "en" | "ar" | "prs" | "ps" | undefined;
                nameGiven?: string | undefined;
                nameFather?: string | undefined;
                nameGrandfather?: string | undefined;
                nameFamily?: string | undefined;
                birthYear?: number | undefined;
                addressOrigin?: {
                    province: "Badakhshan" | "Badghis" | "Baghlan" | "Balkh" | "Bamyan" | "Daykundi" | "Farah" | "Faryab" | "Ghazni" | "Ghor" | "Helmand" | "Herat" | "Jawzjan" | "Kabul" | "Kandahar" | "Kapisa" | "Khost" | "Kunar" | "Kunduz" | "Laghman" | "Logar" | "Nangarhar" | "Nimroz" | "Nuristan" | "Paktia" | "Paktika" | "Panjshir" | "Parwan" | "Samangan" | "Sar-e-Pol" | "Takhar" | "Urozgan" | "Wardak" | "Zabul";
                    district: string;
                    village?: string | undefined;
                } | undefined;
                addressCurrent?: {
                    province: "Badakhshan" | "Badghis" | "Baghlan" | "Balkh" | "Bamyan" | "Daykundi" | "Farah" | "Faryab" | "Ghazni" | "Ghor" | "Helmand" | "Herat" | "Jawzjan" | "Kabul" | "Kandahar" | "Kapisa" | "Khost" | "Kunar" | "Kunduz" | "Laghman" | "Logar" | "Nangarhar" | "Nimroz" | "Nuristan" | "Paktia" | "Paktika" | "Panjshir" | "Parwan" | "Samangan" | "Sar-e-Pol" | "Takhar" | "Urozgan" | "Wardak" | "Zabul";
                    district: string;
                    village?: string | undefined;
                } | undefined;
                isNomadic?: boolean | undefined;
                biometricFingerprintHash?: string | undefined;
                biometricAlgorithmVersion?: string | undefined;
                identifiers?: {
                    system: "AFGHAN_ETAZKIRA" | "AFGHAN_TAZKIRA_PAPER" | "PASSPORT" | "HEALTH_PASSPORT_QR";
                    valueHash: string;
                    displayType: string;
                    jild?: string | undefined;
                    safa?: string | undefined;
                    shumara?: string | undefined;
                }[] | undefined;
                displacementCategory?: "IDP" | "RETURNEE" | "REFUGEE" | "HOST_COMMUNITY" | undefined;
                nationality?: string | undefined;
                occupation?: string | undefined;
                educationLevel?: "NONE" | "PRIMARY" | "SECONDARY" | "TERTIARY" | "UNKNOWN" | undefined;
                disability?: boolean | undefined;
                birthDate?: string | undefined;
                birthYearOnly?: boolean | undefined;
                maritalStatus?: "M" | "S" | "D" | "W" | "UNK" | undefined;
                nationalId?: string | undefined;
                firstName?: string | undefined;
                mpiProceedToken?: string | undefined;
                contacts?: {
                    relationship: "GUARDIAN" | "OTHER" | "SPOUSE" | "PARENT" | "SIBLING" | "CHILD" | "FRIEND";
                    name: string;
                    phone?: string | undefined;
                    gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                }[] | undefined;
                phoneUse?: "home" | "work" | "mobile" | undefined;
            } & {
                offlineCreatedAt: string;
            };
            output: {
                id: string;
                resourceType: "Patient";
                meta: {
                    lastUpdated: string;
                };
            };
            meta: object;
        }>;
        read: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
            };
            output: {
                id: string;
                resourceType: "Patient";
                name: {
                    given: string[];
                    text: string;
                }[];
                gender: string | null;
                birthDate: string;
                birthYearOnly: boolean;
                maritalStatus: string;
                contact: {
                    relationship: "GUARDIAN" | "OTHER" | "SPOUSE" | "PARENT" | "SIBLING" | "CHILD" | "FRIEND";
                    name: string;
                    phone?: string | undefined;
                    gender?: import("@ultranos/shared-types").AdministrativeGender | undefined;
                }[] | undefined;
                telecom: {
                    system: "phone";
                    value: string;
                    use: "home" | "work" | "mobile";
                }[];
                _ultranos: {
                    nameLocal: string;
                    nameLatin: string;
                    namePhonetic: string;
                    nationalIdHash: string;
                    guardianId: string;
                    consentVersion: string;
                    patient_tier: "FREE" | "PREMIUM";
                    preferredLanguage: string;
                    isActive: boolean;
                    createdBy: string;
                    createdAt: string;
                    nameGiven: string;
                    nameFather: string;
                    nameGrandfather: string;
                    nameFamily: string;
                    birthYear: number;
                    addressOrigin: {
                        province: string;
                        district: string;
                        village: string | undefined;
                    } | undefined;
                    addressCurrent: {
                        province: string;
                        district: string;
                        village: string | undefined;
                    } | undefined;
                    isNomadic: boolean;
                    biometricFingerprintHash: string;
                    biometricAlgorithmVersion: string;
                    mpiScore: number;
                    photoUrl: string;
                    bloodGroup: string;
                    displacementCategory: string;
                    nationality: string;
                    occupation: string;
                    educationLevel: string;
                    disability: boolean;
                    updatedByName: string | undefined;
                    updatedByRole: string | undefined;
                };
                meta: {
                    lastUpdated: string;
                    versionId: string;
                };
            };
            meta: object;
        }>;
        updateTier: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                tier: "FREE" | "PREMIUM";
                purchaseToken: string;
                platform: "android" | "ios";
            };
            output: {
                success: boolean;
                tier: "FREE" | "PREMIUM";
            };
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                lastKnownUpdate: string;
                gender?: "unknown" | "male" | "female" | "other" | undefined;
                nameGiven?: string | undefined;
                nameFather?: string | undefined;
                nameGrandfather?: string | undefined;
                birthYear?: number | undefined;
                addressDistrictOrigin?: string | undefined;
                addressProvinceOrigin?: string | undefined;
                nationalId?: string | undefined;
                nameLocal?: string | undefined;
                nameLatin?: string | undefined;
                namePhonetic?: string | undefined;
                birthDate?: string | undefined;
                birthYearOnly?: boolean | undefined;
                telecomPhone?: string | undefined;
                guardianId?: string | null | undefined;
                consentVersion?: string | undefined;
                nameFamily?: string | undefined;
                addressVillageOrigin?: string | undefined;
                addressProvinceCurrent?: string | undefined;
                addressDistrictCurrent?: string | undefined;
                addressVillageCurrent?: string | undefined;
                isNomadic?: boolean | undefined;
                preferredLanguage?: "en" | "ar" | "prs" | "ps" | undefined;
                photoUrl?: string | undefined;
                bloodGroup?: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-" | "Unknown" | undefined;
            };
            output: {
                id: string;
                resourceType: "Patient";
                meta: {
                    lastUpdated: string;
                };
            };
            meta: object;
        }>;
        unresolvedConflictCount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                count: number;
            };
            meta: object;
        }>;
        updateBiometric: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                biometricFingerprintHash: string;
                biometricAlgorithmVersion: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        auditTrail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
                limit?: number | undefined;
                cursor?: string | undefined;
            };
            output: {
                entries: {
                    id: string;
                    action: string;
                    actorName: string | undefined;
                    actorRole: string;
                    fieldsUpdated: string[];
                    operation: string;
                    timestamp: string;
                }[];
                nextCursor: string | null;
                hasMore: boolean;
            };
            meta: object;
        }>;
    }>>;
    encounter: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                status: "planned" | "cancelled" | "in-progress" | "finished";
                patientId: string;
                classCode: string;
                periodStart: string;
                participantPractitionerId: string;
                hlcTimestamp: string;
                reasonCode?: string | undefined;
            };
            output: {
                success: boolean;
                encounterId: any;
                resumed: boolean;
                alreadySynced: boolean;
            } | {
                success: boolean;
                encounterId: any;
                alreadySynced: boolean;
                resumed?: undefined;
            };
            meta: object;
        }>;
        read: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
                patientId: string;
            };
            output: any;
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                patientId: string;
                hlcTimestamp: string;
                status?: "planned" | "cancelled" | "in-progress" | "finished" | undefined;
                classCode?: string | undefined;
                reasonCode?: string | undefined;
            };
            output: {
                success: boolean;
                encounterId: any;
            };
            meta: object;
        }>;
        close: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                patientId: string;
                hlcTimestamp: string;
            };
            output: {
                success: boolean;
                encounterId: any;
            };
            meta: object;
        }>;
        addSOAPNote: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                hlcTimestamp: string;
                encounterId: string;
                subjective?: string | undefined;
                objective?: string | undefined;
                assessment?: string | undefined;
                plan?: string | undefined;
            };
            output: {
                success: boolean;
                soapNoteId: any;
            };
            meta: object;
        }>;
        listSOAPNotes: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                encounterId: string;
            };
            output: {
                notes: {
                    id: unknown;
                    encounterId: unknown;
                    practitionerId: unknown;
                    subjective: unknown;
                    objective: unknown;
                    assessment: unknown;
                    plan: unknown;
                    hlcTimestamp: unknown;
                    createdAt: unknown;
                    source: {};
                    aiModelVersion: {} | null;
                    confirmedBy: {} | null;
                    confirmedAt: {} | null;
                }[];
            };
            meta: object;
        }>;
        listByPatient: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
            };
            output: {
                encounters: any[];
            };
            meta: object;
        }>;
        listByPractitioner: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
            };
            output: {
                encounters: any[];
                nextCursor: string | null;
            };
            meta: object;
        }>;
        parseSOAPWithAI: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                encounterId: string;
                freeformText: string;
            };
            output: import("@ultranos/shared-types").SOAPParseResult | {
                error: "AI_UNAVAILABLE";
                reason: string;
            } | {
                error: "CONSENT_NOT_GRANTED";
                message: string;
            };
            meta: object;
        }>;
        commitAISOAPNote: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                hlcTimestamp: string;
                encounterId: string;
                originalFreeformText: string;
                aiSubjective: string;
                aiObjective: string;
                aiAssessment: string;
                aiPlan: string;
                confirmedSubjective: string;
                confirmedObjective: string;
                confirmedAssessment: string;
                confirmedPlan: string;
                aiModelVersion: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    medication: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                hlcTimestamp: string;
                medicationDisplay: string;
                medicationCode: string;
                interactionCheck: "BLOCKED" | "WARNING" | "CLEAR" | "UNAVAILABLE";
                encounterId?: string | undefined;
                prescriptionId?: string | undefined;
                isOfflineCreated?: boolean | undefined;
                medicationText?: string | undefined;
                dosageInstruction?: Record<string, unknown> | undefined;
                dispenseRequest?: Record<string, unknown> | undefined;
                interactionOverride?: string | undefined;
                intent?: "plan" | "proposal" | "order" | undefined;
            };
            output: {
                prescriptionId: string;
                qrCodeId: any;
                status: "active";
                alreadySynced: boolean;
            } | {
                prescriptionId: string;
                qrCodeId: `${string}-${string}-${string}-${string}-${string}`;
                status: "active";
                alreadySynced?: undefined;
            };
            meta: object;
        }>;
        read: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
                prescriptionId: string;
            };
            output: {
                id: any;
                status: any;
                prescription_status: any;
                intent: any;
                medication_codeable_concept: any;
                medication_display: any;
                medication_text: any;
                subject_reference: any;
                encounter_reference: any;
                requester_id: any;
                dosage_instruction: any;
                dispense_request: any;
                interaction_check: any;
                interaction_override: any;
                qr_code_id: any;
                authored_on: any;
                is_offline_created: any;
                hlc_timestamp: any;
                meta_last_updated: any;
                meta_version_id: any;
            };
            meta: object;
        }>;
        listForPharmacy: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientRef: string;
            };
            output: {
                prescriptions: {
                    id: string;
                    prescriptionStatus: string;
                    medicationDisplay: string;
                    medicationText: string;
                    dosageInstruction: {} | null;
                    authoredOn: string;
                    requesterId: string;
                }[];
            };
            meta: object;
        }>;
        getStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                prescriptionId?: string | undefined;
                qrCodeId?: string | undefined;
                targetPrescriptionId?: string | undefined;
                signedBundle?: {
                    payload: string;
                    sig: string;
                    pub: string;
                } | undefined;
            };
            output: {
                prescriptionId: any;
                status: "AVAILABLE" | "FULFILLED" | "VOIDED";
                medicationDisplay: any;
                authoredOn: any;
                dispensedAt: any;
            };
            meta: object;
        }>;
        recordDispense: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                status: "in-progress" | "completed";
                patientRef: string;
                hlcTimestamp: string;
                prescriptionId: string;
                medicationDisplay: string;
                medicationCode: string;
                dispenseId: string;
                pharmacistRef: string;
                whenHandedOver: string;
                batchLot?: string | undefined;
                overrideReason?: string | undefined;
            };
            output: {
                success: boolean;
                dispenseId: string;
                prescriptionStatus: string;
                dispensedAt: null;
                conflictDetected: boolean;
                alreadySynced: boolean;
            } | {
                success: boolean;
                dispenseId: any;
                prescriptionStatus: string;
                dispensedAt: any;
                conflictDetected: boolean;
                alreadySynced?: undefined;
            };
            meta: object;
        }>;
        complete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                prescriptionId: string;
            };
            output: {
                success: boolean;
                prescriptionId: any;
                previousStatus: "AVAILABLE" | "FULFILLED" | "VOIDED";
                newStatus: "FULFILLED";
                dispensedAt: any;
            };
            meta: object;
        }>;
        voidPrescription: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reason: string;
                hlcTimestamp: string;
                prescriptionId: string;
            };
            output: {
                success: boolean;
                prescriptionId: any;
                newStatus: "VOIDED";
            };
            meta: object;
        }>;
        getPaperRxUploadUrl: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                contentType: "image/jpeg" | "image/png";
            };
            output: {
                uploadUrl: string;
                storageKey: string;
                expiresAt: string;
            };
            meta: object;
        }>;
        createPaperPrescription: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                medicationName: string;
                dosage: string;
                frequency: string;
                prescriberName: string;
                prescriptionDate: string;
                ocrConfidenceScores: Record<string, number>;
                imageStorageKey: string;
                patientId?: string | undefined;
            };
            output: {
                success: boolean;
                prescriptionId: `${string}-${string}-${string}-${string}-${string}`;
                status: "LEGACY_PAPER";
            };
            meta: object;
        }>;
        invalidate: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                prescriptionId: string;
            };
            output: {
                success: boolean;
                prescriptionId: any;
                newStatus: "VOIDED";
            };
            meta: object;
        }>;
        checkInteractions: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
                medicationDisplay: string;
                medicationCode: string;
            };
            output: import("@ultranos/drug-db").InteractionCheckSummary;
            meta: object;
        }>;
        generatePrescriptionAudio: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                medicationRequestId: string;
                dialect: "AR_LEVANTINE" | "AR_GULF" | "DARI" | "EN";
            };
            output: {
                audioUrl: string;
                expiresAt: string;
                duration: null;
                dialect: "AR_LEVANTINE" | "AR_GULF" | "DARI" | "EN";
            };
            meta: object;
        }>;
        logTTSPlayback: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                source: "CLOUD_TTS" | "OFFLINE_FRAGMENT";
                medicationRequestId: string;
                dialect: "AR_LEVANTINE" | "AR_GULF" | "DARI" | "EN";
                completedAt: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    medicationStatement: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listActive: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientRef: string;
            };
            output: {
                statements: any[];
                count: number;
            };
            meta: object;
        }>;
        listActiveForPharmacist: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientRef: string;
            };
            output: {
                statements: any[];
                count: number;
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                hlcTimestamp: string;
                medicationCodeableConcept: {
                    text?: string | undefined;
                    coding?: {
                        code: string;
                        system: string;
                        display?: string | undefined;
                    }[] | undefined;
                };
                medicationDisplay: string;
                subjectReference: string;
                dateAsserted: string;
                effectivePeriodStart?: string | undefined;
                informationSourceReference?: string | undefined;
                sourceEncounterId?: string | undefined;
                sourcePrescriptionId?: string | undefined;
            };
            output: {
                id: any;
                action: "updated";
            } | {
                id: any;
                action: "created";
            };
            meta: object;
        }>;
        updateStatus: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                hlcTimestamp: string;
                newStatus: "stopped" | "completed";
            };
            output: {
                id: any;
                newStatus: "stopped" | "completed";
            };
            meta: object;
        }>;
    }>>;
    consent: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        sync: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                status: "ACTIVE" | "EXPIRED" | "WITHDRAWN" | "SUPERSEDED";
                category: string[];
                patientRef: string;
                consentVersion: string;
                hlcTimestamp: string;
                purpose: "AI_PROCESSING" | "TREATMENT" | "ANALYTICS" | "RESEARCH" | "THIRD_PARTY_SHARE";
                dateTime: string;
                provisionStart: string;
                grantorId: string;
                grantorRole: "GUARDIAN" | "SELF" | "EMERGENCY_OVERRIDE";
                auditHash: string;
                provisionEnd?: string | undefined;
                withdrawnAt?: string | undefined;
                withdrawalReason?: string | undefined;
            };
            output: {
                success: boolean;
                consentId: any;
                alreadySynced: boolean;
            };
            meta: object;
        }>;
        expiringCount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                count: number;
            };
            meta: object;
        }>;
        expiringSoon: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                offset?: number | undefined;
            };
            output: {
                consents: {
                    id: any;
                    patient_ref: any;
                    provision_end: any;
                    consent_version: any;
                    grantor_role: any;
                }[];
            };
            meta: object;
        }>;
        renew: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                version: string;
                patientId: string;
                method: "WRITTEN" | "VERBAL_WITNESSED";
                language: "en" | "ar" | "prs";
                witnessedBy?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        check: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
                resourceType: string;
            };
            output: {
                permitted: boolean;
            };
            meta: object;
        }>;
    }>>;
    lab: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        searchDirectory: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                q: string;
                limit?: number | undefined;
            };
            output: import("@ultranos/shared-types").LabDirectoryEntry[];
            meta: object;
        }>;
        syncDirectory: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                since?: string | undefined;
            };
            output: {
                labs: import("@ultranos/shared-types").LabDirectoryEntry[];
                latestUpdatedAt: string | null;
            };
            meta: object;
        }>;
        register: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labName: string;
                licenseRef: string;
                technicianCredentialRef: string;
                accreditationRef?: string | undefined;
            };
            output: {
                success: boolean;
                labId: any;
                status: string;
            };
            meta: object;
        }>;
        reportAuthEvent: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                event: "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "MFA_VERIFY_SUCCESS" | "MFA_VERIFY_FAILURE";
                actorId?: string | undefined;
                actorEmail?: string | undefined;
            };
            output: {
                logged: boolean;
            };
            meta: object;
        }>;
        verifyPatient: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                query: string;
                method: "NATIONAL_ID" | "QR_SCAN";
            };
            output: {
                patientRef: string;
                photoUrl: string | null;
                firstName: string;
                age: number;
            };
            meta: object;
        }>;
        getOrderPatientDetails: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                orderId: string;
            };
            output: {
                photoUrl: string | null;
                bloodGroup: string | null;
                fullName: {
                    given: string | null;
                    father: string | null;
                    grandfather: string | null;
                };
                vitals: {
                    weightKg: number | null;
                    heightCm: number | null;
                    bmi: number | null;
                    temperatureC: number | null;
                    bpSystolic: number | null;
                    bpDiastolic: number | null;
                    recordedAt: string | null;
                };
            };
            meta: object;
        }>;
        uploadResult: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientRef: string;
                loincCode: string;
                collectionDate: string;
                fileBase64: string;
                fileName: string;
                fileType: "image/jpeg" | "image/png" | "application/pdf" | "image/webp";
                loincDisplay: string;
                orderId?: string | undefined;
                diagnosticReportId?: string | undefined;
                ocrMetadataVerified?: boolean | undefined;
                ocrSuggestions?: {
                    value: string;
                    field: string;
                    confidence: number;
                }[] | undefined;
            };
            output: {
                success: boolean;
                reportId: string;
                status: string;
                virusScanStatus: string;
            };
            meta: object;
        }>;
        submitResult: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                diagnosticReport: {
                    id: string;
                    status: "preliminary" | "registered";
                    code: {
                        text?: string | undefined;
                        coding?: {
                            code: string;
                            system?: string | undefined;
                            display?: string | undefined;
                        }[] | undefined;
                    };
                    meta: {
                        lastUpdated: string;
                        versionId: string;
                    };
                    _ultranos: {} & {
                        [k: string]: unknown;
                    };
                    subject: {
                        reference: string;
                    };
                    resourceType: "DiagnosticReport";
                    issued: string;
                    result?: {
                        reference: string;
                    }[] | undefined;
                    conclusion?: string | undefined;
                };
                observations: {
                    id: string;
                    status: "preliminary" | "registered";
                    code: {
                        text?: string | undefined;
                        coding?: {
                            code: string;
                            system?: string | undefined;
                            display?: string | undefined;
                        }[] | undefined;
                    };
                    meta: {
                        lastUpdated: string;
                        versionId: string;
                    };
                    _ultranos: {
                        createdAt?: string | undefined;
                        hlcTimestamp?: string | undefined;
                        isOfflineCreated?: boolean | undefined;
                        templateVersion?: string | undefined;
                        referenceRange?: {
                            text?: string | undefined;
                            low?: number | undefined;
                            high?: number | undefined;
                        } | undefined;
                        effectiveDateTime?: string | undefined;
                    } & {
                        [k: string]: unknown;
                    };
                    resourceType: "Observation";
                    subject?: {
                        reference: string;
                    } | undefined;
                    valueQuantity?: {
                        value: number;
                        code?: string | undefined;
                        system?: string | undefined;
                        unit?: string | undefined;
                    } | undefined;
                    valueString?: string | undefined;
                    interpretation?: {
                        coding?: {
                            code: string;
                            system: string;
                            display: string;
                        }[] | undefined;
                    }[] | undefined;
                    note?: {
                        text: string;
                    }[] | undefined;
                }[];
                orderId?: string | undefined;
            };
            output: {
                diagnosticReportId: string;
                observationCount: number;
            };
            meta: object;
        }>;
        submitSpecimen: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                hlcTimestamp: string;
                subjectReference: string;
                labSampleId: string;
                pipelineStatus: "received" | "completed" | "in-processing" | "reported" | "rejected";
                fhirStatus: string;
                note?: string | undefined;
                specimenType?: string | undefined;
                serviceRequestRef?: string | undefined;
                receivedFrom?: string | undefined;
                receivedTime?: string | undefined;
                condition?: string | undefined;
                rejectionReason?: string | undefined;
            };
            output: {
                specimenId: string;
                pipelineStatus: "received" | "completed" | "in-processing" | "reported" | "rejected";
            };
            meta: object;
        }>;
        pullSpecimens: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                specimens: {
                    id: string;
                    hlcTimestamp: string;
                    subjectReference: string;
                    labSampleId: string;
                    pipelineStatus: string;
                    fhirStatus: string;
                    specimenType?: string | undefined;
                    serviceRequestRef?: string | undefined;
                    receivedFrom?: string | undefined;
                    receivedTime?: string | undefined;
                    condition?: string | undefined;
                }[];
            };
            meta: object;
        }>;
        uploadSpecimenFile: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientRef: string;
                fileBase64: string;
                fileName: string;
                fileType: "image/jpeg" | "image/png" | "application/pdf" | "image/webp";
                specimenId: string;
                attachmentContext: "receipt" | "rejection";
            };
            output: {
                fileId: any;
            };
            meta: object;
        }>;
        analyzeUpload: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                fileBase64: string;
                fileType: "image/jpeg" | "image/png" | "application/pdf";
            };
            output: {
                suggestions: import("../../services/ocr").OcrSuggestion[];
                processingTimeMs: number;
                available: boolean;
                provider: string;
            };
            meta: object;
        }>;
        getMyRole: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                labRole: import("@ultranos/shared-types").LabRole | null;
            };
            meta: object;
        }>;
        listStaff: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                practitionerId: string;
                email: string;
                labRole: import("@ultranos/shared-types").LabRole;
                createdAt: string;
            }[];
            meta: object;
        }>;
        updateStaffRole: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                targetPractitionerId: string;
                newRole: import("@ultranos/shared-types").LabRole;
            };
            output: {
                success: boolean;
                previousRole: string;
                newRole: string;
            };
            meta: object;
        }>;
        pullOrders: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
                since?: string | undefined;
            };
            output: {
                nextCursor: string | null;
                orders: {
                    status: string;
                    patientRef: string;
                    orderId: string;
                    authoredOn: string | null;
                    patientFirstName: string;
                    patientAge: number | null;
                    patientPhotoUrl: string | null;
                    testsRequested: {
                        loincCode: string;
                        loincDisplay: string;
                    }[];
                    urgency: string;
                    orderingPhysicianName: string;
                    specialInstructions: string | null;
                    assignedToLab: boolean;
                }[];
                syncTimestamp: string | null;
            };
            meta: object;
        }>;
        pullDispenseMonitoringEvents: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: number | undefined;
                since?: string | undefined;
            };
            output: {
                nextCursor: number | null;
                events: {
                    patientRef: string;
                    hlcTimestamp: string;
                    medicationDisplay: string;
                    dispensedAt: string;
                    atcCode: string;
                    patientFirstName: string;
                    patientAge: number | null;
                    dispensingEventId: string;
                    orderingPractitionerRef: string;
                }[];
            };
            meta: object;
        }>;
        pullMonitoringMappings: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                sinceVersion?: number | undefined;
            };
            output: {
                mappings: {
                    version: number;
                    medicationDisplay: string;
                    atcCode: string;
                    requiredTests: {
                        loincCode: string;
                        testDisplay: string;
                        frequencyDays: number;
                        initialDelayDays: number;
                        priority: "routine" | "urgent";
                    }[];
                }[];
            };
            meta: object;
        }>;
        acknowledgeOrder: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                status: "RECEIVED";
                orderId: string;
            };
            output: {
                success: boolean;
                receivedAt: string;
            };
            meta: object;
        }>;
        getMyMentorship: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                role: "MENTOR" | "MENTEE";
                partnerName: any;
                labName: any;
                goals: any;
                startDate: any;
                checkins: {
                    month: string;
                    status: string;
                }[];
            } | null;
            meta: object;
        }>;
        getMyCertifications: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                pathways: {
                    completionPct: number;
                    pathwayId: string;
                    pathwayName: string;
                    milestones: Array<{
                        milestoneIndex: number;
                        title: string;
                        type: string;
                        requiredCount: number;
                        status: string;
                        submittedAt: string | null;
                        approvedAt: string | null;
                    }>;
                }[];
            };
            meta: object;
        }>;
        getEmergencyVaccinationStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId: string;
            };
            output: {
                hepBStatus: string;
                tetanusStatus: string;
                covidStatus: string;
            } | null;
            meta: object;
        }>;
    }>>;
    notification: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                notifications: {
                    id: string;
                    type: string;
                    payload: any;
                    status: string;
                    createdAt: string;
                    deliveredAt: string | null;
                    acknowledgedAt: string | null;
                    sourceApp: string | null;
                    subjectKey: string | null;
                    bodyKey: string | null;
                    bodyParams: object;
                    notesKey: string | null;
                }[];
            };
            meta: object;
        }>;
        acknowledge: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                notificationId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        acknowledgeAll: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        delete: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                notificationId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        markUnread: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                notificationId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        unreadCount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                count: number;
            };
            meta: object;
        }>;
    }>>;
    practitionerKey: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getKeyStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                publicKey: string;
            };
            output: {
                status: "active" | "revoked" | "expired";
                practitionerId: any;
                practitionerName: any;
                publicKey: any;
                revokedAt: any;
                expiresAt: any;
            };
            meta: object;
        }>;
        getRevocationList: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
            } | undefined;
            output: {
                revokedKeys: {
                    publicKey: any;
                    revokedAt: any;
                }[];
                nextCursor: any;
            };
            meta: object;
        }>;
        register: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                publicKey: string;
                practitionerName: string;
                expiresAt?: string | undefined;
            };
            output: {
                registered: boolean;
                expiresAt: string;
            };
            meta: object;
        }>;
        revokeKey: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reason: string;
                publicKey: string;
            };
            output: {
                revoked: boolean;
            };
            meta: object;
        }>;
    }>>;
    audit: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        sync: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                events: {
                    id: string;
                    action: string;
                    actorRole: string;
                    resourceType: string;
                    actorId: string;
                    resourceId: string;
                    hlcTimestamp: string;
                    queuedAt: string;
                    patientId?: string | undefined;
                    metadata?: Record<string, unknown> | undefined;
                }[];
            };
            output: {
                results: {
                    id: string;
                    success: boolean;
                }[];
            };
            meta: object;
        }>;
    }>>;
    sync: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        push: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                operations: {
                    payload: string;
                    action: "create" | "update" | "delete";
                    resourceType: string;
                    resourceId: string;
                    hlcTimestamp: string;
                }[];
            };
            output: {
                results: {
                    resourceId: string;
                    success: boolean;
                    conflict?: {
                        remoteVersion: {
                            id: string;
                            data: Record<string, unknown>;
                            hlcTimestamp: {
                                wallMs: number;
                                counter: number;
                                nodeId: string;
                            };
                            version: string;
                        };
                    };
                    error?: string;
                    canonicalId?: string;
                }[];
            };
            meta: object;
        }>;
        pull: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                sinceHlc: string;
                patientId?: string | undefined;
                resourceTypes?: string[] | undefined;
            };
            output: {
                changes: {
                    resourceType: string;
                    resourceId: string;
                    data: Record<string, unknown>;
                    hlcTimestamp: string;
                }[];
            };
            meta: object;
        }>;
    }>>;
    vocabulary: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        sync: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                type: "interactions" | "medications" | "icd10";
                sinceVersion: number;
            };
            output: {
                entries: any[];
                latestVersion: number;
            };
            meta: object;
        }>;
    }>>;
    allergy: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
                includeAll?: boolean | undefined;
            };
            output: {
                allergies: any[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                type: "allergy" | "intolerance";
                patientRef: string;
                hlcTimestamp: string;
                substanceText: string;
                clinicalStatusCode: "active" | "inactive" | "resolved";
                verificationStatusCode: "confirmed" | "unconfirmed";
                criticality: "low" | "high" | "unable-to-assess";
                recordedDate: string;
                substanceFreeText?: string | undefined;
                substanceCode?: string | undefined;
                substanceSystem?: string | undefined;
                recorderRef?: string | undefined;
            };
            output: {
                success: boolean;
                allergyId: any;
                alreadySynced: boolean;
            };
            meta: object;
        }>;
    }>>;
    diagnosticReport: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        read: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
                patientRef: string;
            };
            output: {
                id: string;
                resourceType: "DiagnosticReport";
                status: string;
                loincCode: string | null;
                loincDisplay: string | null;
                patientRef: string;
                performerId: string | null;
                labId: string | null;
                issued: string | null;
                collectionDate: string | null;
                reportConclusion: string | null;
                virusScanStatus: string;
                createdAt: string | null;
                updatedAt: string | null;
                files: {
                    id: any;
                    fileName: any;
                    fileType: any;
                    fileSize: any;
                    downloadUrl: string;
                }[];
                observations: {
                    id: string;
                    observationId: string;
                    loincCode: string;
                    loincDisplay: string | null;
                    valueQuantity: {
                        value: number;
                        unit?: string;
                    } | null;
                    valueString: string | null;
                    interpretation: unknown[] | null;
                    referenceRange: {
                        low?: number;
                        high?: number;
                        text?: string;
                    } | null;
                    note: Array<{
                        text: string;
                    }> | null;
                    effectiveDateTime: string | null;
                }[];
            };
            meta: object;
        }>;
        listByPatient: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientRef: string;
                limit?: number | undefined;
                cursor?: string | undefined;
            };
            output: {
                reports: {
                    id: string;
                    resourceType: "DiagnosticReport";
                    status: string;
                    loincCode: string | null;
                    loincDisplay: string | null;
                    patientRef: string;
                    performerId: string | null;
                    labId: string | null;
                    issued: string | null;
                    collectionDate: string | null;
                    virusScanStatus: string;
                    createdAt: string | null;
                }[];
                nextCursor: string | undefined;
            };
            meta: object;
        }>;
        listByLab: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
            };
            output: {
                reports: {
                    id: string;
                    resourceType: "DiagnosticReport";
                    status: string;
                    loincCode: string | null;
                    loincDisplay: string | null;
                    patientRef: string;
                    performerId: string | null;
                    labId: string | null;
                    issued: string | null;
                    collectionDate: string | null;
                    virusScanStatus: string;
                    createdAt: string | null;
                }[];
                nextCursor: string | undefined;
            };
            meta: object;
        }>;
    }>>;
    patientKey: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        register: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                publicKeyP256: string;
            };
            output: {
                registered: boolean;
                expiresAt: string;
            };
            meta: object;
        }>;
    }>>;
    subscription: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listModules: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                modules: {
                    id: string;
                    code: string;
                    displayName: string;
                    description: string | null;
                    basePriceUsd: number;
                    isActive: boolean;
                }[];
            };
            meta: object;
        }>;
        listOrgSubscriptions: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                orgId?: string | undefined;
            };
            output: {
                subscriptions: {
                    id: string;
                    orgId: string;
                    moduleCode: string;
                    moduleName: any;
                    status: string;
                    startedAt: string;
                    expiresAt: string | null;
                    cancelledAt: string | null;
                }[];
            };
            meta: object;
        }>;
        getOrgSubscription: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                orgId: string;
                moduleCode: "OPD_LITE" | "LAB_LITE" | "PHARMACY_LITE";
            };
            output: {
                subscription: null;
            } | {
                subscription: {
                    id: string;
                    orgId: string;
                    moduleCode: string;
                    status: string;
                    startedAt: string;
                    expiresAt: string | null;
                    cancelledAt: string | null;
                };
            };
            meta: object;
        }>;
        getOrgSubscriptions: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                organization: {
                    id: string;
                    name: string;
                    status: string;
                    trialEndsAt: string | null;
                    billingEmail: string;
                    paymentFailureReason: string | null;
                    gracePeriodEndsAt: string | null;
                };
                subscriptions: {
                    id: string;
                    orgId: string;
                    moduleCode: string;
                    moduleName: any;
                    status: string;
                    startedAt: string;
                    expiresAt: string | null;
                    cancelledAt: string | null;
                    monthlyCostUsd: number;
                }[];
                totalMonthlyCostUsd: number;
            };
            meta: object;
        }>;
        getAvailableModules: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                modules: {
                    id: string;
                    code: string;
                    displayName: string;
                    description: string | null;
                    basePriceUsd: number;
                }[];
            };
            meta: object;
        }>;
        addModule: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                moduleCode: string;
            };
            output: {
                subscription: {
                    id: string;
                    orgId: string;
                    moduleCode: string;
                    status: string;
                    startedAt: string;
                    expiresAt: string | null;
                    cancelledAt: string | null;
                };
            };
            meta: object;
        }>;
        removeModule: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                subscriptionId: string;
            };
            output: {
                subscription: {
                    id: string;
                    orgId: string;
                    moduleCode: string;
                    status: string;
                    startedAt: string;
                    expiresAt: string | null;
                    cancelledAt: string | null;
                };
            };
            meta: object;
        }>;
        getAvailableRoles: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                availableRoles: {
                    role: string;
                    moduleCode: string | null;
                    moduleName: string | null;
                }[];
                unavailableRoles: {
                    role: string;
                    moduleCode: string;
                    moduleName: string;
                    reason: "NOT_SUBSCRIBED";
                }[];
            };
            meta: object;
        }>;
        validateRoleForOrg: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                role: string;
            };
            output: {
                allowed: boolean;
                reason: string;
            } | {
                allowed: boolean;
                reason?: undefined;
            };
            meta: object;
        }>;
        getPaymentMethod: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                paymentMethod: null;
            } | {
                paymentMethod: {
                    brand: string;
                    last4: string;
                    expMonth: number;
                    expYear: number;
                };
            };
            meta: object;
        }>;
        createPaymentSetup: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: {
                setup: any;
                customerId: string;
            };
            meta: object;
        }>;
        removePaymentMethod: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listInvoices: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "ALL" | "PAID" | "OPEN" | "VOID" | "UNCOLLECTIBLE" | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                invoices: {
                    invoiceId: string;
                    amount: number;
                    currency: string;
                    status: string;
                    pdfUrl: string | null;
                    createdAt: string;
                }[];
                totalCount: number;
            };
            meta: object;
        }>;
        exportSubscriptions: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
    }>>;
    entitlement: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        check: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                moduleCode: "OPD_LITE" | "LAB_LITE" | "PHARMACY_LITE";
            };
            output: {
                status: "inactive";
            } | {
                status: "active" | "trial";
            };
            meta: object;
        }>;
    }>>;
    registration: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        registerOrganization: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                orgName: string;
                countryCode: string;
                billingEmail: string;
                adminName: string;
                adminEmail: string;
                adminPassword: string;
            };
            output: {
                success: boolean;
                orgId: any;
                slug: string;
                trialEndsAt: string;
            };
            meta: object;
        }>;
        selectInitialModules: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                orgId: string;
                moduleCodes: string[];
            };
            output: {
                success: boolean;
                subscriptions: {
                    moduleCode: string;
                    status: string;
                    expiresAt: any;
                }[];
            };
            meta: object;
        }>;
        getKycUploadUrl: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                contentType: "image/jpeg" | "image/png" | "application/pdf";
                documentType: "NATIONAL_ID" | "MEDICAL_LICENSE";
            };
            output: {
                uploadUrl: string;
                storageKey: string;
                expiresAt: string;
            };
            meta: object;
        }>;
        submitKyc: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                documents: {
                    type: "NATIONAL_ID" | "MEDICAL_LICENSE";
                    storageKey: string;
                    ocrResults: {
                        fields: {
                            value: string;
                            name: string;
                            confidence: number;
                        }[];
                    };
                }[];
                registryNumber: string;
            };
            output: {
                success: boolean;
                submissionId: any;
                submittedAt: any;
                message: string;
            };
            meta: object;
        }>;
        getKycStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId: string;
            };
            output: {
                kycStatus: string;
                latestSubmission: {
                    id: any;
                    status: any;
                    registry_number: any;
                    rejection_reason: any;
                    admin_message: any;
                    submitted_at: any;
                } | null;
            };
            meta: object;
        }>;
    }>>;
    billing: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        handleWebhook: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                payload: string;
                signature: string;
            };
            output: {
                received: boolean;
            };
            meta: object;
        }>;
        confirmPurge: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                purgeJobId: string;
            };
            output: {
                confirmed: boolean;
                purgeJobId: string;
            };
            meta: object;
        }>;
        cancelPurge: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                purgeJobId: string;
            };
            output: {
                cancelled: boolean;
                purgeJobId: string;
            };
            meta: object;
        }>;
        getInvoices: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                customerId: string;
            };
            output: {
                invoices: {
                    invoiceId: string;
                    amount: number;
                    currency: string;
                    status: string;
                    pdfUrl: string | undefined;
                    createdAt: string;
                }[];
            };
            meta: object;
        }>;
    }>>;
    admin: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        dashboardStats: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                pendingKycReviews: number;
                pendingLabApprovals: number;
                activeAlerts: number;
                recentAuditEvents: number;
                slaBreachedKycCount: number;
                oldestPendingLabDays: number | null;
                highSeverityAlertCount: number;
                auditChainHealthy: boolean | null;
                userCounts: {
                    total: number;
                    active: number;
                    suspended: number;
                    pendingInvite: number;
                    withoutMfa: number;
                };
            };
            meta: object;
        }>;
        health: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                status: string;
                timestamp: string;
            };
            meta: object;
        }>;
        reportAuthEvent: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                event: "ADMIN_LOGIN_SUCCESS" | "ADMIN_LOGIN_FAILURE";
                actorId?: string | undefined;
                actorEmail?: string | undefined;
            };
            output: {
                logged: boolean;
            };
            meta: object;
        }>;
        listLabs: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "SUSPENDED" | "PENDING" | "ACTIVE" | "ALL" | "ARCHIVED" | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
                includeArchived?: boolean | undefined;
            };
            output: {
                labs: {
                    id: string;
                    labName: string;
                    licenseReference: string;
                    accreditationReference: string;
                    technicianName: string;
                    technicianId: string | null;
                    registeredAt: string;
                    status: string;
                }[];
                total: number;
                cursor: number;
                limit: number;
            };
            meta: object;
        }>;
        getLabDetail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                labId: string;
            };
            output: {
                id: string;
                labName: string;
                licenseReference: string;
                accreditationReference: string | null;
                status: string;
                registeredAt: string;
                logoUrl: string | null;
                description: string | null;
                phone: string | null;
                altPhone: string | null;
                email: string | null;
                website: string | null;
                whatsapp: string | null;
                address: string | null;
                province: string | null;
                district: string | null;
                city: string | null;
                postalCode: string | null;
                country: string | null;
                contactPersonName: string | null;
                contactPersonRole: string | null;
                contactPersonPhone: string | null;
                openingHours: Record<string, unknown> | null;
                timezone: string | null;
                is247: boolean | null;
                googlePlaceId: string | null;
                googleMapsUrl: string | null;
                googleRating: number | null;
                googleReviewCount: number | null;
                googleHours: Record<string, unknown> | null;
                googleLastSyncedAt: string | null;
                specialties: string[] | null;
                turnaroundTimeHours: number | null;
                homeCollection: boolean | null;
                sampleCollection: boolean | null;
                capAccredited: boolean | null;
                technician: {
                    id: string;
                    name: string;
                    email: string | null;
                    credentialRef: string;
                    qualification: string | null;
                } | null;
                statusHistory: {
                    status: string;
                    changedBy: string;
                    changedByName: string | null;
                    changedAt: string;
                    reason: string;
                }[];
                uploadCount: number;
            };
            meta: object;
        }>;
        createLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labName: string;
                licenseRef: string;
                description?: string | undefined;
                phone?: string | undefined;
                district?: string | undefined;
                province?: string | undefined;
                accreditationRef?: string | undefined;
                email?: string | undefined;
                address?: string | undefined;
                logoUrl?: string | undefined;
                altPhone?: string | undefined;
                website?: string | undefined;
                whatsapp?: string | undefined;
                city?: string | undefined;
                postalCode?: string | undefined;
                country?: string | undefined;
                contactPersonName?: string | undefined;
                contactPersonRole?: string | undefined;
                contactPersonPhone?: string | undefined;
                openingHours?: Record<string, unknown> | undefined;
                timezone?: string | undefined;
                is247?: boolean | undefined;
                googlePlaceId?: string | undefined;
                googleMapsUrl?: string | undefined;
                googleRating?: number | undefined;
                googleReviewCount?: number | undefined;
                googleHours?: Record<string, unknown> | undefined;
                googleLastSyncedAt?: string | undefined;
                specialties?: string[] | undefined;
                turnaroundTimeHours?: number | undefined;
                homeCollection?: boolean | undefined;
                sampleCollection?: boolean | undefined;
                capAccredited?: boolean | undefined;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        reviewLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                action: "APPROVE" | "SUSPEND" | "REACTIVATE";
                labId: string;
                reason?: string | undefined;
            };
            output: {
                success: boolean;
                labId: string;
                previousStatus: string | undefined;
                newStatus: string | undefined;
            };
            meta: object;
        }>;
        updateLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labId: string;
                description?: string | undefined;
                phone?: string | undefined;
                district?: string | undefined;
                province?: string | undefined;
                labName?: string | undefined;
                accreditationRef?: string | undefined;
                email?: string | undefined;
                address?: string | undefined;
                logoUrl?: string | undefined;
                altPhone?: string | undefined;
                website?: string | undefined;
                whatsapp?: string | undefined;
                city?: string | undefined;
                postalCode?: string | undefined;
                country?: string | undefined;
                contactPersonName?: string | undefined;
                contactPersonRole?: string | undefined;
                contactPersonPhone?: string | undefined;
                openingHours?: Record<string, unknown> | undefined;
                timezone?: string | undefined;
                is247?: boolean | undefined;
                googlePlaceId?: string | undefined;
                googleMapsUrl?: string | undefined;
                googleRating?: number | undefined;
                googleReviewCount?: number | undefined;
                googleHours?: Record<string, unknown> | undefined;
                googleLastSyncedAt?: string | undefined;
                specialties?: string[] | undefined;
                turnaroundTimeHours?: number | undefined;
                homeCollection?: boolean | undefined;
                sampleCollection?: boolean | undefined;
                capAccredited?: boolean | undefined;
            };
            output: {
                id: string;
            };
            meta: object;
        }>;
        archiveLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labId: string;
                reason?: string | undefined;
            };
            output: {
                id: string;
            };
            meta: object;
        }>;
        restoreLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                labId: string;
                reason?: string | undefined;
            };
            output: {
                id: string;
            };
            meta: object;
        }>;
        listExpiringProviders: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                search?: string | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
                window?: "7d" | "30d" | "60d" | "all" | undefined;
            };
            output: {
                providers: {
                    practitionerId: string;
                    name: string;
                    licenseNumber: string;
                    issuingBody: string;
                    expiryDate: string;
                    daysRemaining: number | null;
                    kycStatus: string;
                }[];
                total: number;
                cursor: number;
                limit: number;
            };
            meta: object;
        }>;
        renewProviderLicense: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                newExpiryDate: string;
                documentUrl: string;
            };
            output: {
                success: boolean;
                practitionerId: string;
                newExpiryDate: string;
                kycStatus: string;
            };
            meta: object;
        }>;
        licenseExpiryJobStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                lastRun: null;
                status: string;
                summary?: undefined;
            } | {
                lastRun: string | null | undefined;
                status: string | undefined;
                summary: unknown;
            };
            meta: object;
        }>;
        listKycSubmissions: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                search?: string | undefined;
                status?: "PENDING" | "ALL" | "SLA_BREACHED" | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                submissions: {
                    photoUrl: string | null;
                    submissionId: string;
                    practitionerId: string;
                    providerName: string;
                    submittedAt: string;
                    registryNumber: string;
                    registryVerificationStatus: string | null;
                    licenseDocumentKey: string | null;
                    kycStatus: string;
                    slaDeadline: string;
                    slaBreached: boolean;
                    slaRemainingHours: number | null;
                }[];
                total: number;
                cursor: number;
                limit: number;
            };
            meta: object;
        }>;
        getKycSubmission: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                submissionId: string;
            };
            output: {
                submission: {
                    id: any;
                    practitionerId: any;
                    submittedAt: any;
                    status: any;
                    registryNumber: any;
                    registryVerificationStatus: string | null;
                    rejectionReason: any;
                    adminMessage: any;
                    reviewedBy: any;
                    reviewedAt: any;
                };
                providerName: string;
                kycStatus: string;
                documentUrls: {
                    type: "MEDICAL_LICENSE" | "NATIONAL_ID";
                    url: string;
                }[];
                ocrFields: {
                    documentType: "NATIONAL_ID" | "MEDICAL_LICENSE";
                    fields: {
                        name: string;
                        value: string;
                        confidence: number;
                    }[];
                }[];
                slaDeadline: string;
                slaBreached: boolean;
                slaRemainingHours: number | null;
            };
            meta: object;
        }>;
        reviewKycSubmission: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                action: "REQUEST_MORE_INFO" | "APPROVE" | "REJECT";
                submissionId: string;
                reason?: string | undefined;
            };
            output: {
                success: boolean;
                submissionId: string;
                action: "REQUEST_MORE_INFO" | "APPROVE" | "REJECT";
                newKycStatus: string;
            };
            meta: object;
        }>;
        listAnomalyAlerts: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "SUSPENDED" | "ALL" | "UNREVIEWED" | "ESCALATED" | "DISMISSED" | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                alerts: {
                    id: string;
                    practitionerId: string;
                    practitionerName: string;
                    anomalyType: string;
                    threshold: number;
                    actualValue: number;
                    dateRangeStart: string;
                    dateRangeEnd: string;
                    severity: string;
                    status: string;
                    createdAt: string;
                }[];
                total: number;
                cursor: number;
                limit: number;
            };
            meta: object;
        }>;
        getAnomalyDetail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                alertId: string;
            };
            output: {
                id: string;
                practitionerId: string;
                practitionerName: string;
                anomalyType: string;
                threshold: number;
                actualValue: number;
                dateRangeStart: string;
                dateRangeEnd: string;
                severity: string;
                status: string;
                createdAt: string;
                reviewedBy: string;
                reviewedAt: string;
                reviewAction: string;
                reviewReason: string;
                assigneeName: string | null;
                escalationPriority: string;
                escalationNote: string;
                escalatedByName: string | null;
                escalatedAt: string;
                resolutionNote: string;
                resolvedByName: string | null;
                resolvedAt: string;
                prescribingSummary: {
                    totalPrescriptions: number;
                    controlledSubstanceCount: number;
                    patientCount: number;
                };
                timeline: {
                    date: string;
                    count: number;
                }[];
            };
            meta: object;
        }>;
        reviewAnomaly: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                action: "DISMISS" | "ESCALATE" | "SUSPEND_PROVIDER";
                reason: string;
                alertId: string;
            };
            output: {
                success: boolean;
                alertId: string;
                action: "DISMISS" | "ESCALATE" | "SUSPEND_PROVIDER";
                newStatus: string | undefined;
            };
            meta: object;
        }>;
        getClinicalSafetyMetrics: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                interactionCheckCompletionRate: number;
                completionRateStatus: "OK" | "ALERT";
                contraindicatedOverrideRate: number;
                overrideRateStatus: "OK" | "ALERT";
                unresolvedTier1Conflicts: number;
                oldestTier1AgeHours: number | null;
                tier1Status: "OK" | "ALERT" | "WARNING";
                totalPrescriptions24h: number;
                totalChecks7d: number;
                overrides7d: number;
            };
            meta: object;
        }>;
        getClinicalSafetyReport: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                month: number;
                year: number;
            };
            output: {
                id: string;
                month: number;
                year: number;
                report: Record<string, unknown>;
                generatedAt: string;
            };
            meta: object;
        }>;
        listAuditChainVerifications: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: number | undefined;
                daysBack?: number | undefined;
            };
            output: {
                verifications: {
                    id: string;
                    verifiedAt: string;
                    checkedCount: number;
                    valid: boolean | null;
                    brokenAtEventId: string;
                    jobDurationMs: number;
                    errorReason: string;
                    isFullVerification: boolean;
                    triggeredBy: string;
                }[];
                total: number;
            };
            meta: object;
        }>;
        getAuditChainStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                lastVerifiedAt: null;
                lastResult: null;
                chainHealthy: null;
                consecutiveSuccesses: number;
                lastCheckedCount: number;
            } | {
                lastVerifiedAt: string;
                lastResult: boolean | null;
                chainHealthy: boolean;
                consecutiveSuccesses: number;
                lastCheckedCount: number;
            };
            meta: object;
        }>;
        triggerFullChainVerification: import("@trpc/server").TRPCMutationProcedure<{
            input: void;
            output: import("../../jobs/audit-chain-verify").AuditChainVerifyResult;
            meta: object;
        }>;
        listClinicalSafetyReports: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                reports: {
                    id: string;
                    month: number;
                    year: number;
                    generatedAt: string;
                }[];
                total: number;
            };
            meta: object;
        }>;
        listUsers: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                search?: string | undefined;
                status?: "SUSPENDED" | "ACTIVE" | "ALL" | "ARCHIVED" | "PENDING_INVITE" | undefined;
                role?: string | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                users: {
                    id: string;
                    authUserId: string;
                    name: string;
                    givenName: string;
                    familyName: string;
                    email: string;
                    role: string;
                    status: string;
                    phone: string;
                    jobTitle: string;
                    department: string;
                    avatarUrl: string;
                    lastLoginAt: string;
                    createdAt: string;
                    suspendedAt: string;
                    suspensionReason: string;
                    archivedAt: string;
                }[];
                total: number;
                cursor: number;
                limit: number;
            };
            meta: object;
        }>;
        getUser: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                userId: string;
            };
            output: {
                id: string;
                authUserId: string;
                name: string;
                givenName: string;
                familyName: string;
                email: string;
                role: string;
                status: string;
                lastLoginAt: string;
                createdAt: string;
                updatedAt: string;
                suspendedAt: string;
                suspensionReason: string;
                suspendedBy: string;
                invitedBy: string;
                pendingSuspensionDate: string;
                archivedAt: string;
                phone: string;
                jobTitle: string;
                department: string;
                employeeId: string;
                avatarUrl: string;
                qualification: string;
                registrationNumber: string;
                licenseExpiry: string;
                clinicName: string;
                clinicAddress: string;
                consultationLanguages: string[];
                hasMfa: boolean;
            };
            meta: object;
        }>;
        createUser: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                role: string;
                email: string;
                password: string;
                givenName: string;
                phone?: string | undefined;
                consultationLanguages?: string[] | undefined;
                jobTitle?: string | undefined;
                department?: string | undefined;
                employeeId?: string | undefined;
                avatarUrl?: string | undefined;
                qualification?: string | undefined;
                registrationNumber?: string | undefined;
                licenseExpiry?: string | undefined;
                clinicName?: string | undefined;
                clinicAddress?: string | undefined;
                familyName?: string | undefined;
            };
            output: {
                userId: string;
                name: string;
                givenName: string;
                familyName: string;
                email: string;
                role: string;
                status: string;
                setupLink: string | null;
                emailSent: boolean;
            };
            meta: object;
        }>;
        updateUser: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
                role?: string | undefined;
                name?: string | undefined;
                phone?: string | undefined;
                consultationLanguages?: string[] | undefined;
                jobTitle?: string | undefined;
                department?: string | undefined;
                employeeId?: string | undefined;
                avatarUrl?: string | undefined;
                qualification?: string | undefined;
                registrationNumber?: string | undefined;
                licenseExpiry?: string | undefined;
                clinicName?: string | undefined;
                clinicAddress?: string | undefined;
                givenName?: string | undefined;
                familyName?: string | undefined;
            };
            output: {
                success: boolean;
                userId: string;
            };
            meta: object;
        }>;
        archiveUser: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
            };
            output: {
                success: boolean;
                userId: string;
                status: string;
            };
            meta: object;
        }>;
        restoreUser: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
            };
            output: {
                success: boolean;
                userId: string;
                status: string;
            };
            meta: object;
        }>;
        suspendUser: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reason: string;
                userId: string;
            };
            output: {
                success: boolean;
                userId: string;
                status: string;
            };
            meta: object;
        }>;
        reactivateUser: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
            };
            output: {
                success: boolean;
                userId: string;
                status: string;
            };
            meta: object;
        }>;
        resendInvitation: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
            };
            output: {
                success: boolean;
                userId: string;
                setupLink: string | null;
                emailSent: boolean;
            };
            meta: object;
        }>;
        resetUserPassword: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                userId: string;
            };
            output: {
                success: boolean;
                userId: string;
                resetLink: string | null;
                emailSent: boolean;
            };
            meta: object;
        }>;
        getProfile: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: string;
                authUserId: string;
                name: string;
                givenName: string;
                familyName: string;
                email: string | null;
                role: string;
                createdAt: string;
                practitionerId: string | null;
                photoTargetId: string;
                avatarUrl: string | null;
                updatedAt: string | null;
            };
            meta: object;
        }>;
        updateAdminProfile: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
            };
            output: {
                success: boolean;
                name: string;
            };
            meta: object;
        }>;
        getOrganization: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: string;
                name: string;
                countryCode: string;
                billingEmail: string;
                status: string;
                trialEndsAt: string;
                timezone: string;
                createdAt: string;
            };
            meta: object;
        }>;
        updateOrganization: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name?: string | undefined;
                countryCode?: string | undefined;
                billingEmail?: string | undefined;
                timezone?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getNotificationPreferences: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                preferences: {
                    kycSubmission: boolean;
                    labRegistration: boolean;
                    anomalyAlert: boolean;
                    licenseExpiry: boolean;
                    auditChainFailure: boolean;
                    userSuspension: boolean;
                    subscriptionChange: boolean;
                };
                updatedAt: null;
            } | {
                preferences: {
                    kycSubmission: boolean;
                    labRegistration: boolean;
                    anomalyAlert: boolean;
                    licenseExpiry: boolean;
                    auditChainFailure: boolean;
                    userSuspension: boolean;
                    subscriptionChange: boolean;
                };
                updatedAt: string;
            };
            meta: object;
        }>;
        updateNotificationPreferences: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                preferences: Record<string, boolean>;
            };
            output: {
                success: boolean;
                updatedAt: string;
            };
            meta: object;
        }>;
        recentActivity: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
            };
            output: {
                activities: {
                    id: string;
                    timestamp: string;
                    actorId: string;
                    action: string;
                    resourceType: string;
                    resourceId: string;
                    outcome: string;
                    description: string;
                }[];
            };
            meta: object;
        }>;
        listAuditEvents: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                startDate: string;
                endDate: string;
                limit?: number | undefined;
                cursor?: number | undefined;
                action?: string | undefined;
                outcome?: "SUCCESS" | "FAILURE" | "ALL" | undefined;
                actionGroup?: "ALL" | "KYC_ACTIONS" | "LAB_ACTIONS" | "USER_ACTIONS" | "ALERT_ACTIONS" | "AUTH_EVENTS" | "SETTINGS_CHANGES" | undefined;
                actorSearch?: string | undefined;
            };
            output: {
                events: {
                    id: string;
                    timestamp: string;
                    actorId: string;
                    actorName: string;
                    actorRole: string;
                    action: string;
                    resourceType: string;
                    resourceId: string;
                    outcome: string;
                    metadata: Record<string, unknown> | null;
                }[];
                total: number;
                cursor: number;
                limit: number;
            };
            meta: object;
        }>;
        exportAuditEvents: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                startDate: string;
                endDate: string;
                action?: string | undefined;
                outcome?: "SUCCESS" | "FAILURE" | "ALL" | undefined;
                actionGroup?: "ALL" | "KYC_ACTIONS" | "LAB_ACTIONS" | "USER_ACTIONS" | "ALERT_ACTIONS" | "AUTH_EVENTS" | "SETTINGS_CHANGES" | undefined;
                actorSearch?: string | undefined;
            };
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        exportUsers: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        exportKycSubmissions: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        exportExpiringProviders: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        exportLabs: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        exportAlerts: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        getProviderProfile: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId: string;
            };
            output: {
                practitioner: {
                    id: string;
                    givenName: string;
                    familyName: string;
                    email: string | null;
                    phone: string | null;
                    role: string;
                    kycStatus: string;
                    licenseExpiry: string | null;
                    licenseDaysRemaining: number | null;
                    status: string;
                    createdAt: string;
                };
                kycSubmissions: {
                    id: string;
                    status: string;
                    submittedAt: string;
                    reviewedAt: string;
                    reviewerId: string;
                }[];
                alerts: {
                    id: string;
                    anomalyType: string;
                    severity: string;
                    status: string;
                    createdAt: string;
                    reviewAction: string;
                }[];
                alertSummary: {
                    total: number;
                    dismissed: number;
                    escalated: number;
                    resolved: number;
                    unreviewed: number;
                };
            };
            meta: object;
        }>;
        escalateAnomaly: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                note: string;
                priority: "URGENT" | "NORMAL";
                alertId: string;
                assigneeId?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        resolveAnomaly: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                alertId: string;
                resolutionNote: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        reassignAnomaly: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                alertId: string;
                assigneeId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getOrgThresholds: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                kycReviewSlaDays: number;
                controlledSubstanceDailyLimit: number;
                drugFrequencyThresholdPct: number;
                licenseExpiryWarningDays: number[];
            };
            meta: object;
        }>;
        updateOrgThresholds: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                kycReviewSlaDays?: number | undefined;
                controlledSubstanceDailyLimit?: number | undefined;
                drugFrequencyThresholdPct?: number | undefined;
                licenseExpiryWarningDays?: number[] | undefined;
            };
            output: {
                kycReviewSlaDays: number;
                controlledSubstanceDailyLimit: number;
                drugFrequencyThresholdPct: number;
                licenseExpiryWarningDays: number[];
            };
            meta: object;
        }>;
        getModuleSettings: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                moduleCode: string;
            };
            output: {
                moduleCode: string;
                settings: {
                    [x: string]: unknown;
                };
            };
            meta: object;
        }>;
        updateModuleSettings: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                moduleCode: string;
                settings: Record<string, unknown>;
            };
            output: {
                moduleCode: string;
                settings: {
                    [x: string]: unknown;
                };
            };
            meta: object;
        }>;
        listLabStaff: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                labId: string;
            };
            output: {
                practitionerId: string;
                email: string;
                labRole: import("@ultranos/shared-types").LabRole;
                createdAt: string;
                photoUrl: string | null;
            }[];
            meta: object;
        }>;
        updateLabStaffRole: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                targetPractitionerId: string;
                newRole: import("@ultranos/shared-types").LabRole;
                labId: string;
            };
            output: {
                success: boolean;
                previousRole: string;
                newRole: string;
            };
            meta: object;
        }>;
        assignStaffToLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                labId: string;
                initialRole: import("@ultranos/shared-types").LabRole;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        removeStaffFromLab: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                labId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listAllLabStaff: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
                roleFilter?: import("@ultranos/shared-types").LabRole | undefined;
                labFilter?: string | undefined;
                activityFilter?: "ALL" | "ACTIVE_7D" | "INACTIVE" | undefined;
            };
            output: {
                items: {
                    practitionerId: string;
                    email: string;
                    labId: string;
                    labName: string;
                    labRole: import("@ultranos/shared-types").LabRole;
                    lastActiveAt: string | null;
                    createdAt: string;
                    labHasManager: boolean;
                    photoUrl: string | null;
                }[];
                nextCursor: string | null;
            };
            meta: object;
        }>;
        getManagerlessLabs: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                labId: string;
                labName: string;
            }[];
            meta: object;
        }>;
        listLabsForFilter: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                id: string;
                labName: string;
            }[];
            meta: object;
        }>;
        exportLabStaffCsv: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                roleFilter?: import("@ultranos/shared-types").LabRole | undefined;
                labFilter?: string | undefined;
                activityFilter?: "ALL" | "ACTIVE_7D" | "INACTIVE" | undefined;
            };
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        listMentorshipPairings: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: string | undefined;
                statusFilter?: "ACTIVE" | "ALL" | "DISSOLVED" | undefined;
            };
            output: {
                items: {
                    id: string;
                    mentorName: string;
                    mentorEmail: string;
                    mentorPhotoUrl: string | null;
                    menteeName: string;
                    menteeEmail: string;
                    menteePhotoUrl: string | null;
                    labName: string;
                    startDate: string;
                    status: string;
                    dissolvedAt: string | null;
                    dissolvedReason: string | null;
                }[];
                nextCursor: string | null;
            };
            meta: object;
        }>;
        getMentorshipPairingDetail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                pairingId: string;
            };
            output: {
                id: any;
                mentorName: string;
                mentorPractitionerId: any;
                menteeName: string;
                menteePractitionerId: any;
                labName: any;
                goals: any;
                status: any;
                startDate: any;
                dissolvedAt: any;
                dissolvedReason: any;
                dissolvedNotes: any;
                createdAt: any;
                checkins: {
                    id: string;
                    month: string;
                    status: string;
                    notes: string | null;
                    completedAt: string | null;
                }[];
            };
            meta: object;
        }>;
        createMentorshipPairing: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                startDate: string;
                mentorPractitionerId: string;
                menteePractitionerId: string;
                goals?: string | undefined;
            };
            output: {
                id: any;
                status: any;
                startDate: any;
                createdAt: any;
            };
            meta: object;
        }>;
        dissolveMentorshipPairing: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reason: "OTHER" | "INACTIVE" | "COMPLETED" | "REASSIGNED";
                pairingId: string;
                notes?: string | undefined;
            };
            output: {
                id: any;
                status: any;
            };
            meta: object;
        }>;
        updateMentorshipCheckin: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                status: "COMPLETED" | "SKIPPED";
                month: string;
                pairingId: string;
                notes?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getMentorshipStats: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                totalPaired: number;
                unmatchedTechs: number;
                avgPairingDurationDays: number;
                checkinCompletionRate: number;
            };
            meta: object;
        }>;
        listEligibleMentors: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                practitionerId: string;
                name: string;
                labName: string;
                labRole: string;
            }[];
            meta: object;
        }>;
        getEmployeeHealth: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId: string;
            };
            output: {
                id: any;
                practitionerId: any;
                hepBStatus: any;
                hepBTiterDate: any;
                tetanusStatus: any;
                tetanusDate: any;
                covidStatus: any;
                covidDoses: any;
                covidLastDoseDate: any;
                tbScreeningDate: any;
                tbScreeningResult: any;
                exposureHistory: {
                    date: string;
                    type: string;
                    outcome: string;
                }[];
                decryptionFailed: boolean;
                reminders: import("../../lib/screening-reminders").ScreeningReminders;
                createdAt: any;
                updatedAt: any;
            } | null;
            meta: object;
        }>;
        updateEmployeeHealth: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                hepBStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
                tetanusStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
                covidStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
                hepBTiterDate?: string | null | undefined;
                tetanusDate?: string | null | undefined;
                covidDoses?: number | undefined;
                covidLastDoseDate?: string | null | undefined;
                tbScreeningDate?: string | null | undefined;
                tbScreeningResult?: "NEGATIVE" | "POSITIVE" | "INDETERMINATE" | null | undefined;
                exposureHistory?: {
                    type: string;
                    date: string;
                    outcome: string;
                }[] | undefined;
            };
            output: {
                success: boolean;
                id: any;
            };
            meta: object;
        }>;
        listCertificationPathways: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "ACTIVE" | "ALL" | "ARCHIVED" | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                pathways: {
                    id: string;
                    name: string;
                    description: string | null;
                    milestones: Array<{
                        title: string;
                        type: string;
                        required_count: number;
                    }>;
                    milestoneCount: any;
                    status: string;
                    createdAt: string;
                    updatedAt: string;
                }[];
                total: number;
            };
            meta: object;
        }>;
        createCertificationPathway: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                milestones: {
                    type: "MODULE_COMPLETION" | "SUPERVISED_PROCEDURE" | "ASSESSMENT_PASS" | "CONTINUING_ED_HOURS";
                    title: string;
                    required_count: number;
                }[];
                description?: string | undefined;
            };
            output: {
                success: boolean;
                id: any;
            };
            meta: object;
        }>;
        updateCertificationPathway: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                status?: "ACTIVE" | "ARCHIVED" | undefined;
                description?: string | undefined;
                name?: string | undefined;
                milestones?: {
                    type: "MODULE_COMPLETION" | "SUPERVISED_PROCEDURE" | "ASSESSMENT_PASS" | "CONTINUING_ED_HOURS";
                    title: string;
                    required_count: number;
                }[] | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        archiveCertificationPathway: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listCertificationProgress: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId: string;
                pathwayId?: string | undefined;
            };
            output: {
                pathways: {
                    completionPct: number;
                    pathwayId: string;
                    pathwayName: string;
                    pathwayStatus: string;
                    milestones: Array<{
                        progressId: string;
                        milestoneIndex: number;
                        title: string;
                        type: string;
                        requiredCount: number;
                        status: string;
                        evidenceRef: string | null;
                        reviewerNote: string | null;
                        approvedAt: string | null;
                        submittedAt: string | null;
                    }>;
                }[];
            };
            meta: object;
        }>;
        reviewMilestone: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                action: "APPROVE" | "REJECT";
                progressId: string;
                note?: string | undefined;
            };
            output: {
                success: boolean;
                newStatus: string;
            };
            meta: object;
        }>;
        assignPathway: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                pathwayId: string;
            };
            output: {
                success: boolean;
                milestonesCreated: number;
            };
            meta: object;
        }>;
        issueCredential: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                practitionerId: string;
                pathwayId: string;
                expiresAt?: string | undefined;
            };
            output: {
                success: boolean;
                credentialId: any;
                certificateHash: string;
            };
            meta: object;
        }>;
        getExpiringCredentials: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                daysAhead?: number | undefined;
            };
            output: {
                credentials: {
                    id: string;
                    practitionerId: string;
                    practitionerName: string;
                    pathwayName: string;
                    expiresAt: string;
                    daysRemaining: number;
                    urgency: "red" | "orange" | "amber";
                }[];
                buckets: {
                    within90: number;
                    within60: number;
                    within30: number;
                };
            };
            meta: object;
        }>;
        getInventoryOverview: import("@trpc/server").TRPCQueryProcedure<{
            input: {};
            output: {
                labs: {
                    id: string;
                    name: string;
                }[];
                reagentCategories: string[];
                cells: {
                    labId: string;
                    labName: string;
                    reagentCategory: string;
                    quantity: number;
                    unit: string;
                    reportedAt: string;
                    stockLevel: "GREEN" | "YELLOW" | "AMBER" | "RED";
                }[];
            };
            meta: object;
        }>;
        getRedistributionRecommendations: import("@trpc/server").TRPCQueryProcedure<{
            input: {};
            output: {
                recommendations: {
                    targetLabId: string;
                    targetLabName: string;
                    sourceLabId: string;
                    sourceLabName: string;
                    reagentCategory: string;
                    sourceQuantity: number;
                    distanceKm: number | null;
                }[];
            };
            meta: object;
        }>;
        listPurchaseOrders: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "APPROVED" | "REQUESTED" | "ORDERED" | "SHIPPED" | "DELIVERED" | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
            };
            output: {
                orders: {
                    id: any;
                    supplierId: any;
                    supplierName: any;
                    items: any;
                    status: any;
                    totalItems: any;
                    notes: any;
                    createdBy: any;
                    approvedBy: any;
                    approvedAt: any;
                    orderedAt: any;
                    shippedAt: any;
                    deliveredAt: any;
                    createdAt: any;
                }[];
                total: number;
            };
            meta: object;
        }>;
        createPurchaseOrder: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                supplierId: string;
                items: {
                    unit: string;
                    labId: string;
                    quantity: number;
                    reagentCategory: string;
                }[];
                notes?: string | undefined;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        updateOrderStatus: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                orderId: string;
                newStatus: "APPROVED" | "ORDERED" | "SHIPPED" | "DELIVERED";
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listSuppliers: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "ACTIVE" | "INACTIVE" | undefined;
            };
            output: {
                suppliers: {
                    id: any;
                    name: any;
                    contactEmail: any;
                    phone: any;
                    leadTimeDays: any;
                    status: any;
                    createdAt: any;
                    updatedAt: any;
                }[];
            };
            meta: object;
        }>;
        createSupplier: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                phone?: string | undefined;
                leadTimeDays?: number | undefined;
                contactEmail?: string | undefined;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        updateSupplier: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                status?: "ACTIVE" | "INACTIVE" | undefined;
                name?: string | undefined;
                phone?: string | null | undefined;
                leadTimeDays?: number | null | undefined;
                contactEmail?: string | null | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getNetworkOverview: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                labs: {
                    labId: string;
                    labName: string;
                    status: string;
                    pendingSamples: number;
                    stockAlertCount: number;
                    stockDataAvailable: boolean;
                    staffCount: number;
                    lastSyncAt: null;
                }[];
            };
            meta: object;
        }>;
        activateOutbreakMode: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                pathogen: string;
                affectedLabIds: string[];
                notes?: string | undefined;
            };
            output: {
                success: boolean;
                outbreakId: string;
                notificationsSent: boolean;
            };
            meta: object;
        }>;
        deactivateOutbreakMode: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                outbreakId: string;
                notes?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        listOutbreaks: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "ACTIVE" | "RESOLVED" | undefined;
            } | undefined;
            output: {
                outbreaks: {
                    id: string;
                    pathogen: string;
                    affectedLabIds: string[];
                    affectedLabNames: string[];
                    status: string;
                    activatedBy: string;
                    activatedAt: string;
                    resolvedAt: string;
                    resolvedBy: string;
                    notes: string;
                }[];
            };
            meta: object;
        }>;
        enrollChw: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                phone: string;
                givenName: string;
                assignedLabId: string;
                familyName?: string | undefined;
            };
            output: {
                success: boolean;
                chwId: `${string}-${string}-${string}-${string}-${string}`;
                role: string;
                status: string;
                assignedLabId: string;
            };
            meta: object;
        }>;
        getSurveillanceConfig: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId?: string | undefined;
            } | undefined;
            output: {
                config: null;
            } | {
                config: {
                    id: any;
                    practitionerId: any;
                    orgId: any;
                    monitoredLabIds: string[];
                    monitoredLabs: {
                        id: string;
                        lab_name: string;
                        status: string;
                    }[];
                    thresholds: Array<{
                        test_category: string;
                        threshold_pct: number;
                    }>;
                    channels: {
                        in_app: boolean;
                        sms_phone?: string;
                        email?: string;
                    };
                    createdAt: any;
                    updatedAt: any;
                };
            };
            meta: object;
        }>;
        updateSurveillanceConfig: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                monitoredLabIds: string[];
                thresholds: {
                    test_category: string;
                    threshold_pct: number;
                }[];
                channels: {
                    in_app: true;
                    email?: string | undefined;
                    sms_phone?: string | undefined;
                };
            };
            output: {
                success: boolean;
                configId: any;
            };
            meta: object;
        }>;
        listSurveillanceAlerts: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                cursor?: number | undefined;
                acknowledged?: boolean | undefined;
                configId?: string | undefined;
            } | undefined;
            output: {
                alerts: {
                    id: any;
                    configId: any;
                    labId: any;
                    labName: any;
                    testCategory: any;
                    currentRate: number;
                    threshold: number;
                    triggeredAt: any;
                    acknowledgedAt: any;
                    acknowledgedBy: any;
                    notes: any;
                }[];
                total: number;
            };
            meta: object;
        }>;
        acknowledgeSurveillanceAlert: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                alertId: string;
                notes?: string | undefined;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        getSurveillanceAlertSummary: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                totalUnacknowledged: number;
                triggeredToday: number;
                triggeredThisWeek: number;
            };
            meta: object;
        }>;
    }>>;
    ai: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getModelManifest: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                modelType?: import("@ultranos/shared-types").AIModelType | undefined;
            } | undefined;
            output: {
                models: import("@ultranos/shared-types").AIModelManifestEntry[];
            };
            meta: object;
        }>;
        publishModelVersion: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                modelId: string;
                modelType: import("@ultranos/shared-types").AIModelType;
                downloadUrl: string;
                fileSize: number;
                checksum: string;
                version: string;
                deltaFromVersion?: string | null | undefined;
            };
            output: {
                id: any;
                modelId: any;
                version: any;
                releasedAt: any;
            };
            meta: object;
        }>;
        reportModelUpdateEvents: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                events: {
                    modelId: string;
                    deviceId: string;
                    eventType: import("@ultranos/shared-types").ModelUpdateEventType;
                    metadata?: Record<string, unknown> | undefined;
                }[];
            };
            output: {
                logged: number;
            };
            meta: object;
        }>;
        getModelUpdateStats: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                sinceDate?: string | undefined;
            } | undefined;
            output: {
                period: {
                    since: string;
                };
                modelStats: {
                    started: number;
                    completed: number;
                    failed: number;
                    staleDegraded: number;
                    modelId: string;
                    successRate: number | null;
                }[];
                totalStaleDeviceEvents: number;
                drugDbStalenessIncidents: number;
            };
            meta: object;
        }>;
    }>>;
    guardian: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        verifyOtp: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                channel: "whatsapp" | "sms";
                guardianPhone: string;
                otp: string;
            };
            output: {
                guardianUserId: string;
                nonce: `${string}-${string}-${string}-${string}-${string}`;
            };
            meta: object;
        }>;
        createLink: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                nonce: string;
                guardianUserId: string;
                guardianPhoneHash: string;
                guardianPhoneHint: string;
                role?: string | undefined;
            };
            output: {
                success: boolean;
                guardianLinkId: any;
            };
            meta: object;
        }>;
        notifyUnlink: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                guardianUserId: string;
                guardianLinkId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    patientRegistration: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        requestOtp: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                phone: string;
            };
            output: {
                sent: boolean;
            };
            meta: object;
        }>;
        register: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                phone: string;
                preferredLanguage: "en" | "ar" | "prs" | "ps";
                firstName: string;
                otpCode: string;
                dateOfBirth: string;
                gender?: "unknown" | "male" | "female" | "other" | undefined;
                nameFather?: string | undefined;
            };
            output: {
                blocked: boolean;
                message: string;
                success?: undefined;
                patientId?: undefined;
                session?: undefined;
            } | {
                success: boolean;
                patientId: string;
                session: {
                    accessToken: string;
                    refreshToken: string;
                    expiresAt: number | undefined;
                };
                blocked?: undefined;
                message?: undefined;
            };
            meta: object;
        }>;
        discover: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                phone: string;
            };
            output: {
                matchType: "staff";
                candidate?: undefined;
            } | {
                matchType: "patient";
                candidate: {
                    ref: string;
                    maskedName: string;
                    birthYear: number | null;
                };
            } | {
                matchType: "none";
                candidate?: undefined;
            };
            meta: object;
        }>;
        claim: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                phone: string;
                birthYear: number;
                ref: string;
            };
            output: {
                ok: true;
            };
            meta: object;
        }>;
        registerFromSession: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                preferredLanguage: "en" | "ar" | "prs" | "ps";
                firstName: string;
                dateOfBirth: string;
                gender?: "unknown" | "male" | "female" | "other" | undefined;
                nameFather?: string | undefined;
                addressProvinceCurrent?: string | undefined;
                addressDistrictCurrent?: string | undefined;
                addressVillageCurrent?: string | undefined;
                photoUrl?: string | undefined;
            };
            output: {
                blocked: true;
                patientId?: undefined;
            } | {
                patientId: string;
                blocked?: undefined;
            };
            meta: object;
        }>;
    }>>;
    duplicateReview: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        pendingCount: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                count: number;
            };
            meta: object;
        }>;
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "PENDING" | "DISMISSED" | "FLAGGED_FOR_MERGE" | "MERGED" | undefined;
                limit?: number | undefined;
                offset?: number | undefined;
            };
            output: {
                reviews: {
                    id: string;
                    patientLabel: string;
                    sourcePatientId: string;
                    candidates: {
                        id: string;
                        nameGiven: string | undefined;
                        nameFather: string | undefined;
                        birthYear: number | undefined;
                        gender: string | undefined;
                        districtOrigin: string | undefined;
                        mpiScore: number;
                    }[];
                    topScore: number;
                    decision: string;
                    createdAt: string;
                }[];
            };
            meta: object;
        }>;
        dismiss: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                patientId: string;
                reviewId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        flagForMerge: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                reviewId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    dispenseReview: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        list: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                statuses: ("PENDING" | "APPROVED" | "FLAGGED")[];
            };
            output: {
                id: any;
                dispense_id: any;
                prescription_id: any;
                override_reason: any;
                override_supervisor: any;
                status: any;
                reviewed_by: any;
                reviewed_at: any;
                created_at: any;
            }[];
            meta: object;
        }>;
        updateStatus: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                status: "APPROVED" | "FLAGGED";
                reviewId: string;
            };
            output: {
                success: true;
            };
            meta: object;
        }>;
    }>>;
    patientAdmin: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getById: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
            };
            output: {
                patient: {
                    photoUrl: string | null;
                };
            };
            meta: object;
        }>;
        adminSearch: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                query: string;
                limit?: number | undefined;
                offset?: number | undefined;
                mpiWarnOnly?: boolean | undefined;
                hasPendingReview?: boolean | undefined;
                includeInactive?: boolean | undefined;
            };
            output: {
                patients: any[];
            };
            meta: object;
        }>;
        merge: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                survivorId: string;
                duplicateId: string;
                fieldResolutions: Record<string, "survivor" | "duplicate">;
            };
            output: {
                success: boolean;
                mergeAuditId: string;
            };
            meta: object;
        }>;
        unmerge: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                mergeAuditId: string;
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
    }>>;
    appointment: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listByPractitioner: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                practitionerId: string;
                startDate: string;
                endDate: string;
                limit?: number | undefined;
                offset?: number | undefined;
            };
            output: {
                appointments: any[];
            };
            meta: object;
        }>;
        listByPatient: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                patientId: string;
                limit?: number | undefined;
                offset?: number | undefined;
            };
            output: {
                appointments: any[];
            };
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                status: "cancelled" | "pending" | "proposed" | "booked" | "arrived" | "fulfilled" | "noshow" | "entered-in-error";
                end: string;
                _ultranos: {
                    createdAt: string;
                    hlcTimestamp: string;
                    isOfflineCreated: boolean;
                    walkIn: boolean;
                    queuePosition: number | null;
                    clinicId?: string | undefined;
                };
                start: string;
                participant: {
                    status: "accepted" | "declined" | "tentative" | "needs-action";
                    actor: {
                        reference: string;
                        display?: string | undefined;
                    };
                }[];
                serviceType: {
                    code: string;
                    system?: string | undefined;
                    display?: string | undefined;
                }[];
                description?: string | undefined;
            };
            output: {
                success: boolean;
                appointmentId: any;
                alreadyExists: boolean;
            };
            meta: object;
        }>;
        updateStatus: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                status: "cancelled" | "pending" | "proposed" | "booked" | "arrived" | "fulfilled" | "noshow" | "entered-in-error";
            };
            output: {
                success: boolean;
            };
            meta: object;
        }>;
        syncBatch: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                appointments: {
                    id: string;
                    status: "cancelled" | "pending" | "proposed" | "booked" | "arrived" | "fulfilled" | "noshow" | "entered-in-error";
                    end: string;
                    _ultranos: {
                        createdAt: string;
                        hlcTimestamp: string;
                        isOfflineCreated: boolean;
                        walkIn: boolean;
                        queuePosition: number | null;
                        clinicId?: string | undefined;
                    };
                    start: string;
                    participant: {
                        status: "accepted" | "declined" | "tentative" | "needs-action";
                        actor: {
                            reference: string;
                            display?: string | undefined;
                        };
                    }[];
                    serviceType: {
                        code: string;
                        system?: string | undefined;
                        display?: string | undefined;
                    }[];
                    description?: string | undefined;
                }[];
            };
            output: {
                results: {
                    id: string;
                    action: "inserted" | "updated" | "skipped";
                    doubleBookingConflict: boolean;
                }[];
            };
            meta: object;
        }>;
        slot: import("@trpc/server").TRPCBuiltRouter<{
            ctx: import("../init").TRPCContext;
            meta: object;
            errorShape: import("@trpc/server").TRPCDefaultErrorShape;
            transformer: true;
        }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
            listByPractitioner: import("@trpc/server").TRPCQueryProcedure<{
                input: {
                    date: string;
                    practitionerId: string;
                };
                output: {
                    slots: any[];
                };
                meta: object;
            }>;
            generateDaily: import("@trpc/server").TRPCMutationProcedure<{
                input: {
                    date: string;
                    practitionerId: string;
                    startHour?: number | undefined;
                    endHour?: number | undefined;
                    slotDurationMinutes?: number | undefined;
                };
                output: {
                    generated: number;
                    message: string;
                } | {
                    generated: number;
                    message?: undefined;
                };
                meta: object;
            }>;
        }>>;
    }>>;
    drugCatalog: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        search: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                q: string;
                limit?: number | undefined;
                lang?: "en" | "prs" | "ps" | undefined;
            };
            output: import("@ultranos/shared-types").DrugSearchResult[];
            meta: object;
        }>;
        getByAtcCode: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                atcCode: string;
            };
            output: import("@ultranos/shared-types").DrugEntryTier1 | import("@ultranos/shared-types").DrugEntryTier2 | import("@ultranos/shared-types").DrugEntryTier3;
            meta: object;
        }>;
        sync: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                sinceVersion: number;
                limit?: number | undefined;
            };
            output: {
                entries: (import("@ultranos/shared-types").DrugEntryTier1 | import("@ultranos/shared-types").DrugEntryTier2 | import("@ultranos/shared-types").DrugEntryTier3)[];
                latestVersion: number;
            };
            meta: object;
        }>;
        getBrandsByAtc: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                atcCode: string;
            };
            output: import("@ultranos/shared-types").DrugBrandWithPresentations[];
            meta: object;
        }>;
        syncBrands: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                sinceVersion: number;
                limit?: number | undefined;
            };
            output: {
                brands: import("@ultranos/shared-types").DrugBrand[];
                latestVersion: number;
            };
            meta: object;
        }>;
        syncBrandPresentations: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                sinceVersion: number;
                limit?: number | undefined;
            };
            output: {
                presentations: import("@ultranos/shared-types").DrugBrandPresentation[];
                latestVersion: number;
            };
            meta: object;
        }>;
        enrich: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                atcCode: string;
                fields: {
                    localNames?: Record<string, string> | undefined;
                    dispensingNotes?: string | undefined;
                    formularyStatus?: "on_formulary" | "off_formulary" | "restricted" | undefined;
                    unitCost?: number | undefined;
                };
            };
            output: import("@ultranos/shared-types").DrugEntryTier1 | import("@ultranos/shared-types").DrugEntryTier2 | import("@ultranos/shared-types").DrugEntryTier3;
            meta: object;
        }>;
        getPrices: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                atcCode: string;
                lat: number;
                lng: number;
                sort?: "price" | "distance" | undefined;
                limit?: number | undefined;
            };
            output: import("@ultranos/shared-types").PharmacyPrice[];
            meta: object;
        }>;
        setPrice: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                atcCode: string;
                facilityId: string;
                retailPrice: number;
                stockSignal: "in_stock" | "low_stock" | "out_of_stock";
                quantity?: number | undefined;
                doseForm?: string | undefined;
            };
            output: {
                atcCode: string;
                facilityId: string;
                retailPrice: number;
                stockSignal: "in_stock" | "low_stock" | "out_of_stock";
            };
            meta: object;
        }>;
    }>>;
    users: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getProfile: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                readonly kind: "patient";
                readonly displayName: "";
                readonly givenName: "";
                readonly tier: "FREE";
                readonly photoUrl?: undefined;
                readonly phone?: undefined;
                readonly gender?: undefined;
                readonly birthDate?: undefined;
                readonly age?: undefined;
                readonly bloodGroup?: undefined;
                readonly currentAddress?: undefined;
                readonly preferredLanguage?: undefined;
                readonly practitionerId?: undefined;
                readonly familyName?: undefined;
                readonly role?: undefined;
                readonly status?: undefined;
                readonly avatarUrl?: undefined;
                readonly updatedAt?: undefined;
                readonly email?: undefined;
                readonly organization?: undefined;
                readonly qualificationDisplay?: undefined;
                readonly licenseId?: undefined;
                readonly licenseExpiry?: undefined;
            } | {
                readonly kind: "patient";
                readonly displayName: string;
                readonly givenName: string;
                readonly photoUrl: string | undefined;
                readonly phone: string | undefined;
                readonly gender: string | undefined;
                readonly birthDate: string | undefined;
                readonly age: number | undefined;
                readonly bloodGroup: string | undefined;
                readonly currentAddress: {
                    readonly province: string | undefined;
                    readonly district: string | undefined;
                    readonly village: string | undefined;
                };
                readonly preferredLanguage: string | undefined;
                readonly tier: "FREE" | "PREMIUM";
                readonly practitionerId?: undefined;
                readonly familyName?: undefined;
                readonly role?: undefined;
                readonly status?: undefined;
                readonly avatarUrl?: undefined;
                readonly updatedAt?: undefined;
                readonly email?: undefined;
                readonly organization?: undefined;
                readonly qualificationDisplay?: undefined;
                readonly licenseId?: undefined;
                readonly licenseExpiry?: undefined;
            } | {
                readonly kind: "practitioner";
                readonly practitionerId: undefined;
                readonly displayName: "";
                readonly givenName: "";
                readonly familyName: "";
                readonly role: "DOCTOR" | "PHARMACIST" | "LAB_TECH" | "GUARDIAN" | "SYSTEM" | "ADMIN" | "PLATFORM_ADMIN";
                readonly status: string;
                readonly avatarUrl: null;
                readonly updatedAt: null;
                readonly tier?: undefined;
                readonly photoUrl?: undefined;
                readonly phone?: undefined;
                readonly gender?: undefined;
                readonly birthDate?: undefined;
                readonly age?: undefined;
                readonly bloodGroup?: undefined;
                readonly currentAddress?: undefined;
                readonly preferredLanguage?: undefined;
                readonly email?: undefined;
                readonly organization?: undefined;
                readonly qualificationDisplay?: undefined;
                readonly licenseId?: undefined;
                readonly licenseExpiry?: undefined;
            } | {
                readonly kind: "practitioner";
                readonly practitionerId: string;
                readonly displayName: string;
                readonly givenName: string;
                readonly familyName: string;
                readonly role: string;
                readonly email: string | undefined;
                readonly phone: string | undefined;
                readonly organization: string | undefined;
                readonly qualificationDisplay: string | undefined;
                readonly licenseId: string | undefined;
                readonly licenseExpiry: string | undefined;
                readonly status: string;
                readonly avatarUrl: string | null;
                readonly updatedAt: string | null;
                readonly tier?: undefined;
                readonly photoUrl?: undefined;
                readonly gender?: undefined;
                readonly birthDate?: undefined;
                readonly age?: undefined;
                readonly bloodGroup?: undefined;
                readonly currentAddress?: undefined;
                readonly preferredLanguage?: undefined;
            };
            meta: object;
        }>;
    }>>;
    pharmacy: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        search: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                q: string;
                limit?: number | undefined;
            };
            output: import("@ultranos/shared-types").PharmacyDirectoryEntry[];
            meta: object;
        }>;
        sync: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                limit?: number | undefined;
                since?: string | undefined;
            };
            output: {
                pharmacies: import("@ultranos/shared-types").PharmacyDirectoryEntry[];
                latestUpdatedAt: string | null;
            };
            meta: object;
        }>;
        listForAdmin: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "ACTIVE" | "ALL" | "ARCHIVED" | "INACTIVE" | undefined;
                q?: string | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
                includeArchived?: boolean | undefined;
            };
            output: {
                facilities: any;
                nextCursor: number | null;
            };
            meta: object;
        }>;
        exportCsv: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        getDetail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: import("@ultranos/shared-types").FacilityProfileBase & Record<string, unknown>;
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                description?: string | undefined;
                phone?: string | undefined;
                district?: string | undefined;
                province?: string | undefined;
                licenseRef?: string | undefined;
                email?: string | undefined;
                address?: string | undefined;
                logoUrl?: string | undefined;
                altPhone?: string | undefined;
                website?: string | undefined;
                whatsapp?: string | undefined;
                city?: string | undefined;
                postalCode?: string | undefined;
                country?: string | undefined;
                contactPersonName?: string | undefined;
                contactPersonRole?: string | undefined;
                contactPersonPhone?: string | undefined;
                openingHours?: any;
                timezone?: string | undefined;
                is247?: boolean | undefined;
                latitude?: number | undefined;
                longitude?: number | undefined;
                registrationAuthority?: string | undefined;
                establishedYear?: number | undefined;
                hasDelivery?: boolean | undefined;
                acceptsInsurance?: boolean | undefined;
            };
            output: import("@ultranos/shared-types").FacilityProfileBase & Record<string, unknown>;
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                name: string;
                description?: string | undefined;
                phone?: string | undefined;
                district?: string | undefined;
                province?: string | undefined;
                licenseRef?: string | undefined;
                email?: string | undefined;
                address?: string | undefined;
                logoUrl?: string | undefined;
                altPhone?: string | undefined;
                website?: string | undefined;
                whatsapp?: string | undefined;
                city?: string | undefined;
                postalCode?: string | undefined;
                country?: string | undefined;
                contactPersonName?: string | undefined;
                contactPersonRole?: string | undefined;
                contactPersonPhone?: string | undefined;
                openingHours?: any;
                timezone?: string | undefined;
                is247?: boolean | undefined;
                latitude?: number | undefined;
                longitude?: number | undefined;
                registrationAuthority?: string | undefined;
                establishedYear?: number | undefined;
                hasDelivery?: boolean | undefined;
                acceptsInsurance?: boolean | undefined;
            };
            output: import("@ultranos/shared-types").FacilityProfileBase & Record<string, unknown>;
            meta: object;
        }>;
        archive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        restore: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        setActive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                isActive: boolean;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
    }>>;
    facilityLocations: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listForFacility: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: import("@ultranos/shared-types").FacilityLocation[];
            meta: object;
        }>;
        listForAdmin: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                facilityId: string;
            };
            output: import("@ultranos/shared-types").FacilityLocation[];
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                facilityId: string;
                kind?: "other" | "store" | "room" | "fridge" | "cabinet" | undefined;
                isPrimary?: boolean | undefined;
            };
            output: import("@ultranos/shared-types").FacilityLocation;
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                name?: string | undefined;
                kind?: "other" | "store" | "room" | "fridge" | "cabinet" | undefined;
                isPrimary?: boolean | undefined;
            };
            output: import("@ultranos/shared-types").FacilityLocation;
            meta: object;
        }>;
        setActive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                isActive: boolean;
            };
            output: import("@ultranos/shared-types").FacilityLocation;
            meta: object;
        }>;
    }>>;
    serviceRequest: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        getOrderPatientRef: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                orderId: string;
            };
            output: {
                patientRef: string | null;
            };
            meta: object;
        }>;
        getOrderStatus: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                ids: string[];
            };
            output: import("@ultranos/shared-types").LabOrderStatus[];
            meta: object;
        }>;
    }>>;
    clinicalFacility: import("@trpc/server").TRPCBuiltRouter<{
        ctx: import("../init").TRPCContext;
        meta: object;
        errorShape: import("@trpc/server").TRPCDefaultErrorShape;
        transformer: true;
    }, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
        listForAdmin: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                status?: "ACTIVE" | "ALL" | "ARCHIVED" | "INACTIVE" | undefined;
                q?: string | undefined;
                limit?: number | undefined;
                cursor?: number | undefined;
                includeArchived?: boolean | undefined;
                facilityTypes?: ("clinic" | "hospital" | "opd")[] | undefined;
            };
            output: {
                facilities: any;
                nextCursor: number | null;
            };
            meta: object;
        }>;
        exportCsv: import("@trpc/server").TRPCQueryProcedure<{
            input: void;
            output: {
                data: string;
                filename: string;
                mimeType: string;
            };
            meta: object;
        }>;
        getDetail: import("@trpc/server").TRPCQueryProcedure<{
            input: {
                id: string;
            };
            output: import("@ultranos/shared-types").FacilityProfileBase & Record<string, unknown>;
            meta: object;
        }>;
        create: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                name: string;
                facilityType: "clinic" | "hospital" | "opd";
                description?: string | undefined;
                phone?: string | undefined;
                district?: string | undefined;
                province?: string | undefined;
                licenseRef?: string | undefined;
                email?: string | undefined;
                address?: string | undefined;
                logoUrl?: string | undefined;
                altPhone?: string | undefined;
                website?: string | undefined;
                whatsapp?: string | undefined;
                city?: string | undefined;
                postalCode?: string | undefined;
                country?: string | undefined;
                contactPersonName?: string | undefined;
                contactPersonRole?: string | undefined;
                contactPersonPhone?: string | undefined;
                openingHours?: any;
                timezone?: string | undefined;
                is247?: boolean | undefined;
                specialties?: string[] | undefined;
                latitude?: number | undefined;
                longitude?: number | undefined;
                registrationAuthority?: string | undefined;
                establishedYear?: number | undefined;
                bedCount?: number | undefined;
                emergencyServices?: boolean | undefined;
                departments?: string[] | undefined;
            };
            output: import("@ultranos/shared-types").FacilityProfileBase & Record<string, unknown>;
            meta: object;
        }>;
        update: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                name: string;
                description?: string | undefined;
                phone?: string | undefined;
                district?: string | undefined;
                province?: string | undefined;
                licenseRef?: string | undefined;
                email?: string | undefined;
                address?: string | undefined;
                logoUrl?: string | undefined;
                altPhone?: string | undefined;
                website?: string | undefined;
                whatsapp?: string | undefined;
                city?: string | undefined;
                postalCode?: string | undefined;
                country?: string | undefined;
                contactPersonName?: string | undefined;
                contactPersonRole?: string | undefined;
                contactPersonPhone?: string | undefined;
                openingHours?: any;
                timezone?: string | undefined;
                is247?: boolean | undefined;
                specialties?: string[] | undefined;
                latitude?: number | undefined;
                longitude?: number | undefined;
                registrationAuthority?: string | undefined;
                establishedYear?: number | undefined;
                bedCount?: number | undefined;
                emergencyServices?: boolean | undefined;
                departments?: string[] | undefined;
            };
            output: import("@ultranos/shared-types").FacilityProfileBase & Record<string, unknown>;
            meta: object;
        }>;
        archive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        restore: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
        setActive: import("@trpc/server").TRPCMutationProcedure<{
            input: {
                id: string;
                isActive: boolean;
            };
            output: {
                id: any;
            };
            meta: object;
        }>;
    }>>;
}>>;
export type AppRouter = typeof appRouter;
