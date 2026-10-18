// ============================================================================
// TASKFLOW+ v9.0 ULTIMATE EDITION
// - 4 Ana Kategori: İş & Proje | Rutin İşler | Spor ve Sağlık | Kişisel Gelişim
// - Apayrı 🎯 HEDEFLER Sayfası (Uzun Soluklu, Deadline Olmayan Vizyon & Kilometre Taşları)
// - 📊 Günlük İlerleme Halkası (%75 Tamamlandı - 3/4 Görev)
// - 💧 Günlük Su & Alışkanlık Takipçisi (0 / 8 Bardak)
// - 🗓️ Aylık Tam Takvim (30 Günlük Grid) Görünümü + Yatay Gün Şeridi
// - 📍 Görevlere Google Maps Konumu / GPS ve 🔗 Web Linki Ekleme
// - 📱 Android Geri Tuşu Koruması + Tam Kutu Tıklanabilir Tarih/Saat + Canlı Alarm
// ============================================================================

const DB_NAME = 'TaskFlowProDB';
const DB_VERSION = 2;
let dbInstance = null;

let currentProfile = localStorage.getItem('tf_logged_in_user') || '';
let currentViewName = 'tasks';

let appData = {
  username: '',
  email: '',
  password: '',
  profileName: '',
  theme: 'dark',
  nightLight: false,
  scratchpad: '',
  streak: 1,
  lastCompletedDate: '',
  waterDate: '',
  waterCount: 0,
  cloudDbUrl: '',
  cloudSyncKey: '',
  tasks: [],
  goals: []
};

let selectedDate = getTodayISO();
let showAllDates = false;
let showMonthGrid = false;
let currentCalendarMonth = new Date();
let currentCategoryFilter = 'all';

let modalSubtasks = [];
let modalPhotos = [];
let modalAudios = [];
let modalGoalSteps = [];
let completingTaskId = null;
let selectedCompletionEmoji = '✅';

let mediaRecorder = null;
let audioChunks = [];
let isRecordingAudio = false;

let activeSpeechRec = null;
let isSpeechListening = false;

let activeAlarmTaskId = null;
let alarmLoopTimer = null;

let pomoSeconds = 25 * 60;
let pomoInterval = null;
let pomoRunning = false;

let deferredInstallPrompt = null;
let verifiedForgotProfileId = null;

// ----------------------------------------------------------------------------
// 1. ANDROID GERİ TUŞU KORUMASI VE TAM KUTU TARİH/SAAT SEÇİCİ
// ----------------------------------------------------------------------------
function pushAppHistoryState() {
  try {
    history.pushState({ taskflow: true, view: currentViewName }, '');
  } catch (e) {}
}

window.addEventListener('popstate', () => {
  const taskModal = document.getElementById('taskModal');
  const goalModal = document.getElementById('goalModal');
  const completeModal = document.getElementById('completeModal');
  const photoModal = document.getElementById('photoViewerModal');
  const alarmModal = document.getElementById('liveAlarmModal');

  if (alarmModal && !alarmModal.classList.contains('hidden')) {
    dismissLiveAlarm(false);
    pushAppHistoryState();
    return;
  }
  if (photoModal && !photoModal.classList.contains('hidden')) {
    photoModal.classList.add('hidden');
    pushAppHistoryState();
    return;
  }
  if (completeModal && !completeModal.classList.contains('hidden')) {
    closeCompleteModal();
    pushAppHistoryState();
    return;
  }
  if (goalModal && !goalModal.classList.contains('hidden')) {
    closeGoalModal();
    pushAppHistoryState();
    return;
  }
  if (taskModal && !taskModal.classList.contains('hidden')) {
    closeTaskModal();
    pushAppHistoryState();
    return;
  }

  if (currentViewName !== 'tasks') {
    switchView('tasks', true);
    pushAppHistoryState();
    return;
  }

  if (currentCategoryFilter !== 'all' || showAllDates || showMonthGrid) {
    showAllDates = false;
    showMonthGrid = false;
    document.getElementById('monthGridContainer').style.display = 'none';
    setCategoryFilter('all');
    pushAppHistoryState();
    return;
  }

  pushAppHistoryState();
});

function openNativePicker(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  try {
    if (typeof inp.showPicker === 'function') {
      inp.showPicker();
    } else {
      inp.focus();
      inp.click();
    }
  } catch (e) {
    inp.focus();
  }
}

function setQuickDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const tzOffset = d.getTimezoneOffset() * 60000;
  const iso = new Date(d - tzOffset).toISOString().split('T')[0];
  document.getElementById('taskDateInput').value = iso;
}

function setQuickTime(val) {
  if (val === '+1h') {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    document.getElementById('taskTimeInput').value = `${hh}:${mm}`;
  } else {
    document.getElementById('taskTimeInput').value = val;
  }
}

function selectCategoryPill(catVal) {
  document.getElementById('taskCategoryInput').value = catVal;
  document.querySelectorAll('#categoryPillsContainer .choice-pill').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-val') === catVal);
  });
}

function selectPriorityPill(prioVal) {
  document.getElementById('taskPriorityInput').value = prioVal;
  document.querySelectorAll('#priorityPillsContainer .choice-pill').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-val') === prioVal);
  });
}

// ----------------------------------------------------------------------------
// 2. YARDIMCI TARİH, SU TAKİBİ VE SES FONKSİYONLARI
// ----------------------------------------------------------------------------
function getTodayISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - tzOffset).toISOString().split('T')[0];
}

function checkAndRenderWaterTracker() {
  const today = getTodayISO();
  if (appData.waterDate !== today) {
    appData.waterDate = today;
    appData.waterCount = 0;
  }
  const cnt = appData.waterCount || 0;
  document.getElementById('waterCountText').textContent = `${cnt} / 8 Bardak`;
  let drops = '';
  for (let i = 0; i < 8; i++) {
    drops += i < cnt ? '💧' : '⚪';
  }
  if (cnt > 8) drops += ` +${cnt - 8}💧`;
  document.getElementById('waterDropsDisplay').textContent = drops;
}

function changeWaterCount(delta) {
  const today = getTodayISO();
  if (appData.waterDate !== today) {
    appData.waterDate = today;
    appData.waterCount = 0;
  }
  appData.waterCount = Math.max(0, (appData.waterCount || 0) + delta);
  if (delta > 0 && appData.waterCount === 8) {
    playAlertTone('success');
  }
  checkAndRenderWaterTracker();
  saveProfileData();
}

function playAlertTone(type = 'notify') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    }
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// 3. INDEXEDDB ÇEVRİMDIŞI VERİTABANI VE KULLANICI KAYIT DEPOSU
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

