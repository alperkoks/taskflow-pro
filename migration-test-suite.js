/**
 * TaskFlow Pro+ v2.0 — Automated Security, Cryptography & Schema Migration Test Suite
 * Executes real Node.js Web Crypto API tests, static security scans, and schema checks.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const TaskFlowSecurity = require('./security-migration.js');

const ROOT = __dirname;

let passed = 0;
let failed = 0;
const results = [];

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`❌ [FAIL] ${name}: ${err.message}`);
  }
}

(async () => {
  console.log('======================================================================');
  console.log('🛡️  TASKFLOW PRO+ v2.0 — SECURITY, CRYPTO & MIGRATION TEST SUITE');
  console.log('======================================================================\n');

  // 1. Static Security Audit: Zero ntfy.sh in app.js, index.html, and security-migration.js
  await runTest('1. Static Audit: Zero ntfy.sh relay endpoints in app.js, index.html & security-migration.js', async () => {
    const appJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const secJs = fs.readFileSync(path.join(ROOT, 'security-migration.js'), 'utf8');

    assert.strictEqual(appJs.includes('ntfy.sh'), false, 'app.js must not reference ntfy.sh');
    assert.strictEqual(indexHtml.includes('ntfy.sh'), false, 'index.html must not reference ntfy.sh');
    assert.strictEqual(secJs.includes('ntfy.sh'), false, 'security-migration.js must not reference ntfy.sh');
    assert.strictEqual(indexHtml.includes('Content-Security-Policy'), true, 'index.html must contain CSP meta tag');
  });

  // 2. Firebase RTDB Security Rules Compiler & Schema Audit
  await runTest('2. Firebase Rules Audit: Valid JSON, zero .numChildren(), zero multiline strings, strict $other rejection', async () => {
    const rawRules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    const parsed = JSON.parse(rawRules);

    assert.ok(parsed.rules, 'Root rules object must exist');
    assert.strictEqual(rawRules.includes('.numChildren('), false, 'Must not contain unsupported .numChildren()');
    assert.strictEqual(rawRules.includes('newData.Root'), false, 'Must not contain invalid newData.Root');
    assert.strictEqual(rawRules.includes('undefined'), false, 'Must not contain undefined in RTDB rules');

    // Verify required top-level nodes
    const requiredRootNodes = [
      'usernames',
      'invite_codes',
      'users_public',
      'relationships',
      'user_relationships',
      'chats',
      'duels',
      'users_private',
      '$other'
    ];
    for (const node of requiredRootNodes) {
      assert.ok(parsed.rules[node], `Missing top-level rule node: ${node}`);
    }
    assert.strictEqual(parsed.rules['$other']['.validate'], false, 'Root $other must reject unknown nodes');

    // Verify users_private has no top-level blanket .write and defines all 16 submodules
    const up = parsed.rules.users_private['$uid'];
    assert.ok(up, 'users_private/$uid must exist');
    assert.strictEqual(up['.write'], undefined, 'users_private/$uid must NOT grant top-level blanket .write');

    const expectedSubmodules = [
      'settings', 'tasks', 'goals', 'habits', 'routines', 'dailyWater', 'nutrition',
      'workouts', 'budgetItems', 'countdowns', 'fastingState', 'dailyLogs', 'vitals',
      'tools', 'vault', 'aiCoachMessages', 'legacySocialArchive', '$other'
    ];
    for (const sub of expectedSubmodules) {
      assert.ok(up[sub], `Missing users_private/$uid submodule: ${sub}`);
    }
    assert.strictEqual(up['$other']['.validate'], false, 'users_private/$uid/$other must be false');
  });

  // 3. Web Crypto PBKDF2-HMAC-SHA256 (310,000 iterations) Verification
  await runTest('3. Web Crypto PBKDF2-HMAC-SHA256 (310,000 iterations) verifier creation & constant-time check', async () => {
    const verifier = await TaskFlowSecurity.createPasswordVerifier('G4r4n1_S3cur3!2026');
    assert.strictEqual(verifier.kdf, 'PBKDF2-HMAC-SHA256');
    assert.strictEqual(verifier.iterations, 310000);
    assert.ok(verifier.saltB64 && verifier.saltB64.length >= 16);
    assert.ok(verifier.verifierB64 && verifier.verifierB64.length >= 32);

    const validOk = await TaskFlowSecurity.verifyPassword('G4r4n1_S3cur3!2026', verifier);
    const wrongOk = await TaskFlowSecurity.verifyPassword('WrongPassword123', verifier);
    assert.strictEqual(validOk, true, 'Correct password must verify true');
    assert.strictEqual(wrongOk, false, 'Incorrect password must verify false');
  });

  // 4. Web Crypto AES-256-GCM Authenticated Encryption & Tamper Detection
  await runTest('4. Web Crypto AES-256-GCM encryption, decryption & tampered ciphertext rejection', async () => {
    const secretPayload = JSON.stringify({
      secretVault: 'IBAN: TR00 0000 1111 2222 — Özel Kasa Notu',
      vaultPhotos: [{ id: 'p1', label: '1. Ay Form', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }]
    });

    const envelope = await TaskFlowSecurity.encryptAESGCM(secretPayload, 'VaultPin#9988');
    assert.strictEqual(envelope.alg, 'AES-256-GCM');
    assert.strictEqual(envelope.kdf, 'PBKDF2-HMAC-SHA256');
    assert.strictEqual(envelope.iter, 310000);
    assert.ok(envelope.salt && envelope.iv && envelope.ct);
    assert.strictEqual(envelope.ct.includes('IBAN'), false, 'Ciphertext must not leak plaintext');

    const decrypted = await TaskFlowSecurity.decryptAESGCM(envelope, 'VaultPin#9988');
    assert.strictEqual(decrypted, secretPayload, 'Decrypted payload must match original plaintext');

    // Verify wrong password fails authentication tag check
    let wrongKeyFailed = false;
    try {
      await TaskFlowSecurity.decryptAESGCM(envelope, 'WrongPin#0000');
    } catch (_) {
      wrongKeyFailed = true;
    }
    assert.strictEqual(wrongKeyFailed, true, 'AES-256-GCM must reject decryption with wrong password');
  });

  // 5. 42-Field V1 -> V2 Schema Normalization & Legacy Field Compatibility
  await runTest('5. 42-Field appData preservation + legacy prot/carb & dueDate/date normalization', async () => {
    const legacyV1Data = {
      username: 'alperkoksal',
      email: 'alper@example.com',
      password: 'legacyPlainPassword',
      secretVault: ['Gizli kasa metni'],
      tasks: [
        { id: 't1', title: 'Göğüs Antrenmanı', dueDate: '2026-10-29', category: 'Spor ve Sağlık', completed: false }
      ],
      goals: [
        { id: 'g1', title: 'Yarı Maraton', steps: [{ id: 's1', text: '5K Koşu', done: true }] }
      ],
      foodLogs: {
        '2026-10-29': [
          { id: 'f1', name: 'Izgara Tavuk (200g)', kcal: 330, prot: 62, carb: 0, fat: 7 }
        ]
      },
      dailyWater: { '2026-10-29': 10 },
      streak: 7,
      xp: 1250
    };

    const normalized = TaskFlowSecurity.normalizeAndMigrateV1ToV2(legacyV1Data);

    // Check all 42 keys exist
    assert.strictEqual(TaskFlowSecurity.V1_SCHEMA_42_FIELDS.length, 42, 'Must track all 42 appData keys');
    for (const key of TaskFlowSecurity.V1_SCHEMA_42_FIELDS) {
      assert.notStrictEqual(normalized[key], undefined, `Normalized appData missing key: ${key}`);
    }

    // Check task dueDate <-> date normalization
    assert.strictEqual(normalized.tasks[0].date, '2026-10-29');
    assert.strictEqual(normalized.tasks[0].dueDate, '2026-10-29');

    // Check nutrition prot/protein & carb/carbs normalization
    const foodItem = normalized.foodLogs['2026-10-29'][0];
    assert.strictEqual(foodItem.prot, 62);
    assert.strictEqual(foodItem.protein, 62);
    assert.strictEqual(foodItem.carb, 0);
    assert.strictEqual(foodItem.carbs, 0);
  });

  // 6. Crash-Resilient WAL Migration + Plaintext Removal + Encrypted Rollback Snapshot Round-Trip
  await runTest('6. WAL Profile Migration removes plaintext passwords & Encrypted Rollback Snapshot restores 100%', async () => {
    const mapStore = {};
    const mockStorage = {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(mapStore, k) ? mapStore[k] : null),
      setItem: (k, v) => { mapStore[k] = String(v); },
      removeItem: (k) => { delete mapStore[k]; }
    };

    const rawV1Profile = {
      username: 'alper_test',
      email: 'alper@test.com',
      password: 'MyOldPlainPassword99',
      secretVault: ['Kriptografik olarak şifrelenecek gizli kasa verisi'],
      tasks: [{ id: 'task_1', title: 'Test Görevi', dueDate: '2026-10-29', completed: false }],
      xp: 950,
      streak: 5
    };

    const migResult = await TaskFlowSecurity.migrateProfileWithWAL(
      'alper_test',
      rawV1Profile,
      'MyOldPlainPassword99',
      mockStorage
    );

    const v2 = migResult.migratedData;
    assert.ok(v2, 'migratedData must be returned');

    // Plaintext password must be deleted after migration
    assert.strictEqual(v2.password, undefined, 'Plaintext password must be deleted after migration');
    assert.ok(v2.authVerifier && v2.authVerifier.verifierB64, 'PBKDF2 authVerifier must be present');
    assert.ok(v2.secretVaultEncrypted && v2.secretVaultEncrypted.ct, 'AES-256-GCM secretVaultEncrypted must be present');

    // Verify WAL journal reached MIGRATION_COMPLETED
    const wal = JSON.parse(mockStorage.getItem('tf_migration_journal_alper_test'));
    assert.strictEqual(wal.phase, 'MIGRATION_COMPLETED', 'WAL journal must be in MIGRATION_COMPLETED phase');

    // Verify Encrypted Legacy Rollback Snapshot can restore 100% of original v1 state
    const restoredV1 = await TaskFlowSecurity.restoreFromEncryptedRollbackSnapshot('alper_test', 'MyOldPlainPassword99', mockStorage);
    assert.strictEqual(restoredV1.password, 'MyOldPlainPassword99', 'Rollback must restore original v1 profile');
    assert.strictEqual(restoredV1.secretVault[0], 'Kriptografik olarak şifrelenecek gizli kasa verisi');
    assert.strictEqual(restoredV1.tasks[0].title, 'Test Görevi');
  });

  // 7. Encrypted .tfbackup Export & Import Round-Trip
  await runTest('7. Encrypted .tfbackup export & import round-trip verification', async () => {
    const sampleData = {
      username: 'alperkoksal',
      tasks: [{ id: 't99', title: 'Yedekleme Testi', date: '2026-10-29', completed: true }],
      xp: 2000
    };

    const backupJson = await TaskFlowSecurity.exportSecureBackup(sampleData, 'BackupPass!2026');
    const parsedBackup = JSON.parse(backupJson);
    assert.strictEqual(parsedBackup.format, 'TaskFlowPro-Encrypted-Backup');
    assert.strictEqual(backupJson.includes('Yedekleme Testi'), false, 'Encrypted backup must not expose task titles in plaintext');

    const imported = await TaskFlowSecurity.importSecureBackup(backupJson, 'BackupPass!2026');
    assert.strictEqual(imported.username, 'alperkoksal');
    assert.strictEqual(imported.tasks[0].title, 'Yedekleme Testi');
  });

  // 8. UI/DOM Integrity Check: Verify 4-Pillar Navigation & Essential DOM IDs in index.html
  await runTest('8. DOM Integrity: 4-Pillar Navigation & all essential IDs preserved in index.html', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const requiredIds = [
      'obsidianDesktopSidebar', 'deskNavToday', 'deskNavBody', 'deskNavGrowth', 'deskNavSocial',
      'navTasks', 'navFoodQuick', 'navGoals', 'navSocial',
      'viewTasks', 'viewGoals', 'viewArchive', 'viewStats', 'viewSettings', 'viewSocial',
      'hubTabCategories', 'hubTabSport', 'hubTabTools',
      'dynamicIslandWrap', 'dopamineDetoxModal', 'aiWeeklyReportModal', 'barcodeScannerModal'
    ];
    for (const id of requiredIds) {
      assert.strictEqual(html.includes(`id="${id}"`), true, `index.html missing required DOM ID: #${id}`);
    }
    assert.strictEqual(html.includes('security-migration.js'), true, 'index.html must load security-migration.js');
  });

  // --------------------------------------------------------------------------
  // TEST 9: Multi-Device Conflict Resolution & Tombstone Sync Verification
  // --------------------------------------------------------------------------
  await runTest('9. Multi-device sync merges per-item updatedAt & respects deletedItems tombstones without resurrection', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.strictEqual(appCode.includes('function mergeCloudAndLocalData(localData, remoteData)'), true);
    assert.strictEqual(appCode.includes('function recordDeletedItemTombstone(collection, itemId)'), true);

    // Extract and execute mergeEntityArraysWithTombstones + mergeCloudAndLocalData in isolated sandbox
    const fnStart = appCode.indexOf('function mergeEntityArraysWithTombstones');
    const fnEnd = appCode.indexOf('window.mergeCloudAndLocalData = mergeCloudAndLocalData;');
    const syncSnippet = appCode.slice(fnStart, fnEnd);
    const sandbox = { window: {} };
    new Function('window', syncSnippet + '\nwindow.mergeCloudAndLocalData = mergeCloudAndLocalData;')(sandbox.window);

    const deviceWeb = {
      username: 'alper',
      updatedAt: 2000,
      authVerifier: { algo: 'PBKDF2-HMAC-SHA256', iterations: 310000, salt: 'aa', hash: 'bb' },
      deletedItems: { tasks: { t_deleted_on_web: 1900 } },
      tasks: [
        { id: 't_shared', title: 'Updated on Web (Newer)', completed: true, updatedAt: 1950 },
        { id: 't_only_on_android_deleted', title: 'Stale item deleted on Android', completed: false, updatedAt: 1100 },
        { id: 't_web_created', title: 'New task from Web', completed: false, updatedAt: 1980 }
      ]
    };

    const deviceAndroid = {
      username: 'alper',
      updatedAt: 1850,
      password: 'legacy_should_be_stripped',
      deletedItems: { tasks: { t_only_on_android_deleted: 1700 } },
      tasks: [
        { id: 't_shared', title: 'Old title on Android', completed: false, updatedAt: 1400 },
        { id: 't_deleted_on_web', title: 'Stale item deleted on Web', completed: false, updatedAt: 1200 },
        { id: 't_android_created', title: 'New task from Android', completed: false, updatedAt: 1800 }
      ]
    };

    const mergedWebFirst = sandbox.window.mergeCloudAndLocalData(deviceWeb, deviceAndroid);
    const mergedAndroidFirst = sandbox.window.mergeCloudAndLocalData(deviceAndroid, deviceWeb);

    const ids1 = mergedWebFirst.tasks.map(t => t.id).sort();
    const ids2 = mergedAndroidFirst.tasks.map(t => t.id).sort();
    assert.deepStrictEqual(ids1, ['t_android_created', 't_shared', 't_web_created']);
    assert.deepStrictEqual(ids2, ['t_android_created', 't_shared', 't_web_created']);

    const sharedTask = mergedWebFirst.tasks.find(t => t.id === 't_shared');
    assert.strictEqual(sharedTask.title, 'Updated on Web (Newer)');
    assert.strictEqual(sharedTask.completed, true);
    assert.strictEqual(mergedWebFirst.password, undefined, 'Plaintext password must never survive merge');
    assert.ok(mergedWebFirst.authVerifier, 'PBKDF2 authVerifier must be preserved');
  });

  // --------------------------------------------------------------------------
  // TEST 10: Social Chat Reply/Forward/Receipts & Desktop 2-Column Workspace
  // --------------------------------------------------------------------------
  await runTest('10. Social chat reply/forward/read-receipts & 2-column Today workspace exist in codebase', async () => {
    const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    assert.strictEqual(appCode.includes('function setChatReplyTo('), true, 'setChatReplyTo must exist');
    assert.strictEqual(appCode.includes('function forwardChatMessage('), true, 'forwardChatMessage must exist');
    assert.strictEqual(appCode.includes('function addInlineQuickTask('), true, 'addInlineQuickTask must exist');
    assert.strictEqual(appCode.includes('function renderTodayWorkspaceContextPanel('), true, 'renderTodayWorkspaceContextPanel must exist');
    assert.strictEqual(html.includes('id="todayWorkspaceGrid"'), true, 'todayWorkspaceGrid must exist in index.html');
    assert.strictEqual(html.includes('id="todayRightContextCol"'), true, 'todayRightContextCol must exist in index.html');
    assert.strictEqual(html.includes('id="inlineQuickTaskBar"'), true, 'inlineQuickTaskBar must exist in index.html');
  });

  console.log('\n======================================================================');
  console.log(`📊 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED (Total: ${passed + failed})`);
  console.log('======================================================================');

  if (failed > 0) {
    process.exit(1);
  }
})();
