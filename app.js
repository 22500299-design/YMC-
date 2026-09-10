// YMC Accounting Management System JS

// Global State
let events = [];
let incomeRecords = [];
let expenditureRecords = [];
let budgetRecords = [];
let comparisonRecords = [];
let dashboardStats = null;
let summaryChart = null;

// Dues Global State
let feeItems = [];
let selectedFeeItemId = null;
let currentDuesPayments = [];

// API Base URL
const API_BASE = '/api';

// Toast Notification Helper
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);
    
    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Format Currency
function formatCurrency(amount) {
    const value = Number(amount);
    const normalizedAmount = Number.isFinite(value) ? value : 0;
    return `${normalizedAmount.toLocaleString('ko-KR')}원`;
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initMobileNavigation();
    initEventListeners();
    initFileUploads();
    
    // Initial Data Fetch
    fetchAllData();
});

// Navigation & Routing Setup
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');

    const viewMeta = {
        dashboard: { title: '대시보드', subtitle: '동아리 회계 정보 통합 대시보드' },
        dues: { title: '회비 관리', subtitle: '연간 2회 정기회비 및 행사별 회비 납부 현황 실시간 관리' },
        events: { title: '행사 마스터', subtitle: '행사 정보 등록 및 기본 마스터 정보 관리' },
        budgets: { title: '예산 계획', subtitle: '행사별 예상 수입 및 지출 한도 설정' },
        income: { title: '수입 관리', subtitle: '회비, 지원금, 후원금 등 수입 내역 관리' },
        expenditures: { title: '지출 관리', subtitle: '영수증 증빙 및 세부 지출 항목 관리' },
        gallery: { title: '영수증 갤러리', subtitle: '제출된 영수증 한눈에 검토 및 승인 처리' },
        settlements: { title: '결산 보고', subtitle: '수립된 예산 계획 대비 실제 지출 및 수입 비교 검증 및 결산 확정' },
        export: { title: '보고서 및 출력', subtitle: '학교 보고서 양식용 파일 다운로드 및 출력' }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Check if member form button
            if (item.id === 'open-member-form-btn') return;
            
            const target = item.getAttribute('data-target');
            if (!target) return;

            // Update Nav Active State
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // Update View Section Visibility
            sections.forEach(s => s.classList.remove('active'));
            const targetSection = document.getElementById(`${target}-section`);
            if (targetSection) targetSection.classList.add('active');

            // Update Headers
            if (viewMeta[target]) {
                viewTitle.textContent = viewMeta[target].title;
                viewSubtitle.textContent = viewMeta[target].subtitle;
            }
            
            // Refresh data for specific views
            if (target === 'dashboard') {
                fetchDashboardStats();
            } else if (target === 'dues') {
                fetchFeeItems(selectedFeeItemId);
            } else if (target === 'budgets') {
                fetchBudgets();
            } else if (target === 'settlements') {
                fetchComparison();
            }
        });
    });

    // Hash change handler for routing (e.g. member submission link)
    window.addEventListener('hashchange', handleHashRouting);
    handleHashRouting();
}

function handleHashRouting() {
    const hash = window.location.hash;
    if (hash === '#submit-form' || hash === '#form') {
        openFullscreenForm();
    } else {
        closeFullscreenForm();
    }
}

// Mobile Sidebar Navigation
function initMobileNavigation() {
    const menuButton = document.getElementById('mobile-menu-btn');
    const closeButton = document.getElementById('mobile-nav-close');
    const backdrop = document.getElementById('sidebar-backdrop');
    const navItems = document.querySelectorAll('aside .nav-item');
    const mobileQuery = window.matchMedia('(max-width: 768px)');

    if (!menuButton || !closeButton || !backdrop) return;

    const setMenuOpen = (isOpen) => {
        document.body.classList.toggle('mobile-nav-open', isOpen);
        menuButton.setAttribute('aria-expanded', String(isOpen));
    };

    menuButton.addEventListener('click', () => setMenuOpen(true));
    closeButton.addEventListener('click', () => setMenuOpen(false));
    backdrop.addEventListener('click', () => setMenuOpen(false));

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (mobileQuery.matches) setMenuOpen(false);
        });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setMenuOpen(false);
    });

    mobileQuery.addEventListener('change', (event) => {
        if (!event.matches) setMenuOpen(false);
    });
}

// Fullscreen Form Toggle Functions
function openFullscreenForm() {
    document.getElementById('member-form-layout').classList.add('active');
    document.body.style.overflow = 'hidden'; // prevent double scrollbars
    // Reset Form
    resetReceiptForm();
}

function closeFullscreenForm() {
    document.getElementById('member-form-layout').classList.remove('active');
    document.body.style.overflow = 'auto';
    // Clear URL Hash if any
    if (window.location.hash === '#submit-form' || window.location.hash === '#form') {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
}

// Data Fetching Functions
async function fetchAllData() {
    try {
        // Events must load first because the other views render event names/dropdowns.
        await fetchEvents();
        await Promise.all([
            fetchIncome(),
            fetchExpenditures(),
            fetchBudgets(),
            fetchDashboardStats(),
            fetchFeeItems()
        ]);
    } catch (err) {
        showToast('데이터를 불러오는 데 실패했습니다.', 'error');
        console.error(err);
    }
}

async function fetchEvents() {
    try {
        const response = await fetch(`${API_BASE}/events`);
        if (!response.ok) throw new Error('API Error');
        events = await response.json();
        
        renderEventsList();
        populateEventDropdowns();
    } catch (err) {
        console.error('Events load error:', err);
    }
}

async function fetchIncome() {
    try {
        const response = await fetch(`${API_BASE}/income`);
        if (!response.ok) throw new Error('API Error');
        incomeRecords = await response.json();
        
        renderIncomeTable();
    } catch (err) {
        console.error('Income load error:', err);
    }
}

async function fetchExpenditures() {
    try {
        const response = await fetch(`${API_BASE}/expenditures`);
        if (!response.ok) throw new Error('API Error');
        expenditureRecords = await response.json();
        
        renderExpenditureTable();
        renderReceiptGallery();
    } catch (err) {
        console.error('Expenditures load error:', err);
    }
}

async function fetchDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/dashboard/stats`);
        if (!response.ok) throw new Error('API Error');
        dashboardStats = await response.json();
        
        updateDashboardUI();
    } catch (err) {
        console.error('Dashboard stats load error:', err);
    }
}

async function fetchBudgets() {
    try {
        const response = await fetch(`${API_BASE}/budgets`);
        if (!response.ok) throw new Error('API Error');
        budgetRecords = await response.json();
        
        renderBudgetTable();
    } catch (err) {
        console.error('Budgets load error:', err);
    }
}

async function fetchComparison() {
    try {
        const response = await fetch(`${API_BASE}/settlements/compare`);
        if (!response.ok) throw new Error('API Error');
        comparisonRecords = await response.json();
        
        renderSettlementsTable();
        renderSettlementsSummary();
    } catch (err) {
        console.error('Settlements comparison load error:', err);
    }
}

// UI Rendering Functions

// Render Event Master View
function renderEventsList() {
    const container = document.getElementById('events-list-container');
    container.innerHTML = '';
    
    if (events.length === 0) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-muted);">등록된 행사가 없습니다.</div>`;
        return;
    }
    
    events.forEach(event => {
        const item = document.createElement('div');
        item.className = 'event-item';
        item.innerHTML = `
            <div class="event-info">
                <span class="event-name-txt">${escapeHTML(event.name)}</span>
                <span class="event-month-txt"><i class="fa-regular fa-calendar"></i> ${event.month ? escapeHTML(event.month) : '미지정'}</span>
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="btn btn-secondary btn-icon" onclick="editEvent(${event.id}, '${escapeQuote(event.name)}', '${escapeQuote(event.month)}')">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-danger btn-icon" onclick="deleteEvent(${event.id})">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        container.appendChild(item);
    });
}

// Populate Event Select Option Dropdowns in Modals & Forms
function populateEventDropdowns() {
    const dropdowns = [
        document.getElementById('income-modal-event'),
        document.getElementById('expenditure-modal-event'),
        document.getElementById('budget-modal-event'),
        document.getElementById('dues-item-modal-event'),
        document.getElementById('form-event-id'),
        document.getElementById('income-filter-event'),
        document.getElementById('expenditure-filter-event'),
        document.getElementById('gallery-filter-event'),
        document.getElementById('budget-filter-event')
    ];
    
    dropdowns.forEach(dropdown => {
        if (!dropdown) return;
        
        // Keep the first option if it is an empty placeholder
        const isFilter = dropdown.id.includes('filter');
        const firstOptionText = isFilter ? '모든 행사 필터' : '행사 선택...';
        
        dropdown.innerHTML = `<option value="">${firstOptionText}</option>`;
        
        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = event.name;
            dropdown.appendChild(option);
        });
    });
}

// Render event-based budget proposal cards
function renderBudgetTable() {
    const container = document.getElementById('budget-plan-grid');
    const searchVal = document.getElementById('budget-search').value.trim().toLowerCase();
    const filterEvent = document.getElementById('budget-filter-event').value;
    const filterType = document.getElementById('budget-filter-type').value;

    container.innerHTML = '';

    const visibleEvents = events.filter(event => {
        if (filterEvent && String(event.id) !== filterEvent) return false;
        const rows = budgetRecords.filter(row => Number(row.event_id) === Number(event.id));
        if (!searchVal) return true;
        return event.name.toLowerCase().includes(searchVal) || rows.some(row =>
            [row.description, row.details, row.category, row.type]
                .some(value => String(value || '').toLowerCase().includes(searchVal))
        );
    });

    if (visibleEvents.length === 0) {
        container.innerHTML = `<div class="glass-panel budget-empty-state">
            <i class="fa-solid fa-magnifying-glass"></i>
            <strong>조건에 맞는 예산안이 없습니다.</strong>
            <span>검색 조건을 바꾸거나 새 예산 항목을 등록해 주세요.</span>
        </div>`;
        return;
    }

    visibleEvents.forEach(event => {
        const allEventRows = budgetRecords.filter(row => Number(row.event_id) === Number(event.id));
        const rows = allEventRows.filter(row => {
            const matchesType = !filterType || row.type === filterType;
            const matchesSearch = !searchVal || event.name.toLowerCase().includes(searchVal) ||
                [row.description, row.details, row.category, row.type]
                    .some(value => String(value || '').toLowerCase().includes(searchVal));
            return matchesType && matchesSearch;
        });
        const plannedIncome = allEventRows
            .filter(row => row.type === '수입')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const plannedExpense = allEventRows
            .filter(row => row.type === '지출')
            .reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const balance = plannedIncome - plannedExpense;

        const card = document.createElement('article');
        card.className = 'glass-panel budget-plan-card';

        const rowHtml = rows.length > 0 ? rows.map(row => `
            <tr>
                <td data-label="구분"><span class="budget-type-badge ${row.type === '수입' ? 'income' : 'expense'}">${escapeHTML(row.type)}</span></td>
                <td data-label="항목">
                    <strong class="budget-item-name">${escapeHTML(row.description)}</strong>
                    <span class="budget-category">${escapeHTML(row.category)}</span>
                </td>
                <td data-label="수량·산출근거">${escapeHTML(row.details || '-')}</td>
                <td data-label="예상 비용" class="budget-amount">${formatCurrency(row.amount)}</td>
                <td data-label="작업">
                    <div class="budget-row-actions">
                        <button class="btn btn-secondary btn-icon" type="button" aria-label="예산 항목 수정" onclick="openEditBudget(${row.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-danger btn-icon" type="button" aria-label="예산 항목 삭제" onclick="deleteBudget(${row.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('') : `<tr><td colspan="5" class="budget-no-rows">${filterType ? `${escapeHTML(filterType)} 예산 항목이 없습니다.` : '아직 등록된 예산 항목이 없습니다.'}</td></tr>`;

        card.innerHTML = `
            <div class="budget-card-header">
                <div>
                    <span class="budget-card-kicker">${escapeHTML(event.month || '일정 미정')}</span>
                    <h2>${escapeHTML(event.name)} 예산안</h2>
                </div>
                <button class="btn btn-primary budget-card-add" type="button" onclick="openBudgetModal(${event.id}, '지출')">
                    <i class="fa-solid fa-plus"></i> 항목 추가
                </button>
            </div>
            <div class="budget-card-table-wrap">
                <table class="budget-card-table">
                    <thead><tr><th>구분</th><th>항목</th><th>수량·산출근거</th><th>예상 비용</th><th>작업</th></tr></thead>
                    <tbody>${rowHtml}</tbody>
                </table>
            </div>
            <div class="budget-card-summary">
                <div><span>예상 수입</span><strong>${formatCurrency(plannedIncome)}</strong></div>
                <div><span>예상 지출</span><strong>${formatCurrency(plannedExpense)}</strong></div>
                <div class="budget-total"><span>${plannedIncome > 0 ? '예상 잔액' : '총 예산'}</span><strong>${formatCurrency(plannedIncome > 0 ? balance : plannedExpense)}</strong></div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Render Income Ledger Table
function renderIncomeTable() {
    const tbody = document.getElementById('income-table-body');
    const searchVal = document.getElementById('income-search').value.toLowerCase();
    const filterEvent = document.getElementById('income-filter-event').value;
    const filterCategory = document.getElementById('income-filter-category').value;
    
    tbody.innerHTML = '';
    
    const filtered = incomeRecords.filter(row => {
        const matchesSearch = row.description.toLowerCase().includes(searchVal) || 
                              (row.basis && row.basis.toLowerCase().includes(searchVal)) ||
                              (row.remarks && row.remarks.toLowerCase().includes(searchVal));
        const matchesEvent = !filterEvent || String(row.event_id) === filterEvent;
        const matchesCategory = !filterCategory || row.category === filterCategory;
        
        return matchesSearch && matchesEvent && matchesCategory;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 40px;">조회할 수입 내역이 없습니다.</td></tr>`;
        return;
    }
    
    filtered.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="white-space: nowrap;">${escapeHTML(row.transaction_date || '-')}</td>
            <td>${escapeHTML(row.payer_name || '-')}</td>
            <td style="font-weight: 500;">${escapeHTML(row.event_name || '미지정')}</td>
            <td><span class="badge" style="background: rgba(99, 102, 241, 0.15); color: var(--primary);">${escapeHTML(row.category)}</span></td>
            <td>${escapeHTML(row.description)}</td>
            <td style="font-family: var(--font-heading); font-weight: 600; text-align: right; color: var(--secondary);">${formatCurrency(row.amount)}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(row.basis || '-')}</td>
            <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary);">${escapeHTML(row.remarks || '-')}</td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-icon" onclick="openEditIncome(${row.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-icon" onclick="deleteIncome(${row.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Expenditure Ledger Table
