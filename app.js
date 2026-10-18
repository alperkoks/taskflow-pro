// ============================================================================
// TASKFLOW PRO - TÜM 25 ÖZELLİK TEK MERKEZDE (OFFLINE + BULUT SENKRON + SIKIŞTIRMA)
// ============================================================================

const DB_NAME = 'TaskFlowProDB';
const DB_VERSION = 1;
let dbInstance = null;

// Aktif Profil ('user1' = Sen, 'user2' = Arkadaşın)
let currentProfile = localStorage.getItem('tf_active_profile') || 'user1';
let enteredPin = '';

// Uygulama Durumu (State)
let appData = {
  profileName: currentProfile === 'user1' ? 'Benim Hesabım' : 'Arkadaşım',
  pin: '', // İlk girişte kullanıcı belirler
  theme: 'dark',
  nightLight: false,
  scratchpad: '',
  streak: 1,
  lastCompletedDate: '',
  cloudDbUrl: '',
  cloudSyncKey: '',
  tasks: []
};

let selectedDate = getTodayISO();
let showAllDates = false;
let currentCategoryFilter = 'all';

// Modal içi geçici durumlar
let modalSubtasks = [];
let modalPhotos = [];
let modalAudios = [];
let completingTaskId = null;
let selectedCompletionEmoji = '✅';

// Ses Kaydedici (MediaRecorder)
let mediaRecorder = null;
let audioChunks = [];
let isRecordingAudio = false;

// Pomodoro Durumu
let pomoSeconds = 25 * 60;
let pomoInterval = null;
let pomoRunning = false;

// PWA Kurulum İstemcisi
let deferredInstallPrompt = null;

// ----------------------------------------------------------------------------
// 1. YARDIMCI TARİH VE SES FONKSİYONLARI
// ----------------------------------------------------------------------------
function getTodayISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - tzOffset).toISOString().split('T')[0];
}

// Web Audio API ile Harici Dosya Gerektirmeyen Şık Bildirim & Başarı Sesi
function playAlertTone(type = 'notify') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.18); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    }
  } catch (e) {
    console.warn('Ses çalınamadı:', e);
  }
}

// ----------------------------------------------------------------------------
// 2. INDEXEDDB ÇEVRİMDIŞI (OFFLINE) VERİTABANI MOTORU
// ----------------------------------------------------------------------------
function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => reject(e);
  });
}

async function loadProfileData(profileId) {
  if (!dbInstance) await initDB();
  return new Promise((resolve) => {
    const tx = dbInstance.transaction('profiles', 'readonly');
    const store = tx.objectStore('profiles');
    const req = store.get(profileId);
    req.onsuccess = () => {
      if (req.result && req.result.data) {
        appData = req.result.data;
      } else {
        // İlk kez açılıyorsa örnek başlangıç görevleri oluştur
        appData = createDefaultProfileData(profileId);
        saveProfileData();
      }
      resolve(appData);
    };
  });
}

async function saveProfileData(skipCloud = false) {
  if (!dbInstance) await initDB();
  return new Promise((resolve) => {
    const tx = dbInstance.transaction('profiles', 'readwrite');
    const store = tx.objectStore('profiles');
    appData.updatedAt = Date.now();
    store.put({ id: currentProfile, data: appData });
    tx.oncomplete = () => {
      if (!skipCloud) pushToCloudIfConfigured();
      resolve();
    };
  });
}

function createDefaultProfileData(profileId) {
  const today = getTodayISO();
  return {
    profileName: profileId === 'user1' ? 'Benim Hesabım' : 'Arkadaşım',
    pin: '',
    theme: 'dark',
    nightLight: false,
    scratchpad: '• Alışveriş listesi\n• Kitap önerileri\n• Hızlı notlarını buraya yazabilirsin...',
    streak: 1,
    lastCompletedDate: today,
    cloudDbUrl: '',
    cloudSyncKey: '',
    updatedAt: Date.now(),
    tasks: [
      {
        id: 't_' + Date.now() + '_1',
        title: 'TaskFlow Pro Uygulamasını Keşfet 🚀',
        desc: 'Sesle görev eklemeyi, fotoğraf sıkıştırmayı ve emojili arşivlemeyi dene.',
        date: today,
        time: '14:00',
        priority: 'high',
        category: 'İş & Proje',
        repeat: 'none',
        tags: ['#başlangıç', '#önemli'],
        subtasks: [
          { text: 'Şifreni belirle ve giriş yap', done: true },
          { text: 'Mikrofon butonuna basıp konuşarak görev ekle', done: false },
          { text: 'Görevi tamamlayıp 🔥 veya 💪 emojisi bırak', done: false }
        ],
        photos: [],
        audios: [],
        completed: false,
        completedAt: null,
        completionEmoji: '',
        completionComment: '',
        notified: false
      }
    ]
  };
}

// ----------------------------------------------------------------------------
// 3. ŞİFRE (PIN) VE ÇOKLU KULLANICI GİRİŞ SİSTEMİ
// ----------------------------------------------------------------------------
async function switchProfile(profId) {
  currentProfile = profId;
  localStorage.setItem('tf_active_profile', profId);
  document.getElementById('profTab1').classList.toggle('active', profId === 'user1');
  document.getElementById('profTab2').classList.toggle('active', profId === 'user2');
  enteredPin = '';
  updatePinDots();
  await loadProfileData(profId);
  updateLockScreenLabels();
}