async function getAllUsersFromDB() {
  if (!dbInstance) await initDB();
  return new Promise((resolve) => {
    const tx = dbInstance.transaction('profiles', 'readonly');
    const store = tx.objectStore('profiles');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
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
        if (!Array.isArray(appData.goals)) {
          appData.goals = createDefaultGoals();
        }
        // Eski kategori isimlerini yeni 4 başlığa uyarla
        (appData.tasks || []).forEach((t) => {
          if (t.category === 'Kişisel & Günlük') t.category = 'Rutin İşler';
          if (t.category === 'Spor & Sağlık') t.category = 'Spor ve Sağlık';
        });
        resolve(appData);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

async function saveProfileData(skipCloud = false) {
  if (!currentProfile) return;
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

function createDefaultGoals() {
  return [
    {
      id: 'g_' + Date.now() + '_1',
      title: 'İngilizce Seviyesini İleri Düzeye (C1) Çıkar 🌍',
      category: 'Kişisel Gelişim',
      desc: 'Her gün düzenli kelime ve konuşma pratiği yaparak akıcı konuşma hedefine ulaşmak.',
      progress: 35,
      achieved: false,
      steps: [
        { text: 'B2 kelime listesini tamamla', done: true },
        { text: 'Haftada 3 gün yabancı dizi/makale çalışması yap', done: false },
        { text: '20 saat konuşma pratiği tamamla', done: false }
      ]
    },
    {
      id: 'g_' + Date.now() + '_2',
      title: 'Fit ve Sağlıklı Vücut Formuna Ulaş 🏋️',
      category: 'Spor ve Sağlık',
      desc: 'Düzenli antrenman, günlük 8 bardak su ve temiz beslenme ile formda kalmak.',
      progress: 50,
      achieved: false,
      steps: [
        { text: 'İlk 1 aylık antrenman serisini aksatmadan bitir', done: true },
        { text: 'Şeker ve paketli gıdaları minimuma indir', done: false }
      ]
    }
  ];
}

function createNewUserProfileData(username, email, password) {
  const today = getTodayISO();
  return {
    username: username.toLowerCase(),
    email: email.toLowerCase(),
    password: password,
    profileName: username,
    theme: 'dark',
    nightLight: false,
    scratchpad: '• Antrenman programı\n• Alışveriş listesi\n• Hızlı notlarını buraya yazabilirsin...',
    streak: 1,
    lastCompletedDate: today,
    waterDate: today,
    waterCount: 2,
    cloudDbUrl: '',
    cloudSyncKey: 'taskflow_' + username.toLowerCase(),
    updatedAt: Date.now(),
    tasks: [
      {
        id: 't_' + Date.now() + '_1',
        title: 'TaskFlow+ v9.0 Yaşam & Hedef Üssünü Keşfet 🚀',
        desc: 'Yeni Hedefler sekmesini, Aylık Takvim görünümünü, Su takipçisini ve Harita/Link özelliğini dene.',
        date: today,
        time: '',
        pinned: true,
        alarmEnabled: true,
        alarmSound: 'system',
        priority: 'high',
        category: 'İş & Proje',
        repeat: 'none',
        location: '',
        link: '',
        tags: ['#başlangıç', '#hedefler'],
        subtasks: [
          { text: 'Alttaki 🎯 Hedefler sekmesine tıklayıp uzun soluklu hedeflerine bak', done: false },
          { text: '💧 Su takipçisinden +1 bardak su ekle', done: false },
          { text: '🗓️ Aylık Takvim butonuna basıp 30 günlük görünümü aç', done: false }
        ],
        photos: [],
        audios: [],
        completed: false,
        completedAt: null,
        completionEmoji: '',
        completionComment: '',
        notified: false
      }
    ],
    goals: createDefaultGoals()
  };
}

// ----------------------------------------------------------------------------
// 4. KULLANICI GİRİŞİ, KAYIT OLMA VE GARANTİLİ ŞİFRE KURTARMA
// ----------------------------------------------------------------------------
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  const forgotForm = document.getElementById('forgotForm');
  const tabsBar = document.getElementById('authTabsBar');
  const subtitle = document.getElementById('authSubtitle');

  document.getElementById('loginErrorMsg').textContent = '';
  document.getElementById('regErrorMsg').textContent = '';
  document.getElementById('forgotStatusMsg').innerHTML = '';
  verifiedForgotProfileId = null;
  document.getElementById('forgotNewPassGroup').style.display = 'none';
  document.getElementById('forgotSubmitBtn').textContent = '🔍 Hesabımı Doğrula & Şifreyi Kurtar';

  if (tab === 'login') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    forgotForm.style.display = 'none';
    tabsBar.style.display = 'flex';
    document.getElementById('tabLoginBtn').classList.add('active');
    document.getElementById('tabRegisterBtn').classList.remove('active');
    subtitle.textContent = 'Kullanıcı adın ve şifrenle hesabına giriş yap';
  } else if (tab === 'register') {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    forgotForm.style.display = 'none';
    tabsBar.style.display = 'flex';
    document.getElementById('tabLoginBtn').classList.remove('active');
    document.getElementById('tabRegisterBtn').classList.add('active');
    subtitle.textContent = 'Yeni kişisel görev hesabını saniyeler içinde oluştur';
  } else if (tab === 'forgot') {
    loginForm.style.display = 'none';
    regForm.style.display = 'none';
    forgotForm.style.display = 'block';
    tabsBar.style.display = 'none';
    subtitle.textContent = 'Kayıtlı e-posta adresinle şifreni anında kurtar veya yenile';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const rawUser = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  const errEl = document.getElementById('regErrorMsg');

  if (rawUser.length < 2) {
    errEl.textContent = '❌ Kullanıcı adı en az 2 karakter olmalıdır.';
    return;
  }

  const cleanUsername = rawUser.toLowerCase().replace(/\s+/g, '');
  const profileId = 'user_' + cleanUsername;

  const allRecords = await getAllUsersFromDB();
  const exists = allRecords.find(
    (r) =>
      r.id === profileId ||
      (r.data && r.data.username && r.data.username.toLowerCase() === cleanUsername) ||
      (r.data && r.data.email && r.data.email.toLowerCase() === email)
  );

  if (exists) {
    errEl.textContent = '❌ Bu kullanıcı adı veya e-posta zaten kayıtlı! Giriş yapabilirsin.';
    return;
  }

  currentProfile = profileId;
  appData = createNewUserProfileData(rawUser, email, password);
  await saveProfileData();

  localStorage.setItem('tf_logged_in_user', currentProfile);
  unlockApp();
}

async function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('loginUsername').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const remember = document.getElementById('rememberMeCheck').checked;
  const errEl = document.getElementById('loginErrorMsg');

  const allRecords = await getAllUsersFromDB();

  if (allRecords.length === 0) {
    errEl.textContent = 'ℹ️ Henüz kayıtlı hesap yok. Lütfen üstten "✨ Kayıt Ol" sekmesine geçerek ilk hesabını oluştur.';
    return;
  }

  const matched = allRecords.find((r) => {
    const d = r.data || {};
    const uMatch = (d.username && d.username.toLowerCase() === identifier) ||
                   (d.profileName && d.profileName.toLowerCase() === identifier) ||
                   r.id === 'user_' + identifier;
    const eMatch = d.email && d.email.toLowerCase() === identifier;
    return uMatch || eMatch;
  });

  if (!matched) {
    errEl.textContent = '❌ Bu kullanıcı adı veya e-posta bulunamadı! "Kayıt Ol" sekmesinden oluşturabilirsin.';
    return;
  }

  const userPass = matched.data.password || matched.data.pin || '';
  if (userPass !== password) {
    errEl.textContent = '❌ Şifre hatalı! Unuttuysan "Şifremi Unuttum?" bağlantısına tıkla.';
    return;
  }

  currentProfile = matched.id;
  await loadProfileData(currentProfile);
  if (remember) {
    localStorage.setItem('tf_logged_in_user', currentProfile);
  } else {
    localStorage.removeItem('tf_logged_in_user');
  }

  unlockApp();
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const emailVal = document.getElementById('forgotEmailInput').value.trim().toLowerCase();
  const newPassInput = document.getElementById('forgotNewPassInput');
  const statusEl = document.getElementById('forgotStatusMsg');
  const submitBtn = document.getElementById('forgotSubmitBtn');

  if (verifiedForgotProfileId) {
    const newPass = newPassInput.value;
    if (!newPass || newPass.length < 4) {
      statusEl.style.color = '#ff4d4f';
      statusEl.textContent = '❌ Lütfen en az 4 karakterli yeni bir şifre girin.';
      return;
    }
    const record = await loadProfileData(verifiedForgotProfileId);
    if (record) {
      currentProfile = verifiedForgotProfileId;
      appData = record;
      appData.password = newPass;
      await saveProfileData();
      localStorage.setItem('tf_logged_in_user', currentProfile);
      alert('✅ Yeni şifreniz başarıyla kaydedildi! Hesabınıza giriş yapılıyor...');
      unlockApp();
      return;
    }
  }

  const allRecords = await getAllUsersFromDB();
  const matched = allRecords.find((r) => {
    const d = r.data || {};
    return d.email && d.email.toLowerCase() === emailVal;
  });

  if (!matched) {
    statusEl.style.color = '#ff4d4f';
    statusEl.textContent = '❌ Bu e-posta adresine kayıtlı bir hesap bulunamadı!';
    return;
  }

  verifiedForgotProfileId = matched.id;
  const userName = matched.data.profileName || matched.data.username;
  const currentPass = matched.data.password || matched.data.pin || '';

  document.getElementById('forgotNewPassGroup').style.display = 'block';
  newPassInput.value = currentPass;
  newPassInput.focus();

  statusEl.style.color = '#52c41a';
  statusEl.innerHTML = `
    ✅ <b>${escapeHtml(userName)}</b> hesabın doğrulandı!<br>
    🔑 Mevcut Şifren: <b style="color:#fff;background:var(--bg-surface);padding:2px 8px;border-radius:6px;">${escapeHtml(currentPass)}</b><br>
    <span style="color:var(--text-muted);font-size:11px;">Aşağıdan yeni şifreni belirleyip hemen giriş yapabilirsin.</span>
  `;
  submitBtn.textContent = '💾 Yeni Şifreyi Kaydet ve Giriş Yap →';
}

function unlockApp() {
  document.getElementById('lockScreen').classList.add('hidden');
  applyUserPreferences();
  renderAll();
  pushAppHistoryState();
  pullFromCloudIfConfigured();
}

function logoutUser() {
  localStorage.removeItem('tf_logged_in_user');
  currentProfile = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('lockScreen').classList.remove('hidden');
  switchAuthTab('login');
}

// ----------------------------------------------------------------------------
// 5. TEMA, GECE IŞIĞI VE KULLANICI HESAP AYARLARI
// ----------------------------------------------------------------------------
function applyUserPreferences() {
  document.body.setAttribute('data-theme', appData.theme || 'dark');
  document.body.classList.toggle('night-light', !!appData.nightLight);
  document.getElementById('themeSelect').value = appData.theme || 'dark';

  const displayName = appData.profileName || appData.username || 'Kullanıcı';
  document.getElementById('settingUserName').value = displayName;
  document.getElementById('settingUserEmail').value = appData.email || '';
  document.getElementById('settingUserPassword').value = '';
  document.getElementById('welcomeUserText').textContent = `Merhaba, ${displayName} 👋`;
  document.getElementById('headerAvatarLetter').textContent = displayName.charAt(0).toUpperCase();

  document.getElementById('scratchpadInput').value = appData.scratchpad || '';
  document.getElementById('cloudDbUrl').value = appData.cloudDbUrl || '';
  document.getElementById('cloudSyncKey').value = appData.cloudSyncKey || ('taskflow_' + (appData.username || 'user'));
  document.getElementById('streakBadge').textContent = `🔥 ${appData.streak || 1} Gün Seri`;
  checkAndRenderWaterTracker();
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

async function saveUserSettings() {
  const nameVal = document.getElementById('settingUserName').value.trim();
  const emailVal = document.getElementById('settingUserEmail').value.trim().toLowerCase();
  const passVal = document.getElementById('settingUserPassword').value;

  if (nameVal) appData.profileName = nameVal;
  if (emailVal) appData.email = emailVal;
  if (passVal && passVal.length >= 4) {
    appData.password = passVal;
  }
  await saveProfileData();
  applyUserPreferences();
  alert('✅ Hesap bilgileriniz güncellendi!');
}

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
// 6. YATAY GÜN ŞERİDİ & 30 GÜNLÜK TAM AYLIK TAKVİM (GRID) MOTORU
// ----------------------------------------------------------------------------
function renderDateStrip() {
  const strip = document.getElementById('dateStrip');
  strip.innerHTML = '';

  const baseDate = new Date(selectedDate + 'T00:00:00');
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

  document.getElementById('currentMonthLabel').textContent = `${monthNames[baseDate.getMonth()]} ${baseDate.getFullYear()}`;

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

function toggleMonthGridView() {
  showMonthGrid = !showMonthGrid;
  const gridBox = document.getElementById('monthGridContainer');
  const stripBox = document.getElementById('dateStrip');
  const btn = document.getElementById('toggleMonthGridBtn');

  if (showMonthGrid) {
    currentCalendarMonth = new Date(selectedDate + 'T00:00:00');
    gridBox.style.display = 'block';
    stripBox.style.display = 'none';
    btn.style.background = 'var(--accent-cream)';
    btn.style.color = '#14141b';
    renderMonthGrid();
  } else {
    gridBox.style.display = 'none';
    stripBox.style.display = 'flex';
    btn.style.background = 'var(--bg-surface)';
    btn.style.color = 'var(--text-main)';
  }
}

function changeCalendarMonth(delta) {
  currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + delta);
  renderMonthGrid();
}

function renderMonthGrid() {
  const container = document.getElementById('monthGridDays');
  if (!container) return;
  container.innerHTML = '';

  const year = currentCalendarMonth.getFullYear();
  const month = currentCalendarMonth.getMonth();
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  document.getElementById('gridMonthTitle').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // Pazartesi = 0 ... Pazar = 6
  let startOffset = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < startOffset; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'grid-day-cell empty';
    container.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month, day);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const iso = new Date(d - tzOffset).toISOString().split('T')[0];

    const hasTasks = appData.tasks.some((t) => !t.completed && t.date === iso);
    const cell = document.createElement('div');
    cell.className = `grid-day-cell ${!showAllDates && iso === selectedDate ? 'active' : ''} ${hasTasks ? 'has-tasks' : ''}`;
    cell.textContent = day;
    cell.onclick = () => {
      showAllDates = false;
      selectedDate = iso;
      renderAll();
    };
    container.appendChild(cell);
  }
}

function jumpToToday() {
  showAllDates = false;
  selectedDate = getTodayISO();
  currentCalendarMonth = new Date();
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
  document.getElementById('filterRoutineCard').classList.toggle('active-filter', cat === 'Rutin İşler');
  document.getElementById('filterSportCard').classList.toggle('active-filter', cat === 'Spor ve Sağlık');
  document.getElementById('filterGrowthCard').classList.toggle('active-filter', cat === 'Kişisel Gelişim');
  if (currentViewName !== 'tasks' && currentViewName !== 'goals') {
    switchView('tasks');
  } else {
    renderAll();
  }
}

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
      t.notified = false;
    }
  });
  saveProfileData();
  selectedDate = today;
  renderAll();
}

