/**
 * TimeTracker Pro - Visual Time Tracking Application
 */

const STORAGE_KEY = 'timetrack_pro_state_v1';
const SLOT_HEIGHT = 25; // pixels per 15-minute slot (1 hour = 100px)
const MINUTES_PER_SLOT = 15;
const SLOTS_PER_HOUR = 4;
const TOTAL_SLOTS_PER_DAY = 24 * SLOTS_PER_HOUR; // 96 slots

const EVENT_TYPES = {
  work: { label: 'Práce', color: '#3b82f6', cssClass: 'type-work' },
  meeting: { label: 'Schůzka', color: '#8b5cf6', cssClass: 'type-meeting' },
  off: { label: 'Volno', color: '#f59e0b', cssClass: 'type-off' },
  sick: { label: 'Nemoc', color: '#f43f5e', cssClass: 'type-sick' }
};

const DAY_NAMES = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
const MONTH_NAMES = [
  'Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen',
  'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'
];
const CZECH_MONTHS_LOCATIVE = [
  'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu',
  'červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci'
];

const DEFAULT_INVOICE_TEMPLATE = {
  clientCode: 'PRJA',
  supplier: {
    name: 'Jméno Dodavatele',
    street: 'Ulice 123',
    city: '123 45 Město',
    ic: '12345678',
    dic: '',
    email: 'dodavatel@example.com',
    phone: '+420 123 456 789',
    vatNote: 'Nejsem plátcem DPH.',
    bankAccount: '123456789/0100',
    paymentMethod: 'převodem'
  },
  customer: {
    name: 'Klient s.r.o.',
    street: 'Ulice 456',
    city: '123 45 Město',
    country: 'Česká republika',
    ic: '87654321',
    dic: '',
    email: 'klient@example.com',
    phone: ''
  },
  ratePerMD: 5000,
  dueDays: 14,
  includeQr: true,
  itemTemplate: 'Fakturuji za služby v měsíci {mesic_cz} {rok}'
};

// Application State
let state = {
  tabs: [
    { id: 'tab-1', name: 'Projekt A', events: [] },
    { id: 'tab-2', name: 'Projekt B', events: [] }
  ],
  activeTabId: 'tab-1',
  currentDate: new Date(), // Selected week reference
  defaultEventType: 'work',
  workingHoursPerDay: 8
};

// UI State for Drag/Resize
let interaction = {
  type: null, // 'create', 'resize-bottom', 'resize-top', 'move'
  tabId: null,
  eventId: null,
  dayDate: null,
  startSlot: null,
  currentSlot: null,
  initialStartMin: 0,
  initialDurationMin: 15,
  initialDayDate: null,
  mouseOffsetY: 0
};

// Server sync & holidays state
let isServerConnected = false;
let saveDebounceTimer = null;
let czechHolidays = [];

// ==========================================
// Initialization & Storage
// ==========================================
async function initApp() {
  populateTimeSelects();
  bindGlobalEvents();
  await loadHolidays();
  await loadData();
  renderAll();

  // Auto scroll to 07:30
  setTimeout(() => {
    const calendarWrapper = document.getElementById('calendarWrapper');
    if (calendarWrapper) {
      calendarWrapper.scrollTop = 7.5 * (SLOT_HEIGHT * SLOTS_PER_HOUR);
    }
  }, 100);

  // Update current time indicator periodically
  setInterval(updateCurrentTimeIndicator, 60000);
}

async function loadHolidays() {
  try {
    const res = await fetch('holidays_cz.json', { cache: 'no-cache' });
    if (res.ok) {
      czechHolidays = await res.json();
    }
  } catch (err) {
    console.warn('Nepodařilo se načíst holidays_cz.json ze serveru, použije se dynamický výpočet:', err);
  }
}

// Get Holiday for a specific YYYY-MM-DD
function getHolidayForDate(dateISO) {
  if (czechHolidays && czechHolidays.length > 0) {
    const found = czechHolidays.find(h => h.date === dateISO);
    if (found) return found;
  }

  // Dynamic fallback calculation for any year
  const [y, m, d] = dateISO.split('-').map(Number);
  const fixed = [
    { m: 1, d: 1, name: 'Den obnovy samostatného českého státu / Nový rok' },
    { m: 5, d: 1, name: 'Svátek práce' },
    { m: 5, d: 8, name: 'Den vítězství' },
    { m: 7, d: 5, name: 'Den slovanských věrozvěstů Cyrila a Metoděje' },
    { m: 7, d: 6, name: 'Den upálení mistra Jana Husa' },
    { m: 9, d: 28, name: 'Den české státnosti' },
    { m: 10, d: 28, name: 'Den vzniku samostatného československého státu' },
    { m: 11, d: 17, name: 'Den boje za svobodu a demokracii' },
    { m: 12, d: 24, name: 'Štědrý den' },
    { m: 12, d: 25, name: '1. svátek vánoční' },
    { m: 12, d: 26, name: '2. svátek vánoční' }
  ];

  const matchFixed = fixed.find(h => h.m === m && h.d === d);
  if (matchFixed) return { date: dateISO, name: matchFixed.name };

  // Easter movable
  const easterSunday = calculateEasterSunday(y);
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(goodFriday.getDate() - 2);
  if (formatDateISO(goodFriday) === dateISO) return { date: dateISO, name: 'Velký pátek' };

  const easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterMonday.getDate() + 1);
  if (formatDateISO(easterMonday) === dateISO) return { date: dateISO, name: 'Velikonoční pondělí' };

  return null;
}

function calculateEasterSunday(year) {
  const f = Math.floor,
    G = year % 19,
    C = f(year / 100),
    H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30,
    I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11)),
    J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7,
    L = I - J,
    month = 3 + f((L + 40) / 44),
    day = L + 28 - 31 * f(month / 4);
  return new Date(year, month - 1, day);
}

// Calculate working days & holidays in the month
function getWorkingDaysInMonth(year, month) {
  let workingDays = 0;
  let holidaysOnWorkdays = 0;
  const holidaysList = [];

  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    const dayOfWeek = date.getDay();
    const dateISO = formatDateISO(date);
    const holiday = getHolidayForDate(dateISO);

    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Monday-Friday
      if (holiday) {
        holidaysOnWorkdays++;
        holidaysList.push(holiday);
      } else {
        workingDays++;
      }
    }
    date.setDate(date.getDate() + 1);
  }
  return { workingDays, holidaysOnWorkdays, holidaysList };
}

async function loadData() {
  updateStorageStatus('syncing', 'Načítám...');
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const tabsArray = Array.isArray(data) ? data : (data.tabs || []);
      if (tabsArray.length > 0) {
        state.tabs = tabsArray;
        if (!state.tabs.some(t => t.id === state.activeTabId)) {
          state.activeTabId = state.tabs[0].id;
        }
      }
      isServerConnected = true;
      updateStorageStatus('online', 'data.json připojen');
      saveToLocalCache();
      return;
    }
  } catch (err) {
    console.warn('Backend server nedostupný, používám localStorage fallback:', err);
  }

  // Fallback to localStorage
  loadFromLocalCache();
  updateStorageStatus('offline', 'Lokální režim');
}

function loadFromLocalCache() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const tabsArray = Array.isArray(parsed) ? parsed : (parsed.tabs || []);
      if (tabsArray.length > 0) {
        state.tabs = tabsArray;
        if (!state.tabs.some(t => t.id === state.activeTabId)) {
          state.activeTabId = state.tabs[0].id;
        }
      }
    }
  } catch (e) {
    console.error('Chyba při načítání z localStorage:', e);
  }
}

function saveToLocalCache() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabs: state.tabs
    }));
  } catch (e) {
    console.error('Chyba při ukládání do cache:', e);
  }
}

function saveData(immediate = false) {
  saveToLocalCache();

  if (!isServerConnected) return;

  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }

  updateStorageStatus('saving', 'Ukládám do JSON...');

  const doSave = async () => {
    try {
      const payload = {
        tabs: state.tabs
      };
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        updateStorageStatus('online', 'Uloženo do data.json');
      } else {
        updateStorageStatus('saving', 'Chyba zápisu');
      }
    } catch (err) {
      console.error('Chyba při zápisu do data.json:', err);
      updateStorageStatus('offline', 'Chyba spojení');
    }
  };

  if (immediate) {
    doSave();
  } else {
    saveDebounceTimer = setTimeout(doSave, 200);
  }
}

