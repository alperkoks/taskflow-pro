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

function syncTodayDailyLog(targetDate = null) {
  const d = targetDate || appData.waterDate || getTodayISO();
  if (!appData.dailyLogs || typeof appData.dailyLogs !== 'object') {
    appData.dailyLogs = {};
  }
  const existing = appData.dailyLogs[d] || {};
  const dayFoods = (appData.dailyFoods && Array.isArray(appData.dailyFoods[d])) ? appData.dailyFoods[d] : (existing.foodsEaten || []);
  const foodTotals = dayFoods.reduce((acc, f) => {
    acc.kcal += Number(f.kcal) || 0;
    acc.prot += Number(f.protein) || 0;
    acc.carb += Number(f.carbs) || 0;
    acc.fat += Number(f.fat) || 0;
    return acc;
  }, { kcal: 0, prot: 0, carb: 0, fat: 0 });

  if (!targetDate || d === (appData.waterDate || getTodayISO())) {
    appData.dailyLogs[d] = {
      waterCount: appData.waterCount || 0,
      waterTarget: appData.waterTarget || 12,
      coffeeCount: appData.coffeeCount || 0,
      proteinGrams: Math.max(appData.proteinGrams || 0, Math.round(foodTotals.prot)),
      proteinTarget: appData.proteinTarget || 160,
      dailyCalories: Math.round(foodTotals.kcal),
      dailyCarbs: Math.round(foodTotals.carb),
      dailyFat: Math.round(foodTotals.fat),
      foodsEaten: dayFoods,
      sleepHours: appData.sleepHours !== undefined ? appData.sleepHours : (existing.sleepHours || 8),
      energyLevel: appData.energyLevel || existing.energyLevel || 'Yüksek',
      habitsDone: (appData.habits || []).filter((h) => h.done).map((h) => h.title),
      habitsTotal: (appData.habits || []).length || 5,
      completedTasksSnapshot: (appData.tasks || [])
        .filter((t) => t.completed && t.date === d)
        .map((t) => `${t.completionEmoji || '✅'} ${t.title}`)
    };
  } else {
    existing.completedTasksSnapshot = (appData.tasks || [])
      .filter((t) => t.completed && t.date === d)
      .map((t) => `${t.completionEmoji || '✅'} ${t.title}`);
    existing.foodsEaten = dayFoods;
    existing.dailyCalories = Math.round(foodTotals.kcal);
    existing.dailyCarbs = Math.round(foodTotals.carb);
    existing.dailyFat = Math.round(foodTotals.fat);
    if (foodTotals.prot > (existing.proteinGrams || 0)) {
      existing.proteinGrams = Math.round(foodTotals.prot);
    }
    appData.dailyLogs[d] = existing;
  }
}

function checkAndRenderWaterTracker() {
  const today = getTodayISO();
  if (!appData.dailyLogs || typeof appData.dailyLogs !== 'object') {
    appData.dailyLogs = {};
  }
  if (appData.waterDate && appData.waterDate !== today) {
    // Yeni güne geçmeden önce dünün su/kahve/protein/alışkanlık özetini Arşiv Günlüğüne kaydet
    syncTodayDailyLog(appData.waterDate);
    appData.waterDate = today;
    appData.waterCount = 0;
    appData.coffeeCount = 0;
    appData.proteinGrams = 0;
    if (Array.isArray(appData.habits)) {
      appData.habits.forEach((h) => { h.done = false; });
    }
  } else if (!appData.waterDate) {
    appData.waterDate = today;
  }
  if (!appData.waterTarget || appData.waterTarget < 8) {
    appData.waterTarget = 12; // Varsayılan: 12 Bardak (3.0 Litre)
  }
  if (!Array.isArray(appData.habits) || appData.habits.length === 0) {
    appData.habits = createDefaultHabits();
  }
  syncTodayDailyLog(today);

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

  const miniWaterEl = document.getElementById('miniWaterQuickText');
  if (miniWaterEl) miniWaterEl.textContent = `${currentLiters}L (${cnt}/${target})`;
  const miniCoffeeEl = document.getElementById('miniCoffeeQuickText');
  if (miniCoffeeEl) miniCoffeeEl.textContent = `${appData.coffeeCount || 0}`;

  renderDailyHabitsStrip();
}

function changeWaterTarget(newVal) {
  appData.waterTarget = parseInt(newVal, 10) || 12;
  checkAndRenderWaterTracker();
  renderSelectedDayDailyValuesBar();
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
  renderSelectedDayDailyValuesBar();
  if (showMonthGrid) renderMonthGrid();
  if (typeof checkWaterCoachMilestone === 'function' && delta > 0) {
    checkWaterCoachMilestone(prev, appData.waterCount, target);
  }
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
  renderSelectedDayDailyValuesBar();
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
  syncTodayDailyLog();
  renderSelectedDayDailyValuesBar();
  if (typeof checkHabitCoachMilestone === 'function' && appData.habits[idx].done) {
    checkHabitCoachMilestone(appData.habits[idx], allDone);
  }
  if (currentViewName === 'archive') renderArchive();
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
  syncTodayDailyLog();
  if (currentViewName === 'archive') renderArchive();
  saveProfileData();
}