function updateLockScreenLabels() {
  const hint = document.getElementById('pinHint');
  const sub = document.getElementById('lockSubtitle');
  if (!appData.pin) {
    sub.textContent = `${appData.profileName} için yeni 4 haneli PIN şifreni belirle`;
    hint.textContent = '✨ İlk kez giriş yapıyorsun: Belirleyeceğin 4 rakam şifren olacak.';
  } else {
    sub.textContent = `${appData.profileName} hesabına girmek için PIN şifreni gir`;
    hint.textContent = '';
  }
}

function pressPin(digit) {
  if (enteredPin.length >= 4) return;
  enteredPin += digit;
  updatePinDots();
  if (enteredPin.length === 4) {
    setTimeout(verifyOrSetPin, 140);
  }
}

function backspacePin() {
  enteredPin = enteredPin.slice(0, -1);
  updatePinDots();
}

function clearPin() {
  enteredPin = '';
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('dot' + i);
    if (dot) dot.classList.toggle('filled', i < enteredPin.length);
  }
}

async function verifyOrSetPin() {
  const hint = document.getElementById('pinHint');
  if (!appData.pin) {
    appData.pin = enteredPin;
    await saveProfileData();
    unlockApp();
  } else if (enteredPin === appData.pin) {
    unlockApp();
  } else {
    hint.style.color = '#ff4d4f';
    hint.textContent = '❌ Hatalı PIN şifresi! Tekrar dene.';
    enteredPin = '';
    updatePinDots();
  }
}

function unlockApp() {
  document.getElementById('lockScreen').classList.add('hidden');
  enteredPin = '';
  updatePinDots();
  applyUserPreferences();
  renderAll();
  pullFromCloudIfConfigured();
}

function lockApp() {
  enteredPin = '';
  updatePinDots();
  updateLockScreenLabels();
  document.getElementById('lockScreen').classList.remove('hidden');
}

// ----------------------------------------------------------------------------
// 4. TEMA, GECE IŞIĞI VE KİŞİSELLEŞTİRME (MADDE 11)
// ----------------------------------------------------------------------------
function applyUserPreferences() {
  document.body.setAttribute('data-theme', appData.theme || 'dark');
  document.body.classList.toggle('night-light', !!appData.nightLight);
  document.getElementById('themeSelect').value = appData.theme || 'dark';
  document.getElementById('settingUserName').value = appData.profileName || '';
  document.getElementById('settingUserPin').value = appData.pin || '';
  document.getElementById('welcomeUserText').textContent = `Merhaba, ${appData.profileName} 👋`;
  document.getElementById('scratchpadInput').value = appData.scratchpad || '';
  document.getElementById('cloudDbUrl').value = appData.cloudDbUrl || '';
  document.getElementById('cloudSyncKey').value = appData.cloudSyncKey || '';
  document.getElementById('streakBadge').textContent = `🔥 ${appData.streak || 1} Gün Seri`;
}

function changeTheme(newTheme) {
  appData.theme = newTheme;
  document.body.setAttribute('data-theme', newTheme);
  saveProfileData();
}

function toggleNightLight() {
  appData.nightLight = !appData.nightLight;
  document.body.classList.toggle('night-light', appData.nightLight);
  saveProfileData();
}

function saveUserSettings() {
  const nameVal = document.getElementById('settingUserName').value.trim();
  const pinVal = document.getElementById('settingUserPin').value.trim();
  if (nameVal) appData.profileName = nameVal;
  if (pinVal && pinVal.length === 4 && /^\d+$/.test(pinVal)) {
    appData.pin = pinVal;
  }
  applyUserPreferences();
  saveProfileData();
}

// Scratchpad Otomatik Kayıt
document.addEventListener('DOMContentLoaded', () => {
  const sp = document.getElementById('scratchpadInput');
  if (sp) {
    sp.addEventListener('input', () => {
      appData.scratchpad = sp.value;
      document.getElementById('scratchSavedLabel').textContent = 'Kaydedildi ✓';
      saveProfileData();
    });
  }
});

// ----------------------------------------------------------------------------
// 5. TAKVİM ŞERİDİ VE GÖREV LİSTELEME MOTORU (MADDE 1, 2, 3)
// ----------------------------------------------------------------------------
function renderDateStrip() {
  const strip = document.getElementById('dateStrip');
  strip.innerHTML = '';

  const baseDate = new Date(selectedDate + 'T00:00:00');
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

  document.getElementById('currentMonthLabel').textContent = `${monthNames[baseDate.getMonth()]} ${baseDate.getFullYear()}`;
  document.getElementById('customDatePicker').value = selectedDate;

  // Seçili günün -5 gün öncesinden +9 gün sonrasına kadar 15 günlük kaydırılabilir şerit
  for (let i = -4; i <= 10; i++) {
    const d = new Date(baseDate);
    d.setDate(baseDate.getDate() + i);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const iso = new Date(d - tzOffset).toISOString().split('T')[0];

    const hasTasks = appData.tasks.some((t) => !t.completed && t.date === iso);
    const pill = document.createElement('div');
    pill.className = `day-pill ${!showAllDates && iso === selectedDate ? 'active' : ''} ${hasTasks ? 'has-tasks' : ''}`;
    pill.onclick = () => {
      showAllDates = false;
      selectedDate = iso;
      renderAll();
    };
    pill.innerHTML = `
      <span class="day-name">${dayNames[d.getDay()]}</span>
      <span class="day-num">${d.getDate()}</span>
    `;
    strip.appendChild(pill);
  }
}