function updateStorageStatus(type, text) {
  const statusEl = document.getElementById('storageStatus');
  const textEl = document.getElementById('storageStatusText');
  if (!statusEl || !textEl) return;

  statusEl.className = `storage-status ${type}`;
  textEl.textContent = text;
}

function getActiveTab() {
  let tab = state.tabs.find(t => t.id === state.activeTabId);
  if (!tab) {
    tab = state.tabs[0];
    state.activeTabId = tab.id;
  }
  return tab;
}

// ==========================================
// Date & Time Utility Functions
// ==========================================
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMinutesToTime(mins) {
  mins = Math.max(0, Math.min(1440, mins));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function getWeekDays(mondayDate) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}



// ==========================================
// Main Render Pipeline
// ==========================================
function renderAll() {
  renderTabs();
  renderHeaderStats();
  renderCalendar();
  updateCurrentTimeIndicator();
}

function renderTabs() {
  const tabsList = document.getElementById('tabsList');
  tabsList.innerHTML = '';

  state.tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab-item ${tab.id === state.activeTabId ? 'active' : ''}`;
    tabEl.dataset.tabId = tab.id;

    const canDelete = state.tabs.length > 1;

    tabEl.innerHTML = `
      <span class="tab-title">${escapeHtml(tab.name)}</span>
      <button class="tab-menu-btn" title="Možnosti záložky" aria-haspopup="true" aria-expanded="false">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div class="tab-dropdown-menu" role="menu" style="display:none">
        <button class="tab-dropdown-item" data-action="rename" role="menuitem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          Přejmenovat
        </button>
        ${canDelete ? `
        <div class="tab-dropdown-divider"></div>
        <button class="tab-dropdown-item danger" data-action="delete" role="menuitem">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path><path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
          Smazat záložku
        </button>` : ''}
      </div>
    `;

    // Switch tab (ignore clicks on menu button or dropdown)
    tabEl.addEventListener('click', (e) => {
      if (e.target.closest('.tab-menu-btn') || e.target.closest('.tab-dropdown-menu')) return;
      state.activeTabId = tab.id;
      renderAll();
    });

    // Chevron toggle
    const menuBtn = tabEl.querySelector('.tab-menu-btn');
    const dropdown = tabEl.querySelector('.tab-dropdown-menu');

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.style.display !== 'none';
      closeAllTabDropdowns();
      if (!isOpen) {
        openTabDropdown(menuBtn, dropdown);
      }
    });

    // Dropdown item actions
    dropdown.querySelectorAll('.tab-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllTabDropdowns();
        if (item.dataset.action === 'rename') openRenameTabModal(tab.id);
        if (item.dataset.action === 'delete') deleteTab(tab.id);
      });
    });

    tabsList.appendChild(tabEl);
  });
}

function openTabDropdown(menuBtn, dropdown) {
  dropdown.style.display = 'flex';
  menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.classList.add('open');

  // Position: align left edge of dropdown below the button
  const btnRect = menuBtn.getBoundingClientRect();
  dropdown.style.top = (btnRect.bottom + 4) + 'px';
  dropdown.style.left = btnRect.left + 'px';
}

function closeAllTabDropdowns() {
  document.querySelectorAll('.tab-dropdown-menu').forEach(d => {
    d.style.display = 'none';
  });
  document.querySelectorAll('.tab-menu-btn').forEach(b => {
    b.setAttribute('aria-expanded', 'false');
    b.classList.remove('open');
  });
}


function renderHeaderStats() {
  const monday = getMonday(state.currentDate);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  // Viewed month based on current day of the week
  const currentDayOfWeek = new Date(state.currentDate);
  const viewedYear = currentDayOfWeek.getFullYear();
  const viewedMonth = currentDayOfWeek.getMonth();

  // Month Name & Week Title
  document.getElementById('currentMonthName').textContent = `${MONTH_NAMES[viewedMonth]} ${viewedYear}`;
  document.getElementById('weekRangeDisplay').textContent =
    `Týden: ${monday.getDate()}. ${monday.getMonth() + 1}. – ${sunday.getDate()}. ${sunday.getMonth() + 1}. ${viewedYear}`;

  const invoiceBtnText = document.getElementById('invoiceMonthBtnText');
  if (invoiceBtnText) {
    invoiceBtnText.textContent = `Fakturovat ${viewedMonth + 1}/${viewedYear}`;
  }

  // Active Tab Events & Workload
  const currentTab = getActiveTab();
  const workloadPercent = (currentTab.workload !== undefined && currentTab.workload !== null) ? Number(currentTab.workload) : 100;
  const workloadInput = document.getElementById('workloadInput');
  if (workloadInput && document.activeElement !== workloadInput) {
    workloadInput.value = workloadPercent;
  }

  // Working Hours Fund (Czech Holidays + Workload aware)
  const { workingDays, holidaysOnWorkdays, holidaysList } = getWorkingDaysInMonth(viewedYear, viewedMonth);
  const workloadFactor = workloadPercent / 100;
  const fullFundHours = workingDays * state.workingHoursPerDay;
  const totalFundHours = Math.round(fullFundHours * workloadFactor * 10) / 10;

  const holidaysHint = holidaysOnWorkdays > 0 ? `, ${holidaysOnWorkdays} ${holidaysOnWorkdays === 1 ? 'svátek' : (holidaysOnWorkdays < 5 ? 'svátky' : 'svátků')}` : '';
  document.getElementById('workingDaysCount').textContent = `(${workingDays} prac. dní${holidaysHint})`;
  document.getElementById('monthWorkingHours').textContent = `${totalFundHours} h`;

  const dailyHours = (state.workingHoursPerDay * workloadFactor).toFixed(1).replace('.0', '');
  const subtextEl = document.getElementById('workloadSubtext');
  if (subtextEl) {
    subtextEl.textContent = `${workloadPercent}% úvazek (${dailyHours}h/den, plný: ${fullFundHours}h)`;
  }

  const events = currentTab.events || [];

  // Month Logged Hours & MDs
  const monthEvents = events.filter(evt => {
    const d = new Date(evt.dayDate);
    return d.getFullYear() === viewedYear && d.getMonth() === viewedMonth;
  });

  const totalMonthMins = monthEvents.reduce((acc, evt) => acc + (evt.durationMin || 0), 0);
  const monthLoggedFormatted = formatDuration(totalMonthMins);
  document.getElementById('monthLoggedHours').textContent = monthLoggedFormatted;

  const totalMonthMD = ((totalMonthMins / 60) / 8).toFixed(2);
  const mdEl = document.getElementById('monthLoggedMD');
  if (mdEl) {
    mdEl.textContent = `(${totalMonthMD} MD)`;
  }

  const coveragePercent = totalFundHours > 0
    ? Math.min(999, Math.round(((totalMonthMins / 60) / totalFundHours) * 100))
    : 0;
  document.getElementById('monthCoveragePercent').textContent = `${coveragePercent} %`;
  document.getElementById('monthProgressBar').style.width = `${Math.min(100, coveragePercent)}%`;

  // Week Logged Hours & Breakdown
  const weekDays = getWeekDays(monday);
  const weekDayStrings = weekDays.map(formatDateISO);
  const weekEvents = events.filter(evt => weekDayStrings.includes(evt.dayDate));
  const totalWeekMins = weekEvents.reduce((acc, evt) => acc + (evt.durationMin || 0), 0);
  document.getElementById('weekLoggedHours').textContent = formatDuration(totalWeekMins);

  // Week Working Hours Fund (Czech Holidays + Workload aware)
  let weekWorkingDays = 0;
  for (let i = 0; i < 5; i++) { // Monday to Friday
    const dayISO = formatDateISO(weekDays[i]);
    const holiday = getHolidayForDate(dayISO);
    if (!holiday) {
      weekWorkingDays++;
    }
  }
  const fullWeekFundHours = weekWorkingDays * state.workingHoursPerDay;
  const totalWeekFundHours = Math.round(fullWeekFundHours * workloadFactor * 10) / 10;
  const weekCoveragePercent = totalWeekFundHours > 0
    ? Math.min(999, Math.round(((totalWeekMins / 60) / totalWeekFundHours) * 100))
    : 0;

  const weekCoverageEl = document.getElementById('weekCoveragePercent');
  if (weekCoverageEl) {
    weekCoverageEl.textContent = `${weekCoveragePercent} %`;
  }
  const weekProgressBarEl = document.getElementById('weekProgressBar');
  if (weekProgressBarEl) {
    weekProgressBarEl.style.width = `${Math.min(100, weekCoveragePercent)}%`;
  }

  // Breakdown
  const typeCounts = { work: 0, meeting: 0, off: 0, sick: 0 };
  weekEvents.forEach(evt => {
    if (typeCounts[evt.type] !== undefined) {
      typeCounts[evt.type] += evt.durationMin || 0;
    }
  });

  const breakdownContainer = document.getElementById('typesBreakdown');
  breakdownContainer.innerHTML = '';
  Object.keys(EVENT_TYPES).forEach(typeKey => {
    const mins = typeCounts[typeKey];
    if (mins > 0) {
      const pill = document.createElement('span');
      pill.className = 'breakdown-pill';
      pill.innerHTML = `
        <span class="dot" style="background: ${EVENT_TYPES[typeKey].color}"></span>
        <span>${EVENT_TYPES[typeKey].label}: ${formatDuration(mins)}</span>
      `;
      breakdownContainer.appendChild(pill);
    }
  });
}

function renderCalendar() {
  const monday = getMonday(state.currentDate);
  const weekDays = getWeekDays(monday);
  const todayISO = formatDateISO(new Date());

  const currentTab = getActiveTab();
  const events = currentTab.events || [];

  // 1. Render Day Headers
  const daysHeadersContainer = document.getElementById('daysHeadersContainer');
  daysHeadersContainer.innerHTML = '';

  weekDays.forEach((day, index) => {
    const dayISO = formatDateISO(day);
    const isToday = dayISO === todayISO;
    const holiday = getHolidayForDate(dayISO);

    // Day total duration
    const dayEvents = events.filter(e => e.dayDate === dayISO);
    const dayMins = dayEvents.reduce((acc, e) => acc + (e.durationMin || 0), 0);

    const headerCell = document.createElement('div');
    headerCell.className = `day-header-cell ${isToday ? 'is-today' : ''} ${holiday ? 'is-holiday' : ''}`;
    headerCell.innerHTML = `
      <span class="day-name">${DAY_NAMES[index]}</span>
      <div class="day-date-number">${day.getDate()}</div>
      ${holiday ? `<span class="day-holiday-badge" title="${escapeHtml(holiday.name)}">🇨🇿 ${escapeHtml(holiday.name)}</span>` : ''}
      <span class="day-total-hours">${dayMins > 0 ? formatDuration(dayMins) : '0h'}</span>
    `;
    daysHeadersContainer.appendChild(headerCell);
  });

  // 2. Render Time Axis (24 hours)
  const timeAxis = document.getElementById('timeAxis');
  timeAxis.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const hourLabel = document.createElement('div');
    hourLabel.className = 'hour-label';
    hourLabel.textContent = `${String(h).padStart(2, '0')}:00`;
    timeAxis.appendChild(hourLabel);
  }

  // 3. Render Columns & Slots
  const daysColumnsContainer = document.getElementById('daysColumnsContainer');
  daysColumnsContainer.innerHTML = '';

  weekDays.forEach((day) => {
    const dayISO = formatDateISO(day);
    const isToday = dayISO === todayISO;

    const dayColumn = document.createElement('div');
    dayColumn.className = `day-column ${isToday ? 'is-today' : ''}`;
    dayColumn.dataset.dayDate = dayISO;

    // Build 24 hour blocks with 4 15-min slots each
    for (let h = 0; h < 24; h++) {
      const hourBlock = document.createElement('div');
      hourBlock.className = 'hour-block';

      for (let q = 0; q < 4; q++) {
        const slotMin = h * 60 + q * 15;
        const slotEl = document.createElement('div');
        slotEl.className = 'quarter-slot';
        slotEl.dataset.slotMin = slotMin;
        hourBlock.appendChild(slotEl);
      }
      dayColumn.appendChild(hourBlock);
    }

    // Render Events in this Column
    const dayEvents = events.filter(e => e.dayDate === dayISO);
    dayEvents.forEach(evt => {
      const eventCard = createEventElement(evt);
      dayColumn.appendChild(eventCard);
    });

    daysColumnsContainer.appendChild(dayColumn);
  });
}

function createEventElement(evt) {
  const topPx = (evt.startMin / MINUTES_PER_SLOT) * SLOT_HEIGHT;
  const heightPx = Math.max(SLOT_HEIGHT, (evt.durationMin / MINUTES_PER_SLOT) * SLOT_HEIGHT);
  const endMin = evt.startMin + evt.durationMin;
  const typeConfig = EVENT_TYPES[evt.type] || EVENT_TYPES.work;

  const card = document.createElement('div');
  card.className = `event-card ${typeConfig.cssClass}`;
  card.dataset.eventId = evt.id;
  card.style.top = `${topPx}px`;
  card.style.height = `${heightPx}px`;

  const timeText = `${formatMinutesToTime(evt.startMin)} – ${formatMinutesToTime(endMin)}`;
  const titleText = evt.title ? escapeHtml(evt.title) : typeConfig.label;

  card.innerHTML = `
    <div class="resize-handle resize-handle-top"></div>
    <div class="event-card-content">
      <div class="event-card-header">
        <span class="event-time">${timeText}</span>
        <span class="event-type-tag">${typeConfig.label}</span>
      </div>
      <div class="event-title">${titleText}</div>
    </div>
    <div class="event-quick-actions">
      <button class="event-action-btn btn-edit" title="Upravit událost (typ, název, čas)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      </button>
      <button class="event-action-btn btn-dup" title="Duplikovat návazně">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
      <button class="event-action-btn btn-del" title="Smazat událost">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
    <div class="resize-handle resize-handle-bottom"></div>
  `;

  // Quick Action: Edit
  const editBtn = card.querySelector('.btn-edit');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditEventModal(evt.id);
    });
  }

  // Quick Action: Duplicate
  const dupBtn = card.querySelector('.btn-dup');
  dupBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    duplicateEvent(evt.id);
  });

  // Quick Action: Delete
  const delBtn = card.querySelector('.btn-del');
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteEvent(evt.id);
  });

  // Double Click: Open Edit Dialog
  card.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    openEditEventModal(evt.id);
  });

  return card;
}

// Current Time Red Indicator
function updateCurrentTimeIndicator() {
  const existing = document.querySelector('.current-time-line');
  if (existing) existing.remove();

  const now = new Date();
  const todayISO = formatDateISO(now);
  const todayCol = document.querySelector(`.day-column[data-day-date="${todayISO}"]`);
  if (!todayCol) return;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const topPx = (currentMinutes / MINUTES_PER_SLOT) * SLOT_HEIGHT;

  const line = document.createElement('div');
  line.className = 'current-time-line';
  line.style.top = `${topPx}px`;
  line.innerHTML = `<div class="current-time-dot"></div>`;
  todayCol.appendChild(line);
}

// ==========================================
// Interactive Drag / Resize / Create Handlers
// ==========================================
function bindGlobalEvents() {
  const calendarBody = document.getElementById('calendarBody');

  // Mouse Down - Initiation of Drag/Create/Resize/Move
  calendarBody.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);

  // Navigation
  document.getElementById('prevWeekBtn').addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() - 7);
    renderAll();
  });

  document.getElementById('nextWeekBtn').addEventListener('click', () => {
    state.currentDate.setDate(state.currentDate.getDate() + 7);
    renderAll();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    state.currentDate = new Date();
    renderAll();
  });

  // Type Radio Selectors
  document.querySelectorAll('.type-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      document.querySelectorAll('.type-badge').forEach(b => b.classList.remove('active'));
      badge.classList.add('active');
      state.defaultEventType = badge.dataset.type;
    });
  });

  // Add Tab Button
  document.getElementById('addTabBtn').addEventListener('click', createNewTab);

  // Export / Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importInput').addEventListener('change', importData);

  // Workload Input Listener
  const workloadInput = document.getElementById('workloadInput');
  if (workloadInput) {
    const handleWorkloadChange = () => {
      let val = parseFloat(workloadInput.value);
      if (isNaN(val) || val <= 0) val = 100;
      val = Math.min(300, Math.max(1, Math.round(val)));
      const currentTab = getActiveTab();
      if (currentTab.workload !== val) {
        currentTab.workload = val;
        saveData();
        renderHeaderStats();
      }
    };
    workloadInput.addEventListener('input', handleWorkloadChange);
    workloadInput.addEventListener('change', handleWorkloadChange);
  }

  // Modals
  setupModalEvents();

  // Keyboard Navigation
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft') {
      state.currentDate.setDate(state.currentDate.getDate() - 7);
      renderAll();
    } else if (e.key === 'ArrowRight') {
      state.currentDate.setDate(state.currentDate.getDate() + 7);
      renderAll();
    } else if (e.key === 't' || e.key === 'T') {
      state.currentDate = new Date();
      renderAll();
    }
  });
}

function handleMouseDown(e) {
  if (e.button !== 0) return; // Only left mouse click
  if (e.target.closest('.event-action-btn')) return;

  const currentTab = getActiveTab();
  const resizeHandle = e.target.closest('.resize-handle');
  const eventCard = e.target.closest('.event-card');
  const slotEl = e.target.closest('.quarter-slot');
  const dayCol = e.target.closest('.day-column');

  if (resizeHandle && eventCard) {
    // 1. Resize Mode
    e.preventDefault();
    const eventId = eventCard.dataset.eventId;
    const evt = currentTab.events.find(ev => ev.id === eventId);
    if (!evt) return;

    const isBottom = resizeHandle.classList.contains('resize-handle-bottom');
    interaction = {
      type: isBottom ? 'resize-bottom' : 'resize-top',
      eventId: evt.id,
      dayDate: evt.dayDate,
      initialStartMin: evt.startMin,
      initialDurationMin: evt.durationMin,
      startY: e.clientY
    };
  } else if (eventCard) {
    // 2. Move Mode
    e.preventDefault();
    const eventId = eventCard.dataset.eventId;
    const evt = currentTab.events.find(ev => ev.id === eventId);
    if (!evt) return;

    const cardRect = eventCard.getBoundingClientRect();
    interaction = {
      type: 'move',
      eventId: evt.id,
      initialDayDate: evt.dayDate,
      initialStartMin: evt.startMin,
      initialDurationMin: evt.durationMin,
      mouseOffsetY: e.clientY - cardRect.top,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false
    };
    eventCard.classList.add('is-dragging');
  } else if (slotEl && dayCol) {
    // 3. Create Mode (Click & Drag across slots)
    e.preventDefault();
    const startMin = parseInt(slotEl.dataset.slotMin, 10);
    const dayDate = dayCol.dataset.dayDate;

    interaction = {
      type: 'create',
      dayDate: dayDate,
      startMin: startMin,
      currentMin: startMin + MINUTES_PER_SLOT
    };

    updateSelectionPreview(dayCol, startMin, startMin + MINUTES_PER_SLOT);
  }
}

function handleMouseMove(e) {
  if (!interaction.type) return;

  const currentTab = getActiveTab();
  const calendarBody = document.getElementById('calendarBody');
  const bodyRect = calendarBody.getBoundingClientRect();

  if (interaction.type === 'create') {
    const dayCol = document.querySelector(`.day-column[data-day-date="${interaction.dayDate}"]`);
    if (!dayCol) return;

    const colRect = dayCol.getBoundingClientRect();
    const relativeY = Math.max(0, Math.min(colRect.height, e.clientY - colRect.top));
    const rawMin = (relativeY / SLOT_HEIGHT) * MINUTES_PER_SLOT;

    // Snap to 15-min
    let targetMin = Math.round(rawMin / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
    targetMin = Math.max(0, Math.min(1440, targetMin));

    const start = Math.min(interaction.startMin, targetMin);
    let end = Math.max(interaction.startMin + MINUTES_PER_SLOT, targetMin);
    if (end <= start) end = start + MINUTES_PER_SLOT;

    updateSelectionPreview(dayCol, start, end);
  } else if (interaction.type === 'resize-bottom') {
    const evt = currentTab.events.find(ev => ev.id === interaction.eventId);
    if (!evt) return;

    const deltaY = e.clientY - interaction.startY;
    const deltaMins = Math.round((deltaY / SLOT_HEIGHT)) * MINUTES_PER_SLOT;
    let newDuration = interaction.initialDurationMin + deltaMins;

    // Constraints: minimum 15 min, max until end of day (1440)
    newDuration = Math.max(MINUTES_PER_SLOT, newDuration);
    if (evt.startMin + newDuration > 1440) {
      newDuration = 1440 - evt.startMin;
    }

    evt.durationMin = newDuration;
    updateEventDOM(evt);
    renderHeaderStats();
  } else if (interaction.type === 'resize-top') {
    const evt = currentTab.events.find(ev => ev.id === interaction.eventId);
    if (!evt) return;

    const deltaY = e.clientY - interaction.startY;
    const deltaMins = Math.round((deltaY / SLOT_HEIGHT)) * MINUTES_PER_SLOT;

    let newStart = interaction.initialStartMin + deltaMins;
    const originalEnd = interaction.initialStartMin + interaction.initialDurationMin;

    newStart = Math.max(0, Math.min(originalEnd - MINUTES_PER_SLOT, newStart));
    const newDuration = originalEnd - newStart;

    evt.startMin = newStart;
    evt.durationMin = newDuration;
    updateEventDOM(evt);
    renderHeaderStats();
  } else if (interaction.type === 'move') {
    const evt = currentTab.events.find(ev => ev.id === interaction.eventId);
    if (!evt) return;

    if (Math.abs(e.clientX - interaction.startX) > 4 || Math.abs(e.clientY - interaction.startY) > 4) {
      interaction.hasMoved = true;
    }

    // Determine target day column from mouse X
    const targetElement = document.elementFromPoint(e.clientX, e.clientY);
    const targetDayCol = targetElement ? targetElement.closest('.day-column') : null;
    if (targetDayCol) {
      const colRect = targetDayCol.getBoundingClientRect();
      const relativeY = Math.max(0, e.clientY - colRect.top - interaction.mouseOffsetY);
      let newStartMin = Math.round(((relativeY / SLOT_HEIGHT) * MINUTES_PER_SLOT) / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;

      newStartMin = Math.max(0, Math.min(1440 - evt.durationMin, newStartMin));

      evt.dayDate = targetDayCol.dataset.dayDate;
      evt.startMin = newStartMin;

      // Re-attach card to new column if day changed
      const eventCard = document.querySelector(`.event-card[data-event-id="${evt.id}"]`);
      if (eventCard && eventCard.parentElement !== targetDayCol) {
        targetDayCol.appendChild(eventCard);
      }

      updateEventDOM(evt);
      renderHeaderStats();
    }
  }
}

function handleMouseUp(e) {
  if (!interaction.type) return;

  const currentTab = getActiveTab();
  removeSelectionPreview();

  if (interaction.type === 'create') {
    const dayCol = document.querySelector(`.day-column[data-day-date="${interaction.dayDate}"]`);
    if (dayCol) {
      const colRect = dayCol.getBoundingClientRect();
      const relativeY = Math.max(0, Math.min(colRect.height, e.clientY - colRect.top));
      const rawMin = (relativeY / SLOT_HEIGHT) * MINUTES_PER_SLOT;
      let targetMin = Math.round(rawMin / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;

      let start = Math.min(interaction.startMin, targetMin);
      let end = Math.max(interaction.startMin + MINUTES_PER_SLOT, targetMin);
      if (end <= start) end = start + MINUTES_PER_SLOT;
      end = Math.min(1440, end);

      const newEvent = {
        id: 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        dayDate: interaction.dayDate,
        startMin: start,
        durationMin: end - start,
        type: state.defaultEventType || 'work',
        title: ''
      };

      currentTab.events.push(newEvent);
      saveData();
      renderAll();
    }
  } else if (interaction.type === 'move' || interaction.type === 'resize-bottom' || interaction.type === 'resize-top') {
    const eventCard = document.querySelector(`.event-card[data-event-id="${interaction.eventId}"]`);
    if (eventCard) {
      eventCard.classList.remove('is-dragging');
    }
    saveData();
    renderAll();
  }

  interaction = { type: null };
}

function updateEventDOM(evt) {
  const card = document.querySelector(`.event-card[data-event-id="${evt.id}"]`);
  if (!card) return;

  const topPx = (evt.startMin / MINUTES_PER_SLOT) * SLOT_HEIGHT;
  const heightPx = Math.max(SLOT_HEIGHT, (evt.durationMin / MINUTES_PER_SLOT) * SLOT_HEIGHT);
  const endMin = evt.startMin + evt.durationMin;

  card.style.top = `${topPx}px`;
  card.style.height = `${heightPx}px`;

  const timeEl = card.querySelector('.event-time');
  if (timeEl) {
    timeEl.textContent = `${formatMinutesToTime(evt.startMin)} – ${formatMinutesToTime(endMin)}`;
  }
}

function updateSelectionPreview(dayCol, startMin, endMin) {
  removeSelectionPreview();
  const topPx = (startMin / MINUTES_PER_SLOT) * SLOT_HEIGHT;
  const heightPx = ((endMin - startMin) / MINUTES_PER_SLOT) * SLOT_HEIGHT;

  const preview = document.createElement('div');
  preview.className = 'selection-preview';
  preview.id = 'activeSelectionPreview';
  preview.style.top = `${topPx}px`;
  preview.style.height = `${heightPx}px`;
  preview.textContent = `${formatMinutesToTime(startMin)} – ${formatMinutesToTime(endMin)} (${formatDuration(endMin - startMin)})`;

  dayCol.appendChild(preview);
}

function removeSelectionPreview() {
  const existing = document.getElementById('activeSelectionPreview');
  if (existing) existing.remove();
}

// ==========================================
// Event Actions (Duplicate, Delete, Edit)
// ==========================================
function duplicateEvent(eventId) {
  const currentTab = getActiveTab();
  const original = currentTab.events.find(e => e.id === eventId);
  if (!original) return;

  let newStartMin = original.startMin + original.durationMin;
  let targetDate = original.dayDate;

  // If duplicate overflows midnight (1440 min), roll to next day at 00:00 or clamp
  if (newStartMin >= 1440) {
    const nextDate = new Date(original.dayDate);
    nextDate.setDate(nextDate.getDate() + 1);
    targetDate = formatDateISO(nextDate);
    newStartMin = 0;
  }

  // Ensure within day limits
  let duration = original.durationMin;
  if (newStartMin + duration > 1440) {
    duration = 1440 - newStartMin;
  }

  const copy = {
    id: 'evt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    dayDate: targetDate,
    startMin: newStartMin,
    durationMin: duration,
    type: original.type,
    title: original.title
  };

  currentTab.events.push(copy);
  saveData();
  renderAll();
}

function deleteEvent(eventId) {
  const currentTab = getActiveTab();
  currentTab.events = currentTab.events.filter(e => e.id !== eventId);
  saveData();
  renderAll();
}

// ==========================================
// Tabs Management
// ==========================================
function createNewTab() {
  const count = state.tabs.length + 1;
  const newTab = {
    id: 'tab-' + Date.now(),
    name: `Projekt ${count}`,
    workload: 100,
    events: []
  };
  state.tabs.push(newTab);
  state.activeTabId = newTab.id;
  saveData();
  renderAll();
}

function deleteTab(tabId) {
  if (state.tabs.length <= 1) return;
  if (!confirm('Opravdu chcete smazat tuto záložku včetně všech jejích událostí?')) return;

  state.tabs = state.tabs.filter(t => t.id !== tabId);
  if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[0].id;
  }
  saveData();
  renderAll();
}

let renamingTabId = null;
function openRenameTabModal(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab) return;
  renamingTabId = tabId;
  const input = document.getElementById('tabNameInput');
  input.value = tab.name;
  document.getElementById('tabRenameModal').style.display = 'flex';
  input.focus();
  input.select();
}

// ==========================================
// Modals & Forms
// ==========================================
let editingEventId = null;
let editingModalType = 'work';

function populateTimeSelects() {
  const startSelect = document.getElementById('eventStartTime');
  const endSelect = document.getElementById('eventEndTime');
  startSelect.innerHTML = '';
  endSelect.innerHTML = '';

  for (let m = 0; m <= 1440; m += 15) {
    const timeStr = formatMinutesToTime(m);
    if (m < 1440) {
      const optStart = document.createElement('option');
      optStart.value = m;
      optStart.textContent = timeStr;
      startSelect.appendChild(optStart);
    }
    if (m > 0) {
      const optEnd = document.createElement('option');
      optEnd.value = m;
      optEnd.textContent = timeStr;
      endSelect.appendChild(optEnd);
    }
  }
}

function openEditEventModal(eventId) {
  const currentTab = getActiveTab();
  const evt = currentTab.events.find(e => e.id === eventId);
  if (!evt) return;

  editingEventId = eventId;
  editingModalType = evt.type;

  document.getElementById('eventTitleInput').value = evt.title || '';
  document.getElementById('eventStartTime').value = evt.startMin;
  document.getElementById('eventEndTime').value = evt.startMin + evt.durationMin;

  updateModalTypeButtons();
  updateModalDurationInfo();

  document.getElementById('eventModal').style.display = 'flex';
}

function updateModalTypeButtons() {
  document.querySelectorAll('.btn-type-opt').forEach(btn => {
    if (btn.dataset.type === editingModalType) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updateModalDurationInfo() {
  const startMin = parseInt(document.getElementById('eventStartTime').value, 10);
  let endMin = parseInt(document.getElementById('eventEndTime').value, 10);

  if (endMin <= startMin) {
    endMin = startMin + 15;
    document.getElementById('eventEndTime').value = endMin;
  }

  const duration = endMin - startMin;
  const blocks = duration / 15;
  document.getElementById('eventDurationInfo').innerHTML =
    `Trvání: <strong>${formatDuration(duration)}</strong> (${blocks} ${blocks === 1 ? 'blok' : (blocks < 5 ? 'bloky' : 'bloků')})`;
}



function setupModalEvents() {
  // Close modals on Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditModal();
      closeTabRenameModal();
      closeInvoiceModal();
    }
  });

  // Event Edit Modal
  document.getElementById('modalCloseBtn').addEventListener('click', closeEditModal);
  document.getElementById('modalCancelBtn').addEventListener('click', closeEditModal);

  document.querySelectorAll('.btn-type-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      editingModalType = btn.dataset.type;
      updateModalTypeButtons();
    });
  });

  document.getElementById('eventStartTime').addEventListener('change', updateModalDurationInfo);
  document.getElementById('eventEndTime').addEventListener('change', updateModalDurationInfo);

  document.getElementById('modalSaveBtn').addEventListener('click', () => {
    if (!editingEventId) return;
    const currentTab = getActiveTab();
    const evt = currentTab.events.find(e => e.id === editingEventId);
    if (evt) {
      const startMin = parseInt(document.getElementById('eventStartTime').value, 10);
      const endMin = parseInt(document.getElementById('eventEndTime').value, 10);

      evt.title = document.getElementById('eventTitleInput').value.trim();
      evt.type = editingModalType;
      evt.startMin = startMin;
      evt.durationMin = Math.max(15, endMin - startMin);

      saveData();
      renderAll();
    }
    closeEditModal();
  });

  document.getElementById('modalDeleteBtn').addEventListener('click', () => {
    if (editingEventId) {
      deleteEvent(editingEventId);
      closeEditModal();
    }
  });

  document.getElementById('modalDuplicateBtn').addEventListener('click', () => {
    if (editingEventId) {
      duplicateEvent(editingEventId);
      closeEditModal();
    }
  });

  // Tab Rename Modal
  document.getElementById('tabRenameCloseBtn').addEventListener('click', closeTabRenameModal);
  document.getElementById('tabRenameCancelBtn').addEventListener('click', closeTabRenameModal);
  document.getElementById('tabRenameSaveBtn').addEventListener('click', () => {
    const val = document.getElementById('tabNameInput').value.trim();
    if (val && renamingTabId) {
      const tab = state.tabs.find(t => t.id === renamingTabId);
      if (tab) {
        tab.name = val;
        saveData();
        renderTabs();
      }
    }
    closeTabRenameModal();
  });

  document.getElementById('tabNameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('tabRenameSaveBtn').click();
    }
  });

  // Invoice Modal Events
  setupInvoiceModalEvents();
}

function closeEditModal() {
  document.getElementById('eventModal').style.display = 'none';
  editingEventId = null;
}

function closeTabRenameModal() {
  document.getElementById('tabRenameModal').style.display = 'none';
  renamingTabId = null;
}

// ==========================================
// Invoice Generator & Template Module
// ==========================================

function getTabInvoiceTemplate(tab) {
  if (!tab.invoiceTemplate) {
    // Deep clone default template
    tab.invoiceTemplate = JSON.parse(JSON.stringify(DEFAULT_INVOICE_TEMPLATE));
  }
  // Ensure all sections exist
  const tpl = tab.invoiceTemplate;
  tpl.supplier = Object.assign({}, DEFAULT_INVOICE_TEMPLATE.supplier, tpl.supplier || {});
  tpl.customer = Object.assign({}, DEFAULT_INVOICE_TEMPLATE.customer, tpl.customer || {});
  if (tpl.clientCode === undefined) tpl.clientCode = DEFAULT_INVOICE_TEMPLATE.clientCode;
  if (tpl.ratePerMD === undefined) tpl.ratePerMD = DEFAULT_INVOICE_TEMPLATE.ratePerMD;
  if (tpl.dueDays === undefined) tpl.dueDays = DEFAULT_INVOICE_TEMPLATE.dueDays;
  if (tpl.includeQr === undefined) tpl.includeQr = (DEFAULT_INVOICE_TEMPLATE.includeQr !== false);
  if (tpl.itemTemplate === undefined) tpl.itemTemplate = DEFAULT_INVOICE_TEMPLATE.itemTemplate;
  return tpl;
}

function formatCzechCurrency(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateCZ(isoOrDate) {
  if (!isoOrDate) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate + (isoOrDate.length === 10 ? 'T00:00:00' : '')) : isoOrDate;
  if (isNaN(d.getTime())) return isoOrDate;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// Parse Czech Bank Account string (e.g. "12-3456789012/0100" or "3456789012/0100")
function parseCzechBankAccount(accountStr) {
  if (!accountStr) return null;
  const clean = accountStr.replace(/\s+/g, '');
  const slashIdx = clean.indexOf('/');
  if (slashIdx === -1) return null;

  const bankCode = clean.substring(slashIdx + 1).replace(/\D/g, '');
  const beforeSlash = clean.substring(0, slashIdx);

  let prefix = '';
  let number = beforeSlash;

  if (beforeSlash.includes('-')) {
    const parts = beforeSlash.split('-');
    prefix = parts[0].replace(/\D/g, '');
    number = parts[1].replace(/\D/g, '');
  } else {
    number = beforeSlash.replace(/\D/g, '');
  }

  if (!number || !bankCode) return null;

  return {
    prefix,
    number,
    bankCode
  };
}

// Generate Paylibo Public API URL for Czech QR Platba
function getPayliboQrUrl(bankAccount, amount, vs, size = 440) {
  const parsed = parseCzechBankAccount(bankAccount);
  if (!parsed) return null;

  const numAmount = parseFloat(amount) || 0;
  if (numAmount <= 0) return null;

  const params = new URLSearchParams({
    compress: 'false',
    size: String(size),
    accountNumber: parsed.number,
    bankCode: parsed.bankCode,
    amount: numAmount.toFixed(2),
    currency: 'CZK'
  });

  if (parsed.prefix) {
    params.set('accountPrefix', parsed.prefix);
  }

  if (vs) {
    const cleanVs = String(vs).replace(/\D/g, '').substring(0, 10);
    if (cleanVs) {
      params.set('vs', cleanVs);
    }
  }

  return `https://api.paylibo.com/paylibo/generator/czech/image?${params.toString()}`;
}

