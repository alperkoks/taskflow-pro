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

function createDefaultHabits() {
  return [
    { id: 'h_sport', title: '💪 Antrenman', done: false },
    { id: 'h_vit', title: '💊 Vitamin / Kreatin', done: false },
    { id: 'h_clean', title: '🥗 Temiz Beslenme', done: false },
    { id: 'h_read', title: '📖 20 Syf Kitap', done: false },
    { id: 'h_sleep', title: '💤 7+ Saat Uyku', done: false }
  ];
}

function checkAndRenderWaterTracker() {
  const today = getTodayISO();
  if (appData.waterDate !== today) {
    appData.waterDate = today;
    appData.waterCount = 0;
    appData.coffeeCount = 0;
    if (Array.isArray(appData.habits)) {
      appData.habits.forEach((h) => { h.done = false; });
    }
  }
  if (!appData.waterTarget || appData.waterTarget < 8) {
    appData.waterTarget = 12; // Varsayılan: 12 Bardak (3.0 Litre)
  }
  if (!Array.isArray(appData.habits) || appData.habits.length === 0) {
    appData.habits = createDefaultHabits();
  }

  const target = appData.waterTarget;
  const cnt = appData.waterCount || 0;
  const currentLiters = ((cnt * 250) / 1000).toFixed(2);
  const targetLiters = ((target * 250) / 1000).toFixed(1);
  const pct = Math.min(100, Math.round((cnt / target) * 100));

  const targetSelect = document.getElementById('waterTargetSelect');
  if (targetSelect) targetSelect.value = String(target);

  const countTextEl = document.getElementById('waterCountText');
  if (countTextEl) {
    countTextEl.textContent = `${currentLiters} L / ${targetLiters} L (${cnt}/${target} Brd)`;
  }

  const fillEl = document.getElementById('waterProgressBarFill');
  if (fillEl) {
    fillEl.style.width = `${pct}%`;
    fillEl.style.background = pct >= 100 ? '#52c41a' : '#60a5fa';
  }

  let drops = '';
  for (let i = 0; i < target; i++) {
    drops += i < cnt ? '💧' : '⚪';
  }
  if (cnt > target) drops += ` +${cnt - target}💧`;
  const dropsEl = document.getElementById('waterDropsDisplay');
  if (dropsEl) dropsEl.textContent = drops;

  const coffeeEl = document.getElementById('coffeeCountText');
  if (coffeeEl) coffeeEl.textContent = `${appData.coffeeCount || 0} Fincan`;

  renderDailyHabitsStrip();
}

function changeWaterTarget(newVal) {
  appData.waterTarget = parseInt(newVal, 10) || 12;
  checkAndRenderWaterTracker();
  saveProfileData();
}

function changeWaterCount(delta) {
  const today = getTodayISO();
  if (appData.waterDate !== today) {
    appData.waterDate = today;
    appData.waterCount = 0;
    appData.coffeeCount = 0;
  }
  const target = appData.waterTarget || 12;
  const prev = appData.waterCount || 0;
  appData.waterCount = Math.max(0, prev + delta);
  if (delta > 0 && prev < target && appData.waterCount >= target) {
    playAlertTone('success');
  }
  checkAndRenderWaterTracker();
  saveProfileData();
}

function changeCoffeeCount(delta) {
  const today = getTodayISO();
  if (appData.waterDate !== today) {
    appData.waterDate = today;
    appData.waterCount = 0;
    appData.coffeeCount = 0;
  }
  appData.coffeeCount = Math.max(0, (appData.coffeeCount || 0) + delta);
  checkAndRenderWaterTracker();
  saveProfileData();
}

function renderDailyHabitsStrip() {
  const strip = document.getElementById('dailyHabitsStrip');
  const summaryEl = document.getElementById('habitDoneSummaryText');
  if (!strip) return;

  const habits = appData.habits || [];
  const doneCnt = habits.filter((h) => h.done).length;
  if (summaryEl) summaryEl.textContent = `${doneCnt}/${habits.length} Tamam`;

  strip.innerHTML = habits.map((h, idx) => `
    <div class="habit-pill ${h.done ? 'done' : ''}" onclick="toggleDailyHabit(${idx})" title="Tamamlamak için dokun">
      <span>${h.done ? '✅' : '⚪'}</span>
      <span>${escapeHtml(h.title)}</span>
      ${h.custom ? `<span onclick="event.stopPropagation();deleteCustomHabit(${idx});" style="margin-left:3px;color:#ff7875;font-weight:900;">×</span>` : ''}
    </div>
  `).join('');
}

function toggleDailyHabit(idx) {
  if (!Array.isArray(appData.habits) || !appData.habits[idx]) return;
  appData.habits[idx].done = !appData.habits[idx].done;
  const allDone = appData.habits.every((h) => h.done);
  if (appData.habits[idx].done && allDone) {
    playAlertTone('success');
  }
  renderDailyHabitsStrip();
  saveProfileData();
}

function promptAddCustomHabit() {
  const name = prompt('Yeni günlük alışkanlık adı girin (Örn: 🧘 10 Dk Meditasyon / 🚫 Şekersiz Gün):');
  if (!name || !name.trim()) return;
  if (!Array.isArray(appData.habits)) appData.habits = createDefaultHabits();
  appData.habits.push({
    id: 'h_' + Date.now(),
    title: name.trim(),
    done: false,
    custom: true
  });
  renderDailyHabitsStrip();
  saveProfileData();
}