function renderExpenditureTable() {
    const tbody = document.getElementById('expenditure-table-body');
    const searchVal = document.getElementById('expenditure-search').value.toLowerCase();
    const filterEvent = document.getElementById('expenditure-filter-event').value;
    const filterCategory = document.getElementById('expenditure-filter-category').value;
    const filterStatus = document.getElementById('expenditure-filter-status').value;
    
    tbody.innerHTML = '';
    
    const filtered = expenditureRecords.filter(row => {
        const matchesSearch = row.description.toLowerCase().includes(searchVal) || 
                              (row.basis && row.basis.toLowerCase().includes(searchVal)) ||
                              row.submitter.toLowerCase().includes(searchVal);
        const matchesEvent = !filterEvent || String(row.event_id) === filterEvent;
        const matchesCategory = !filterCategory || row.category === filterCategory;
        const matchesStatus = !filterStatus || row.status === filterStatus;
        
        return matchesSearch && matchesEvent && matchesCategory && matchesStatus;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 40px;">조회할 지출 내역이 없습니다.</td></tr>`;
        return;
    }
    
    filtered.forEach(row => {
        const tr = document.createElement('tr');
        
        const badgeClass = row.status === '승인 완료' ? 'badge-approved' : 'badge-pending';
        const badgeIcon = row.status === '승인 완료' ? 'fa-circle-check' : 'fa-clock';
        
        // Receipt attachment render
        let receiptHtml = '';
        if (row.receipt_path) {
            receiptHtml = `
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.8rem; display: flex; align-items: center; gap: 4px;" onclick="viewReceipt('${row.receipt_path}', '${escapeQuote(row.description)}')">
                    <i class="fa-regular fa-image" style="color: var(--secondary);"></i> 영수증 보기
                </button>
            `;
        } else {
            receiptHtml = `<span style="color: var(--text-muted); font-size: 0.8rem;">없음</span>`;
        }
        
        tr.innerHTML = `
            <td style="white-space: nowrap;">${escapeHTML(row.transaction_date || '-')}</td>
            <td>${escapeHTML(row.withdrawer_name || row.submitter || '-')}</td>
            <td style="font-weight: 500;">${escapeHTML(row.event_name || '미지정')}</td>
            <td><span class="badge" style="background: rgba(236, 72, 153, 0.15); color: var(--accent);">${escapeHTML(row.category)}</span></td>
            <td>${escapeHTML(row.description)}</td>
            <td style="font-family: var(--font-heading); font-weight: 600; text-align: right; color: #f87171;">${formatCurrency(row.amount)}</td>
            <td>${escapeHTML(row.submitter)}</td>
            <td>${receiptHtml}</td>
            <td>
                <span class="badge ${badgeClass}" style="cursor: pointer;" onclick="toggleStatusDirectly(${row.id}, '${row.status}')">
                    <i class="fa-solid ${badgeIcon}"></i> ${escapeHTML(row.status)}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-icon" onclick="openEditExpenditure(${row.id})"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-danger btn-icon" onclick="deleteExpenditure(${row.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Render Gallery View of receipts
function renderReceiptGallery() {
    const grid = document.getElementById('receipt-gallery-grid');
    const filterEvent = document.getElementById('gallery-filter-event').value;
    const filterStatus = document.getElementById('gallery-filter-status').value;
    
    grid.innerHTML = '';
    
    const filtered = expenditureRecords.filter(row => {
        const matchesEvent = !filterEvent || String(row.event_id) === filterEvent;
        const matchesStatus = !filterStatus || row.status === filterStatus;
        return matchesEvent && matchesStatus;
    });
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 60px;">조건에 맞는 영수증 카드가 없습니다.</div>`;
        return;
    }
    
    filtered.forEach(row => {
        const card = document.createElement('div');
        card.className = 'glass-panel gallery-card';
        
        const badgeClass = row.status === '승인 완료' ? 'badge-approved' : 'badge-pending';
        const badgeIcon = row.status === '승인 완료' ? 'fa-circle-check' : 'fa-clock';
        
        let thumbnailStyle = '';
        let noImageHtml = '';
        
        if (row.receipt_path) {
            thumbnailStyle = `background-image: url('${row.receipt_path}')`;
        } else {
            noImageHtml = `
                <div class="gallery-no-image">
                    <i class="fa-solid fa-file-invoice"></i>
                    <span>영수증 파일 없음</span>
                </div>
            `;
        }
        
        // Quick Action Button Text
        const actionBtnText = row.status === '승인 완료' ? '승인 대기로 변경' : '영수증 승인하기';
        const actionBtnClass = row.status === '승인 완료' ? 'btn-secondary' : 'btn-primary';
        const actionBtnIcon = row.status === '승인 완료' ? 'fa-undo' : 'fa-check';
        
        card.innerHTML = `
            <div class="gallery-thumbnail" style="${thumbnailStyle}" onclick="if('${row.receipt_path}') viewReceipt('${row.receipt_path}', '${escapeQuote(row.description)}')">
                ${noImageHtml}
                <div class="gallery-status-overlay">
                    <span class="badge ${badgeClass}">
                        <i class="fa-solid ${badgeIcon}"></i> ${escapeHTML(row.status)}
                    </span>
                </div>
            </div>
            <div class="gallery-info">
                <div class="gallery-title">${escapeHTML(row.description)}</div>
                <div class="gallery-meta">
                    <span><i class="fa-solid fa-tag"></i> ${escapeHTML(row.category)}</span>
                    <span><i class="fa-solid fa-user"></i> ${escapeHTML(row.submitter)}</span>
                </div>
                <div class="gallery-meta" style="margin-top: 4px;">
                    <span style="font-weight: 500; color: var(--text-primary);"><i class="fa-solid fa-calendar-day"></i> ${escapeHTML(row.event_name || '미지정 행사')}</span>
                    <span class="gallery-price">${formatCurrency(row.amount)}</span>
                </div>
            </div>
            <div class="gallery-actions">
                <button class="btn ${actionBtnClass}" onclick="toggleStatusDirectly(${row.id}, '${row.status}')">
                    <i class="fa-solid ${actionBtnIcon}"></i> ${actionBtnText}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Update Dashboard Summary Stats & Chart
function updateDashboardUI() {
    if (!dashboardStats) return;
    
    document.getElementById('stat-total-income').textContent = formatCurrency(dashboardStats.total_income);
    document.getElementById('stat-total-expenditure').textContent = formatCurrency(dashboardStats.total_expenditure);
    document.getElementById('stat-balance').textContent = formatCurrency(dashboardStats.balance);
    document.getElementById('stat-pending-count').textContent = `${dashboardStats.pending_receipts}건`;
    
    // Update Event Summary Table
    const tbody = document.getElementById('dashboard-event-table-body');
    tbody.innerHTML = '';
    
    if (dashboardStats.event_summaries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px;">행사 데이터가 없습니다.</td></tr>`;
    } else {
        dashboardStats.event_summaries.forEach(row => {
            const tr = document.createElement('tr');
            
            // Calculate budget execution percent
            const totalBudget = row.income_sum || 0;
            const spent = row.expenditure_sum || 0;
            const netBalance = totalBudget - spent;
            
            let percent = 0;
            let barColor = 'var(--primary)';
            if (totalBudget > 0) {
                percent = Math.round((spent / totalBudget) * 100);
            } else if (spent > 0) {
                percent = 100; // spent money without budget
                barColor = 'var(--danger)';
            }
            
            if (percent > 100) {
                barColor = 'var(--danger)';
            } else if (percent > 80) {
                barColor = 'var(--warning)';
            }
            
            tr.innerHTML = `
                <td style="font-weight: 600;">${escapeHTML(row.event_name)}</td>
                <td style="text-align: right; color: var(--secondary); font-family: var(--font-heading);">${formatCurrency(totalBudget)}</td>
                <td style="text-align: right; color: #f87171; font-family: var(--font-heading);">${formatCurrency(spent)}</td>
                <td style="text-align: right; font-weight: 600; font-family: var(--font-heading);">${formatCurrency(netBalance)}</td>
                <td style="width: 140px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                            <div style="width: ${Math.min(percent, 100)}%; height: 100%; background: ${barColor}; border-radius: 3px;"></div>
                        </div>
                        <span style="font-size: 0.75rem; font-weight: 600; min-width: 28px; text-align: right;">${percent}%</span>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    // Draw/Update Chart
    drawDashboardChart();
}

function drawDashboardChart() {
    const ctx = document.getElementById('dashboard-summary-chart').getContext('2d');
    
    if (summaryChart) {
        summaryChart.destroy();
    }
    
    const income = dashboardStats ? dashboardStats.total_income : 0;
    const spent = dashboardStats ? dashboardStats.total_expenditure : 0;
    
    if (income === 0 && spent === 0) {
        // Draw empty indicator
        return;
    }
    
    summaryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['총 수입(예산)', '총 지출(결산)'],
            datasets: [{
                data: [income, spent],
                backgroundColor: ['#6366f1', '#ec4899'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            cutout: '75%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${formatCurrency(context.raw)}`;
                        }
                    }
                }
            }
        }
    });
}