function renderAll() {
  if (!appData || !Array.isArray(appData.tasks)) return;
  renderDateStrip();
  if (showMonthGrid) renderMonthGrid();
  checkOverdueTasks();
  checkAndRenderWaterTracker();
  updateBentoCountsAndDailyProgress();
  renderOngoingTasks();
  renderGoals();
  renderArchive();
  renderWeeklyReport();
}

// Günlük İlerleme Halkası (%75 Tamamlandı - 3/4 Görev) ve 4 Kategori Sayacı
function updateBentoCountsAndDailyProgress() {
  const active = appData.tasks.filter((t) => !t.completed);
  const workCount = active.filter((t) => t.category === 'İş & Proje').length;
  const routineCount = active.filter((t) => t.category === 'Rutin İşler').length;
  const sportCount = active.filter((t) => t.category === 'Spor ve Sağlık').length;
  const growthCount = active.filter((t) => t.category === 'Kişisel Gelişim').length;

  document.getElementById('countAllTasks').textContent = `${active.length} Aktif Görev`;
  document.getElementById('countWorkTasks').textContent = `${workCount} Görev`;
  document.getElementById('countRoutineTasks').textContent = `${routineCount} Görev`;
  document.getElementById('countSportTasks').textContent = `${sportCount} Görev`;
  document.getElementById('countGrowthTasks').textContent = `${growthCount} Görev`;

  const dayTasks = appData.tasks.filter((t) => t.date === selectedDate);
  const dayDone = dayTasks.filter((t) => t.completed).length;
  const dayTotal = dayTasks.length;
  const pct = dayTotal > 0 ? Math.round((dayDone / dayTotal) * 100) : 0;

  const isToday = selectedDate === getTodayISO();
  const dayPrefix = isToday ? 'Bugün' : selectedDate;
  document.getElementById('dailyProgressLabel').textContent = `${dayPrefix} %${pct} Tamamlandı`;
  document.getElementById('dailyProgressSub').textContent = `${dayDone} / ${dayTotal} Görev Bitti`;
  document.getElementById('dailyProgressPct').textContent = `%${pct}`;
  document.getElementById('dailyProgressFill').style.width = `${pct}%`;
  document.getElementById('dailyRingCircle').style.background = `conic-gradient(var(--accent-cream) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
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

function getCategoryIcon(cat) {
  if (cat === 'Spor ve Sağlık') return '🏋️';
  if (cat === 'Kişisel Gelişim') return '📚';
  if (cat === 'Rutin İşler') return '🔄';
  return '💡';
}

function renderOngoingTasks() {
  const container = document.getElementById('ongoingTaskList');
  const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const prioFilter = document.getElementById('priorityFilterSelect').value;

  document.getElementById('activeListSubtitle').textContent = showAllDates ? 'Tüm Tarihler' : `Tarih: ${selectedDate}`;

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
      (t.location && t.location.toLowerCase().includes(query)) ||
      (t.tags && t.tags.join(' ').toLowerCase().includes(query))
    );
  }

  list.sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    const pw = getPriorityWeight(b.priority) - getPriorityWeight(a.priority);
    if (pw !== 0) return pw;
    return (a.time || '23:59').localeCompare(b.time || '23:59');
  });

  if (list.length === 0) {
    container.innerHTML = `
      <div class="task-card" style="text-align:center;padding:30px 18px;color:var(--text-muted);">
        <div style="font-size:32px;margin-bottom:6px;">✨</div>
        <div style="font-weight:700;color:var(--text-main);">Bu görünümde bekleyen görev yok!</div>
        <div style="font-size:12px;margin-top:4px;">Alt menüdeki <b>+</b> butonuna basarak yeni görev, konum veya plan ekleyebilirsin.</div>
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

  const pinBadge = t.pinned ? `<span class="tag-badge" style="color:var(--accent-cream);">⭐ Sabit</span>` : '';
  const repeatBadge = t.repeat && t.repeat !== 'none'
    ? `<span class="tag-badge">🔄 ${{ daily: 'Günlük', weekly: 'Haftalık', monthly: 'Aylık' }[t.repeat]}</span>`
    : '';

  const tagsHTML = (t.tags || []).map((tg) => `<span class="tag-badge">${escapeHtml(tg)}</span>`).join('');

  // Google Maps Konum ve Web Linki Rozetleri
  let mapBadgeHTML = '';
  if (t.location) {
    const mapUrl = t.location.startsWith('http')
      ? t.location
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}`;
    mapBadgeHTML = `<a href="${mapUrl}" target="_blank" rel="noopener" class="tag-badge map-link-badge">🗺️ Haritada Aç (${escapeHtml(t.location)})</a>`;
  }

  let webBadgeHTML = '';
  if (t.link) {
    const cleanUrl = t.link.startsWith('http') ? t.link : `https://${t.link}`;
    webBadgeHTML = `<a href="${cleanUrl}" target="_blank" rel="noopener" class="tag-badge web-link-badge">🔗 Bağlantıyı Aç</a>`;
  }

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

  const alarmIcon = t.time ? (t.alarmEnabled !== false ? '🔔' : '🔕') : '';

  return `
    <div class="task-card ${t.completed ? 'completed' : ''} ${t.pinned && !t.completed ? 'pinned-task' : ''}">
      <div class="task-top">
        <div class="badge-group">
          ${pinBadge}
          <span class="prio-badge prio-${t.priority}">${getPriorityLabel(t.priority)}</span>
          <span class="tag-badge">${getCategoryIcon(t.category)} ${escapeHtml(t.category || 'İş & Proje')}</span>
          ${repeatBadge}
          ${tagsHTML}
          ${mapBadgeHTML}
          ${webBadgeHTML}
        </div>
        <span class="task-progress-pct">${totalSubs > 0 ? `%${pct}` : ''}</span>
      </div>

      <div class="task-main-row">
        <button class="check-circle" onclick="${t.completed ? `reopenTask('${t.id}')` : `openCompleteModal('${t.id}')`}" title="${t.completed ? 'Görevi Geri Aç' : 'Görevi Tamamla'}">
          ${t.completed ? '✓' : ''}
        </button>
        <div style="flex:1;min-width:0;">
          <div class="task-title">${escapeHtml(t.title)}</div>
          ${t.desc ? `<div class="task-desc">${escapeHtml(t.desc)}</div>` : ''}
        </div>
      </div>

      ${subtasksHTML}
      ${attachmentsSection}
      ${completionBox}

      <div class="task-meta">
        <div>
          📅 <b>${t.date}</b> ${t.time ? `• ${alarmIcon} <b>${t.time}</b>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${!isArchive ? `<button class="tag-badge" style="cursor:pointer;border:none;" onclick="togglePinTask('${t.id}')" title="Üste Sabitle">⭐</button>` : ''}
          ${!isArchive ? `<button class="tag-badge" style="cursor:pointer;border:none;" onclick="focusTaskInPomodoro('${t.id}')">⏱️ Odak</button>` : ''}
          <button class="tag-badge" style="cursor:pointer;border:none;" onclick="openTaskModal('${t.id}')">✏️ Düzenle</button>
          <button class="tag-badge" style="cursor:pointer;border:none;color:#ff7875;" onclick="deleteTask('${t.id}')">🗑️ Sil</button>
        </div>
      </div>
    </div>
  `;
}

function togglePinTask(taskId) {
  const t = appData.tasks.find((x) => x.id === taskId);
  if (!t) return;
  t.pinned = !t.pinned;
  saveProfileData();
  renderAll();
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
// 7. 🎯 UZUN SOLUKLU HEDEFLER (GOALS) SİSTEMİ (DEADLINE OLMAYAN VİZYON SAYFASI)
// ----------------------------------------------------------------------------
function handleFabClick() {
  if (currentViewName === 'goals') {
    openGoalModal();
  } else {
    openTaskModal();
  }
}

function renderGoals() {
  const container = document.getElementById('goalsListContainer');
  if (!container) return;
  const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();

  let list = appData.goals || [];
  if (currentCategoryFilter !== 'all') {
    list = list.filter((g) => g.category === currentCategoryFilter);
  }
  if (query) {
    list = list.filter((g) =>
      g.title.toLowerCase().includes(query) ||
      (g.desc && g.desc.toLowerCase().includes(query))
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="task-card" style="text-align:center;padding:32px 18px;color:var(--text-muted);">
        <div style="font-size:36px;margin-bottom:8px;">🎯</div>
        <div style="font-weight:800;color:var(--text-main);">Henüz uzun soluklu bir hedef eklemedin!</div>
        <div style="font-size:12px;margin-top:4px;">Üstteki <b>+ Yeni Hedef Ekle</b> veya alttaki <b>+</b> butonuna basarak ilk büyük hedefini belirle.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map((g) => {
    const totalSteps = (g.steps || []).length;
    const doneSteps = (g.steps || []).filter((s) => s.done).length;
    const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : (g.progress || 0);
    const isAchieved = pct >= 100 || g.achieved;

    const stepsHTML = totalSteps > 0 ? `
      <div class="subtasks-box" style="margin-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">🏁 KİLOMETRE TAŞLARI (${doneSteps}/${totalSteps})</div>
        ${g.steps.map((s, idx) => `
          <div class="subtask-item ${s.done ? 'done' : ''}" onclick="toggleGoalStep('${g.id}', ${idx})">
            <span>${s.done ? '✅' : '⬜'}</span>
            <span>${escapeHtml(s.text)}</span>
          </div>
        `).join('')}
      </div>
    ` : '';

    return `
      <div class="goal-card ${isAchieved ? 'achieved' : ''}">
        <div class="task-top">
          <div class="badge-group">
            <span class="tag-badge" style="background:rgba(216,208,248,0.2);color:var(--pastel-purple);">${getCategoryIcon(g.category)} ${escapeHtml(g.category)}</span>
            <span class="tag-badge">♾️ Uzun Soluklu Hedef</span>
            ${isAchieved ? `<span class="prio-badge prio-low">🏆 Hedefe Ulaşıldı!</span>` : ''}
          </div>
          <span style="font-size:15px;font-weight:900;color:var(--accent-cream);">%${pct}</span>
        </div>

        <div style="font-size:17px;font-weight:800;margin-top:4px;">${escapeHtml(g.title)}</div>
        ${g.desc ? `<div style="font-size:12.5px;color:var(--text-muted);margin-top:4px;">${escapeHtml(g.desc)}</div>` : ''}

        <div style="margin-top:12px;">
          <div class="progress-bar-track" style="height:8px;">
            <div class="progress-bar-fill" style="width:${pct}%;background:${isAchieved ? '#52c41a' : 'var(--pastel-purple)'};"></div>
          </div>
          ${totalSteps === 0 ? `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
              <span style="font-size:11px;color:var(--text-muted);">İlerlemeyi Kaydırarak Güncelle:</span>
              <input type="range" min="0" max="100" step="5" value="${pct}" style="width:140px;accent-color:var(--accent-cream);" onchange="updateGoalProgressSlider('${g.id}', this.value)" />
            </div>
          ` : ''}
        </div>

        ${stepsHTML}

        <div class="task-meta">
          <div style="display:flex;gap:6px;">
            <button class="tag-badge" style="cursor:pointer;border:none;color:#95de64;" onclick="adjustGoalProgress('${g.id}', 10)">+10% İlerle</button>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="tag-badge" style="cursor:pointer;border:none;" onclick="openGoalModal('${g.id}')">✏️ Düzenle</button>
            <button class="tag-badge" style="cursor:pointer;border:none;color:#ff7875;" onclick="deleteGoal('${g.id}')">🗑️ Sil</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openGoalModal(goalId = null) {
  const modal = document.getElementById('goalModal');
  document.getElementById('editGoalId').value = goalId || '';

  if (goalId) {
    const g = (appData.goals || []).find((x) => x.id === goalId);
    if (!g) return;
    document.getElementById('goalModalTitle').textContent = '✏️ Hedefi Düzenle';
    document.getElementById('goalTitleInput').value = g.title;
    document.getElementById('goalCategoryInput').value = g.category || 'Kişisel Gelişim';
    document.getElementById('goalProgressInput').value = g.progress || 0;
    document.getElementById('goalDescInput').value = g.desc || '';
    modalGoalSteps = JSON.parse(JSON.stringify(g.steps || []));
  } else {
    document.getElementById('goalModalTitle').textContent = '🎯 Uzun Soluklu Hedef Belirle';
    document.getElementById('goalTitleInput').value = '';
    document.getElementById('goalCategoryInput').value = currentCategoryFilter !== 'all' ? currentCategoryFilter : 'Kişisel Gelişim';
    document.getElementById('goalProgressInput').value = 0;
    document.getElementById('goalDescInput').value = '';
    modalGoalSteps = [];
  }

  renderModalGoalSteps();
  modal.classList.remove('hidden');
  pushAppHistoryState();
}

