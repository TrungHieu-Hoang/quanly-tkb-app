// ========================================
// Platform Detection & API Config
// ========================================
const IS_WEB = window.IS_WEB_VERSION === true;
const API_BASE = IS_WEB
    ? (window.location.origin)
    : (localStorage.getItem('tkb_server_url') || '');

// ========================================
// State Management
// ========================================
const STATE = {
    viewMode: 'day',
    selectedDate: new Date(),
    subjects: [],
    deleteTargetId: null,
    currentUser: null,
    isAdmin: false,
    allUsers: [],
    deleteUserTargetId: null,
    authToken: localStorage.getItem('tkb_token') || null,
    refreshTimer: null,
};

// ========================================
// Utility Functions
// ========================================
const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAYS_FULL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const MONTHS_VI = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDate(d) {
    return `${DAYS_VI[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatWeek(d) {
    return `Tuần ${getWeekNumber(d)}`;
}

function formatMonth(d) {
    return `${MONTHS_VI[d.getMonth()]} ${d.getFullYear()}`;
}

function getWeekNumber(d) {
    const onejan = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d - onejan) / 86400000);
    return Math.ceil((days + onejan.getDay() + 1) / 7);
}

function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
}

function isSameDay(a, b) {
    return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function getDayOfWeekVi(d) {
    const day = d.getDay();
    return day === 0 ? 'CN' : `Thứ ${day + 1}`;
}

function getInitial(name) {
    return name ? name.charAt(0).toUpperCase() : '?';
}

// ========================================
// API Helper
// ========================================
function getApiBase() {
    if (IS_WEB) return window.location.origin;
    return localStorage.getItem('tkb_server_url') || '';
}

async function api(method, endpoint, body = null) {
    const base = getApiBase();
    if (!base) throw new Error('Chưa cấu hình server');

    const headers = { 'Content-Type': 'application/json' };
    if (STATE.authToken) {
        headers['Authorization'] = `Bearer ${STATE.authToken}`;
    }

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${base}${endpoint}`, opts);
    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || `Lỗi ${res.status}`);
    }
    return data;
}

// ========================================
// DOM Elements
// ========================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const loadingScreen = $('#loadingScreen');
const authScreen = $('#authScreen');
const appContainer = $('#appContainer');
const loginCard = $('#loginCard');
const registerCard = $('#registerCard');
const loginForm = $('#loginForm');
const authError = $('#authError');
const authErrorText = $('#authErrorText');
const dateText = $('#dateText');
const weekNavigator = $('#weekNavigator');
const weekDays = $('#weekDays');
const monthCalendar = $('#monthCalendar');
const calendarBody = $('#calendarBody');
const emptyState = $('#emptyState');
const emptySubtext = $('#emptySubtext');
const scheduleCards = $('#scheduleCards');
const btnAdd = $('#btnAdd');
const btnScrollTop = $('#btnScrollTop');
const viewModeDropdown = $('#viewModeDropdown');
const modalOverlay = $('#modalOverlay');
const modalTitle = $('#modalTitle');
const subjectForm = $('#subjectForm');
const deleteOverlay = $('#deleteOverlay');
const syncIndicator = $('#syncIndicator');
const userAvatarBtn = $('#userAvatarBtn');
const userInitial = $('#userInitial');
const userDropdownOverlay = $('#userDropdownOverlay');
const dropdownInitial = $('#dropdownInitial');
const dropdownName = $('#dropdownName');
const dropdownEmail = $('#dropdownEmail');
const dropdownBadge = $('#dropdownBadge');
const btnManageUsers = $('#btnManageUsers');
const btnLogout = $('#btnLogout');
const userMgmtOverlay = $('#userMgmtOverlay');
const userList = $('#userList');
const addUserOverlay = $('#addUserOverlay');
const addUserForm = $('#addUserForm');
const deleteUserOverlay = $('#deleteUserOverlay');