function jumpToToday() {
  showAllDates = false;
  selectedDate = getTodayISO();
  renderAll();
}

function selectDateFromPicker(val) {
  if (!val) return;
  showAllDates = false;
  selectedDate = val;
  renderAll();
}

function toggleShowAllDates() {
  showAllDates = !showAllDates;
  document.getElementById('toggleAllDatesBtn').textContent = showAllDates ? 'Sadece Seçili Gün' : 'Tüm Günler';
  renderAll();
}

function setCategoryFilter(cat) {
  currentCategoryFilter = cat;
  document.getElementById('filterAllCard').classList.toggle('active-filter', cat === 'all');
  document.getElementById('filterWorkCard').classList.toggle('active-filter', cat === 'İş & Proje');
  document.getElementById('filterPersonalCard').classList.toggle('active-filter', cat === 'Kişisel & Günlük');
  renderAll();
}

// Dünden Kalan Görevleri Kontrol Et ve Tek Tıkla Bugüne Devret
function checkOverdueTasks() {
  const today = getTodayISO();
  const overdue = appData.tasks.filter((t) => !t.completed && t.date < today);
  const banner = document.getElementById('rolloverBanner');
  if (overdue.length > 0) {
    banner.classList.remove('hidden');
    document.getElementById('rolloverCountText').textContent = `Geçmiş tarihli tamamlanmamış ${overdue.length} görevin var. Tek tıkla bugüne aktar!`;
  } else {
    banner.classList.add('hidden');
  }
}

function rolloverOverdueTasks() {
  const today = getTodayISO();
  appData.tasks.forEach((t) => {
    if (!t.completed && t.date < today) {
      t.date = today;
    }
  });
  saveProfileData();
  selectedDate = today;
  renderAll();
}

function renderAll() {
  renderDateStrip();
  checkOverdueTasks();
  updateBentoCounts();
  renderOngoingTasks();
  renderArchive();
  renderWeeklyReport();
}

function updateBentoCounts() {
  const active = appData.tasks.filter((t) => !t.completed);
  const urgentCount = active.filter((t) => t.priority === 'urgent').length;
  const workCount = active.filter((t) => t.category === 'İş & Proje').length;
  const personalCount = active.filter((t) => t.category === 'Kişisel & Günlük').length;

  document.getElementById('countAllTasks').textContent = `${active.length} Aktif Görev`;
  document.getElementById('countUrgentSub').textContent = `🚨 ${urgentCount} Acil • 📦 ${appData.tasks.filter(t => t.completed).length} Biten`;
  document.getElementById('countWorkTasks').textContent = `${workCount} Görev`;
  document.getElementById('countPersonalTasks').textContent = `${personalCount} Görev`;
}

function getPriorityWeight(p) {
  return { urgent: 4, high: 3, medium: 2, low: 1 }[p] || 1;
}

function getPriorityLabel(p) {
  return {
    urgent: '🚨 Acil',
    high: '🔥 Yüksek',
    medium: '⚡ Orta',
    low: '🌱 Düşük'
  }[p] || 'Normal';
}