let invoicingState = {
  year: 2026,
  month: 8, // 0-indexed (8 = September)
  tabId: null,
  filename: '',
  invoiceExists: false,
  totalMD: 0,
  ratePerMD: 4800,
  totalAmount: 0
};

async function openInvoiceModal() {
  const currentTab = getActiveTab();
  const tpl = getTabInvoiceTemplate(currentTab);

  // Determine currently viewed year and month from state.currentDate
  const currentDayOfWeek = new Date(state.currentDate);
  const viewedYear = currentDayOfWeek.getFullYear();
  const viewedMonth = currentDayOfWeek.getMonth(); // 0-indexed

  invoicingState.year = viewedYear;
  invoicingState.month = viewedMonth;
  invoicingState.tabId = currentTab.id;

  // Set modal title
  document.getElementById('invoiceModalTitle').textContent =
    `Faktura za ${MONTH_NAMES[viewedMonth]} ${viewedYear} – ${currentTab.name}`;

  // Switch to Issue tab by default
  switchInvoiceModalTab('issue');

  // Compute total logged hours for this month in active tab
  const events = currentTab.events || [];
  const monthEvents = events.filter(evt => {
    const d = new Date(evt.dayDate);
    return d.getFullYear() === viewedYear && d.getMonth() === viewedMonth;
  });
  const totalMonthMins = monthEvents.reduce((acc, evt) => acc + (evt.durationMin || 0), 0);
  const totalMD = parseFloat(((totalMonthMins / 60) / 8).toFixed(2));
  invoicingState.totalMD = totalMD;
  invoicingState.ratePerMD = Number(tpl.ratePerMD) || 4800;

  // Month-end calculation for Issue Date
  // Last day of viewed month: new Date(year, month + 1, 0)
  const lastDayOfMonth = new Date(viewedYear, viewedMonth + 1, 0);
  const issueDateISO = formatDateISO(lastDayOfMonth);

  // Due Date: issueDate + dueDays
  const dueDays = Number(tpl.dueDays) || 14;
  const dueDate = new Date(lastDayOfMonth);
  dueDate.setDate(dueDate.getDate() + dueDays);
  const dueDateISO = formatDateISO(dueDate);

  // Default invoice number: e.g. 20260101
  const monthStr2d = String(viewedMonth + 1).padStart(2, '0');
  const defaultInvoiceNumber = `${viewedYear}${monthStr2d}01`;

  // Item description from template
  const mesicCz = CZECH_MONTHS_LOCATIVE[viewedMonth] || MONTH_NAMES[viewedMonth].toLowerCase();
  let itemDesc = tpl.itemTemplate || DEFAULT_INVOICE_TEMPLATE.itemTemplate;
  itemDesc = itemDesc
    .replace(/{mesic_cz}/g, mesicCz)
    .replace(/{mesic_2d}/g, monthStr2d)
    .replace(/{mesic}/g, String(viewedMonth + 1))
    .replace(/{rok}/g, String(viewedYear));

  // Populate Issue Form inputs
  document.getElementById('invFormNumber').value = defaultInvoiceNumber;
  document.getElementById('invFormClientCode').value = tpl.clientCode || 'PRJA';
  document.getElementById('invFormIssueDate').value = issueDateISO;
  document.getElementById('invFormDueDate').value = dueDateISO;
  document.getElementById('invFormItemDesc').value = itemDesc;
  document.getElementById('invFormMD').value = totalMD;
  document.getElementById('invFormMDHoursHint').textContent = `${formatDuration(totalMonthMins)} v měsíci (${monthEvents.length} záznamů)`;
  document.getElementById('invFormRate').value = invoicingState.ratePerMD;
  document.getElementById('invFormIncludeQr').checked = (tpl.includeQr !== false);

  // Populate Template Form inputs
  populateTemplateForm(tpl);

  // Recalculate and update preview
  updateInvoiceCalculationsAndFilename();

  // Show Modal
  document.getElementById('invoiceModal').style.display = 'flex';
}