function deleteCustomHabit(idx) {
  if (!Array.isArray(appData.habits)) return;
  appData.habits.splice(idx, 1);
  renderDailyHabitsStrip();
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
        if (!Array.isArray(appData.habits) || appData.habits.length === 0) {
          appData.habits = createDefaultHabits();
        }
        if (!appData.waterTarget || appData.waterTarget < 8) {
          appData.waterTarget = 12;
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
      desc: 'Düzenli antrenman, günlük 3.0L su ve temiz beslenme ile formda kalmak.',
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
    secretVault: '',
    streak: 1,
    lastCompletedDate: today,
    waterDate: today,
    waterTarget: 12,
    waterCount: 2,
    coffeeCount: 1,
    habits: createDefaultHabits(),
    cloudDbUrl: '',
    cloudSyncKey: 'taskflow_' + username.toLowerCase(),
    updatedAt: Date.now(),
    tasks: [
      {
        id: 't_' + Date.now() + '_1',
        title: 'TaskFlow+ v11.0 Yaşam, Spor & Hedef Üssünü Keşfet 🚀',
        desc: 'Yeni 3.0L Su & Kafein takipçisini, Alışkanlık Zincirini, Hedeflerden Göreve aktarımı ve Gizli Kasayı dene.',
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
          { text: 'Alttaki 🎯 Hedefler sekmesine tıklayıp "📅 Bugüne Görev Çıkar" butonunu dene', done: false },
          { text: '💧 Su takipçisinden +500ml Şişe ekle ve alışkanlık çiplerine dokun', done: false },
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
  const vaultPassSetting = document.getElementById('settingVaultPassword');
  if (vaultPassSetting) vaultPassSetting.value = appData.vaultPassword || '';

  document.getElementById('welcomeUserText').textContent = `Merhaba, ${displayName} 👋`;
  document.getElementById('headerAvatarLetter').textContent = displayName.charAt(0).toUpperCase();

  document.getElementById('scratchpadInput').value = appData.scratchpad || '';
  const vaultInp = document.getElementById('secretVaultInput');
  if (vaultInp) vaultInp.value = appData.secretVault || '';
  lockSecretVault();

  document.getElementById('cloudDbUrl').value = appData.cloudDbUrl || '';
  document.getElementById('cloudSyncKey').value = appData.cloudSyncKey || ('taskflow_' + (appData.username || 'user'));
  document.getElementById('streakBadge').textContent = `🔥 ${appData.streak || 1} Gün Seri`;
  checkAndRenderWaterTracker();
  renderBudgetTracker();
}

// ----------------------------------------------------------------------------
// 🔐 ŞİFRE KORUMALI GİZLİ KASA (ÖZEL ŞİFRE VEYA HESAP ŞİFRESİ İLE AÇILIR)
// ----------------------------------------------------------------------------
function toggleSecretVaultBox() {
  const bodyEl = document.getElementById('secretVaultBody');
  const authEl = document.getElementById('secretVaultAuthBox');
  const passInp = document.getElementById('vaultPassCheckInput');
  const errEl = document.getElementById('vaultAuthError');
  if (!bodyEl || !authEl) return;

  // Eğer kasa zaten açıksa kilitle
  if (bodyEl.style.display === 'block') {
    lockSecretVault();
    return;
  }

  // Şifre kutusu açıksa kapat, kapalıysa aç
  if (authEl.style.display === 'block') {
    authEl.style.display = 'none';
  } else {
    authEl.style.display = 'block';
    if (errEl) errEl.textContent = '';
    if (passInp) {
      passInp.value = '';
      passInp.focus();
    }
  }
}

function verifyAndUnlockVault() {
  const passInp = document.getElementById('vaultPassCheckInput');
  const errEl = document.getElementById('vaultAuthError');
  const authEl = document.getElementById('secretVaultAuthBox');
  const bodyEl = document.getElementById('secretVaultBody');
  const badgeEl = document.getElementById('vaultStatusBadge');

  const entered = (passInp ? passInp.value : '').trim();
  const expected = (appData.vaultPassword && appData.vaultPassword.trim())
    ? appData.vaultPassword.trim()
    : (appData.password || '');

  if (expected && entered !== expected) {
    if (errEl) errEl.textContent = '❌ Gizli Kasa şifresi hatalı!';
    return;
  }

  if (authEl) authEl.style.display = 'none';
  if (bodyEl) bodyEl.style.display = 'block';
  if (badgeEl) {
    badgeEl.textContent = '🔓 Açık (Kilitlemek İçin Dokun)';
    badgeEl.style.color = '#95de64';
  }
}

function lockSecretVault() {
  const authEl = document.getElementById('secretVaultAuthBox');
  const bodyEl = document.getElementById('secretVaultBody');
  const badgeEl = document.getElementById('vaultStatusBadge');
  const passInp = document.getElementById('vaultPassCheckInput');
  const errEl = document.getElementById('vaultAuthError');

  if (authEl) authEl.style.display = 'none';
  if (bodyEl) bodyEl.style.display = 'none';
  if (passInp) passInp.value = '';
  if (errEl) errEl.textContent = '';
  if (badgeEl) {
    badgeEl.textContent = '🔒 Şifreli Kilit (Dokun)';
    badgeEl.style.color = 'var(--pastel-purple)';
  }
}

// ----------------------------------------------------------------------------
// 💰 MİNİ BÜTÇE, HARCAMA & AYLIK ABONELİK TAKİPÇİSİ
// ----------------------------------------------------------------------------
function renderBudgetTracker() {
  const listEl = document.getElementById('budgetListContainer');
  const badgeEl = document.getElementById('budgetTotalBadge');
  if (!listEl || !badgeEl) return;

  if (!Array.isArray(appData.budgetItems)) {
    appData.budgetItems = [
      { id: 'b_1', title: '🏋️ Spor Salonu / Supplement', amount: 1200, type: 'sub', paid: false }
    ];
  }

  const items = appData.budgetItems;
  const total = items.reduce((acc, x) => acc + (Number(x.amount) || 0), 0);
  badgeEl.textContent = `Toplam: ${total.toLocaleString('tr-TR')} ₺ ▾`;

  if (items.length === 0) {
    listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);text-align:center;padding:8px;">Henüz harcama veya abonelik eklenmedi.</div>`;
    return;
  }

  listEl.innerHTML = items.map((item, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--bg-surface);padding:7px 9px;border-radius:10px;font-size:12px;">
      <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;cursor:pointer;" onclick="toggleBudgetPaid(${idx})" title="Ödendi / Bekliyor Değiştir">
        <span>${item.paid ? '✅' : '⏳'}</span>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${item.paid ? 'text-decoration:line-through;color:var(--text-muted);' : 'font-weight:700;'}">${escapeHtml(item.title)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
        <b style="color:var(--accent-cream);">${Number(item.amount).toLocaleString('tr-TR')} ₺</b>
        <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:2px 6px;font-size:10px;" onclick="createTaskFromBudgetItem(${idx})" title="Bugünün Görevlerine Hatırlatıcı Olarak Ekle">📅 Görev</button>
        <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;font-weight:800;" onclick="deleteBudgetItem(${idx})">×</button>
      </div>
    </div>
  `).join('');
}

function addBudgetItem() {
  const titleInp = document.getElementById('budgetTitleInput');
  const amountInp = document.getElementById('budgetAmountInput');
  const typeInp = document.getElementById('budgetTypeInput');

  const title = (titleInp.value || '').trim();
  const amount = parseFloat(amountInp.value || '0');
  const type = typeInp ? typeInp.value : 'sub';

  if (!title || isNaN(amount) || amount <= 0) {
    alert('Lütfen geçerli bir harcama/abonelik adı ve tutar (₺) girin!');
    return;
  }

  if (!Array.isArray(appData.budgetItems)) appData.budgetItems = [];
  appData.budgetItems.unshift({
    id: 'b_' + Date.now(),
    title: (type === 'sub' ? '🔄 ' : '🛒 ') + title,
    amount,
    type,
    paid: false
  });

  titleInp.value = '';
  amountInp.value = '';
  renderBudgetTracker();
  saveProfileData();
}

function toggleBudgetPaid(idx) {
  if (!Array.isArray(appData.budgetItems) || !appData.budgetItems[idx]) return;
  appData.budgetItems[idx].paid = !appData.budgetItems[idx].paid;
  renderBudgetTracker();
  saveProfileData();
}

function deleteBudgetItem(idx) {
  if (!Array.isArray(appData.budgetItems)) return;
  appData.budgetItems.splice(idx, 1);
  renderBudgetTracker();
  saveProfileData();
}

function createTaskFromBudgetItem(idx) {
  if (!Array.isArray(appData.budgetItems) || !appData.budgetItems[idx]) return;
  const item = appData.budgetItems[idx];
  const today = getTodayISO();

  appData.tasks.unshift({
    id: 't_' + Date.now(),
    title: `💰 Ödeme: ${item.title} (${Number(item.amount).toLocaleString('tr-TR')} ₺)`,
    pinned: true,
    desc: 'Bütçe & Abonelik takipçisinden aktarılan ödeme hatırlatıcısı.',
    date: today,
    time: '',
    location: '',
    link: '',
    alarmEnabled: true,
    alarmSound: 'system',
    priority: 'high',
    category: 'Rutin İşler',
    repeat: item.type === 'sub' ? 'monthly' : 'none',
    tags: ['#bütçe', '#ödeme'],
    subtasks: [],
    photos: [],
    audios: [],
    completed: false,
    completedAt: null,
    completionEmoji: '',
    completionComment: '',
    notified: false
  });

  selectedDate = today;
  playAlertTone('success');
  saveProfileData();
  renderAll();
  alert(`✅ "${item.title}" ödemesi bugünün (${today}) görevlerine eklendi!`);
}

// ----------------------------------------------------------------------------
// 🏋️ HAZIR SPOR / ANTRENMAN VE RUTİN GÖREV ŞABLONLARI
// ----------------------------------------------------------------------------
const WORKOUT_TEMPLATES = {
  push: {
    title: '💪 İtiş Günü (Push Antrenmanı: Göğüs, Omuz, Arka Kol)',
    category: 'Spor ve Sağlık',
    priority: 'high',
    desc: 'Göğüs, Ön/Yan Omuz ve Triceps odaklı hipertrofi antrenmanı.',
    tags: '#spor #push #antrenman',
    subtasks: [
      '5 Dk Omuz & Rotator Cuff Isınma',
      'Bench Press / Dumbbell Press (4 Set x 8-10 Tekrar)',
      'Incline Dumbbell Press (4 Set x 10-12 Tekrar)',
      'Overhead Shoulder Press (4 Set x 10-12 Tekrar)',
      'Lateral Raise (4 Set x 15 Tekrar)',
      'Triceps Rope Pushdown & Overhead Extension (4 Set x 12 Tekrar)'
    ]
  },
  pull: {
    title: '🏋️ Çekiş Günü (Pull Antrenmanı: Sırt, Arka Omuz, Ön Kol)',
    category: 'Spor ve Sağlık',
    priority: 'high',
    desc: 'Sırt genişliği, kalınlığı ve Biceps odaklı çekiş antrenmanı.',
    tags: '#spor #pull #sırt',
    subtasks: [
      '5 Dk Sırt & Eklem Mobilite Isınması',
      'Lat Pulldown veya Barfiks (4 Set x 10-12 Tekrar)',
      'Barbell Row / Seated Cable Row (4 Set x 10 Tekrar)',
      'Single Arm Dumbbell Row (3 Set x 12 Tekrar)',
      'Face Pull - Arka Omuz (4 Set x 15 Tekrar)',
      'Barbell / EZ-Bar Biceps Curl & Hammer Curl (4 Set x 12 Tekrar)'
    ]
  },
  legs: {
    title: '🦵 Bacak & Kardiyo Antrenmanı (Leg Day & Core)',
    category: 'Spor ve Sağlık',
    priority: 'high',
    desc: 'Alt vücut kuvvet, quadriceps/hamstring ve kardiyo seansı.',
    tags: '#spor #bacak #kardiyo',
    subtasks: [
      '5-8 Dk Dinamik Kalça & Diz Isınması',
      'Squat veya Leg Press (4 Set x 10 Tekrar)',
      'Romanian Deadlift - Arka Bacak (4 Set x 10-12 Tekrar)',
      'Leg Extension & Lying Leg Curl Süperset (4 Set x 12-15 Tekrar)',
      'Standing Calf Raise (4 Set x 15-20 Tekrar)',
      '20 Dk Eğimli Yürüyüş (Incline Walk) veya Kardiyo'
    ]
  },
  fullbody: {
    title: '🔥 Full Body & Karın (Core) Antrenmanı',
    category: 'Spor ve Sağlık',
    priority: 'high',
    desc: 'Tüm vücut kas gruplarını çalıştıran yüksek tempolu antrenman.',
    tags: '#spor #fullbody #kondisyon',
    subtasks: [
      '5 Dk Tüm Vücut Isınma',
      'Göğüs Press & Sırt Çekiş (4 Set x 10-12 Tekrar)',
      'Squat / Lunge Alt Vücut Serisi (4 Set x 12 Tekrar)',
      'Omuz Press & Kol Süperset (3 Set x 12 Tekrar)',
      'Plank & Karın (Core) Egzersizleri (4 Set)',
      '15 Dk Tempolu Kardiyo'
    ]
  },
  growth: {
    title: '📚 Günlük Kişisel Gelişim & Derin Odak Seansı',
    category: 'Kişisel Gelişim',
    priority: 'medium',
    desc: 'Zihinsel gelişim, okuma ve yabancı dil/beceri pratiği.',
    tags: '#gelişim #okuma #odak',
    subtasks: [
      '25 sayfa kitap veya makale oku',
      '20 dakika yabancı dil / kelime / kurs pratiği yap',
      'Günün 3 önemli kazanımını not et'
    ]
  }
};

function applyWorkoutTemplateInModal(tplKey) {
  const tpl = WORKOUT_TEMPLATES[tplKey];
  if (!tpl) return;
  document.getElementById('taskTitleInput').value = tpl.title;
  document.getElementById('taskDescInput').value = tpl.desc;
  document.getElementById('taskTagsInput').value = tpl.tags;
  selectCategoryPill(tpl.category);
  selectPriorityPill(tpl.priority);
  modalSubtasks = tpl.subtasks.map((txt) => ({ text: txt, done: false }));
  renderModalSubtasks();
}

function quickAddWorkoutTask(tplKey) {
  const tpl = WORKOUT_TEMPLATES[tplKey];
  if (!tpl) return;
  const today = getTodayISO();

  appData.tasks.unshift({
    id: 't_' + Date.now(),
    title: tpl.title,
    pinned: true,
    desc: tpl.desc,
    date: today,
    time: '',
    location: '',
    link: '',
    alarmEnabled: true,
    alarmSound: 'system',
    priority: tpl.priority,
    category: tpl.category,
    repeat: 'none',
    tags: tpl.tags.split(' '),
    subtasks: tpl.subtasks.map((txt) => ({ text: txt, done: false })),
    photos: [],
    audios: [],
    completed: false,
    completedAt: null,
    completionEmoji: '',
    completionComment: '',
    notified: false
  });

  selectedDate = today;
  playAlertTone('success');
  saveProfileData();
  renderAll();
  alert(`💪 "${tpl.title}" tüm hareket adımlarıyla birlikte bugünün görevlerine eklendi!`);
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
  const vaultPassEl = document.getElementById('settingVaultPassword');
  const vaultPassVal = vaultPassEl ? vaultPassEl.value.trim() : '';

  if (nameVal) appData.profileName = nameVal;
  if (emailVal) appData.email = emailVal;
  if (passVal && passVal.length >= 4) {
    appData.password = passVal;
  }
  if (vaultPassVal) {
    appData.vaultPassword = vaultPassVal;
  }
  await saveProfileData();
  applyUserPreferences();
  alert('✅ Hesap bilgileriniz ve Gizli Kasa şifreniz başarıyla güncellendi!');
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
  const sv = document.getElementById('secretVaultInput');
  if (sv) {
    sv.addEventListener('input', () => {
      appData.secretVault = sv.value;
      saveProfileData();
    });
  }
});

// Günlük Planı veya Hedefleri WhatsApp / Sistem Paylaşımı ile Gönderme veya Panoya Kopyalama
async function shareOrCopyDailyPlan() {
  const dayTasks = appData.tasks.filter((t) => t.date === selectedDate);
  const doneCnt = dayTasks.filter((t) => t.completed).length;
  const pct = dayTasks.length > 0 ? Math.round((doneCnt / dayTasks.length) * 100) : 0;
  const waterL = (((appData.waterCount || 0) * 250) / 1000).toFixed(2);

  let lines = [
    `📅 *TaskFlow+ Günlük Plan (${selectedDate})*`,
    `📊 İlerleme: %${pct} (${doneCnt}/${dayTasks.length} Görev) | 💧 Su: ${waterL}L`,
    `--------------------------------`
  ];

  if (dayTasks.length === 0) {
    lines.push('✨ Bu tarih için kayıtlı görev yok.');
  } else {
    dayTasks.forEach((t) => {
      const statusIcon = t.completed ? '✅' : '⬜';
      const timeStr = t.time ? ` [${t.time}]` : '';
      const locStr = t.location ? ` 📍(${t.location})` : '';
      lines.push(`${statusIcon}${timeStr} ${t.title} — (${t.category})${locStr}`);
    });
  }

  const text = lines.join('\n');
  if (navigator.share) {
    try {
      await navigator.share({ title: `TaskFlow+ Plan (${selectedDate})`, text });
      return;
    } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    alert('📋 Günlük planın panoya kopyalandı! İstediğin yere (WhatsApp, Notlar vb.) yapıştırabilirsin.');
  } catch (e) {
    prompt('Günlük planını kopyalayabilirsin:', text);
  }
}

async function shareOrCopyGoals() {
  const goals = appData.goals || [];
  let lines = [
    `🎯 *TaskFlow+ Uzun Soluklu Hedeflerim*`,
    `--------------------------------`
  ];
  if (goals.length === 0) {
    lines.push('Henüz hedef eklenmedi.');
  } else {
    goals.forEach((g) => {
      lines.push(`🎯 *${g.title}* (${g.category}) — İlerleme: %${g.progress || 0}`);
      (g.steps || []).forEach((s) => {
        lines.push(`   ${s.done ? '✅' : '⬜'} ${s.text}`);
      });
    });
  }
  const text = lines.join('\n');
  if (navigator.share) {
    try {
      await navigator.share({ title: 'TaskFlow+ Hedeflerim', text });
      return;
    } catch (e) {}
  }
  try {
    await navigator.clipboard.writeText(text);
    alert('📋 Hedef listesi panoya kopyalandı! İstediğin yere yapıştırabilirsin.');
  } catch (e) {
    prompt('Hedeflerini kopyalayabilirsin:', text);
  }
}

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
  renderProteinTracker();
  renderGamificationRank();
  renderMotivationQuoteBar();
  renderCountdownStrip();
  renderShoppingTracker();
  renderBodyPrTracker();
  renderLibraryTracker();
  renderMicroJournal();
  renderBudgetTracker();
  updateBentoCountsAndDailyProgress();
  renderOngoingTasks();
  if (showEisenhowerMatrix) renderEisenhowerMatrix();
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
// 7. 🎯 UZUN SOLUKLU HEDEFLER (GOALS) SİSTEMİ + GÜNLÜK GÖREVE TEK TIKLA AKTARIM
// ----------------------------------------------------------------------------
function handleFabClick() {
  if (currentViewName === 'goals') {
    openGoalModal();
  } else {
    openTaskModal();
  }
}

function createTaskFromGoal(goalId, stepIdx = null) {
  const g = (appData.goals || []).find((x) => x.id === goalId);
  if (!g) return;

  const today = getTodayISO();
  let taskTitle = g.title;
  let taskDesc = `🎯 Bağlı Hedef: ${g.title}`;

  if (stepIdx !== null && g.steps && g.steps[stepIdx]) {
    taskTitle = `${g.steps[stepIdx].text}`;
    taskDesc = `🎯 "${g.title}" hedefinin kilometre taşı adımı.`;
  }

  appData.tasks.unshift({
    id: 't_' + Date.now(),
    title: taskTitle,
    pinned: true,
    desc: taskDesc,
    date: today,
    time: '',
    location: '',
    link: '',
    alarmEnabled: true,
    alarmSound: 'system',
    priority: 'high',
    category: g.category || 'Kişisel Gelişim',
    repeat: 'none',
    tags: ['#hedef'],
    subtasks: [],
    photos: [],
    audios: [],
    completed: false,
    completedAt: null,
    completionEmoji: '',
    completionComment: '',
    notified: false
  });

  selectedDate = today;
  playAlertTone('success');
  saveProfileData();
  renderAll();
  alert(`✅ "${taskTitle}" bugünün (${today}) Günlük Görevler listesine eklendi!`);
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
    const stepPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
    const pct = typeof g.progress === 'number' ? g.progress : stepPct;
    const isAchieved = pct >= 100 || g.achieved;

    const stepsHTML = totalSteps > 0 ? `
      <div class="subtasks-box" style="margin-top:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px;">🏁 KİLOMETRE TAŞLARI (${doneSteps}/${totalSteps})</div>
        ${g.steps.map((s, idx) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;">
            <div class="subtask-item ${s.done ? 'done' : ''}" style="flex:1;" onclick="toggleGoalStep('${g.id}', ${idx})">
              <span>${s.done ? '✅' : '⬜'}</span>
              <span>${escapeHtml(s.text)}</span>
            </div>
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;color:var(--accent-cream);font-size:10px;padding:3px 7px;flex-shrink:0;" onclick="createTaskFromGoal('${g.id}', ${idx})" title="Bu adımı bugünün görevlerine ekle">📅 Bugüne Ekle</button>
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
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px;">
            <span style="font-size:11px;color:var(--text-muted);">İlerlemeyi Kaydırarak Güncelle:</span>
            <input type="range" min="0" max="100" step="5" value="${pct}" style="width:140px;accent-color:var(--accent-cream);" onchange="updateGoalProgressSlider('${g.id}', this.value)" />
          </div>
        </div>

        ${stepsHTML}

        <div class="task-meta">
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="tag-badge" style="cursor:pointer;border:none;color:#95de64;" onclick="adjustGoalProgress('${g.id}', 10)">+10% İlerle</button>
            <button class="tag-badge" style="cursor:pointer;border:none;color:var(--accent-cream);" onclick="createTaskFromGoal('${g.id}')">📅 Bugüne Görev Çıkar</button>
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
  const pendingInp = document.getElementById('goalStepNewInput');
  if (pendingInp) pendingInp.value = '';

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
  const pendingStep = document.getElementById('goalStepNewInput');
  if (pendingStep && pendingStep.value.trim()) {
    modalGoalSteps.push({ text: pendingStep.value.trim(), done: false });
    pendingStep.value = '';
  }

  const editId = document.getElementById('editGoalId').value;
  const category = document.getElementById('goalCategoryInput').value;
  let progress = Math.min(100, Math.max(0, parseInt(document.getElementById('goalProgressInput').value || '0', 10)));
  const desc = document.getElementById('goalDescInput').value.trim();

  if (modalGoalSteps.length > 0 && progress === 0) {
    const doneCnt = modalGoalSteps.filter((s) => s.done).length;
    progress = Math.round((doneCnt / modalGoalSteps.length) * 100);
  }

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
  const pendingSub = document.getElementById('subtaskNewInput');
  if (pendingSub) pendingSub.value = '';

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

  const pendingSub = document.getElementById('subtaskNewInput');
  if (pendingSub && pendingSub.value.trim()) {
    modalSubtasks.push({ text: pendingSub.value.trim(), done: false });
    pendingSub.value = '';
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
// 11. HAFTALIK MOTİVASYON KARNESİ, KATEGORİ ANALİZİ & POMODORO SAYACI
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

  // 4 Ana Kategori Dağılım ve Başarı Grafiği
  const catBox = document.getElementById('categoryBreakdownContainer');
  if (catBox) {
    const categories = [
      { name: 'İş & Proje', icon: '💡', color: '#d8d0f8' },
      { name: 'Rutin İşler', icon: '🔄', color: '#c8f4ec' },
      { name: 'Spor ve Sağlık', icon: '🏋️', color: '#ffdecb' },
      { name: 'Kişisel Gelişim', icon: '📚', color: '#e2f4cb' }
    ];
    catBox.innerHTML = categories.map((c) => {
      const catTasks = appData.tasks.filter((t) => t.category === c.name);
      const catDone = catTasks.filter((t) => t.completed).length;
      const catTotal = catTasks.length;
      const catPct = catTotal > 0 ? Math.round((catDone / catTotal) * 100) : 0;
      const catGoals = (appData.goals || []).filter((g) => g.category === c.name).length;

      return `
        <div style="background:var(--bg-surface);padding:10px 12px;border-radius:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:800;margin-bottom:5px;">
            <span>${c.icon} ${c.name} <span style="font-weight:600;color:var(--text-muted);font-size:11px;">(${catGoals} Uzun Hedef)</span></span>
            <span style="color:var(--accent-cream);">%${catPct} (${catDone}/${catTotal} Görev)</span>
          </div>
          <div class="progress-bar-track" style="height:7px;margin:0;">
            <div class="progress-bar-fill" style="width:${catPct}%;background:${c.color};"></div>
          </div>
        </div>
      `;
    }).join('');
  }
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
// ⏱️ KRONOMETRE (STOPWATCH - İLERİ SAYIM & TUR/SET KAYDI) MOTORU
// ----------------------------------------------------------------------------
let stopwatchSeconds = 0;
let stopwatchInterval = null;
let stopwatchRunning = false;
let stopwatchLaps = [];

function switchTimerMode(mode) {
  const pomoBox = document.getElementById('pomoModeBox');
  const swBox = document.getElementById('stopwatchModeBox');
  const tabPomo = document.getElementById('tabPomoModeBtn');
  const tabSw = document.getElementById('tabStopwatchModeBtn');
  if (!pomoBox || !swBox) return;

  if (mode === 'stopwatch') {
    pomoBox.style.display = 'none';
    swBox.style.display = 'block';
    tabPomo.classList.remove('active');
    tabSw.classList.add('active');
  } else {
    pomoBox.style.display = 'block';
    swBox.style.display = 'none';
    tabPomo.classList.add('active');
    tabSw.classList.remove('active');
  }
}

function formatStopwatchTime(totalSec) {
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

function toggleStopwatch() {
  const stateEl = document.getElementById('stopwatchStateText');
  if (stopwatchRunning) {
    clearInterval(stopwatchInterval);
    stopwatchRunning = false;
    if (stateEl) stateEl.textContent = '⏸️ Duraklatıldı';
    return;
  }
  stopwatchRunning = true;
  if (stateEl) stateEl.textContent = '⏱️ Süre Ölçülüyor...';
  stopwatchInterval = setInterval(() => {
    stopwatchSeconds++;
    const disp = document.getElementById('stopwatchDisplay');
    if (disp) disp.textContent = formatStopwatchTime(stopwatchSeconds);
  }, 1000);
}

function recordStopwatchLap() {
  if (stopwatchSeconds === 0) return;
  stopwatchLaps.unshift({
    num: stopwatchLaps.length + 1,
    time: formatStopwatchTime(stopwatchSeconds)
  });
  renderStopwatchLaps();
}

function resetStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchRunning = false;
  stopwatchSeconds = 0;
  stopwatchLaps = [];
  const disp = document.getElementById('stopwatchDisplay');
  const stateEl = document.getElementById('stopwatchStateText');
  if (disp) disp.textContent = '00:00:00';
  if (stateEl) stateEl.textContent = 'Hazır';
  renderStopwatchLaps();
}

function renderStopwatchLaps() {
  const box = document.getElementById('stopwatchLapsList');
  if (!box) return;
  box.innerHTML = stopwatchLaps.map((l) => `
    <div style="display:flex;justify-content:space-between;background:var(--bg-surface);padding:7px 12px;border-radius:10px;font-size:12.5px;">
      <span style="font-weight:700;color:var(--pastel-mint);">🏁 ${l.num}. Tur / Set</span>
      <b style="color:var(--accent-cream);">${l.time}</b>
    </div>
  `).join('');
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

// ----------------------------------------------------------------------------
// 15. v13.0 MASTERPIECE ÖZELLİKLERİ (11 YENİ SÜPER GÜÇ)
// ----------------------------------------------------------------------------
let showEisenhowerMatrix = false;
let quickRestInterval = null;
let quickRestSeconds = 0;

// 1) 🕵️ PANİK / GİZLİLİK MODU (TEK TUŞLA EKRANI BULANIKLAŞTIRMA)
function togglePanicBlurMode() {
  const isBlurred = document.body.classList.toggle('panic-blur-mode');
  const btn = document.getElementById('panicBlurToggleBtn');
  if (btn) {
    btn.style.background = isBlurred ? '#ff4d4f' : 'var(--bg-surface)';
    btn.style.color = isBlurred ? '#fff' : 'var(--text-main)';
    btn.textContent = isBlurred ? '🙈 Gizli' : '🕵️';
  }
}

// 2) 🏆 SEVİYE & RÜTBE SİSTEMİ (GAMIFICATION / XP HESAPLAMA)
function renderGamificationRank() {
  const badgeEl = document.getElementById('userRankBadgeText');
  const xpEl = document.getElementById('userXpPointsText');
  const fillEl = document.getElementById('userXpBarFill');
  if (!badgeEl || !xpEl || !fillEl) return;

  const doneTasksCount = (appData.tasks || []).filter((t) => t.completed).length;
  const doneGoalSteps = (appData.goals || []).reduce((acc, g) => acc + (g.steps || []).filter((s) => s.done).length, 0);
  const doneHabits = (appData.habits || []).filter((h) => h.done).length;
  const waterPts = (appData.waterCount || 0) * 5;
  const prPts = ((appData.bodyPrRecords || []).length) * 15;
  const journalPts = ((appData.microJournal || []).length) * 20;
  const bonusXp = appData.bonusXp || 0;

  const totalXp = (doneTasksCount * 35) + (doneGoalSteps * 45) + (doneHabits * 15) + waterPts + prPts + journalPts + bonusXp;
  const level = Math.floor(totalXp / 150) + 1;
  const currentLevelXp = totalXp % 150;
  const pct = Math.min(100, Math.round((currentLevelXp / 150) * 100));

  let rankTitle = '🌱 Başlangıç';
  if (level >= 25) rankTitle = '👑 Efsane Üstad';
  else if (level >= 15) rankTitle = '🏋️ Demir İrade';
  else if (level >= 8) rankTitle = '🔥 Disiplinli Savaşçı';
  else if (level >= 4) rankTitle = '⚡ Odaklı Planlayıcı';

  badgeEl.textContent = `${rankTitle} — Seviye ${level}`;
  xpEl.textContent = `${totalXp} XP (%${pct})`;
  fillEl.style.width = `${pct}%`;
}

// 3) 🧠 RASTGELE MOTİVASYON & DİSİPLİN SÖZÜ BARI
const DEFAULT_MOTIVATION_QUOTES = [
  'Disiplin, anlık hevesinle en büyük hedefin arasındaki köprüdür.',
  'Bugün yapacağın küçük bir antrenman veya görev, yarınki özgüvenini inşa eder.',
  'Mükemmel zamanı bekleme; başla ve zamanı mükemmel hale getir.',
  'Yorgun olduğunda değil, işin ve antrenmanın bittiğinde dur!',
  'Küçük günlük alışkanlıklar, uzun vadede devasa zaferler yaratır.',
  'Zor olanı seçersen hayatın kolaylaşır; kolay olanı seçersen hayatın zorlaşır.',
  'Bahane üretmek sıfır kalori yakar; harekete geç!'
];
let currentQuoteIdx = 0;

function renderMotivationQuoteBar() {
  const el = document.getElementById('dailyQuoteText');
  if (!el) return;
  const custom = Array.isArray(appData.customQuotes) ? appData.customQuotes : [];
  const allQuotes = [...custom, ...DEFAULT_MOTIVATION_QUOTES];
  if (currentQuoteIdx >= allQuotes.length) currentQuoteIdx = 0;
  el.textContent = `"${allQuotes[currentQuoteIdx]}"`;
}

function nextMotivationQuote() {
  const custom = Array.isArray(appData.customQuotes) ? appData.customQuotes : [];
  const allQuotes = [...custom, ...DEFAULT_MOTIVATION_QUOTES];
  currentQuoteIdx = (currentQuoteIdx + 1) % allQuotes.length;
  renderMotivationQuoteBar();
}

function promptAddCustomQuote() {
  const q = prompt('Kendi motivasyon sözünü veya mottomu yaz:');
  if (!q || !q.trim()) return;
  if (!Array.isArray(appData.customQuotes)) appData.customQuotes = [];
  appData.customQuotes.unshift(q.trim());
  currentQuoteIdx = 0;
  renderMotivationQuoteBar();
  saveProfileData();
}

// 4) 🥩 GÜNLÜK PROTEİN SAYACI & 5) ⏱️ SET ARASI DİNLENME SAYACI (60sn / 90sn BİP UYARICILI)
function renderProteinTracker() {
  const today = getTodayISO();
  if (appData.proteinDate !== today) {
    appData.proteinDate = today;
    appData.proteinGrams = 0;
  }
  const target = appData.proteinTarget || 160;
  const current = appData.proteinGrams || 0;
  const el = document.getElementById('proteinCountText');
  if (el) {
    el.textContent = `${current} / ${target}g`;
    el.style.color = current >= target ? '#52c41a' : '#ff9c6e';
  }
}

function changeProteinCount(deltaGrams) {
  const today = getTodayISO();
  if (appData.proteinDate !== today) {
    appData.proteinDate = today;
    appData.proteinGrams = 0;
  }
  const prev = appData.proteinGrams || 0;
  const target = appData.proteinTarget || 160;
  appData.proteinGrams = Math.max(0, prev + deltaGrams);
  if (deltaGrams > 0 && prev < target && appData.proteinGrams >= target) {
    playAlertTone('success');
  }
  renderProteinTracker();
  renderGamificationRank();
  saveProfileData();
}

function startQuickRestTimer(seconds) {
  const statusEl = document.getElementById('restTimerStatusText');
  if (quickRestInterval) {
    clearInterval(quickRestInterval);
    quickRestInterval = null;
  }
  quickRestSeconds = seconds;
  if (statusEl) {
    statusEl.textContent = `⏱️ Dinlen: ${quickRestSeconds}sn`;
    statusEl.style.color = '#ff9c6e';
  }
  quickRestInterval = setInterval(() => {
    quickRestSeconds--;
    if (quickRestSeconds <= 0) {
      clearInterval(quickRestInterval);
      quickRestInterval = null;
      if (statusEl) {
        statusEl.textContent = '💪 SETE GİR!';
        statusEl.style.color = '#52c41a';
      }
      playAlertTone('success');
      if (navigator.vibrate) navigator.vibrate([300, 120, 400]);
      setTimeout(() => {
        if (statusEl && !quickRestInterval) {
          statusEl.textContent = '⏱️ Set Mola:';
          statusEl.style.color = '#60a5fa';
        }
      }, 4500);
    } else if (statusEl) {
      statusEl.textContent = `⏱️ Dinlen: ${quickRestSeconds}sn`;
    }
  }, 1000);
}

// 6) ⏳ ÖNEMLİ GÜNLERE GERİ SAYIM (D-DAY / COUNTDOWN) KARTLARI
function renderCountdownStrip() {
  const container = document.getElementById('countdownStripContainer');
  if (!container) return;

  if (!Array.isArray(appData.countdowns)) {
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const iso = nextMonth.toISOString().split('T')[0];
    appData.countdowns = [
      { id: 'cd_1', title: '🏋️ Yaz & Plaj Formu Hedefi', date: iso }
    ];
  }

  const todayMs = new Date(getTodayISO() + 'T00:00:00').getTime();

  const pillsHTML = appData.countdowns.map((c, idx) => {
    const targetMs = new Date(c.date + 'T00:00:00').getTime();
    const diffDays = Math.ceil((targetMs - todayMs) / (1000 * 60 * 60 * 24));
    const badgeStr = diffDays > 0 ? `${diffDays} Gün Kaldı` : (diffDays === 0 ? 'BUGÜN! 🎯' : `${Math.abs(diffDays)} Gün Geçti`);
    return `
      <div class="countdown-pill">
        <span>⏳ ${escapeHtml(c.title)}:</span>
        <span class="countdown-days-badge">${badgeStr}</span>
        <span onclick="deleteCountdownItem(${idx})" style="cursor:pointer;color:#ff7875;font-weight:900;margin-left:3px;" title="Sil">×</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${pillsHTML}
    <button type="button" class="pin-btn" style="height:30px;padding:0 10px;font-size:11.5px;flex-shrink:0;" onclick="promptAddCountdown()">+ ⏳ Geri Sayım Ekle</button>
  `;
}

function promptAddCountdown() {
  const title = prompt('Önemli gün veya hedef adı (Örn: Sınav, Tatil, Yarışma, Proje Teslimi):');
  if (!title || !title.trim()) return;
  const defaultDate = getTodayISO();
  const dateStr = prompt('Hedef Tarihi girin (YYYY-AA-GG formatında):', defaultDate);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    alert('Lütfen tarihi YYYY-AA-GG (Örn: 2026-12-31) formatında girin.');
    return;
  }
  if (!Array.isArray(appData.countdowns)) appData.countdowns = [];
  appData.countdowns.push({
    id: 'cd_' + Date.now(),
    title: title.trim(),
    date: dateStr.trim()
  });
  renderCountdownStrip();
  saveProfileData();
}

function deleteCountdownItem(idx) {
  if (!Array.isArray(appData.countdowns)) return;
  appData.countdowns.splice(idx, 1);
  renderCountdownStrip();
  saveProfileData();
}

// 7) 🧊 EISENHOWER MATRİSİ (ACİL / ÖNEMLİ 4'LÜ KUTU GÖRÜNÜMÜ)
function toggleEisenhowerMatrixView() {
  showEisenhowerMatrix = !showEisenhowerMatrix;
  const matrixBox = document.getElementById('eisenhowerContainer');
  const btn = document.getElementById('toggleMatrixViewBtn');
  if (!matrixBox) return;

  if (showEisenhowerMatrix) {
    matrixBox.style.display = 'grid';
    if (btn) {
      btn.style.background = 'var(--accent-cream)';
      btn.style.color = '#14141b';
    }
    renderEisenhowerMatrix();
  } else {
    matrixBox.style.display = 'none';
    if (btn) {
      btn.style.background = 'var(--bg-surface)';
      btn.style.color = 'var(--text-main)';
    }
  }
}

function renderEisenhowerMatrix() {
  const box = document.getElementById('eisenhowerContainer');
  if (!box) return;

  const active = (appData.tasks || []).filter((t) => !t.completed);
  const qUrgent = active.filter((t) => t.priority === 'urgent');
  const qHigh = active.filter((t) => t.priority === 'high');
  const qMedium = active.filter((t) => t.priority === 'medium');
  const qLow = active.filter((t) => t.priority === 'low');

  const renderMiniItems = (arr) => {
    if (arr.length === 0) return `<div style="font-size:11px;color:var(--text-muted);">Görev yok ✨</div>`;
    return arr.map((t) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;background:rgba(255,255,255,0.04);padding:6px 8px;border-radius:8px;font-size:11.5px;margin-bottom:4px;">
        <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" onclick="openTaskModal('${t.id}')">${escapeHtml(t.title)}</span>
        <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:2px 6px;" onclick="openCompleteModal('${t.id}')">✓</button>
      </div>
    `).join('');
  };

  box.innerHTML = `
    <div class="matrix-quadrant q-urgent">
      <div class="matrix-q-title" style="color:#ff7875;">🚨 1. HEMEN YAP (Acil & Önemli) <span>${qUrgent.length}</span></div>
      ${renderMiniItems(qUrgent)}
    </div>
    <div class="matrix-quadrant q-high">
      <div class="matrix-q-title" style="color:#ffc069;">🔥 2. PLANLA & ODAKLAN (Yüksek) <span>${qHigh.length}</span></div>
      ${renderMiniItems(qHigh)}
    </div>
    <div class="matrix-quadrant q-medium">
      <div class="matrix-q-title" style="color:#95de64;">⚡ 3. GÜNLÜK RUTİN (Orta) <span>${qMedium.length}</span></div>
      ${renderMiniItems(qMedium)}
    </div>
    <div class="matrix-quadrant q-low">
      <div class="matrix-q-title" style="color:#93c5fd;">🌱 4. ERTELE / RAHAT ZAMAN (Düşük) <span>${qLow.length}</span></div>
      ${renderMiniItems(qLow)}
    </div>
  `;
}

// 8) 🛒 AKILLI ALIŞVERİŞ / MARKET & SPOR ÇANTASI HAZIRLAMA LİSTELERİ
const SHOPPING_PRESETS = {
  gymbag: [
    '🎒 Antrenman Havlusu & Tişört',
    '🍼 Su Matarası / Shaker',
    '🎧 Kablosuz Kulaklık',
    '👟 Spor Ayakkabısı & Çorap',
    '💊 Kreatin / Whey Protein / Muz'
  ],
  market: [
    '🥚 Yumurta (30\'lu Koli)',
    '🍗 Tavuk Göğsü / Hindi / Kırmızı Et',
    '🥣 Yulaf Ezmesi & Chia Tohumu',
    '🥛 Süzme Yoğurt / Kefir / Lor Peyniri',
    '🍌 Muz, Yeşil Elma & Avokado',
    '🥜 Çiğ Badem / Fıstık Ezmesi'
  ]
};

function renderShoppingTracker() {
  const listEl = document.getElementById('shoppingListContainer');
  const badgeEl = document.getElementById('shoppingCountBadge');
  if (!listEl || !badgeEl) return;

  if (!Array.isArray(appData.shoppingList)) {
    appData.shoppingList = SHOPPING_PRESETS.gymbag.map((txt) => ({ text: txt, done: false }));
  }

  const items = appData.shoppingList;
  const doneCnt = items.filter((x) => x.done).length;
  badgeEl.textContent = `${doneCnt}/${items.length} Hazır ▾`;

  if (items.length === 0) {
    listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);text-align:center;padding:6px;">Liste boş. Üstten hazır şablon seçebilirsin!</div>`;
    return;
  }

  listEl.innerHTML = items.map((item, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--bg-surface);padding:6px 9px;border-radius:9px;font-size:12px;">
      <div style="display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;" onclick="toggleShoppingItem(${idx})">
        <span>${item.done ? '☑️' : '⬜'}</span>
        <span style="${item.done ? 'text-decoration:line-through;color:var(--text-muted);' : 'font-weight:600;'}">${escapeHtml(item.text)}</span>
      </div>
      <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;font-weight:800;" onclick="deleteShoppingItem(${idx})">×</button>
    </div>
  `).join('');
}

function addShoppingItem() {
  const inp = document.getElementById('shoppingItemInput');
  const val = (inp ? inp.value : '').trim();
  if (!val) return;
  if (!Array.isArray(appData.shoppingList)) appData.shoppingList = [];
  appData.shoppingList.unshift({ text: val, done: false });
  inp.value = '';
  renderShoppingTracker();
  saveProfileData();
}

function toggleShoppingItem(idx) {
  if (!Array.isArray(appData.shoppingList) || !appData.shoppingList[idx]) return;
  appData.shoppingList[idx].done = !appData.shoppingList[idx].done;
  renderShoppingTracker();
  saveProfileData();
}

function deleteShoppingItem(idx) {
  if (!Array.isArray(appData.shoppingList)) return;
  appData.shoppingList.splice(idx, 1);
  renderShoppingTracker();
  saveProfileData();
}

function resetShoppingChecks() {
  if (!Array.isArray(appData.shoppingList)) return;
  appData.shoppingList.forEach((x) => { x.done = false; });
  renderShoppingTracker();
  saveProfileData();
}

function loadQuickChecklistPreset(presetKey) {
  const list = SHOPPING_PRESETS[presetKey];
  if (!list) return;
  appData.shoppingList = list.map((txt) => ({ text: txt, done: false }));
  renderShoppingTracker();
  saveProfileData();
}

// 9) ⚖️ KİLO, YAĞ ORANI & ANTRENMAN REKORLARI (PR) TABLOSU
function renderBodyPrTracker() {
  const listEl = document.getElementById('bodyPrListContainer');
  const badgeEl = document.getElementById('latestWeightBadge');
  if (!listEl || !badgeEl) return;

  if (!Array.isArray(appData.bodyPrRecords)) {
    appData.bodyPrRecords = [];
  }

  const records = appData.bodyPrRecords;
  badgeEl.textContent = records.length > 0 ? `${records[0].value} ▾` : `Kaydet ▾`;

  if (records.length === 0) {
    listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);text-align:center;padding:6px;">Henüz kilo, yağ oranı veya Bench/Squat PR kaydı yok.</div>`;
    return;
  }

  listEl.innerHTML = records.map((r, idx) => `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;background:var(--bg-surface);padding:6px 9px;border-radius:9px;font-size:12px;">
      <div>
        <div style="font-weight:700;">${escapeHtml(r.type)}: <span style="color:#93c5fd;">${escapeHtml(r.value)}</span></div>
        <div style="font-size:10px;color:var(--text-muted);">📅 ${r.date}</div>
      </div>
      <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;font-weight:800;" onclick="deleteBodyPrRecord(${idx})">×</button>
    </div>
  `).join('');
}

function addBodyPrRecord() {
  const typeEl = document.getElementById('prMetricType');
  const valEl = document.getElementById('prMetricValue');
  const val = (valEl ? valEl.value : '').trim();
  if (!val) return;

  if (!Array.isArray(appData.bodyPrRecords)) appData.bodyPrRecords = [];
  appData.bodyPrRecords.unshift({
    id: 'pr_' + Date.now(),
    type: typeEl ? typeEl.value : '⚖️ Güncel Kilo',
    value: val,
    date: getTodayISO()
  });

  valEl.value = '';
  playAlertTone('success');
  renderBodyPrTracker();
  renderGamificationRank();
  saveProfileData();
}

function deleteBodyPrRecord(idx) {
  if (!Array.isArray(appData.bodyPrRecords)) return;
  appData.bodyPrRecords.splice(idx, 1);
  renderBodyPrTracker();
  saveProfileData();
}

// 10) 📖 OKUNAN KİTAPLAR & İZLENEN EĞİTİMLER KÜTÜPHANESİ
function renderLibraryTracker() {
  const listEl = document.getElementById('libraryListContainer');
  const badgeEl = document.getElementById('libraryCountBadge');
  if (!listEl || !badgeEl) return;

  if (!Array.isArray(appData.libraryItems)) {
    appData.libraryItems = [
      { id: 'lib_1', title: '📕 Atomik Alışkanlıklar', current: 80, total: 320 }
    ];
  }

  const items = appData.libraryItems;
  badgeEl.textContent = `${items.length} Eser ▾`;

  if (items.length === 0) {
    listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);text-align:center;padding:6px;">Okuduğun kitabı veya izlediğin kursu ekle!</div>`;
    return;
  }

  listEl.innerHTML = items.map((b, idx) => {
    const pct = b.total > 0 ? Math.min(100, Math.round((b.current / b.total) * 100)) : 0;
    return `
      <div style="background:var(--bg-surface);padding:7px 9px;border-radius:10px;font-size:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(b.title)}</b>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            <span style="font-size:11px;color:var(--accent-cream);">${b.current}/${b.total} (%${pct})</span>
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:2px 6px;" onclick="advanceLibraryItem(${idx}, 10)">+10</button>
            <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;font-weight:800;" onclick="deleteLibraryItem(${idx})">×</button>
          </div>
        </div>
        <div class="progress-bar-track" style="height:4px;margin-top:5px;margin-bottom:0;">
          <div class="progress-bar-fill" style="width:${pct}%;background:var(--pastel-pink);"></div>
        </div>
      </div>
    `;
  }).join('');
}

function addLibraryItem() {
  const tInp = document.getElementById('libTitleInput');
  const totInp = document.getElementById('libTotalInput');
  const title = (tInp ? tInp.value : '').trim();
  const total = parseInt(totInp ? totInp.value : '100', 10) || 100;
  if (!title) return;

  if (!Array.isArray(appData.libraryItems)) appData.libraryItems = [];
  appData.libraryItems.unshift({
    id: 'lib_' + Date.now(),
    title: '📖 ' + title,
    current: 0,
    total
  });
  tInp.value = '';
  if (totInp) totInp.value = '';
  renderLibraryTracker();
  saveProfileData();
}

function advanceLibraryItem(idx, delta) {
  if (!Array.isArray(appData.libraryItems) || !appData.libraryItems[idx]) return;
  const item = appData.libraryItems[idx];
  item.current = Math.min(item.total, (item.current || 0) + delta);
  if (item.current >= item.total) playAlertTone('success');
  renderLibraryTracker();
  saveProfileData();
}

function deleteLibraryItem(idx) {
  if (!Array.isArray(appData.libraryItems)) return;
  appData.libraryItems.splice(idx, 1);
  renderLibraryTracker();
  saveProfileData();
}

// 11) 🌙 GÜNÜN 1 CÜMLELİK ÖZETİ (AKŞAM GÜNLÜĞÜ / MİKRO JOURNAL)
function renderMicroJournal() {
  const listEl = document.getElementById('microJournalList');
  const badgeEl = document.getElementById('journalCountBadge');
  if (!listEl || !badgeEl) return;

  if (!Array.isArray(appData.microJournal)) {
    appData.microJournal = [];
  }

  const entries = appData.microJournal;
  badgeEl.textContent = `${entries.length} Kayıt ▾`;

  if (entries.length === 0) {
    listEl.innerHTML = `<div style="font-size:11.5px;color:var(--text-muted);text-align:center;padding:6px;">Günün nasıl geçtiğini 1 cümle ve puanla kaydet!</div>`;
    return;
  }

  listEl.innerHTML = entries.map((e, idx) => `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;background:var(--bg-surface);padding:7px 9px;border-radius:9px;font-size:12px;">
      <div>
        <div style="font-size:10.5px;color:var(--accent-cream);font-weight:700;">📅 ${e.date} — Puan: ${e.score}/10 ⭐</div>
        <div style="margin-top:2px;">${escapeHtml(e.sentence)}</div>
      </div>
      <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;font-weight:800;" onclick="deleteMicroJournalEntry(${idx})">×</button>
    </div>
  `).join('');
}

function addMicroJournalEntry() {
  const sInp = document.getElementById('journalSentenceInput');
  const scInp = document.getElementById('journalScoreInput');
  const sentence = (sInp ? sInp.value : '').trim();
  const score = scInp ? scInp.value : '8';
  if (!sentence) return;

  if (!Array.isArray(appData.microJournal)) appData.microJournal = [];
  appData.microJournal.unshift({
    id: 'mj_' + Date.now(),
    date: getTodayISO(),
    sentence,
    score
  });
  sInp.value = '';
  playAlertTone('success');
  renderMicroJournal();
  renderGamificationRank();
  saveProfileData();
}

function deleteMicroJournalEntry(idx) {
  if (!Array.isArray(appData.microJournal)) return;
  appData.microJournal.splice(idx, 1);
  renderMicroJournal();
  saveProfileData();
}

window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=13').catch(() => {});
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