function deleteCustomHabit(idx) {
  if (!Array.isArray(appData.habits)) return;
  appData.habits.splice(idx, 1);
  renderDailyHabitsStrip();
  syncTodayDailyLog();
  if (currentViewName === 'archive') renderArchive();
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

    const dayTasks = (appData.tasks || []).filter((t) => t.date === iso);
    const doneTasks = dayTasks.filter((t) => t.completed);
    const hasTasks = dayTasks.some((t) => !t.completed);
    const allDone = dayTasks.length > 0 && doneTasks.length === dayTasks.length;

    const dLog = (appData.dailyLogs && appData.dailyLogs[iso]) ? appData.dailyLogs[iso] : (iso === getTodayISO() ? getDailyLogForArchiveDate(iso) : null);
    const waterCnt = dLog ? (dLog.waterCount || 0) : 0;
    const firstDoneTitle = doneTasks.length > 0 ? doneTasks[0].title : (dayTasks.length > 0 ? dayTasks[0].title : '');

    const cell = document.createElement('div');
    cell.className = `grid-day-cell ${!showAllDates && iso === selectedDate ? 'active' : ''} ${hasTasks ? 'has-tasks' : ''} ${allDone ? 'all-done' : ''}`;
    cell.innerHTML = `
      <span class="archive-day-num">${day}</span>
      ${dayTasks.length > 0 ? `<div class="archive-day-ticks" style="color:${doneTasks.length > 0 ? '#95de64' : '#ff9c6e'};">${doneTasks.length > 0 ? '✅' : '⏳'} ${doneTasks.length}/${dayTasks.length}</div>` : ''}
      ${waterCnt > 0 ? `<div class="archive-day-vitals">💧${waterCnt}</div>` : ''}
      ${firstDoneTitle ? `<div class="archive-day-work-preview">${escapeHtml(firstDoneTitle)}</div>` : ''}
    `;
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
  // Mobilde kategoriye tıklayınca aşağı inmek zorunda kalmadan doğrudan görev başlığına yumuşak odaklan
  if (window.innerWidth < 960 && currentViewName === 'tasks') {
    const targetEl = document.getElementById('activeListTitle');
    if (targetEl) {
      setTimeout(() => {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
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
  if (typeof renderFoodMacroTracker === 'function') renderFoodMacroTracker();
  renderEnergyAndSleepUI();
  renderSelectedDayDailyValuesBar();
  renderGamificationRank();
  renderMotivationQuoteBar();
  renderCountdownStrip();
  renderShoppingTracker();
  renderBodyPrTracker();
  renderLibraryTracker();
  renderMicroJournal();
  renderBudgetTracker();
  renderDayNightRoutine();
  renderWeeklyScheduleGrid();
  renderVaultProgressPhotos();
  renderSevenDayTrendChart();
  renderAchievementsVitrin();
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
          ${!isArchive ? `<button class="tag-badge" style="cursor:pointer;border:none;color:var(--accent-cream);" onclick="postponeTaskToTomorrow('${t.id}')" title="Tek Tıkla Yarına (+1 Gün) Ertele">↪️ Yarın</button>` : ''}
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
  if (typeof checkTaskCompletionCoachPopup === 'function') {
    checkTaskCompletionCoachPopup(t);
  }
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

// ----------------------------------------------------------------------------
// 📦 ARŞİV TAKVİMİ (GÜN GÜN TİKLER) VE SEÇİLİ GÜN YAŞAM ÖZETİ SİSTEMİ
// ----------------------------------------------------------------------------
let archiveCalendarMonth = new Date();
let archiveSelectedDate = getTodayISO();
let archiveShowAllDays = false;

function changeArchiveCalendarMonth(delta) {
  archiveCalendarMonth.setMonth(archiveCalendarMonth.getMonth() + delta);
  renderArchive();
}

function jumpArchiveToToday() {
  archiveSelectedDate = getTodayISO();
  archiveCalendarMonth = new Date();
  archiveShowAllDays = false;
  renderArchive();
}

function toggleArchiveAllDays() {
  archiveShowAllDays = !archiveShowAllDays;
  const btn = document.getElementById('archiveToggleAllDaysBtn');
  if (btn) {
    btn.textContent = archiveShowAllDays ? '📅 Seçili Güne Dön' : 'Tüm Günleri Listele';
  }
  renderArchive();
}

function getDailyLogForArchiveDate(dateISO) {
  if (!appData.dailyLogs || typeof appData.dailyLogs !== 'object') {
    appData.dailyLogs = {};
  }
  if (dateISO === getTodayISO()) {
    syncTodayDailyLog(dateISO);
  }
  return appData.dailyLogs[dateISO] || {
    waterCount: 0,
    waterTarget: appData.waterTarget || 12,
    coffeeCount: 0,
    proteinGrams: 0,
    proteinTarget: appData.proteinTarget || 160,
    sleepHours: 8,
    energyLevel: 'Yüksek',
    habitsDone: [],
    habitsTotal: (appData.habits || []).length || 5,
    completedTasksSnapshot: []
  };
}

function adjustArchiveDateMetric(dateISO, metric, delta) {
  if (!appData.dailyLogs || typeof appData.dailyLogs !== 'object') {
    appData.dailyLogs = {};
  }
  const current = getDailyLogForArchiveDate(dateISO);
  if (metric === 'water') {
    current.waterCount = Math.max(0, (current.waterCount || 0) + delta);
    if (dateISO === getTodayISO()) appData.waterCount = current.waterCount;
  } else if (metric === 'coffee') {
    current.coffeeCount = Math.max(0, (current.coffeeCount || 0) + delta);
    if (dateISO === getTodayISO()) appData.coffeeCount = current.coffeeCount;
  } else if (metric === 'protein') {
    current.proteinGrams = Math.max(0, (current.proteinGrams || 0) + delta);
    if (dateISO === getTodayISO()) appData.proteinGrams = current.proteinGrams;
  } else if (metric === 'sleep') {
    current.sleepHours = Math.min(14, Math.max(3, (current.sleepHours || 8) + delta));
    if (dateISO === getTodayISO()) appData.sleepHours = current.sleepHours;
  } else if (metric === 'energy') {
    const levels = ['Yüksek', 'Orta', 'Düşük'];
    const idx = levels.indexOf(current.energyLevel || 'Yüksek');
    current.energyLevel = levels[(idx + 1) % levels.length];
    if (dateISO === getTodayISO()) appData.energyLevel = current.energyLevel;
  }
  appData.dailyLogs[dateISO] = current;
  checkAndRenderWaterTracker();
  renderProteinTracker();
  renderEnergyAndSleepUI();
  renderSelectedDayDailyValuesBar();
  renderArchive();
  saveProfileData();
}

function renderArchiveCalendar() {
  const gridEl = document.getElementById('archiveMonthGridDays');
  const titleEl = document.getElementById('archiveCalendarMonthTitle');
  if (!gridEl || !titleEl) return;

  gridEl.innerHTML = '';
  const year = archiveCalendarMonth.getFullYear();
  const month = archiveCalendarMonth.getMonth();
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  titleEl.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'archive-day-cell empty';
    gridEl.appendChild(empty);
  }

  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month, day);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const iso = new Date(d - tzOffset).toISOString().split('T')[0];

    const dayTasks = (appData.tasks || []).filter((t) => t.date === iso);
    const doneTasks = dayTasks.filter((t) => t.completed);
    const dLog = (appData.dailyLogs && appData.dailyLogs[iso]) ? appData.dailyLogs[iso] : (iso === getTodayISO() ? getDailyLogForArchiveDate(iso) : null);
    const waterCnt = dLog ? (dLog.waterCount || 0) : 0;
    const sleepHrs = dLog && dLog.sleepHours ? dLog.sleepHours : 0;
    const habitsDoneCnt = dLog && Array.isArray(dLog.habitsDone) ? dLog.habitsDone.length : 0;

    const hasTicks = doneTasks.length > 0 || habitsDoneCnt > 0;
    const allDone = dayTasks.length > 0 && doneTasks.length === dayTasks.length;

    const cell = document.createElement('div');
    cell.className = `archive-day-cell ${!archiveShowAllDays && iso === archiveSelectedDate ? 'active' : ''} ${hasTicks ? 'has-ticks' : ''} ${allDone ? 'all-done' : ''}`;
    cell.onclick = () => {
      archiveSelectedDate = iso;
      archiveShowAllDays = false;
      const btn = document.getElementById('archiveToggleAllDaysBtn');
      if (btn) btn.textContent = 'Tüm Günleri Listele';
      renderArchive();
    };

    let ticksBadge = '';
    if (doneTasks.length > 0) {
      ticksBadge = `<div class="archive-day-ticks">✅ ${doneTasks.length}/${dayTasks.length}</div>`;
    } else if (dayTasks.length > 0) {
      ticksBadge = `<div class="archive-day-ticks" style="color:var(--text-muted);">⏳ 0/${dayTasks.length}</div>`;
    } else if (habitsDoneCnt > 0) {
      ticksBadge = `<div class="archive-day-ticks">✓ ${habitsDoneCnt} Alşk</div>`;
    }

    let vitalsBadge = '';
    if (waterCnt > 0 || sleepHrs > 0) {
      vitalsBadge = `<div class="archive-day-vitals">${waterCnt > 0 ? `💧${waterCnt}` : ''}${sleepHrs > 0 ? ` 💤${sleepHrs}s` : ''}</div>`;
    }

    const firstWorkTitle = doneTasks.length > 0 ? doneTasks[0].title : '';
    const workPreviewHTML = firstWorkTitle
      ? `<div class="archive-day-work-preview">✓ ${escapeHtml(firstWorkTitle)}</div>`
      : '';

    cell.innerHTML = `
      <span class="archive-day-num">${day}</span>
      ${ticksBadge}
      ${vitalsBadge}
      ${workPreviewHTML}
    `;
    gridEl.appendChild(cell);
  }
}

function renderArchiveDailySummary(dateISO) {
  const card = document.getElementById('archiveDailySummaryCard');
  if (!card) return;

  const dayTasks = (appData.tasks || []).filter((t) => t.date === dateISO);
  const doneTasks = dayTasks.filter((t) => t.completed);
  const pct = dayTasks.length > 0 ? Math.round((doneTasks.length / dayTasks.length) * 100) : 0;
  const emojisList = doneTasks.map((t) => t.completionEmoji || '✅').join(' ');

  const log = getDailyLogForArchiveDate(dateISO);
  const waterCnt = log.waterCount || 0;
  const waterTarget = log.waterTarget || 12;
  const waterLiters = ((waterCnt * 250) / 1000).toFixed(2);
  const targetLiters = ((waterTarget * 250) / 1000).toFixed(1);

  const coffeeCnt = log.coffeeCount || 0;
  const proteinGrams = log.proteinGrams || 0;
  const sleepHours = log.sleepHours !== undefined ? log.sleepHours : 8;
  const energyLevel = log.energyLevel || 'Yüksek';
  const energyIcon = energyLevel === 'Yüksek' ? '🔥' : (energyLevel === 'Orta' ? '⚡' : '🪫');
  const habitsDone = Array.isArray(log.habitsDone) ? log.habitsDone : [];

  const journalEntry = (appData.microJournal || []).find((j) => j.date === dateISO);
  const dayPrs = (appData.bodyPrRecords || []).filter((r) => r.date === dateISO);

  const isToday = dateISO === getTodayISO();

  const completedWorkPillsHTML = doneTasks.length > 0
    ? doneTasks.map((t) => `<span class="tag-badge" style="background:rgba(82,196,26,0.16);color:#95de64;border:1px solid rgba(82,196,26,0.35);padding:4px 8px;font-size:11.5px;">${t.completionEmoji || '✅'} ${escapeHtml(t.title)} (${escapeHtml(t.category)})</span>`).join(' ')
    : `<span style="font-size:11.5px;color:var(--text-muted);">Bu tarihte henüz tamamlanmış görev yok. Görev tiklediğinde otomatik olarak buraya günlük değer olarak işlenir.</span>`;

  const dayFoods = (appData.dailyFoods && Array.isArray(appData.dailyFoods[dateISO])) ? appData.dailyFoods[dateISO] : (Array.isArray(log.foodsEaten) ? log.foodsEaten : []);
  const foodTotals = dayFoods.reduce((acc, f) => {
    acc.kcal += Number(f.kcal) || 0;
    acc.prot += Number(f.protein) || 0;
    acc.carb += Number(f.carbs) || 0;
    acc.fat += Number(f.fat) || 0;
    return acc;
  }, { kcal: 0, prot: 0, carb: 0, fat: 0 });
  const eatenPillsHTML = dayFoods.length > 0
    ? dayFoods.map((f) => `<span class="tag-badge" style="background:rgba(255,192,105,0.14);color:#ffc069;border:1px solid rgba(255,192,105,0.3);padding:3px 7px;font-size:11px;">🍽️ ${escapeHtml(f.name)} (${f.grams}g → ${Math.round(f.kcal)} kcal | 🥩${f.protein}g P)</span>`).join(' ')
    : `<span style="font-size:11px;color:var(--text-muted);">Bu tarihte gramajlı yemek/besin kaydı girilmedi.</span>`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
      <div>
        <div style="font-size:15px;font-weight:900;color:var(--accent-cream);">
          📊 ${dateISO} ${isToday ? '(Bugün)' : ''} — Günlük Değerlerim & Yaptığım İşler
        </div>
        <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px;">
          O gün yaptığın işler, yediklerin, su, kahve, protein, uyku, enerji ve alışkanlık değerlerin:
        </div>
      </div>
      <span style="font-size:12px;font-weight:800;padding:4px 10px;border-radius:99px;background:rgba(82,196,26,0.18);color:#95de64;">
        ✅ %${pct} Başarı (${doneTasks.length}/${dayTasks.length} İş)
      </span>
    </div>

    <!-- ✅ O GÜN YAPILAN İŞLER (OTOMATİK GÜNLÜK DEĞER LİSTESİ) -->
    <div style="margin-top:10px;background:var(--bg-surface);padding:9px 11px;border-radius:13px;border:1px solid rgba(82,196,26,0.28);">
      <div style="font-size:11px;font-weight:800;color:#95de64;margin-bottom:6px;">✅ O GÜN TAMAMLADIĞIM İŞLER (${doneTasks.length} Adet):</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${completedWorkPillsHTML}
      </div>
    </div>

    <!-- 🍽️ O GÜN YEDİKLERİM & MAKRO BESİN DEĞERLERİ -->
    <div style="margin-top:8px;background:var(--bg-surface);padding:9px 11px;border-radius:13px;border:1px solid rgba(255,192,105,0.28);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
        <span style="font-size:11px;font-weight:800;color:#ffc069;">🍽️ O GÜN YEDİKLERİM (${dayFoods.length} Besin):</span>
        <span style="font-size:10.5px;font-weight:800;color:var(--text-main);">🔥 ${Math.round(foodTotals.kcal)} kcal | 🥩 ${foodTotals.prot.toFixed(1)}g Protein | 🍞 ${foodTotals.carb.toFixed(1)}g Karb | 🥑 ${foodTotals.fat.toFixed(1)}g Yağ</span>
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        ${eatenPillsHTML}
      </div>
    </div>

    <div class="archive-summary-grid">
      <!-- KUTU 1: İÇİLEN SU -->
      <div class="archive-stat-box">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;">💧 İÇİLEN SU</div>
        <div style="font-size:15px;font-weight:900;color:#93c5fd;">${waterLiters} L <span style="font-size:11.5px;font-weight:600;color:var(--text-muted);">/ ${targetLiters}L</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
          <span style="font-size:11px;color:var(--accent-cream);">${waterCnt} Bardak</span>
          <div style="display:flex;gap:4px;">
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:2px 6px;" onclick="adjustArchiveDateMetric('${dateISO}','water',-1)">-</button>
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:2px 6px;background:rgba(96,165,250,0.2);color:#93c5fd;" onclick="adjustArchiveDateMetric('${dateISO}','water',1)">+1💧</button>
          </div>
        </div>
      </div>

      <!-- KUTU 2: KAHVE & PROTEİN -->
      <div class="archive-stat-box">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;">☕ KAHVE & 🥩 PROTEİN</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;">
          <span style="color:var(--accent-cream);">☕ ${coffeeCnt} Fincan</span>
          <div style="display:flex;gap:3px;">
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 5px;" onclick="adjustArchiveDateMetric('${dateISO}','coffee',-1)">-</button>
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 5px;" onclick="adjustArchiveDateMetric('${dateISO}','coffee',1)">+</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;margin-top:2px;">
          <span style="color:#ff9c6e;">🥩 ${proteinGrams}g Protein</span>
          <div style="display:flex;gap:3px;">
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 5px;" onclick="adjustArchiveDateMetric('${dateISO}','protein',-10)">-</button>
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 5px;" onclick="adjustArchiveDateMetric('${dateISO}','protein',25)">+25g</button>
          </div>
        </div>
      </div>

      <!-- KUTU 3: UYKU & ENERJİ KALİTESİ -->
      <div class="archive-stat-box">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;">💤 UYKU & 🔋 ENERJİ</div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;">
          <span style="color:var(--pastel-purple);">💤 ${sleepHours} Saat</span>
          <div style="display:flex;gap:3px;">
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 5px;" onclick="adjustArchiveDateMetric('${dateISO}','sleep',-0.5)">-</button>
            <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 5px;" onclick="adjustArchiveDateMetric('${dateISO}','sleep',0.5)">+</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;font-weight:800;margin-top:2px;">
          <span style="color:#ffc069;">${energyIcon} Enerji: ${energyLevel}</span>
          <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:1px 6px;" onclick="adjustArchiveDateMetric('${dateISO}','energy',1)">Değiştir</button>
        </div>
      </div>

      <!-- KUTU 4: ZİNCİR ALIŞKANLIKLAR -->
      <div class="archive-stat-box">
        <div style="font-size:11px;color:var(--text-muted);font-weight:700;">🔥 ZİNCİR ALIŞKANLIKLAR</div>
        <div style="font-size:14px;font-weight:900;color:var(--pastel-purple);">${habitsDone.length} Alışkanlık Tiklendi</div>
        <div style="font-size:11px;color:var(--text-main);line-height:1.35;">
          ${habitsDone.length > 0 ? habitsDone.map((h) => `✅ ${escapeHtml(h)}`).join(' • ') : '<span style="color:var(--text-muted);">Kayıtlı alışkanlık tiki yok</span>'}
        </div>
      </div>
    </div>

    ${(journalEntry || dayPrs.length > 0) ? `
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:4px;font-size:12px;">
        ${journalEntry ? `<div>🌙 <b>Günün Özeti (${journalEntry.score}/10 ⭐):</b> "${escapeHtml(journalEntry.sentence)}"</div>` : ''}
        ${dayPrs.length > 0 ? `<div>⚖️ <b>O Gün Kaydedilen Ölçüm / PR:</b> ${dayPrs.map((r) => `${escapeHtml(r.type)}: <b style="color:#93c5fd;">${escapeHtml(r.value)}</b>`).join(' | ')}</div>` : ''}
      </div>
    ` : ''}
  `;
}

function renderArchive() {
  renderArchiveCalendar();
  renderArchiveDailySummary(archiveSelectedDate);

  const container = document.getElementById('archiveTaskList');
  const sortMode = document.getElementById('archiveSortSelect').value;
  const query = (document.getElementById('searchInput').value || '').toLowerCase().trim();
  const titleEl = document.getElementById('archiveListHeaderTitle');
  const subEl = document.getElementById('archiveListHeaderSub');

  let doneList = appData.tasks.filter((t) => t.completed);

  if (!archiveShowAllDays && !query) {
    doneList = doneList.filter((t) => t.date === archiveSelectedDate);
    if (titleEl) titleEl.textContent = `📦 ${archiveSelectedDate} Tarihinde Tamamlanan Görevler (${doneList.length})`;
    if (subEl) subEl.textContent = 'Başka bir günün tiklerini görmek için üstteki Arşiv Takviminden güne dokun veya "Tüm Günleri Listele"ye bas.';
  } else {
    if (titleEl) titleEl.textContent = `📦 Tüm Zamanların Tamamlanan Görevleri (${doneList.length})`;
    if (subEl) subEl.textContent = 'Biten tüm görevlerin fotoğrafları, sesli notları, yorumları ve emojileri.';
  }

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
    container.innerHTML = `
      <div class="task-card" style="text-align:center;color:var(--text-muted);padding:26px;">
        <div style="font-size:28px;margin-bottom:6px;">📅</div>
        <div style="font-weight:700;color:var(--text-main);">${archiveShowAllDays ? 'Henüz arşivlenmiş görev yok.' : `${archiveSelectedDate} tarihinde tamamlanmış görev bulunmuyor.`}</div>
        ${!archiveShowAllDays ? `<button type="button" class="btn-cream" style="margin-top:10px;padding:6px 14px;font-size:12px;" onclick="toggleArchiveAllDays()">📂 Tüm Arşivlenmiş Görevleri Göster</button>` : ''}
      </div>
    `;
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
  document.body.setAttribute('data-active-view', viewName);

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
  // Alt menüden hangi sekmeye tıklanırsa tıklansın anında ekranın EN ÜSTÜNDE açılır!
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
  syncTodayDailyLog();
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

// ----------------------------------------------------------------------------
// 16. v15.0 ULTRA-SADE 3'LÜ ÜS SEÇİCİ, ARAÇ SEÇİCİ & 5 YENİ SÜPER ÖZELLİK
// ----------------------------------------------------------------------------
function switchLeftHubMode(mode) {
  const tabCat = document.getElementById('hubTabCategories');
  const tabSport = document.getElementById('hubTabSport');
  const tabTools = document.getElementById('hubTabTools');

  if (tabCat) tabCat.style.display = mode === 'categories' ? 'block' : 'none';
  if (tabSport) tabSport.style.display = mode === 'sport' ? 'block' : 'none';
  if (tabTools) tabTools.style.display = mode === 'tools' ? 'block' : 'none';

  const btnCat = document.getElementById('hubBtnCategories');
  const btnSport = document.getElementById('hubBtnSport');
  const btnTools = document.getElementById('hubBtnTools');

  if (btnCat) btnCat.classList.toggle('active', mode === 'categories');
  if (btnSport) btnSport.classList.toggle('active', mode === 'sport');
  if (btnTools) btnTools.classList.toggle('active', mode === 'tools');
}

function switchActiveToolPanel(toolKey) {
  const keys = ['shopping', 'library', 'budget', 'journal', 'scratch', 'vault'];
  keys.forEach((k) => {
    const cap = k.charAt(0).toUpperCase() + k.slice(1);
    const panel = document.getElementById('toolPanel' + cap);
    const btn = document.getElementById('toolBtn' + cap);
    if (panel) panel.style.display = k === toolKey ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', k === toolKey);
  });
}

// 1) ☀️ SABAH & 🌙 AKŞAM RUTİNİ TEK TIKLA BAŞLATICI
let activeDayNightRoutineMode = 'morning';
const DEFAULT_MORNING_ROUTINE = [
  { text: '💧 Uyanınca 2 Bardak (500ml) Su İç', done: false },
  { text: '🛏️ Yatağı Topla & Odayı Havalandır', done: false },
  { text: '💊 Günlük Vitamin / Kreatin Al', done: false },
  { text: '🎯 Bugünün En Önemli 3 Görevine Odaklan', done: false }
];
const DEFAULT_EVENING_ROUTINE = [
  { text: '🎒 Yarının Spor Çantasını & Kıyafetini Hazırla', done: false },
  { text: '📅 Yarının Görevlerini & Saatlerini Planla', done: false },
  { text: '🌙 Günün 1 Cümlelik Özetini & Puanını Yaz', done: false },
  { text: '📖 Yatmadan Önce 15 Sayfa Kitap Oku', done: false }
];

function switchDayNightRoutine(mode) {
  activeDayNightRoutineMode = mode;
  const mBtn = document.getElementById('btnMorningRoutine');
  const eBtn = document.getElementById('btnEveningRoutine');
  if (mBtn) {
    mBtn.style.background = mode === 'morning' ? 'var(--accent-cream)' : 'var(--bg-surface)';
    mBtn.style.color = mode === 'morning' ? '#14141c' : 'var(--text-main)';
  }
  if (eBtn) {
    eBtn.style.background = mode === 'evening' ? 'var(--accent-cream)' : 'var(--bg-surface)';
    eBtn.style.color = mode === 'evening' ? '#14141c' : 'var(--text-main)';
  }
  renderDayNightRoutine();
}

function renderDayNightRoutine() {
  const listEl = document.getElementById('dayNightRoutineList');
  if (!listEl) return;

  const today = getTodayISO();
  if (appData.routineCheckDate !== today) {
    appData.routineCheckDate = today;
    appData.morningRoutine = JSON.parse(JSON.stringify(DEFAULT_MORNING_ROUTINE));
    appData.eveningRoutine = JSON.parse(JSON.stringify(DEFAULT_EVENING_ROUTINE));
  }
  if (!Array.isArray(appData.morningRoutine)) {
    appData.morningRoutine = JSON.parse(JSON.stringify(DEFAULT_MORNING_ROUTINE));
  }
  if (!Array.isArray(appData.eveningRoutine)) {
    appData.eveningRoutine = JSON.parse(JSON.stringify(DEFAULT_EVENING_ROUTINE));
  }

  const arr = activeDayNightRoutineMode === 'morning' ? appData.morningRoutine : appData.eveningRoutine;
  listEl.innerHTML = arr.map((item, idx) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg-surface);padding:7px 10px;border-radius:10px;font-size:12px;cursor:pointer;" onclick="toggleDayNightRoutineItem(${idx})">
      <span>${item.done ? '✅' : '⬜'}</span>
      <span style="${item.done ? 'text-decoration:line-through;color:var(--text-muted);' : 'font-weight:700;'}">${escapeHtml(item.text)}</span>
    </div>
  `).join('');
}

function toggleDayNightRoutineItem(idx) {
  const arr = activeDayNightRoutineMode === 'morning' ? appData.morningRoutine : appData.eveningRoutine;
  if (!Array.isArray(arr) || !arr[idx]) return;
  arr[idx].done = !arr[idx].done;
  if (arr[idx].done && arr.every((x) => x.done)) {
    playAlertTone('success');
  }
  renderDayNightRoutine();
  saveProfileData();
}

// 2) 📅 HAFTALIK RUTİN & ANTRENMAN PROGRAMI TABLOSU (PZT - PAZ)
const DEFAULT_WEEKLY_SCHEDULE = [
  { day: 'Pazartesi', plan: '💪 İtiş (Push) + İş' },
  { day: 'Salı', plan: '📚 Gelişim & Kardiyo' },
  { day: 'Çarşamba', plan: '🏋️ Çekiş (Pull) + İş' },
  { day: 'Perşembe', plan: '🧘 Aktif Dinlenme' },
  { day: 'Cuma', plan: '🦵 Bacak (Leg Day)' },
  { day: 'Cumartesi', plan: '🔥 Full Body & Doğa' },
  { day: 'Pazar', plan: '📋 Haftalık Planlama' }
];

function renderWeeklyScheduleGrid() {
  const grid = document.getElementById('weeklyScheduleGrid');
  if (!grid) return;

  if (!Array.isArray(appData.weeklySchedule) || appData.weeklySchedule.length !== 7) {
    appData.weeklySchedule = JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
  }

  grid.innerHTML = appData.weeklySchedule.map((item, idx) => `
    <div class="weekly-day-box" onclick="editWeeklyScheduleDay(${idx})" title="Düzenlemek için dokun">
      <div style="font-size:10.5px;font-weight:900;color:var(--accent-cream);">${escapeHtml(item.day)}</div>
      <div style="font-size:11.5px;font-weight:700;margin-top:3px;line-height:1.3;">${escapeHtml(item.plan)}</div>
    </div>
  `).join('');
}

function editWeeklyScheduleDay(idx) {
  if (!Array.isArray(appData.weeklySchedule) || !appData.weeklySchedule[idx]) return;
  const current = appData.weeklySchedule[idx];
  const nextVal = prompt(`${current.day} günü için sabit antrenman veya rutin programın:`, current.plan);
  if (nextVal === null) return;
  appData.weeklySchedule[idx].plan = nextVal.trim() || 'Dinlenme';
  renderWeeklyScheduleGrid();
  saveProfileData();
}

// 3) 📸 FİZİKSEL DEĞİŞİM (BEFORE / AFTER) FORM FOTOĞRAF GALERİSİ (GİZLİ KASA İÇİ)
function handleVaultProgressPhotoUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const labelInp = document.getElementById('vaultPhotoLabelInput');
  const label = (labelInp && labelInp.value.trim()) ? labelInp.value.trim() : `${getTodayISO()} Form`;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_W = 680;
      let w = img.width || 600;
      let h = img.height || 800;
      if (w > MAX_W) {
        h = Math.round((h * MAX_W) / w);
        w = MAX_W;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL('image/jpeg', 0.72);

      if (!Array.isArray(appData.vaultProgressPhotos)) appData.vaultProgressPhotos = [];
      appData.vaultProgressPhotos.unshift({
        id: 'vp_' + Date.now(),
        label,
        date: getTodayISO(),
        src: compressed
      });
      if (labelInp) labelInp.value = '';
      renderVaultProgressPhotos();
      saveProfileData();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function renderVaultProgressPhotos() {
  const grid = document.getElementById('vaultProgressPhotosGrid');
  if (!grid) return;

  const list = Array.isArray(appData.vaultProgressPhotos) ? appData.vaultProgressPhotos : [];
  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;font-size:11px;color:var(--text-muted);text-align:center;padding:8px;">Henüz form (Before/After) fotoğrafı eklenmedi.</div>`;
    return;
  }

  grid.innerHTML = list.map((p, idx) => `
    <div style="background:var(--bg-surface);padding:6px;border-radius:11px;position:relative;text-align:center;">
      <img src="${p.src}" style="width:100%;height:110px;object-fit:cover;border-radius:8px;cursor:pointer;" onclick="openPhotoViewer('${p.src}')" />
      <div style="font-size:10.5px;font-weight:800;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.label)}</div>
      <button type="button" onclick="deleteVaultProgressPhoto(${idx})" style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.7);color:#ff7875;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-weight:900;">×</button>
    </div>
  `).join('');
}

function deleteVaultProgressPhoto(idx) {
  if (!Array.isArray(appData.vaultProgressPhotos)) return;
  appData.vaultProgressPhotos.splice(idx, 1);
  renderVaultProgressPhotos();
  saveProfileData();
}

// 4) 🎧 ODAKLANMA & ANTRENMAN ARKA PLAN SESLERİ (ÇEVRİMDIŞI WEB AUDIO GENERATOR)
let focusAudioCtx = null;
let focusNoiseNode = null;
let activeSoundscapeMode = null;

function stopFocusSoundscape() {
  if (focusNoiseNode) {
    try { focusNoiseNode.disconnect(); } catch (e) {}
    focusNoiseNode = null;
  }
  if (focusAudioCtx) {
    try { focusAudioCtx.close(); } catch (e) {}
    focusAudioCtx = null;
  }
  activeSoundscapeMode = null;
  ['Rain', 'Deep', 'Waves'].forEach((k) => {
    const b = document.getElementById('soundBtn' + k);
    if (b) b.classList.remove('active');
  });
}

function toggleFocusSoundscape(mode) {
  if (activeSoundscapeMode === mode) {
    stopFocusSoundscape();
    return;
  }
  stopFocusSoundscape();
  activeSoundscapeMode = mode;

  const mapBtn = { rain: 'soundBtnRain', deep: 'soundBtnDeep', waves: 'soundBtnWaves' };
  const btn = document.getElementById(mapBtn[mode]);
  if (btn) btn.classList.add('active');

  try {
    focusAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = 2 * focusAudioCtx.sampleRate;
    const noiseBuffer = focusAudioCtx.createBuffer(1, bufferSize, focusAudioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = output[i];
      output[i] *= 3.2;
    }

    const whiteNoise = focusAudioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = focusAudioCtx.createBiquadFilter();
    filter.type = mode === 'rain' ? 'bandpass' : 'lowpass';
    filter.frequency.value = mode === 'rain' ? 950 : (mode === 'deep' ? 240 : 480);

    const gainNode = focusAudioCtx.createGain();
    gainNode.gain.value = 0.14;

    whiteNoise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(focusAudioCtx.destination);
    whiteNoise.start(0);
    focusNoiseNode = gainNode;
  } catch (e) {}
}

// 5) 📈 SON 7 GÜNLÜK SU TÜKETİMİ VE BİTİRİLEN GÖREV TREND GRAFİĞİ
function renderSevenDayTrendChart() {
  const wrap = document.getElementById('sevenDayTrendChart');
  if (!wrap) return;

  const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const cols = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const iso = new Date(d - tzOffset).toISOString().split('T')[0];

    const doneCnt = (appData.tasks || []).filter((t) => t.completed && t.date === iso).length;
    const dLog = getDailyLogForArchiveDate(iso);
    const waterCnt = dLog ? (dLog.waterCount || 0) : 0;

    const taskHeight = Math.min(78, Math.max(6, doneCnt * 14));
    const waterHeight = Math.min(78, Math.max(6, waterCnt * 5));

    cols.push(`
      <div class="trend-bar-col">
        <div style="font-size:9.5px;color:var(--text-muted);font-weight:700;">${doneCnt}✓/${waterCnt}💧</div>
        <div class="trend-bar-pair">
          <div class="trend-bar-item" style="height:${taskHeight}px;background:#95de64;" title="${iso}: ${doneCnt} Görev Bitti"></div>
          <div class="trend-bar-item" style="height:${waterHeight}px;background:#60a5fa;" title="${iso}: ${waterCnt} Bardak Su"></div>
        </div>
        <div style="font-size:10.5px;font-weight:800;color:${i === 0 ? 'var(--accent-cream)' : 'var(--text-muted)'};">${dayNames[d.getDay()]}</div>
      </div>
    `);
  }

  wrap.innerHTML = cols.join('');
}