function populateTemplateForm(tpl) {
  // Supplier
  document.getElementById('invTplSuppName').value = tpl.supplier.name || '';
  document.getElementById('invTplSuppStreet').value = tpl.supplier.street || '';
  document.getElementById('invTplSuppCity').value = tpl.supplier.city || '';
  document.getElementById('invTplSuppIc').value = tpl.supplier.ic || '';
  document.getElementById('invTplSuppDic').value = tpl.supplier.dic || '';
  document.getElementById('invTplSuppEmail').value = tpl.supplier.email || '';
  document.getElementById('invTplSuppPhone').value = tpl.supplier.phone || '';
  document.getElementById('invTplSuppVatNote').value = tpl.supplier.vatNote || 'Nejsem plátcem DPH.';
  document.getElementById('invTplSuppAccount').value = tpl.supplier.bankAccount || '';
  document.getElementById('invTplSuppPayMethod').value = tpl.supplier.paymentMethod || 'převodem';

  // Customer
  document.getElementById('invTplCustName').value = tpl.customer.name || '';
  document.getElementById('invTplCustStreet').value = tpl.customer.street || '';
  document.getElementById('invTplCustCity').value = tpl.customer.city || '';
  document.getElementById('invTplCustCountry').value = tpl.customer.country || 'Česká republika';
  document.getElementById('invTplClientCode').value = tpl.clientCode || '';
  document.getElementById('invTplCustIc').value = tpl.customer.ic || '';
  document.getElementById('invTplCustDic').value = tpl.customer.dic || '';
  document.getElementById('invTplCustEmail').value = tpl.customer.email || '';
  document.getElementById('invTplCustPhone').value = tpl.customer.phone || '';

  // Billing
  document.getElementById('invTplRatePerMD').value = tpl.ratePerMD || 4800;
  document.getElementById('invTplDueDays').value = tpl.dueDays || 14;
  document.getElementById('invTplIncludeQr').checked = (tpl.includeQr !== false);
  document.getElementById('invTplItemTemplate').value = tpl.itemTemplate || '';
}