function closeGoalModal() {
  document.getElementById('goalModal').classList.add('hidden');
}

function addGoalStepInModal() {
  const inp = document.getElementById('goalStepNewInput');
  const val = inp.value.trim();
  if (!val) return;
  modalGoalSteps.push({ text: val, done: false });
  inp.value = '';
  renderModalGoalSteps();
}

function renderModalGoalSteps() {
  const box = document.getElementById('modalGoalStepList');
  box.innerHTML = modalGoalSteps.map((s, idx) => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-main);padding:6px 10px;border-radius:10px;font-size:13px;">
      <span>🏁 ${escapeHtml(s.text)}</span>
      <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;" onclick="modalGoalSteps.splice(${idx},1);renderModalGoalSteps();">Sil</button>
    </div>
  `).join('');
}

function saveGoalFromModal() {
  const title = document.getElementById('goalTitleInput').value.trim();
  if (!title) {
    alert('Lütfen bir hedef başlığı girin!');
    return;
  }
  const editId = document.getElementById('editGoalId').value;
  const category = document.getElementById('goalCategoryInput').value;
  const progress = Math.min(100, Math.max(0, parseInt(document.getElementById('goalProgressInput').value || '0', 10)));
  const desc = document.getElementById('goalDescInput').value.trim();

  if (!Array.isArray(appData.goals)) appData.goals = [];

  if (editId) {
    const g = appData.goals.find((x) => x.id === editId);
    if (g) {
      g.title = title;
      g.category = category;
      g.progress = progress;
      g.desc = desc;
      g.steps = modalGoalSteps;
      g.achieved = progress >= 100;
    }
  } else {
    appData.goals.unshift({
      id: 'g_' + Date.now(),
      title,
      category,
      progress,
      desc,
      steps: modalGoalSteps,
      achieved: progress >= 100
    });
  }

  closeGoalModal();
  saveProfileData();
  switchView('goals');
}

function toggleGoalStep(goalId, stepIdx) {
  const g = (appData.goals || []).find((x) => x.id === goalId);
  if (!g || !g.steps[stepIdx]) return;
  g.steps[stepIdx].done = !g.steps[stepIdx].done;
  const total = g.steps.length;
  const done = g.steps.filter((s) => s.done).length;
  g.progress = Math.round((done / total) * 100);
  if (g.progress >= 100) {
    g.achieved = true;
    playAlertTone('success');
  } else {
    g.achieved = false;
  }
  saveProfileData();
  renderGoals();
}

function updateGoalProgressSlider(goalId, val) {
  const g = (appData.goals || []).find((x) => x.id === goalId);
  if (!g) return;
  g.progress = parseInt(val, 10);
  g.achieved = g.progress >= 100;
  if (g.achieved) playAlertTone('success');
  saveProfileData();
  renderGoals();
}

function adjustGoalProgress(goalId, delta) {
  const g = (appData.goals || []).find((x) => x.id === goalId);
  if (!g) return;
  g.progress = Math.min(100, Math.max(0, (g.progress || 0) + delta));
  g.achieved = g.progress >= 100;
  if (g.achieved) playAlertTone('success');
  saveProfileData();
  renderGoals();
}

function deleteGoal(goalId) {
  if (!confirm('Bu hedefi silmek istediğine emin misin?')) return;
  appData.goals = (appData.goals || []).filter((x) => x.id !== goalId);
  saveProfileData();
  renderGoals();
}

// ----------------------------------------------------------------------------
// 8. ALT GÖREV İLERLEMESİ, TAMAMLAMA, EMOJİ & ARŞİV SİSTEMİ
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
  pushAppHistoryState();
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
  t.notified = false;
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
// 9. GÖREV EKLEME/DÜZENLEME, GPS HARİTA KONUMU, FOTOĞRAF VE SES KAYDI
// ----------------------------------------------------------------------------
function detectCurrentGPSLocation() {
  if (!navigator.geolocation) {
    alert('Cihazınız konum özelliğini desteklemiyor.');
    return;
  }
  const locInput = document.getElementById('taskLocationInput');
  locInput.value = '⏳ Konum alınıyor...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude.toFixed(5);
      const lng = pos.coords.longitude.toFixed(5);
      locInput.value = `https://www.google.com/maps?q=${lat},${lng}`;
    },
    () => {
      locInput.value = '';
      alert('GPS konum izni alınamadı. Mekan adını doğrudan yazabilirsiniz (Örn: Kadıköy).');
    }
  );
}