// ----------------------------------------------------------------------------
// 17. v16.0 ÖZELLİKLERİ: TEK TUŞLA YARINA ERTELE, 1RM & MAKRO HESAPLAYICI,
//     ROZET & BAŞARIM KOLEKSİYONU, TÜRKÇE SESLİ GÜNLÜK BRİFİNG ASİSTANI
// ----------------------------------------------------------------------------

// 1) ⚡ GÖREVİ TEK TUŞLA YARINA (+1 GÜN) ERTELEME
function postponeTaskToTomorrow(taskId) {
  const t = appData.tasks.find((x) => x.id === taskId);
  if (!t) return;
  const base = new Date((t.date || getTodayISO()) + 'T00:00:00');
  base.setDate(base.getDate() + 1);
  const tzOffset = base.getTimezoneOffset() * 60000;
  const nextIso = new Date(base - tzOffset).toISOString().split('T')[0];

  t.date = nextIso;
  t.notified = false;
  playAlertTone('notify');
  saveProfileData();
  renderAll();
}

// 2) 🏋️ 1RM (MAKSİMUM AĞIRLIK) & GÜNLÜK KALORİ/MAKRO HESAPLAYICI
function switchSportCalcTab(tab) {
  const box1rm = document.getElementById('sportCalc1RMBox');
  const boxMacro = document.getElementById('sportCalcMacroBox');
  const btn1rm = document.getElementById('btnCalc1RM');
  const btnMacro = document.getElementById('btnCalcMacro');
  if (!box1rm || !boxMacro) return;

  if (tab === 'macro') {
    box1rm.style.display = 'none';
    boxMacro.style.display = 'block';
    if (btn1rm) { btn1rm.style.background = 'var(--bg-surface)'; btn1rm.style.color = 'var(--text-main)'; }
    if (btnMacro) { btnMacro.style.background = 'var(--accent-cream)'; btnMacro.style.color = '#14141c'; }
  } else {
    box1rm.style.display = 'block';
    boxMacro.style.display = 'none';
    if (btn1rm) { btn1rm.style.background = 'var(--accent-cream)'; btn1rm.style.color = '#14141c'; }
    if (btnMacro) { btnMacro.style.background = 'var(--bg-surface)'; btnMacro.style.color = 'var(--text-main)'; }
  }
}

function calculateOneRepMax() {
  const w = parseFloat(document.getElementById('calc1RMWeight').value || '0');
  const r = parseInt(document.getElementById('calc1RMReps').value || '0', 10);
  const resEl = document.getElementById('calc1RMResult');
  if (!resEl) return;

  if (w <= 0 || r <= 0) {
    resEl.innerHTML = `<span style="color:#ff7875;">Lütfen geçerli bir ağırlık (kg) ve tekrar sayısı girin.</span>`;
    return;
  }

  const oneRM = r === 1 ? w : Math.round(w * (1 + r / 30));
  const hypertrophy = Math.round(oneRM * 0.75);
  const strength = Math.round(oneRM * 0.85);

  resEl.innerHTML = `
    <div style="background:var(--bg-surface);padding:8px 10px;border-radius:10px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
      <div>
        🔥 <b>Tahmini 1RM: <span style="color:#ff9c6e;font-size:14px;">${oneRM} kg</span></b><br>
        <span style="font-size:11px;color:var(--text-muted);">Hipertrofi (%75): <b>${hypertrophy}kg</b> • Kuvvet (%85): <b>${strength}kg</b></span>
      </div>
      <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:4px 8px;background:rgba(96,165,250,0.2);color:#93c5fd;" onclick="saveCalculated1RMToPR(${oneRM})">+ PR Tablosuna Kaydet</button>
    </div>
  `;
}

function saveCalculated1RMToPR(oneRMVal) {
  if (!Array.isArray(appData.bodyPrRecords)) appData.bodyPrRecords = [];
  appData.bodyPrRecords.unshift({
    id: 'pr_' + Date.now(),
    type: '🏋️ Hesaplanan 1RM Rekoru',
    value: `${oneRMVal} kg`,
    date: getTodayISO()
  });
  playAlertTone('success');
  renderBodyPrTracker();
  renderGamificationRank();
  saveProfileData();
}

function calculateDailyMacros() {
  const w = parseFloat(document.getElementById('calcMacroWeight').value || '0');
  const h = parseFloat(document.getElementById('calcMacroHeight').value || '0');
  const goal = document.getElementById('calcMacroGoal').value;
  const resEl = document.getElementById('calcMacroResult');
  if (!resEl) return;

  if (w < 30 || h < 100) {
    resEl.innerHTML = `<span style="color:#ff7875;">Lütfen geçerli kilo (kg) ve boy (cm) girin.</span>`;
    return;
  }

  // Mifflin-St Jeor + Orta Aktif Sporcu Çarpanı
  const bmr = (10 * w) + (6.25 * h) - (5 * 26) + 5;
  let tdee = Math.round(bmr * 1.55);
  if (goal === 'cut') tdee -= 450;
  if (goal === 'bulk') tdee += 350;

  const proteinTarget = Math.round(w * (goal === 'cut' ? 2.1 : 1.9));

  resEl.innerHTML = `
    <div style="background:var(--bg-surface);padding:8px 10px;border-radius:10px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
      <div>
        🔥 <b>Günlük Kalori: <span style="color:#95de64;">${tdee} kcal</span></b><br>
        🥩 <b>İdeal Protein Hedefi: <span style="color:#ff9c6e;">${proteinTarget}g / gün</span></b>
      </div>
      <button type="button" class="tag-badge" style="border:none;cursor:pointer;padding:4px 8px;background:rgba(255,156,110,0.2);color:#ff9c6e;" onclick="applyCalculatedProteinTarget(${proteinTarget})">Hedefim Yap ✓</button>
    </div>
  `;
}

function applyCalculatedProteinTarget(newTarget) {
  appData.proteinTarget = newTarget;
  renderProteinTracker();
  saveProfileData();
  alert(`✅ Günlük protein hedefin ${newTarget}g olarak güncellendi!`);
}

// 3) 🏅 ROZET & BAŞARIM KOLEKSİYONU (ACHIEVEMENTS VİTRİNİ)
function renderAchievementsVitrin() {
  const grid = document.getElementById('achievementsGrid');
  const badgeEl = document.getElementById('achievementsUnlockedBadge');
  if (!grid || !badgeEl) return;

  const doneTasks = (appData.tasks || []).filter((t) => t.completed).length;
  const waterHit = (appData.waterCount || 0) >= (appData.waterTarget || 12);
  const streakCount = appData.streak || 1;
  const prCount = (appData.bodyPrRecords || []).length;
  const goalStepDone = (appData.goals || []).some((g) => (g.steps || []).some((s) => s.done));
  const libCount = (appData.libraryItems || []).some((b) => (b.current || 0) > 0);
  const journalCount = (appData.microJournal || []).length;

  const badges = [
    { icon: '🌱', title: 'İlk Kıvılcım', desc: 'İlk görevini tamamla', unlocked: doneTasks >= 1 },
    { icon: '⚡', title: 'Görev Avcısı', desc: '10 görev tamamla', unlocked: doneTasks >= 10 },
    { icon: '👑', title: 'Plan Efsanesi', desc: '50 görev tamamla', unlocked: doneTasks >= 50 },
    { icon: '💧', title: 'Su Disiplini', desc: 'Günlük su hedefine ulaş', unlocked: waterHit },
    { icon: '🔥', title: 'Demir Seri', desc: '3+ gün üst üste seri yap', unlocked: streakCount >= 3 },
    { icon: '🏋️', title: 'Sporcu Ruhu', desc: 'Kilo veya PR rekoru kaydet', unlocked: prCount >= 1 },
    { icon: '🎯', title: 'Vizyoner', desc: 'Bir hedef adımını bitir', unlocked: goalStepDone },
    { icon: '🌙', title: 'Öz Farkındalık', desc: 'Günün 1 cümle özetini yaz', unlocked: journalCount >= 1 || libCount }
  ];

  const unlockedCnt = badges.filter((b) => b.unlocked).length;
  badgeEl.textContent = `${unlockedCnt} / ${badges.length} Rozet Açıldı`;

  grid.innerHTML = badges.map((b) => `
    <div style="background:var(--bg-surface);border:1px solid ${b.unlocked ? 'rgba(245,216,181,0.45)' : 'var(--border-color)'};border-radius:14px;padding:10px;text-align:center;opacity:${b.unlocked ? '1' : '0.42'};">
      <div style="font-size:26px;">${b.unlocked ? b.icon : '🔒'}</div>
      <div style="font-size:12px;font-weight:800;margin-top:4px;color:${b.unlocked ? 'var(--accent-cream)' : 'var(--text-main)'};">${b.title}</div>
      <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${b.desc}</div>
    </div>
  `).join('');
}