function updateInvoiceCalculationsAndFilename() {
  const invNumber = document.getElementById('invFormNumber').value.trim();
  const clientCode = document.getElementById('invFormClientCode').value.trim();
  const filename = `${invNumber}${clientCode}.pdf`;
  invoicingState.filename = filename;

  document.getElementById('invFormFilenameBadge').textContent = filename;

  const mdVal = parseFloat(document.getElementById('invFormMD').value) || 0;
  const rateVal = parseFloat(document.getElementById('invFormRate').value) || 0;
  const total = mdVal * rateVal;

  invoicingState.totalMD = mdVal;
  invoicingState.ratePerMD = rateVal;
  invoicingState.totalAmount = total;

  document.getElementById('invFormTotalDisplay').textContent = `${formatCzechCurrency(total)} Kč`;

  // Update live preview DOM
  updateInvoicePreviewDOM();

  // Check file existence on backend
  checkInvoiceFileStatus(filename);
}

function updateInvoicePreviewDOM() {
  const currentTab = getActiveTab();
  const tpl = getTabInvoiceTemplate(currentTab);

  const invNumber = document.getElementById('invFormNumber').value.trim();
  const issueDate = document.getElementById('invFormIssueDate').value;
  const dueDate = document.getElementById('invFormDueDate').value;
  const itemDesc = document.getElementById('invFormItemDesc').value;

  document.getElementById('invPreviewNumber').textContent = invNumber;
  document.getElementById('invPreviewIssueDate').textContent = formatDateCZ(issueDate);
  document.getElementById('invPreviewDueDate').textContent = formatDateCZ(dueDate);

  // Supplier
  document.getElementById('invPreviewSuppName').textContent = tpl.supplier.name || '';
  document.getElementById('invPreviewSuppStreet').textContent = tpl.supplier.street || '';
  document.getElementById('invPreviewSuppCity').textContent = tpl.supplier.city || '';
  document.getElementById('invPreviewSuppIc').textContent = tpl.supplier.ic || '';

  const dicEl = document.getElementById('invPreviewSuppDic');
  const dicRow = document.getElementById('invPreviewSuppDicRow');
  if (tpl.supplier.dic) {
    dicEl.textContent = tpl.supplier.dic;
    if (dicRow) dicRow.style.display = 'flex';
  } else {
    dicEl.textContent = '';
    if (dicRow) dicRow.style.display = 'flex';
  }

  document.getElementById('invPreviewSuppEmail').textContent = tpl.supplier.email || '';
  document.getElementById('invPreviewSuppPhone').textContent = tpl.supplier.phone || '';
  document.getElementById('invPreviewSuppVat').textContent = tpl.supplier.vatNote || 'Nejsem plátcem DPH.';
  document.getElementById('invPreviewPayMethod').textContent = tpl.supplier.paymentMethod || 'převodem';
  document.getElementById('invPreviewVs').textContent = invNumber;
  document.getElementById('invPreviewAccount').textContent = tpl.supplier.bankAccount || '';

  // Customer
  document.getElementById('invPreviewCustName').textContent = tpl.customer.name || '';
  document.getElementById('invPreviewCustStreet').textContent = tpl.customer.street || '';
  document.getElementById('invPreviewCustCity').textContent = tpl.customer.city || '';
  document.getElementById('invPreviewCustCountry').textContent = tpl.customer.country || 'Česká republika';
  document.getElementById('invPreviewCustIc').textContent = tpl.customer.ic || '';
  document.getElementById('invPreviewCustDic').textContent = tpl.customer.dic || '';
  document.getElementById('invPreviewCustEmail').textContent = tpl.customer.email || '';
  document.getElementById('invPreviewCustPhone').textContent = tpl.customer.phone || '';

  // Items
  document.getElementById('invPreviewItemDesc').textContent = itemDesc;
  // Format MD with comma (e.g. 10,50 MD)
  const formattedMD = String(invoicingState.totalMD).replace('.', ',') + ' MD';
  document.getElementById('invPreviewItemQty').textContent = formattedMD;
  document.getElementById('invPreviewItemUnitPrice').textContent = formatCzechCurrency(invoicingState.ratePerMD);
  document.getElementById('invPreviewItemTotal').textContent = formatCzechCurrency(invoicingState.totalAmount);
  document.getElementById('invPreviewGrandTotal').textContent = formatCzechCurrency(invoicingState.totalAmount);

  // QR Code Generation via Paylibo API
  const includeQr = document.getElementById('invFormIncludeQr') ? document.getElementById('invFormIncludeQr').checked : true;
  const qrWrapper = document.getElementById('invPreviewQrWrapper');
  const qrImg = document.getElementById('invPreviewQrCode');

  if (qrWrapper && qrImg) {
    if (includeQr && tpl.supplier.bankAccount && invoicingState.totalAmount > 0) {
      const qrUrl = getPayliboQrUrl(tpl.supplier.bankAccount, invoicingState.totalAmount, invNumber, 440);
      if (qrUrl) {
        qrImg.src = qrUrl;
        qrWrapper.style.display = 'flex';
      } else {
        qrWrapper.style.display = 'none';
      }
    } else {
      qrWrapper.style.display = 'none';
    }
  }
}