// ========================================
// Screen Management
// ========================================
function showScreen(screen) {
    loadingScreen.style.display = 'none';
    authScreen.style.display = 'none';
    appContainer.style.display = 'none';

    switch (screen) {
        case 'loading': loadingScreen.style.display = 'flex'; break;
        case 'auth': authScreen.style.display = 'flex'; break;
        case 'app': appContainer.style.display = 'block'; break;
    }
}

// ========================================
// Authentication
// ========================================
async function tryAutoLogin() {
    if (!STATE.authToken) return false;
    if (!IS_WEB && !getApiBase()) return false;

    try {
        const user = await api('GET', '/api/auth/me');
        STATE.currentUser = user;
        STATE.isAdmin = user.role === 'admin';

        // Web version: admin only
        if (IS_WEB && !STATE.isAdmin) {
            STATE.authToken = null;
            localStorage.removeItem('tkb_token');
            return false;
        }

        return true;
    } catch (e) {
        STATE.authToken = null;
        localStorage.removeItem('tkb_token');
        return false;
    }
}

async function handleLogin(email, password) {
    hideAuthError();
    setAuthLoading(true);

    try {
        const data = await api('POST', '/api/auth/login', { email, password });

        // Web version: admin only check
        if (IS_WEB && data.user.role !== 'admin') {
            showAuthError('Phiên bản web chỉ dành cho Admin');
            setAuthLoading(false);
            return;
        }

        STATE.authToken = data.token;
        STATE.currentUser = data.user;
        STATE.isAdmin = data.user.role === 'admin';
        localStorage.setItem('tkb_token', data.token);

        enterApp();
    } catch (e) {
        showAuthError(e.message);
    } finally {
        setAuthLoading(false);
    }
}

function handleLogout() {
    STATE.authToken = null;
    STATE.currentUser = null;
    STATE.isAdmin = false;
    STATE.subjects = [];
    STATE.allUsers = [];
    localStorage.removeItem('tkb_token');
    stopAutoRefresh();
    closeUserDropdown();
    showAuthScreen();
}

function showAuthScreen() {
    // Hide register for web (no self-registration)
    const showRegLink = $('#showRegisterLink');
    if (showRegLink) showRegLink.style.display = 'none';

    if (loginCard) loginCard.style.display = 'block';
    if (registerCard) registerCard.style.display = 'none';

    // Show server config on Android if not configured
    if (!IS_WEB) {
        const configSection = $('#serverConfigSection');
        if (configSection) {
            const savedUrl = localStorage.getItem('tkb_server_url');
            if (savedUrl) {
                $('#serverUrlInput').value = savedUrl;
            }
        }
    }

    showScreen('auth');
}

function setAuthLoading(loading) {
    const btn = $('#loginBtn');
    if (!btn) return;
    const span = btn.querySelector('span');
    const spinner = btn.querySelector('.btn-spinner');
    if (loading) {
        btn.disabled = true;
        if (span) span.style.display = 'none';
        if (spinner) spinner.style.display = 'block';
    } else {
        btn.disabled = false;
        if (span) span.style.display = 'inline';
        if (spinner) spinner.style.display = 'none';
    }
}

function showAuthError(message) {
    if (authError) {
        authError.style.display = 'flex';
        authErrorText.textContent = message;
    }
}

function hideAuthError() {
    if (authError) authError.style.display = 'none';
}

// ========================================
// Enter App
// ========================================
function enterApp() {
    updateUIForRole();
    showScreen('app');
    loadSchedules();
    startAutoRefresh();
    initViewMode();
    initModal();
    initScrollTop();
    initDateNavigation();
    initUserDropdown();
    initUserManagement();
    render();
}