// 4) 🔊 TÜRKÇE SESLİ GÜNLÜK BRİFİNG ASİSTANI (WEB SPEECH SYNTHESIS)
function speakDailyBriefing() {
  if (!('speechSynthesis' in window)) {
    alert('Cihazınız sesli okuma (SpeechSynthesis) özelliğini desteklemiyor.');
    return;
  }

  const btn = document.getElementById('voiceBriefingBtn');
  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    if (btn) btn.textContent = '🔊 Sesli Brifing';
    return;
  }

  const name = appData.profileName || appData.username || 'Dostum';
  const dayTasks = (appData.tasks || []).filter((t) => t.date === selectedDate);
  const doneCnt = dayTasks.filter((t) => t.completed).length;
  const pending = dayTasks.filter((t) => !t.completed);
  const waterCnt = appData.waterCount || 0;
  const waterL = ((waterCnt * 250) / 1000).toFixed(1);

  let speechText = `Merhaba ${name}! ${selectedDate} tarihi için toplam ${dayTasks.length} görevin var ve ${doneCnt} tanesini tamamladın. `;
  if (pending.length > 0) {
    const topTitles = pending.slice(0, 4).map((t) => (t.time ? `Saat ${t.time} ${t.title}` : t.title)).join(', ');
    speechText += `Sıradaki bekleyen görevlerin: ${topTitles}. `;
  } else {
    speechText += `Bugün için bekleyen hiçbir görevin kalmadı, harika iş çıkardın! `;
  }
  speechText += `Bugün şimdiye kadar ${waterCnt} bardak, yani ${waterL} litre su içtin. Disiplinli ve enerjik bir gün dilerim!`;

  const utter = new SpeechSynthesisUtterance(speechText);
  utter.lang = 'tr-TR';
  utter.rate = 1.02;
  if (btn) btn.textContent = '⏹️ Okumayı Durdur';

  utter.onend = () => {
    if (btn) btn.textContent = '🔊 Sesli Brifing';
  };
  utter.onerror = () => {
    if (btn) btn.textContent = '🔊 Sesli Brifing';
  };

  window.speechSynthesis.speak(utter);
}

// ===== 27. ENERJİ & UYKU KALİTESİ SEÇİCİ + SEÇİLİ GÜN GÜNLÜK DEĞERLER BARI + HAFTALIK DEĞERLENDİRME SİHİRBAZI (v17.0) =====

function normalizeEnergyValue(val) {
  if (!val) return 'Yüksek';
  const v = String(val).toLowerCase();
  if (v === 'high' || v.includes('yüksek')) return 'Yüksek';
  if (v === 'low' || v.includes('düşük')) return 'Düşük';
  return 'Orta';
}

function renderEnergyAndSleepUI() {
  const energy = normalizeEnergyValue(appData.energyLevel || appData.dailyEnergy || 'Yüksek');
  appData.energyLevel = energy;
  const sleep = appData.sleepHours !== undefined ? appData.sleepHours : (appData.dailySleepHours !== undefined ? appData.dailySleepHours : 8);
  appData.sleepHours = sleep;

  const energyLabels = { 'Yüksek': '🔥 Enerji: Yüksek', 'Orta': '⚡ Enerji: Orta', 'Düşük': '🪫 Enerji: Düşük' };

  const miniEnergy = document.getElementById('miniEnergyQuickBtn');
  if (miniEnergy) miniEnergy.textContent = energyLabels[energy] || '🔥 Enerji: Yüksek';

  const miniSleep = document.getElementById('miniSleepQuickBtn');
  if (miniSleep) miniSleep.textContent = `💤 ${sleep}s Uyku`;

  const sleepText = document.getElementById('sleepHoursText');
  if (sleepText) sleepText.textContent = `${sleep} Saat`;

  const btnHigh = document.getElementById('energyBtnHigh');
  const btnMed = document.getElementById('energyBtnMed');
  const btnLow = document.getElementById('energyBtnLow');

  if (btnHigh) {
    btnHigh.style.background = energy === 'Yüksek' ? 'rgba(82,196,26,0.25)' : 'var(--bg-surface)';
    btnHigh.style.color = energy === 'Yüksek' ? '#95de64' : 'var(--text-muted)';
  }
  if (btnMed) {
    btnMed.style.background = energy === 'Orta' ? 'rgba(255,192,105,0.25)' : 'var(--bg-surface)';
    btnMed.style.color = energy === 'Orta' ? '#ffc069' : 'var(--text-muted)';
  }
  if (btnLow) {
    btnLow.style.background = energy === 'Düşük' ? 'rgba(255,120,117,0.25)' : 'var(--bg-surface)';
    btnLow.style.color = energy === 'Düşük' ? '#ff7875' : 'var(--text-muted)';
  }
}

function setDailyEnergyLevel(level) {
  const norm = normalizeEnergyValue(level);
  appData.energyLevel = norm;
  syncTodayDailyLog();
  renderEnergyAndSleepUI();
  renderSelectedDayDailyValuesBar();
  if (showMonthGrid) renderMonthGrid();
  saveProfileData();
}

function cycleDailyEnergyLevel() {
  const order = ['Yüksek', 'Orta', 'Düşük'];
  const curr = normalizeEnergyValue(appData.energyLevel || 'Yüksek');
  const next = order[(order.indexOf(curr) + 1) % order.length];
  setDailyEnergyLevel(next);
}

function changeDailySleepHours(delta) {
  const curr = appData.sleepHours !== undefined ? Number(appData.sleepHours) : 8;
  const next = Math.max(3, Math.min(14, Math.round((curr + delta) * 2) / 2));
  appData.sleepHours = next;
  syncTodayDailyLog();
  renderEnergyAndSleepUI();
  renderSelectedDayDailyValuesBar();
  if (showMonthGrid) renderMonthGrid();
  saveProfileData();
}

function cycleDailySleepHours() {
  const presets = [6, 6.5, 7, 7.5, 8, 8.5, 9, 5.5];
  const curr = appData.sleepHours !== undefined ? Number(appData.sleepHours) : 8;
  const idx = presets.indexOf(curr);
  const next = presets[(idx + 1) % presets.length];
  appData.sleepHours = next;
  syncTodayDailyLog();
  renderEnergyAndSleepUI();
  renderSelectedDayDailyValuesBar();
  if (showMonthGrid) renderMonthGrid();
  saveProfileData();
}