let invoiceCheckDebounce = null;
async function checkInvoiceFileStatus(filename) {
  if (invoiceCheckDebounce) clearTimeout(invoiceCheckDebounce);

  invoiceCheckDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`/api/invoices/check?filename=${encodeURIComponent(filename)}`);
      if (res.ok) {
        const data = await res.json();
        const banner = document.getElementById('invoiceStatusBanner');
        const icon = document.getElementById('invoiceStatusIcon');
        const title = document.getElementById('invoiceStatusTitle');
        const desc = document.getElementById('invoiceStatusDesc');
        const openBtn = document.getElementById('invoiceOpenExistingBtn');
        const overwriteLabel = document.getElementById('invoiceOverwriteLabel');
        const overwriteCheck = document.getElementById('invoiceOverwriteCheckbox');
        const generateBtn = document.getElementById('invoiceGenerateBtn');

        invoicingState.invoiceExists = data.exists;

        if (data.exists) {
          banner.className = 'invoice-status-banner exists';
          icon.textContent = '✅';
          title.textContent = `Faktura ${filename} již existuje`;
          desc.textContent = 'Soubor byl nalezen ve složce faktury/. Můžete jej otevřít nebo zaškrtnout přegenerování.';
          openBtn.href = data.url;
          openBtn.style.display = 'inline-flex';
          overwriteLabel.style.display = 'inline-flex';
          overwriteCheck.checked = false;
          generateBtn.disabled = true;
          document.getElementById('invoiceGenerateBtnText').textContent = 'Vygenerovat a uložit fakturu (PDF)';
        } else {
          banner.className = 'invoice-status-banner new';
          icon.textContent = '📄';
          title.textContent = 'Nová faktura k vystavení';
          desc.textContent = `Faktura dosud nebyla vygenerována. Po vygenerování bude uložena do složky faktury/${filename}.`;
          openBtn.style.display = 'none';
          overwriteLabel.style.display = 'none';
          overwriteCheck.checked = false;
          generateBtn.disabled = false;
          document.getElementById('invoiceGenerateBtnText').textContent = 'Vygenerovat a uložit fakturu (PDF)';
        }
      }
    } catch (e) {
      console.warn('Kontrola souboru faktury selhala:', e);
    }
  }, 150);
}