function renderOngoingTasks() {
  const container = document.getElementById('ongoingTaskList');
  const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const prioFilter = document.getElementById('priorityFilterSelect').value;

  document.getElementById('activeListSubtitle').textContent = showAllDates ? 'Tüm Tarihler Gösteriliyor' : `Tarih: ${selectedDate}`;

  let list = appData.tasks.filter((t) => !t.completed);

  if (!showAllDates && !query) {
    list = list.filter((t) => t.date === selectedDate);
  }
  if (currentCategoryFilter !== 'all') {
    list = list.filter((t) => t.category === currentCategoryFilter);
  }
  if (prioFilter !== 'all') {
    list = list.filter((t) => t.priority === prioFilter);
  }
  if (query) {
    list = list.filter((t) =>
      t.title.toLowerCase().includes(query) ||
      (t.desc && t.desc.toLowerCase().includes(query)) ||
      (t.tags && t.tags.join(' ').toLowerCase().includes(query))
    );
  }

  // Aciliyet ve saate göre sırala
  list.sort((a, b) => {
    const pw = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (pw !== 0) return pw;
    return (a.time || '23:59').localeCompare(b.time || '23:59');
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div class="task-card" style="text-align:center;padding:34px 20px;color:var(--text-muted);">
        <div style="font-size:36px;margin-bottom:8px;">✨</div>
        <div style="font-weight:700;color:var(--text-main);">Bu görünümde bekleyen görev yok!</div>
        <div style="font-size:12px;margin-top:4px;">Alt menüdeki <b>+</b> butonuna basarak yeni görev veya sesli plan ekleyebilirsin.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((t) => buildTaskCardHTML(t, false)).join('');
}

function buildTaskCardHTML(t, isArchive) {
  const totalSubs = (t.subtasks || []).length;
  const doneSubs = (t.subtasks || []).filter((s) => s.done).length;
  const pct = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : (t.completed ? 100 : 0);

  const repeatBadge = t.repeat && t.repeat !== 'none'
    ? `<span class="tag-badge">🔄 ${{ daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' }[t.repeat]}</span>`
    : '';

  const tagsHTML = (t.tags || []).map((tg) => `<span class="tag-badge">${escapeHtml(tg)}</span>`).join('');

  const subtasksHTML = totalSubs > 0 ? `
    <div class="subtasks-box">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
      ${t.subtasks.map((s, idx) => `
        <div class="subtask-item ${s.done ? 'done' : ''}" onclick="toggleSubtask('${t.id}', ${idx})">
          <span>${s.done ? '☑️' : '⬜'}</span>
          <span>${escapeHtml(s.text)}</span>
        </div>
      `).join('')}
    </div>
  ` : '';

  const photosHTML = (t.photos || []).map((src) =>
    `<img src="${src}" class="att-thumb" onclick="openPhotoViewer('${src}')" title="Fotoğrafı Büyüt" />`
  ).join('');

  const audiosHTML = (t.audios || []).map((src) =>
    `<audio controls src="${src}" class="att-audio"></audio>`
  ).join('');

  const attachmentsSection = (photosHTML || audiosHTML)
    ? `<div class="attachments-row">${photosHTML}${audiosHTML}</div>`
    : '';

  const completionBox = t.completed ? `
    <div class="completion-note-box">
      <span class="completion-emoji-big">${t.completionEmoji || '✅'}</span>
      <div>
        <div style="font-weight:700;color:var(--accent-cream);">Tamamlama Notu:</div>
        <div>${escapeHtml(t.completionComment || 'Harika tamamlandı!')}</div>
      </div>
    </div>
  ` : '';

  return `
    <div class="task-card ${t.completed ? 'completed' : ''}">
      <div class="task-top">
        <div class="badge-group">
          <span class="prio-badge prio-${t.priority}">${getPriorityLabel(t.priority)}</span>
          <span class="tag-badge">${escapeHtml(t.category || 'Genel')}</span>
          ${repeatBadge}
          ${tagsHTML}
        </div>
        <span class="task-progress-pct">${totalSubs > 0 ? `%${pct}` : ''}</span>
      </div>

      <div class="task-main-row">
        <button class="check-circle" onclick="${t.completed ? `reopenTask('${t.id}')` : `openCompleteModal('${t.id}')`}" title="${t.completed ? 'Görevi Geri Aç' : 'Görevi Tamamla'}">
          ${t.completed ? '✓' : ''}
        </button>
        <div style="flex:1;">
          <div class="task-title">${escapeHtml(t.title)}</div>
          ${t.desc ? `<div class="task-desc">${escapeHtml(t.desc)}</div>` : ''}
        </div>
      </div>

      ${subtasksHTML}
      ${attachmentsSection}
      ${completionBox}

      <div class="task-meta">
        <div>
          📅 <b>${t.date}</b> ${t.time ? `• ⏰ <b>${t.time}</b>` : ''}
        </div>
        <div style="display:flex;gap:8px;">
          ${!isArchive ? `<button class="tag-badge" style="cursor:pointer;border:none;" onclick="focusTaskInPomodoro('${t.id}')">⏱️ Odaklan</button>` : ''}
          <button class="tag-badge" style="cursor:pointer;border:none;" onclick="openTaskModal('${t.id}')">✏️ Düzenle</button>
          <button class="tag-badge" style="cursor:pointer;border:none;color:#ff7875;" onclick="deleteTask('${t.id}')">🗑️ Sil</button>
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------------------
// 6. ALT GÖREV İLERLEMESİ, TAMAMLAMA, EMOJİ & ARŞİV SİSTEMİ (MADDE 3, 4, 15)
// ----------------------------------------------------------------------------
function toggleSubtask(taskId, subIdx) {
  const t = appData.tasks.find((x) => x.id === taskId);
  if (!t || !t.subtasks[subIdx]) return;
  t.subtasks[subIdx].done = !t.subtasks[subIdx].done;
  saveProfileData();
  renderAll();
}

function openCompleteModal(taskId) {
  completingTaskId = taskId;
  selectedCompletionEmoji = '✅';
  document.getElementById('completionCommentInput').value = '';
  document.querySelectorAll('#emojiPickerBar .emoji-choice').forEach((btn, i) => {
    btn.classList.toggle('selected', i === 0);
  });
  document.getElementById('completeModal').classList.remove('hidden');
}

function closeCompleteModal() {
  completingTaskId = null;
  document.getElementById('completeModal').classList.add('hidden');
}

function selectCompletionEmoji(btnEl, emoji) {
  selectedCompletionEmoji = emoji;
  document.querySelectorAll('#emojiPickerBar .emoji-choice').forEach((b) => b.classList.remove('selected'));
  btnEl.classList.add('selected');
}

function confirmTaskCompletion() {
  const t = appData.tasks.find((x) => x.id === completingTaskId);
  if (!t) return;

  t.completed = true;
  t.completedAt = new Date().toISOString();
  t.completionEmoji = selectedCompletionEmoji;
  t.completionComment = document.getElementById('completionCommentInput').value.trim();

  // Eğer tekrarlayan (rutin) bir görevse bir sonraki tarihi otomatik oluştur!
  if (t.repeat && t.repeat !== 'none') {
    const nextDate = new Date(t.date + 'T00:00:00');
    if (t.repeat === 'daily') nextDate.setDate(nextDate.getDate() + 1);
    if (t.repeat === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
    if (t.repeat === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
    const tzOffset = nextDate.getTimezoneOffset() * 60000;
    const nextIso = new Date(nextDate - tzOffset).toISOString().split('T')[0];

    appData.tasks.push({
      ...JSON.parse(JSON.stringify(t)),
      id: 't_' + Date.now() + '_rep',
      date: nextIso,
      completed: false,
      completedAt: null,
      completionEmoji: '',
      completionComment: '',
      subtasks: (t.subtasks || []).map((s) => ({ text: s.text, done: false })),
      notified: false
    });
  }

  // Günlük Seri (Streak) Güncelle
  const today = getTodayISO();
  if (appData.lastCompletedDate !== today) {
    appData.streak = (appData.streak || 1) + 1;
    appData.lastCompletedDate = today;
  }

  playAlertTone('success');
  closeCompleteModal();
  saveProfileData();
  applyUserPreferences();
  renderAll();
}

function reopenTask(taskId) {
  const t = appData.tasks.find((x) => x.id === taskId);
  if (!t) return;
  t.completed = false;
  saveProfileData();
  renderAll();
}

function deleteTask(taskId) {
  if (!confirm('Bu görevi kalıcı olarak silmek istediğine emin misin?')) return;
  appData.tasks = appData.tasks.filter((x) => x.id !== taskId);
  saveProfileData();
  renderAll();
}

function renderArchive() {
  const container = document.getElementById('archiveTaskList');
  const sortMode = document.getElementById('archiveSortSelect').value;
  const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  let doneList = appData.tasks.filter((t) => t.completed);

  if (query) {
    doneList = doneList.filter((t) =>
      t.title.toLowerCase().includes(query) ||
      (t.completionComment && t.completionComment.toLowerCase().includes(query)) ||
      (t.completionEmoji && t.completionEmoji.includes(query)) ||
      (t.tags && t.tags.join(' ').toLowerCase().includes(query))
    );
  }

  doneList.sort((a, b) => {
    if (sortMode === 'priority') return getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (sortMode === 'emoji') return (a.completionEmoji || '').localeCompare(b.completionEmoji || '');
    return (b.completedAt || b.date).localeCompare(a.completedAt || a.date);
  });

  if (doneList.length === 0) {
    container.innerHTML = `<div class="task-card" style="text-align:center;color:var(--text-muted);padding:30px;">Henüz arşivlenmiş görev yok.</div>`;
    return;
  }

  container.innerHTML = doneList.map((t) => buildTaskCardHTML(t, true)).join('');
}

// ----------------------------------------------------------------------------
// 7. GÖREV EKLEME/DÜZENLEME, 10X FOTOĞRAF SIKIŞTIRMA VE SES KAYDI (MADDE 5, 6, 16)
// ----------------------------------------------------------------------------
function openTaskModal(taskId = null) {
  const modal = document.getElementById('taskModal');
  document.getElementById('editTaskId').value = taskId || '';

  if (taskId) {
    const t = appData.tasks.find((x) => x.id === taskId);
    if (!t) return;
    document.getElementById('modalTitle').textContent = 'Görevi Düzenle';
    document.getElementById('taskTitleInput').value = t.title;
    document.getElementById('taskDateInput').value = t.date;
    document.getElementById('taskTimeInput').value = t.time || '';
    document.getElementById('taskPriorityInput').value = t.priority || 'medium';
    document.getElementById('taskCategoryInput').value = t.category || 'İş & Proje';
    document.getElementById('taskRepeatInput').value = t.repeat || 'none';
    document.getElementById('taskTagsInput').value = (t.tags || []).join(' ');
    document.getElementById('taskDescInput').value = t.desc || '';
    modalSubtasks = JSON.parse(JSON.stringify(t.subtasks || []));
    modalPhotos = [...(t.photos || [])];
    modalAudios = [...(t.audios || [])];
  } else {
    document.getElementById('modalTitle').textContent = 'Yeni Görev Planla';
    document.getElementById('taskTitleInput').value = '';
    document.getElementById('taskDateInput').value = selectedDate;
    document.getElementById('taskTimeInput').value = '';
    document.getElementById('taskPriorityInput').value = 'medium';
    document.getElementById('taskCategoryInput').value = currentCategoryFilter !== 'all' ? currentCategoryFilter : 'İş & Proje';
    document.getElementById('taskRepeatInput').value = 'none';
    document.getElementById('taskTagsInput').value = '';
    document.getElementById('taskDescInput').value = '';
    modalSubtasks = [];
    modalPhotos = [];
    modalAudios = [];
  }

  renderModalSubtasks();
  renderModalAttachments();
  modal.classList.remove('hidden');
}

function closeTaskModal() {
  document.getElementById('taskModal').classList.add('hidden');
}

function addSubtaskInModal() {
  const inp = document.getElementById('subtaskNewInput');
  const val = inp.value.trim();
  if (!val) return;
  modalSubtasks.push({ text: val, done: false });
  inp.value = '';
  renderModalSubtasks();
}

function renderModalSubtasks() {
  const box = document.getElementById('modalSubtaskList');
  box.innerHTML = modalSubtasks.map((s, idx) => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-main);padding:6px 10px;border-radius:10px;font-size:13px;">
      <span>• ${escapeHtml(s.text)}</span>
      <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;" onclick="modalSubtasks.splice(${idx},1);renderModalSubtasks();">Sil</button>
    </div>
  `).join('');
}

// Otomatik 10 Kat Fotoğraf Küçültme Motoru (Canvas WebP/JPEG Sıkıştırma - Madde 16)
function handlePhotoUpload(event) {
  const files = Array.from(event.target.files || []);
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 900; // Yüksek netlik ama 10x küçük boyut (~60-85 KB)
        let w = img.width;
        let h = img.height;
        if (w > h && w > MAX_DIM) {
          h = Math.round((h * MAX_DIM) / w);
          w = MAX_DIM;
        } else if (h > MAX_DIM) {
          w = Math.round((w * MAX_DIM) / h);
          h = MAX_DIM;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.72);
        modalPhotos.push(compressedDataUrl);
        renderModalAttachments();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Sesli Mesaj Kaydı (Düşük Bitrate Sıkıştırmalı - Madde 6 & 16)
async function toggleAudioRecording() {
  const btn = document.getElementById('recordAudioBtn');
  if (!isRecordingAudio) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
      audioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          modalAudios.push(reader.result);
          renderModalAttachments();
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((tr) => tr.stop());
      };
      mediaRecorder.start();
      isRecordingAudio = true;
      btn.classList.add('voice-btn-recording');
      btn.textContent = '⏹️ Kaydı Bitir';
    } catch (err) {
      alert('Mikrofon izni alınamadı: ' + err.message);
    }
  } else {
    mediaRecorder.stop();
    isRecordingAudio = false;
    btn.classList.remove('voice-btn-recording');
    btn.textContent = '🎤 Sesli Mesaj Kaydet';
  }
}