// ========================================
// UI Role Management
// ========================================
function updateUIForRole() {
    if (!STATE.currentUser) return;

    const initial = getInitial(STATE.currentUser.displayName);
    if (userInitial) userInitial.textContent = initial;
    if (btnAdd) btnAdd.style.display = STATE.isAdmin ? 'flex' : 'none';
    if (emptySubtext) emptySubtext.textContent = STATE.isAdmin
        ? 'Nhấn nút + để thêm môn học mới'
        : 'Chưa có lịch học nào';

    if (dropdownInitial) dropdownInitial.textContent = initial;
    if (dropdownName) dropdownName.textContent = STATE.currentUser.displayName || 'Người dùng';
    if (dropdownEmail) dropdownEmail.textContent = STATE.currentUser.email || '';
    if (dropdownBadge) {
        dropdownBadge.textContent = STATE.isAdmin ? 'Admin' : 'Người xem';
        dropdownBadge.className = 'role-badge ' + (STATE.isAdmin ? 'admin' : 'user');
    }
    if (btnManageUsers) btnManageUsers.style.display = STATE.isAdmin ? 'flex' : 'none';
}

// ========================================
// Data Loading & Auto-Refresh
// ========================================
async function loadSchedules() {
    setSyncStatus('syncing');
    try {
        const data = await api('GET', '/api/schedules');
        STATE.subjects = data;
        setSyncStatus('synced');
        render();
    } catch (e) {
        console.error('Load schedules error:', e);
        setSyncStatus('offline');
    }
}

function startAutoRefresh() {
    stopAutoRefresh();
    // Refresh data every 15 seconds
    STATE.refreshTimer = setInterval(() => {
        loadSchedules();
    }, 15000);
}

function stopAutoRefresh() {
    if (STATE.refreshTimer) {
        clearInterval(STATE.refreshTimer);
        STATE.refreshTimer = null;
    }
}

function setSyncStatus(status) {
    if (!syncIndicator) return;
    syncIndicator.classList.remove('syncing', 'offline');
    switch (status) {
        case 'syncing':
            syncIndicator.classList.add('syncing');
            syncIndicator.title = 'Đang đồng bộ...';
            break;
        case 'synced':
            syncIndicator.title = 'Đã đồng bộ';
            break;
        case 'offline':
            syncIndicator.classList.add('offline');
            syncIndicator.title = 'Ngoại tuyến';
            break;
    }
}

// ========================================
// User Management (Admin Only)
// ========================================
async function loadUsers() {
    try {
        STATE.allUsers = await api('GET', '/api/users');
        renderUserList();
    } catch (e) {
        console.error('Load users error:', e);
    }
}

async function adminCreateUser(name, email, password) {
    return await api('POST', '/api/users', {
        displayName: name,
        email: email,
        password: password
    });
}

async function adminDeleteUser(uid) {
    return await api('DELETE', `/api/users/${uid}`);
}