function renderSelectedDayDailyValuesBar() {
  const bar = document.getElementById('selectedDayDailyValuesBar');
  if (!bar) return;

  const dateStr = selectedDate || getTodayISO();
  const log = getDailyLogForArchiveDate(dateStr);
  const dayTasks = (appData.tasks || []).filter((t) => t.date === dateStr);
  const doneTasks = dayTasks.filter((t) => t.completed);

  const energyLevel = normalizeEnergyValue(log.energyLevel || 'Yüksek');
  const energyIcon = energyLevel === 'Yüksek' ? '🔥' : (energyLevel === 'Orta' ? '⚡' : '🪫');
  const sleepVal = log.sleepHours !== undefined ? log.sleepHours : 8;
  const waterCnt = log.waterCount || 0;
  const waterTarget = log.waterTarget || 12;
  const waterL = ((waterCnt * 250) / 1000).toFixed(2);
  const dayFoods = (appData.dailyFoods && Array.isArray(appData.dailyFoods[dateStr])) ? appData.dailyFoods[dateStr] : (Array.isArray(log.foodsEaten) ? log.foodsEaten : []);
  const totalKcal = dayFoods.reduce((acc, f) => acc + (Number(f.kcal) || 0), 0);
  const totalProt = Math.max(log.proteinGrams || 0, Math.round(dayFoods.reduce((acc, f) => acc + (Number(f.protein) || 0), 0)));

  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' });

  const doneItemsHtml =
    doneTasks.length > 0
      ? doneTasks
          .map(
            (t) =>
              `<span style="font-size:10.5px; padding:3px 8px; border-radius:99px; background:rgba(82,196,26,0.16); border:1px solid rgba(82,196,26,0.35); color:#95de64; font-weight:700; display:inline-flex; align-items:center; gap:4px;">${t.completionEmoji || '✅'} ${escapeHtml(t.title)}</span>`
          )
          .join('')
      : `<span style="font-size:10.5px; color:var(--text-muted); font-style:italic;">Henüz tamamlanan görev yok — görev tikledikçe buraya ve takvim kutusuna otomatik işlenir.</span>`;

  const foodsSummaryHtml = dayFoods.length > 0
    ? `<div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; padding-top:5px; margin-top:5px; border-top:1px solid rgba(255,255,255,0.06);">
         <span style="font-size:10.5px; font-weight:800; color:#ffc069;">🍽️ Yediklerim (${Math.round(totalKcal)} kcal):</span>
         ${dayFoods.map((f) => `<span style="font-size:10px; padding:2px 7px; border-radius:99px; background:rgba(255,192,105,0.14); color:#ffc069; font-weight:700;">${escapeHtml(f.name)} (${f.grams}g • 🥩${f.protein}g)</span>`).join('')}
       </div>`
    : '';

  bar.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
      <div style="font-size:11.5px; font-weight:900; color:var(--accent-cream); display:flex; align-items:center; gap:6px;">
        <span>📊 ${formattedDate} — Günlük Değerlerim & Yaptığım İşler</span>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
        <span style="font-size:10.5px; padding:2px 7px; border-radius:6px; background:rgba(96,165,250,0.16); color:#93c5fd; font-weight:800;">💧 ${waterCnt}/${waterTarget} (${waterL}L)</span>
        <span style="font-size:10.5px; padding:2px 7px; border-radius:6px; background:rgba(245,216,181,0.15); color:var(--accent-cream); font-weight:800;">☕ ${log.coffeeCount || 0}</span>
        <span style="font-size:10.5px; padding:2px 7px; border-radius:6px; background:rgba(255,156,110,0.16); color:#ff9c6e; font-weight:800;">🥩 ${totalProt}g P ${totalKcal > 0 ? `(${Math.round(totalKcal)} kcal)` : ''}</span>
        <span style="font-size:10.5px; padding:2px 7px; border-radius:6px; background:rgba(216,208,248,0.16); color:var(--pastel-purple); font-weight:800;">💤 ${sleepVal}s</span>
        <span style="font-size:10.5px; padding:2px 7px; border-radius:6px; background:rgba(255,192,105,0.16); color:#ffc069; font-weight:800;">${energyIcon} ${energyLevel}</span>
        <span style="font-size:10.5px; padding:2px 7px; border-radius:6px; background:rgba(82,196,26,0.18); color:#95de64; font-weight:800;">✅ ${doneTasks.length}/${dayTasks.length} İş</span>
      </div>
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:10.5px; font-weight:800; color:var(--text-muted);">Tamamlanan İşler:</span>
      ${doneItemsHtml}
    </div>
    ${foodsSummaryHtml}
  `;
}

function openWeeklyReviewModal() {
  const modal = document.getElementById('weeklyReviewModal');
  if (!modal) return;

  const summaryBox = document.getElementById('weeklyReviewStatsSummary');
  const overdueText = document.getElementById('weeklyReviewOverdueText');
  const todayStr = getTodayISO();

  let totalTasks7d = 0;
  let doneTasks7d = 0;
  let totalWaterGlasses7d = 0;
  let totalSleep7d = 0;
  let sleepCountDays = 0;
  let totalProt7d = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const dStr = new Date(d - tzOffset).toISOString().split('T')[0];
    const log = getDailyLogForArchiveDate(dStr);
    const dayTasks = (appData.tasks || []).filter((t) => t.date === dStr);
    totalTasks7d += dayTasks.length;
    doneTasks7d += dayTasks.filter((t) => t.completed).length;
    totalWaterGlasses7d += log.waterCount || 0;
    totalProt7d += log.proteinGrams || 0;
    if (log.sleepHours) {
      totalSleep7d += Number(log.sleepHours);
      sleepCountDays++;
    }
  }

  const completionPct = totalTasks7d > 0 ? Math.round((doneTasks7d / totalTasks7d) * 100) : 0;
  const totalWaterLiters = ((totalWaterGlasses7d * 250) / 1000).toFixed(1);
  const avgSleep = sleepCountDays > 0 ? (totalSleep7d / sleepCountDays).toFixed(1) : '8.0';

  if (summaryBox) {
    summaryBox.innerHTML = `
      <div style="font-weight:900;color:var(--accent-cream);margin-bottom:8px;">📊 Son 7 Günün Otomatik Performans Karnesi:</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
        <div style="padding:8px;border-radius:10px;background:rgba(82,196,26,0.12);border:1px solid rgba(82,196,26,0.3);text-align:center;">
          <div style="font-size:16px;font-weight:900;color:#95de64;">✅ ${doneTasks7d}/${totalTasks7d} (%${completionPct})</div>
          <div style="font-size:10.5px;color:var(--text-muted);">Tamamlanan Görev</div>
        </div>
        <div style="padding:8px;border-radius:10px;background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.3);text-align:center;">
          <div style="font-size:16px;font-weight:900;color:#93c5fd;">💧 ${totalWaterLiters} Litre</div>
          <div style="font-size:10.5px;color:var(--text-muted);">Toplam Su (${totalWaterGlasses7d} Brd)</div>
        </div>
        <div style="padding:8px;border-radius:10px;background:rgba(216,208,248,0.12);border:1px solid rgba(216,208,248,0.3);text-align:center;">
          <div style="font-size:16px;font-weight:900;color:var(--pastel-purple);">💤 Ort. ${avgSleep} Saat</div>
          <div style="font-size:10.5px;color:var(--text-muted);">Uyku Ortalaması</div>
        </div>
        <div style="padding:8px;border-radius:10px;background:rgba(255,156,110,0.12);border:1px solid rgba(255,156,110,0.3);text-align:center;">
          <div style="font-size:16px;font-weight:900;color:#ff9c6e;">🥩 ${totalProt7d}g Protein</div>
          <div style="font-size:10.5px;color:var(--text-muted);">7 Günlük Protein</div>
        </div>
      </div>
    `;
  }

  const overdueTasks = (appData.tasks || []).filter((t) => !t.completed && t.date < todayStr);
  if (overdueText) {
    overdueText.textContent = overdueTasks.length === 0
      ? '🎉 Harika! Geçmiş günlerden kalan gecikmiş hiçbir görevin yok.'
      : `⏳ Geçmiş günlerden kalan ${overdueTasks.length} adet tamamlanmamış görev var.`;
  }

  modal.classList.remove('hidden');
}

function closeWeeklyReviewModal() {
  const modal = document.getElementById('weeklyReviewModal');
  if (modal) modal.classList.add('hidden');
}

function completeWeeklyReviewWizard() {
  const todayStr = getTodayISO();
  const inputs = ['weeklyTop1Input', 'weeklyTop2Input', 'weeklyTop3Input'];
  let addedCount = 0;

  inputs.forEach((id) => {
    const el = document.getElementById(id);
    const val = el ? el.value.trim() : '';
    if (val) {
      appData.tasks.unshift({
        id: 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        title: val,
        category: 'İş & Proje',
        priority: 'high',
        date: todayStr,
        time: '',
        location: '',
        link: '',
        alarmEnabled: true,
        alarmSound: 'system',
        completed: false,
        completedAt: null,
        completionEmoji: '',
        completionComment: '',
        pinned: true,
        repeat: 'none',
        tags: ['#haftalık-odak'],
        subtasks: [],
        photos: [],
        audios: [],
        desc: '🧹 Haftalık Değerlendirme Sihirbazı ile eklendi'
      });
      el.value = '';
      addedCount++;
    }
  });

  saveProfileData();
  renderAll();
  closeWeeklyReviewModal();
  if (addedCount > 0) {
    showSmartCoachPopup('🚀', 'Yeni Hafta Planın Hazır!', `Yeni haftanın ${addedCount} öncelikli hedefi bugünün listesine sabitlendi. Bu hafta senin haftan olacak, başarılar!`);
  }
}

// ===== 28. 185+ TÜRK MUTFAĞI & SPORCU BESİNİ VERİTABANI + GRAMAJLI OTOMATİK MAKRO HESAPLAYICI (v18.0) =====
// Tüm değerler 100 GRAM (100g) besin içindir: kcal, protein (g), carbs (g), fat (g), defGrams (varsayılan porsiyon gramajı)
const FOOD_DATABASE_TR = [
  // 🥚 KAHVALTILIKLAR, YUMURTA & PEYNİR (28 Besin)
  { name: 'Haşlanmış Yumurta (Tam)', cat: 'kahvalti', kcal: 155, protein: 12.6, carbs: 1.1, fat: 10.6, defGrams: 100, hint: '2 Adet ≈ 100g' },
  { name: 'Yumurta (1 Adet Orta Boy)', cat: 'kahvalti', kcal: 155, protein: 12.6, carbs: 1.1, fat: 10.6, defGrams: 50, hint: '1 Adet ≈ 50g' },
  { name: 'Yumurta Beyazı (Haşlanmış/Çiğ)', cat: 'kahvalti', kcal: 52, protein: 10.9, carbs: 0.7, fat: 0.2, defGrams: 100, hint: '3 Adet Beyaz ≈ 100g' },
  { name: 'Yumurta Sarısı', cat: 'kahvalti', kcal: 322, protein: 15.9, carbs: 3.6, fat: 26.5, defGrams: 35, hint: '2 Adet Sarı ≈ 35g' },
  { name: 'Sahanda Yumurta (Tereyağlı)', cat: 'kahvalti', kcal: 196, protein: 13.0, carbs: 0.9, fat: 15.2, defGrams: 120, hint: '1 Porsiyon ≈ 120g' },
  { name: 'Sade Omlet (2 Yumurtalı)', cat: 'kahvalti', kcal: 175, protein: 11.8, carbs: 1.2, fat: 13.5, defGrams: 120, hint: '1 Porsiyon ≈ 120g' },
  { name: 'Peynirli Omlet', cat: 'kahvalti', kcal: 215, protein: 14.5, carbs: 1.5, fat: 16.8, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Menemen (Domatesli Biberli Yumurta)', cat: 'kahvalti', kcal: 118, protein: 6.8, carbs: 4.5, fat: 8.2, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Sucuklu Yumurta', cat: 'kahvalti', kcal: 265, protein: 15.2, carbs: 1.4, fat: 22.0, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Beyaz Peynir (Tam Yağlı)', cat: 'kahvalti', kcal: 264, protein: 17.5, carbs: 2.5, fat: 21.0, defGrams: 60, hint: '2 Dilim ≈ 60g' },
  { name: 'Beyaz Peynir (Az Yağlı / Light)', cat: 'kahvalti', kcal: 158, protein: 19.5, carbs: 3.0, fat: 7.5, defGrams: 60, hint: '2 Dilim ≈ 60g' },
  { name: 'Lor Peyniri (Sporcu / Kahvaltılık)', cat: 'kahvalti', kcal: 98, protein: 14.2, carbs: 3.2, fat: 3.0, defGrams: 100, hint: '1 Kase ≈ 100g' },
  { name: 'Kaşar Peyniri (Taze/Eski)', cat: 'kahvalti', kcal: 355, protein: 25.0, carbs: 1.8, fat: 27.5, defGrams: 40, hint: '2 Dilim ≈ 40g' },
  { name: 'Süzme Peynir', cat: 'kahvalti', kcal: 235, protein: 14.0, carbs: 3.2, fat: 18.5, defGrams: 60, hint: '2 Dilim ≈ 60g' },
  { name: 'Çeçil / Tel / Dil Peyniri', cat: 'kahvalti', kcal: 280, protein: 23.5, carbs: 1.5, fat: 20.0, defGrams: 50, hint: '1 Porsiyon ≈ 50g' },
  { name: 'Hellim Peyniri (Izgara)', cat: 'kahvalti', kcal: 320, protein: 21.0, carbs: 2.0, fat: 25.0, defGrams: 60, hint: '2 Dilim ≈ 60g' },
  { name: 'Labne Peyniri', cat: 'kahvalti', kcal: 205, protein: 5.5, carbs: 4.5, fat: 18.5, defGrams: 30, hint: '1 Yemek Kaşığı ≈ 30g' },
  { name: 'Cottage Cheese (Köy Peyniri)', cat: 'kahvalti', kcal: 98, protein: 11.1, carbs: 3.4, fat: 4.3, defGrams: 100, hint: '100g' },
  { name: 'Siyah Zeytin', cat: 'kahvalti', kcal: 235, protein: 1.5, carbs: 4.0, fat: 24.0, defGrams: 30, hint: '7-8 Adet ≈ 30g' },
  { name: 'Yeşil Zeytin', cat: 'kahvalti', kcal: 145, protein: 1.2, carbs: 3.8, fat: 15.0, defGrams: 30, hint: '7-8 Adet ≈ 30g' },
  { name: 'Fıstık Ezmesi (Şekersiz %100)', cat: 'kahvalti', kcal: 588, protein: 25.8, carbs: 16.0, fat: 50.0, defGrams: 30, hint: '1 Yemek Kaşığı ≈ 30g' },
  { name: 'Fındık Ezmesi', cat: 'kahvalti', kcal: 610, protein: 14.5, carbs: 22.0, fat: 52.0, defGrams: 25, hint: '1 Yemek Kaşığı ≈ 25g' },
  { name: 'Tahin', cat: 'kahvalti', kcal: 595, protein: 17.0, carbs: 21.0, fat: 53.0, defGrams: 20, hint: '1 Yemek Kaşığı ≈ 20g' },
  { name: 'Üzüm / Keçiboynuzu Pekmezi', cat: 'kahvalti', kcal: 290, protein: 1.2, carbs: 71.0, fat: 0.2, defGrams: 20, hint: '1 Yemek Kaşığı ≈ 20g' },
  { name: 'Süzme Çiçek / Çam Balı', cat: 'kahvalti', kcal: 304, protein: 0.3, carbs: 82.4, fat: 0.0, defGrams: 20, hint: '1 Yemek Kaşığı ≈ 20g' },
  { name: 'Tereyağı (Doğal)', cat: 'kahvalti', kcal: 717, protein: 0.9, carbs: 0.1, fat: 81.1, defGrams: 15, hint: '1 Tatlı Kaşığı ≈ 15g' },
  { name: 'Kaymak', cat: 'kahvalti', kcal: 585, protein: 2.2, carbs: 3.0, fat: 62.0, defGrams: 30, hint: '1 Porsiyon ≈ 30g' },
  { name: 'Çilek / Vişne Reçeli', cat: 'kahvalti', kcal: 278, protein: 0.4, carbs: 69.0, fat: 0.1, defGrams: 20, hint: '1 Yemek Kaşığı ≈ 20g' },

  // 🍗 TAVUK, HİNDİ, KIRMIZI ET & BALIK (38 Besin)
  { name: 'Tavuk Göğsü (Haşlama / Izgara Pişmiş)', cat: 'et', kcal: 165, protein: 31.0, carbs: 0.0, fat: 3.6, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Tavuk Göğsü (Çiğ Tartım)', cat: 'et', kcal: 120, protein: 22.5, carbs: 0.0, fat: 2.6, defGrams: 200, hint: '200g Çiğ' },
  { name: 'Tavuk Sote (Biberli Domatesli Soğanlı)', cat: 'et', kcal: 145, protein: 19.0, carbs: 3.5, fat: 6.0, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Tavuk But / Kalça (Izgara / Fırın)', cat: 'et', kcal: 209, protein: 26.0, carbs: 0.0, fat: 10.9, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Tavuk Pirzola (Izgara)', cat: 'et', kcal: 215, protein: 25.0, carbs: 0.0, fat: 12.2, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Tavuk Şiş (Izgara)', cat: 'et', kcal: 178, protein: 28.5, carbs: 0.5, fat: 6.4, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Tavuk Kanat (Izgara / Fırın)', cat: 'et', kcal: 266, protein: 23.5, carbs: 0.0, fat: 18.5, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Tavuk Döner (Ekmeksiz Porsiyon)', cat: 'et', kcal: 215, protein: 24.5, carbs: 2.0, fat: 12.0, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Tavuk Tantuni (Lavaşlı)', cat: 'et', kcal: 220, protein: 16.5, carbs: 21.0, fat: 7.5, defGrams: 200, hint: '1 Dürüm ≈ 200g' },
  { name: 'Tavuk Ciğeri (Sote/Haşlama)', cat: 'et', kcal: 167, protein: 24.5, carbs: 0.9, fat: 6.5, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Hindi Göğsü (Haşlama / Izgara)', cat: 'et', kcal: 135, protein: 29.5, carbs: 0.0, fat: 1.5, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Hindi Füme (Şarküteri)', cat: 'et', kcal: 108, protein: 18.5, carbs: 2.0, fat: 2.5, defGrams: 60, hint: '3-4 Dilim ≈ 60g' },
  { name: 'Dana Bonfile / Biftek (Izgara)', cat: 'et', kcal: 218, protein: 28.5, carbs: 0.0, fat: 11.0, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Dana Antrikot (Izgara)', cat: 'et', kcal: 271, protein: 25.5, carbs: 0.0, fat: 18.5, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Dana Kuşbaşı (Yağsız Pişmiş)', cat: 'et', kcal: 205, protein: 29.0, carbs: 0.0, fat: 9.2, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Et Sote (Biberli Domatesli Dana)', cat: 'et', kcal: 175, protein: 18.5, carbs: 3.8, fat: 9.5, defGrams: 220, hint: '1 Tabak ≈ 220g' },
  { name: 'Dana Kıyma (Az Yağlı Pişmiş %10)', cat: 'et', kcal: 212, protein: 26.5, carbs: 0.0, fat: 11.2, defGrams: 150, hint: '150g' },
  { name: 'Dana Kıyma (Orta Yağlı Pişmiş %20)', cat: 'et', kcal: 254, protein: 24.0, carbs: 0.0, fat: 17.0, defGrams: 150, hint: '150g' },
  { name: 'Izgara Köfte / Anne Köftesi', cat: 'et', kcal: 245, protein: 21.0, carbs: 6.5, fat: 15.0, defGrams: 180, hint: '5-6 Adet ≈ 180g' },
  { name: 'İnegöl / Kasap Köfte', cat: 'et', kcal: 268, protein: 20.5, carbs: 5.0, fat: 18.2, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Kuzu Pirzola (Izgara)', cat: 'et', kcal: 295, protein: 24.5, carbs: 0.0, fat: 21.5, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Kuzu Şiş (Izgara)', cat: 'et', kcal: 248, protein: 26.0, carbs: 0.5, fat: 15.5, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Adana / Urfa Kebap (Porsiyon)', cat: 'et', kcal: 285, protein: 21.5, carbs: 2.0, fat: 21.0, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Et Döner / İskender Eti (Ekmeksiz)', cat: 'et', kcal: 260, protein: 25.0, carbs: 1.5, fat: 17.0, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Dana Kavurma', cat: 'et', kcal: 315, protein: 28.0, carbs: 0.0, fat: 22.5, defGrams: 120, hint: '1 Porsiyon ≈ 120g' },
  { name: 'Dana Sucuk', cat: 'et', kcal: 452, protein: 17.5, carbs: 2.0, fat: 41.5, defGrams: 50, hint: '50g' },
  { name: 'Kayseri Pastırması', cat: 'et', kcal: 250, protein: 29.0, carbs: 1.0, fat: 14.0, defGrams: 40, hint: '4-5 Dilim ≈ 40g' },
  { name: 'Arnavut Ciğeri (Dana Ciğer)', cat: 'et', kcal: 215, protein: 23.0, carbs: 6.0, fat: 11.0, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Somon Balığı (Izgara / Fırın)', cat: 'et', kcal: 208, protein: 22.5, carbs: 0.0, fat: 13.0, defGrams: 200, hint: '1 Fileto ≈ 200g' },
  { name: 'Ton Balığı (Konserve Suda / Süzülmüş)', cat: 'et', kcal: 116, protein: 25.5, carbs: 0.0, fat: 1.0, defGrams: 120, hint: '1 Konserve ≈ 120g' },
  { name: 'Ton Balığı (Konserve Yağlı / Süzülmüş)', cat: 'et', kcal: 198, protein: 26.5, carbs: 0.0, fat: 10.0, defGrams: 100, hint: '1 Konserve ≈ 100g' },
  { name: 'Levrek (Izgara / Fırın)', cat: 'et', kcal: 124, protein: 23.6, carbs: 0.0, fat: 2.6, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Çupra / Çipura (Izgara / Fırın)', cat: 'et', kcal: 135, protein: 21.5, carbs: 0.0, fat: 5.2, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Hamsi (Fırın / Buğulama)', cat: 'et', kcal: 131, protein: 20.4, carbs: 0.0, fat: 4.8, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Hamsi Tava (Mısır Unlu)', cat: 'et', kcal: 225, protein: 19.0, carbs: 9.5, fat: 12.5, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Uskumru / Palamut (Izgara)', cat: 'et', kcal: 205, protein: 23.0, carbs: 0.0, fat: 12.0, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Alabalık (Izgara / Fırın)', cat: 'et', kcal: 148, protein: 20.8, carbs: 0.0, fat: 6.6, defGrams: 220, hint: '1 Porsiyon ≈ 220g' },
  { name: 'Karides (Tereyağlı / Izgara)', cat: 'et', kcal: 119, protein: 22.8, carbs: 1.2, fat: 2.2, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },

  // 🍲 EV YEMEKLERİ, ÇORBALAR, BAKLİYATLAR & GELENEKSEL LEZZETLER (36 Besin)
  { name: 'Kuru Fasulye Yemeği (Etli)', cat: 'yemek', kcal: 138, protein: 8.8, carbs: 15.5, fat: 4.5, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Kuru Fasulye Yemeği (Etsiz)', cat: 'yemek', kcal: 118, protein: 7.2, carbs: 16.5, fat: 2.8, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Nohut Yemeği (Etli)', cat: 'yemek', kcal: 148, protein: 8.9, carbs: 17.2, fat: 4.9, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Yeşil Mercimek Yemeği', cat: 'yemek', kcal: 116, protein: 8.5, carbs: 16.8, fat: 1.8, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Barbunya Pilaki (Zeytinyağlı)', cat: 'yemek', kcal: 132, protein: 6.5, carbs: 16.0, fat: 4.8, defGrams: 200, hint: '1 Tabak ≈ 200g' },
  { name: 'Mercimek Çorbası', cat: 'yemek', kcal: 68, protein: 4.2, carbs: 9.5, fat: 1.6, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Ezogelin Çorbası', cat: 'yemek', kcal: 72, protein: 3.8, carbs: 10.5, fat: 1.8, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Tarhana Çorbası', cat: 'yemek', kcal: 65, protein: 2.9, carbs: 9.2, fat: 1.8, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Yayla Çorbası (Yoğurtlu)', cat: 'yemek', kcal: 62, protein: 2.8, carbs: 7.5, fat: 2.2, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Tavuk Suyu / Şehriye Çorbası', cat: 'yemek', kcal: 58, protein: 4.8, carbs: 6.2, fat: 1.5, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Domates Çorbası (Kaşarlı)', cat: 'yemek', kcal: 64, protein: 2.4, carbs: 8.0, fat: 2.5, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'İşkembe / Kelle Paça Çorbası', cat: 'yemek', kcal: 115, protein: 11.5, carbs: 2.5, fat: 6.5, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Kıymalı Taze Fasulye Yemeği', cat: 'yemek', kcal: 88, protein: 5.8, carbs: 6.2, fat: 4.5, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Zeytinyağlı Taze Fasulye', cat: 'yemek', kcal: 65, protein: 1.8, carbs: 6.8, fat: 3.5, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Kıymalı Ispanak Yemeği', cat: 'yemek', kcal: 92, protein: 6.5, carbs: 4.8, fat: 5.2, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Kıymalı Kabak Yemeği', cat: 'yemek', kcal: 84, protein: 5.6, carbs: 5.2, fat: 4.5, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Kıymalı Karnabahar Yemeği', cat: 'yemek', kcal: 86, protein: 6.0, carbs: 5.0, fat: 4.6, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Zeytinyağlı Pırasa Yemeği', cat: 'yemek', kcal: 74, protein: 1.5, carbs: 8.5, fat: 3.8, defGrams: 220, hint: '1 Tabak ≈ 220g' },
  { name: 'Karnıyarık (Kıymalı Patlıcan)', cat: 'yemek', kcal: 142, protein: 7.5, carbs: 6.5, fat: 9.8, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Patlıcan Musakka', cat: 'yemek', kcal: 128, protein: 7.2, carbs: 6.8, fat: 8.2, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Kıymalı Biber Dolması', cat: 'yemek', kcal: 124, protein: 6.8, carbs: 12.5, fat: 5.2, defGrams: 220, hint: '2 Adet ≈ 220g' },
  { name: 'Zeytinyağlı Yaprak Sarma', cat: 'yemek', kcal: 158, protein: 3.2, carbs: 21.0, fat: 6.8, defGrams: 150, hint: '6-7 Adet ≈ 150g' },
  { name: 'Etli Yaprak Sarma', cat: 'yemek', kcal: 168, protein: 9.2, carbs: 14.5, fat: 8.2, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'İzmir Köfte (Fırında Patatesli)', cat: 'yemek', kcal: 152, protein: 10.5, carbs: 10.8, fat: 7.5, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Tas Kebabı (Etli Patatesli)', cat: 'yemek', kcal: 164, protein: 13.5, carbs: 8.5, fat: 8.5, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Bezelye Yemeği (Etli/Tavuklu)', cat: 'yemek', kcal: 112, protein: 8.2, carbs: 11.5, fat: 3.8, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Mantı (Yoğurtlu Soslu)', cat: 'yemek', kcal: 195, protein: 9.2, carbs: 26.5, fat: 5.8, defGrams: 250, hint: '1 Tabak ≈ 250g' },
  { name: 'Lahmacun', cat: 'yemek', kcal: 235, protein: 11.5, carbs: 28.0, fat: 8.5, defGrams: 130, hint: '1 Adet ≈ 130g' },
  { name: 'Kıymalı / Kuşbaşılı Pide', cat: 'yemek', kcal: 255, protein: 13.5, carbs: 29.0, fat: 9.5, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Kaşarlı Pide', cat: 'yemek', kcal: 278, protein: 13.0, carbs: 30.0, fat: 11.5, defGrams: 250, hint: '1 Porsiyon ≈ 250g' },
  { name: 'Çiğ Köfte (Etsiz Bulgurlu)', cat: 'yemek', kcal: 185, protein: 4.8, carbs: 32.0, fat: 4.2, defGrams: 150, hint: '6-7 Sıkım ≈ 150g' },
  { name: 'Kısır', cat: 'yemek', kcal: 162, protein: 4.2, carbs: 25.5, fat: 4.8, defGrams: 180, hint: '1 Kase ≈ 180g' },
  { name: 'Mercimek Köftesi', cat: 'yemek', kcal: 158, protein: 6.5, carbs: 24.5, fat: 3.8, defGrams: 150, hint: '5-6 Adet ≈ 150g' },
  { name: 'Humus (Nohut Ezmesi)', cat: 'yemek', kcal: 177, protein: 7.9, carbs: 14.3, fat: 9.6, defGrams: 100, hint: '1 Porsiyon ≈ 100g' },
  { name: 'Kabak Mücver', cat: 'yemek', kcal: 165, protein: 5.8, carbs: 12.0, fat: 10.5, defGrams: 150, hint: '3 Adet ≈ 150g' },
  { name: 'Şakşuka', cat: 'yemek', kcal: 135, protein: 2.2, carbs: 8.5, fat: 10.2, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },

  // 🍚 PİLAV, MAKARNA, YULAF, TAHIL & EKMEKLER (24 Besin)
  { name: 'Pirinç Pilavı (Tereyağlı / Şehriyeli)', cat: 'tahil', kcal: 158, protein: 3.0, carbs: 28.5, fat: 3.5, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Haşlanmış Beyaz Pirinç / Lapa (Yağsız)', cat: 'tahil', kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, defGrams: 200, hint: '1 Tabak ≈ 200g' },
  { name: 'Basmati / Yasemin Pirinç (Pişmiş)', cat: 'tahil', kcal: 125, protein: 3.1, carbs: 26.8, fat: 0.4, defGrams: 200, hint: '1 Porsiyon ≈ 200g' },
  { name: 'Bulgur Pilavı (Domatesli Biberli)', cat: 'tahil', kcal: 135, protein: 4.2, carbs: 24.5, fat: 2.4, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Haşlanmış Bulgur (Sade Sporcu)', cat: 'tahil', kcal: 112, protein: 3.8, carbs: 23.0, fat: 0.4, defGrams: 200, hint: '200g Pişmiş' },
  { name: 'Karabuğday / Greçka (Haşlanmış)', cat: 'tahil', kcal: 110, protein: 4.2, carbs: 21.5, fat: 0.8, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Kinoa (Haşlanmış)', cat: 'tahil', kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Yulaf Ezmesi (Kuru Tartım)', cat: 'tahil', kcal: 375, protein: 13.2, carbs: 62.0, fat: 6.8, defGrams: 60, hint: '6 Yemek Kaşığı ≈ 60g' },
  { name: 'Sütlü Yulaf Lapası (Porridge)', cat: 'tahil', kcal: 115, protein: 4.8, carbs: 17.5, fat: 2.6, defGrams: 250, hint: '1 Kase ≈ 250g' },
  { name: 'Granola / Müsli', cat: 'tahil', kcal: 425, protein: 9.5, carbs: 64.0, fat: 14.0, defGrams: 50, hint: '1 Kase ≈ 50g' },
  { name: 'Haşlanmış Makarna (Sade)', cat: 'tahil', kcal: 155, protein: 5.6, carbs: 30.8, fat: 0.9, defGrams: 200, hint: '1 Tabak ≈ 200g' },
  { name: 'Salçalı / Domates Soslu Makarna', cat: 'tahil', kcal: 168, protein: 5.4, carbs: 29.5, fat: 3.2, defGrams: 200, hint: '1 Tabak ≈ 200g' },
  { name: 'Kıymalı Makarna', cat: 'tahil', kcal: 192, protein: 9.8, carbs: 24.5, fat: 6.2, defGrams: 220, hint: '1 Tabak ≈ 220g' },
  { name: 'Tam Buğday / Kepekli Makarna (Pişmiş)', cat: 'tahil', kcal: 142, protein: 5.8, carbs: 27.5, fat: 0.9, defGrams: 200, hint: '1 Tabak ≈ 200g' },
  { name: 'Erişte (Tereyağlı / Cevizli)', cat: 'tahil', kcal: 185, protein: 6.2, carbs: 29.0, fat: 4.8, defGrams: 180, hint: '1 Tabak ≈ 180g' },
  { name: 'Tam Buğday Ekmeği', cat: 'tahil', kcal: 247, protein: 10.5, carbs: 43.0, fat: 3.2, defGrams: 50, hint: '2 İnce Dilim ≈ 50g' },
  { name: 'Çavdar / Karabuğday Ekmeği', cat: 'tahil', kcal: 250, protein: 8.8, carbs: 46.5, fat: 2.8, defGrams: 50, hint: '2 Dilim ≈ 50g' },
  { name: 'Ekşi Mayalı Köy Ekmeği', cat: 'tahil', kcal: 255, protein: 9.0, carbs: 49.0, fat: 1.8, defGrams: 50, hint: '1 Kalın Dilim ≈ 50g' },
  { name: 'Beyaz Ekmek', cat: 'tahil', kcal: 265, protein: 8.5, carbs: 51.0, fat: 2.5, defGrams: 50, hint: '2 Dilim ≈ 50g' },
  { name: 'Lavaş / Tortilla Dürüm Ekmeği', cat: 'tahil', kcal: 295, protein: 8.2, carbs: 54.0, fat: 4.5, defGrams: 65, hint: '1 Adet Lavaş ≈ 65g' },
  { name: 'Pirinç Patlağı (Rice Cake)', cat: 'tahil', kcal: 382, protein: 8.0, carbs: 81.0, fat: 2.8, defGrams: 20, hint: '2 Adet ≈ 20g' },
  { name: 'Simit (Susamlı)', cat: 'tahil', kcal: 325, protein: 10.5, carbs: 54.0, fat: 7.5, defGrams: 100, hint: '1 Adet Simit ≈ 100g' },
  { name: 'Peynirli Su Böreği / Tepsi Böreği', cat: 'tahil', kcal: 275, protein: 9.8, carbs: 28.5, fat: 13.5, defGrams: 150, hint: '1 Dilim ≈ 150g' },
  { name: 'Peynirli / Zeytinli Poğaça', cat: 'tahil', kcal: 345, protein: 7.5, carbs: 41.0, fat: 16.5, defGrams: 80, hint: '1 Adet ≈ 80g' },

  // 🥦 SEBZELER, BİBER, SOĞAN, PATATES & SALATALAR (32 Besin)
  { name: 'Yeşil Biber (Sivri / Çarliston)', cat: 'sebze', kcal: 20, protein: 0.9, carbs: 4.6, fat: 0.2, defGrams: 50, hint: '2 Adet Biber ≈ 50g' },
  { name: 'Kırmızı Kapya Biber (Çiğ / Közlenmiş)', cat: 'sebze', kcal: 31, protein: 1.0, carbs: 6.0, fat: 0.3, defGrams: 80, hint: '1 Büyük Kapya ≈ 80g' },
  { name: 'Dolmalık Biber', cat: 'sebze', kcal: 22, protein: 0.9, carbs: 4.8, fat: 0.2, defGrams: 60, hint: '1-2 Adet ≈ 60g' },
  { name: 'Kuru Soğan (Çiğ / Yemeklik)', cat: 'sebze', kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, defGrams: 75, hint: '1 Orta Boy Soğan ≈ 75g' },
  { name: 'Taze Yeşil Soğan', cat: 'sebze', kcal: 32, protein: 1.8, carbs: 7.3, fat: 0.2, defGrams: 40, hint: '3-4 Dal ≈ 40g' },
  { name: 'Soğan & Biber Sote (Zeytinyağlı Pişmiş)', cat: 'sebze', kcal: 78, protein: 1.3, carbs: 8.5, fat: 4.2, defGrams: 100, hint: '1 Porsiyon ≈ 100g' },
  { name: 'Domates', cat: 'sebze', kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, defGrams: 120, hint: '1 Orta Domates ≈ 120g' },
  { name: 'Çeri (Cherry) Domates', cat: 'sebze', kcal: 20, protein: 1.0, carbs: 4.2, fat: 0.2, defGrams: 100, hint: '6-7 Adet ≈ 100g' },
  { name: 'Salatalık (Hıyar)', cat: 'sebze', kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1, defGrams: 120, hint: '1 Adet ≈ 120g' },
  { name: 'Kıvırcık Marul / Göbek Salata', cat: 'sebze', kcal: 15, protein: 1.4, carbs: 2.9, fat: 0.2, defGrams: 80, hint: '1 Kase ≈ 80g' },
  { name: 'Roka / Maydanoz / Dereotu / Yeşillik', cat: 'sebze', kcal: 25, protein: 2.6, carbs: 3.7, fat: 0.6, defGrams: 50, hint: '1 Demet/Kase ≈ 50g' },
  { name: 'Havuç (Çiğ / Rendelenmiş)', cat: 'sebze', kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2, defGrams: 80, hint: '1 Orta Havuç ≈ 80g' },
  { name: 'Brokoli (Haşlanmış / Buharda)', cat: 'sebze', kcal: 35, protein: 2.4, carbs: 7.2, fat: 0.4, defGrams: 150, hint: '1 Tabak ≈ 150g' },
  { name: 'Karnabahar (Haşlanmış / Fırın)', cat: 'sebze', kcal: 25, protein: 1.9, carbs: 5.0, fat: 0.3, defGrams: 150, hint: '1 Tabak ≈ 150g' },
  { name: 'Kabak (Izgara / Haşlama)', cat: 'sebze', kcal: 19, protein: 1.2, carbs: 3.5, fat: 0.3, defGrams: 150, hint: '1 Adet ≈ 150g' },
  { name: 'Patlıcan (Közlenmiş / Izgara)', cat: 'sebze', kcal: 35, protein: 1.0, carbs: 8.2, fat: 0.2, defGrams: 150, hint: '1 Porsiyon ≈ 150g' },
  { name: 'Ispanak (Çiğ / Haşlanmış)', cat: 'sebze', kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, defGrams: 100, hint: '100g' },
  { name: 'Kültür Mantarı (Çiğ / Izgara)', cat: 'sebze', kcal: 22, protein: 3.1, carbs: 3.3, fat: 0.3, defGrams: 100, hint: '100g' },
  { name: 'Mantar Sote (Biberli Soğanlı)', cat: 'sebze', kcal: 68, protein: 3.5, carbs: 5.2, fat: 3.8, defGrams: 180, hint: '1 Tabak ≈ 180g' },
  { name: 'Haşlanmış Patates', cat: 'sebze', kcal: 87, protein: 1.9, carbs: 20.1, fat: 0.1, defGrams: 200, hint: '1 Orta/Büyük ≈ 200g' },
  { name: 'Fırında Elma Dilim Patates', cat: 'sebze', kcal: 128, protein: 2.4, carbs: 22.5, fat: 3.2, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Patates Kızartması', cat: 'sebze', kcal: 312, protein: 3.4, carbs: 41.0, fat: 15.0, defGrams: 120, hint: '1 Porsiyon ≈ 120g' },
  { name: 'Tatlı Patates (Fırın / Haşlama)', cat: 'sebze', kcal: 86, protein: 1.6, carbs: 20.1, fat: 0.1, defGrams: 180, hint: '1 Porsiyon ≈ 180g' },
  { name: 'Haşlanmış Mısır (Tane)', cat: 'sebze', kcal: 96, protein: 3.4, carbs: 21.0, fat: 1.5, defGrams: 100, hint: '1 Kase ≈ 100g' },
  { name: 'Haşlanmış Bezelye', cat: 'sebze', kcal: 81, protein: 5.4, carbs: 14.5, fat: 0.4, defGrams: 100, hint: '1 Kase ≈ 100g' },
  { name: 'Avokado', cat: 'sebze', kcal: 160, protein: 2.0, carbs: 8.5, fat: 14.7, defGrams: 100, hint: 'Yarım/Tam ≈ 100g' },
  { name: 'Sarımsak', cat: 'sebze', kcal: 149, protein: 6.4, carbs: 33.1, fat: 0.5, defGrams: 10, hint: '2-3 Diş ≈ 10g' },
  { name: 'Brüksel Lahanası / Kuşkonmaz', cat: 'sebze', kcal: 38, protein: 3.0, carbs: 7.0, fat: 0.3, defGrams: 120, hint: '1 Porsiyon ≈ 120g' },
  { name: 'Pancar (Haşlanmış / Turşu)', cat: 'sebze', kcal: 43, protein: 1.6, carbs: 9.6, fat: 0.2, defGrams: 100, hint: '100g' },
  { name: 'Çoban Salata (Zeytinyağlı)', cat: 'sebze', kcal: 48, protein: 1.0, carbs: 4.5, fat: 3.0, defGrams: 200, hint: '1 Kase ≈ 200g' },
  { name: 'Mevsim / Yeşil Salata (Az Yağlı)', cat: 'sebze', kcal: 38, protein: 1.2, carbs: 4.0, fat: 2.0, defGrams: 180, hint: '1 Kase ≈ 180g' },
  { name: 'Ton Balıklı / Tavuklu Salata', cat: 'sebze', kcal: 112, protein: 14.5, carbs: 4.8, fat: 3.8, defGrams: 280, hint: '1 Büyük Kase ≈ 280g' },

  // 🍎 MEYVELER & KURUYEMİŞLER (30 Besin)
  { name: 'Muz', cat: 'meyve', kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, defGrams: 120, hint: '1 Orta Muz ≈ 120g' },
  { name: 'Elma (Kırmızı / Yeşil)', cat: 'meyve', kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2, defGrams: 150, hint: '1 Orta Elma ≈ 150g' },
  { name: 'Portakal', cat: 'meyve', kcal: 47, protein: 0.9, carbs: 11.8, fat: 0.1, defGrams: 160, hint: '1 Adet ≈ 160g' },
  { name: 'Mandalina', cat: 'meyve', kcal: 53, protein: 0.8, carbs: 13.3, fat: 0.3, defGrams: 100, hint: '2 Küçük Adet ≈ 100g' },
  { name: 'Çilek', cat: 'meyve', kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3, defGrams: 150, hint: '1 Kase ≈ 150g' },
  { name: 'Karpuz', cat: 'meyve', kcal: 30, protein: 0.6, carbs: 7.6, fat: 0.2, defGrams: 250, hint: '1 Dilim ≈ 250g' },
  { name: 'Kavun', cat: 'meyve', kcal: 34, protein: 0.8, carbs: 8.2, fat: 0.2, defGrams: 200, hint: '1 Dilim ≈ 200g' },
  { name: 'Üzüm (Yeşil / Siyah)', cat: 'meyve', kcal: 69, protein: 0.7, carbs: 18.1, fat: 0.2, defGrams: 120, hint: '1 Küçük Salkım ≈ 120g' },
  { name: 'Şeftali / Nektarin', cat: 'meyve', kcal: 39, protein: 0.9, carbs: 9.5, fat: 0.3, defGrams: 150, hint: '1 Adet ≈ 150g' },
  { name: 'Kayısı (Taze)', cat: 'meyve', kcal: 48, protein: 1.4, carbs: 11.1, fat: 0.4, defGrams: 100, hint: '3-4 Adet ≈ 100g' },
  { name: 'Kuru Kayısı / Gün Kurusu', cat: 'meyve', kcal: 241, protein: 3.4, carbs: 62.6, fat: 0.5, defGrams: 40, hint: '4 Adet ≈ 40g' },
  { name: 'Kuru İncir', cat: 'meyve', kcal: 249, protein: 3.3, carbs: 63.9, fat: 0.9, defGrams: 40, hint: '2 Adet ≈ 40g' },
  { name: 'Hurma (Medine / Kudüs)', cat: 'meyve', kcal: 282, protein: 2.5, carbs: 75.0, fat: 0.4, defGrams: 30, hint: '3 Adet Hurma ≈ 30g' },
  { name: 'Kivi', cat: 'meyve', kcal: 61, protein: 1.1, carbs: 14.7, fat: 0.5, defGrams: 90, hint: '1 Adet ≈ 90g' },
  { name: 'Ananas', cat: 'meyve', kcal: 50, protein: 0.5, carbs: 13.1, fat: 0.1, defGrams: 150, hint: '2 Dilim ≈ 150g' },
  { name: 'Yaban Mersini (Blueberry)', cat: 'meyve', kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3, defGrams: 100, hint: '1 Küçük Kase ≈ 100g' },
  { name: 'Kiraz / Vişne', cat: 'meyve', kcal: 63, protein: 1.1, carbs: 16.0, fat: 0.2, defGrams: 120, hint: '1 Kase ≈ 120g' },
  { name: 'Erik (Yeşil / Kırmızı)', cat: 'meyve', kcal: 46, protein: 0.7, carbs: 11.4, fat: 0.3, defGrams: 100, hint: '1 Kase ≈ 100g' },
  { name: 'Armut', cat: 'meyve', kcal: 57, protein: 0.4, carbs: 15.2, fat: 0.1, defGrams: 160, hint: '1 Adet ≈ 160g' },
  { name: 'Nar (Ayıklanmış)', cat: 'meyve', kcal: 83, protein: 1.7, carbs: 18.7, fat: 1.2, defGrams: 120, hint: '1 Kase ≈ 120g' },
  { name: 'Ceviz İçi', cat: 'meyve', kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2, defGrams: 30, hint: '1 Avuç (5-6 Tam) ≈ 30g' },
  { name: 'Çiğ Badem', cat: 'meyve', kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9, defGrams: 30, hint: '1 Avuç (20 Adet) ≈ 30g' },
  { name: 'Kavrulmuş / Çiğ Fındık', cat: 'meyve', kcal: 628, protein: 15.0, carbs: 16.7, fat: 60.8, defGrams: 30, hint: '1 Avuç ≈ 30g' },
  { name: 'Yer Fıstığı', cat: 'meyve', kcal: 567, protein: 25.8, carbs: 16.1, fat: 49.2, defGrams: 30, hint: '1 Avuç ≈ 30g' },
  { name: 'Kaju', cat: 'meyve', kcal: 553, protein: 18.2, carbs: 30.2, fat: 43.9, defGrams: 30, hint: '1 Avuç ≈ 30g' },
  { name: 'Antep Fıstığı', cat: 'meyve', kcal: 560, protein: 20.2, carbs: 27.2, fat: 45.3, defGrams: 30, hint: '1 Avuç ≈ 30g' },
  { name: 'Kabak Çekirdeği İçi', cat: 'meyve', kcal: 559, protein: 30.2, carbs: 10.7, fat: 49.0, defGrams: 30, hint: '1 Avuç ≈ 30g' },
  { name: 'Ay Çekirdeği İçi', cat: 'meyve', kcal: 584, protein: 20.8, carbs: 20.0, fat: 51.5, defGrams: 30, hint: '1 Avuç ≈ 30g' },
  { name: 'Chia Tohumu', cat: 'meyve', kcal: 486, protein: 16.5, carbs: 42.1, fat: 30.7, defGrams: 15, hint: '1 Yemek Kaşığı ≈ 15g' },
  { name: 'Keten Tohumu', cat: 'meyve', kcal: 534, protein: 18.3, carbs: 28.9, fat: 42.2, defGrams: 15, hint: '1 Yemek Kaşığı ≈ 15g' },

  // 🥛 SÜT ÜRÜNLERİ, YAĞLAR, TATLILAR & SPORCU SUPPLEMENTLERİ (20 Besin)
  { name: 'Ev Yoğurdu / Tam Yağlı Yoğurt', cat: 'sut', kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3, defGrams: 200, hint: '1 Kase ≈ 200g' },
  { name: 'Süzme Yoğurt', cat: 'sut', kcal: 115, protein: 8.5, carbs: 4.2, fat: 7.0, defGrams: 150, hint: '1 Kase ≈ 150g' },
  { name: 'Yüksek Proteinli Sporcu Yoğurdu / Quark', cat: 'sut', kcal: 72, protein: 10.5, carbs: 4.0, fat: 1.2, defGrams: 150, hint: '1 Kutu ≈ 150g' },
  { name: 'Cacık (Yoğurtlu Salatalıklı)', cat: 'sut', kcal: 45, protein: 2.5, carbs: 3.8, fat: 2.2, defGrams: 200, hint: '1 Kase ≈ 200g' },
  { name: 'Ayran', cat: 'sut', kcal: 37, protein: 2.0, carbs: 2.8, fat: 2.0, defGrams: 250, hint: '1 Bardak ≈ 250ml' },
  { name: 'Kefir (Sade)', cat: 'sut', kcal: 52, protein: 3.3, carbs: 4.5, fat: 2.4, defGrams: 250, hint: '1 Bardak ≈ 250ml' },
  { name: 'Tam Yağlı Süt', cat: 'sut', kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, defGrams: 200, hint: '1 Su Bardağı ≈ 200ml' },
  { name: 'Yarım Yağlı / Light Süt', cat: 'sut', kcal: 46, protein: 3.3, carbs: 4.9, fat: 1.5, defGrams: 200, hint: '1 Su Bardağı ≈ 200ml' },
  { name: 'Proteinli Süt (Kakaolu/Vanilyalı)', cat: 'sut', kcal: 62, protein: 7.0, carbs: 5.2, fat: 1.2, defGrams: 500, hint: '1 Şişe ≈ 500ml' },
  { name: 'Zeytinyağı (Sızma)', cat: 'sut', kcal: 884, protein: 0.0, carbs: 0.0, fat: 100.0, defGrams: 10, hint: '1 Yemek Kaşığı ≈ 10g' },
  { name: 'Hindistan Cevizi Yağı', cat: 'sut', kcal: 862, protein: 0.0, carbs: 0.0, fat: 100.0, defGrams: 10, hint: '1 Yemek Kaşığı ≈ 10g' },
  { name: 'Whey Protein Tozu (1 Ölçek ≈ 30g)', cat: 'sut', kcal: 390, protein: 78.0, carbs: 7.0, fat: 5.5, defGrams: 30, hint: '1 Ölçek ≈ 30g (23.4g P)' },
  { name: 'İzole Whey Protein Tozu', cat: 'sut', kcal: 375, protein: 86.0, carbs: 2.5, fat: 1.5, defGrams: 30, hint: '1 Ölçek ≈ 30g (25.8g P)' },
  { name: 'Casein (Kazein) Protein Tozu', cat: 'sut', kcal: 365, protein: 76.0, carbs: 6.0, fat: 3.0, defGrams: 30, hint: '1 Ölçek ≈ 30g' },
  { name: 'Protein Bar (Şekersiz Sporcu Barı)', cat: 'sut', kcal: 360, protein: 34.0, carbs: 32.0, fat: 11.0, defGrams: 60, hint: '1 Bar ≈ 60g (20g P)' },
  { name: 'Gainer (Karbonhidrat & Kilo Hacim Tozu)', cat: 'sut', kcal: 385, protein: 18.0, carbs: 72.0, fat: 2.5, defGrams: 100, hint: '1 Servis ≈ 100g' },
  { name: 'Bitter Çikolata (%70-%80 Kakao)', cat: 'sut', kcal: 598, protein: 7.8, carbs: 45.9, fat: 42.6, defGrams: 30, hint: '3-4 Kare ≈ 30g' },
  { name: 'Sütlü Çikolata', cat: 'sut', kcal: 535, protein: 7.6, carbs: 59.4, fat: 29.7, defGrams: 30, hint: '3-4 Kare ≈ 30g' },
  { name: 'Fırın Sütlaç / Kazandibi', cat: 'sut', kcal: 145, protein: 3.8, carbs: 25.0, fat: 3.2, defGrams: 200, hint: '1 Kase ≈ 200g' },
  { name: 'Baklava (Fıstıklı / Cevizli)', cat: 'sut', kcal: 428, protein: 6.5, carbs: 52.0, fat: 22.0, defGrams: 80, hint: '2 Dilim ≈ 80g' }
];

let currentFoodCatFilter = 'all';
let selectedFoodObj = FOOD_DATABASE_TR[0];

function getCombinedFoodDatabase() {
  const custom = Array.isArray(appData.customFoodDB) ? appData.customFoodDB : [];
  return [...custom, ...FOOD_DATABASE_TR];
}

function openFoodTrackerQuick() {
  switchLeftHubMode('sport');
  setTimeout(() => {
    const card = document.getElementById('foodMacroTrackerCard');
    const inp = document.getElementById('foodSearchInput');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (inp) {
      inp.focus();
      onFoodSearchInput();
    }
  }, 80);
}

function setFoodCategoryFilter(cat, btnEl) {
  currentFoodCatFilter = cat;
  document.querySelectorAll('.food-cat-chip').forEach((b) => {
    const active = b.getAttribute('data-cat') === cat;
    b.style.background = active ? 'var(--accent-cream)' : 'var(--bg-surface)';
    b.style.color = active ? '#121218' : 'var(--text-main)';
  });
  onFoodSearchInput();
}

function onFoodSearchInput() {
  const inp = document.getElementById('foodSearchInput');
  const drop = document.getElementById('foodSearchDropdown');
  if (!inp || !drop) return;

  const q = (inp.value || '').toLowerCase().trim();
  const all = getCombinedFoodDatabase();

  let filtered = all.filter((f) => {
    if (currentFoodCatFilter !== 'all' && f.cat !== currentFoodCatFilter) return false;
    if (!q) return true;
    return f.name.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    drop.classList.add('open');
    drop.innerHTML = `<div style="font-size:11px;color:var(--text-muted);padding:8px;text-align:center;">Sonuç bulunamadı. Sağ üstten <b>+ Özel Besin Tanımla</b> ile ekleyebilirsin!</div>`;
    return;
  }

  // Eğer arama tam eşleşiyorsa veya ilk sonuç varsa seçili besini güncelle
  selectedFoodObj = filtered[0];
  updateFoodLiveMacroPreview();

  drop.classList.add('open');
  drop.innerHTML = filtered.slice(0, 35).map((f, idx) => `
    <div class="food-dropdown-item ${idx === 0 ? 'selected' : ''}" onclick="selectFoodFromDropdown('${escapeHtml(f.name).replace(/'/g, "\\'")}')">
      <div>
        <div style="font-weight:800;color:var(--text-main);">${escapeHtml(f.name)}</div>
        <div style="font-size:10px;color:var(--text-muted);">100g: 🔥${f.kcal} kcal • 🥩${f.protein}g P • 🍞${f.carbs}g K • 🥑${f.fat}g Y ${f.hint ? `(${escapeHtml(f.hint)})` : ''}</div>
      </div>
      <span style="font-size:10.5px;font-weight:800;color:#95de64;flex-shrink:0;">Seç ↵</span>
    </div>
  `).join('');
}

function selectFoodFromDropdown(foodName) {
  const all = getCombinedFoodDatabase();
  const found = all.find((f) => f.name === foodName);
  if (!found) return;
  selectedFoodObj = found;

  const inp = document.getElementById('foodSearchInput');
  const gInp = document.getElementById('foodGramsInput');
  const drop = document.getElementById('foodSearchDropdown');

  if (inp) inp.value = found.name;
  if (gInp && found.defGrams) gInp.value = found.defGrams;
  if (drop) drop.classList.remove('open');

  updateFoodLiveMacroPreview();
}

function setQuickFoodGrams(grams) {
  const gInp = document.getElementById('foodGramsInput');
  if (gInp) gInp.value = grams;
  updateFoodLiveMacroPreview();
}

function updateFoodLiveMacroPreview() {
  const prevEl = document.getElementById('foodLiveMacroPreview');
  const gInp = document.getElementById('foodGramsInput');
  if (!prevEl || !selectedFoodObj) return;

  const grams = Math.max(1, parseFloat(gInp ? gInp.value : '100') || 100);
  const ratio = grams / 100;
  const kcal = Math.round(selectedFoodObj.kcal * ratio);
  const prot = (selectedFoodObj.protein * ratio).toFixed(1);
  const carb = (selectedFoodObj.carbs * ratio).toFixed(1);
  const fat = (selectedFoodObj.fat * ratio).toFixed(1);

  prevEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">
      <span>📌 <b>${grams}g ${escapeHtml(selectedFoodObj.name)}</b>:</span>
      <span>🔥 <b style="color:#ffc069;">${kcal} kcal</b> | 🥩 <b style="color:#ff9c6e;">${prot}g P</b> | 🍞 <b style="color:#93c5fd;">${carb}g K</b> | 🥑 <b style="color:#95de64;">${fat}g Y</b></span>
    </div>
  `;
}