function renderModalAttachments() {
  const prev = document.getElementById('modalAttachmentsPreview');
  const pHTML = modalPhotos.map((src, i) => `
    <div style="position:relative;">
      <img src="${src}" class="att-thumb" />
      <button type="button" onclick="modalPhotos.splice(${i},1);renderModalAttachments();" style="position:absolute;top:-6px;right:-6px;background:#ff4d4f;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer;font-size:11px;">✕</button>
    </div>
  `).join('');

  const aHTML = modalAudios.map((src, i) => `
    <div style="display:flex;align-items:center;gap:4px;">
      <audio controls src="${src}" class="att-audio"></audio>
      <button type="button" onclick="modalAudios.splice(${i},1);renderModalAttachments();" style="background:#ff4d4f;color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;">✕</button>
    </div>
  `).join('');

  prev.innerHTML = pHTML + aHTML;
}

function saveTaskFromModal() {
  const title = document.getElementById('taskTitleInput').value.trim();
  if (!title) {
    alert('Lütfen bir görev başlığı girin!');
    return;
  }

  const editId = document.getElementById('editTaskId').value;
  const dateVal = document.getElementById('taskDateInput').value || getTodayISO();
  const timeVal = document.getElementById('taskTimeInput').value || '';
  const prioVal = document.getElementById('taskPriorityInput').value;
  const catVal = document.getElementById('taskCategoryInput').value;
  const repVal = document.getElementById('taskRepeatInput').value;
  const tagsRaw = document.getElementById('taskTagsInput').value.trim();
  const tagsArr = tagsRaw ? tagsRaw.split(/\s+/).map((t) => (t.startsWith('#') ? t : '#' + t)) : [];
  const descVal = document.getElementById('taskDescInput').value.trim();

  if (editId) {
    const t = appData.tasks.find((x) => x.id === editId);
    if (t) {
      t.title = title;
      t.date = dateVal;
      t.time = timeVal;
      t.priority = prioVal;
      t.category = catVal;
      t.repeat = repVal;
      t.tags = tagsArr;
      t.desc = descVal;
      t.subtasks = modalSubtasks;
      t.photos = modalPhotos;
      t.audios = modalAudios;
      t.notified = false;
    }
  } else {
    appData.tasks.push({
      id: 't_' + Date.now(),
      title,
      desc: descVal,
      date: dateVal,
      time: timeVal,
      priority: prioVal,
      category: catVal,
      repeat: repVal,
      tags: tagsArr,
      subtasks: modalSubtasks,
      photos: modalPhotos,
      audios: modalAudios,
      completed: false,
      completedAt: null,
      completionEmoji: '',
      completionComment: '',
      notified: false
    });
  }

  selectedDate = dateVal;
  closeTaskModal();
  saveProfileData();
  renderAll();
}