// Quick status toggling from List or Gallery
async function toggleStatusDirectly(id, currentStatus) {
    const newStatus = currentStatus === '승인 완료' ? '승인 대기' : '승인 완료';
    try {
        const response = await fetch(`${API_BASE}/expenditures/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: newStatus })
        });
        
        if (!response.ok) throw new Error('API Error');
        
        showToast(`상태가 '${newStatus}'(으)로 변경되었습니다.`, 'success');
        
        // Reload all data
        fetchAllData();
    } catch (err) {
        showToast('상태 변경 실패', 'error');
        console.error(err);
    }
}

// Init general event listeners (filters, modal triggers, submit actions)
function initEventListeners() {
    // Budget filters
    document.getElementById('budget-search').addEventListener('input', renderBudgetTable);
    document.getElementById('budget-filter-event').addEventListener('change', renderBudgetTable);
    document.getElementById('budget-filter-type').addEventListener('change', renderBudgetTable);

    // Income filters
    document.getElementById('income-search').addEventListener('input', renderIncomeTable);
    document.getElementById('income-filter-event').addEventListener('change', renderIncomeTable);
    document.getElementById('income-filter-category').addEventListener('change', renderIncomeTable);
    
    // Expenditure filters
    document.getElementById('expenditure-search').addEventListener('input', renderExpenditureTable);
    document.getElementById('expenditure-filter-event').addEventListener('change', renderExpenditureTable);
    document.getElementById('expenditure-filter-category').addEventListener('change', renderExpenditureTable);
    document.getElementById('expenditure-filter-status').addEventListener('change', renderExpenditureTable);
    
    // Gallery filters
    document.getElementById('gallery-filter-event').addEventListener('change', renderReceiptGallery);
    document.getElementById('gallery-filter-status').addEventListener('change', renderReceiptGallery);

    // Modal forms submissions
    document.getElementById('event-form').addEventListener('submit', handleEventSubmit);
    document.getElementById('income-form').addEventListener('submit', handleIncomeSubmit);
    document.getElementById('expenditure-form').addEventListener('submit', handleExpenditureSubmit);
    document.getElementById('budget-form').addEventListener('submit', handleBudgetSubmit);
    document.getElementById('receipt-submit-form').addEventListener('submit', handleReceiptSubmit);
    
    // Direct modal triggers
    document.getElementById('add-event-btn').addEventListener('click', () => {
        document.getElementById('event-modal-title').textContent = '행사 등록';
        document.getElementById('event-modal-id').value = '';
        document.getElementById('event-modal-name').value = '';
        document.getElementById('event-modal-month').value = '';
        openModal('event-modal');
    });

    document.getElementById('add-income-btn').addEventListener('click', () => {
        document.getElementById('income-modal-title').textContent = '수입 내역 등록';
        document.getElementById('income-modal-id').value = '';
        document.getElementById('income-form').reset();
        document.getElementById('income-modal-date').value = new Date().toISOString().slice(0, 10);
        openModal('income-modal');
    });

    document.getElementById('add-expenditure-btn').addEventListener('click', () => {
        document.getElementById('expenditure-modal-title').textContent = '지출 내역 등록';
        document.getElementById('expenditure-modal-id').value = '';
        document.getElementById('expenditure-modal-receipt-path').value = '';
        document.getElementById('expenditure-form').reset();
        document.getElementById('expenditure-modal-date').value = new Date().toISOString().slice(0, 10);
        document.getElementById('admin-file-preview').style.display = 'none';
        openModal('expenditure-modal');
    });

    const addBudgetBtn = document.getElementById('add-budget-btn');
    if (addBudgetBtn) addBudgetBtn.addEventListener('click', () => openBudgetModal());

    // Dues filters & search
    const duesSearch = document.getElementById('dues-member-search');
    if (duesSearch) duesSearch.addEventListener('input', renderDuesPaymentsTable);
    const duesStatusFilter = document.getElementById('dues-status-filter');
    if (duesStatusFilter) duesStatusFilter.addEventListener('change', renderDuesPaymentsTable);

    // Dues actions & modal triggers
    const addFeeBtn = document.getElementById('add-fee-item-btn');
    if (addFeeBtn) addFeeBtn.addEventListener('click', openAddFeeItemModal);
    const editFeeBtn = document.getElementById('edit-fee-item-btn');
    if (editFeeBtn) editFeeBtn.addEventListener('click', openEditFeeItemModal);
    const delFeeBtn = document.getElementById('delete-fee-item-btn');
    if (delFeeBtn) delFeeBtn.addEventListener('click', deleteCurrentFeeItem);

    const addDuesMemberBtn = document.getElementById('add-dues-member-btn');
    if (addDuesMemberBtn) addDuesMemberBtn.addEventListener('click', openAddDuesMemberModal);
    const batchAddBtn = document.getElementById('batch-add-members-btn');
    if (batchAddBtn) batchAddBtn.addEventListener('click', openBatchAddMembersModal);
    const copyMembersBtn = document.getElementById('copy-members-btn');
    if (copyMembersBtn) copyMembersBtn.addEventListener('click', openCopyMembersModal);
    const copyUnpaidBtn = document.getElementById('copy-unpaid-text-btn');
    if (copyUnpaidBtn) copyUnpaidBtn.addEventListener('click', copyUnpaidMembersText);
    const syncIncomeBtn = document.getElementById('sync-income-btn');
    if (syncIncomeBtn) syncIncomeBtn.addEventListener('click', syncDuesToIncome);

    // Dues form submissions
    const duesItemForm = document.getElementById('dues-item-form');
    if (duesItemForm) duesItemForm.addEventListener('submit', handleFeeItemSubmit);
    const duesMemberForm = document.getElementById('dues-member-form');
    if (duesMemberForm) duesMemberForm.addEventListener('submit', handleDuesMemberSubmit);
    const duesBatchForm = document.getElementById('dues-batch-form');
    if (duesBatchForm) duesBatchForm.addEventListener('submit', handleBatchAddSubmit);
    const duesCopyForm = document.getElementById('dues-copy-form');
    if (duesCopyForm) duesCopyForm.addEventListener('submit', handleCopyMembersSubmit);

    // Report export triggers
    document.getElementById('export-ledger-btn').addEventListener('click', exportTransactionLedger);
    document.getElementById('export-settlement-btn').addEventListener('click', exportSettlementReport);

    // External Member Form Button trigger
    document.getElementById('open-member-form-btn').addEventListener('click', () => {
        window.location.hash = '#submit-form';
    });
    
    document.getElementById('close-member-form-btn').addEventListener('click', () => {
        window.location.hash = '';
    });

    document.getElementById('form-reset-btn').addEventListener('click', () => {
        resetReceiptForm();
    });
}

// Modal open/close helpers
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

window.closeModal = closeModal; // Expose globally for close triggers

// File Attachment handling
let selectedFile = null;
let selectedAdminFile = null;

function initFileUploads() {
    const dropzone = document.getElementById('file-dropzone');
    const fileInput = document.getElementById('form-receipt-file');
    const preview = document.getElementById('file-preview');
    const previewImg = document.getElementById('file-preview-img');
    const previewName = document.getElementById('file-preview-name');

    // Drag-and-drop
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0], preview, previewImg, previewName, 'member');
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0], preview, previewImg, previewName, 'member');
        }
    });

    // Admin dialog upload
    const adminDropzone = document.getElementById('admin-file-dropzone');
    const adminFileInput = document.getElementById('expenditure-modal-file');
    const adminPreview = document.getElementById('admin-file-preview');
    const adminPreviewImg = document.getElementById('admin-file-preview-img');
    const adminPreviewName = document.getElementById('admin-file-preview-name');

    adminDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        adminDropzone.classList.add('dragover');
    });

    adminDropzone.addEventListener('dragleave', () => {
        adminDropzone.classList.remove('dragover');
    });

    adminDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        adminDropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0], adminPreview, adminPreviewImg, adminPreviewName, 'admin');
        }
    });

    adminFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0], adminPreview, adminPreviewImg, adminPreviewName, 'admin');
        }
    });
}

function handleFileSelect(file, previewContainer, previewImage, previewFileName, mode) {
    if (!file.type.match('image.*') && file.type !== 'application/pdf') {
        showToast('이미지 파일 또는 PDF 파일만 업로드할 수 있습니다.', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showToast('파일 크기는 10MB를 초과할 수 없습니다.', 'error');
        return;
    }

    if (mode === 'member') {
        selectedFile = file;
    } else {
        selectedAdminFile = file;
    }

    // Set Preview Name
    previewFileName.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    
    // Set Preview Image if image file
    if (file.type.match('image.*')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            previewImage.src = e.target.result;
            previewImage.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        // PDF Icon placeholder
        previewImage.src = 'https://cdn-icons-png.flaticon.com/512/337/337946.png'; // standard PDF thumbnail
    }
    
    previewContainer.style.display = 'flex';
}

// View Receipt lightbox
function viewReceipt(path, desc) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const caption = document.getElementById('lightbox-caption');
    
    img.src = path;
    caption.textContent = desc;
    modal.classList.add('active');
}
window.viewReceipt = viewReceipt; // Expose globally

// Submit handlers

// 1. Event Master CRUD
async function handleEventSubmit(e) {
    const id = document.getElementById('event-modal-id').value;
    const name = document.getElementById('event-modal-name').value;
    const month = document.getElementById('event-modal-month').value;
    
    const url = `${API_BASE}/events`;
    const method = id ? 'PUT' : 'POST';
    const body = id ? { id, name, month } : { name, month };

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Server error');
        }
        
        showToast(id ? '행사가 수정되었습니다.' : '행사가 추가되었습니다.', 'success');
        closeModal('event-modal');
        fetchAllData();
    } catch (err) {
        showToast(err.message || '요청 실패', 'error');
    }
}

function editEvent(id, name, month) {
    document.getElementById('event-modal-title').textContent = '행사 수정';
    document.getElementById('event-modal-id').value = id;
    document.getElementById('event-modal-name').value = name;
    document.getElementById('event-modal-month').value = month;
    openModal('event-modal');
}
window.editEvent = editEvent;

async function deleteEvent(id) {
    if (!confirm('정말로 이 행사를 삭제하시겠습니까?\n연관된 수입 및 지출 내역의 행사 연결이 해제됩니다.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/events?id=${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        
        showToast('행사가 삭제되었습니다.', 'success');
        fetchAllData();
    } catch (err) {
        showToast('삭제 실패', 'error');
    }
}
window.deleteEvent = deleteEvent;

// 2. Income CRUD
async function handleIncomeSubmit(e) {
    const id = document.getElementById('income-modal-id').value;
    const transaction_date = document.getElementById('income-modal-date').value;
    const payer_name = document.getElementById('income-modal-payer').value;
    const event_id = document.getElementById('income-modal-event').value;
    const category = document.getElementById('income-modal-category').value;
    const description = document.getElementById('income-modal-description').value;
    const amount = document.getElementById('income-modal-amount').value;
    const basis = document.getElementById('income-modal-basis').value;
    const remarks = document.getElementById('income-modal-remarks').value;
    
    const url = `${API_BASE}/income`;
    const method = id ? 'PUT' : 'POST';
    const body = {
        transaction_date,
        payer_name,
        category,
        event_id: event_id ? parseInt(event_id) : null,
        description,
        amount: parseInt(amount),
        basis,
        remarks
    };
    if (id) body.id = parseInt(id);

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) throw new Error('API Error');
        
        showToast(id ? '수입 내역이 수정되었습니다.' : '수입 내역이 등록되었습니다.', 'success');
        closeModal('income-modal');
        fetchAllData();
    } catch (err) {
        showToast('수입 내역 저장 실패', 'error');
    }
}

function openEditIncome(id) {
    const record = incomeRecords.find(r => r.id === id);
    if (!record) return;
    
    document.getElementById('income-modal-title').textContent = '수입 내역 수정';
    document.getElementById('income-modal-id').value = record.id;
    document.getElementById('income-modal-date').value = record.transaction_date || '';
    document.getElementById('income-modal-payer').value = record.payer_name || '';
    document.getElementById('income-modal-event').value = record.event_id || '';
    document.getElementById('income-modal-category').value = record.category;
    document.getElementById('income-modal-description').value = record.description;
    document.getElementById('income-modal-amount').value = record.amount;
    document.getElementById('income-modal-basis').value = record.basis || '';
    document.getElementById('income-modal-remarks').value = record.remarks || '';
    
    openModal('income-modal');
}
window.openEditIncome = openEditIncome;

async function deleteIncome(id) {
    if (!confirm('정말로 이 수입 항목을 삭제하시겠습니까?')) return;
    try {
        const response = await fetch(`${API_BASE}/income?id=${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        
        showToast('수입 내역이 삭제되었습니다.', 'success');
        fetchAllData();
    } catch (err) {
        showToast('삭제 실패', 'error');
    }
}
window.deleteIncome = deleteIncome;

// 3. Expenditure CRUD (Admin Portal)
async function handleExpenditureSubmit(e) {
    const id = document.getElementById('expenditure-modal-id').value;
    const transaction_date = document.getElementById('expenditure-modal-date').value;
    const withdrawer_name = document.getElementById('expenditure-modal-withdrawer').value;
    const submitter = document.getElementById('expenditure-modal-submitter').value;
    const event_id = document.getElementById('expenditure-modal-event').value;
    const category = document.getElementById('expenditure-modal-category').value;
    const amount = document.getElementById('expenditure-modal-amount').value;
    const description = document.getElementById('expenditure-modal-description').value;
    const status = document.getElementById('expenditure-modal-status').value;
    const basis = document.getElementById('expenditure-modal-basis').value;
    let receipt_path = document.getElementById('expenditure-modal-receipt-path').value;
    
    // Check if new file selected in Admin
    if (selectedAdminFile) {
        try {
            const formData = new FormData();
            formData.append('receipt', selectedAdminFile);
            
            const uploadRes = await fetch(`${API_BASE}/expenditures/upload`, {
                method: 'POST',
                body: formData
            });
            if (!uploadRes.ok) throw new Error('Upload failed');
            const uploadData = await uploadRes.json();
            receipt_path = uploadData.receipt_path;
        } catch (fileErr) {
            showToast('영수증 업로드에 실패했습니다.', 'error');
            return;
        }
    }

    const url = `${API_BASE}/expenditures`;
    const method = id ? 'PUT' : 'POST';
    const body = {
        transaction_date,
        withdrawer_name,
        category,
        event_id: event_id ? parseInt(event_id) : null,
        description,
        amount: parseInt(amount),
        basis,
        receipt_path,
        submitter,
        status
    };
    if (id) body.id = parseInt(id);

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) throw new Error('API Error');
        
        showToast(id ? '지출 내역이 수정되었습니다.' : '지출 내역이 등록되었습니다.', 'success');
        closeModal('expenditure-modal');
        // Reset state
        selectedAdminFile = null;
        fetchAllData();
    } catch (err) {
        showToast('지출 내역 저장 실패', 'error');
    }
}

