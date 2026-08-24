// YMC Accounting Management System JS

// Global State
let events = [];
let incomeRecords = [];
let expenditureRecords = [];
let budgetRecords = [];
let comparisonRecords = [];
let dashboardStats = null;
let summaryChart = null;

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
    return '₩' + Number(amount || 0).toLocaleString('ko-KR');
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
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
        await Promise.all([
            fetchEvents(),
            fetchIncome(),
            fetchExpenditures(),
            fetchDashboardStats()
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">조회할 수입 내역이 없습니다.</td></tr>`;
        return;
    }
    
    filtered.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 40px;">조회할 지출 내역이 없습니다.</td></tr>`;
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
        openModal('income-modal');
    });

    document.getElementById('add-expenditure-btn').addEventListener('click', () => {
        document.getElementById('expenditure-modal-title').textContent = '지출 내역 등록';
        document.getElementById('expenditure-modal-id').value = '';
        document.getElementById('expenditure-modal-receipt-path').value = '';
        document.getElementById('expenditure-form').reset();
        document.getElementById('admin-file-preview').style.display = 'none';
        openModal('expenditure-modal');
    });

    // Excel Export Trigger
    document.getElementById('export-excel-btn').addEventListener('click', exportToExcel);

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
    const event_id = document.getElementById('income-modal-event').value;
    const category = document.getElementById('income-modal-category').value;
    const description = document.getElementById('income-modal-description').value;
    const amount = document.getElementById('income-modal-amount').value;
    const basis = document.getElementById('income-modal-basis').value;
    const remarks = document.getElementById('income-modal-remarks').value;
    
    const url = `${API_BASE}/income`;
    const method = id ? 'PUT' : 'POST';
    const body = {
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

// 4. External Receipt submission (Form View)
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

// 5. Excel Report Generation using SheetJS
function exportToExcel() {
    if (events.length === 0) {
        showToast('출력할 회계 내역이 없습니다.', 'error');
        return;
    }

    try {
        const wb = XLSX.utils.book_new();

        // --- SHEET 1: 총괄표 (Summary) ---
        const summaryRows = [
            ["YMC 대학동아리 행사별 예산 및 결산 총괄표"],
            [`출력일자: ${new Date().toLocaleDateString('ko-KR')}`],
            [],
            ["행사명", "진행 월", "예산 (수입 합계)", "결산 (지출 집행액)", "잔액 (수입 - 지출)", "집행률 (%)"]
        ];

        let totalIncome = 0;
        let totalExpenditure = 0;

        // Calculate event wise sum
        const eventWiseData = events.map(event => {
            const incSum = incomeRecords
                .filter(r => r.event_id === event.id)
                .reduce((sum, r) => sum + r.amount, 0);
            
            const expSum = expenditureRecords
                .filter(r => r.event_id === event.id)
                .reduce((sum, r) => sum + r.amount, 0);
                
            totalIncome += incSum;
            totalExpenditure += expSum;

            const bal = incSum - expSum;
            const executionRate = incSum > 0 ? Math.round((expSum / incSum) * 100) : (expSum > 0 ? 100 : 0);

            return [
                event.name,
                event.month || "미지정",
                incSum,
                expSum,
                bal,
                `${executionRate}%`
            ];
        });

        // Push event rows
        summaryRows.push(...eventWiseData);
        
        // Push Grand Total Row
        const grandTotalBal = totalIncome - totalExpenditure;
        const grandRate = totalIncome > 0 ? Math.round((totalExpenditure / totalIncome) * 100) : (totalExpenditure > 0 ? 100 : 0);
        summaryRows.push([
            "총계 (Grand Total)",
            "",
            totalIncome,
            totalExpenditure,
            grandTotalBal,
            `${grandRate}%`
        ]);

        const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
        XLSX.utils.book_append_sheet(wb, ws1, "행사별 총괄표");

        // --- SHEET 2: 수입 명세 (Income Details) ---
        const incomeRows = [
            ["YMC 동아리 수입 상세 내역서 (학교 제출용)"],
            [`출력일자: ${new Date().toLocaleDateString('ko-KR')}`],
            [],
            ["연관 행사명", "분류", "수입 내역", "금액 (₩)", "산출 근거", "비고"]
        ];

        incomeRecords.forEach(r => {
            incomeRows.push([
                r.event_name || "미지정",
                r.category,
                r.description,
                r.amount,
                r.basis || "",
                r.remarks || ""
            ]);
        });

        // Add total row at bottom
        incomeRows.push([
            "수입 총합계",
            "",
            "",
            totalIncome,
            "",
            ""
        ]);

        const ws2 = XLSX.utils.aoa_to_sheet(incomeRows);
        XLSX.utils.book_append_sheet(wb, ws2, "수입 명세");

        // --- SHEET 3: 지출 및 영수증 명세 (Expenditure Details) ---
        const expenditureRows = [
            ["YMC 동아리 지출 및 영수증 증빙 상세 내역서 (학교 제출용)"],
            [`출력일자: ${new Date().toLocaleDateString('ko-KR')}`],
            [],
            ["연관 행사명", "분류", "지출 내역", "금액 (₩)", "산출 근거", "제출자", "증빙 영수증", "확인 상태"]
        ];

        expenditureRecords.forEach(r => {
            expenditureRows.push([
                r.event_name || "미지정",
                r.category,
                r.description,
                r.amount,
                r.basis || "",
                r.submitter,
                r.receipt_path ? "영수증 첨부완료" : "영수증 미첨부",
                r.status
            ]);
        });

        // Add total row at bottom
        expenditureRows.push([
            "지출 총합계",
            "",
            "",
            totalExpenditure,
            "",
            "",
            "",
            ""
        ]);

        const ws3 = XLSX.utils.aoa_to_sheet(expenditureRows);
        XLSX.utils.book_append_sheet(wb, ws3, "지출 명세");

        // Set column widths for better readability
        const wscols1 = [
            { wch: 25 }, // 행사명
            { wch: 10 }, // 진행 월
            { wch: 18 }, // 예산
            { wch: 18 }, // 결산
            { wch: 18 }, // 잔액
            { wch: 12 }  // 집행률
        ];
        ws1['!cols'] = wscols1;
        
        const wscols2 = [
            { wch: 25 }, // 연관 행사명
            { wch: 12 }, // 분류
            { wch: 30 }, // 수입 내역
            { wch: 18 }, // 금액
            { wch: 30 }, // 산출 근거
            { wch: 20 }  // 비고
        ];
        ws2['!cols'] = wscols2;

        const wscols3 = [
            { wch: 25 }, // 연관 행사명
            { wch: 12 }, // 분류
            { wch: 30 }, // 지출 내역
            { wch: 18 }, // 금액
            { wch: 30 }, // 산출 근거
            { wch: 12 }, // 제출자
            { wch: 15 }, // 증빙 영수증
            { wch: 12 }  // 확인 상태
        ];
        ws3['!cols'] = wscols3;

        // Generate Filename
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `YMC_회계보고서_${dateStr}.xlsx`;

        // Write and Trigger Download
        XLSX.writeFile(wb, filename);
        showToast('엑셀 보고서가 다운로드되었습니다.', 'success');

    } catch (err) {
        showToast('엑셀 변환 중 실패했습니다.', 'error');
        console.error(err);
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