function openPhotoViewer(src) {
  document.getElementById('photoViewerImg').src = src;
  document.getElementById('photoViewerModal').classList.remove('hidden');
}

// ----------------------------------------------------------------------------
// 8. TÜRKÇE SESLE KONUŞARAK GÖREV YAZDIRMA VE AKILLI TARİH/SAAT ÇÖZÜMLEME (MADDE 14)
// ----------------------------------------------------------------------------
function startTurkishSpeechToText() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Tarayıcınız sesle yazdırma özelliğini desteklemiyor (Chrome veya Edge önerilir).');
    return;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'tr-TR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  const btn = document.getElementById('voiceDictateBtn');
  const hint = document.getElementById('speechStatusHint');
  btn.classList.add('voice-btn-recording');
  btn.textContent = '🛑 Dinleniyor...';
  hint.style.display = 'block';

  rec.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById('taskTitleInput').value = transcript;

    // Akıllı Türkçe Tarih, Saat ve Aciliyet Algılayıcı
    const lower = transcript.toLowerCase();
    if (lower.includes('yarın')) {
      const tmr = new Date();
      tmr.setDate(tmr.getDate() + 1);
      const tzOffset = tmr.getTimezoneOffset() * 60000;
      document.getElementById('taskDateInput').value = new Date(tmr - tzOffset).toISOString().split('T')[0];
    }
    if (lower.includes('acil') || lower.includes('çok önemli')) {
      document.getElementById('taskPriorityInput').value = 'urgent';
    }
    const timeMatch = lower.match(/(\d{1,2})[:.](\d{2})/);
    if (timeMatch) {
      const hh = timeMatch[1].padStart(2, '0');
      const mm = timeMatch[2];
      document.getElementById('taskTimeInput').value = `${hh}:${mm}`;
    }
  };

  rec.onend = () => {
    btn.classList.remove('voice-btn-recording');
    btn.textContent = '🎙️ Konuş';
    hint.style.display = 'none';
  };

  rec.onerror = () => {
    btn.classList.remove('voice-btn-recording');
    btn.textContent = '🎙️ Konuş';
    hint.style.display = 'none';
  };

  rec.start();
}