function openEditExpenditure(id) {
    const record = expenditureRecords.find(r => r.id === id);
    if (!record) return;
    
    document.getElementById('expenditure-modal-title').textContent = '지출 내역 수정';
    document.getElementById('expenditure-modal-id').value = record.id;
    document.getElementById('expenditure-modal-date').value = record.transaction_date || '';
    document.getElementById('expenditure-modal-withdrawer').value = record.withdrawer_name || record.submitter || '';
    document.getElementById('expenditure-modal-submitter').value = record.submitter;
    document.getElementById('expenditure-modal-event').value = record.event_id || '';
    document.getElementById('expenditure-modal-category').value = record.category;
    document.getElementById('expenditure-modal-amount').value = record.amount;
    document.getElementById('expenditure-modal-description').value = record.description;
    document.getElementById('expenditure-modal-status').value = record.status;
    document.getElementById('expenditure-modal-basis').value = record.basis || '';
    document.getElementById('expenditure-modal-receipt-path').value = record.receipt_path || '';
    
    // File Preview
    const preview = document.getElementById('admin-file-preview');
    const previewImg = document.getElementById('admin-file-preview-img');
    const previewName = document.getElementById('admin-file-preview-name');
    
    selectedAdminFile = null;
    
    if (record.receipt_path) {
        previewImg.src = record.receipt_path;
        previewImg.style.display = 'block';
        previewName.textContent = '업로드된 파일 있음';
        preview.style.display = 'flex';
    } else {
        preview.style.display = 'none';
    }
    
    openModal('expenditure-modal');
}
window.openEditExpenditure = openEditExpenditure;