function switchInvoiceModalTab(tabName) {
  const issueBtn = document.getElementById('invoiceTabIssueBtn');
  const tplBtn = document.getElementById('invoiceTabTemplateBtn');
  const issuePanel = document.getElementById('invoiceIssuePanel');
  const tplPanel = document.getElementById('invoiceTemplatePanel');

  if (tabName === 'issue') {
    issueBtn.classList.add('active');
    tplBtn.classList.remove('active');
    issuePanel.classList.add('active');
    tplPanel.classList.remove('active');
    updateInvoiceCalculationsAndFilename();
  } else {
    tplBtn.classList.add('active');
    issueBtn.classList.remove('active');
    tplPanel.classList.add('active');
    issuePanel.classList.remove('active');
  }
}

function saveInvoiceTemplateFromForm() {
  const currentTab = getActiveTab();
  const tpl = getTabInvoiceTemplate(currentTab);

  tpl.supplier = {
    name: document.getElementById('invTplSuppName').value.trim(),
    street: document.getElementById('invTplSuppStreet').value.trim(),
    city: document.getElementById('invTplSuppCity').value.trim(),
    ic: document.getElementById('invTplSuppIc').value.trim(),
    dic: document.getElementById('invTplSuppDic').value.trim(),
    email: document.getElementById('invTplSuppEmail').value.trim(),
    phone: document.getElementById('invTplSuppPhone').value.trim(),
    vatNote: document.getElementById('invTplSuppVatNote').value.trim() || 'Nejsem plátcem DPH.',
    bankAccount: document.getElementById('invTplSuppAccount').value.trim(),
    paymentMethod: document.getElementById('invTplSuppPayMethod').value.trim() || 'převodem'
  };

  tpl.customer = {
    name: document.getElementById('invTplCustName').value.trim(),
    street: document.getElementById('invTplCustStreet').value.trim(),
    city: document.getElementById('invTplCustCity').value.trim(),
    country: document.getElementById('invTplCustCountry').value.trim() || 'Česká republika',
    ic: document.getElementById('invTplCustIc').value.trim(),
    dic: document.getElementById('invTplCustDic').value.trim(),
    email: document.getElementById('invTplCustEmail').value.trim(),
    phone: document.getElementById('invTplCustPhone').value.trim()
  };

  tpl.clientCode = document.getElementById('invTplClientCode').value.trim() || 'PRJA';
  tpl.ratePerMD = parseFloat(document.getElementById('invTplRatePerMD').value) || 5000;
  tpl.dueDays = parseInt(document.getElementById('invTplDueDays').value, 10) || 14;
  tpl.includeQr = document.getElementById('invTplIncludeQr').checked;
  tpl.itemTemplate = document.getElementById('invTplItemTemplate').value.trim();

  currentTab.invoiceTemplate = tpl;
  saveData(true);

  // Also sync clientCode, rate & QR to current issue form
  document.getElementById('invFormClientCode').value = tpl.clientCode;
  document.getElementById('invFormRate').value = tpl.ratePerMD;
  document.getElementById('invFormIncludeQr').checked = tpl.includeQr;

  alert(`Šablona faktury byla úspěšně uložena pro záložku „${currentTab.name}“!`);
  switchInvoiceModalTab('issue');
}