function renderUserList() {
    if (!userList) return;

    if (STATE.allUsers.length === 0) {
        userList.innerHTML = '<div class="user-list-empty">Chưa có người dùng nào</div>';
        return;
    }

    userList.innerHTML = STATE.allUsers.map(user => {
        const isSelf = STATE.currentUser && user.id === STATE.currentUser.id;
        const isAdmin = user.role === 'admin';
        const initial = getInitial(user.displayName);

        return `
            <div class="user-item" data-uid="${user.id}">
                <div class="user-item-avatar ${isAdmin ? 'admin-avatar' : ''}">
                    <span>${initial}</span>
                </div>
                <div class="user-item-info">
                    <div class="user-item-name">
                        ${user.displayName || 'Người dùng'}
                        <span class="user-item-badge ${user.role}">${isAdmin ? 'Admin' : 'Người xem'}</span>
                    </div>
                    <div class="user-item-email">${user.email}</div>
                </div>
                ${!isSelf ? `
                    <button class="user-item-delete" onclick="confirmDeleteUser('${user.id}', '${(user.displayName || '').replace(/'/g, "\\'")}')" title="Xóa">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                ` : '<span style="font-size:0.75rem;color:var(--text-tertiary);white-space:nowrap;">Bạn</span>'}
            </div>
        `;
    }).join('');
}

window.confirmDeleteUser = function (uid, name) {
    STATE.deleteUserTargetId = uid;
    const msg = $('#deleteUserMessage');
    if (msg) msg.textContent = `Bạn có chắc chắn muốn xóa "${name}"? Họ sẽ không thể đăng nhập lại.`;
    if (deleteUserOverlay) deleteUserOverlay.style.display = 'flex';
};

function initUserManagement() {
    if (btnManageUsers) {
        btnManageUsers.addEventListener('click', () => {
            closeUserDropdown();
            loadUsers();
            if (userMgmtOverlay) userMgmtOverlay.style.display = 'flex';
        });
    }

    const userMgmtClose = $('#userMgmtClose');
    if (userMgmtClose) userMgmtClose.addEventListener('click', () => { userMgmtOverlay.style.display = 'none'; });
    if (userMgmtOverlay) userMgmtOverlay.addEventListener('click', (e) => { if (e.target === userMgmtOverlay) userMgmtOverlay.style.display = 'none'; });

    const btnAddUser = $('#btnAddUser');
    if (btnAddUser) btnAddUser.addEventListener('click', () => {
        if (addUserForm) addUserForm.reset();
        if (addUserOverlay) addUserOverlay.style.display = 'flex';
    });

    const addUserClose = $('#addUserClose');
    if (addUserClose) addUserClose.addEventListener('click', () => { addUserOverlay.style.display = 'none'; });
    const addUserCancel = $('#addUserCancel');
    if (addUserCancel) addUserCancel.addEventListener('click', () => { addUserOverlay.style.display = 'none'; });
    if (addUserOverlay) addUserOverlay.addEventListener('click', (e) => { if (e.target === addUserOverlay) addUserOverlay.style.display = 'none'; });

    if (addUserForm) {
        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = $('#newUserName').value.trim();
            const email = $('#newUserEmail').value.trim();
            const password = $('#newUserPassword').value;

            const saveBtn = $('#addUserSaveBtn');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang tạo...'; }

            try {
                await adminCreateUser(name, email, password);
                showToast(`Đã tạo tài khoản cho ${name}`);
                if (addUserOverlay) addUserOverlay.style.display = 'none';
                addUserForm.reset();
                loadUsers();
            } catch (e) {
                showToast(e.message || 'Tạo tài khoản thất bại');
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Tạo tài khoản'; }
            }
        });
    }

    const deleteUserCancel = $('#btnDeleteUserCancel');
    if (deleteUserCancel) deleteUserCancel.addEventListener('click', () => {
        deleteUserOverlay.style.display = 'none';
        STATE.deleteUserTargetId = null;
    });
    if (deleteUserOverlay) deleteUserOverlay.addEventListener('click', (e) => {
        if (e.target === deleteUserOverlay) { deleteUserOverlay.style.display = 'none'; STATE.deleteUserTargetId = null; }
    });

    const deleteUserConfirm = $('#btnDeleteUserConfirm');
    if (deleteUserConfirm) {
        deleteUserConfirm.addEventListener('click', async () => {
            if (!STATE.deleteUserTargetId) return;
            try {
                await adminDeleteUser(STATE.deleteUserTargetId);
                showToast('Đã xóa người dùng');
                loadUsers();
            } catch (e) {
                showToast(e.message || 'Xóa thất bại');
            } finally {
                deleteUserOverlay.style.display = 'none';
                STATE.deleteUserTargetId = null;
            }
        });
    }
}

// ========================================
// User Dropdown
// ========================================
function initUserDropdown() {
    if (userAvatarBtn) {
        userAvatarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (userDropdownOverlay.style.display === 'flex') {
                closeUserDropdown();
            } else {
                userDropdownOverlay.style.display = 'flex';
            }
        });
    }

    if (userDropdownOverlay) {
        userDropdownOverlay.addEventListener('click', (e) => {
            if (e.target === userDropdownOverlay) closeUserDropdown();
        });
    }

    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            closeUserDropdown();
            handleLogout();
        });
    }
}

function closeUserDropdown() {
    if (userDropdownOverlay) userDropdownOverlay.style.display = 'none';
}

// ========================================
// View Mode Management
// ========================================
function initViewMode() {
    const viewControls = $('.view-controls');
    if (!viewControls) return;

    const oldSelector = $('#viewModeSelector');
    if (oldSelector) oldSelector.remove();
    const oldTrigger = $('#viewModeTrigger');
    if (oldTrigger) oldTrigger.remove();

    const triggerBtn = document.createElement('button');
    triggerBtn.className = 'view-mode-trigger';
    triggerBtn.id = 'viewModeTrigger';
    triggerBtn.innerHTML = `
        <span>Theo ngày</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
    `;
    viewControls.appendChild(triggerBtn);

    triggerBtn.addEventListener('click', () => {
        if (viewModeDropdown) viewModeDropdown.style.display = 'flex';
        updateDropdownActive();
    });

    if (viewModeDropdown) {
        viewModeDropdown.addEventListener('click', (e) => {
            if (e.target === viewModeDropdown) viewModeDropdown.style.display = 'none';
        });
    }

    $$('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            STATE.viewMode = item.dataset.mode;
            if (viewModeDropdown) viewModeDropdown.style.display = 'none';
            updateViewModeTrigger();
            render();
        });
    });
}

function updateViewModeTrigger() {
    const trigger = $('#viewModeTrigger');
    if (!trigger) return;
    const labels = { day: 'Theo ngày', week: 'Theo tuần', month: 'Theo tháng' };
    trigger.querySelector('span').textContent = labels[STATE.viewMode];
}

function updateDropdownActive() {
    $$('.dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.mode === STATE.viewMode);
    });
}

// ========================================
// Date Navigation
// ========================================
function initDateNavigation() {
    const nativePicker = $('#nativeDatePicker');
    if (nativePicker) {
        nativePicker.addEventListener('change', (e) => {
            if (e.target.value) {
                const parts = e.target.value.split('-');
                STATE.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                render();
            }
        });
    }
}

function navigateDate(offset) {
    const d = STATE.selectedDate;
    switch (STATE.viewMode) {
        case 'day': d.setDate(d.getDate() + offset); break;
        case 'week': d.setDate(d.getDate() + (offset * 7)); break;
        case 'month': d.setMonth(d.getMonth() + offset); break;
    }
    STATE.selectedDate = new Date(d);
    render();
}

// ========================================
// Scroll To Top
// ========================================
function initScrollTop() {
    if (!appContainer || !btnScrollTop) return;

    appContainer.addEventListener('scroll', () => {
        btnScrollTop.style.display = appContainer.scrollTop > 200 ? 'flex' : 'none';
    });
    window.addEventListener('scroll', () => {
        btnScrollTop.style.display = window.scrollY > 200 ? 'flex' : 'none';
    });
    btnScrollTop.addEventListener('click', () => {
        appContainer.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// ========================================
// Schedule Modal Management
// ========================================
function initModal() {
    if (btnAdd) btnAdd.addEventListener('click', () => openModal());

    const modalClose = $('#modalClose');
    if (modalClose) modalClose.addEventListener('click', closeModal);
    const btnCancel = $('#btnCancel');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    if (modalOverlay) modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    if (subjectForm) subjectForm.addEventListener('submit', (e) => { e.preventDefault(); saveSubject(); });

    const deleteCancel = $('#btnDeleteCancel');
    if (deleteCancel) deleteCancel.addEventListener('click', () => { deleteOverlay.style.display = 'none'; STATE.deleteTargetId = null; });

    const deleteConfirm = $('#btnDeleteConfirm');
    if (deleteConfirm) {
        deleteConfirm.addEventListener('click', async () => {
            if (!STATE.deleteTargetId) return;
            try {
                await api('DELETE', `/api/schedules/${STATE.deleteTargetId}`);
                deleteOverlay.style.display = 'none';
                STATE.deleteTargetId = null;
                showToast('Đã xóa môn học');
                loadSchedules();
            } catch (e) {
                showToast('Xóa thất bại');
            }
        });
    }

    if (deleteOverlay) deleteOverlay.addEventListener('click', (e) => {
        if (e.target === deleteOverlay) { deleteOverlay.style.display = 'none'; STATE.deleteTargetId = null; }
    });
}

function openModal(editSubject = null) {
    if (!STATE.isAdmin || !modalOverlay || !subjectForm) return;
    modalOverlay.style.display = 'flex';
    subjectForm.reset();

    if (editSubject) {
        if (modalTitle) modalTitle.textContent = 'Sửa môn học';
        $('#subjectName').value = editSubject.name;
        $('#periodStart').value = editSubject.periodStart;
        $('#periodEnd').value = editSubject.periodEnd;
        $('#timeStart').value = editSubject.timeStart;
        $('#timeEnd').value = editSubject.timeEnd;
        $('#room').value = editSubject.room;
        $('#lecturer').value = editSubject.lecturer;
        $('#dateFrom').value = editSubject.dateFrom || '';
        $('#dateTo').value = editSubject.dateTo || '';
        $('#editId').value = editSubject.id;
        $$('#dayPicker input[type="checkbox"]').forEach(cb => {
            cb.checked = (editSubject.days || []).includes(parseInt(cb.value));
        });
    } else {
        if (modalTitle) modalTitle.textContent = 'Thêm môn học';
        $('#editId').value = '';
        $$('#dayPicker input[type="checkbox"]').forEach(cb => cb.checked = false);
    }

    setTimeout(() => { const el = $('#subjectName'); if (el) el.focus(); }, 100);
}

function closeModal() {
    if (modalOverlay) modalOverlay.style.display = 'none';
    if (subjectForm) subjectForm.reset();
}

async function saveSubject() {
    if (!STATE.isAdmin) return;

    const selectedDays = [];
    $$('#dayPicker input[type="checkbox"]:checked').forEach(cb => {
        selectedDays.push(parseInt(cb.value));
    });

    if (selectedDays.length === 0) { showToast('Vui lòng chọn ít nhất 1 ngày học'); return; }

    const dateFrom = $('#dateFrom').value;
    const dateTo = $('#dateTo').value;
    if (!dateFrom || !dateTo) { showToast('Vui lòng chọn ngày bắt đầu và kết thúc'); return; }
    if (dateFrom > dateTo) { showToast('Ngày bắt đầu phải trước ngày kết thúc'); return; }

    const subject = {
        name: $('#subjectName').value.trim(),
        periodStart: parseInt($('#periodStart').value),
        periodEnd: parseInt($('#periodEnd').value),
        timeStart: $('#timeStart').value,
        timeEnd: $('#timeEnd').value,
        room: $('#room').value.trim(),
        lecturer: $('#lecturer').value.trim(),
        days: selectedDays,
        dateFrom, dateTo,
    };

    const editId = $('#editId').value;
    const saveBtn = $('#btnSave');

    try {
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Đang lưu...'; }

        if (editId) {
            await api('PUT', `/api/schedules/${editId}`, subject);
            showToast('Đã cập nhật môn học');
        } else {
            await api('POST', '/api/schedules', subject);
            showToast('Đã thêm môn học mới');
        }

        closeModal();
        loadSchedules();
    } catch (e) {
        showToast(e.message || 'Lưu thất bại');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Lưu'; }
    }
}

// ========================================
// Toast Notification
// ========================================
function showToast(message) {
    let toast = $('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ========================================
// Rendering
// ========================================
function render() {
    updateDateDisplay();
    renderContent();
}

function updateDateDisplay() {
    if (!dateText) return;
    const d = STATE.selectedDate;
    switch (STATE.viewMode) {
        case 'day': dateText.textContent = formatDate(d); break;
        case 'week': dateText.textContent = formatWeek(d); break;
        case 'month': dateText.textContent = formatMonth(d); break;
    }
}

function getSubjectsForDate(date) {
    const dayOfWeek = date.getDay();
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return STATE.subjects.filter(s => {
        if (!s.days || !s.days.includes(dayOfWeek)) return false;
        if (s.dateFrom && s.dateTo) return dateStr >= s.dateFrom && dateStr <= s.dateTo;
        return true;
    });
}

window.selectDate = function (isoStr) {
    STATE.selectedDate = new Date(isoStr);
    render();
};

function renderContent() {
    const subjects = getSubjectsForDate(STATE.selectedDate);
    if (STATE.viewMode === 'day') renderDayView(subjects);
    else if (STATE.viewMode === 'week') renderWeekView();
    else renderMonthView();
}

function renderDayView(subjects) {
    if (subjects.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        if (scheduleCards) scheduleCards.innerHTML = '';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (scheduleCards) {
        scheduleCards.innerHTML = subjects
            .sort((a, b) => a.periodStart - b.periodStart)
            .map(s => createCardHTML(s)).join('');
    }
}

function renderWeekView() {
    const monday = getMonday(STATE.selectedDate);
    let allEmpty = true;
    let html = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const subjects = getSubjectsForDate(d);
        if (subjects.length > 0) {
            allEmpty = false;
            const dayLabel = `${getDayOfWeekVi(d)}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
            html += `<div class="day-group-header">${dayLabel}</div>`;
            html += subjects.sort((a, b) => a.periodStart - b.periodStart)
                .map(s => createCardHTML(s)).join('');
        }
    }

    if (allEmpty) {
        if (emptyState) emptyState.style.display = 'flex';
        if (scheduleCards) scheduleCards.innerHTML = '';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (scheduleCards) scheduleCards.innerHTML = html;
    }
}