async function deleteExpenditure(id) {
    if (!confirm('정말로 이 지출 항목을 삭제하시겠습니까?\n첨부된 실물 영수증 증빙 파일도 영구 삭제됩니다.')) return;
    try {
        const response = await fetch(`${API_BASE}/expenditures?id=${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        
        showToast('지출 내역이 삭제되었습니다.', 'success');
        fetchAllData();
    } catch (err) {
        showToast('삭제 실패', 'error');
    }
}
window.deleteExpenditure = deleteExpenditure;

// 4. Budget planning CRUD
function openBudgetModal(eventId = '', type = '지출') {
    document.getElementById('budget-modal-title').textContent = '예산 항목 등록';
    document.getElementById('budget-form').reset();
    document.getElementById('budget-modal-id').value = '';
    document.getElementById('budget-modal-event').value = eventId || '';
    document.getElementById('budget-modal-type').value = type;
    openModal('budget-modal');
}
window.openBudgetModal = openBudgetModal;

async function handleBudgetSubmit() {
    const id = document.getElementById('budget-modal-id').value;
    const event_id = document.getElementById('budget-modal-event').value;
    const type = document.getElementById('budget-modal-type').value;
    const category = document.getElementById('budget-modal-category').value;
    const description = document.getElementById('budget-modal-description').value.trim();
    const details = document.getElementById('budget-modal-details').value.trim();
    const amount = Number(document.getElementById('budget-modal-amount').value);

    if (!event_id || !type || !category || !description || !Number.isFinite(amount) || amount < 0) {
        showToast('필수 항목과 올바른 금액을 입력해 주세요.', 'error');
        return;
    }

    const body = { event_id: Number(event_id), type, category, description, details, amount };
    if (id) body.id = Number(id);

    try {
        const response = await fetch(`${API_BASE}/budgets`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error('API Error');

        showToast(id ? '예산 항목이 수정되었습니다.' : '예산 항목이 등록되었습니다.', 'success');
        closeModal('budget-modal');
        await fetchBudgets();
    } catch (err) {
        showToast('예산 항목 저장에 실패했습니다.', 'error');
        console.error(err);
    }
}

function openEditBudget(id) {
    const record = budgetRecords.find(row => Number(row.id) === Number(id));
    if (!record) return;

    document.getElementById('budget-modal-title').textContent = '예산 항목 수정';
    document.getElementById('budget-modal-id').value = record.id;
    document.getElementById('budget-modal-event').value = record.event_id || '';
    document.getElementById('budget-modal-type').value = record.type;
    document.getElementById('budget-modal-category').value = record.category;
    document.getElementById('budget-modal-description').value = record.description;
    document.getElementById('budget-modal-details').value = record.details || '';
    document.getElementById('budget-modal-amount').value = record.amount;
    openModal('budget-modal');
}
window.openEditBudget = openEditBudget;

async function deleteBudget(id) {
    if (!confirm('이 예산 항목을 삭제하시겠습니까?')) return;
    try {
        const response = await fetch(`${API_BASE}/budgets?id=${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Delete failed');
        showToast('예산 항목이 삭제되었습니다.', 'success');
        await fetchBudgets();
    } catch (err) {
        showToast('예산 항목 삭제에 실패했습니다.', 'error');
        console.error(err);
    }
}
window.deleteBudget = deleteBudget;

// 5. External Receipt submission (Form View)
async function handleReceiptSubmit(e) {
    const submitter = document.getElementById('form-submitter').value;
    const event_id = document.getElementById('form-event-id').value;
    const category = document.getElementById('form-category').value;
    const amount = document.getElementById('form-amount').value;
    const description = document.getElementById('form-description').value;
    const basis = document.getElementById('form-basis').value;
    
    if (!selectedFile) {
        showToast('증빙 영수증 파일을 꼭 첨부해야 합니다.', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('form-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 전송 중...`;

    try {
        // 1. File upload first
        const formData = new FormData();
        formData.append('receipt', selectedFile);
        
        const uploadRes = await fetch(`${API_BASE}/expenditures/upload`, {
            method: 'POST',
            body: formData
        });
        if (!uploadRes.ok) throw new Error('영수증 업로드에 실패했습니다.');
        
        const uploadData = await uploadRes.json();
        const receipt_path = uploadData.receipt_path;

        // 2. Submit expenditure metadata
        const metadata = {
            category,
            event_id: event_id ? parseInt(event_id) : null,
            description,
            amount: parseInt(amount),
            basis,
            receipt_path,
            submitter,
            status: '승인 대기' // Implicitly hidden in form view, defaults to pending
        };

        const res = await fetch(`${API_BASE}/expenditures`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(metadata)
        });
        
        if (!res.ok) throw new Error('지출 정보 등록에 실패했습니다.');

        // Show Success UI
        document.getElementById('receipt-submit-form').style.display = 'none';
        document.getElementById('form-success-view').style.display = 'flex';
        
        showToast('영수증 제출이 완료되었습니다!', 'success');
        
        // Reload dashboard/admin data in background
        fetchAllData();
    } catch (err) {
        showToast(err.message || '제출 중 에러가 발생했습니다.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> 영수증 제출하기`;
    }
}

function resetReceiptForm() {
    document.getElementById('receipt-submit-form').reset();
    document.getElementById('receipt-submit-form').style.display = 'block';
    document.getElementById('form-success-view').style.display = 'none';
    
    document.getElementById('file-preview').style.display = 'none';
    document.getElementById('file-preview-img').src = '';
    
    selectedFile = null;
    
    const submitBtn = document.getElementById('form-submit-btn');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> 영수증 제출하기`;
}

// 5. School report exports

function getExportTransactions(openingBalance = 0) {
    const income = incomeRecords.map((row, index) => ({
        type: 'income',
        date: row.transaction_date || row.date || '',
        description: row.description || row.event_name || '',
        remarks: row.remarks || row.basis || '',
        counterparty: row.payer_name || row.submitter || '',
        amount: Number(row.amount || 0),
        order: Number(row.id || index)
    }));

    const expenditures = expenditureRecords.map((row, index) => ({
        type: 'expenditure',
        date: row.transaction_date || row.date || '',
        description: row.description || row.event_name || '',
        remarks: row.basis || '',
        counterparty: row.withdrawer_name || row.submitter || '',
        amount: Number(row.amount || 0),
        order: Number(row.id || index)
    }));

    const transactions = [...income, ...expenditures].sort((a, b) => {
        if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return a.order - b.order;
    });

    let balance = Number(openingBalance || 0);
    return transactions.map(row => {
        balance += row.type === 'income' ? row.amount : -row.amount;
        return { ...row, balance };
    });
}

function exportTransactionLedger() {
    if (incomeRecords.length === 0 && expenditureRecords.length === 0) {
        showToast('출력할 회계 내역이 없습니다.', 'error');
        return;
    }

    try {
        const openingBalance = Number(document.getElementById('export-opening-balance').value || 0);
        const transactions = getExportTransactions(openingBalance);
        const rows = [
            ['날짜', '내용', '비고', '입금자명', '입금액(원)', '출금자명', '출금액(원)', '잔액(원)']
        ];

        if (openingBalance !== 0) {
            rows.push(['', '기초 잔액(이월금)', '', '', '', '', '', openingBalance]);
        }

        transactions.forEach(row => {
            rows.push([
                row.date,
                row.description,
                row.remarks,
                row.type === 'income' ? row.counterparty : '',
                row.type === 'income' ? row.amount : '',
                row.type === 'expenditure' ? row.counterparty : '',
                row.type === 'expenditure' ? row.amount : '',
                row.balance
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 13 }, { wch: 32 }, { wch: 24 }, { wch: 16 },
            { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 17 }
        ];
        ws['!autofilter'] = { ref: `A1:H${rows.length}` };
        ws['!freeze'] = { xSplit: 0, ySplit: 1 };
        for (let r = 2; r <= rows.length; r += 1) {
            ['E', 'G', 'H'].forEach(col => {
                const cell = ws[`${col}${r}`];
                if (cell && typeof cell.v === 'number') cell.z = '#,##0"원";[Red]-#,##0"원"';
            });
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '거래내역 장부');
        const dateStr = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `YMC_거래내역장부_${dateStr}.xlsx`);
        showToast('거래내역 장부가 다운로드되었습니다.', 'success');
    } catch (err) {
        console.error(err);
        showToast('거래내역 장부 생성에 실패했습니다.', 'error');
    }
}

function groupReportRows(records) {
    return records.reduce((groups, row) => {
        const category = row.category || '기타';
        if (!groups[category]) groups[category] = [];
        groups[category].push(row);
        return groups;
    }, {});
}

function reportTableHtml(title, records) {
    const groups = groupReportRows(records);
    let total = 0;
    let body = '';

    Object.entries(groups).forEach(([category, rows]) => {
        let subtotal = 0;
        rows.forEach((row, index) => {
            const amount = Number(row.amount || 0);
            subtotal += amount;
            total += amount;
            body += `<tr>
                ${index === 0 ? `<td rowspan="${rows.length + 1}">${escapeHTML(category)}</td>` : ''}
                <td>${escapeHTML(row.description || '')}</td>
                <td class="money">${formatCurrency(amount)}</td>
                <td>${escapeHTML(row.basis || '')}</td>
                <td>${escapeHTML(row.remarks || (row.status ? `${row.submitter || ''} / ${row.status}` : ''))}</td>
            </tr>`;
        });
        body += `<tr class="subtotal"><td>부분계</td><td class="money">${formatCurrency(subtotal)}</td><td></td><td></td></tr>`;
    });

    if (records.length === 0) {
        body = '<tr><td colspan="5" class="empty">내역 없음</td></tr>';
    }

    return `<h2>&lt;${title}&gt;</h2>
        <table>
            <thead><tr><th>분류</th><th>내역</th><th>금액</th><th>산출근거</th><th>비고</th></tr></thead>
            <tbody>${body}
                <tr class="total"><td colspan="2">총계</td><td class="money">${formatCurrency(total)}</td><td></td><td></td></tr>
            </tbody>
        </table>`;
}

function exportSettlementReport() {
    if (incomeRecords.length === 0 && expenditureRecords.length === 0) {
        showToast('출력할 회계 내역이 없습니다.', 'error');
        return;
    }

    try {
        const totalIncome = incomeRecords.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const totalExpenditure = expenditureRecords.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const balance = totalIncome - totalExpenditure;
        const reportDate = new Date().toLocaleDateString('ko-KR');

        const documentHtml = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8"><title>YMC 결산 보고서</title>
<style>
@page { size: A4; margin: 18mm; }
body { font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color:#111; font-size:10.5pt; }
h1 { text-align:center; font-size:20pt; margin:0 0 8px; }
.meta { text-align:right; margin-bottom:20px; color:#444; }
.summary { margin:0 0 22px; padding:12px; border:1px solid #777; }
h2 { font-size:13pt; margin:22px 0 7px; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
th, td { border:1px solid #555; padding:6px 7px; vertical-align:middle; word-break:keep-all; }
th { background:#e7e7e7; text-align:center; }
th:nth-child(1) { width:14%; } th:nth-child(2) { width:25%; } th:nth-child(3) { width:15%; }
th:nth-child(4) { width:27%; } th:nth-child(5) { width:19%; }
.money { text-align:right; white-space:nowrap; }
.subtotal { font-weight:bold; background:#f3f3f3; }
.total { font-weight:bold; background:#d9d9d9; }
.empty { text-align:center; color:#666; padding:18px; }
</style></head><body>
<h1>YMC 동아리 활동 결산 보고서</h1>
<div class="meta">출력일자: ${reportDate}</div>
<div class="summary"><strong>수입 총계</strong> ${formatCurrency(totalIncome)}
&nbsp;&nbsp; / &nbsp;&nbsp;<strong>지출 총계</strong> ${formatCurrency(totalExpenditure)}
&nbsp;&nbsp; / &nbsp;&nbsp;<strong>잔액</strong> ${formatCurrency(balance)}</div>
${reportTableHtml('수입', incomeRecords)}
${reportTableHtml('지출', expenditureRecords)}
</body></html>`;

        const blob = new Blob(['\ufeff', documentHtml], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `YMC_결산보고서_${dateStr}.doc`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('학교 제출용 결산 보고서가 다운로드되었습니다.', 'success');
    } catch (err) {
        console.error(err);
        showToast('결산 보고서 생성에 실패했습니다.', 'error');
    }
}

// Helpers
function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeQuote(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ══════════════════════════════════════════════════════════════════════════
// ── DUES MANAGEMENT CORE FUNCTIONS ──
// ══════════════════════════════════════════════════════════════════════════

// Fetch All Fee Items
async function fetchFeeItems(preferredId = null) {
    try {
        const response = await fetch(`${API_BASE}/dues/items`);
        if (!response.ok) throw new Error('회비 항목 조회 실패');
        feeItems = await response.json();

        renderFeeItemTabs();

        if (feeItems.length > 0) {
            let targetId = preferredId;
            if (!targetId || !feeItems.find(f => f.id === targetId)) {
                targetId = (selectedFeeItemId && feeItems.find(f => f.id === selectedFeeItemId)) 
                    ? selectedFeeItemId 
                    : feeItems[0].id;
            }
            await selectFeeItem(targetId);
        } else {
            selectedFeeItemId = null;
            currentDuesPayments = [];
            renderDuesPaymentsTable();
            updateDuesSummaryCards(null, []);
        }
    } catch (err) {
        console.error('Fetch fee items error:', err);
    }
}

// Render Fee Item Tabs Bar
function renderFeeItemTabs() {
    const tabsContainer = document.getElementById('dues-items-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';

    if (feeItems.length === 0) {
        tabsContainer.innerHTML = '<span style="font-size: 0.85rem; color: var(--text-muted); padding: 6px 0;">등록된 회비 항목이 없습니다.</span>';
        return;
    }

    feeItems.forEach(item => {
        const btn = document.createElement('button');
        btn.className = `dues-tab-btn ${item.id === selectedFeeItemId ? 'active' : ''}`;
        btn.type = 'button';

        const isRegular = item.type === '정기 회비';
        const badgeClass = isRegular ? 'tab-badge' : 'tab-badge badge-event';
        const badgeText = isRegular ? '정기' : '행사';

        btn.innerHTML = `
            <span>${escapeHTML(item.title)}</span>
            <span class="${badgeClass}">${badgeText}</span>
        `;

        btn.addEventListener('click', () => {
            selectFeeItem(item.id);
        });

        tabsContainer.appendChild(btn);
    });
}

// Select a Specific Fee Item and load its payments
async function selectFeeItem(id) {
    selectedFeeItemId = id;

    // Update active class on tabs
    const tabs = document.querySelectorAll('.dues-tab-btn');
    feeItems.forEach((item, index) => {
        if (tabs[index]) {
            if (item.id === id) {
                tabs[index].classList.add('active');
            } else {
                tabs[index].classList.remove('active');
            }
        }
    });

    const currentItem = feeItems.find(f => f.id === id);
    if (!currentItem) return;

    // Update Selected Fee Item Info Banner
    const titleEl = document.getElementById('dues-selected-title');
    const typeEl = document.getElementById('dues-selected-type');
    const eventEl = document.getElementById('dues-selected-event');
    const targetAmountEl = document.getElementById('dues-selected-target-amount');
    const dueDateEl = document.getElementById('dues-selected-due-date');
    const descEl = document.getElementById('dues-selected-description');

    if (titleEl) titleEl.textContent = currentItem.title;
    if (typeEl) {
        typeEl.textContent = currentItem.type;
        typeEl.className = currentItem.type === '정기 회비' ? 'badge' : 'badge badge-event';
    }
    if (eventEl) {
        if (currentItem.event_name) {
            eventEl.style.display = 'inline-flex';
            eventEl.textContent = `연계 행사: ${currentItem.event_name}`;
        } else {
            eventEl.style.display = 'none';
        }
    }
    if (targetAmountEl) targetAmountEl.textContent = formatCurrency(currentItem.target_amount);
    if (dueDateEl) dueDateEl.textContent = currentItem.due_date || '기한 없음';
    if (descEl) descEl.textContent = currentItem.description || '(안내 및 비고 사항 없음)';

    // Fetch Payments for this item
    try {
        const response = await fetch(`${API_BASE}/dues/payments?fee_item_id=${id}`);
        if (!response.ok) throw new Error('납부 내역 조회 실패');
        currentDuesPayments = await response.json();

        updateDuesSummaryCards(currentItem, currentDuesPayments);
        renderDuesPaymentsTable();
    } catch (err) {
        console.error('Fetch dues payments error:', err);
        showToast('회비 납부 내역을 불러오지 못했습니다.', 'error');
    }
}

// Update Summary Stats Cards and Progress Bar
function updateDuesSummaryCards(item, payments) {
    const totalEl = document.getElementById('dues-stat-total-members');
    const paidEl = document.getElementById('dues-stat-paid-members');
    const paidRateEl = document.getElementById('dues-stat-paid-rate');
    const unpaidEl = document.getElementById('dues-stat-unpaid-members');
    const paidAmountEl = document.getElementById('dues-stat-paid-amount');
    const targetAmountEl = document.getElementById('dues-stat-target-amount');
    const progressPercentEl = document.getElementById('dues-progress-percent');
    const progressBarEl = document.getElementById('dues-progress-bar');

    if (!item) {
        if (totalEl) totalEl.textContent = '0명';
        if (paidEl) paidEl.textContent = '0명';
        if (unpaidEl) unpaidEl.textContent = '0명';
        if (paidAmountEl) paidAmountEl.textContent = '0원';
        if (progressBarEl) progressBarEl.style.width = '0%';
        return;
    }

    const totalMembers = payments.length;
    const paidMembers = payments.filter(p => p.status === '납부 완료').length;
    const unpaidMembers = payments.filter(p => p.status === '미납').length;
    const totalPaidAmount = payments.reduce((acc, cur) => acc + (Number(cur.paid_amount) || 0), 0);
    const targetTotalAmount = totalMembers * (Number(item.target_amount) || 0);
    const rate = totalMembers > 0 ? Math.round((paidMembers / totalMembers) * 100) : 0;

    if (totalEl) totalEl.textContent = `${totalMembers}명`;
    if (paidEl) paidEl.textContent = `${paidMembers}명`;
    if (paidRateEl) paidRateEl.innerHTML = `<i class="fa-solid fa-chart-pie"></i> 달성률 ${rate}%`;
    if (unpaidEl) unpaidEl.textContent = `${unpaidMembers}명`;
    if (paidAmountEl) paidAmountEl.textContent = formatCurrency(totalPaidAmount);
    if (targetAmountEl) targetAmountEl.textContent = `목표: ${formatCurrency(targetTotalAmount)}`;
    if (progressPercentEl) progressPercentEl.textContent = `${rate}%`;
    if (progressBarEl) progressBarEl.style.width = `${rate}%`;
}

// Render Members Dues Table with Instant 1-Click Toggle Status
function renderDuesPaymentsTable() {
    const tbody = document.getElementById('dues-table-body');
    if (!tbody) return;

    const searchInput = document.getElementById('dues-member-search');
    const statusSelect = document.getElementById('dues-status-filter');

    const searchVal = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const statusVal = statusSelect ? statusSelect.value : '';

    tbody.innerHTML = '';

    if (!currentDuesPayments || currentDuesPayments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-user-slash" style="font-size: 2rem; margin-bottom: 8px; opacity: 0.5;"></i>
                    <p>현재 등록된 부원이 없습니다. <br><strong>[+ 부원 추가]</strong> 또는 <strong>[명단 일괄 등록]</strong> 버튼으로 대상자를 등록해보세요.</p>
                </td>
            </tr>
        `;
        return;
    }

    const filtered = currentDuesPayments.filter(p => {
        const matchesSearch = !searchVal || 
            (p.member_name && p.member_name.toLowerCase().includes(searchVal)) ||
            (p.student_id && p.student_id.toLowerCase().includes(searchVal)) ||
            (p.memo && p.memo.toLowerCase().includes(searchVal));
        const matchesStatus = !statusVal || p.status === statusVal;
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">
                    검색 조건과 일치하는 부원이 없습니다.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((p, idx) => {
        const tr = document.createElement('tr');

        // Determine status toggle styling
        let statusClass = 'status-unpaid';
        let statusIcon = 'fa-circle-xmark';
        if (p.status === '납부 완료') {
            statusClass = 'status-paid';
            statusIcon = 'fa-circle-check';
        } else if (p.status === '면제') {
            statusClass = 'status-exempt';
            statusIcon = 'fa-circle-minus';
        }

        tr.innerHTML = `
            <td style="color: var(--text-muted); font-size: 0.85rem;">${idx + 1}</td>
            <td style="font-weight: 600; color: var(--primary);">${escapeHTML(p.member_name)}</td>
            <td style="color: var(--text-secondary); font-size: 0.88rem;">${escapeHTML(p.student_id || '-')}</td>
            <td style="color: var(--text-secondary);">${formatCurrency(p.item_target_amount || 0)}</td>
            <td style="font-weight: 600; color: ${p.status === '납부 완료' ? 'var(--success)' : 'var(--text-primary)'};">
                ${formatCurrency(p.paid_amount || 0)}
            </td>
            <td style="font-size: 0.85rem; color: var(--text-secondary);">${p.paid_date || '-'}</td>
            <td style="text-align: center;">
                <button type="button" class="dues-status-toggle ${statusClass}" 
                        onclick="toggleDuesPaymentStatus(${p.id})"
                        title="클릭 시 납부 완료/미납 상태가 바로 변경됩니다">
                    <i class="fa-solid ${statusIcon}"></i>
                    <span>${p.status}</span>
                </button>
            </td>
            <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHTML(p.memo || '-')}
            </td>
            <td style="text-align: center;">
                <div style="display: inline-flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm" onclick="openEditDuesMemberModal(${p.id})" title="수정" style="padding: 4px 8px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteDuesMember(${p.id})" title="삭제" style="padding: 4px 8px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

// 1-Click Instant Toggle Status
async function toggleDuesPaymentStatus(paymentId) {
    try {
        const response = await fetch(`${API_BASE}/dues/payments/toggle`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: paymentId })
        });

        if (!response.ok) throw new Error('상태 변경 실패');
        const result = await response.json();

        const statusMsg = result.new_status === '납부 완료' ? '✅ 납부 완료' : '⏳ 미납';
        showToast(`납부 상태가 [${statusMsg}]로 변경되었습니다.`, 'success');

        // Refresh payments for current item
        if (selectedFeeItemId) {
            await selectFeeItem(selectedFeeItemId);
        }
    } catch (err) {
        console.error('Toggle status error:', err);
        showToast('납부 상태 변경 중 오류가 발생했습니다.', 'error');
    }
}

// Modal Trigger: Add New Fee Item
function openAddFeeItemModal() {
    document.getElementById('dues-item-modal-title').textContent = '새 회비 항목 개설';
    document.getElementById('dues-item-modal-id').value = '';
    document.getElementById('dues-item-form').reset();

    // Default due date: 1 month later
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    document.getElementById('dues-item-modal-due-date').value = nextMonth.toISOString().slice(0, 10);
    document.getElementById('dues-item-modal-amount').value = 20000;

    openModal('dues-item-modal');
}

// Modal Trigger: Edit Current Fee Item
function openEditFeeItemModal() {
    if (!selectedFeeItemId) {
        showToast('수정할 회비 항목이 없습니다.', 'warning');
        return;
    }
    const item = feeItems.find(f => f.id === selectedFeeItemId);
    if (!item) return;

    document.getElementById('dues-item-modal-title').textContent = '회비 항목 정보 수정';
    document.getElementById('dues-item-modal-id').value = item.id;
    document.getElementById('dues-item-modal-title-input').value = item.title || '';
    document.getElementById('dues-item-modal-type').value = item.type || '정기 회비';
    document.getElementById('dues-item-modal-event').value = item.event_id || '';
    document.getElementById('dues-item-modal-amount').value = item.target_amount || 0;
    document.getElementById('dues-item-modal-due-date').value = item.due_date || '';
    document.getElementById('dues-item-modal-description').value = item.description || '';

    openModal('dues-item-modal');
}

// Handle Fee Item Submit (Add / Edit)
async function handleFeeItemSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('dues-item-modal-id').value;
    const title = document.getElementById('dues-item-modal-title-input').value.trim();
    const type = document.getElementById('dues-item-modal-type').value;
    const event_id = document.getElementById('dues-item-modal-event').value || null;
    const target_amount = Number(document.getElementById('dues-item-modal-amount').value) || 0;
    const due_date = document.getElementById('dues-item-modal-due-date').value || null;
    const description = document.getElementById('dues-item-modal-description').value.trim();

    if (!title) {
        showToast('회비 명칭을 입력해주세요.', 'warning');
        return;
    }

    const payload = { title, type, event_id, target_amount, due_date, description };
    const method = id ? 'PUT' : 'POST';
    if (id) payload.id = Number(id);

    try {
        const response = await fetch(`${API_BASE}/dues/items`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('회비 항목 저장 실패');
        const resData = await response.json();

        closeModal('dues-item-modal');
        showToast(id ? '회비 항목 정보가 수정되었습니다.' : '새 회비 항목이 개설되었습니다.', 'success');

        const nextSelectedId = id ? Number(id) : resData.id;
        await fetchFeeItems(nextSelectedId);
    } catch (err) {
        console.error('Fee item save error:', err);
        showToast('회비 항목 저장에 실패했습니다.', 'error');
    }
}

// Delete Current Fee Item
async function deleteCurrentFeeItem() {
    if (!selectedFeeItemId) return;
    const item = feeItems.find(f => f.id === selectedFeeItemId);
    if (!item) return;

    if (!confirm(`'${item.title}' 회비 항목과 부원 납부 기록을 정말 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/dues/items?id=${selectedFeeItemId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('회비 항목 삭제 실패');

        showToast(`'${item.title}' 회비 항목이 삭제되었습니다.`, 'success');
        selectedFeeItemId = null;
        await fetchFeeItems();
    } catch (err) {
        console.error('Delete fee item error:', err);
        showToast('회비 항목 삭제에 실패했습니다.', 'error');
    }
}

// Modal Trigger: Add Dues Member
function openAddDuesMemberModal() {
    if (!selectedFeeItemId) {
        showToast('먼저 회비 항목을 개설하거나 선택해주세요.', 'warning');
        return;
    }
    const currentItem = feeItems.find(f => f.id === selectedFeeItemId);
    const targetAmt = currentItem ? currentItem.target_amount : 20000;

    document.getElementById('dues-member-modal-title').textContent = '부원 회비 추가';
    document.getElementById('dues-member-modal-id').value = '';
    document.getElementById('dues-member-form').reset();

    document.getElementById('dues-member-modal-status').value = '미납';
    document.getElementById('dues-member-modal-amount').value = 0;
    document.getElementById('dues-member-modal-date').value = '';

    // If status changes to paid, auto fill amount and date
    const statusSelect = document.getElementById('dues-member-modal-status');
    statusSelect.onchange = () => {
        if (statusSelect.value === '납부 완료') {
            document.getElementById('dues-member-modal-amount').value = targetAmt;
            document.getElementById('dues-member-modal-date').value = new Date().toISOString().slice(0, 10);
        } else if (statusSelect.value === '미납') {
            document.getElementById('dues-member-modal-amount').value = 0;
            document.getElementById('dues-member-modal-date').value = '';
        }
    };

    openModal('dues-member-modal');
}

// Modal Trigger: Edit Dues Member
function openEditDuesMemberModal(paymentId) {
    const payment = currentDuesPayments.find(p => p.id === paymentId);
    if (!payment) return;

    document.getElementById('dues-member-modal-title').textContent = '부원 회비 정보 수정';
    document.getElementById('dues-member-modal-id').value = payment.id;
    document.getElementById('dues-member-modal-name').value = payment.member_name || '';
    document.getElementById('dues-member-modal-student-id').value = payment.student_id || '';
    document.getElementById('dues-member-modal-status').value = payment.status || '미납';
    document.getElementById('dues-member-modal-amount').value = payment.paid_amount || 0;
    document.getElementById('dues-member-modal-date').value = payment.paid_date || '';
    document.getElementById('dues-member-modal-memo').value = payment.memo || '';

    const statusSelect = document.getElementById('dues-member-modal-status');
    const currentItem = feeItems.find(f => f.id === selectedFeeItemId);
    const targetAmt = currentItem ? currentItem.target_amount : 20000;

    statusSelect.onchange = () => {
        if (statusSelect.value === '납부 완료' && Number(document.getElementById('dues-member-modal-amount').value) === 0) {
            document.getElementById('dues-member-modal-amount').value = targetAmt;
            document.getElementById('dues-member-modal-date').value = new Date().toISOString().slice(0, 10);
        }
    };

    openModal('dues-member-modal');
}

// Handle Dues Member Submit
async function handleDuesMemberSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('dues-member-modal-id').value;
    const member_name = document.getElementById('dues-member-modal-name').value.trim();
    const student_id = document.getElementById('dues-member-modal-student-id').value.trim();
    const status = document.getElementById('dues-member-modal-status').value;
    const paid_amount = Number(document.getElementById('dues-member-modal-amount').value) || 0;
    const paid_date = document.getElementById('dues-member-modal-date').value || null;
    const memo = document.getElementById('dues-member-modal-memo').value.trim();

    if (!member_name) {
        showToast('부원 성명을 입력해주세요.', 'warning');
        return;
    }

    const payload = {
        fee_item_id: selectedFeeItemId,
        member_name,
        student_id,
        status,
        paid_amount,
        paid_date,
        memo
    };

    const method = id ? 'PUT' : 'POST';
    if (id) payload.id = Number(id);

    try {
        const response = await fetch(`${API_BASE}/dues/payments`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('부원 정보 저장 실패');

        closeModal('dues-member-modal');
        showToast(id ? '부원 회비 정보가 수정되었습니다.' : '새 부원이 등록되었습니다.', 'success');

        await selectFeeItem(selectedFeeItemId);
    } catch (err) {
        console.error('Save dues member error:', err);
        showToast('부원 회비 정보 저장에 실패했습니다.', 'error');
    }
}

// Delete Dues Member
async function deleteDuesMember(paymentId) {
    const payment = currentDuesPayments.find(p => p.id === paymentId);
    const name = payment ? payment.member_name : '해당 부원';

    if (!confirm(`'${name}' 님의 회비 명단 기록을 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/dues/payments?id=${paymentId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('삭제 실패');

        showToast(`'${name}' 님의 명단이 삭제되었습니다.`, 'success');
        await selectFeeItem(selectedFeeItemId);
    } catch (err) {
        console.error('Delete dues member error:', err);
        showToast('부원 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// Modal Trigger: Batch Add Members (Paste names)
function openBatchAddMembersModal() {
    if (!selectedFeeItemId) {
        showToast('먼저 회비 항목을 개설하거나 선택해주세요.', 'warning');
        return;
    }
    document.getElementById('dues-batch-names').value = '';
    openModal('dues-batch-modal');
}

// Handle Batch Add Submit
async function handleBatchAddSubmit(e) {
    e.preventDefault();
    const rawNames = document.getElementById('dues-batch-names').value;
    if (!rawNames.trim()) {
        showToast('부원 이름을 하나 이상 입력해주세요.', 'warning');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/dues/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fee_item_id: selectedFeeItemId,
                names: rawNames
            })
        });

        if (!response.ok) throw new Error('일괄 등록 실패');
        const res = await response.json();

        closeModal('dues-batch-modal');
        showToast(`총 ${res.added_count}명의 부원이 성공적으로 일괄 등록되었습니다! 🎉`, 'success');

        await selectFeeItem(selectedFeeItemId);
    } catch (err) {
        console.error('Batch add error:', err);
        showToast('부원 일괄 등록 중 오류가 발생했습니다.', 'error');
    }
}

// Modal Trigger: Copy Members from other fee item
function openCopyMembersModal() {
    if (!selectedFeeItemId) {
        showToast('먼저 회비 항목을 개설하거나 선택해주세요.', 'warning');
        return;
    }

    const selectEl = document.getElementById('dues-copy-source-select');
    selectEl.innerHTML = '';

    const otherItems = feeItems.filter(f => f.id !== selectedFeeItemId);
    if (otherItems.length === 0) {
        showToast('명단을 불러올 다른 회비 항목이 없습니다.', 'info');
        return;
    }

    otherItems.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = `${item.title} (${item.type} / 등록부원: ${item.total_members || 0}명)`;
        selectEl.appendChild(opt);
    });

    openModal('dues-copy-modal');
}

// Handle Copy Members Submit
async function handleCopyMembersSubmit(e) {
    e.preventDefault();
    const sourceId = document.getElementById('dues-copy-source-select').value;
    if (!sourceId) return;

    try {
        const response = await fetch(`${API_BASE}/dues/copy-members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_item_id: Number(sourceId),
                target_item_id: selectedFeeItemId
            })
        });

        if (!response.ok) throw new Error('명단 복사 실패');
        const res = await response.json();

        closeModal('dues-copy-modal');
        if (res.copied_count > 0) {
            showToast(`${res.copied_count}명의 부원 명단을 성공적으로 불러왔습니다!`, 'success');
        } else {
            showToast('이미 모든 부원이 등록되어 있어 새로 추가된 부원이 없습니다.', 'info');
        }

        await selectFeeItem(selectedFeeItemId);
    } catch (err) {
        console.error('Copy members error:', err);
        showToast('명단 불러오기에 실패했습니다.', 'error');
    }
}

// Copy Unpaid Members text for Group KakaoTalk Announcement
function copyUnpaidMembersText() {
    if (!selectedFeeItemId) return;
    const currentItem = feeItems.find(f => f.id === selectedFeeItemId);
    if (!currentItem) return;

    const unpaidList = currentDuesPayments.filter(p => p.status === '미납');

    if (unpaidList.length === 0) {
        showToast('🎉 모든 부원이 납부를 완료하여 미납자가 없습니다!', 'success');
        return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const unpaidNamesFormatted = unpaidList.map((p, idx) => {
        const sub = p.student_id ? ` (${p.student_id})` : '';
        return `${idx + 1}. ${p.member_name}${sub}`;
    }).join('\n');

    const noticeText = 
`📢 [YMC 동아리 회비 납부 현황 공지]

📌 항목: ${currentItem.title}
💰 회비: ${formatCurrency(currentItem.target_amount)}
⏳ 마감일: ${currentItem.due_date || '미정'}
📝 계좌 안내: ${currentItem.description || '회계 담당자에게 문의'}

----------------------------------------
⚠️ 현재 미납 부원 명단 (총 ${unpaidList.length}명)
----------------------------------------
${unpaidNamesFormatted}

원활한 동아리 행사 진행 및 운영을 위해 빠른 납부 부탁드립니다! 🙏
(기준일시: ${todayStr})`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(noticeText).then(() => {
            showToast('📋 단체 톡방 공지용 미납자 명단이 클립보드에 복사되었습니다!', 'success');
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
            fallbackCopyText(noticeText);
        });
    } else {
        fallbackCopyText(noticeText);
    }
}

function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('📋 단체 톡방 공지용 미납자 명단이 클립보드에 복사되었습니다!', 'success');
}

// 1-Click Sync Collected Dues to Income Ledger
async function syncDuesToIncome() {
    if (!selectedFeeItemId) return;
    const currentItem = feeItems.find(f => f.id === selectedFeeItemId);
    if (!currentItem) return;

    const paidList = currentDuesPayments.filter(p => p.status === '납부 완료');
    const totalPaid = paidList.reduce((acc, cur) => acc + (Number(cur.paid_amount) || 0), 0);

    if (totalPaid <= 0) {
        showToast('납부 완료된 금액이 없어 수입 장부에 반영할 내역이 없습니다.', 'warning');
        return;
    }

    const confirmMsg = 
`[${currentItem.title}]에서 현재까지 납부 완료된 금액
총 ${formatCurrency(totalPaid)} (${paidList.length}명)을
수입 관리 장부에 '회비' 분류로 등록하시겠습니까?`;

    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch(`${API_BASE}/dues/sync-to-income`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fee_item_id: selectedFeeItemId })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || '수입 장부 연동 실패');
        }

        showToast(`총 ${formatCurrency(totalPaid)}이 수입 장부에 성공적으로 반영되었습니다! 💰`, 'success');

        // Refresh income and dashboard stats
        await Promise.all([
            fetchIncome(),
            fetchDashboardStats()
        ]);
    } catch (err) {
        console.error('Sync dues to income error:', err);
        showToast(err.message || '수입 장부 반영 중 오류가 발생했습니다.', 'error');
    }
}