function openTaskModal(taskId = null) {
  stopActiveSpeechRecognition();
  const modal = document.getElementById('taskModal');
  document.getElementById('editTaskId').value = taskId || '';
  const statusEl = document.getElementById('photoUploadStatus');
  if (statusEl) statusEl.textContent = '';

  if (taskId) {
    const t = appData.tasks.find((x) => x.id === taskId);
    if (!t) return;
    document.getElementById('modalTitle').textContent = '✏️ Görevi Düzenle';
    document.getElementById('taskTitleInput').value = t.title;
    document.getElementById('taskPinnedInput').checked = !!t.pinned;
    document.getElementById('taskDateInput').value = t.date;
    document.getElementById('taskTimeInput').value = t.time || '';
    document.getElementById('taskLocationInput').value = t.location || '';
    document.getElementById('taskLinkInput').value = t.link || '';
    document.getElementById('taskAlarmSound').value = t.alarmEnabled === false ? 'off' : (t.alarmSound || 'system');
    selectPriorityPill(t.priority || 'medium');
    selectCategoryPill(t.category || 'İş & Proje');
    document.getElementById('taskRepeatInput').value = t.repeat || 'none';
    document.getElementById('taskTagsInput').value = (t.tags || []).join(' ');
    document.getElementById('taskDescInput').value = t.desc || '';
    modalSubtasks = JSON.parse(JSON.stringify(t.subtasks || []));
    modalPhotos = [...(t.photos || [])];
    modalAudios = [...(t.audios || [])];
  } else {
    document.getElementById('modalTitle').textContent = '✨ Yeni Görev Planla';
    document.getElementById('taskTitleInput').value = '';
    document.getElementById('taskPinnedInput').checked = false;
    document.getElementById('taskDateInput').value = selectedDate;
    document.getElementById('taskTimeInput').value = '';
    document.getElementById('taskLocationInput').value = '';
    document.getElementById('taskLinkInput').value = '';
    document.getElementById('taskAlarmSound').value = 'system';
    selectPriorityPill('medium');
    selectCategoryPill(currentCategoryFilter !== 'all' ? currentCategoryFilter : 'İş & Proje');
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
  pushAppHistoryState();
}

function closeTaskModal() {
  stopActiveSpeechRecognition();
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

function handlePhotoUpload(event) {
  const inputEl = event.target;
  const files = Array.from(inputEl.files || []);
  const statusEl = document.getElementById('photoUploadStatus');
  if (files.length === 0) return;

  if (statusEl) statusEl.textContent = `⏳ ${files.length} fotoğraf optimize ediliyor...`;

  let processed = 0;
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 900;
          let w = img.width || 800;
          let h = img.height || 600;
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
        } catch (err) {
          modalPhotos.push(dataUrl);
        }
        processed++;
        renderModalAttachments();
        if (statusEl && processed === files.length) {
          statusEl.textContent = `✅ ${modalPhotos.length} fotoğraf eklendi (10x küçültüldü)`;
        }
      };
      img.onerror = () => {
        modalPhotos.push(dataUrl);
        processed++;
        renderModalAttachments();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });

  inputEl.value = '';
}