function addSelectedFoodToDailyLog() {
  const inp = document.getElementById('foodSearchInput');
  const gInp = document.getElementById('foodGramsInput');
  const drop = document.getElementById('foodSearchDropdown');

  const query = (inp ? inp.value : '').trim();
  const all = getCombinedFoodDatabase();
  let food = selectedFoodObj;
  if (query) {
    const exact = all.find((f) => f.name.toLowerCase() === query.toLowerCase()) ||
                  all.find((f) => f.name.toLowerCase().includes(query.toLowerCase()));
    if (exact) food = exact;
  }
  if (!food) {
    alert('Lütfen listeden bir yemek veya besin seçin!');
    return;
  }

  const grams = Math.max(1, parseFloat(gInp ? gInp.value : '100') || 100);
  const ratio = grams / 100;
  const kcal = Math.round(food.kcal * ratio);
  const protein = Number((food.protein * ratio).toFixed(1));
  const carbs = Number((food.carbs * ratio).toFixed(1));
  const fat = Number((food.fat * ratio).toFixed(1));

  const targetDate = selectedDate || getTodayISO();
  if (!appData.dailyFoods || typeof appData.dailyFoods !== 'object') {
    appData.dailyFoods = {};
  }
  if (!Array.isArray(appData.dailyFoods[targetDate])) {
    appData.dailyFoods[targetDate] = [];
  }

  const prevProt = appData.proteinGrams || 0;
  appData.dailyFoods[targetDate].unshift({
    id: 'fd_' + Date.now(),
    name: food.name,
    grams,
    kcal,
    protein,
    carbs,
    fat
  });

  if (targetDate === getTodayISO()) {
    appData.proteinDate = targetDate;
    appData.proteinGrams = Math.round((appData.proteinGrams || 0) + protein);
  }

  if (inp) inp.value = '';
  if (drop) drop.classList.remove('open');

  playAlertTone('success');
  syncTodayDailyLog(targetDate);
  renderProteinTracker();
  renderFoodMacroTracker();
  renderSelectedDayDailyValuesBar();
  if (currentViewName === 'archive') renderArchive();
  saveProfileData();

  checkFoodCoachMilestone(food.name, grams, kcal, protein, prevProt, appData.proteinGrams || 0);
}