async function generateAndSaveInvoice() {
  const generateBtn = document.getElementById('invoiceGenerateBtn');
  const btnText = document.getElementById('invoiceGenerateBtnText');
  const originalText = btnText.textContent;

  try {
    generateBtn.disabled = true;
    btnText.textContent = 'Generuji PDF fakturu...';

    // Update DOM preview to be completely current
    updateInvoicePreviewDOM();

    const element = document.getElementById('invoicePrintTemplate');
    const filename = invoicingState.filename || 'faktura.pdf';

    // Ensure preview container is visible for html2canvas rendering
    const previewWrapper = document.getElementById('invoicePreviewWrapper');
    const wasHidden = previewWrapper.style.display === 'none';
    if (wasHidden) {
      previewWrapper.style.display = 'flex';
    }

    const opt = {
      margin: 0,
      filename: filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2.5,
        useCORS: true,
        logging: false,
        letterRendering: true
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
      }
    };

    // Generate PDF with html2pdf
    const worker = html2pdf().set(opt).from(element);
    const pdfBase64 = await worker.output('datauristring');

    // Save to backend faktury/ directory
    const res = await fetch('/api/invoices/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename,
        pdfBase64,
        overwrite: true
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Chyba při ukládání na server');
    }

    // Trigger local download in browser
    await worker.save();

    if (wasHidden) {
      previewWrapper.style.display = 'none';
    }

    // Update status
    await checkInvoiceFileStatus(filename);

    const banner = document.getElementById('invoiceStatusBanner');
    banner.className = 'invoice-status-banner exists';
    document.getElementById('invoiceStatusIcon').textContent = '🎉';
    document.getElementById('invoiceStatusTitle').textContent = `Faktura ${filename} byla vygenerována!`;
    document.getElementById('invoiceStatusDesc').textContent = 'Faktura byla stažena a bezpečně uložena do složky faktury/.';

  } catch (err) {
    console.error('Chyba při generování faktury:', err);
    alert('Chyba při generování faktury: ' + err.message);
  } finally {
    generateBtn.disabled = false;
    btnText.textContent = originalText;
  }
}

function closeInvoiceModal() {
  document.getElementById('invoiceModal').style.display = 'none';
}

function setupInvoiceModalEvents() {
  // Trigger button
  const invoiceBtn = document.getElementById('invoiceMonthBtn');
  if (invoiceBtn) {
    invoiceBtn.addEventListener('click', openInvoiceModal);
  }

  // Close buttons
  document.getElementById('invoiceCloseBtn').addEventListener('click', closeInvoiceModal);
  document.getElementById('invoiceCancelBtn').addEventListener('click', closeInvoiceModal);
  document.getElementById('invoiceTplCancelBtn').addEventListener('click', closeInvoiceModal);

  // Tab switching
  document.getElementById('invoiceTabIssueBtn').addEventListener('click', () => switchInvoiceModalTab('issue'));
  document.getElementById('invoiceTabTemplateBtn').addEventListener('click', () => switchInvoiceModalTab('template'));

  // Form input listeners for live updates
  const inputsToWatch = [
    'invFormNumber',
    'invFormClientCode',
    'invFormIssueDate',
    'invFormDueDate',
    'invFormItemDesc',
    'invFormMD',
    'invFormRate'
  ];
  inputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateInvoiceCalculationsAndFilename);
      el.addEventListener('change', updateInvoiceCalculationsAndFilename);
    }
  });

  // QR Code checkbox listener
  const qrCheck = document.getElementById('invFormIncludeQr');
  if (qrCheck) {
    qrCheck.addEventListener('change', updateInvoicePreviewDOM);
  }

  // Overwrite checkbox listener
  const overwriteCheck = document.getElementById('invoiceOverwriteCheckbox');
  if (overwriteCheck) {
    overwriteCheck.addEventListener('change', () => {
      const generateBtn = document.getElementById('invoiceGenerateBtn');
      if (invoicingState.invoiceExists) {
        generateBtn.disabled = !overwriteCheck.checked;
      }
    });
  }

  // Preview Toggle
  const togglePreviewBtn = document.getElementById('invTogglePreviewBtn');
  if (togglePreviewBtn) {
    togglePreviewBtn.addEventListener('click', () => {
      const wrapper = document.getElementById('invoicePreviewWrapper');
      const textEl = document.getElementById('invTogglePreviewText');
      if (wrapper.style.display === 'none') {
        wrapper.style.display = 'flex';
        textEl.textContent = 'Skrýt náhled PDF faktury';
        updateInvoicePreviewDOM();
      } else {
        wrapper.style.display = 'none';
        textEl.textContent = 'Zobrazit živý náhled PDF faktury';
      }
    });
  }

  // Save template button
  document.getElementById('invoiceTplSaveBtn').addEventListener('click', saveInvoiceTemplateFromForm);

  // Generate button
  document.getElementById('invoiceGenerateBtn').addEventListener('click', generateAndSaveInvoice);
}
function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.tabs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `timetrack_backup_${formatDateISO(new Date())}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.tabs = parsed;
        state.activeTabId = parsed[0].id;
        saveData();
        renderAll();
        alert('Data byla úspěšně importována!');
      } else {
        alert('Neplatný formát souboru se zálohou.');
      }
    } catch (err) {
      alert('Chyba při čtení JSON souboru: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset input
}

// Helper: escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Close tab dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.tab-menu-btn') && !e.target.closest('.tab-dropdown-menu')) {
    closeAllTabDropdowns();
  }
});

// Close tab dropdowns on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllTabDropdowns();
});

// Start application on DOM loaded
document.addEventListener('DOMContentLoaded', initApp);