async function toggleAudioRecording() {
  const btn = document.getElementById('recordAudioBtn');
  if (!isRecordingAudio) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
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
      btn.textContent = '⏹️ Bitir';
    } catch (err) {
      alert('Mikrofon izni alınamadı: ' + err.message);
    }
  } else {
    mediaRecorder.stop();
    isRecordingAudio = false;
    btn.classList.remove('voice-btn-recording');
    btn.textContent = '🎤 Ses Kaydı';
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
  stopActiveSpeechRecognition();
  const title = document.getElementById('taskTitleInput').value.trim();
  if (!title) {
    alert('Lütfen bir görev başlığı girin!');
    return;
  }

  const editId = document.getElementById('editTaskId').value;
  const pinned = document.getElementById('taskPinnedInput').checked;
  const dateVal = document.getElementById('taskDateInput').value || getTodayISO();
  const timeVal = document.getElementById('taskTimeInput').value || '';
  const locationVal = document.getElementById('taskLocationInput').value.trim();
  const linkVal = document.getElementById('taskLinkInput').value.trim();
  const soundChoice = document.getElementById('taskAlarmSound').value || 'system';
  const alarmEnabled = soundChoice !== 'off';
  const alarmSound = soundChoice === 'off' ? 'system' : soundChoice;
  const prioVal = document.getElementById('taskPriorityInput').value;
  const catVal = document.getElementById('taskCategoryInput').value;
  const repVal = document.getElementById('taskRepeatInput').value;
  const tagsRaw = document.getElementById('taskTagsInput').value.trim();
  const tagsArr = tagsRaw ? tagsRaw.split(/\s+/).map((t) => (t.startsWith('#') ? t : '#' + t)) : [];
  const descVal = document.getElementById('taskDescInput').value.trim();

  if (alarmEnabled && timeVal && 'Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }

  if (editId) {
    const t = appData.tasks.find((x) => x.id === editId);
    if (t) {
      t.title = title;
      t.pinned = pinned;
      t.date = dateVal;
      t.time = timeVal;
      t.location = locationVal;
      t.link = linkVal;
      t.alarmEnabled = alarmEnabled;
      t.alarmSound = alarmSound;
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
      pinned,
      desc: descVal,
      date: dateVal,
      time: timeVal,
      location: locationVal,
      link: linkVal,
      alarmEnabled,
      alarmSound,
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
  pushAppHistoryState();
}

function closePhotoViewer() {
  document.getElementById('photoViewerModal').classList.add('hidden');
}

// ----------------------------------------------------------------------------
// 10. KUSURSUZ TÜRKÇE SESLE KONUŞARAK YAZDIRMA MOTORU
// ----------------------------------------------------------------------------
function stopActiveSpeechRecognition() {
  if (activeSpeechRec) {
    try {
      activeSpeechRec.onend = null;
      activeSpeechRec.onerror = null;
      activeSpeechRec.stop();
    } catch (e) {}
    activeSpeechRec = null;
  }
  isSpeechListening = false;
  const titleBtn = document.getElementById('voiceDictateBtn');
  const descBtn = document.getElementById('voiceDescBtn');
  const hint = document.getElementById('speechStatusHint');
  if (titleBtn) {
    titleBtn.classList.remove('voice-btn-recording');
    titleBtn.textContent = '🎙️ Konuş';
  }
  if (descBtn) {
    descBtn.classList.remove('voice-btn-recording');
  }
  if (hint) hint.style.display = 'none';
}

function toggleTurkishSpeechToText(targetField = 'title') {
  if (isSpeechListening) {
    stopActiveSpeechRecognition();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert('Cihazınız doğrudan sesle yazdırmayı desteklemiyor. Klavyenizdeki mikrofon simgesini kullanabilirsiniz.');
    return;
  }

  const inputEl = targetField === 'desc'
    ? document.getElementById('taskDescInput')
    : document.getElementById('taskTitleInput');
  const btn = targetField === 'desc'
    ? document.getElementById('voiceDescBtn')
    : document.getElementById('voiceDictateBtn');
  const hint = document.getElementById('speechStatusHint');

  const initialText = inputEl.value ? inputEl.value.trim() + ' ' : '';

  try {
    const rec = new SpeechRecognition();
    activeSpeechRec = rec;
    rec.lang = 'tr-TR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    isSpeechListening = true;
    btn.classList.add('voice-btn-recording');
    if (targetField === 'title') btn.textContent = '⏹️ Durdur';
    hint.style.display = 'block';
    hint.style.color = 'var(--accent-cream)';
    hint.textContent = '🎙️ Dinliyorum... Türkçe konuşabilirsin';

    rec.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += piece;
        } else {
          interimTranscript += piece;
        }
      }

      const combined = (initialText + finalTranscript + interimTranscript).trim();
      inputEl.value = combined;

      const lower = combined.toLowerCase();
      if (lower.includes('yarın')) setQuickDate(1);
      if (lower.includes('acil') || lower.includes('çok önemli')) selectPriorityPill('urgent');
      if (lower.includes('spor') || lower.includes('antrenman') || lower.includes('koşu') || lower.includes('fitness')) {
        selectCategoryPill('Spor ve Sağlık');
      } else if (lower.includes('kitap') || lower.includes('eğitim') || lower.includes('kurs') || lower.includes('ders')) {
        selectCategoryPill('Kişisel Gelişim');
      } else if (lower.includes('rutin') || lower.includes('market') || lower.includes('temizlik')) {
        selectCategoryPill('Rutin İşler');
      }
      const timeMatch = lower.match(/(\d{1,2})[:.](\d{2})/);
      if (timeMatch) {
        const hh = timeMatch[1].padStart(2, '0');
        const mm = timeMatch[2];
        document.getElementById('taskTimeInput').value = `${hh}:${mm}`;
      }
    };

    rec.onerror = () => {
      setTimeout(stopActiveSpeechRecognition, 1200);
    };

    rec.onend = () => {
      stopActiveSpeechRecognition();
    };

    rec.start();
  } catch (err) {
    stopActiveSpeechRecognition();
  }
}