function renderMonthView() {
    const year = STATE.selectedDate.getFullYear();
    const month = STATE.selectedDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    let allEmpty = true;
    let html = '';

    for (let day = 1; day <= lastDay; day++) {
        const d = new Date(year, month, day);
        const subjects = getSubjectsForDate(d);
        if (subjects.length > 0) {
            allEmpty = false;
            const dayLabel = `${getDayOfWeekVi(d)}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
            html += `<div class="day-group-header">${dayLabel}</div>`;
            html += subjects.sort((a, b) => a.periodStart - b.periodStart)
                .map(s => createCardHTML(s)).join('');
        }
    }

    if (allEmpty) {
        if (emptyState) emptyState.style.display = 'flex';
        if (scheduleCards) scheduleCards.innerHTML = '';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        if (scheduleCards) scheduleCards.innerHTML = html;
    }
}

function createCardHTML(subject) {
    let dateRangeStr = '';
    if (subject.dateFrom && subject.dateTo) {
        const from = subject.dateFrom.split('-');
        const to = subject.dateTo.split('-');
        dateRangeStr = `${from[2]}/${from[1]}/${from[0]} - ${to[2]}/${to[1]}/${to[0]}`;
    }

    const now = new Date();
    const updateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const dayLabels = (subject.days || []).map(d => d === 0 ? 'CN' : `T${d + 1}`).join(', ');

    const actionsHtml = STATE.isAdmin ? `
        <div class="card-actions">
            <button class="card-action-btn edit" onclick="editSubject('${subject.id}')" title="Sửa">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
            </button>
            <button class="card-action-btn delete" onclick="deleteSubject('${subject.id}')" title="Xóa">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    ` : '';

    return `
        <div class="schedule-card" data-id="${subject.id}">
            ${actionsHtml}
            <div class="card-subject-name" style="${STATE.isAdmin ? '' : 'padding-right:0;'}">${subject.name}</div>
            <div class="card-details">
                <span class="card-label">Tiết học</span>
                <span class="card-value">${subject.periodStart} - ${subject.periodEnd}</span>
                <span class="card-label">Thời gian</span>
                <span class="card-value">${subject.timeStart} - ${subject.timeEnd}</span>
                <span class="card-label">Phòng học</span>
                <span class="card-value">${subject.room}</span>
                <span class="card-label">Giảng viên</span>
                <span class="card-value">${subject.lecturer}</span>
                <span class="card-label">Ngày học</span>
                <span class="card-value">${dayLabels}</span>
                ${dateRangeStr ? `<span class="card-label">Thời hạn</span><span class="card-value">${dateRangeStr}</span>` : ''}
            </div>
            <div class="card-update-info">
                Dữ liệu được cập nhật đến <a href="#">${updateStr}</a>
            </div>
        </div>
    `;
}

// ========================================
// Global Action Handlers
// ========================================
window.editSubject = function (id) {
    if (!STATE.isAdmin) return;
    const subject = STATE.subjects.find(s => s.id === id);
    if (subject) openModal(subject);
};

window.deleteSubject = function (id) {
    if (!STATE.isAdmin) return;
    STATE.deleteTargetId = id;
    if (deleteOverlay) deleteOverlay.style.display = 'flex';
};

// ========================================
// Server Config (Android only)
// ========================================
window.saveServerUrl = function () {
    const input = $('#serverUrlInput');
    if (!input) return;
    let url = input.value.trim();
    if (url && !url.startsWith('http')) url = 'http://' + url;
    if (url.endsWith('/')) url = url.slice(0, -1);
    localStorage.setItem('tkb_server_url', url);
    showToast('Đã lưu địa chỉ server');
    hideAuthError();
};

window.toggleServerConfig = function () {
    const fields = $('#configFields');
    if (fields) {
        fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
    }
};

// ========================================
// Keyboard Shortcuts
// ========================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modals = [addUserOverlay, deleteUserOverlay, userMgmtOverlay, modalOverlay, deleteOverlay, viewModeDropdown, userDropdownOverlay];
        for (const m of modals) {
            if (m && m.style.display === 'flex') {
                m.style.display = 'none';
                if (m === deleteOverlay) STATE.deleteTargetId = null;
                if (m === deleteUserOverlay) STATE.deleteUserTargetId = null;
                return;
            }
        }
    }

    const anyOpen = [modalOverlay, deleteOverlay, userMgmtOverlay, addUserOverlay, deleteUserOverlay]
        .some(m => m && m.style.display === 'flex');
    if (!anyOpen && appContainer && appContainer.style.display !== 'none') {
        if (e.key === 'ArrowLeft') navigateDate(-1);
        else if (e.key === 'ArrowRight') navigateDate(1);
    }
});

// ========================================
// Touch Swipe Support
// ========================================
let touchStartX = 0;

document.addEventListener('DOMContentLoaded', () => {
    if (appContainer) {
        appContainer.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        appContainer.addEventListener('touchend', (e) => {
            const diff = touchStartX - e.changedTouches[0].screenX;
            if (Math.abs(diff) > 80) navigateDate(diff > 0 ? 1 : -1);
        }, { passive: true });
    }
});

// ========================================
// Auth UI Events
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // Check server URL on Android
            if (!IS_WEB && !getApiBase()) {
                showAuthError('Vui lòng cấu hình địa chỉ server trước');
                const fields = $('#configFields');
                if (fields) fields.style.display = 'block';
                return;
            }
            const email = $('#loginEmail').value.trim();
            const password = $('#loginPassword').value;
            handleLogin(email, password);
        });
    }

    // Toggle login/register (Android only, if register form exists)
    const toRegister = $('#toRegister');
    if (toRegister) {
        toRegister.addEventListener('click', (e) => {
            e.preventDefault();
            hideAuthError();
            if (loginCard) loginCard.style.display = 'none';
            if (registerCard) registerCard.style.display = 'block';
        });
    }

    const toLogin = $('#toLogin');
    if (toLogin) {
        toLogin.addEventListener('click', (e) => {
            e.preventDefault();
            hideAuthError();
            if (registerCard) registerCard.style.display = 'none';
            if (loginCard) loginCard.style.display = 'block';
        });
    }
});

// ========================================
// App Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    showScreen('loading');

    setTimeout(async () => {
        // Check if we have a valid token
        const loggedIn = await tryAutoLogin();
        if (loggedIn) {
            enterApp();
        } else {
            showAuthScreen();
        }
    }, 600);
});
