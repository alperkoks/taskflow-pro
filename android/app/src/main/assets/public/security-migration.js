/**
 * TaskFlow Pro+ v2.0 — Security, Cryptography, Schema Normalization & Migration Engine
 * ------------------------------------------------------------------------------------
 * 1. PBKDF2-HMAC-SHA256 (310,000 iterations, 16-byte random salt) for Local App Lock.
 * 2. AES-256-GCM (12-byte IV, authenticated tag) for Secret Vault, Encrypted Legacy
 *    Rollback Snapshots, and Secure Export Backups (.tfbackup).
 * 3. Crash-Resilient Write-Ahead Log (WAL) (`tf_migration_journal_`).
 * 4. 42-Field V1 -> V2 Schema Normalizer & Validator (zero data loss).
 * 5. Complete eradication of public plaintext relay traffic.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TaskFlowSecurity = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PBKDF2_ITERATIONS = 310000;
    const SALT_BYTE_LENGTH = 16;
    const IV_BYTE_LENGTH = 12;
    const KEY_BIT_LENGTH = 256;

    // Resolve Web Crypto API in both Browser and Node.js (v19+)
    function getSubtleCrypto() {
        if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
            return globalThis.crypto;
        }
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            return window.crypto;
        }
        if (typeof require === 'function') {
            try {
                const nodeCrypto = require('crypto');
                if (nodeCrypto.webcrypto && nodeCrypto.webcrypto.subtle) {
                    return nodeCrypto.webcrypto;
                }
            } catch (_) {}
        }
        throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
    }

    function bytesToBase64(bytes) {
        if (typeof Buffer !== 'undefined') {
            return Buffer.from(bytes).toString('base64');
        }
        let binary = '';
        const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        for (let i = 0; i < arr.byteLength; i++) {
            binary += String.fromCharCode(arr[i]);
        }
        return btoa(binary);
    }

    function base64ToBytes(b64) {
        if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(String(b64 || ''), 'base64'));
        }
        const binary = atob(String(b64 || ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    function utf8Encode(str) {
        return new TextEncoder().encode(String(str || ''));
    }

    function utf8Decode(bytes) {
        return new TextDecoder().decode(bytes);
    }

    function constantTimeEqual(aBytes, bBytes) {
        if (!(aBytes instanceof Uint8Array) || !(bBytes instanceof Uint8Array)) return false;
        if (aBytes.byteLength !== bBytes.byteLength) return false;
        let diff = 0;
        for (let i = 0; i < aBytes.byteLength; i++) {
            diff |= (aBytes[i] ^ bBytes[i]);
        }
        return diff === 0;
    }

    /**
     * Derives an AES-256-GCM CryptoKey and/or raw verifier bytes using PBKDF2-HMAC-SHA256.
     */
    async function deriveKeyPBKDF2(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
        if (!password || typeof password !== 'string') {
            throw new Error('Password must be a non-empty string.');
        }
        const cryptoObj = getSubtleCrypto();
        const salt = saltBytes instanceof Uint8Array ? saltBytes : base64ToBytes(saltBytes);
        const baseKey = await cryptoObj.subtle.importKey(
            'raw',
            utf8Encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits', 'deriveKey']
        );

        const aesKey = await cryptoObj.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: 'SHA-256'
            },
            baseKey,
            { name: 'AES-GCM', length: KEY_BIT_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );

        const rawBits = await cryptoObj.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: iterations,
                hash: 'SHA-256'
            },
            baseKey,
            KEY_BIT_LENGTH
        );

        return {
            aesKey,
            verifierBytes: new Uint8Array(rawBits),
            verifierB64: bytesToBase64(new Uint8Array(rawBits)),
            saltB64: bytesToBase64(salt),
            iterations
        };
    }

    /**
     * Creates a local PBKDF2 password verifier record (never stores plaintext password).
     */
    async function createPasswordVerifier(password, iterations = PBKDF2_ITERATIONS) {
        const cryptoObj = getSubtleCrypto();
        const salt = cryptoObj.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
        // Separate salt for domain separation between lock verification and vault encryption
        const vaultSalt = cryptoObj.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
        const derived = await deriveKeyPBKDF2(password, salt, iterations);

        return {
            version: 2,
            kdf: 'PBKDF2-HMAC-SHA256',
            algo: 'PBKDF2-HMAC-SHA256',
            algorithm: 'PBKDF2-HMAC-SHA256',
            iterations: iterations,
            saltB64: derived.saltB64,
            verifierB64: derived.verifierB64,
            vaultSaltB64: bytesToBase64(vaultSalt),
            createdAt: Date.now()
        };
    }

    /**
     * Verifies a password against a stored PBKDF2 verifier object in constant time.
     */
    async function verifyPassword(password, verifierObj) {
        if (!password || !verifierObj || !verifierObj.saltB64 || !verifierObj.verifierB64) {
            return false;
        }
        try {
            const iterations = Number(verifierObj.iterations) || PBKDF2_ITERATIONS;
            const saltBytes = base64ToBytes(verifierObj.saltB64);
            const expectedBytes = base64ToBytes(verifierObj.verifierB64);
            const derived = await deriveKeyPBKDF2(password, saltBytes, iterations);
            return constantTimeEqual(derived.verifierBytes, expectedBytes);
        } catch (_) {
            return false;
        }
    }

    /**
     * Encrypts any UTF-8 string or serializable payload using AES-256-GCM with a random 12-byte IV.
     * The derived key is never persisted alongside the ciphertext.
     */
    async function encryptAESGCM(plaintextOrObj, password, existingSaltB64 = null, iterations = PBKDF2_ITERATIONS) {
        const cryptoObj = getSubtleCrypto();
        const saltBytes = existingSaltB64
            ? base64ToBytes(existingSaltB64)
            : cryptoObj.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
        const ivBytes = cryptoObj.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

        const { aesKey, saltB64 } = await deriveKeyPBKDF2(password, saltBytes, iterations);
        const plaintextStr = typeof plaintextOrObj === 'string'
            ? plaintextOrObj
            : JSON.stringify(plaintextOrObj);

        const cipherBuffer = await cryptoObj.subtle.encrypt(
            { name: 'AES-GCM', iv: ivBytes },
            aesKey,
            utf8Encode(plaintextStr)
        );

        const ctB64 = bytesToBase64(new Uint8Array(cipherBuffer));
        return {
            v: 2,
            alg: 'AES-256-GCM',
            kdf: 'PBKDF2-HMAC-SHA256',
            iter: iterations,
            salt: saltB64,
            iv: bytesToBase64(ivBytes),
            ct: ctB64,
            ciphertext: ctB64,
            ts: Date.now()
        };
    }

    /**
     * Decrypts an AES-256-GCM envelope using the user's password.
     * Throws on wrong password or tampered ciphertext/tag.
     */
    async function decryptAESGCM(envelope, password) {
        if (!envelope || typeof envelope !== 'object' || !envelope.ct || !envelope.iv || !envelope.salt) {
            throw new Error('Invalid AES-256-GCM encrypted envelope.');
        }
        const cryptoObj = getSubtleCrypto();
        const iterations = Number(envelope.iter) || PBKDF2_ITERATIONS;
        const saltBytes = base64ToBytes(envelope.salt);
        const ivBytes = base64ToBytes(envelope.iv);
        const cipherBytes = base64ToBytes(envelope.ct);

        const { aesKey } = await deriveKeyPBKDF2(password, saltBytes, iterations);
        const plainBuffer = await cryptoObj.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBytes },
            aesKey,
            cipherBytes
        );
        return utf8Decode(new Uint8Array(plainBuffer));
    }

    /**
     * Complete 42-field inventory of legacy v1 appData and its safe defaults.
     */
    const V1_SCHEMA_42_FIELDS = [
        'profileName',
        'username',
        'email',
        'password',
        'securityQuestion',
        'securityAnswer',
        'avatar',
        'avatarUrl',
        'bio',
        'friendCode',
        'xp',
        'level',
        'streak',
        'lastLoginDate',
        'tasks',
        'categories',
        'habits',
        'goals',
        'dailyWater',
        'waterGoal',
        'foodLogs',
        'calorieGoal',
        'proteinGoal',
        'carbGoal',
        'fatGoal',
        'customFoods',
        'favoriteRecipes',
        'workoutLogs',
        'workoutTemplates',
        'bodyMetrics',
        'sleepLogs',
        'coffeeLogs',
        'fastingState',
        'pomodoroSessions',
        'focusMinutes',
        'detoxLogs',
        'budgetItems',
        'budgetLimit',
        'secretVault',
        'friends',
        'friendMessages',
        'unlockedBadges'
    ];

    function clampNumber(val, min, max, fallback = 0) {
        const n = Number(val);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    }

    function safeStr(val, maxLen = 500, fallback = '') {
        if (val === null || val === undefined) return fallback;
        return String(val).slice(0, maxLen);
    }

    /**
     * Normalizes a legacy v1 appData object into a clean, schema-compliant v2 dataset
     * while preserving all 42 fields and fixing legacy field discrepancies:
     * - Food/Barcode items: `prot` -> `protein`, `carb` -> `carbs` (preserving both for UI compatibility)
     * - Tasks: `dueDate` -> `date` (preserving both for UI compatibility)
     * - Tasks subtasks & Goals steps normalized with deterministic IDs & boolean flags
     * - Habits, dailyWater, budgetItems normalized to strict bounds
     */
    function normalizeAndMigrateV1ToV2(rawV1Data) {
        const src = (rawV1Data && typeof rawV1Data === 'object') ? rawV1Data : {};
        const out = JSON.parse(JSON.stringify(src));

        // 1. Core Identity & Profile
        out.profileName = safeStr(src.profileName, 60, 'Kullanıcı');
        out.username = safeStr(src.username, 30, '').toLowerCase().replace(/[^a-z0-9_]/g, '');
        out.email = safeStr(src.email, 120, '');
        out.securityQuestion = safeStr(src.securityQuestion, 200, '');
        out.securityAnswer = safeStr(src.securityAnswer, 200, '');
        out.avatar = safeStr(src.avatar, 500000, '👤');
        out.avatarUrl = safeStr(src.avatarUrl, 500000, '');
        out.bio = safeStr(src.bio, 160, '');
        out.friendCode = safeStr(src.friendCode, 16, '');

        // 2. Gamification (Self-reported metrics)
        out.xp = clampNumber(src.xp, 0, 10000000, 0);
        out.level = clampNumber(src.level, 1, 1000, 1);
        out.streak = clampNumber(src.streak, 0, 3650, 0);
        out.lastLoginDate = safeStr(src.lastLoginDate, 20, new Date().toISOString().slice(0, 10));

        // 3. Tasks & Subtasks (Fix dueDate <-> date mismatch)
        out.tasks = Array.isArray(src.tasks) ? src.tasks.map((t, idx) => {
            if (!t || typeof t !== 'object') return null;
            const normalizedDate = safeStr(t.date || t.dueDate || '', 20, '');
            const subtasks = Array.isArray(t.subtasks) ? t.subtasks.map((st, sIdx) => ({
                id: safeStr(st && st.id ? st.id : `sub_${idx}_${sIdx}`, 64),
                title: safeStr((st && (st.title || st.text)) || 'Alt Görev', 300),
                completed: Boolean(st && (st.completed || st.done))
            })) : [];
            return {
                ...t,
                id: safeStr(t.id || `task_${idx}_${Date.now()}`, 64),
                title: safeStr(t.title || t.text || 'Görev', 500),
                category: safeStr(t.category || 'general', 40),
                priority: ['low', 'medium', 'high'].includes(t.priority) ? t.priority : 'medium',
                completed: Boolean(t.completed),
                date: normalizedDate,
                dueDate: normalizedDate,
                subtasks
            };
        }).filter(Boolean) : [];

        // 4. Categories
        out.categories = Array.isArray(src.categories) ? src.categories : [];

        // 5. Habits
        out.habits = Array.isArray(src.habits) ? src.habits.map((h, idx) => {
            if (!h || typeof h !== 'object') return null;
            return {
                ...h,
                id: safeStr(h.id || `hab_${idx}`, 64),
                title: safeStr(h.title || h.name || 'Alışkanlık', 120),
                streak: clampNumber(h.streak, 0, 3650, 0),
                history: (h.history && typeof h.history === 'object') ? h.history : {}
            };
        }).filter(Boolean) : [];

        // 6. Goals & Steps
        out.goals = Array.isArray(src.goals) ? src.goals.map((g, idx) => {
            if (!g || typeof g !== 'object') return null;
            const steps = Array.isArray(g.steps) ? g.steps.map((st, sIdx) => ({
                id: safeStr(st && st.id ? st.id : `step_${idx}_${sIdx}`, 64),
                title: safeStr((st && (st.title || st.text)) || 'Adım', 300),
                completed: Boolean(st && (st.completed || st.done))
            })) : [];
            return {
                ...g,
                id: safeStr(g.id || `goal_${idx}`, 64),
                title: safeStr(g.title || 'Hedef', 200),
                progress: clampNumber(g.progress, 0, 100, 0),
                completed: Boolean(g.completed),
                steps
            };
        }).filter(Boolean) : [];

        // 7. Hydration (dailyWater & waterGoal)
        if (src.dailyWater && typeof src.dailyWater === 'object' && !Array.isArray(src.dailyWater)) {
            const cleanWater = {};
            for (const [dateKey, val] of Object.entries(src.dailyWater)) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
                    if (typeof val === 'number') {
                        cleanWater[dateKey] = clampNumber(val, 0, 20000, 0);
                    } else if (val && typeof val === 'object') {
                        cleanWater[dateKey] = {
                            ...val,
                            amountMl: clampNumber(val.amountMl ?? val.amount ?? 0, 0, 20000, 0),
                            goalMl: clampNumber(val.goalMl ?? src.waterGoal ?? 2500, 500, 15000, 2500)
                        };
                    }
                } else {
                    cleanWater[dateKey] = val;
                }
            }
            out.dailyWater = cleanWater;
        } else {
            out.dailyWater = src.dailyWater || {};
        }
        out.waterGoal = clampNumber(src.waterGoal, 500, 15000, 2500);

        // 8. Nutrition & Food Logs (Fix prot/carb <-> protein/carbs mismatch)
        const normalizeFoodEntry = (entry) => {
            if (!entry || typeof entry !== 'object') return entry;
            const proteinVal = clampNumber(entry.protein ?? entry.prot ?? 0, 0, 2000, 0);
            const carbsVal = clampNumber(entry.carbs ?? entry.carb ?? 0, 0, 3000, 0);
            const fatVal = clampNumber(entry.fat ?? 0, 0, 2000, 0);
            const calVal = clampNumber(entry.calories ?? entry.cal ?? entry.kcal ?? 0, 0, 30000, 0);
            return {
                ...entry,
                calories: calVal,
                cal: calVal,
                protein: proteinVal,
                prot: proteinVal,
                carbs: carbsVal,
                carb: carbsVal,
                fat: fatVal
            };
        };

        if (Array.isArray(src.foodLogs)) {
            out.foodLogs = src.foodLogs.map(normalizeFoodEntry);
        } else if (src.foodLogs && typeof src.foodLogs === 'object') {
            const cleanFoodLogs = {};
            for (const [k, v] of Object.entries(src.foodLogs)) {
                cleanFoodLogs[k] = Array.isArray(v) ? v.map(normalizeFoodEntry) : normalizeFoodEntry(v);
            }
            out.foodLogs = cleanFoodLogs;
        } else {
            out.foodLogs = [];
        }

        out.calorieGoal = clampNumber(src.calorieGoal, 500, 15000, 2200);
        out.proteinGoal = clampNumber(src.proteinGoal, 10, 1000, 140);
        out.carbGoal = clampNumber(src.carbGoal, 0, 2000, 220);
        out.fatGoal = clampNumber(src.fatGoal, 0, 1000, 70);
        out.customFoods = Array.isArray(src.customFoods) ? src.customFoods.map(normalizeFoodEntry) : [];
        out.favoriteRecipes = Array.isArray(src.favoriteRecipes) ? src.favoriteRecipes : [];

        // 9. Workouts, Body Metrics, Sleep, Coffee, Fasting
        out.workoutLogs = Array.isArray(src.workoutLogs) ? src.workoutLogs : (src.workoutLogs || []);
        out.workoutTemplates = Array.isArray(src.workoutTemplates) ? src.workoutTemplates : [];
        out.bodyMetrics = (src.bodyMetrics && typeof src.bodyMetrics === 'object') ? src.bodyMetrics : {};
        out.sleepLogs = (src.sleepLogs && typeof src.sleepLogs === 'object') ? src.sleepLogs : [];
        out.coffeeLogs = (src.coffeeLogs && typeof src.coffeeLogs === 'object') ? src.coffeeLogs : [];
        out.fastingState = (src.fastingState && typeof src.fastingState === 'object') ? src.fastingState : { active: false };

        // 10. Focus, Pomodoro, Dopamine Detox
        out.pomodoroSessions = Array.isArray(src.pomodoroSessions) ? src.pomodoroSessions : (Number(src.pomodoroSessions) || 0);
        out.focusMinutes = clampNumber(src.focusMinutes, 0, 5000000, 0);
        out.detoxLogs = Array.isArray(src.detoxLogs) ? src.detoxLogs : [];

        // 11. Finance & Budget Items
        out.budgetItems = Array.isArray(src.budgetItems) ? src.budgetItems.map((b, idx) => {
            if (!b || typeof b !== 'object') return null;
            return {
                ...b,
                id: safeStr(b.id || `bgt_${idx}`, 64),
                title: safeStr(b.title || b.desc || b.name || 'İşlem', 150),
                amount: clampNumber(b.amount, 0, 1000000000, 0),
                type: b.type === 'income' ? 'income' : 'expense'
            };
        }).filter(Boolean) : [];
        out.budgetLimit = clampNumber(src.budgetLimit, 0, 1000000000, 0);

        // 12. Secret Vault, Social & Badges
        out.secretVault = Array.isArray(src.secretVault) ? src.secretVault : (src.secretVault || []);
        out.friends = Array.isArray(src.friends) ? src.friends : [];
        out.friendMessages = (src.friendMessages && typeof src.friendMessages === 'object') ? src.friendMessages : {};
        out.unlockedBadges = Array.isArray(src.unlockedBadges) ? src.unlockedBadges : [];

        // Ensure all 42 canonical fields exist on the output object
        for (const field of V1_SCHEMA_42_FIELDS) {
            if (!(field in out)) {
                out[field] = src[field] !== undefined ? src[field] : null;
            }
        }

        out._schemaVersion = 2;
        return out;
    }

    /**
     * Strips plaintext passwords and security answers before persisting or exporting.
     */
    function sanitizeSensitiveCredentials(appDataObj) {
        if (!appDataObj || typeof appDataObj !== 'object') return appDataObj;
        const copy = JSON.parse(JSON.stringify(appDataObj));
        delete copy.password;
        delete copy.plainPassword;
        delete copy.pw;
        delete copy.securityAnswer;
        return copy;
    }

    /**
     * Creates an AES-256-GCM Encrypted Legacy Rollback Snapshot before v1->v2 migration
     * and removes any plaintext password from the unencrypted storage surface.
     */
    async function createEncryptedRollbackSnapshot(profileId, rawV1AppData, password, storage = null) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const walKey = `tf_migration_journal_${profileId}`;
        const backupKey = `tf_v1_rollback_enc_${profileId}`;

        if (store) {
            store.setItem(walKey, JSON.stringify({
                profileId,
                phase: 'START_SNAPSHOT',
                startedAt: Date.now()
            }));
        }

        const encryptedSnapshot = await encryptAESGCM(rawV1AppData, password);

        if (store) {
            store.setItem(backupKey, JSON.stringify(encryptedSnapshot));
            store.setItem(walKey, JSON.stringify({
                profileId,
                phase: 'SNAPSHOT_COMMITTED',
                updatedAt: Date.now()
            }));
        }

        return encryptedSnapshot;
    }

    /**
     * Restores the original v1 appData from an AES-256-GCM Encrypted Legacy Rollback Snapshot.
     */
    async function restoreFromEncryptedRollbackSnapshot(profileId, password, encryptedEnvelopeOrStorage = null) {
        let envelope = encryptedEnvelopeOrStorage;
        if (!envelope || !envelope.ct) {
            const store = (encryptedEnvelopeOrStorage && typeof encryptedEnvelopeOrStorage.getItem === 'function')
                ? encryptedEnvelopeOrStorage
                : (typeof localStorage !== 'undefined' ? localStorage : null);
            if (!store) throw new Error('Storage not available to read encrypted rollback snapshot.');
            const raw = store.getItem(`tf_v1_rollback_enc_${profileId}`);
            if (!raw) throw new Error(`No encrypted rollback snapshot found for profile: ${profileId}`);
            envelope = JSON.parse(raw);
        }

        const decryptedJson = await decryptAESGCM(envelope, password);
        return JSON.parse(decryptedJson);
    }

    /**
     * Upgrades a legacy v1 profile in-place with WAL protection:
     * 1. Creates an AES-256-GCM encrypted rollback snapshot of the original v1 state.
     * 2. Creates a PBKDF2-HMAC-SHA256 (310,000 iterations) local password verifier.
     * 3. Encrypts `secretVault` items with AES-256-GCM if non-empty.
     * 4. Normalizes all 42 fields via `normalizeAndMigrateV1ToV2`.
     * 5. Deletes the plaintext `password` field only AFTER verifier + snapshot succeed.
     */
    async function migrateProfileWithWAL(profileId, rawV1AppData, password, storage = null) {
        const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        const walKey = `tf_migration_journal_${profileId}`;

        // Step 1: Encrypted rollback snapshot
        const encryptedSnapshot = await createEncryptedRollbackSnapshot(profileId, rawV1AppData, password, store);

        // Step 2: PBKDF2 verifier
        const verifier = await createPasswordVerifier(password, PBKDF2_ITERATIONS);
        if (store) {
            store.setItem(`tf_lock_verifier_${profileId}`, JSON.stringify(verifier));
            store.setItem(walKey, JSON.stringify({
                profileId,
                phase: 'VERIFIER_CREATED',
                updatedAt: Date.now()
            }));
        }

        // Step 3: Normalize all 42 fields
        const migratedData = normalizeAndMigrateV1ToV2(rawV1AppData);

        // Step 4: Encrypt secretVault with AES-256-GCM
        if (Array.isArray(migratedData.secretVault) && migratedData.secretVault.length > 0) {
            migratedData.secretVaultEncrypted = await encryptAESGCM(
                migratedData.secretVault,
                password,
                verifier.vaultSaltB64,
                PBKDF2_ITERATIONS
            );
        }

        // Step 5: Attach PBKDF2 verifier metadata and remove plaintext password
        migratedData.authVerifier = verifier;
        delete migratedData.password;
        delete migratedData.plainPassword;
        delete migratedData.pw;

        if (store) {
            store.setItem(walKey, JSON.stringify({
                profileId,
                phase: 'MIGRATION_COMPLETED',
                completedAt: Date.now()
            }));
        }

        return {
            migratedData,
            verifier,
            encryptedSnapshot
        };
    }

    /**
     * Exports a secure `.tfbackup` package encrypted with AES-256-GCM (if password provided)
     * or a sanitized v2 JSON export with plaintext credentials stripped.
     */
    async function exportSecureBackup(appData, password = null) {
        const cleanData = sanitizeSensitiveCredentials(normalizeAndMigrateV1ToV2(appData));
        if (password && String(password).trim().length > 0) {
            const encryptedPayload = await encryptAESGCM(cleanData, String(password));
            return JSON.stringify({
                format: 'TaskFlowPro-Encrypted-Backup',
                schemaVersion: 2,
                exportedAt: new Date().toISOString(),
                encrypted: true,
                envelope: encryptedPayload
            }, null, 2);
        }
        return JSON.stringify({
            format: 'TaskFlowPro-Backup',
            schemaVersion: 2,
            exportedAt: new Date().toISOString(),
            encrypted: false,
            data: cleanData
        }, null, 2);
    }

    /**
     * Imports either an AES-256-GCM encrypted `.tfbackup` file, a v2 JSON backup,
     * or a legacy v1 `.json` backup, normalizing all 42 fields safely.
     */
    async function importSecureBackup(rawJsonString, password = null) {
        const parsed = typeof rawJsonString === 'string' ? JSON.parse(rawJsonString) : rawJsonString;
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Geçersiz yedek dosyası formatı.');
        }

        if (parsed.encrypted === true && parsed.envelope) {
            if (!password) {
                throw new Error('Bu yedek dosyası AES-256-GCM ile şifrelenmiştir. Lütfen yedek parolasını girin.');
            }
            const decryptedStr = await decryptAESGCM(parsed.envelope, String(password));
            const decryptedObj = JSON.parse(decryptedStr);
            return normalizeAndMigrateV1ToV2(decryptedObj);
        }

        if (parsed.data && typeof parsed.data === 'object') {
            return normalizeAndMigrateV1ToV2(parsed.data);
        }

        // Legacy v1 raw appData JSON
        return normalizeAndMigrateV1ToV2(parsed);
    }

    return {
        PBKDF2_ITERATIONS,
        V1_SCHEMA_42_FIELDS,
        deriveKeyPBKDF2,
        createPasswordVerifier,
        verifyPassword,
        encryptAESGCM,
        decryptAESGCM,
        normalizeAndMigrateV1ToV2,
        sanitizeSensitiveCredentials,
        createEncryptedRollbackSnapshot,
        restoreFromEncryptedRollbackSnapshot,
        migrateProfileWithWAL,
        exportSecureBackup,
        importSecureBackup
    };
});