function removeDailyFoodItem(idx) {
  const targetDate = selectedDate || getTodayISO();
  if (!appData.dailyFoods || !Array.isArray(appData.dailyFoods[targetDate])) return;
  const removed = appData.dailyFoods[targetDate][idx];
  if (!removed) return;

  appData.dailyFoods[targetDate].splice(idx, 1);
  if (targetDate === getTodayISO()) {
    appData.proteinGrams = Math.max(0, Math.round((appData.proteinGrams || 0) - (Number(removed.protein) || 0)));
  }

  syncTodayDailyLog(targetDate);
  renderProteinTracker();
  renderFoodMacroTracker();
  renderSelectedDayDailyValuesBar();
  if (currentViewName === 'archive') renderArchive();
  saveProfileData();
}

function promptAddCustomFoodToDB() {
  const name = prompt('Yeni yemek veya besin adı (Örn: Annemin Mercimek Çorbası / Özel Protein Shake):');
  if (!name || !name.trim()) return;
  const kcal = parseFloat(prompt('100 gramı için Kalori (kcal) değeri:', '150') || '150') || 150;
  const protein = parseFloat(prompt('100 gramı için Protein (g) değeri:', '12') || '12') || 0;
  const carbs = parseFloat(prompt('100 gramı için Karbonhidrat (g) değeri:', '15') || '15') || 0;
  const fat = parseFloat(prompt('100 gramı için Yağ (g) değeri:', '5') || '5') || 0;

  if (!Array.isArray(appData.customFoodDB)) appData.customFoodDB = [];
  const newFood = {
    name: name.trim(),
    cat: 'yemek',
    kcal,
    protein,
    carbs,
    fat,
    defGrams: 100,
    hint: 'Özel Besin (100g)'
  };
  appData.customFoodDB.unshift(newFood);
  selectedFoodObj = newFood;
  const inp = document.getElementById('foodSearchInput');
  if (inp) inp.value = newFood.name;
  updateFoodLiveMacroPreview();
  saveProfileData();
  alert(`✅ "${newFood.name}" besin veritabanına eklendi! Şimdi gramajını girip "+ Ekle"ye basabilirsin.`);
}