// ----------------------------------------------------------------------------
// 11. HAFTALIK MOTİVASYON KARNESİ & POMODORO SAYACI
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
      sendSystemNotification('⏱️ Pomodoro Tamamlandı!', 'Harika odaklandın, şimdi kısa bir mola zamanı.', 'system');
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
// 12. CANLI ÇALAN TAM EKRAN ALARM + SİSTEM BİLDİRİM KANALI MOTORU
// ----------------------------------------------------------------------------
function previewSelectedAlarm(soundType) {
  if (soundType === 'off') return;
  if (soundType === 'system') {
    sendSystemNotification('🔔 Bildirim Sesi Testi', 'Görev saati geldiğinde telefonunun kendi bildirim sesiyle böyle görünecek!', 'system');
  } else {
    playCustomTone(soundType);
  }
}

function playCustomTone(soundType) {
  if (soundType === 'system' || soundType === 'off') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (soundType === 'classic') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(0, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    } else if (soundType === 'melody') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.18);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.36);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
      osc.start();
      osc.stop(ctx.currentTime + 0.75);
    } else if (soundType === 'urgent') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1100, ctx.currentTime + 0.35);
      osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.7);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    }
  } catch (e) {}
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    alert('Cihazınız sistem bildirimlerini desteklemiyor!');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    await sendSystemNotification('🔔 TaskFlow+ Bildirimleri Aktif!', 'Artık görev saati geldiğinde hem tam ekran alarm hem de telefon bildirim sesiyle uyarı alacaksın.', 'system');
  } else {
    alert('Bildirim izni kapalı! Lütfen telefon Ayarlar -> Uygulamalar -> TaskFlow+ -> Bildirimler kısmından izni açın.');
  }
}