// ----------------------------------------------------------------------------
// 9. HAFTALIK MOTİVASYON KARNESİ & POMODORO SAYACI (MADDE 17, 19)
// ----------------------------------------------------------------------------
function renderWeeklyReport() {
  const doneTasks = appData.tasks.filter((t) => t.completed);
  const emojiCounts = { '✅': 0, '👍': 0, '💪': 0, '🔥': 0, '😊': 0, '🙁': 0, '😢': 0 };

  doneTasks.forEach((t) => {
    const em = t.completionEmoji || '✅';
    emojiCounts[em] = (emojiCounts[em] || 0) + 1;
  });

  let topEmoji = '🔥';
  let maxCount = 0;
  for (const [em, cnt] of Object.entries(emojiCounts)) {
    if (cnt > maxCount) {
      maxCount = cnt;
      topEmoji = em;
    }
  }

  const summaryEl = document.getElementById('weeklyMotivationSummary');
  if (doneTasks.length === 0) {
    summaryEl.textContent = 'Henüz görev tamamlamadın. İlk görevini bitirip emoji bıraktığında karnen burada parlayacak!';
  } else {
    summaryEl.textContent = `Toplam ${doneTasks.length} görev tamamladın! En çok ${topEmoji} (${maxCount} kez) emojisi bıraktın. Harika gidiyorsun!`;
  }

  const grid = document.getElementById('emojiStatsGrid');
  grid.innerHTML = Object.entries(emojiCounts).map(([em, cnt]) => `
    <div style="background:var(--bg-surface);padding:14px;border-radius:16px;text-align:center;">
      <div style="font-size:28px;">${em}</div>
      <div style="font-size:18px;font-weight:800;margin-top:4px;">${cnt}</div>
      <div style="font-size:11px;color:var(--text-muted);">Görev</div>
    </div>
  `).join('');
}

function focusTaskInPomodoro(taskId) {
  const t = appData.tasks.find((x) => x.id === taskId);
  if (t) {
    document.getElementById('pomoActiveTaskName').textContent = `🎯 Odaklanılan Görev: ${t.title}`;
  }
  switchView('stats');
}

function startPomodoro() {
  if (pomoRunning) {
    clearInterval(pomoInterval);
    pomoRunning = false;
    document.getElementById('pomoStateText').textContent = 'Duraklatıldı';
    return;
  }
  pomoRunning = true;
  document.getElementById('pomoStateText').textContent = '🔥 Odaklanma Sürüyor...';
  pomoInterval = setInterval(() => {
    if (pomoSeconds > 0) {
      pomoSeconds--;
      updatePomoDisplay();
    } else {
      clearInterval(pomoInterval);
      pomoRunning = false;
      document.getElementById('pomoStateText').textContent = '🎉 Süre Tamamlandı!';
      playAlertTone('notify');
      sendSystemNotification('⏱️ Pomodoro Tamamlandı!', 'Harika odaklandın, şimdi kısa bir mola zamanı.');
    }
  }, 1000);
}

function resetPomodoro(mins) {
  clearInterval(pomoInterval);
  pomoRunning = false;
  pomoSeconds = mins * 60;
  document.getElementById('pomoStateText').textContent = `${mins} Dakika Hazır`;
  updatePomoDisplay();
}