function renderFoodMacroTracker() {
  const targetDate = selectedDate || getTodayISO();
  const listEl = document.getElementById('dailyEatenFoodsList');
  const kcalEl = document.getElementById('dailyTotalKcalText');
  const protEl = document.getElementById('dailyTotalProtText');
  const carbEl = document.getElementById('dailyTotalCarbText');
  const fatEl = document.getElementById('dailyTotalFatText');
  if (!listEl) return;

  const foods = (appData.dailyFoods && Array.isArray(appData.dailyFoods[targetDate])) ? appData.dailyFoods[targetDate] : [];
  const totals = foods.reduce((acc, f) => {
    acc.kcal += Number(f.kcal) || 0;
    acc.prot += Number(f.protein) || 0;
    acc.carb += Number(f.carbs) || 0;
    acc.fat += Number(f.fat) || 0;
    return acc;
  }, { kcal: 0, prot: 0, carb: 0, fat: 0 });

  if (kcalEl) kcalEl.textContent = `${Math.round(totals.kcal)} kcal`;
  if (protEl) protEl.textContent = `${totals.prot.toFixed(1)}g`;
  if (carbEl) carbEl.textContent = `${totals.carb.toFixed(1)}g`;
  if (fatEl) fatEl.textContent = `${totals.fat.toFixed(1)}g`;

  updateFoodLiveMacroPreview();

  if (foods.length === 0) {
    listEl.innerHTML = `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:6px;">Seçili gün (${targetDate}) için henüz yemek eklenmedi. Yukarıdan haşlanmış yumurta, tavuk sote, pilav, biber, soğan vb. arayıp gramajıyla ekle!</div>`;
    return;
  }

  listEl.innerHTML = foods.map((f, idx) => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;background:var(--bg-surface);padding:6px 9px;border-radius:9px;font-size:11.5px;">
      <div style="min-width:0;flex:1;">
        <div style="font-weight:800;color:var(--text-main);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🍽️ ${escapeHtml(f.name)} <span style="color:var(--accent-cream);">(${f.grams}g)</span></div>
        <div style="font-size:10px;color:var(--text-muted);">🔥 ${Math.round(f.kcal)} kcal • 🥩 <b style="color:#ff9c6e;">${f.protein}g P</b> • 🍞 ${f.carbs}g K • 🥑 ${f.fat}g Y</div>
      </div>
      <button type="button" style="background:none;border:none;color:#ff7875;cursor:pointer;font-weight:900;font-size:14px;" onclick="removeDailyFoodItem(${idx})" title="Sil">×</button>
    </div>
  `).join('');
}

// ===== 29. 🤖 AKILLI KİŞİSEL KOÇ & SÜRPRİZ MOTİVASYON POP-UP SİSTEMİ (v18.0) =====
let smartCoachTimer = null;

function showSmartCoachPopup(icon, title, message, durationMs = 9500) {
  const popup = document.getElementById('smartCoachPopup');
  const iconEl = document.getElementById('smartCoachIcon');
  const titleEl = document.getElementById('smartCoachTitle');
  const bodyEl = document.getElementById('smartCoachBody');
  if (!popup || !bodyEl) return;

  if (iconEl) iconEl.textContent = icon || '🤖';
  if (titleEl) titleEl.textContent = title || 'Kişisel Koç & Başarı Analizi';
  bodyEl.innerHTML = message;

  popup.classList.add('show');
  if (smartCoachTimer) clearTimeout(smartCoachTimer);
  smartCoachTimer = setTimeout(() => {
    popup.classList.remove('show');
  }, durationMs);
}

function closeSmartCoachPopup() {
  const popup = document.getElementById('smartCoachPopup');
  if (popup) popup.classList.remove('show');
  if (smartCoachTimer) clearTimeout(smartCoachTimer);
}

function checkWaterCoachMilestone(prevCount, newCount, target) {
  const name = escapeHtml(appData.profileName || appData.username || 'Şampiyon');
  const liters = ((newCount * 250) / 1000).toFixed(2);
  const targetLiters = ((target * 250) / 1000).toFixed(1);

  if (prevCount < 4 && newCount >= 4 && newCount < 8) {
    showSmartCoachPopup('💧', 'Harika Başlangıç, Devam Et!', `Bravo <b>${name}</b>! Bugün şimdiden <b>${newCount} bardak (${liters} Litre)</b> su içtin. Metabolizman ve zihnin tam kapasite çalışmaya başladı bile!`);
  } else if (prevCount < 8 && newCount >= 8 && newCount < target) {
    showSmartCoachPopup('🌊', 'Vay Be, 2 Litreyi Devirdin!', `Süper gidiyorsun <b>${name}</b>! Bugün <b>${newCount} bardak (${liters} Litre)</b> suya ulaştın. Günlük ${targetLiters}L hedefine çok az kaldı, aynen devam!`);
  } else if (prevCount < target && newCount >= target) {
    showSmartCoachPopup('🏆', 'Günlük Su Hedefi Tamamlandı!', `Helal olsun <b>${name}</b>! Bugün tam <b>${newCount} bardak (${liters} Litre)</b> su içerek günlük su hedefini %100 tamamladın! Vücudun ve kasların sana teşekkür ediyor!`);
  }
}

function checkTaskCompletionCoachPopup(task) {
  const name = escapeHtml(appData.profileName || appData.username || 'Şampiyon');
  const today = getTodayISO();
  const todayTasks = (appData.tasks || []).filter((t) => t.date === today);
  const doneToday = todayTasks.filter((t) => t.completed).length;
  const pct = todayTasks.length > 0 ? Math.round((doneToday / todayTasks.length) * 100) : 100;
  const waterL = (((appData.waterCount || 0) * 250) / 1000).toFixed(2);

  const isSport = task.category === 'Spor ve Sağlık' ||
                  /antrenman|spor|push|pull|bacak|leg|full body|kardiyo|koşu|idman/i.test(task.title);

  if (isSport) {
    showSmartCoachPopup(
      '💪',
      'Vay Be, Antrenmanı Devirdin!',
      `Muhteşem gidiyorsun <b>${name}</b>! Bugün <b>"${escapeHtml(task.title)}"</b> antrenmanını tamamladın. Bugün ayrıca <b>${waterL}L su</b> içtin ve <b>${appData.proteinGrams || 0}g protein</b> aldın. Kasların gelişiyor, disiplinin çelik gibi!`
    );
    return;
  }

  if (todayTasks.length > 0 && doneToday === todayTasks.length) {
    showSmartCoachPopup(
      '👑',
      'Günün Tüm Görevlerini Bitirdin (%100)!',
      `Vay be <b>${name}</b>, bugün planladığın <b>${todayTasks.length} görevin tamamını (%100)</b> eksiksiz tamamladın! Disiplin serin <b>🔥 ${appData.streak || 1} güne</b> çıktı. Kendinle gurur duyabilirsin!`
    );
  } else if (doneToday === 1 || doneToday === 3 || doneToday === 5) {
    showSmartCoachPopup(
      '🔥',
      'Harika Tempo, Bravo Devam Et!',
      `Vay be güzel gidiyorsun <b>${name}</b>! <b>"${escapeHtml(task.title)}"</b> göreviyle birlikte bugün <b>${doneToday}/${todayTasks.length} (%${pct})</b> görev tamamladın bile!`
    );
  }
}

function checkHabitCoachMilestone(habit, allDone) {
  const name = escapeHtml(appData.profileName || appData.username || 'Şampiyon');
  if (allDone) {
    showSmartCoachPopup('🌟', 'Zinciri Kırmadın: Tüm Alışkanlıklar Tamam!', `Tebrikler <b>${name}</b>! Bugünkü tüm günlük alışkanlıklarını eksiksiz tikledin. Küçük alışkanlıklar büyük zaferler yaratır!`);
  } else if (/antrenman|spor/i.test(habit.title)) {
    showSmartCoachPopup('🏋️', 'Bugün Antrenman Tiklendi!', `Vay be güzel gidiyorsun <b>${name}</b>! Bugün antrenman alışkanlığını tamamladın. Su ve proteinini de eksik etme, bravo devam et!`);
  }
}

function checkFoodCoachMilestone(foodName, grams, kcal, protAdded, prevProt, newProt) {
  const name = escapeHtml(appData.profileName || appData.username || 'Şampiyon');
  const targetProt = appData.proteinTarget || 160;

  if (prevProt < targetProt && newProt >= targetProt) {
    showSmartCoachPopup(
      '🥩',
      'Günlük Protein Hedefini Yakaladın!',
      `Harika besleniyorsun <b>${name}</b>! <b>${grams}g ${escapeHtml(foodName)}</b> ile bugün toplam <b>${newProt}g proteine</b> ulaştın ve ${targetProt}g hedefini devirdin!`
    );
  } else if (prevProt < 100 && newProt >= 100) {
    showSmartCoachPopup(
      '🍽️',
      '100 Gram Protein Barajı Aşıldı!',
      `Vay be süper gidiyorsun <b>${name}</b>! <b>${grams}g ${escapeHtml(foodName)} (+${protAdded}g P)</b> eklendi. Bugün toplam <b>${newProt}g proteine</b> ulaştın, kas onarımı tam gaz devam ediyor!`
    );
  } else {
    showSmartCoachPopup(
      '🍽️',
      'Öğün & Makro Kaydedildi!',
      `Afiyet olsun <b>${name}</b>! <b>${grams}g ${escapeHtml(foodName)}</b> (🔥 ${kcal} kcal | 🥩 ${protAdded}g Protein) günlük değerlerine ve takvime otomatik işlendi.`
    );
  }
}

function triggerRandomPersonalInsightPopup() {
  const name = escapeHtml(appData.profileName || appData.username || 'Şampiyon');
  const today = getTodayISO();
  const allTasks = appData.tasks || [];
  const totalDoneAllTime = allTasks.filter((t) => t.completed).length;
  const todayTasks = allTasks.filter((t) => t.date === today);
  const todayDone = todayTasks.filter((t) => t.completed).length;
  const waterCnt = appData.waterCount || 0;
  const waterL = ((waterCnt * 250) / 1000).toFixed(2);
  const prot = appData.proteinGrams || 0;
  const streak = appData.streak || 1;
  const sleep = appData.sleepHours !== undefined ? appData.sleepHours : 8;

  // Son 7 gün su ve görev toplamı
  let water7d = 0;
  let done7d = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const tzOffset = d.getTimezoneOffset() * 60000;
    const dStr = new Date(d - tzOffset).toISOString().split('T')[0];
    const log = getDailyLogForArchiveDate(dStr);
    water7d += log.waterCount || 0;
    done7d += allTasks.filter((t) => t.date === dStr && t.completed).length;
  }
  const water7dLiters = ((water7d * 250) / 1000).toFixed(1);

  // En çok görev bitirilen kategori
  const catCounts = {};
  allTasks.filter((t) => t.completed).forEach((t) => {
    const c = t.category || 'İş & Proje';
    catCounts[c] = (catCounts[c] || 0) + 1;
  });
  let topCat = 'Spor ve Sağlık';
  let topCatMax = 0;
  Object.keys(catCounts).forEach((c) => {
    if (catCounts[c] > topCatMax) {
      topCatMax = catCounts[c];
      topCat = c;
    }
  });

  const insights = [
    {
      icon: '💧',
      title: 'Seninle İlgili İlginç Su & Sağlık İstatistiği',
      msg: `Vay be <b>${name}</b>! Bugün <b>${waterCnt} bardak (${waterL}L)</b> su içtin, son 7 günde ise toplam <b>${water7dLiters} Litre (${water7d} bardak)</b> su tükettin! Bravo, vücuduna çok iyi bakıyorsun, aynen devam et!`
    },
    {
      icon: '💪',
      title: 'Kişisel Disiplin & Görev Analizin',
      msg: `Harika gidiyorsun <b>${name}</b>! Şimdiye kadar toplam <b>${totalDoneAllTime} görevi</b> başarıyla devirdin (son 7 günde <b>${done7d} iş</b> bitti). En güçlü olduğun kategori: <b>${escapeHtml(topCat)}</b>!`
    },
    {
      icon: '🥩',
      title: 'Günlük Beslenme & Enerji Durumun',
      msg: `Bugün şimdiye kadar <b>${prot}g protein</b> aldın, <b>${sleep} saat</b> uyudun ve enerji modun <b>${escapeHtml(appData.energyLevel || 'Yüksek')}</b>! Hedeflerine adım adım yaklaşıyorsun, pes etmek yok!`
    },
    {
      icon: '🔥',
      title: 'Aktif Seri & Bugünün Özeti',
      msg: `Tam <b>${streak} gündür</b> disiplin serini bozmadın <b>${name}</b>! Bugün planlanan ${todayTasks.length} görevden ${todayDone} tanesini tamamladın. Her gün %1 daha iyiye gidiyorsun!`
    }
  ];

  const pick = insights[Math.floor(Math.random() * insights.length)];
  showSmartCoachPopup(pick.icon, pick.title, pick.msg, 11000);
}

// Dışarı tıklanınca besin arama listesini kapat
document.addEventListener('click', (e) => {
  const card = document.getElementById('foodMacroTrackerCard');
  const drop = document.getElementById('foodSearchDropdown');
  if (card && drop && !card.contains(e.target)) {
    drop.classList.remove('open');
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=18').catch(() => {});
  }
  await initDB();

  if (currentProfile) {
    const saved = await loadProfileData(currentProfile);
    if (saved) {
      unlockApp();
      setTimeout(() => {
        triggerRandomPersonalInsightPopup();
      }, 1800);
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