async function sendSystemNotification(title, body, soundType = 'system') {
  if (soundType && soundType !== 'system' && soundType !== 'off') {
    playCustomTone(soundType);
  }

  if (navigator.vibrate) {
    try { navigator.vibrate([400, 200, 400, 200, 600]); } catch (e) {}
  }

  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    await Notification.requestPermission();
  }

  if (Notification.permission === 'granted') {
    const options = {
      body: body,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [400, 200, 400, 200, 600],
      requireInteraction: true,
      silent: false,
      tag: 'taskflow-alarm-' + Date.now(),
      renotify: true
    };

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && 'showNotification' in reg) {
          await reg.showNotification(title, options);
          return;
        }
      }
      new Notification(title, options);
    } catch (e) {}
  }
}

function triggerLiveRingingAlarm(task) {
  activeAlarmTaskId = task.id;
  document.getElementById('alarmModalTaskTitle').textContent = task.title;
  document.getElementById('alarmModalTaskDesc').textContent = task.desc || getPriorityLabel(task.priority);
  document.getElementById('alarmModalTaskTime').textContent = `⏰ Saat: ${task.time}`;
  document.getElementById('liveAlarmModal').classList.remove('hidden');
  pushAppHistoryState();

  sendSystemNotification(
    `⏰ Görev Zamanı: ${task.title}`,
    task.desc || `Saat ${task.time} görevinin vakti geldi!`,
    task.alarmSound || 'system'
  );

  if (alarmLoopTimer) clearInterval(alarmLoopTimer);
  let rings = 0;
  alarmLoopTimer = setInterval(() => {
    rings++;
    if (rings >= 6) {
      clearInterval(alarmLoopTimer);
      alarmLoopTimer = null;
      return;
    }
    if (task.alarmSound && task.alarmSound !== 'system') {
      playCustomTone(task.alarmSound);
    } else {
      sendSystemNotification(
        `⏰ Hatırlatma: ${task.title}`,
        `Saat ${task.time} görevi onayınızı bekliyor!`,
        'system'
      );
    }
  }, 5000);
}

function dismissLiveAlarm(openComplete = false) {
  if (alarmLoopTimer) {
    clearInterval(alarmLoopTimer);
    alarmLoopTimer = null;
  }
  document.getElementById('liveAlarmModal').classList.add('hidden');
  const tId = activeAlarmTaskId;
  activeAlarmTaskId = null;
  if (openComplete && tId) {
    openCompleteModal(tId);
  }
}

function snoozeLiveAlarm(mins = 5) {
  if (alarmLoopTimer) {
    clearInterval(alarmLoopTimer);
    alarmLoopTimer = null;
  }
  document.getElementById('liveAlarmModal').classList.add('hidden');
  if (!activeAlarmTaskId) return;

  const t = appData.tasks.find((x) => x.id === activeAlarmTaskId);
  activeAlarmTaskId = null;
  if (t) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + mins);
    t.time = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    t.notified = false;
    saveProfileData();
    renderAll();
  }
}

setInterval(() => {
  if (!currentProfile || !appData || !Array.isArray(appData.tasks)) return;
  const today = getTodayISO();
  const now = new Date();
  const currentHHMM = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  let changed = false;
  appData.tasks.forEach((t) => {
    if (!t.completed && !t.notified && t.alarmEnabled !== false && t.date === today && t.time === currentHHMM) {
      t.notified = true;
      changed = true;
      triggerLiveRingingAlarm(t);
    }
  });

  if (changed) saveProfileData();
}, 3000);

// ----------------------------------------------------------------------------
// 13. TEK TIKLA YEDEK İNDİRME VE ÜCRETSİZ CANLI BULUT SENKRONİZASYONU
// ----------------------------------------------------------------------------
function exportFullBackup() {
  const dataStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TaskFlowPlus_Yedek_${appData.username || 'kullanici'}_${getTodayISO()}.json`;
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
  } catch (e) {}
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
  } catch (e) {}
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
// 14. ALT MENÜ GEZİNTİSİ (GÖREVLER | HEDEFLER | ARŞİV | ODAK | AYARLAR)
// ----------------------------------------------------------------------------
function switchView(viewName, fromBackButton = false) {
  currentViewName = viewName;
  document.getElementById('viewTasks').style.display = viewName === 'tasks' ? 'block' : 'none';
  document.getElementById('viewGoals').style.display = viewName === 'goals' ? 'block' : 'none';
  document.getElementById('viewArchive').style.display = viewName === 'archive' ? 'block' : 'none';
  document.getElementById('viewStats').style.display = viewName === 'stats' ? 'block' : 'none';
  document.getElementById('viewSettings').style.display = viewName === 'settings' ? 'block' : 'none';

  document.getElementById('navTasks').classList.toggle('active', viewName === 'tasks');
  document.getElementById('navGoals').classList.toggle('active', viewName === 'goals');
  document.getElementById('navArchive').classList.toggle('active', viewName === 'archive');
  document.getElementById('navStats').classList.toggle('active', viewName === 'stats');

  if (!fromBackButton) {
    pushAppHistoryState();
  }
  renderAll();
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installAppBtn').style.display = 'inline-block';
});

async function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installAppBtn').style.display = 'none';
}

window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=9').catch(() => {});
  }
  await initDB();

  if (currentProfile) {
    const saved = await loadProfileData(currentProfile);
    if (saved) {
      unlockApp();
      return;
    }
  }

  const allUsers = await getAllUsersFromDB();
  if (allUsers.length === 0) {
    switchAuthTab('register');
  } else {
    switchAuthTab('login');
  }
});