function updatePomoDisplay() {
  const m = String(Math.floor(pomoSeconds / 60)).padStart(2, '0');
  const s = String(pomoSeconds % 60).padStart(2, '0');
  document.getElementById('pomoTimerDisplay').textContent = `${m}:${s}`;
}

// ----------------------------------------------------------------------------
// 10. BİLDİRİM VE SESLİ ALARM MOTORU (MADDE 7)
// ----------------------------------------------------------------------------
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Cihazınız tarayıcı bildirimlerini desteklemiyor ama uygulama içi sesli uyarı aktiftir!');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    playAlertTone('success');
    sendSystemNotification('🔔 Bildirimler Aktif!', 'Görev saatin geldiğinde hem sesli hem de ekran bildirimi alacaksın.');
  }
}

function sendSystemNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icon-192.png' });
  }
}

// Her 25 saniyede bir saati gelen görevleri kontrol et
setInterval(() => {
  const today = getTodayISO();
  const now = new Date();
  const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  appData.tasks.forEach((t) => {
    if (!t.completed && !t.notified && t.date === today && t.time === currentHHMM) {
      t.notified = true;
      playAlertTone('notify');
      sendSystemNotification(`⏰ Görev Zamanı: ${t.title}`, t.desc || 'Planladığın görevin saati geldi!');
      saveProfileData();
    }
  });
}, 25000);

// ----------------------------------------------------------------------------
// 11. TEK TIKLA YEDEK İNDİRME VE ÜCRETSİZ CANLI BULUT SENKRONİZASYONU (MADDE 8, 9, 18)
// ----------------------------------------------------------------------------
function exportFullBackup() {
  const dataStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TaskFlow_Yedek_${currentProfile}_${getTodayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importFullBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && Array.isArray(imported.tasks)) {
        appData = imported;
        await saveProfileData();
        applyUserPreferences();
        renderAll();
        alert('✅ Yedek başarıyla geri yüklendi!');
      }
    } catch (err) {
      alert('Geçersiz yedek dosyası!');
    }
  };
  reader.readAsText(file);
}

async function saveCloudConfigAndSync() {
  appData.cloudDbUrl = document.getElementById('cloudDbUrl').value.trim().replace(/\/$/, '');
  appData.cloudSyncKey = document.getElementById('cloudSyncKey').value.trim();
  await saveProfileData(true);
  await pullFromCloudIfConfigured();
  await pushToCloudIfConfigured();
}

async function pushToCloudIfConfigured() {
  if (!appData.cloudDbUrl || !appData.cloudSyncKey || !navigator.onLine) return;
  try {
    const endpoint = `${appData.cloudDbUrl}/taskflow/${encodeURIComponent(appData.cloudSyncKey)}.json`;
    await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appData)
    });
    document.getElementById('cloudSyncStatusText').textContent = '☁️ Bulut ile eşitlendi (' + new Date().toLocaleTimeString() + ')';
  } catch (e) {
    console.warn('Bulut yazma hatası:', e);
  }
}

async function pullFromCloudIfConfigured() {
  if (!appData.cloudDbUrl || !appData.cloudSyncKey || !navigator.onLine) return;
  try {
    const endpoint = `${appData.cloudDbUrl}/taskflow/${encodeURIComponent(appData.cloudSyncKey)}.json`;
    const res = await fetch(endpoint);
    if (res.ok) {
      const remoteData = await res.json();
      if (remoteData && remoteData.updatedAt && remoteData.updatedAt > (appData.updatedAt || 0)) {
        appData = remoteData;
        await saveProfileData(true);
        applyUserPreferences();
        renderAll();
      }
      document.getElementById('cloudSyncStatusText').textContent = '☁️ Senkronize edildi ✓';
    }
  } catch (e) {
    console.warn('Bulut okuma hatası:', e);
  }
}

window.addEventListener('online', () => {
  document.getElementById('syncStatusDot').classList.remove('offline');
  pullFromCloudIfConfigured();
  pushToCloudIfConfigured();
});

window.addEventListener('offline', () => {
  document.getElementById('syncStatusDot').classList.add('offline');
});

// ----------------------------------------------------------------------------
// 12. ALT MENÜ GEZİNTİSİ VE PWA KURULUMU
// ----------------------------------------------------------------------------
function switchView(viewName) {
  document.getElementById('viewTasks').style.display = viewName === 'tasks' ? 'block' : 'none';
  document.getElementById('viewArchive').style.display = viewName === 'archive' ? 'block' : 'none';
  document.getElementById('viewStats').style.display = viewName === 'stats' ? 'block' : 'none';
  document.getElementById('viewSettings').style.display = viewName === 'settings' ? 'block' : 'none';

  document.getElementById('navTasks').classList.toggle('active', viewName === 'tasks');
  document.getElementById('navArchive').classList.toggle('active', viewName === 'archive');
  document.getElementById('navStats').classList.toggle('active', viewName === 'stats');
  document.getElementById('navSettings').classList.toggle('active', viewName === 'settings');

  renderAll();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installAppBtn').style.display = 'flex';
});

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installAppBtn').style.display = 'none';
}

// Başlangıç Yüklemesi
window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  await switchProfile(currentProfile);
});
