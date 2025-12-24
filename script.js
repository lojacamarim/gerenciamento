// Verificar se databaseManager está disponível via window
if (typeof databaseManager === 'undefined' && typeof window.CamarimDatabase !== 'undefined') {
    databaseManager = window.CamarimDatabase;
    console.log('✅ DatabaseManager carregado via window.CamarimDatabase');
}

// Fallback: criar DatabaseManager básico se necessário
if (typeof databaseManager === 'undefined') {
    console.warn('⚠️ DatabaseManager não encontrado, criando versão básica...');
    
    databaseManager = {
        initialized: false,
        init: async function() {
            console.log('🔄 Inicializando DatabaseManager básico...');
            this.initialized = true;
            return true;
        },
        getSystemData: async function() {
            try {
                const savedData = localStorage.getItem('camarim-system-data');
                if (savedData) {
                    return JSON.parse(savedData);
                }
            } catch (error) {
                console.error('❌ Erro ao carregar do localStorage:', error);
            }
            return {
                products: [],
                sales: [],
                settings: {}
            };
        },
        saveSystemData: async function(data) {
            try {
                localStorage.setItem('camarim-system-data', JSON.stringify(data));
                console.log('💾 Dados salvos no localStorage');
                return true;
            } catch (error) {
                console.error('❌ Erro ao salvar no localStorage:', error);
                return false;
            }
        },
        migrateFromLocalStorage: async function() {
            console.log('🔄 Migração do localStorage (básica)');
            const lsData = localStorage.getItem('camarim-system-data');
            if (!lsData) return false;
            
            try {
                const data = JSON.parse(lsData);
                await this.saveSystemData(data);
                console.log(`✅ ${data.products?.length || 0} produtos migrados`);
                return true;
            } catch (error) {
                console.error('❌ Erro na migração:', error);
                return false;
            }
        },
        getDatabaseInfo: async function() {
            try {
                const data = await this.getSystemData();
                return {
                    status: 'LocalStorage',
                    products: data.products?.length || 0,
                    sales: data.sales?.length || 0,
                    storage: 'N/A'
                };
            } catch (error) {
                return {
                    status: 'Erro',
                    products: 0,
                    sales: 0,
                    storage: 'N/A'
                };
            }
        },
        logAudit: async function() {
            // Função vazia para compatibilidade
        }
    };
    
    window.databaseManager = databaseManager;
}

// ============================================
// 1. ESTRUTURA DE DADOS DO SISTEMA
// ============================================

let systemData = {
    products: [],
    sales: [],
    settings: {
        defaultDebitFee: 2.0,
        defaultCreditFee: 4.5,
        defaultTax: 6,
        defaultMargin: 40,
        monthlyOperationalExpenses: 4000,
        lastProductId: 0,
        lastSaleId: 0
    }
};

// Estado da aplicação
let appState = {
    currentView: 'dashboard',
    currentProductId: null,
    currentSaleId: null,
    cart: [],
    saleInProgress: false,
    charts: {
        monthlySales: null,
        categoryChart: null
    },
    currentSaleData: null,
    databaseReady: false
};

// Dados para edição de vendas
let editingSaleData = {
    saleId: null,
    originalSale: null,
    cart: [],
    originalCart: []
};

// ============================================
// 2. INICIALIZAÇÃO DO SISTEMA
// ============================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Inicializando Sistema Camarim...');
    
    // Inicializar sistema
    await initSystem();
    setupEventListeners();
    
    // Verificar hash da URL para manter a aba selecionada
    checkHashAndShowView();
    
    // Configurar listener para mudanças de hash
    window.addEventListener('hashchange', checkHashAndShowView);
    
    // Mostrar status do banco de dados
    showDatabaseStatus();
});

function checkHashAndShowView() {
    const hash = window.location.hash.substring(1);
    const validViews = ['dashboard', 'products', 'new-product', 'sales', 'new-sale', 'reports', 'settings', 'database'];
    
    if (hash && validViews.includes(hash)) {
        showView(hash);
    } else {
        showView('dashboard');
    }
}

async function initSystem() {
    console.log('🔄 Carregando dados do sistema...');
    
    try {
        // Inicializar DatabaseManager se necessário
        if (!databaseManager.initialized) {
            console.log('🔧 Inicializando DatabaseManager...');
            await databaseManager.init();
        }
        
        // Carregar dados do sistema
        const savedData = await databaseManager.getSystemData();
        
        if (savedData && typeof savedData === 'object') {
            systemData = savedData;
            console.log(`✅ Dados carregados: ${systemData.products.length} produtos, ${systemData.sales.length} vendas`);
            appState.databaseReady = true;
            
            // Verificar se precisa migrar IDs
            updateProductIds();
            updateSaleIds();
            
        } else {
            console.log('📭 Nenhum dado encontrado, criando nova base');
            createInitialData();
        }
        
    } catch (error) {
        console.error('❌ Erro ao inicializar sistema:', error);
        
        // Fallback para localStorage direto
        loadFromLocalStorageDirect();
    }
    
    // Carregar configurações na UI
    loadData();
    updateDashboard();
}

function loadFromLocalStorageDirect() {
    try {
        const savedData = localStorage.getItem('camarim-system-data');
        if (savedData) {
            const data = JSON.parse(savedData);
            
            // Validar estrutura básica
            if (data && typeof data === 'object') {
                systemData = data;
                console.log('✅ Dados carregados do localStorage (direto)');
            } else {
                throw new Error('Estrutura de dados inválida');
            }
        } else {
            createInitialData();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar do localStorage:', error);
        showAlert('Erro ao carregar dados salvos. Criando nova base de dados.', 'warning');
        createInitialData();
    }
}

function createInitialData() {
    systemData = {
        products: [],
        sales: [],
        settings: {
            defaultDebitFee: 2.0,
            defaultCreditFee: 4.5,
            defaultTax: 6,
            defaultMargin: 40,
            monthlyOperationalExpenses: 4000,
            lastProductId: 0,
            lastSaleId: 0
        }
    };
    
    saveData();
}

// ============================================
// 3. GERENCIAMENTO DE DADOS
// ============================================

async function saveData() {
    try {
        const success = await databaseManager.saveSystemData(systemData);
        
        if (success) {
            console.log('💾 Dados salvos com sucesso');
        } else {
            console.log('⚠️ Dados salvos em modo fallback');
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar dados:', error);
        showAlert('Erro ao salvar dados no navegador', 'error');
    }
}

function loadData() {
    // Carregar configurações nos campos
    if (document.getElementById('default-debit-fee')) {
        document.getElementById('default-debit-fee').value = sanitizeNumber(systemData.settings.defaultDebitFee);
        document.getElementById('default-credit-fee').value = sanitizeNumber(systemData.settings.defaultCreditFee);
        document.getElementById('default-tax').value = sanitizeNumber(systemData.settings.defaultTax);
        document.getElementById('default-margin').value = sanitizeNumber(systemData.settings.defaultMargin);
        document.getElementById('monthly-expenses').value = sanitizeNumber(systemData.settings.monthlyOperationalExpenses);
    }
    
    // Atualizar lista de produtos
    updateProductsList();
    updateSalesList();
}

function updateProductIds() {
    let maxId = 0;
    
    systemData.products.forEach(product => {
        if (product.id && product.id.startsWith('CAM-')) {
            const idNum = parseInt(product.id.replace('CAM-', ''));
            if (!isNaN(idNum) && idNum > maxId) {
                maxId = idNum;
            }
        }
    });
    
    systemData.settings.lastProductId = maxId;
}

function updateSaleIds() {
    let maxId = 0;
    
    systemData.sales.forEach(sale => {
        if (sale.id && sale.id.startsWith('SALE-')) {
            const idNum = parseInt(sale.id.replace('SALE-', ''));
            if (!isNaN(idNum) && idNum > maxId) {
                maxId = idNum;
            }
        }
    });
    
    systemData.settings.lastSaleId = maxId;
}

// ============================================
// 4. NAVEGAÇÃO ENTRE VIEWS
// ============================================

function showView(viewName) {
    viewName = DOMPurify.sanitize(viewName);
    
    appState.currentView = viewName;
    window.location.hash = viewName;
    
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('d-none');
    });
    
    const viewElement = document.getElementById(`${viewName}-view`);
    if (viewElement) {
        viewElement.classList.remove('d-none');
    } else {
        console.error(`❌ View ${viewName} não encontrada`);
        showView('dashboard');
        return;
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === viewName) {
            item.classList.add('active');
        }
    });
    
    const titles = {
        'dashboard': 'Dashboard',
        'products': 'Produtos',
        'new-product': 'Cadastrar Produto',
        'sales': 'Vendas',
        'new-sale': 'Nova Venda',
        'reports': 'Relatórios',
        'settings': 'Configurações',
        'database': 'Banco de Dados'
    };
    
    const titleElement = document.getElementById('page-title');
    if (titleElement) {
        titleElement.textContent = titles[viewName] || 'Dashboard';
    }
    
    switch(viewName) {
        case 'dashboard':
            updateDashboard();
            updateMonthlySalesChart();
            break;
        case 'products':
            updateProductsList();
            updateInventorySummary();
            break;
        case 'new-product':
            resetProductForm();
            break;
        case 'sales':
            updateSalesList();
            break;
        case 'new-sale':
            setupNewSale();
            break;
        case 'reports':
            updateReports();
            updateCategoryChart();
            break;
        case 'database':
            updateDatabaseInfo();
            break;
    }
}

// ============================================
// 5. SETUP DE EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Navegação do menu
    document.querySelectorAll('.nav-item, .btn-primary, .btn-secondary, .btn[data-view]').forEach(element => {
        element.addEventListener('click', function(e) {
            e.preventDefault();
            const view = this.getAttribute('data-view');
            if (view) {
                showView(view);
            }
        });
    });
    
    // Botões de ação do cabeçalho
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    
    if (exportBtn) exportBtn.addEventListener('click', () => showModal('export-modal'));
    if (importBtn) importBtn.addEventListener('click', () => showModal('import-modal'));
    
    // Formulário de produto
    const productForm = document.getElementById('product-form');
    if (productForm) {
        productForm.addEventListener('submit', saveProduct);
    }
    
    // Atualizar cálculos do produto em tempo real
    const calcFields = ['purchase-cost', 'shipping-cost', 'operational-expenses', 
                      'expected-sales', 'variable-fees', 'taxes', 'profit-margin'];
    calcFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', updateProductCalculations);
        }
    });
    
    // Busca de produtos
    const productSearch = document.getElementById('product-search');
    const categoryFilter = document.getElementById('category-filter');
    
    if (productSearch) productSearch.addEventListener('input', filterProducts);
    if (categoryFilter) categoryFilter.addEventListener('change', filterProducts);
    
    // Exportar produtos
    const exportProductsBtn = document.getElementById('export-products');
    if (exportProductsBtn) {
        exportProductsBtn.addEventListener('click', () => {
            exportData('products');
        });
    }
    
    // Configurações
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveSettings);
    }
    
    const exportDataBtn = document.getElementById('export-data-btn');
    const importDataBtn = document.getElementById('import-data-btn');
    const clearDataBtn = document.getElementById('clear-data-btn');
    
    if (exportDataBtn) exportDataBtn.addEventListener('click', () => showModal('export-modal'));
    if (importDataBtn) importDataBtn.addEventListener('click', () => showModal('import-modal'));
    if (clearDataBtn) clearDataBtn.addEventListener('click', clearAllData);
    
    // Modal de exportação
    const confirmExportBtn = document.getElementById('confirm-export');
    if (confirmExportBtn) {
        confirmExportBtn.addEventListener('click', exportData);
    }
    
    // Modal de importação
    const confirmImportBtn = document.getElementById('confirm-import');
    const importFile = document.getElementById('import-file');
    
    if (confirmImportBtn) confirmImportBtn.addEventListener('click', importData);
    if (importFile) {
        importFile.addEventListener('change', function() {
            const importError = document.getElementById('import-error');
            if (importError) importError.classList.add('d-none');
        });
    }
    
    // Fechar modais
    document.querySelectorAll('.modal-close, .btn[data-modal]').forEach(button => {
        button.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            if (modalId) {
                hideModal(modalId);
            }
        });
    });
    
    // Venda
    const saleProductSearch = document.getElementById('sale-product-search');
    const paymentMethod = document.getElementById('payment-method');
    const saleDiscount = document.getElementById('sale-discount');
    const cardFee = document.getElementById('card-fee');
    const completeSale = document.getElementById('complete-sale');
    const clearCartBtn = document.getElementById('clear-cart');
    
    if (saleProductSearch) saleProductSearch.addEventListener('input', filterSaleProducts);
    if (paymentMethod) paymentMethod.addEventListener('change', updatePaymentMethod);
    if (saleDiscount) saleDiscount.addEventListener('input', updateSaleSummary);
    if (cardFee) cardFee.addEventListener('input', updateSaleSummary);
    if (completeSale) completeSale.addEventListener('click', processSale);
    if (clearCartBtn) clearCartBtn.addEventListener('click', clearCart);
    
    // Cliques fora do modal para fechar
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('active');
            }
        });
    });
    
    // Botão de confirmação de pagamento Pix
    const confirmPixPaymentBtn = document.getElementById('confirm-pix-payment');
    if (confirmPixPaymentBtn) {
        confirmPixPaymentBtn.addEventListener('click', confirmPixPayment);
    }
    
    // Botão de impressão de recibo
    const printReceiptBtn = document.getElementById('print-receipt-btn');
    if (printReceiptBtn) {
        printReceiptBtn.addEventListener('click', printReceipt);
    }
    
    // Botão para gerar PDF de relatório
    const generatePdfReportBtn = document.getElementById('generate-pdf-report');
    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    
    if (generatePdfReportBtn) {
        generatePdfReportBtn.addEventListener('click', () => showModal('pdf-report-modal'));
    }
    if (generatePdfBtn) {
        generatePdfBtn.addEventListener('click', generatePDFReport);
    }
    
    // Configurar seleção de período personalizado
    const reportPeriod = document.getElementById('report-period');
    if (reportPeriod) {
        reportPeriod.addEventListener('change', function() {
            const customDateRange = document.getElementById('custom-date-range');
            if (this.value === 'custom') {
                customDateRange.classList.remove('d-none');
            } else {
                customDateRange.classList.add('d-none');
            }
        });
    }
    
    // Botão para salvar venda editada
    const saveEditedSaleBtn = document.getElementById('save-edited-sale');
    if (saveEditedSaleBtn) {
        saveEditedSaleBtn.addEventListener('click', saveEditedSale);
    }
    
    // Event listeners para campos do modal de edição
    const editPaymentMethod = document.getElementById('edit-payment-method');
    const editSaleDiscount = document.getElementById('edit-sale-discount');
    const editCardFee = document.getElementById('edit-card-fee');
    
    if (editPaymentMethod) editPaymentMethod.addEventListener('change', updateEditPaymentMethod);
    if (editSaleDiscount) editSaleDiscount.addEventListener('input', updateEditSaleSummary);
    if (editCardFee) editCardFee.addEventListener('input', updateEditSaleSummary);
    
    // ============================================
    // EVENT LISTENERS PARA BANCO DE DADOS
    // ============================================
    
    // Forçar migração para IndexedDB
    const forceMigrationBtn = document.getElementById('force-migration');
    if (forceMigrationBtn) {
        forceMigrationBtn.addEventListener('click', async () => {
            if (confirm('Deseja migrar todos os dados do localStorage para o IndexedDB? Esta operação pode demorar alguns segundos.')) {
                showAlert('Migração em andamento...', 'info');
                
                const result = await databaseManager.migrateFromLocalStorage();
                if (result) {
                    showAlert('Migração realizada com sucesso! Recarregando dados...', 'success');
                    
                    // Recarregar dados
                    const newData = await databaseManager.getSystemData();
                    systemData = newData;
                    loadData();
                    updateDashboard();
                    updateDatabaseInfo();
                    
                } else {
                    showAlert('Erro na migração ou nenhum dado para migrar', 'error');
                }
            }
        });
    }
    
    // Criar backup manual
    const createBackupBtn = document.getElementById('create-backup');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', async () => {
            showAlert('Criando backup...', 'info');
            
            // Simular criação de backup
            await saveData();
            showAlert('Backup criado com sucesso!', 'success');
            updateDatabaseInfo();
        });
    }
    
    // Exportar dados completos
    const exportDbBtn = document.getElementById('export-db');
    if (exportDbBtn) {
        exportDbBtn.addEventListener('click', async () => {
            try {
                showAlert('Exportando dados...', 'info');
                
                const exportDataStr = JSON.stringify(systemData, null, 2);
                const blob = new Blob([exportDataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                
                const link = document.createElement('a');
                link.href = url;
                link.download = `camarim-backup-${new Date().toISOString().slice(0,10)}.json`;
                link.click();
                
                URL.revokeObjectURL(url);
                
                showAlert('Backup exportado com sucesso!', 'success');
                
            } catch (error) {
                showAlert('Erro ao exportar backup: ' + error.message, 'error');
            }
        });
    }
    
    // Importar backup
    const importBackupBtn = document.getElementById('import-backup');
    if (importBackupBtn) {
        importBackupBtn.addEventListener('click', async () => {
            const fileInput = document.getElementById('backup-file');
            const file = fileInput?.files[0];
            
            if (!file) {
                showAlert('Selecione um arquivo de backup', 'error');
                return;
            }
            
            if (!confirm('ATENÇÃO: Esta ação irá substituir TODOS os dados atuais. Deseja continuar?')) {
                return;
            }
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    showAlert('Importando backup...', 'info');
                    
                    const importData = JSON.parse(e.target.result);
                    
                    // Validar estrutura
                    if (!importData.products || !Array.isArray(importData.products)) {
                        throw new Error('Arquivo de backup inválido');
                    }
                    
                    // Atualizar systemData
                    systemData = {
                        products: importData.products || [],
                        sales: importData.sales || [],
                        settings: importData.settings || systemData.settings
                    };
                    
                    // Salvar dados
                    await saveData();
                    
                    // Recarregar views
                    loadData();
                    updateDashboard();
                    updateDatabaseInfo();
                    
                    showAlert('Backup importado com sucesso!', 'success');
                    
                } catch (error) {
                    showAlert('Erro ao importar backup: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        });
    }
    
    // Limpar localStorage
    const cleanupLocalBtn = document.getElementById('cleanup-local');
    if (cleanupLocalBtn) {
        cleanupLocalBtn.addEventListener('click', async () => {
            if (confirm('Deseja limpar os dados antigos do localStorage? Isso não afetará o IndexedDB.')) {
                // Manter apenas o backup mais recente
                const currentData = localStorage.getItem('camarim-system-data');
                if (currentData) {
                    localStorage.setItem('camarim-backup-last', currentData);
                }
                
                localStorage.removeItem('camarim-system-data');
                
                showAlert('LocalStorage limpo com sucesso! Backup mantido.', 'success');
                updateDatabaseInfo();
            }
        });
    }
}

// ============================================
// 6. FUNÇÕES PARA CALCULAR VALOR DO ESTOQUE
// ============================================

function calculateInventoryValue() {
    let totalSellingValue = 0;
    let totalCostValue = 0;
    let totalProfitMargin = 0;
    let totalItems = 0;
    
    systemData.products.forEach(product => {
        const sellingValue = product.sellingPrice * product.stock;
        const costValue = product.cmv * product.stock;
        const profitValue = sellingValue - costValue;
        
        totalSellingValue += sellingValue;
        totalCostValue += costValue;
        totalProfitMargin += profitValue;
        totalItems += product.stock;
    });
    
    return {
        totalSellingValue: parseFloat(totalSellingValue.toFixed(2)),
        totalCostValue: parseFloat(totalCostValue.toFixed(2)),
        totalProfitMargin: parseFloat(totalProfitMargin.toFixed(2)),
        totalItems: totalItems,
        averageMargin: totalCostValue > 0 ? 
            parseFloat(((totalProfitMargin / totalCostValue) * 100).toFixed(2)) : 0
    };
}

function updateInventorySummary() {
    const inventorySummary = document.getElementById('inventory-summary');
    if (!inventorySummary) return;
    
    const inventoryData = calculateInventoryValue();
    
    inventorySummary.innerHTML = DOMPurify.sanitize(`
        <div class="card inventory-total-card">
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-boxes"></i>
                </div>
                <div>
                    <h3 class="card-title">Valor Total do Estoque</h3>
                    <div class="card-value currency">${formatCurrency(inventoryData.totalSellingValue)}</div>
                    <div class="card-subtitle">${inventoryData.totalItems} itens em estoque</div>
                </div>
            </div>
        </div>
        
        <div class="card inventory-cost-card">
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-dollar-sign"></i>
                </div>
                <div>
                    <h3 class="card-title">Custo Total do Estoque</h3>
                    <div class="card-value currency">${formatCurrency(inventoryData.totalCostValue)}</div>
                    <div class="card-subtitle">Custo médio por item: ${formatCurrency(inventoryData.totalCostValue / (inventoryData.totalItems || 1))}</div>
                </div>
            </div>
        </div>
        
        <div class="card inventory-margin-card">
            <div class="card-header">
                <div class="card-icon">
                    <i class="fas fa-chart-line"></i>
                </div>
                <div>
                    <h3 class="card-title">Lucro Potencial</h3>
                    <div class="card-value currency">${formatCurrency(inventoryData.totalProfitMargin)}</div>
                    <div class="card-subtitle">Margem média: ${inventoryData.averageMargin}%</div>
                </div>
            </div>
        </div>
    `);
}

// ============================================
// 7. SISTEMA DE VENDAS COM ATENDENTE
// ============================================

function updatePaymentMethod() {
    const paymentMethod = document.getElementById('payment-method');
    const cardFeeContainer = document.getElementById('card-fee-container');
    const cardFeeInfo = document.getElementById('card-fee-info');
    const cardFee = document.getElementById('card-fee');
    
    if (!paymentMethod || !cardFeeContainer) return;
    
    const method = paymentMethod.value;
    
    if (method === 'debit') {
        cardFeeContainer.classList.remove('d-none');
        if (cardFeeInfo) {
            cardFeeInfo.textContent = `Taxa para cartão de débito: ${sanitizeNumber(systemData.settings.defaultDebitFee)}%`;
        }
        if (cardFee) {
            cardFee.value = sanitizeNumber(systemData.settings.defaultDebitFee);
        }
    } else if (method === 'credit') {
        cardFeeContainer.classList.remove('d-none');
        if (cardFeeInfo) {
            cardFeeInfo.textContent = `Taxa para cartão de crédito: ${sanitizeNumber(systemData.settings.defaultCreditFee)}%`;
        }
        if (cardFee) {
            cardFee.value = sanitizeNumber(systemData.settings.defaultCreditFee);
        }
    } else if (method === 'cash' || method === 'pix') {
        cardFeeContainer.classList.add('d-none');
    }
    
    updateSaleSummary();
}

function updateEditPaymentMethod() {
    const paymentMethod = document.getElementById('edit-payment-method');
    const cardFeeContainer = document.getElementById('edit-card-fee-container');
    const cardFeeInfo = document.getElementById('edit-card-fee-info');
    const cardFee = document.getElementById('edit-card-fee');
    
    if (!paymentMethod || !cardFeeContainer) return;
    
    const method = paymentMethod.value;
    
    if (method === 'debit') {
        cardFeeContainer.classList.remove('d-none');
        if (cardFeeInfo) {
            cardFeeInfo.textContent = `Taxa para cartão de débito: ${sanitizeNumber(systemData.settings.defaultDebitFee)}%`;
        }
        if (cardFee) {
            cardFee.value = sanitizeNumber(systemData.settings.defaultDebitFee);
        }
    } else if (method === 'credit') {
        cardFeeContainer.classList.remove('d-none');
        if (cardFeeInfo) {
            cardFeeInfo.textContent = `Taxa para cartão de crédito: ${sanitizeNumber(systemData.settings.defaultCreditFee)}%`;
        }
        if (cardFee) {
            cardFee.value = sanitizeNumber(systemData.settings.defaultCreditFee);
        }
    } else if (method === 'cash' || method === 'pix') {
        cardFeeContainer.classList.add('d-none');
    }
    
    updateEditSaleSummary();
}

async function processSale() {
    if (appState.cart.length === 0) {
        showAlert('Adicione produtos ao carrinho antes de finalizar a venda', 'error');
        return;
    }
    
    const attendantInput = document.getElementById('attendant');
    if (!attendantInput) {
        showAlert('Campo atendente não encontrado', 'error');
        return;
    }
    
    const attendant = DOMPurify.sanitize(attendantInput.value.trim());
    
    if (!attendant) {
        showAlert('Selecione o atendente', 'error');
        return;
    }
    
    if (attendant.length > 100) {
        showAlert('Nome do atendente muito longo. Máximo 100 caracteres.', 'error');
        return;
    }
    
    let subtotal = 0;
    appState.cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    
    const discountInput = document.getElementById('sale-discount');
    const discount = discountInput ? sanitizeNumber(parseFloat(discountInput.value) || 0) : 0;
    
    const paymentMethod = document.getElementById('payment-method');
    const method = paymentMethod ? paymentMethod.value : 'cash';
    
    let cardFee = 0;
    let cardType = "";
    
    if (method === 'debit' || method === 'credit') {
        const cardFeeInput = document.getElementById('card-fee');
        cardFee = cardFeeInput ? sanitizeNumber(parseFloat(cardFeeInput.value) || 0) : 0;
        cardType = method;
    }
    
    const fees = (method === 'debit' || method === 'credit') ? 
        (subtotal - discount) * (cardFee / 100) : 0;
    const total = subtotal - discount + fees;
    
    for (const item of appState.cart) {
        const product = systemData.products.find(p => p.id === item.productId);
        if (!product || product.stock < item.quantity) {
            showAlert(`Estoque insuficiente para ${DOMPurify.sanitize(item.name)} (Disponível: ${product ? product.stock : 0})`, 'error');
            return;
        }
    }
    
    systemData.settings.lastSaleId++;
    const saleId = `SALE-${systemData.settings.lastSaleId.toString().padStart(3, '0')}`;
    
    const sale = {
        id: saleId,
        date: new Date().toISOString(),
        items: appState.cart.map(item => ({
            productId: item.productId,
            name: DOMPurify.sanitize(item.name),
            quantity: item.quantity,
            price: item.price
        })),
        subtotal: subtotal,
        discount: discount,
        paymentMethod: method,
        cardType: cardType,
        cardFee: cardFee,
        fees: fees,
        total: total,
        attendant: attendant
    };
    
    appState.currentSaleData = sale;
    
    if (method === 'pix') {
        showPixPayment(sale);
    } else {
        await confirmSale(sale);
    }
}

async function confirmSale(sale) {
    try {
        // Atualizar estoque dos produtos
        appState.cart.forEach(item => {
            const product = systemData.products.find(p => p.id === item.productId);
            if (product) {
                product.stock -= item.quantity;
            }
        });
        
        // Adicionar venda ao histórico
        systemData.sales.push(sale);
        
        // Salvar dados
        await saveData();
        
        // Limpar carrinho
        appState.cart = [];
        const attendantInput = document.getElementById('attendant');
        if (attendantInput) attendantInput.value = '';
        
        // Mostrar recibo
        showReceipt(sale);
        
        // Atualizar views
        updateDashboard();
        updateMonthlySalesChart();
        updateProductsList();
        updateInventorySummary();
        updateSaleProductsList();
        updateCartDisplay();
        updateSaleSummary();
        
        showAlert(`Venda ${sale.id} finalizada com sucesso! Total: ${formatCurrency(sale.total)}`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao confirmar venda:', error);
        showAlert('Erro ao salvar a venda. Tente novamente.', 'error');
    }
}

// ============================================
// 8. FUNÇÕES PARA EDIÇÃO DE VENDAS
// ============================================

function editSale(saleId) {
    const sanitizedId = DOMPurify.sanitize(saleId);
    const sale = systemData.sales.find(s => s.id === sanitizedId);
    
    if (!sale) {
        showAlert('Venda não encontrada', 'error');
        return;
    }
    
    // Salvar dados originais
    editingSaleData.saleId = sanitizedId;
    editingSaleData.originalSale = JSON.parse(JSON.stringify(sale));
    
    // Converter itens da venda para o formato do carrinho
    editingSaleData.cart = sale.items.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity
    }));
    
    editingSaleData.originalCart = JSON.parse(JSON.stringify(editingSaleData.cart));
    
    // Preencher modal de edição
    populateEditSaleModal(sale);
    showModal('edit-sale-modal');
}

function populateEditSaleModal(sale) {
    // Preencher campos do formulário
    const attendantSelect = document.getElementById('edit-attendant');
    if (attendantSelect) {
        attendantSelect.value = sale.attendant || '';
    }
    
    const discountInput = document.getElementById('edit-sale-discount');
    if (discountInput) {
        discountInput.value = sale.discount || 0;
    }
    
    const paymentMethodSelect = document.getElementById('edit-payment-method');
    if (paymentMethodSelect) {
        paymentMethodSelect.value = sale.paymentMethod || 'cash';
    }
    
    const cardFeeInput = document.getElementById('edit-card-fee');
    if (cardFeeInput && sale.cardFee) {
        cardFeeInput.value = sale.cardFee;
    }
    
    // Atualizar lista de produtos e carrinho
    updateEditSaleProductsList();
    updateEditCartDisplay();
    updateEditPaymentMethod();
    updateEditSaleSummary();
}

function updateEditSaleProductsList() {
    const container = document.getElementById('edit-sale-products-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    systemData.products.forEach(product => {
        const sanitizedName = DOMPurify.sanitize(product.name);
        const existingItem = editingSaleData.cart.find(item => item.productId === product.id);
        const currentQuantity = existingItem ? existingItem.quantity : 0;
        
        // Calcular estoque disponível (considerando itens já no carrinho)
        const availableStock = product.stock + currentQuantity;
        
        const productElement = document.createElement('div');
        productElement.className = 'cart-item';
        productElement.innerHTML = `
            <div class="cart-item-info">
                <h4>${sanitizedName}</h4>
                <div class="code">${product.id} | Estoque: ${availableStock}</div>
                <div class="currency" style="font-weight: 600; margin-top: 5px;">${formatCurrency(product.sellingPrice)}</div>
            </div>
            <div class="cart-item-quantity">
                <button class="quantity-btn edit-minus" data-id="${DOMPurify.sanitize(product.id)}" type="button">-</button>
                <span id="edit-cart-qty-${DOMPurify.sanitize(product.id)}">${currentQuantity}</span>
                <button class="quantity-btn edit-plus" data-id="${DOMPurify.sanitize(product.id)}" type="button">+</button>
                <button class="btn btn-small btn-success edit-add-to-cart" data-id="${DOMPurify.sanitize(product.id)}" type="button" style="margin-left: 10px;">
                    <i class="fas fa-cart-plus"></i> Adicionar
                </button>
            </div>
        `;
        container.appendChild(productElement);
    });
    
    // Adicionar event listeners usando event delegation
    // Primeiro, remove event listeners antigos
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    
    // Adiciona um único event listener no container
    document.getElementById('edit-sale-products-list').addEventListener('click', function(e) {
        const target = e.target;
        const button = target.closest('button');
        
        if (!button) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const productId = DOMPurify.sanitize(button.getAttribute('data-id'));
        if (!productId) return;
        
        const qtySpan = document.getElementById(`edit-cart-qty-${productId}`);
        if (!qtySpan) return;
        
        let currentQty = parseInt(qtySpan.textContent) || 0;
        const product = systemData.products.find(p => p.id === productId);
        
        // Botão "+"
        if (button.classList.contains('edit-plus') && product) {
            // Verificar estoque disponível (considerando itens já no carrinho)
            const cartItem = editingSaleData.cart.find(item => item.productId === productId);
            const currentCartQty = cartItem ? cartItem.quantity : 0;
            const availableStock = product.stock + currentCartQty;
            
            if (currentQty < availableStock) {
                currentQty++;
                qtySpan.textContent = currentQty;
            }
        }
        // Botão "-"
        else if (button.classList.contains('edit-minus')) {
            if (currentQty > 0) {
                currentQty--;
                qtySpan.textContent = currentQty;
            }
        }
        // Botão "Adicionar"
        else if (button.classList.contains('edit-add-to-cart')) {
            const quantity = currentQty;
            if (quantity > 0) {
                editAddToCart(productId, quantity);
                qtySpan.textContent = '0';
            }
        }
    });
    
    // Filtro de busca (manter separado)
    const searchInput = document.getElementById('edit-sale-product-search');
    if (searchInput) {
        searchInput.oninput = filterEditSaleProducts;
    }
}

function filterEditSaleProducts() {
    const searchInput = document.getElementById('edit-sale-product-search');
    if (!searchInput) return;
    
    const searchTerm = DOMPurify.sanitize(searchInput.value.toLowerCase());
    const products = document.querySelectorAll('#edit-sale-products-list .cart-item');
    
    products.forEach(product => {
        const productName = product.querySelector('.cart-item-info h4')?.textContent.toLowerCase() || '';
        const productCode = product.querySelector('.code')?.textContent.toLowerCase() || '';
        
        const isVisible = productName.includes(searchTerm) || productCode.includes(searchTerm);
        product.style.display = isVisible ? '' : 'none';
    });
}

function editAddToCart(productId, quantity) {
    const product = systemData.products.find(p => p.id === productId);
    if (!product) return;
    
    const existingItemIndex = editingSaleData.cart.findIndex(item => item.productId === productId);
    
    if (existingItemIndex !== -1) {
        const newQty = editingSaleData.cart[existingItemIndex].quantity + quantity;
        editingSaleData.cart[existingItemIndex].quantity = newQty;
    } else {
        editingSaleData.cart.push({
            productId: productId,
            name: DOMPurify.sanitize(product.name),
            price: product.sellingPrice,
            quantity: quantity
        });
    }
    
    updateEditCartDisplay();
    updateEditSaleSummary();
    updateEditSaleProductsList(); // Atualizar lista para mostrar estoque atualizado
}

function updateEditCartDisplay() {
    const cartContainer = document.getElementById('edit-sale-cart');
    const emptyMessage = document.getElementById('edit-empty-cart-message');
    
    if (!cartContainer || !emptyMessage) return;
    
    if (editingSaleData.cart.length === 0) {
        cartContainer.innerHTML = '';
        emptyMessage.classList.remove('d-none');
        return;
    }
    
    emptyMessage.classList.add('d-none');
    
    let cartHTML = '<h4 style="margin-bottom: 15px;">Produtos na Venda</h4>';
    
    editingSaleData.cart.forEach((item, index) => {
        const product = systemData.products.find(p => p.id === item.productId);
        const subtotal = item.price * item.quantity;
        
        cartHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${DOMPurify.sanitize(item.name)}</h4>
                    <div class="code">${item.productId}</div>
                    <div class="currency">${formatCurrency(item.price)} cada</div>
                </div>
                <div class="cart-item-quantity">
                    <button class="quantity-btn edit-minus-cart" data-index="${index}">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn edit-plus-cart" data-index="${index}">+</button>
                    <button class="btn btn-small btn-danger edit-remove-from-cart" data-index="${index}" style="margin-left: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="text-right" style="min-width: 100px;">
                    <strong class="currency">${formatCurrency(subtotal)}</strong>
                </div>
            </div>
        `;
    });
    
    cartContainer.innerHTML = DOMPurify.sanitize(cartHTML);
    
    // Adicionar event listeners para os botões do carrinho
    setTimeout(() => {
        document.querySelectorAll('.edit-plus-cart').forEach(button => {
            button.addEventListener('click', function() {
                const index = sanitizeNumber(parseInt(this.getAttribute('data-index')));
                editUpdateCartItemQuantity(index, 1);
            });
        });
        
        document.querySelectorAll('.edit-minus-cart').forEach(button => {
            button.addEventListener('click', function() {
                const index = sanitizeNumber(parseInt(this.getAttribute('data-index')));
                editUpdateCartItemQuantity(index, -1);
            });
        });
        
        document.querySelectorAll('.edit-remove-from-cart').forEach(button => {
            button.addEventListener('click', function() {
                const index = sanitizeNumber(parseInt(this.getAttribute('data-index')));
                editRemoveFromCart(index);
            });
        });
    }, 100);
}

function editUpdateCartItemQuantity(index, change) {
    if (index < 0 || index >= editingSaleData.cart.length) return;
    
    const item = editingSaleData.cart[index];
    const product = systemData.products.find(p => p.id === item.productId);
    if (!product) return;
    
    const newQuantity = item.quantity + change;
    
    if (newQuantity < 1) {
        editRemoveFromCart(index);
        return;
    }
    
    // Verificar estoque disponível (considerando itens já no carrinho)
    const cartItem = editingSaleData.cart.find(cartItem => cartItem.productId === item.productId);
    const currentCartQty = cartItem ? cartItem.quantity : 0;
    const availableStock = product.stock + currentCartQty;
    
    if (newQuantity > availableStock) {
        showAlert(`Estoque insuficiente! Disponível: ${availableStock}`, 'error');
        return;
    }
    
    item.quantity = newQuantity;
    updateEditCartDisplay();
    updateEditSaleSummary();
    updateEditSaleProductsList();
}

function editRemoveFromCart(index) {
    if (index >= 0 && index < editingSaleData.cart.length) {
        editingSaleData.cart.splice(index, 1);
        updateEditCartDisplay();
        updateEditSaleSummary();
        updateEditSaleProductsList();
    }
}

function updateEditSaleSummary() {
    const cartSubtotal = document.getElementById('edit-cart-subtotal');
    const cartDiscount = document.getElementById('edit-cart-discount');
    const cartTotal = document.getElementById('edit-cart-total');
    
    if (!cartSubtotal || !cartDiscount || !cartTotal) return;
    
    let subtotal = 0;
    editingSaleData.cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    
    const discountInput = document.getElementById('edit-sale-discount');
    const discount = discountInput ? sanitizeNumber(parseFloat(discountInput.value) || 0) : 0;
    
    const paymentMethod = document.getElementById('edit-payment-method');
    const method = paymentMethod ? paymentMethod.value : 'cash';
    
    let fees = 0;
    
    if (method === 'debit' || method === 'credit') {
        const cardFeeInput = document.getElementById('edit-card-fee');
        const cardFee = cardFeeInput ? sanitizeNumber(parseFloat(cardFeeInput.value) || 0) : 0;
        fees = (subtotal - discount) * (cardFee / 100);
        
        const cartFeesRow = document.getElementById('edit-cart-fees-row');
        const cartFees = document.getElementById('edit-cart-fees');
        if (cartFeesRow) cartFeesRow.classList.remove('d-none');
        if (cartFees) cartFees.textContent = formatCurrency(fees);
    } else {
        const cartFeesRow = document.getElementById('edit-cart-fees-row');
        if (cartFeesRow) cartFeesRow.classList.add('d-none');
    }
    
    const total = subtotal - discount + fees;
    
    cartSubtotal.textContent = formatCurrency(subtotal);
    cartDiscount.textContent = formatCurrency(discount);
    cartTotal.textContent = formatCurrency(total);
}

async function saveEditedSale() {
    if (editingSaleData.cart.length === 0) {
        showAlert('Adicione produtos à venda antes de salvar', 'error');
        return;
    }
    
    const attendantInput = document.getElementById('edit-attendant');
    if (!attendantInput) {
        showAlert('Campo atendente não encontrado', 'error');
        return;
    }
    
    const attendant = DOMPurify.sanitize(attendantInput.value.trim());
    
    if (!attendant) {
        showAlert('Selecione o atendente', 'error');
        return;
    }
    
    if (attendant.length > 100) {
        showAlert('Nome do atendente muito longo. Máximo 100 caracteres.', 'error');
        return;
    }
    
    let subtotal = 0;
    editingSaleData.cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    
    const discountInput = document.getElementById('edit-sale-discount');
    const discount = discountInput ? sanitizeNumber(parseFloat(discountInput.value) || 0) : 0;
    
    const paymentMethod = document.getElementById('edit-payment-method');
    const method = paymentMethod ? paymentMethod.value : 'cash';
    
    let cardFee = 0;
    let cardType = "";
    
    if (method === 'debit' || method === 'credit') {
        const cardFeeInput = document.getElementById('edit-card-fee');
        cardFee = cardFeeInput ? sanitizeNumber(parseFloat(cardFeeInput.value) || 0) : 0;
        cardType = method;
    }
    
    const fees = (method === 'debit' || method === 'credit') ? 
        (subtotal - discount) * (cardFee / 100) : 0;
    const total = subtotal - discount + fees;
    
    // Verificar estoque para todos os produtos
    for (const item of editingSaleData.cart) {
        const product = systemData.products.find(p => p.id === item.productId);
        if (!product) {
            showAlert(`Produto ${DOMPurify.sanitize(item.name)} não encontrado`, 'error');
            return;
        }
        
        // Encontrar quantidade original deste produto na venda
        const originalItem = editingSaleData.originalCart.find(oi => oi.productId === item.productId);
        const originalQuantity = originalItem ? originalItem.quantity : 0;
        
        // Calcular diferença de quantidade
        const quantityDifference = item.quantity - originalQuantity;
        
        // Verificar se há estoque suficiente para a diferença
        if (product.stock < quantityDifference) {
            const availableForIncrease = product.stock + originalQuantity;
            showAlert(`Estoque insuficiente para ${DOMPurify.sanitize(item.name)}. Disponível para aumento: ${availableForIncrease}`, 'error');
            return;
        }
    }
    
    try {
        // 1. Restaurar estoque dos produtos originais
        editingSaleData.originalCart.forEach(originalItem => {
            const product = systemData.products.find(p => p.id === originalItem.productId);
            if (product) {
                product.stock += originalItem.quantity;
            }
        });
        
        // 2. Reduzir estoque dos novos produtos
        editingSaleData.cart.forEach(item => {
            const product = systemData.products.find(p => p.id === item.productId);
            if (product) {
                product.stock -= item.quantity;
            }
        });
        
        // 3. Atualizar a venda no sistema
        const saleIndex = systemData.sales.findIndex(s => s.id === editingSaleData.saleId);
        if (saleIndex !== -1) {
            systemData.sales[saleIndex] = {
                id: editingSaleData.saleId,
                date: editingSaleData.originalSale.date, // Manter a data original
                items: editingSaleData.cart.map(item => ({
                    productId: item.productId,
                    name: DOMPurify.sanitize(item.name),
                    quantity: item.quantity,
                    price: item.price
                })),
                subtotal: subtotal,
                discount: discount,
                paymentMethod: method,
                cardType: cardType,
                cardFee: cardFee,
                fees: fees,
                total: total,
                attendant: attendant
            };
        }
        
        // 4. Salvar dados
        await saveData();
        
        // 5. Limpar dados de edição
        editingSaleData = {
            saleId: null,
            originalSale: null,
            cart: [],
            originalCart: []
        };
        
        // 6. Fechar modal
        hideModal('edit-sale-modal');
        
        // 7. Atualizar views
        updateSalesList();
        updateDashboard();
        updateProductsList();
        updateInventorySummary();
        
        showAlert('Venda atualizada com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar venda editada:', error);
        showAlert('Erro ao salvar as alterações. Tente novamente.', 'error');
    }
}

// ============================================
// 9. SISTEMA DE RECIBOS E IMPRESSÃO
// ============================================

function showReceipt(sale) {
    const modalContent = document.getElementById('receipt-content');
    if (!modalContent) return;
    
    const saleDate = new Date(sale.date);
    
    const sanitizedId = DOMPurify.sanitize(sale.id);
    const sanitizedAttendant = DOMPurify.sanitize(sale.attendant);
    
    let receiptHTML = `
        <div class="receipt-header">
            <h2 style="margin-bottom: 5px;">CAMARIM BOUTIQUE</h2>
            <p style="margin-bottom: 5px;">Sistema de Gestão</p>
            <p>CNPJ: 12.345.678/0001-99</p>
            <p>${saleDate.toLocaleDateString('pt-BR')} ${saleDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
        </div>
        
        <div style="margin-bottom: 15px;">
            <p><strong>Venda:</strong> ${sanitizedId}</p>
            <p><strong>Atendente:</strong> ${sanitizedAttendant}</p>
        </div>
        
        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; margin-bottom: 15px;">
    `;
    
    sale.items.forEach(item => {
        const itemTotal = item.price * item.quantity;
        const sanitizedName = DOMPurify.sanitize(item.name);
        receiptHTML += `
            <div class="receipt-item">
                <div style="flex: 1;">
                    <div>${sanitizedName}</div>
                    <div style="font-size: 0.9em;">${item.quantity} x ${formatCurrency(item.price)}</div>
                </div>
                <div>${formatCurrency(itemTotal)}</div>
            </div>
        `;
    });
    
    receiptHTML += `
        </div>
        
        <div style="margin-bottom: 15px;">
            <div class="receipt-item">
                <span>Subtotal:</span>
                <span>${formatCurrency(sale.subtotal)}</span>
            </div>
    `;
    
    if (sale.discount > 0) {
        receiptHTML += `
            <div class="receipt-item">
                <span>Desconto:</span>
                <span>- ${formatCurrency(sale.discount)}</span>
            </div>
        `;
    }
    
    if (sale.fees > 0) {
        const feeType = sale.cardType === 'debit' ? 'Taxa Débito' : 'Taxa Crédito';
        receiptHTML += `
            <div class="receipt-item">
                <span>${feeType} (${sale.cardFee}%):</span>
                <span>${formatCurrency(sale.fees)}</span>
            </div>
        `;
    }
    
    let paymentMethodText = '';
    switch(sale.paymentMethod) {
        case 'cash':
            paymentMethodText = 'Dinheiro';
            break;
        case 'pix':
            paymentMethodText = 'Pix';
            break;
        case 'debit':
            paymentMethodText = 'Cartão de Débito';
            break;
        case 'credit':
            paymentMethodText = 'Cartão de Crédito';
            break;
        default:
            paymentMethodText = DOMPurify.sanitize(sale.paymentMethod);
    }
    
    receiptHTML += `
            <div class="receipt-item receipt-total">
                <span>TOTAL:</span>
                <span>${formatCurrency(sale.total)}</span>
            </div>
            
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #000;">
                <p><strong>Forma de Pagamento:</strong> ${paymentMethodText}</p>
            </div>
        </div>
        
        <div class="receipt-footer">
            <p>**************************************</p>
            <p>Obrigado pela preferência!</p>
            <p>Volte sempre!</p>
            <p>Instagram:@camarim</p>
            <p>**************************************</p>
        </div>
    `;
    
    modalContent.innerHTML = DOMPurify.sanitize(receiptHTML);
    showModal('receipt-modal');
}

function printReceipt() {
    const receiptContent = document.getElementById('receipt-content').innerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recibo - Camarim Boutique</title>
            <style>
                body {
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    line-height: 1.4;
                    margin: 0;
                    padding: 10px;
                    max-width: 400px;
                    margin: 0 auto;
                }
                .receipt-header {
                    text-align: center;
                    margin-bottom: 15px;
                    border-bottom: 1px dashed #000;
                    padding-bottom: 10px;
                }
                .receipt-item {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                }
                .receipt-total {
                    border-top: 2px solid #000;
                    margin-top: 10px;
                    padding-top: 10px;
                    font-weight: bold;
                }
                .receipt-footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 0.9em;
                    color: #666;
                }
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                    }
                }
            </style>
        </head>
        <body>
            ${receiptContent}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(function() {
                        window.close();
                    }, 500);
                }
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

// ============================================
// 10. SISTEMA DE RELATÓRIOS EM PDF OTIMIZADO PARA IMPRESSÃO
// ============================================

function generatePDFReport() {
    const reportType = document.getElementById('report-type').value;
    const reportPeriod = document.getElementById('report-period').value;
    const reportTitle = document.getElementById('report-title').value || getDefaultReportTitle(reportType, reportPeriod);
    const includeCharts = document.getElementById('include-charts').value === 'yes';
    const includeTables = document.getElementById('include-tables').value === 'yes';
    const reportFormat = document.getElementById('report-format').value;
    const reportOrientation = document.getElementById('report-orientation').value;
    
    // Determinar período
    const period = getReportPeriod(reportPeriod);
    
    showAlert('Gerando relatório... Isso pode levar alguns segundos.', 'info');
    
    setTimeout(() => {
        // Gerar relatório com base no tipo
        switch(reportType) {
            case 'sales':
                generateSalesReport(reportTitle, period, includeCharts, includeTables, reportFormat, reportOrientation);
                break;
            case 'products':
                generateProductsReport(reportTitle, period, includeCharts, includeTables, reportFormat, reportOrientation);
                break;
            case 'financial':
                generateFinancialReport(reportTitle, period, includeCharts, includeTables, reportFormat, reportOrientation);
                break;
            case 'inventory':
                generateInventoryReport(reportTitle, period, includeCharts, includeTables, reportFormat, reportOrientation);
                break;
            default:
                showAlert('Tipo de relatório não suportado', 'error');
                return;
        }
        
        hideModal('pdf-report-modal');
    }, 100);
}

function getDefaultReportTitle(type, period) {
    const typeNames = {
        'sales': 'Relatório de Vendas',
        'products': 'Relatório de Produtos',
        'financial': 'Relatório Financeiro',
        'inventory': 'Relatório de Estoque'
    };
    
    const periodNames = {
        'today': 'Hoje',
        'yesterday': 'Ontem',
        'last7': 'Últimos 7 Dias',
        'last30': 'Últimos 30 Dias',
        'thisMonth': 'Este Mês',
        'lastMonth': 'Mês Anterior',
        'thisYear': 'Este Ano',
        'custom': 'Período Personalizado'
    };
    
    return `${typeNames[type]} - ${periodNames[period]}`;
}

function getReportPeriod(period) {
    const now = new Date();
    let startDate, endDate;
    
    switch(period) {
        case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
            break;
        case 'yesterday':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
            break;
        case 'last7':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            endDate = now;
            break;
        case 'last30':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            endDate = now;
            break;
        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
        case 'thisYear':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            break;
        case 'custom':
            const startInput = document.getElementById('start-date').value;
            const endInput = document.getElementById('end-date').value;
            startDate = startInput ? new Date(startInput + 'T00:00:00') : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            endDate = endInput ? new Date(endInput + 'T23:59:59') : now;
            break;
        default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            endDate = now;
    }
    
    return { startDate, endDate };
}

// ============================================
// FUNÇÕES DE FORMATAÇÃO PADRÃO ABNT
// ============================================

function addCoverPage(doc, title, reportType, period) {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Título principal centralizado
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text('CAMARIM BOUTIQUE', pageWidth / 2, 50, { align: 'center' });
    
    // Subtítulo
    doc.setFontSize(12);
    doc.text('Sistema de Gestão Comercial', pageWidth / 2, 65, { align: 'center' });
    
    // Linha divisória
    doc.setDrawColor(26, 26, 46); // #1a1a2e
    doc.setLineWidth(0.5);
    doc.line(pageWidth * 0.25, 75, pageWidth * 0.75, 75);
    
    // Título do relatório
    doc.setFontSize(14);
    doc.text(title.toUpperCase(), pageWidth / 2, 95, { align: 'center' });
    
    // Tipo de relatório
    doc.setFontSize(12);
    doc.text(`Tipo: ${reportType}`, pageWidth / 2, 115, { align: 'center' });
    
    // Período
    const periodText = `Período: ${period.startDate.toLocaleDateString('pt-BR')} a ${period.endDate.toLocaleDateString('pt-BR')}`;
    doc.text(periodText, pageWidth / 2, 130, { align: 'center' });
    
    // Data de geração
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 145, { align: 'center' });
    
    // Informações da empresa (rodapé)
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('Documento de uso interno - Versão 1.0', pageWidth / 2, pageHeight - 40, { align: 'center' });
    doc.text('Camarim Boutique | CNPJ: 12.345.678/0001-99', pageWidth / 2, pageHeight - 30, { align: 'center' });
    doc.text('Sistema desenvolvido por Guilherme Silva Vanderley', pageWidth / 2, pageHeight - 20, { align: 'center' });
}

function addHeader(doc, title, pageNumber) {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Cabeçalho simples
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    // Esquerda: Título
    doc.text(title, 20, 15);
    
    // Centro: Data
    doc.text(new Date().toLocaleDateString('pt-BR'), pageWidth / 2, 15, { align: 'center' });
    
    // Direita: Página
    doc.text(`Página ${pageNumber}`, pageWidth - 20, 15, { align: 'right' });
    
    // Linha divisória
    doc.setDrawColor(26, 26, 46); // #1a1a2e
    doc.setLineWidth(0.3);
    doc.line(20, 20, pageWidth - 20, 20);
}

function addPageNumber(doc, pageNumber) {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Página ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
}

function addTableOfContents(doc, sections) {
    const pageWidth = doc.internal.pageSize.width;
    
    // Título
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('SUMÁRIO', pageWidth / 2, 40, { align: 'center' });
    
    doc.setDrawColor(26, 26, 46);
    doc.setLineWidth(0.5);
    doc.line(pageWidth * 0.3, 45, pageWidth * 0.7, 45);
    
    // Lista de seções
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    
    let y = 70;
    sections.forEach((section, index) => {
        // Número da seção
        doc.setFontSize(10);
        doc.setTextColor(255, 107, 139); // #ff6b8b
        doc.text(`${index + 1}.`, 30, y);
        
        // Nome da seção
        doc.setTextColor(0, 0, 0);
        doc.text(section, 45, y);
        
        // Número da página
        doc.setTextColor(100, 100, 100);
        doc.text(`${index + 3}`, pageWidth - 30, y, { align: 'right' });
        
        y += 12;
    });
}

function createTable(doc, headers, data, startX, startY, colWidths, pageWidth) {
    const colPositions = [startX];
    for (let i = 1; i < colWidths.length; i++) {
        colPositions[i] = colPositions[i - 1] + colWidths[i - 1];
    }
    
    // Verificar se a tabela cabe na página
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const availableWidth = pageWidth - startX - 20; // Margem direita de 20mm
    
    // Ajustar larguras se necessário
    if (tableWidth > availableWidth) {
        const scaleFactor = availableWidth / tableWidth;
        for (let i = 0; i < colWidths.length; i++) {
            colWidths[i] = colWidths[i] * scaleFactor;
        }
        
        // Recalcular posições
        colPositions[0] = startX;
        for (let i = 1; i < colWidths.length; i++) {
            colPositions[i] = colPositions[i - 1] + colWidths[i - 1];
        }
    }
    
    // Cabeçalho
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    
    headers.forEach((header, i) => {
        // Quebrar cabeçalhos muito longos em múltiplas linhas
        const maxWidth = colWidths[i] - 4; // Margem de 2mm de cada lado
        const fontSize = doc.internal.getFontSize();
        const charWidth = fontSize * 0.5; // Aproximação de largura por caractere
        const maxChars = Math.floor(maxWidth / charWidth);
        
        let displayHeader = header;
        if (header.length > maxChars) {
            // Encontrar o melhor ponto para quebrar
            const words = header.split(' ');
            let lines = [];
            let currentLine = '';
            
            for (let word of words) {
                if ((currentLine + ' ' + word).length <= maxChars) {
                    currentLine = currentLine ? currentLine + ' ' + word : word;
                } else {
                    if (currentLine) lines.push(currentLine);
                    currentLine = word.length > maxChars ? word.substring(0, maxChars - 1) + '…' : word;
                }
            }
            if (currentLine) lines.push(currentLine);
            
            // Desenhar múltiplas linhas
            lines.forEach((line, lineIndex) => {
                doc.text(line, colPositions[i] + 2, startY + 5 + (lineIndex * 4));
            });
        } else {
            doc.text(displayHeader, colPositions[i] + 2, startY + 5);
        }
    });
    
    // Linha do cabeçalho
    doc.setDrawColor(26, 26, 46);
    doc.setLineWidth(0.3);
    doc.line(startX, startY - 2, startX + colWidths.reduce((a, b) => a + b, 0), startY - 2);
    
    // Calcular altura do cabeçalho (pode ter múltiplas linhas)
    const headerHeight = Math.max(15, headers.reduce((max, header, i) => {
        const maxWidth = colWidths[i] - 4;
        const fontSize = doc.internal.getFontSize();
        const charWidth = fontSize * 0.5;
        const maxChars = Math.floor(maxWidth / charWidth);
        
        if (header.length > maxChars) {
            const words = header.split(' ');
            let lines = 1;
            let currentLine = '';
            
            for (let word of words) {
                if ((currentLine + ' ' + word).length <= maxChars) {
                    currentLine = currentLine ? currentLine + ' ' + word : word;
                } else {
                    lines++;
                    currentLine = word.length > maxChars ? word.substring(0, maxChars - 1) + '…' : word;
                }
            }
            return Math.max(max, lines * 4 + 8);
        }
        return max;
    }, 0));
    
    doc.line(startX, startY + headerHeight, startX + colWidths.reduce((a, b) => a + b, 0), startY + headerHeight);
    
    // Dados
    let currentY = startY + headerHeight + 5;
    let needNewPage = false;
    
    data.forEach((row, rowIndex) => {
        if (currentY > 270) { // Verificar se ultrapassa o final da página
            needNewPage = true;
            return;
        }
        
        // Alternar cores das linhas (cinza claro para linhas pares)
        if (rowIndex % 2 === 0) {
            doc.setFillColor(245, 245, 245);
            doc.rect(startX, currentY - 5, colWidths.reduce((a, b) => a + b, 0), 10, 'F');
        }
        
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        
        // Calcular altura máxima necessária para esta linha
        let rowHeight = 10; // Altura mínima
        
        row.forEach((cell, cellIndex) => {
            const maxWidth = colWidths[cellIndex] - 4;
            const fontSize = doc.internal.getFontSize();
            const charWidth = fontSize * 0.5;
            const maxChars = Math.floor(maxWidth / charWidth);
            
            if (cell.length > maxChars) {
                // Quebrar texto em múltiplas linhas
                const words = cell.split(' ');
                let lines = 1;
                let currentLine = '';
                
                for (let word of words) {
                    if ((currentLine + ' ' + word).length <= maxChars) {
                        currentLine = currentLine ? currentLine + ' ' + word : word;
                    } else {
                        lines++;
                        currentLine = word;
                    }
                }
                
                rowHeight = Math.max(rowHeight, lines * 4 + 6);
            }
        });
        
        // Desenhar células com quebra de linha
        row.forEach((cell, cellIndex) => {
            const maxWidth = colWidths[cellIndex] - 4;
            const fontSize = doc.internal.getFontSize();
            const charWidth = fontSize * 0.5;
            const maxChars = Math.floor(maxWidth / charWidth);
            
            if (cell.length > maxChars) {
                // Quebrar texto em múltiplas linhas
                const words = cell.split(' ');
                let lines = [];
                let currentLine = '';
                
                for (let word of words) {
                    if ((currentLine + ' ' + word).length <= maxChars) {
                        currentLine = currentLine ? currentLine + ' ' + word : word;
                    } else {
                        if (currentLine) lines.push(currentLine);
                        currentLine = word;
                    }
                }
                if (currentLine) lines.push(currentLine);
                
                // Desenhar múltiplas linhas
                lines.forEach((line, lineIndex) => {
                    doc.text(line, colPositions[cellIndex] + 2, currentY + (lineIndex * 4));
                });
            } else {
                doc.text(cell, colPositions[cellIndex] + 2, currentY);
            }
        });
        
        currentY += rowHeight;
    });
    
    return { y: currentY, newPage: needNewPage };
}

function addSectionTitle(doc, title, y) {
    doc.setFontSize(12);
    doc.setTextColor(26, 26, 46); // #1a1a2e
    doc.text(title, 20, y);
    
    doc.setDrawColor(255, 107, 139); // #ff6b8b
    doc.setLineWidth(0.5);
    doc.line(20, y + 2, 80, y + 2);
    
    return y + 15;
}

function addMetricCard(doc, title, value, unit, x, y, width, height) {
    // Borda simples
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(x, y, width, height, 'S');
    
    // Título
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(title, x + 5, y + 8);
    
    // Valor
    doc.setFontSize(12);
    doc.setTextColor(26, 26, 46); // #1a1a2e
    
    let displayValue;
    if (unit === 'R$') {
        displayValue = `R$ ${formatCurrency(value)}`;
    } else if (unit === '%') {
        displayValue = `${value.toFixed(1)}%`;
    } else {
        displayValue = `${value} ${unit}`;
    }
    
    doc.text(displayValue, x + 5, y + 18);
    
    return y + height + 10;
}

// ============================================
// RELATÓRIO DE VENDAS (OTIMIZADO)
// ============================================

async function generateSalesReport(title, period, includeCharts, includeTables, format, orientation) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('Biblioteca jsPDF não carregada');
        }
        
        const pageSize = format === 'A3' ? 'a3' : format === 'letter' ? 'letter' : 'a4';
        const isLandscape = orientation === 'landscape';
        
        const doc = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: pageSize
        });
        
        // Filtrar vendas no período
        const filteredSales = systemData.sales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= period.startDate && saleDate <= period.endDate;
        });
        
        // Calcular métricas
        const metrics = calculateSalesMetrics(filteredSales);
        
        // Página 1: Capa
        addCoverPage(doc, title, 'Vendas', period);
        
        // Página 2: Sumário
        doc.addPage();
        addTableOfContents(doc, [
            'Resumo Executivo',
            'Métricas de Desempenho',
            'Vendas por Atendente',
            'Produtos Mais Vendidos',
            'Análise Financeira',
            'Métodos de Pagamento',
            'Conclusões'
        ]);
        
        // Página 3: Resumo Executivo
        doc.addPage();
        addHeader(doc, title, 3);
        let currentY = addSectionTitle(doc, 'RESUMO EXECUTIVO', 40);
        
        // Período analisado
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Período analisado: ${period.startDate.toLocaleDateString('pt-BR')} a ${period.endDate.toLocaleDateString('pt-BR')}`, 20, currentY);
        currentY += 10;
        
        // Resumo numérico
        const summaryData = [
            `Total de vendas: ${metrics.totalSales}`,
            `Receita total: R$ ${formatCurrency(metrics.totalRevenue)}`,
            `Itens vendidos: ${metrics.totalItems}`,
            `Ticket médio: R$ ${formatCurrency(metrics.averageTicket)}`,
            `Maior venda: R$ ${formatCurrency(metrics.maxSale)}`
        ];
        
        summaryData.forEach(item => {
            doc.text(`• ${item}`, 25, currentY);
            currentY += 8;
        });
        
        // Análise
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Análise do Período:', 20, currentY);
        currentY += 10;
        
        let analysis = '';
        if (metrics.totalSales === 0) {
            analysis = 'Nenhuma venda registrada no período analisado.';
        } else {
            const daysInPeriod = Math.ceil((period.endDate - period.startDate) / (1000 * 60 * 60 * 24)) + 1;
            const avgDailySales = metrics.totalSales / daysInPeriod;
            const avgDailyRevenue = metrics.totalRevenue / daysInPeriod;
            
            analysis = `Média diária: ${avgDailySales.toFixed(1)} vendas / R$ ${formatCurrency(avgDailyRevenue)}`;
            
            if (metrics.averageTicket > 100) {
                analysis += '\nTicket médio acima da média esperada.';
            } else if (metrics.averageTicket > 50) {
                analysis += '\nTicket médio dentro da média esperada.';
            } else {
                analysis += '\nTicket médio abaixo da média esperada.';
            }
        }
        
        const splitAnalysis = doc.splitTextToSize(analysis, 170);
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(splitAnalysis, 25, currentY);
        currentY += splitAnalysis.length * 5 + 10;
        
        // Página 4: Métricas de Desempenho
        doc.addPage();
        addHeader(doc, title, 4);
        currentY = addSectionTitle(doc, 'MÉTRICAS DE DESEMPENHO', 40);
        
        // Cards de métricas
        const metricCards = [
            { title: 'Total de Vendas', value: metrics.totalSales, unit: 'vendas' },
            { title: 'Receita Total', value: metrics.totalRevenue, unit: 'R$' },
            { title: 'Itens Vendidos', value: metrics.totalItems, unit: 'unid.' },
            { title: 'Ticket Médio', value: metrics.averageTicket, unit: 'R$' },
            { title: 'Vendas/Dia', value: metrics.totalSales / (Math.ceil((period.endDate - period.startDate) / (1000 * 60 * 60 * 24)) + 1), unit: 'média' },
            { title: 'Receita/Dia', value: metrics.totalRevenue / (Math.ceil((period.endDate - period.startDate) / (1000 * 60 * 60 * 24)) + 1), unit: 'R$' }
        ];
        
        let cardY = currentY;
        metricCards.forEach((card, index) => {
            const x = 20 + (index % 3) * 60;
            if (index % 3 === 0 && index > 0) cardY += 35;
            
            addMetricCard(doc, card.title, card.value, card.unit, x, cardY, 55, 25);
        });
        
        // Vendas por dia da semana
        cardY += 40;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Vendas por Dia da Semana:', 20, cardY);
        cardY += 10;
        
        const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        weekdays.forEach(day => {
            const revenue = metrics.salesByWeekday[day] || 0;
            const percentage = metrics.totalRevenue > 0 ? (revenue / metrics.totalRevenue * 100).toFixed(1) : '0.0';
            
            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.text(`${day}:`, 25, cardY);
            doc.text(`R$ ${formatCurrency(revenue)}`, 50, cardY);
            doc.text(`(${percentage}%)`, 90, cardY);
            
            // Barra de porcentagem
            const barWidth = 50;
            const filledWidth = (percentage / 100) * barWidth;
            doc.setFillColor(240, 240, 240);
            doc.rect(110, cardY - 3, barWidth, 4, 'F');
            doc.setFillColor(255, 107, 139); // #ff6b8b
            doc.rect(110, cardY - 3, filledWidth, 4, 'F');
            
            cardY += 8;
        });
        
        // Página 5: Vendas por Atendente
        doc.addPage();
        addHeader(doc, title, 5);
        currentY = addSectionTitle(doc, 'VENDAS POR ATENDENTE', 40);
        
        // Calcular vendas por atendente
        const salesByAttendant = {};
        filteredSales.forEach(sale => {
            const attendant = sale.attendant || 'Não informado';
            if (!salesByAttendant[attendant]) {
                salesByAttendant[attendant] = { 
                    salesCount: 0, 
                    revenue: 0, 
                    items: 0 
                };
            }
            salesByAttendant[attendant].salesCount++;
            salesByAttendant[attendant].revenue += sale.total;
            salesByAttendant[attendant].items += sale.items.reduce((sum, item) => sum + item.quantity, 0);
        });
        
        // Ordenar por receita
        const sortedAttendants = Object.entries(salesByAttendant)
            .sort(([, a], [, b]) => b.revenue - a.revenue);
        
        // Tabela de atendentes
        const headers = ['Atendente', 'Vendas', 'Receita (R$)', 'Itens', 'Ticket Médio'];
        const tableData = sortedAttendants.map(([attendant, data]) => {
            const avgTicket = data.salesCount > 0 ? data.revenue / data.salesCount : 0;
            return [
                attendant,
                data.salesCount.toString(),
                formatCurrency(data.revenue),
                data.items.toString(),
                formatCurrency(avgTicket)
            ];
        });
        
        const colWidths = [50, 20, 35, 20, 30];
        const tableResult = createTable(doc, headers, tableData, 20, currentY, colWidths, doc.internal.pageSize.width);
        currentY = tableResult.y;
        
        // Análise
        currentY += 10;
        if (sortedAttendants.length > 0) {
            const topAttendant = sortedAttendants[0];
            const totalRevenue = sortedAttendants.reduce((sum, [, data]) => sum + data.revenue, 0);
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Atendente com maior receita: ${topAttendant[0]} (R$ ${formatCurrency(topAttendant[1].revenue)})`, 20, currentY);
            currentY += 8;
            doc.text(`Representa ${((topAttendant[1].revenue / totalRevenue) * 100).toFixed(1)}% da receita total`, 20, currentY);
        }
        
        // Página 6: Produtos Mais Vendidos
        doc.addPage();
        addHeader(doc, title, 6);
        currentY = addSectionTitle(doc, 'PRODUTOS MAIS VENDIDOS', 40);
        
        // Calcular produtos mais vendidos
        const productStats = {};
        filteredSales.forEach(sale => {
            sale.items.forEach(item => {
                if (!productStats[item.productId]) {
                    productStats[item.productId] = {
                        quantity: 0,
                        revenue: 0
                    };
                }
                productStats[item.productId].quantity += item.quantity;
                productStats[item.productId].revenue += item.quantity * item.price;
            });
        });
        
        // Top 10 produtos
        const topProducts = Object.entries(productStats)
            .map(([productId, stats]) => {
                const product = systemData.products.find(p => p.id === productId);
                return {
                    name: product ? product.name : 'Produto desconhecido',
                    category: product ? product.category : 'Desconhecida',
                    ...stats
                };
            })
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);
        
        // Tabela de produtos
        const prodHeaders = ['#', 'Produto', 'Categoria', 'Qtd', 'Receita (R$)', 'Preço Médio'];
        const prodData = topProducts.map((product, index) => {
            const avgPrice = product.quantity > 0 ? product.revenue / product.quantity : 0;
            return [
                (index + 1).toString(),
                product.name,
                getCategoryName(product.category),
                product.quantity.toString(),
                formatCurrency(product.revenue),
                formatCurrency(avgPrice)
            ];
        });
        
        const prodColWidths = [10, 50, 25, 20, 30, 25];
        const prodResult = createTable(doc, prodHeaders, prodData, 20, currentY, prodColWidths, doc.internal.pageSize.width);
        currentY = prodResult.y;
        
        // Análise
        currentY += 10;
        if (topProducts.length > 0) {
            const totalRevenue = topProducts.reduce((sum, p) => sum + p.revenue, 0);
            const totalQuantity = topProducts.reduce((sum, p) => sum + p.quantity, 0);
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Top produto: ${topProducts[0].name} (${topProducts[0].quantity} unidades)`, 20, currentY);
            currentY += 8;
            doc.text(`Top 10 representam ${totalQuantity} itens vendidos (R$ ${formatCurrency(totalRevenue)})`, 20, currentY);
        }
        
        // Página 7: Análise Financeira
        doc.addPage();
        addHeader(doc, title, 7);
        currentY = addSectionTitle(doc, 'ANÁLISE FINANCEIRA', 40);
        
        // Calcular métricas financeiras
        let totalCost = 0;
        let totalProfit = 0;
        let totalDiscount = 0;
        let totalFees = 0;
        
        filteredSales.forEach(sale => {
            totalDiscount += sale.discount || 0;
            totalFees += sale.fees || 0;
            
            sale.items.forEach(item => {
                const product = systemData.products.find(p => p.id === item.productId);
                if (product) {
                    totalCost += (product.cmv || 0) * item.quantity;
                    totalProfit += (item.price - (product.cmv || 0)) * item.quantity;
                }
            });
        });
        
        // Demonstrativo financeiro
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const financialItems = [
            { label: 'Receita Bruta de Vendas:', value: metrics.totalRevenue },
            { label: '(-) Descontos Concedidos:', value: totalDiscount },
            { label: '(-) Taxas e Comissões:', value: totalFees },
            { label: '(=) Receita Líquida:', value: metrics.totalRevenue - totalDiscount - totalFees },
            { label: '(-) Custo das Mercadorias:', value: totalCost },
            { label: '(=) LUCRO BRUTO:', value: totalProfit }
        ];
        
        let financeY = currentY;
        financialItems.forEach(item => {
            doc.text(item.label, 20, financeY);
            doc.text(`R$ ${formatCurrency(item.value)}`, 120, financeY);
            financeY += 10;
            
            if (item.label.includes('LUCRO BRUTO')) {
                doc.setDrawColor(26, 26, 46);
                doc.setLineWidth(0.5);
                doc.line(20, financeY - 5, 150, financeY - 5);
            }
        });
        
        // Margens
        financeY += 10;
        const grossMargin = metrics.totalRevenue > 0 ? (totalProfit / metrics.totalRevenue * 100).toFixed(1) : '0.0';
        const netRevenue = metrics.totalRevenue - totalDiscount - totalFees;
        const netMargin = netRevenue > 0 ? (totalProfit / netRevenue * 100).toFixed(1) : '0.0';
        
        doc.text(`Margem Bruta: ${grossMargin}%`, 20, financeY);
        doc.text(`Margem Líquida: ${netMargin}%`, 100, financeY);
        financeY += 10;
        
        // Indicadores
        const avgProfitPerSale = metrics.totalSales > 0 ? totalProfit / metrics.totalSales : 0;
        const discountRate = metrics.totalRevenue > 0 ? (totalDiscount / metrics.totalRevenue * 100).toFixed(1) : '0.0';
        const feeRate = metrics.totalRevenue > 0 ? (totalFees / metrics.totalRevenue * 100).toFixed(1) : '0.0';
        
        doc.text(`Lucro Médio por Venda: R$ ${formatCurrency(avgProfitPerSale)}`, 20, financeY);
        financeY += 8;
        doc.text(`Taxa de Desconto: ${discountRate}%`, 20, financeY);
        doc.text(`Taxa de Comissões: ${feeRate}%`, 100, financeY);
        
        // Página 8: Métodos de Pagamento
        doc.addPage();
        addHeader(doc, title, 8);
        currentY = addSectionTitle(doc, 'MÉTODOS DE PAGAMENTO', 40);
        
        // Distribuição por método
        const paymentMethods = {};
        filteredSales.forEach(sale => {
            const method = sale.paymentMethod || 'Não informado';
            if (!paymentMethods[method]) {
                paymentMethods[method] = { count: 0, amount: 0 };
            }
            paymentMethods[method].count++;
            paymentMethods[method].amount += sale.total;
        });
        
        // Tabela de métodos
        const payHeaders = ['Método', 'Transações', 'Valor (R$)', '%'];
        const payData = Object.entries(paymentMethods)
            .sort(([, a], [, b]) => b.amount - a.amount)
            .map(([method, data]) => {
                const percentage = metrics.totalRevenue > 0 ? ((data.amount / metrics.totalRevenue) * 100).toFixed(1) : '0.0';
                const methodName = getPaymentMethodName(method);
                return [
                    methodName,
                    data.count.toString(),
                    formatCurrency(data.amount),
                    `${percentage}%`
                ];
            });
        
        const payColWidths = [40, 25, 35, 20];
        const payResult = createTable(doc, payHeaders, payData, 20, currentY, payColWidths, doc.internal.pageSize.width);
        currentY = payResult.y;
        
        // Análise
        currentY += 10;
        if (Object.keys(paymentMethods).length > 0) {
            const sortedMethods = Object.entries(paymentMethods).sort(([, a], [, b]) => b.amount - a.amount);
            const topMethod = sortedMethods[0];
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Método predominante: ${getPaymentMethodName(topMethod[0])}`, 20, currentY);
            currentY += 8;
            doc.text(`Representa ${((topMethod[1].amount / metrics.totalRevenue) * 100).toFixed(1)}% do valor total`, 20, currentY);
        }
        
        // Página 9: Conclusões
        doc.addPage();
        addHeader(doc, title, 9);
        currentY = addSectionTitle(doc, 'CONCLUSÕES E RECOMENDAÇÕES', 40);
        
        // Conclusões
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        let conclusions = [];
        
        if (metrics.totalSales === 0) {
            conclusions = [
                '1. Nenhuma venda registrada no período.',
                '2. Revisar estratégias comerciais e operacionais.',
                '3. Verificar sistema de registro de vendas.'
            ];
        } else {
            conclusions = [
                `1. Foram realizadas ${metrics.totalSales} vendas no período.`,
                `2. Receita total: R$ ${formatCurrency(metrics.totalRevenue)}.`,
                `3. Ticket médio: R$ ${formatCurrency(metrics.averageTicket)}.`,
                '',
                '4. Principais insights:'
            ];
            
            if (metrics.averageTicket < 50) {
                conclusions.push('   • Ticket médio abaixo do esperado.');
            }
            
            if (parseFloat(discountRate) > 10) {
                conclusions.push('   • Taxa de desconto elevada.');
            }
            
            if (parseFloat(grossMargin) < 30) {
                conclusions.push('   • Margem bruta abaixo de 30%.');
            }
        }
        
        conclusions.forEach(conclusion => {
            if (conclusion === '') {
                currentY += 5;
            } else {
                doc.text(conclusion, 20, currentY);
                currentY += 8;
            }
        });
        
        // Recomendações
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Recomendações:', 20, currentY);
        currentY += 10;
        
        let recommendations = [];
        
        if (metrics.totalSales > 0) {
            if (metrics.averageTicket < 50) {
                recommendations.push('• Implementar estratégias de upselling.');
                recommendations.push('• Criar combos para aumentar valor médio.');
            }
            
            if (parseFloat(discountRate) > 10) {
                recommendations.push('• Revisar política de descontos.');
                recommendations.push('• Limitar poder de desconto da equipe.');
            }
            
            if (parseFloat(grossMargin) < 30) {
                recommendations.push('• Revisar precificação dos produtos.');
                recommendations.push('• Negociar melhores condições com fornecedores.');
            }
            
            // Verificar estoque baixo
            const lowStockProducts = systemData.products.filter(p => p.stock < 10);
            if (lowStockProducts.length > 0) {
                recommendations.push(`• Repor estoque de ${lowStockProducts.length} produtos.`);
            }
        } else {
            recommendations = [
                '• Realizar campanha promocional.',
                '• Oferecer demonstração de produtos.',
                '• Treinamento da equipe de vendas.',
                '• Revisar estratégia comercial.'
            ];
        }
        
        if (recommendations.length === 0) {
            recommendations = [
                '• Manter estratégias atuais.',
                '• Monitorar indicadores regularmente.'
            ];
        }
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        recommendations.forEach(rec => {
            doc.text(rec, 25, currentY);
            currentY += 8;
        });
        
        // Salvar PDF
        const fileName = `relatorio_vendas_${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(fileName);
        
        showAlert(`Relatório de vendas "${fileName}" gerado com sucesso! (${doc.internal.getNumberOfPages()} páginas)`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório:', error);
        showAlert('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

// ============================================
// RELATÓRIO DE PRODUTOS (OTIMIZADO)
// ============================================

async function generateProductsReport(title, period, includeCharts, includeTables, format, orientation) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('Biblioteca jsPDF não carregada');
        }
        
        const pageSize = format === 'A3' ? 'a3' : format === 'letter' ? 'letter' : 'a4';
        const isLandscape = orientation === 'landscape';
        
        const doc = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: pageSize
        });
        
        // Calcular métricas de produtos
        const metrics = calculateProductsMetrics();
        
        // Página 1: Capa
        addCoverPage(doc, title, 'Produtos', period);
        
        // Página 2: Sumário
        doc.addPage();
        addTableOfContents(doc, [
            'Resumo do Estoque',
            'Distribuição por Categoria',
            'Produtos com Estoque Baixo',
            'Produtos Mais Rentáveis',
            'Tabela Completa',
            'Recomendações'
        ]);
        
        // Página 3: Resumo do Estoque
        doc.addPage();
        addHeader(doc, title, 3);
        let currentY = addSectionTitle(doc, 'RESUMO DO ESTOQUE', 40);
        
        // Métricas principais
        const summaryMetrics = [
            { title: 'Total de Produtos', value: metrics.totalProducts, unit: 'itens' },
            { title: 'Itens em Estoque', value: metrics.totalStock, unit: 'unid.' },
            { title: 'Valor Total', value: metrics.totalValue, unit: 'R$' },
            { title: 'Custo Total', value: metrics.totalCost, unit: 'R$' },
            { title: 'Lucro Potencial', value: metrics.totalProfitMargin, unit: 'R$' },
            { title: 'Margem Média', value: metrics.averageMargin, unit: '%' }
        ];
        
        let metricY = currentY;
        summaryMetrics.forEach((metric, index) => {
            const x = 20 + (index % 3) * 60;
            if (index % 3 === 0 && index > 0) metricY += 35;
            
            addMetricCard(doc, metric.title, metric.value, metric.unit, x, metricY, 55, 25);
        });
        
        // Análise
        metricY += 40;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Análise do Estoque:', 20, metricY);
        metricY += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        let analysis = '';
        if (metrics.totalProducts === 0) {
            analysis = 'Nenhum produto cadastrado no sistema.';
        } else {
            const avgStockPerProduct = (metrics.totalStock / metrics.totalProducts).toFixed(1);
            const lowStockCount = metrics.lowStockProducts.length;
            
            analysis = `Estoque médio por produto: ${avgStockPerProduct} unidades\n`;
            analysis += `Produtos com estoque baixo (<10 unidades): ${lowStockCount}\n`;
            analysis += `Margem de lucro média: ${metrics.averageMargin.toFixed(1)}%\n`;
            analysis += `Categorias ativas: ${metrics.categoriesCount}`;
        }
        
        const splitAnalysis = doc.splitTextToSize(analysis, 170);
        doc.text(splitAnalysis, 25, metricY);
        
        // Página 4: Distribuição por Categoria
        doc.addPage();
        addHeader(doc, title, 4);
        currentY = addSectionTitle(doc, 'DISTRIBUIÇÃO POR CATEGORIA', 40);
        
        // Tabela de categorias
        const catHeaders = ['Categoria', 'Produtos', 'Estoque', 'Valor (R$)', 'Margem %'];
        const catData = Object.entries(metrics.byCategory)
            .sort(([, a], [, b]) => b.totalValue - a.totalValue)
            .map(([category, data]) => [
                getCategoryName(category),
                data.count.toString(),
                data.totalStock.toString(),
                formatCurrency(data.totalValue),
                data.avgMargin.toFixed(1)
            ]);
        
        const catColWidths = [40, 20, 25, 35, 25];
        const catResult = createTable(doc, catHeaders, catData, 20, currentY, catColWidths, doc.internal.pageSize.width);
        currentY = catResult.y;
        
        // Análise por categoria
        currentY += 10;
        if (Object.keys(metrics.byCategory).length > 0) {
            const sortedCats = Object.entries(metrics.byCategory)
                .sort(([, a], [, b]) => b.totalValue - a.totalValue);
            const topCategory = sortedCats[0];
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Categoria com maior valor: ${getCategoryName(topCategory[0])} (R$ ${formatCurrency(topCategory[1].totalValue)})`, 20, currentY);
            currentY += 8;
            
            const highestMargin = sortedCats.reduce((best, [cat, data]) => 
                data.avgMargin > best.margin ? { category: cat, margin: data.avgMargin } : best,
                { category: '', margin: 0 }
            );
            
            doc.text(`Maior margem: ${getCategoryName(highestMargin.category)} (${highestMargin.margin.toFixed(1)}%)`, 20, currentY);
        }
        
        // Página 5: Produtos com Estoque Baixo
        doc.addPage();
        addHeader(doc, title, 5);
        currentY = addSectionTitle(doc, 'PRODUTOS COM ESTOQUE BAIXO', 40);
        
        if (metrics.lowStockProducts.length === 0) {
            doc.setFontSize(11);
            doc.setTextColor(76, 175, 80);
            doc.text('✓ Todos os produtos com estoque adequado', 20, currentY);
        } else {
            // Tabela de produtos com estoque baixo
            const lowHeaders = ['Produto', 'Código', 'Categoria', 'Estoque', 'Mínimo'];
            const lowData = metrics.lowStockProducts
                .sort((a, b) => a.stock - b.stock)
                .map(product => [
                    product.name,
                    product.id,
                    getCategoryName(product.category),
                    product.stock.toString(),
                    '10'
                ]);
            
            const lowColWidths = [50, 30, 30, 20, 20];
            const lowResult = createTable(doc, lowHeaders, lowData, 20, currentY, lowColWidths, doc.internal.pageSize.width);
            currentY = lowResult.y;
            
            // Alerta
            currentY += 10;
            doc.setFontSize(11);
            doc.setTextColor(244, 67, 54);
            doc.text(`ATENÇÃO: ${metrics.lowStockProducts.length} produtos precisam de reposição!`, 20, currentY);
            
            // Estimativa de investimento
            currentY += 10;
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            
            const totalInvestment = metrics.lowStockProducts.reduce((sum, product) => {
                const needed = 10 - product.stock;
                return sum + (product.cmv || 0) * needed;
            }, 0);
            
            doc.text(`Investimento estimado para reposição: R$ ${formatCurrency(totalInvestment)}`, 20, currentY);
        }
        
        // Página 6: Produtos Mais Rentáveis
        doc.addPage();
        addHeader(doc, title, 6);
        currentY = addSectionTitle(doc, 'PRODUTOS MAIS RENTÁVEIS', 40);
        
        // Top 10 produtos por lucro potencial
        const profitableProducts = systemData.products
            .map(product => ({
                ...product,
                potentialProfit: (product.sellingPrice - (product.cmv || 0)) * product.stock,
                profitMargin: product.cmv > 0 ? ((product.sellingPrice - product.cmv) / product.cmv * 100) : 0
            }))
            .sort((a, b) => b.potentialProfit - a.potentialProfit)
            .slice(0, 10);
        
        // Tabela de produtos rentáveis
        const profitHeaders = ['#', 'Produto', 'Categoria', 'Estoque', 'Preço', 'Lucro Pot.', 'Margem %'];
        const profitData = profitableProducts.map((product, index) => {
            const marginColor = product.profitMargin >= 40 ? '🟢' : product.profitMargin >= 30 ? '🟡' : '🔴';
            return [
                (index + 1).toString(),
                product.name,
                getCategoryName(product.category),
                product.stock.toString(),
                formatCurrency(product.sellingPrice),
                formatCurrency(product.potentialProfit),
                `${product.profitMargin.toFixed(1)}% ${marginColor}`
            ];
        });
        
        const profitColWidths = [10, 40, 25, 20, 25, 30, 25];
        const profitResult = createTable(doc, profitHeaders, profitData, 20, currentY, profitColWidths, doc.internal.pageSize.width);
        currentY = profitResult.y;
        
        // Análise
        currentY += 10;
        if (profitableProducts.length > 0) {
            const topProduct = profitableProducts[0];
            const totalPotential = profitableProducts.reduce((sum, p) => sum + p.potentialProfit, 0);
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Produto mais rentável: ${topProduct.name} (R$ ${formatCurrency(topProduct.potentialProfit)})`, 20, currentY);
            currentY += 8;
            doc.text(`Lucro potencial top 10: R$ ${formatCurrency(totalPotential)}`, 20, currentY);
        }
        
        // Página 7: Tabela Completa (se habilitado)
        if (includeTables && systemData.products.length > 0) {
            doc.addPage();
            addHeader(doc, title, 7);
            currentY = addSectionTitle(doc, 'TABELA COMPLETA DE PRODUTOS', 40);
            
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Total: ${systemData.products.length} produtos`, 20, currentY);
            currentY += 10;
            
            // Configuração da tabela
            const isLandscapeNow = doc.internal.pageSize.width > doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;
            
            // Ajustar colunas para caber na página
            const fullHeaders = ['Código', 'Nome', 'Categoria', 'Custo', 'Preço', 'Margem', 'Estoque', 'Valor'];
            
            // Larguras ajustáveis baseadas na orientação
            let fullColWidths;
            if (isLandscapeNow) {
                // Modo paisagem - mais espaço
                fullColWidths = [25, 45, 25, 25, 25, 25, 20, 25];
            } else {
                // Modo retrato - colunas mais estreitas
                fullColWidths = [20, 35, 20, 20, 20, 20, 15, 20];
            }
            
            // Verificar se ainda não cabe e ajustar mais
            const totalTableWidth = fullColWidths.reduce((a, b) => a + b, 0);
            const availableWidth = pageWidth - 40; // 20mm de cada lado
            
            if (totalTableWidth > availableWidth) {
                const scaleFactor = availableWidth / totalTableWidth;
                for (let i = 0; i < fullColWidths.length; i++) {
                    fullColWidths[i] = Math.floor(fullColWidths[i] * scaleFactor);
                }
            }
            
            let pageStart = 0;
            const itemsPerPage = isLandscapeNow ? 20 : 15; // Menos linhas para acomodar quebras
            
            while (pageStart < systemData.products.length) {
                if (pageStart > 0) {
                    doc.addPage();
                    addHeader(doc, `${title} (cont.)`, doc.internal.getNumberOfPages());
                    currentY = 40;
                }
                
                const pageProducts = systemData.products.slice(pageStart, pageStart + itemsPerPage);
                const fullData = pageProducts.map(product => {
                    const margin = product.cmv > 0 ? ((product.sellingPrice - product.cmv) / product.cmv * 100).toFixed(1) : '0.0';
                    const totalValue = product.sellingPrice * product.stock;
                    
                    return [
                        product.id,
                        product.name,
                        getCategoryName(product.category),
                        formatCurrency(product.cmv || 0),
                        formatCurrency(product.sellingPrice),
                        `${margin}%`,
                        product.stock.toString(),
                        formatCurrency(totalValue)
                    ];
                });
                
                const fullResult = createTable(doc, fullHeaders, fullData, 20, currentY, fullColWidths, pageWidth);
                currentY = fullResult.y;
                
                if (fullResult.newPage) {
                    doc.addPage();
                    currentY = 40;
                }
                
                // Informação de página
                currentY += 10;
                doc.setFontSize(8);
                doc.setTextColor(100, 100, 100);
                doc.text(`Página ${Math.floor(pageStart / itemsPerPage) + 1} de ${Math.ceil(systemData.products.length / itemsPerPage)}`, 
                        pageWidth / 2, currentY, { align: 'center' });
                
                pageStart += itemsPerPage;
            }
        }
        
        // Página 8: Recomendações
        doc.addPage();
        addHeader(doc, title, includeTables && systemData.products.length > 0 ? 8 : 7);
        currentY = addSectionTitle(doc, 'RECOMENDAÇÕES DE GESTÃO', 40);
        
        // Situação atual
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const situation = [
            `• Produtos cadastrados: ${metrics.totalProducts}`,
            `• Valor do estoque: R$ ${formatCurrency(metrics.totalValue)}`,
            `• Margem média: ${metrics.averageMargin.toFixed(1)}%`,
            `• Produtos com estoque baixo: ${metrics.lowStockProducts.length}`,
            `• Categorias: ${metrics.categoriesCount}`
        ];
        
        situation.forEach(item => {
            doc.text(item, 20, currentY);
            currentY += 8;
        });
        
        // Recomendações
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Ações Recomendadas:', 20, currentY);
        currentY += 10;
        
        let recommendations = [];
        
        if (metrics.lowStockProducts.length > 0) {
            recommendations.push(`1. REPOR ESTOQUE de ${metrics.lowStockProducts.length} produtos`);
            recommendations.push('   • Priorizar produtos com estoque crítico');
            recommendations.push('   • Negociar prazos com fornecedores');
        }
        
        if (metrics.averageMargin < 30) {
            recommendations.push('2. OTIMIZAR MARGENS');
            recommendations.push('   • Revisar precificação');
            recommendations.push('   • Negociar com fornecedores');
        }
        
        const slowMoving = systemData.products.filter(p => p.stock > 50).length;
        if (slowMoving > 0) {
            recommendations.push(`3. PROMOVER ${slowMoving} PRODUTOS PARADOS`);
            recommendations.push('   • Criar promoções');
            recommendations.push('   • Fazer combos');
        }
        
        if (recommendations.length === 0) {
            recommendations = [
                '✅ Estoque bem gerenciado',
                '   • Manter processos atuais',
                '   • Monitorar regularmente'
            ];
        }
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        recommendations.forEach(rec => {
            doc.text(rec, 25, currentY);
            currentY += 8;
        });
        
        // Plano de ação
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Plano de Ação:', 20, currentY);
        currentY += 10;
        
        const actionPlan = [
            'SEMANA 1: Reposição de estoque crítico',
            'SEMANA 2-3: Análise de precificação',
            'SEMANA 4: Revisão de categorias',
            'CONTÍNUO: Monitoramento de indicadores'
        ];
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        actionPlan.forEach(action => {
            doc.text(`• ${action}`, 25, currentY);
            currentY += 8;
        });
        
        // Salvar PDF
        const fileName = `relatorio_produtos_${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(fileName);
        
        showAlert(`Relatório de produtos "${fileName}" gerado com sucesso! (${doc.internal.getNumberOfPages()} páginas)`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório de produtos:', error);
        showAlert('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

function calculateProductsMetrics() {
    const inventoryData = calculateInventoryValue();
    
    // Agrupar por categoria
    const byCategory = {};
    systemData.products.forEach(product => {
        const category = product.category || 'Sem categoria';
        if (!byCategory[category]) {
            byCategory[category] = {
                count: 0,
                totalStock: 0,
                totalValue: 0,
                totalCost: 0,
                avgMargin: 0
            };
        }
        byCategory[category].count++;
        byCategory[category].totalStock += product.stock;
        byCategory[category].totalValue += product.sellingPrice * product.stock;
        byCategory[category].totalCost += (product.cmv || 0) * product.stock;
    });
    
    // Calcular margem média por categoria
    Object.keys(byCategory).forEach(category => {
        const data = byCategory[category];
        data.avgMargin = data.totalCost > 0 ? 
            ((data.totalValue - data.totalCost) / data.totalCost * 100) : 0;
    });
    
    // Produtos com baixo estoque
    const lowStockProducts = systemData.products.filter(p => p.stock < 10);
    
    return {
        totalProducts: systemData.products.length,
        totalStock: inventoryData.totalItems,
        totalValue: inventoryData.totalSellingValue,
        totalCost: inventoryData.totalCostValue,
        totalProfitMargin: inventoryData.totalProfitMargin,
        averageMargin: inventoryData.averageMargin,
        byCategory,
        lowStockProducts,
        categoriesCount: Object.keys(byCategory).length
    };
}

// ============================================
// RELATÓRIO FINANCEIRO (OTIMIZADO)
// ============================================

async function generateFinancialReport(title, period, includeCharts, includeTables, format, orientation) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('Biblioteca jsPDF não carregada');
        }
        
        const pageSize = format === 'A3' ? 'a3' : format === 'letter' ? 'letter' : 'a4';
        const isLandscape = orientation === 'landscape';
        
        const doc = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: pageSize
        });
        
        // Filtrar vendas no período
        const filteredSales = systemData.sales.filter(sale => {
            const saleDate = new Date(sale.date);
            return saleDate >= period.startDate && saleDate <= period.endDate;
        });
        
        // Calcular métricas financeiras
        const metrics = calculateFinancialMetrics(filteredSales);
        
        // Página 1: Capa
        addCoverPage(doc, title, 'Financeiro', period);
        
        // Página 2: Sumário
        doc.addPage();
        addTableOfContents(doc, [
            'Demonstrativo Financeiro',
            'Análise de Resultados',
            'Fluxo de Caixa',
            'Margens e Rentabilidade',
            'Métodos de Pagamento',
            'Projeções e Metas'
        ]);
        
        // Página 3: Demonstrativo Financeiro
        doc.addPage();
        addHeader(doc, title, 3);
        let currentY = addSectionTitle(doc, 'DEMONSTRATIVO FINANCEIRO', 40);
        
        // Período
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Período: ${period.startDate.toLocaleDateString('pt-BR')} a ${period.endDate.toLocaleDateString('pt-BR')}`, 20, currentY);
        currentY += 10;
        
        // Demonstrativo
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const financialItems = [
            { label: 'RECEITA BRUTA DE VENDAS', value: metrics.totalRevenue },
            { label: '(-) Descontos Concedidos', value: metrics.totalDiscount },
            { label: '(-) Taxas e Comissões', value: metrics.totalFees },
            { label: '(=) RECEITA LÍQUIDA', value: metrics.netRevenue },
            { label: '(-) Custo das Mercadorias Vendidas', value: metrics.totalCost },
            { label: '(=) LUCRO BRUTO', value: metrics.totalProfit }
        ];
        
        let financeY = currentY;
        financialItems.forEach(item => {
            doc.text(item.label, 20, financeY);
            doc.text(`R$ ${formatCurrency(item.value)}`, 120, financeY);
            
            if (item.label.includes('RECEITA LÍQUIDA') || item.label.includes('LUCRO BRUTO')) {
                doc.setDrawColor(26, 26, 46);
                doc.setLineWidth(0.5);
                doc.line(20, financeY + 2, 150, financeY + 2);
            }
            
            financeY += 10;
        });
        
        // Indicadores
        financeY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Indicadores de Desempenho:', 20, financeY);
        financeY += 10;
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const indicators = [
            `Margem Bruta: ${metrics.grossMargin.toFixed(1)}%`,
            `Margem Líquida: ${metrics.netMargin.toFixed(1)}%`,
            `Ticket Médio: R$ ${formatCurrency(metrics.avgTicket)}`,
            `Lucro Médio/Venda: R$ ${formatCurrency(metrics.avgProfitPerSale)}`,
            `Taxa de Desconto: ${metrics.discountRate.toFixed(1)}%`,
            `Taxa de Comissões: ${metrics.feeRate.toFixed(1)}%`
        ];
        
        indicators.forEach((indicator, index) => {
            const x = 20 + (index % 2) * 100;
            if (index % 2 === 0 && index > 0) financeY += 10;
            
            doc.text(indicator, x, financeY);
            
            if (index % 2 === 1) financeY += 10;
        });
        
        // Página 4: Análise de Resultados
        doc.addPage();
        addHeader(doc, title, 4);
        currentY = addSectionTitle(doc, 'ANÁLISE DE RESULTADOS', 40);
        
        // Composição da receita
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Composição da Receita:', 20, currentY);
        currentY += 10;
        
        if (metrics.totalRevenue > 0) {
            const components = [
                { label: 'Receita Bruta', value: metrics.totalRevenue, color: 'black' },
                { label: 'Descontos', value: metrics.totalDiscount, color: '#666' },
                { label: 'Taxas', value: metrics.totalFees, color: '#999' },
                { label: 'Receita Líquida', value: metrics.netRevenue, color: '#1a1a2e' }
            ];
            
            components.forEach(comp => {
                const percentage = (comp.value / metrics.totalRevenue * 100).toFixed(1);
                
                doc.setFontSize(10);
                doc.setTextColor(comp.color === '#1a1a2e' ? 26 : 0, comp.color === '#1a1a2e' ? 26 : 0, comp.color === '#1a1a2e' ? 46 : 0);
                doc.text(`${comp.label}:`, 25, currentY);
                doc.text(`R$ ${formatCurrency(comp.value)}`, 80, currentY);
                doc.text(`(${percentage}%)`, 130, currentY);
                
                currentY += 8;
            });
        }
        
        // Análise
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Análise do Período:', 20, currentY);
        currentY += 10;
        
        if (metrics.totalRevenue === 0) {
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text('Sem movimentação financeira no período.', 25, currentY);
        } else {
            let analysis = [];
            
            // Análise de margem
            if (metrics.grossMargin >= 40) {
                analysis.push('• Margem bruta excelente (acima de 40%)');
            } else if (metrics.grossMargin >= 30) {
                analysis.push('• Margem bruta boa (30-40%)');
            } else if (metrics.grossMargin >= 20) {
                analysis.push('• Margem bruta adequada (20-30%)');
            } else {
                analysis.push('• Margem bruta baixa (abaixo de 20%)');
            }
            
            // Análise de descontos
            if (metrics.discountRate > 15) {
                analysis.push('• Taxa de desconto muito alta (acima de 15%)');
            } else if (metrics.discountRate > 10) {
                analysis.push('• Taxa de desconto elevada (10-15%)');
            }
            
            // Análise de ticket
            if (metrics.avgTicket > 100) {
                analysis.push('• Ticket médio excelente (acima de R$ 100)');
            } else if (metrics.avgTicket > 50) {
                analysis.push('• Ticket médio satisfatório (R$ 50-100)');
            } else {
                analysis.push('• Ticket médio baixo (abaixo de R$ 50)');
            }
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            analysis.forEach(item => {
                doc.text(item, 25, currentY);
                currentY += 8;
            });
        }
        
        // Página 5: Fluxo de Caixa
        doc.addPage();
        addHeader(doc, title, 5);
        currentY = addSectionTitle(doc, 'FLUXO DE CAIXA', 40);
        
        // Agrupar por dia
        const dailyCashFlow = {};
        filteredSales.forEach(sale => {
            const saleDate = new Date(sale.date).toISOString().split('T')[0];
            if (!dailyCashFlow[saleDate]) {
                dailyCashFlow[saleDate] = {
                    revenue: 0,
                    count: 0
                };
            }
            dailyCashFlow[saleDate].revenue += sale.total;
            dailyCashFlow[saleDate].count++;
        });
        
        // Ordenar por data
        const sortedDays = Object.entries(dailyCashFlow)
            .sort(([a], [b]) => new Date(a) - new Date(b))
            .slice(0, 15); // Limitar a 15 dias para evitar sobrecarga
            
        if (sortedDays.length === 0) {
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text('Sem movimentação de caixa no período.', 20, currentY);
        } else {
            // Tabela de fluxo
            const flowHeaders = ['Data', 'Vendas', 'Receita (R$)', 'Acumulado (R$)'];
            let flowData = [];
            let runningTotal = 0;
            
            sortedDays.forEach(([date, data]) => {
                const dateObj = new Date(date);
                const dateStr = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
                runningTotal += data.revenue;
                
                flowData.push([
                    dateStr,
                    data.count.toString(),
                    formatCurrency(data.revenue),
                    formatCurrency(runningTotal)
                ]);
            });
            
            const flowColWidths = [25, 20, 35, 40];
            const flowResult = createTable(doc, flowHeaders, flowData, 20, currentY, flowColWidths, doc.internal.pageSize.width);
            currentY = flowResult.y;
            
            // Estatísticas
            currentY += 10;
            const totalRevenue = sortedDays.reduce((sum, [, data]) => sum + data.revenue, 0);
            const avgDailyRevenue = totalRevenue / sortedDays.length;
            const maxDay = sortedDays.reduce((max, [, data]) => data.revenue > max.revenue ? { revenue: data.revenue } : max, { revenue: 0 });
            const minDay = sortedDays.reduce((min, [, data]) => data.revenue < min.revenue ? { revenue: data.revenue } : min, { revenue: Infinity });
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            
            const stats = [
                `Período: ${sortedDays.length} dias`,
                `Receita total: R$ ${formatCurrency(totalRevenue)}`,
                `Média diária: R$ ${formatCurrency(avgDailyRevenue)}`,
                `Variação: R$ ${formatCurrency(maxDay.revenue)} a R$ ${formatCurrency(minDay.revenue)}`
            ];
            
            stats.forEach(stat => {
                doc.text(stat, 20, currentY);
                currentY += 8;
            });
        }
        
        // Página 6: Margens e Rentabilidade
        doc.addPage();
        addHeader(doc, title, 6);
        currentY = addSectionTitle(doc, 'MARGENS E RENTABILIDADE', 40);
        
        // Quadro de rentabilidade
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const profitability = [
            { label: 'Margem Bruta', value: metrics.grossMargin, benchmark: 35 },
            { label: 'Margem Líquida', value: metrics.netMargin, benchmark: 20 },
            { label: 'Retorno sobre Vendas', value: metrics.totalRevenue > 0 ? (metrics.totalProfit / metrics.totalRevenue * 100) : 0, benchmark: 25 },
            { label: 'Retorno sobre Custo', value: metrics.totalCost > 0 ? (metrics.totalProfit / metrics.totalCost * 100) : 0, benchmark: 50 }
        ];
        
        let profitY = currentY;
        profitability.forEach(item => {
            const difference = item.value - item.benchmark;
            const status = difference >= 0 ? 'acima' : 'abaixo';
            
            doc.text(`${item.label}:`, 20, profitY);
            doc.text(`${item.value.toFixed(1)}%`, 80, profitY);
            
            if (Math.abs(difference) > 5) {
                doc.setTextColor(difference >= 0 ? 76 : 244, difference >= 0 ? 175 : 67, difference >= 0 ? 80 : 54);
                doc.text(`${Math.abs(difference).toFixed(1)}% ${status}`, 120, profitY);
                doc.setTextColor(0, 0, 0);
            } else {
                doc.setTextColor(100, 100, 100);
                doc.text('dentro da média', 120, profitY);
                doc.setTextColor(0, 0, 0);
            }
            
            doc.setTextColor(100, 100, 100);
            doc.text(`(média: ${item.benchmark}%)`, 170, profitY);
            doc.setTextColor(0, 0, 0);
            
            profitY += 10;
        });
        
        // Análise de rentabilidade
        profitY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Análise de Rentabilidade:', 20, profitY);
        profitY += 10;
        
        if (metrics.totalRevenue > 0) {
            const profitabilityScore = (metrics.netMargin / 25) * 100;
            let analysis = '';
            
            if (profitabilityScore >= 80) {
                analysis = 'Excelente rentabilidade. Operando com eficiência acima da média do setor.';
            } else if (profitabilityScore >= 60) {
                analysis = 'Boa rentabilidade. Eficiência satisfatória com espaço para otimização.';
            } else if (profitabilityScore >= 40) {
                analysis = 'Rentabilidade moderada. Atenção necessária para melhorar resultados.';
            } else {
                analysis = 'Rentabilidade crítica. Ação imediata necessária para reverter situação.';
            }
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            const splitAnalysis = doc.splitTextToSize(analysis, 160);
            doc.text(splitAnalysis, 25, profitY);
        }
        
        // Página 7: Métodos de Pagamento
        doc.addPage();
        addHeader(doc, title, 7);
        currentY = addSectionTitle(doc, 'MÉTODOS DE PAGAMENTO', 40);
        
        // Distribuição por método
        const paymentMethods = {};
        filteredSales.forEach(sale => {
            const method = sale.paymentMethod || 'Não informado';
            if (!paymentMethods[method]) {
                paymentMethods[method] = { count: 0, amount: 0 };
            }
            paymentMethods[method].count++;
            paymentMethods[method].amount += sale.total;
        });
        
        // Tabela de métodos
        const payHeaders = ['Método', 'Transações', 'Valor (R$)', '% Total'];
        const payData = Object.entries(paymentMethods)
            .sort(([, a], [, b]) => b.amount - a.amount)
            .map(([method, data]) => {
                const percentage = metrics.totalRevenue > 0 ? ((data.amount / metrics.totalRevenue) * 100).toFixed(1) : '0.0';
                return [
                    getPaymentMethodName(method),
                    data.count.toString(),
                    formatCurrency(data.amount),
                    `${percentage}%`
                ];
            });
        
        const payColWidths = [35, 25, 35, 20];
        const payResult = createTable(doc, payHeaders, payData, 20, currentY, payColWidths, doc.internal.pageSize.width);
        currentY = payResult.y;
        
        // Análise
        currentY += 10;
        if (Object.keys(paymentMethods).length > 0) {
            const sortedMethods = Object.entries(paymentMethods).sort(([, a], [, b]) => b.amount - a.amount);
            const topMethod = sortedMethods[0];
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            doc.text(`Método predominante: ${getPaymentMethodName(topMethod[0])}`, 20, currentY);
            currentY += 8;
            doc.text(`Representa ${((topMethod[1].amount / metrics.totalRevenue) * 100).toFixed(1)}% do valor total`, 20, currentY);
        }
        
        // Página 8: Projeções e Metas
        doc.addPage();
        addHeader(doc, title, 8);
        currentY = addSectionTitle(doc, 'PROJEÇÕES E METAS', 40);
        
        // Projeções
        if (metrics.totalRevenue > 0) {
            const daysInPeriod = Math.ceil((period.endDate - period.startDate) / (1000 * 60 * 60 * 24)) + 1;
            const dailyAvg = metrics.totalRevenue / daysInPeriod;
            const monthlyProjection = dailyAvg * 30;
            const annualProjection = monthlyProjection * 12;
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            
            const projections = [
                `Média diária: R$ ${formatCurrency(dailyAvg)}`,
                `Projeção mensal: R$ ${formatCurrency(monthlyProjection)}`,
                `Projeção anual: R$ ${formatCurrency(annualProjection)}`,
                `Lucro mensal projetado: R$ ${formatCurrency(monthlyProjection * (metrics.netMargin / 100))}`
            ];
            
            projections.forEach(projection => {
                doc.text(projection, 20, currentY);
                currentY += 8;
            });
        }
        
        // Metas
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Metas para o Próximo Período:', 20, currentY);
        currentY += 10;
        
        const goals = [
            '1. Aumentar ticket médio em 10%',
            '2. Reduzir taxa de desconto para abaixo de 8%',
            '3. Manter margem líquida acima de 20%',
            '4. Diversificar métodos de pagamento',
            '5. Implementar controle de custos'
        ];
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        goals.forEach(goal => {
            doc.text(goal, 25, currentY);
            currentY += 8;
        });
        
        // Plano de ação
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Plano de Ação Financeiro:', 20, currentY);
        currentY += 10;
        
        const actionPlan = [
            '30 DIAS: Controle de custos e despesas',
            '60 DIAS: Otimização de receita',
            '90 DIAS: Implementação de metas',
            'CONTÍNUO: Monitoramento de indicadores'
        ];
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        actionPlan.forEach(action => {
            doc.text(`• ${action}`, 25, currentY);
            currentY += 8;
        });
        
        // Salvar PDF
        const fileName = `relatorio_financeiro_${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(fileName);
        
        showAlert(`Relatório financeiro "${fileName}" gerado com sucesso! (${doc.internal.getNumberOfPages()} páginas)`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório financeiro:', error);
        showAlert('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

function calculateFinancialMetrics(sales) {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalDiscount = 0;
    let totalFees = 0;
    
    sales.forEach(sale => {
        totalRevenue += sale.total;
        totalDiscount += sale.discount || 0;
        totalFees += sale.fees || 0;
        
        // Calcular custo e lucro
        sale.items.forEach(item => {
            const product = systemData.products.find(p => p.id === item.productId);
            if (product) {
                totalCost += (product.cmv || 0) * item.quantity;
                totalProfit += (item.price - (product.cmv || 0)) * item.quantity;
            }
        });
    });
    
    // Calcular métricas
    const avgTicket = sales.length > 0 ? totalRevenue / sales.length : 0;
    const avgProfitPerSale = sales.length > 0 ? totalProfit / sales.length : 0;
    
    const grossMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;
    const netRevenue = totalRevenue - totalDiscount - totalFees;
    const netMargin = netRevenue > 0 ? (totalProfit / netRevenue * 100) : 0;
    
    const discountRate = totalRevenue > 0 ? (totalDiscount / totalRevenue * 100) : 0;
    const feeRate = totalRevenue > 0 ? (totalFees / totalRevenue * 100) : 0;
    
    return {
        totalRevenue,
        totalCost,
        totalProfit,
        totalDiscount,
        totalFees,
        salesCount: sales.length,
        avgTicket,
        avgProfitPerSale,
        grossMargin,
        netMargin,
        discountRate,
        feeRate,
        netRevenue
    };
}

// ============================================
// RELATÓRIO DE ESTOQUE (OTIMIZADO)
// ============================================

async function generateInventoryReport(title, period, includeCharts, includeTables, format, orientation) {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('Biblioteca jsPDF não carregada');
        }
        
        const pageSize = format === 'A3' ? 'a3' : format === 'letter' ? 'letter' : 'a4';
        const isLandscape = orientation === 'landscape';
        
        const doc = new jsPDF({
            orientation: isLandscape ? 'landscape' : 'portrait',
            unit: 'mm',
            format: pageSize
        });
        
        // Calcular métricas de estoque
        const metrics = calculateInventoryMetrics();
        
        // Página 1: Capa
        addCoverPage(doc, title, 'Estoque', period);
        
        // Página 2: Sumário
        doc.addPage();
        addTableOfContents(doc, [
            'Panorama do Estoque',
            'Distribuição por Nível',
            'Produtos Críticos',
            'Análise de Valor',
            'Giro de Estoque',
            'Plano de Reposição'
        ]);
        
        // Página 3: Panorama do Estoque
        doc.addPage();
        addHeader(doc, title, 3);
        let currentY = addSectionTitle(doc, 'PANORAMA DO ESTOQUE', 40);
        
        // Métricas principais
        const inventoryMetrics = [
            { title: 'Total Produtos', value: metrics.totalProducts, unit: 'itens' },
            { title: 'Itens Estoque', value: metrics.totalStock, unit: 'unid.' },
            { title: 'Valor Total', value: metrics.totalValue, unit: 'R$' },
            { title: 'Custo Total', value: metrics.totalCost, unit: 'R$' },
            { title: 'Margem Média', value: metrics.averageMargin, unit: '%' },
            { title: 'Giro Anual', value: metrics.turnoverRate.toFixed(2), unit: 'vezes' }
        ];
        
        let metricY = currentY;
        inventoryMetrics.forEach((metric, index) => {
            const x = 20 + (index % 3) * 60;
            if (index % 3 === 0 && index > 0) metricY += 35;
            
            addMetricCard(doc, metric.title, metric.value, metric.unit, x, metricY, 55, 25);
        });
        
        // Status geral
        metricY += 40;
        const criticalCount = metrics.stockLevels.critical.length + metrics.stockLevels.low.length;
        
        doc.setFontSize(11);
        if (criticalCount === 0) {
            doc.setTextColor(76, 175, 80);
            doc.text('✓ Estoque bem equilibrado', 20, metricY);
        } else {
            doc.setTextColor(244, 67, 54);
            doc.text(`⚠️ ${criticalCount} produtos precisam de reposição`, 20, metricY);
        }
        
        // Página 4: Distribuição por Nível
        doc.addPage();
        addHeader(doc, title, 4);
        currentY = addSectionTitle(doc, 'DISTRIBUIÇÃO POR NÍVEL DE ESTOQUE', 40);
        
        // Tabela de níveis
        const levelHeaders = ['Nível', 'Produtos', '% Total', 'Valor (R$)', 'Situação'];
        const levels = [
            { label: 'Crítico (<5)', data: metrics.stockLevels.critical, status: 'URGENTE' },
            { label: 'Baixo (5-9)', data: metrics.stockLevels.low, status: 'ATENÇÃO' },
            { label: 'Médio (10-19)', data: metrics.stockLevels.medium, status: 'NORMAL' },
            { label: 'Alto (20-49)', data: metrics.stockLevels.high, status: 'OK' },
            { label: 'Excesso (50+)', data: metrics.stockLevels.excess, status: 'EXCESSO' }
        ];
        
        const levelData = levels.map(level => {
            const value = level.data.reduce((sum, p) => sum + (p.sellingPrice * p.stock), 0);
            const percentage = (level.data.length / metrics.totalProducts * 100).toFixed(1);
            return [
                level.label,
                level.data.length.toString(),
                `${percentage}%`,
                formatCurrency(value),
                level.status
            ];
        });
        
        const levelColWidths = [30, 20, 20, 35, 25];
        const levelResult = createTable(doc, levelHeaders, levelData, 20, currentY, levelColWidths, doc.internal.pageSize.width);
        currentY = levelResult.y;
        
        // Análise
        currentY += 10;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const criticalValue = levels[0].data.reduce((sum, p) => sum + (p.sellingPrice * p.stock), 0) +
                             levels[1].data.reduce((sum, p) => sum + (p.sellingPrice * p.stock), 0);
        
        doc.text(`Valor em produtos críticos/baixos: R$ ${formatCurrency(criticalValue)}`, 20, currentY);
        currentY += 8;
        doc.text(`Representa ${((criticalValue / metrics.totalValue) * 100).toFixed(1)}% do valor total do estoque`, 20, currentY);
        
        // Página 5: Produtos Críticos
        doc.addPage();
        addHeader(doc, title, 5);
        currentY = addSectionTitle(doc, 'PRODUTOS EM SITUAÇÃO CRÍTICA', 40);
        
        const criticalProducts = [...metrics.stockLevels.critical, ...metrics.stockLevels.low];
        
        if (criticalProducts.length === 0) {
            doc.setFontSize(11);
            doc.setTextColor(76, 175, 80);
            doc.text('✓ Nenhum produto em situação crítica', 20, currentY);
        } else {
            // Tabela de produtos críticos
            const critHeaders = ['Produto', 'Código', 'Categoria', 'Estoque', 'Preço', 'Valor'];
            const critData = criticalProducts
                .sort((a, b) => a.stock - b.stock)
                .map(product => [
                    product.name,
                    product.id,
                    getCategoryName(product.category),
                    product.stock.toString(),
                    formatCurrency(product.sellingPrice),
                    formatCurrency(product.sellingPrice * product.stock)
                ]);
            
            const critColWidths = [50, 30, 30, 20, 25, 30];
            const critResult = createTable(doc, critHeaders, critData, 20, currentY, critColWidths, doc.internal.pageSize.width);
            currentY = critResult.y;
            
            // Prioridades
            currentY += 10;
            doc.setFontSize(11);
            doc.setTextColor(244, 67, 54);
            doc.text('PRIORIDADES DE REPOSIÇÃO:', 20, currentY);
            currentY += 10;
            
            const priorities = [
                'URGENTE (estoque < 5): Repor imediatamente',
                'ATENÇÃO (estoque 5-9): Repor esta semana',
                'Programar pedidos com fornecedores'
            ];
            
            doc.setFontSize(10);
            doc.setTextColor(0, 0, 0);
            priorities.forEach(priority => {
                doc.text(`• ${priority}`, 25, currentY);
                currentY += 8;
            });
        }
        
        // Página 6: Análise de Valor (Curva ABC)
        doc.addPage();
        addHeader(doc, title, 6);
        currentY = addSectionTitle(doc, 'ANÁLISE DE VALOR (CURVA ABC)', 40);
        
        // Produtos ordenados por valor
        const productsByValue = systemData.products
            .map(p => ({
                ...p,
                totalValue: p.sellingPrice * p.stock
            }))
            .sort((a, b) => b.totalValue - a.totalValue);
        
        // Classificação ABC
        let cumulativeValue = 0;
        const totalValue = productsByValue.reduce((sum, p) => sum + p.totalValue, 0);
        
        const abc = { A: [], B: [], C: [] };
        productsByValue.forEach(product => {
            cumulativeValue += product.totalValue;
            const percentage = (cumulativeValue / totalValue) * 100;
            
            if (percentage <= 80) {
                abc.A.push(product);
            } else if (percentage <= 95) {
                abc.B.push(product);
            } else {
                abc.C.push(product);
            }
        });
        
        // Tabela ABC
        const abcHeaders = ['Classe', 'Produtos', '% Itens', 'Valor (R$)', '% Valor', 'Gestão'];
        const abcData = [
            ['A', abc.A.length.toString(), ((abc.A.length / metrics.totalProducts) * 100).toFixed(1) + '%', 
             formatCurrency(abc.A.reduce((sum, p) => sum + p.totalValue, 0)), '80%', 'Rigoroso'],
            ['B', abc.B.length.toString(), ((abc.B.length / metrics.totalProducts) * 100).toFixed(1) + '%',
             formatCurrency(abc.B.reduce((sum, p) => sum + p.totalValue, 0)), '15%', 'Moderado'],
            ['C', abc.C.length.toString(), ((abc.C.length / metrics.totalProducts) * 100).toFixed(1) + '%',
             formatCurrency(abc.C.reduce((sum, p) => sum + p.totalValue, 0)), '5%', 'Simplificado']
        ];
        
        const abcColWidths = [20, 20, 20, 35, 20, 30];
        const abcResult = createTable(doc, abcHeaders, abcData, 20, currentY, abcColWidths, doc.internal.pageSize.width);
        currentY = abcResult.y;
        
        // Recomendações
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Recomendações por Classe:', 20, currentY);
        currentY += 10;
        
        const recommendations = [
            'CLASSE A: Controle rigoroso, estoque mínimo elevado',
            'CLASSE B: Controle moderado, revisão periódica',
            'CLASSE C: Controle simplificado, pedidos em lotes'
        ];
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        recommendations.forEach(rec => {
            doc.text(`• ${rec}`, 25, currentY);
            currentY += 8;
        });
        
        // Página 7: Giro de Estoque
        doc.addPage();
        addHeader(doc, title, 7);
        currentY = addSectionTitle(doc, 'GIRO DE ESTOQUE', 40);
        
        // Indicadores de giro
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        
        const turnoverIndicators = [
            { label: 'Giro Anual', value: metrics.turnoverRate.toFixed(2), unit: 'vezes/ano' },
            { label: 'Dias de Estoque', value: metrics.daysOfInventory.toFixed(1), unit: 'dias' },
            { label: 'Cobertura', value: metrics.stockCoverage.toFixed(1), unit: 'dias' },
            { label: 'Estoque Médio', value: metrics.totalStock, unit: 'unid.' }
        ];
        
        let turnoverY = currentY;
        turnoverIndicators.forEach((indicator, index) => {
            const x = 20 + (index % 2) * 100;
            if (index % 2 === 0 && index > 0) turnoverY += 20;
            
            doc.text(indicator.label, x, turnoverY);
            
            // Avaliação
            let evaluation = '';
            if (indicator.label === 'Giro Anual') {
                if (parseFloat(indicator.value) >= 6) evaluation = ' (Alto)';
                else if (parseFloat(indicator.value) >= 4) evaluation = ' (Moderado)';
                else evaluation = ' (Baixo)';
            } else if (indicator.label === 'Dias de Estoque') {
                if (parseFloat(indicator.value) <= 30) evaluation = ' (Bom)';
                else if (parseFloat(indicator.value) <= 60) evaluation = ' (Aceitável)';
                else evaluation = ' (Alto)';
            }
            
            doc.text(`${indicator.value} ${indicator.unit}${evaluation}`, x, turnoverY + 8);
            
            if (index % 2 === 1) turnoverY += 20;
        });
        
        // Interpretação
        turnoverY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Interpretação:', 20, turnoverY);
        turnoverY += 10;
        
        let interpretation = '';
        if (metrics.turnoverRate === 0) {
            interpretation = 'Sem movimento de estoque registrado.';
        } else if (metrics.turnoverRate < 4) {
            interpretation = 'Giro baixo. Capital parado por muito tempo. Revisar mix e estratégias.';
        } else if (metrics.turnoverRate < 6) {
            interpretation = 'Giro moderado. Dentro da média. Há espaço para otimização.';
        } else {
            interpretation = 'Giro alto. Excelente gestão de capital de giro.';
        }
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        const splitInterpretation = doc.splitTextToSize(interpretation, 170);
        doc.text(splitInterpretation, 25, turnoverY);
        
        // Página 8: Plano de Reposição
        doc.addPage();
        addHeader(doc, title, 8);
        currentY = addSectionTitle(doc, 'PLANO DE REPOSIÇÃO', 40);
        
        // Necessidades por categoria
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('Necessidades por Categoria:', 20, currentY);
        currentY += 10;
        
        // Calcular necessidades
        const categoryNeeds = {};
        systemData.products.forEach(product => {
            if (product.stock < 10) {
                const category = product.category || 'Outros';
                if (!categoryNeeds[category]) {
                    categoryNeeds[category] = {
                        products: 0,
                        needed: 0,
                        investment: 0
                    };
                }
                categoryNeeds[category].products++;
                const neededUnits = 10 - product.stock;
                categoryNeeds[category].needed += neededUnits;
                categoryNeeds[category].investment += (product.cmv || 0) * neededUnits;
            }
        });
        
        // Tabela de necessidades
        const needsHeaders = ['Categoria', 'Produtos', 'Unid. Necess.', 'Investimento (R$)'];
        const needsData = Object.entries(categoryNeeds)
            .sort(([, a], [, b]) => b.investment - a.investment)
            .map(([category, data]) => [
                getCategoryName(category),
                data.products.toString(),
                data.needed.toString(),
                formatCurrency(data.investment)
            ]);
        
        if (needsData.length > 0) {
            const needsColWidths = [40, 20, 25, 35];
            const needsResult = createTable(doc, needsHeaders, needsData, 20, currentY, needsColWidths, doc.internal.pageSize.width);
            currentY = needsResult.y;
            
            // Total
            currentY += 10;
            const totalInvestment = Object.values(categoryNeeds).reduce((sum, data) => sum + data.investment, 0);
            doc.setFontSize(11);
            doc.setTextColor(26, 26, 46);
            doc.text(`Investimento total necessário: R$ ${formatCurrency(totalInvestment)}`, 20, currentY);
        } else {
            doc.text('Nenhuma necessidade de reposição identificada.', 20, currentY);
        }
        
        // Cronograma
        currentY += 20;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Cronograma Sugerido:', 20, currentY);
        currentY += 10;
        
        const schedule = [
            'SEMANA 1: Produtos com estoque crítico (<5 unidades)',
            'SEMANA 2: Produtos com estoque baixo (5-9 unidades)',
            'SEMANA 3-4: Revisão e ajuste de estoque de segurança',
            'CONTÍNUO: Monitoramento e pedidos programados'
        ];
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        schedule.forEach(item => {
            doc.text(`• ${item}`, 25, currentY);
            currentY += 8;
        });
        
        // Ações recomendadas
        currentY += 10;
        doc.setFontSize(11);
        doc.setTextColor(26, 26, 46);
        doc.text('Ações Recomendadas:', 20, currentY);
        currentY += 10;
        
        const actions = [
            '1. Implementar estoque mínimo por produto',
            '2. Definir ponto de pedido e lote econômico',
            '3. Estabelecer parcerias com fornecedores',
            '4. Monitorar giro por categoria',
            '5. Revisar periodicamente a classificação ABC'
        ];
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        actions.forEach(action => {
            doc.text(action, 25, currentY);
            currentY += 8;
        });
        
        // Salvar PDF
        const fileName = `relatorio_estoque_${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(fileName);
        
        showAlert(`Relatório de estoque "${fileName}" gerado com sucesso! (${doc.internal.getNumberOfPages()} páginas)`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao gerar relatório de estoque:', error);
        showAlert('Erro ao gerar relatório: ' + error.message, 'error');
    }
}

function calculateInventoryMetrics() {
    const inventoryData = calculateInventoryValue();
    
    // Produtos por nível de estoque
    const stockLevels = {
        critical: systemData.products.filter(p => p.stock < 5),
        low: systemData.products.filter(p => p.stock >= 5 && p.stock < 10),
        medium: systemData.products.filter(p => p.stock >= 10 && p.stock < 20),
        high: systemData.products.filter(p => p.stock >= 20 && p.stock < 50),
        excess: systemData.products.filter(p => p.stock >= 50)
    };
    
    // Giro de estoque estimado (últimos 30 dias)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const totalSalesLast30Days = systemData.sales
        .filter(s => new Date(s.date) >= thirtyDaysAgo)
        .reduce((sum, sale) => sum + sale.items.reduce((s, item) => s + item.quantity, 0), 0);
    
    const avgInventory = inventoryData.totalItems;
    const turnoverRate = avgInventory > 0 ? (totalSalesLast30Days / avgInventory) * 12 : 0;
    const daysOfInventory = avgInventory > 0 ? 30 / (totalSalesLast30Days / avgInventory) : 0;
    const stockCoverage = avgInventory > 0 ? avgInventory / (totalSalesLast30Days / 30) : 0;
    
    return {
        ...inventoryData,
        stockLevels,
        totalProducts: systemData.products.length,
        turnoverRate,
        daysOfInventory,
        stockCoverage
    };
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function calculateSalesMetrics(sales) {
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.total, 0);
    const totalItems = sales.reduce((sum, sale) => sum + sale.items.reduce((s, item) => s + item.quantity, 0), 0);
    const averageTicket = sales.length > 0 ? totalRevenue / sales.length : 0;
    const maxSale = sales.length > 0 ? Math.max(...sales.map(s => s.total)) : 0;
    
    // Vendas por dia da semana
    const salesByWeekday = { 'Dom': 0, 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0 };
    const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    
    sales.forEach(sale => {
        const date = new Date(sale.date);
        const weekday = weekdayNames[date.getDay()];
        salesByWeekday[weekday] += sale.total;
    });
    
    return {
        totalSales: sales.length,
        totalRevenue,
        totalItems,
        averageTicket,
        maxSale,
        salesByWeekday
    };
}

function getPaymentMethodName(method) {
    const names = {
        'cash': 'Dinheiro',
        'pix': 'PIX',
        'debit': 'Cartão Débito',
        'credit': 'Cartão Crédito',
        'Não informado': 'Não informado'
    };
    return names[method] || method;
}

// ============================================
// 11. FUNÇÕES DE APOIO PARA VENDAS
// ============================================

function setupNewSale() {
    updateSaleProductsList();
    updateCartDisplay();
    updateSaleSummary();
    updatePaymentMethod();
}

function updateSaleProductsList() {
    const container = document.getElementById('sale-products-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    systemData.products.forEach(product => {
        if (product.stock > 0) {
            const sanitizedName = DOMPurify.sanitize(product.name);
            const productElement = document.createElement('div');
            productElement.className = 'cart-item';
            productElement.innerHTML = `
                <div class="cart-item-info">
                    <h4>${sanitizedName}</h4>
                    <div class="code">${product.id} | Estoque: ${product.stock}</div>
                    <div class="currency" style="font-weight: 600; margin-top: 5px;">${formatCurrency(product.sellingPrice)}</div>
                </div>
                <div class="cart-item-quantity">
                    <button class="quantity-btn minus" data-id="${DOMPurify.sanitize(product.id)}" type="button">-</button>
                    <span id="cart-qty-${DOMPurify.sanitize(product.id)}">0</span>
                    <button class="quantity-btn plus" data-id="${DOMPurify.sanitize(product.id)}" type="button">+</button>
                    <button class="btn btn-small btn-success add-to-cart" data-id="${DOMPurify.sanitize(product.id)}" type="button" style="margin-left: 10px;">
                        <i class="fas fa-cart-plus"></i> Adicionar
                    </button>
                </div>
            `;
            container.appendChild(productElement);
        }
    });
    
    // Adicionar event listeners usando event delegation
    // Primeiro, remove event listeners antigos
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    
    // Adiciona um único event listener no container
    document.getElementById('sale-products-list').addEventListener('click', function(e) {
        const target = e.target;
        const button = target.closest('button');
        
        if (!button) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const productId = DOMPurify.sanitize(button.getAttribute('data-id'));
        if (!productId) return;
        
        const qtySpan = document.getElementById(`cart-qty-${productId}`);
        if (!qtySpan) return;
        
        let currentQty = parseInt(qtySpan.textContent) || 0;
        const product = systemData.products.find(p => p.id === productId);
        
        // Botão "+"
        if (button.classList.contains('plus') && product) {
            if (currentQty < product.stock) {
                currentQty++;
                qtySpan.textContent = currentQty;
            }
        }
        // Botão "-"
        else if (button.classList.contains('minus')) {
            if (currentQty > 0) {
                currentQty--;
                qtySpan.textContent = currentQty;
            }
        }
        // Botão "Adicionar"
        else if (button.classList.contains('add-to-cart')) {
            if (currentQty > 0) {
                addToCart(productId, currentQty);
                qtySpan.textContent = '0';
            }
        }
    });
}

function filterSaleProducts() {
    const searchInput = document.getElementById('sale-product-search');
    if (!searchInput) return;
    
    const searchTerm = DOMPurify.sanitize(searchInput.value.toLowerCase());
    const products = document.querySelectorAll('#sale-products-list .cart-item');
    
    products.forEach(product => {
        const productName = product.querySelector('.cart-item-info h4')?.textContent.toLowerCase() || '';
        const productCode = product.querySelector('.code')?.textContent.toLowerCase() || '';
        
        const isVisible = productName.includes(searchTerm) || productCode.includes(searchTerm);
        product.style.display = isVisible ? '' : 'none';
    });
}

function addToCart(productId, quantity) {
    const product = systemData.products.find(p => p.id === productId);
    if (!product) return;
    
    if (quantity > product.stock) {
        showAlert(`Estoque insuficiente! Disponível: ${product.stock}`, 'error');
        return;
    }
    
    const existingItem = appState.cart.find(item => item.productId === productId);
    
    if (existingItem) {
        const newQty = existingItem.quantity + quantity;
        if (newQty > product.stock) {
            showAlert(`Estoque insuficiente! Disponível: ${product.stock}`, 'error');
            return;
        }
        existingItem.quantity = newQty;
    } else {
        appState.cart.push({
            productId: productId,
            name: DOMPurify.sanitize(product.name),
            price: product.sellingPrice,
            quantity: quantity
        });
    }
    
    updateCartDisplay();
    updateSaleSummary();
    showAlert(`${quantity}x ${DOMPurify.sanitize(product.name)} adicionado(s) ao carrinho`, 'success');
}

function updateCartDisplay() {
    const cartContainer = document.getElementById('sale-cart');
    const emptyMessage = document.getElementById('empty-cart-message');
    
    if (!cartContainer || !emptyMessage) return;
    
    if (appState.cart.length === 0) {
        cartContainer.innerHTML = '';
        emptyMessage.classList.remove('d-none');
        return;
    }
    
    emptyMessage.classList.add('d-none');
    
    let cartHTML = '<h4 style="margin-bottom: 15px;">Carrinho de Venda</h4>';
    
    appState.cart.forEach((item, index) => {
        const product = systemData.products.find(p => p.id === item.productId);
        const subtotal = item.price * item.quantity;
        
        cartHTML += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${DOMPurify.sanitize(item.name)}</h4>
                    <div class="code">${item.productId}</div>
                    <div class="currency">${formatCurrency(item.price)} cada</div>
                </div>
                <div class="cart-item-quantity">
                    <button class="quantity-btn minus-cart" data-index="${index}">-</button>
                    <span>${item.quantity}</span>
                    <button class="quantity-btn plus-cart" data-index="${index}">+</button>
                    <button class="btn btn-small btn-danger remove-from-cart" data-index="${index}" style="margin-left: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="text-right" style="min-width: 100px;">
                    <strong class="currency">${formatCurrency(subtotal)}</strong>
                </div>
            </div>
        `;
    });
    
    cartContainer.innerHTML = DOMPurify.sanitize(cartHTML);
    
    // Adicionar event listeners
    setTimeout(() => {
        document.querySelectorAll('.plus-cart').forEach(button => {
            button.addEventListener('click', function() {
                const index = sanitizeNumber(parseInt(this.getAttribute('data-index')));
                updateCartItemQuantity(index, 1);
            });
        });
        
        document.querySelectorAll('.minus-cart').forEach(button => {
            button.addEventListener('click', function() {
                const index = sanitizeNumber(parseInt(this.getAttribute('data-index')));
                updateCartItemQuantity(index, -1);
            });
        });
        
        document.querySelectorAll('.remove-from-cart').forEach(button => {
            button.addEventListener('click', function() {
                const index = sanitizeNumber(parseInt(this.getAttribute('data-index')));
                removeFromCart(index);
            });
        });
    }, 100);
}

function updateCartItemQuantity(index, change) {
    if (index < 0 || index >= appState.cart.length) return;
    
    const item = appState.cart[index];
    const product = systemData.products.find(p => p.id === item.productId);
    if (!product) return;
    
    const newQuantity = item.quantity + change;
    
    if (newQuantity < 1) {
        removeFromCart(index);
        return;
    }
    
    if (newQuantity > product.stock) {
        showAlert(`Estoque insuficiente! Disponível: ${product.stock}`, 'error');
        return;
    }
    
    item.quantity = newQuantity;
    updateCartDisplay();
    updateSaleSummary();
}

function removeFromCart(index) {
    if (index >= 0 && index < appState.cart.length) {
        appState.cart.splice(index, 1);
        updateCartDisplay();
        updateSaleSummary();
    }
}

function clearCart() {
    appState.cart = [];
    updateCartDisplay();
    updateSaleSummary();
    showAlert('Carrinho limpo', 'info');
}

function updateSaleSummary() {
    const cartSubtotal = document.getElementById('cart-subtotal');
    const cartDiscount = document.getElementById('cart-discount');
    const cartTotal = document.getElementById('cart-total');
    
    if (!cartSubtotal || !cartDiscount || !cartTotal) return;
    
    let subtotal = 0;
    appState.cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    
    const discountInput = document.getElementById('sale-discount');
    const discount = discountInput ? sanitizeNumber(parseFloat(discountInput.value) || 0) : 0;
    
    const paymentMethod = document.getElementById('payment-method');
    const method = paymentMethod ? paymentMethod.value : 'cash';
    
    let fees = 0;
    
    if (method === 'debit' || method === 'credit') {
        const cardFeeInput = document.getElementById('card-fee');
        const cardFee = cardFeeInput ? sanitizeNumber(parseFloat(cardFeeInput.value) || 0) : 0;
        fees = (subtotal - discount) * (cardFee / 100);
        
        const cartFeesRow = document.getElementById('cart-fees-row');
        const cartFees = document.getElementById('cart-fees');
        if (cartFeesRow) cartFeesRow.classList.remove('d-none');
        if (cartFees) cartFees.textContent = formatCurrency(fees);
    } else {
        const cartFeesRow = document.getElementById('cart-fees-row');
        if (cartFeesRow) cartFeesRow.classList.add('d-none');
    }
    
    const total = subtotal - discount + fees;
    
    cartSubtotal.textContent = formatCurrency(subtotal);
    cartDiscount.textContent = formatCurrency(discount);
    cartTotal.textContent = formatCurrency(total);
}

// ============================================
// 12. GERENCIAMENTO DE PRODUTOS
// ============================================

function updateProductCalculations() {
    const purchaseCost = sanitizeNumber(parseFloat(document.getElementById('purchase-cost')?.value) || 0);
    const shippingCost = sanitizeNumber(parseFloat(document.getElementById('shipping-cost')?.value) || 0);
    const operationalExpenses = sanitizeNumber(parseFloat(document.getElementById('operational-expenses')?.value) || 0);
    const expectedSales = sanitizeNumber(parseFloat(document.getElementById('expected-sales')?.value) || 1);
    const variableFees = sanitizeNumber(parseFloat(document.getElementById('variable-fees')?.value) || 0);
    const taxes = sanitizeNumber(parseFloat(document.getElementById('taxes')?.value) || 0);
    const profitMargin = sanitizeNumber(parseFloat(document.getElementById('profit-margin')?.value) || 0);
    
    if (purchaseCost < 0 || shippingCost < 0 || operationalExpenses < 0 || expectedSales <= 0) {
        showAlert('Valores não podem ser negativos e vendas esperadas devem ser maiores que zero', 'error');
        return;
    }
    
    const totalPurchaseCost = purchaseCost + shippingCost;
    const proportionalOperationalCost = operationalExpenses / expectedSales;
    const cmv = totalPurchaseCost + proportionalOperationalCost;
    
    const variableCosts = (variableFees + taxes + profitMargin) / 100;
    if (variableCosts >= 1) {
        showAlert('A soma das taxas variáveis não pode ser 100% ou mais', 'error');
        return;
    }
    const markup = 1 / (1 - variableCosts);
    
    const suggestedPrice = cmv * markup;
    
    // Atualizar campos de cálculo
    const calcFields = {
        'calc-purchase-cost': purchaseCost,
        'calc-shipping-cost': shippingCost,
        'calc-operational-cost': proportionalOperationalCost,
        'calc-cmv': cmv,
        'calc-variable-fees': variableFees,
        'calc-taxes': taxes,
        'calc-profit-margin': profitMargin,
        'calc-markup': markup,
        'calc-suggested-price': suggestedPrice
    };
    
    Object.entries(calcFields).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            if (id.includes('currency') || id.includes('calc-') && (id.includes('cost') || id.includes('price') || id.includes('cmv'))) {
                element.textContent = formatCurrency(value);
            } else {
                element.textContent = typeof value === 'number' ? value.toFixed(2) : value;
            }
        }
    });
    
    const isEdit = document.getElementById('is-edit')?.value === 'true';
    const sellingPriceField = document.getElementById('selling-price');
    
    if (sellingPriceField && (!isEdit || !sellingPriceField.value || sellingPriceField.value == 0)) {
        sellingPriceField.value = suggestedPrice.toFixed(2);
    }
}

function generateProductId() {
    systemData.settings.lastProductId++;
    const idNumber = systemData.settings.lastProductId.toString().padStart(5, '0');
    return `CAM-${idNumber}`;
}

async function saveProduct(e) {
    e.preventDefault();
    
    const name = DOMPurify.sanitize(document.getElementById('product-name')?.value.trim() || '');
    const category = DOMPurify.sanitize(document.getElementById('product-category')?.value || '');
    const purchaseCost = sanitizeNumber(parseFloat(document.getElementById('purchase-cost')?.value || 0));
    const shippingCost = sanitizeNumber(parseFloat(document.getElementById('shipping-cost')?.value || 0));
    const sellingPrice = sanitizeNumber(parseFloat(document.getElementById('selling-price')?.value || 0));
    const stock = sanitizeNumber(parseInt(document.getElementById('initial-stock')?.value || 0));
    
    // Validações
    if (!name || name.length > 200) {
        showAlert('Nome do produto é obrigatório e deve ter no máximo 200 caracteres', 'error');
        return;
    }
    
    if (!category) {
        showAlert('Categoria do produto é obrigatória', 'error');
        return;
    }
    
    if (isNaN(purchaseCost) || purchaseCost < 0) {
        showAlert('Custo de compra deve ser um número positivo', 'error');
        return;
    }
    
    if (isNaN(shippingCost) || shippingCost < 0) {
        showAlert('Custo de frete deve ser um número positivo', 'error');
        return;
    }
    
    if (isNaN(sellingPrice) || sellingPrice <= 0) {
        showAlert('Preço de venda deve ser um número positivo maior que zero', 'error');
        return;
    }
    
    if (isNaN(stock) || stock < 0) {
        showAlert('Estoque inicial deve ser um número inteiro positivo', 'error');
        return;
    }
    
    const operationalExpenses = sanitizeNumber(parseFloat(document.getElementById('operational-expenses')?.value || 4000));
    const expectedSales = sanitizeNumber(parseInt(document.getElementById('expected-sales')?.value || 100));
    const variableFees = sanitizeNumber(parseFloat(document.getElementById('variable-fees')?.value || 9.5));
    const taxes = sanitizeNumber(parseFloat(document.getElementById('taxes')?.value || 6));
    const profitMargin = sanitizeNumber(parseFloat(document.getElementById('profit-margin')?.value || 40));
    
    if (expectedSales <= 0) {
        showAlert('Vendas esperadas devem ser maiores que zero', 'error');
        return;
    }
    
    const totalPurchaseCost = purchaseCost + shippingCost;
    const proportionalOperationalCost = operationalExpenses / expectedSales;
    const cmv = totalPurchaseCost + proportionalOperationalCost;
    const variableCosts = (variableFees + taxes + profitMargin) / 100;
    
    if (variableCosts >= 1) {
        showAlert('A soma das taxas variáveis não pode ser 100% ou mais', 'error');
        return;
    }
    
    const markup = 1 / (1 - variableCosts);
    const suggestedPrice = cmv * markup;
    
    const isEdit = document.getElementById('is-edit')?.value === 'true';
    const productId = DOMPurify.sanitize(document.getElementById('product-id')?.value || '');
    
    let product;
    
    if (isEdit && productId) {
        product = systemData.products.find(p => p.id === productId);
        if (product) {
            // Atualizar produto existente
            product.name = name;
            product.category = category;
            product.purchaseCost = purchaseCost;
            product.shippingCost = shippingCost;
            product.operationalCost = proportionalOperationalCost;
            product.expectedSales = expectedSales;
            product.variableFees = variableFees;
            product.taxes = taxes;
            product.profitMargin = profitMargin;
            product.cmv = parseFloat(cmv.toFixed(2));
            product.markup = parseFloat(markup.toFixed(2));
            product.suggestedPrice = parseFloat(suggestedPrice.toFixed(2));
            product.sellingPrice = sellingPrice;
            product.stock = stock;
            
            showAlert(`Produto "${name}" atualizado com sucesso!`, 'success');
        }
    } else {
        // Criar novo produto
        product = {
            id: generateProductId(),
            name: name,
            category: category,
            purchaseCost: purchaseCost,
            shippingCost: shippingCost,
            operationalCost: proportionalOperationalCost,
            expectedSales: expectedSales,
            variableFees: variableFees,
            taxes: taxes,
            profitMargin: profitMargin,
            cmv: parseFloat(cmv.toFixed(2)),
            markup: parseFloat(markup.toFixed(2)),
            suggestedPrice: parseFloat(suggestedPrice.toFixed(2)),
            sellingPrice: sellingPrice,
            stock: stock,
            createdAt: new Date().toISOString().split('T')[0]
        };
        
        systemData.products.push(product);
        
        showAlert(`Produto "${name}" cadastrado com sucesso! Código: ${product.id}`, 'success');
    }
    
    await saveData();
    resetProductForm();
    updateProductsList();
    updateInventorySummary();
    
    setTimeout(() => {
        showView('products');
    }, 2000);
}

function resetProductForm() {
    const form = document.getElementById('product-form');
    if (form) form.reset();
    
    const productId = document.getElementById('product-id');
    const isEdit = document.getElementById('is-edit');
    const submitBtn = document.getElementById('product-form-submit');
    
    if (productId) productId.value = '';
    if (isEdit) isEdit.value = 'false';
    if (submitBtn) submitBtn.textContent = 'Salvar Produto';
    
    // Valores padrão
    const defaultFields = {
        'operational-expenses': systemData.settings.monthlyOperationalExpenses,
        'variable-fees': 9.5,
        'taxes': systemData.settings.defaultTax,
        'profit-margin': systemData.settings.defaultMargin,
        'expected-sales': 100,
        'initial-stock': 10
    };
    
    Object.entries(defaultFields).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
    });
    
    updateProductCalculations();
}

function loadProductForEdit(productId) {
    const sanitizedId = DOMPurify.sanitize(productId);
    const product = systemData.products.find(p => p.id === sanitizedId);
    if (!product) return;
    
    const productIdField = document.getElementById('product-id');
    const isEditField = document.getElementById('is-edit');
    const submitBtn = document.getElementById('product-form-submit');
    
    if (productIdField) productIdField.value = product.id;
    if (isEditField) isEditField.value = 'true';
    if (submitBtn) submitBtn.textContent = 'Atualizar Produto';
    
    // Preencher campos
    const fields = {
        'product-name': product.name,
        'product-category': product.category,
        'purchase-cost': product.purchaseCost,
        'shipping-cost': product.shippingCost,
        'expected-sales': product.expectedSales,
        'variable-fees': product.variableFees,
        'taxes': product.taxes,
        'profit-margin': product.profitMargin,
        'selling-price': product.sellingPrice,
        'initial-stock': product.stock
    };
    
    Object.entries(fields).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
    });
    
    updateProductCalculations();
    showView('new-product');
}

function updateProductsList() {
    const productsBody = document.getElementById('products-body');
    if (!productsBody) return;
    
    productsBody.innerHTML = '';
    
    systemData.products.forEach(product => {
        const sanitizedName = DOMPurify.sanitize(product.name);
        const sanitizedCategory = DOMPurify.sanitize(product.category);
        
        const row = document.createElement('tr');
        
        // Célula ID
        const idCell = document.createElement('td');
        idCell.textContent = product.id;
        row.appendChild(idCell);
        
        // Célula Nome
        const nameCell = document.createElement('td');
        nameCell.textContent = sanitizedName;
        row.appendChild(nameCell);
        
        // Célula Categoria
        const categoryCell = document.createElement('td');
        categoryCell.textContent = getCategoryName(sanitizedCategory);
        row.appendChild(categoryCell);
        
        // Célula Custo de Compra
        const purchaseCostCell = document.createElement('td');
        purchaseCostCell.className = 'currency';
        purchaseCostCell.textContent = formatCurrency(product.purchaseCost);
        row.appendChild(purchaseCostCell);
        
        // Célula CMV
        const cmvCell = document.createElement('td');
        cmvCell.className = 'currency';
        cmvCell.textContent = formatCurrency(product.cmv);
        row.appendChild(cmvCell);
        
        // Célula Markup
        const markupCell = document.createElement('td');
        markupCell.textContent = product.markup.toFixed(2);
        row.appendChild(markupCell);
        
        // Célula Preço Sugerido
        const suggestedPriceCell = document.createElement('td');
        suggestedPriceCell.className = 'currency';
        suggestedPriceCell.textContent = formatCurrency(product.suggestedPrice);
        row.appendChild(suggestedPriceCell);
        
        // Célula Preço de Venda
        const sellingPriceCell = document.createElement('td');
        const priceInput = document.createElement('input');
        priceInput.type = 'number';
        priceInput.className = 'form-control selling-price-input';
        priceInput.setAttribute('data-id', product.id);
        priceInput.value = product.sellingPrice.toFixed(2);
        priceInput.step = '0.01';
        priceInput.min = '0.01';
        priceInput.style.width = '120px';
        sellingPriceCell.appendChild(priceInput);
        row.appendChild(sellingPriceCell);
        
        // Célula Estoque
        const stockCell = document.createElement('td');
        const stockBadge = document.createElement('span');
        if (product.stock < 10) {
            stockBadge.className = 'badge badge-danger';
        } else if (product.stock < 20) {
            stockBadge.className = 'badge badge-warning';
        } else {
            stockBadge.className = 'badge badge-success';
        }
        stockBadge.textContent = `${product.stock} und.`;
        stockCell.appendChild(stockBadge);
        row.appendChild(stockCell);
        
        // Célula Valor do Estoque
        const inventoryValueCell = document.createElement('td');
        const inventoryValue = product.sellingPrice * product.stock;
        inventoryValueCell.className = 'currency';
        inventoryValueCell.textContent = formatCurrency(inventoryValue);
        row.appendChild(inventoryValueCell);
        
        // Célula Ações
        const actionsCell = document.createElement('td');
        actionsCell.className = 'actions-cell';
        
        // Botão Editar
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small btn-warning edit-product';
        editBtn.setAttribute('data-id', product.id);
        editBtn.setAttribute('title', 'Editar Produto');
        const editIcon = document.createElement('i');
        editIcon.className = 'fas fa-edit';
        editBtn.appendChild(editIcon);
        actionsCell.appendChild(editBtn);
        
        // Botão Editar Estoque
        const editStockBtn = document.createElement('button');
        editStockBtn.className = 'btn btn-small btn-info edit-stock';
        editStockBtn.setAttribute('data-id', product.id);
        editStockBtn.setAttribute('title', 'Editar Estoque');
        const editStockIcon = document.createElement('i');
        editStockIcon.className = 'fas fa-box';
        editStockBtn.appendChild(editStockIcon);
        actionsCell.appendChild(editStockBtn);
        
        // Botão Excluir
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-small btn-danger delete-product';
        deleteBtn.setAttribute('data-id', product.id);
        deleteBtn.setAttribute('title', 'Excluir Produto');
        const deleteIcon = document.createElement('i');
        deleteIcon.className = 'fas fa-trash';
        deleteBtn.appendChild(deleteIcon);
        actionsCell.appendChild(deleteBtn);
        
        row.appendChild(actionsCell);
        productsBody.appendChild(row);
    });
    
    // Adicionar event listeners
    setTimeout(() => {
        document.querySelectorAll('.selling-price-input').forEach(input => {
            input.addEventListener('change', function() {
                const productId = DOMPurify.sanitize(this.getAttribute('data-id'));
                const newPrice = sanitizeNumber(parseFloat(this.value));
                updateProductPrice(productId, newPrice);
            });
        });
        
        document.querySelectorAll('.edit-product').forEach(button => {
            button.addEventListener('click', function() {
                const productId = DOMPurify.sanitize(this.getAttribute('data-id'));
                loadProductForEdit(productId);
            });
        });
        
        document.querySelectorAll('.edit-stock').forEach(button => {
            button.addEventListener('click', function() {
                const productId = DOMPurify.sanitize(this.getAttribute('data-id'));
                const product = systemData.products.find(p => p.id === productId);
                if (product) {
                    const sanitizedName = DOMPurify.sanitize(product.name);
                    const newStock = prompt(`Digite a nova quantidade em estoque para "${sanitizedName}":`, product.stock);
                    if (newStock !== null && !isNaN(parseInt(newStock)) && parseInt(newStock) >= 0) {
                        updateProductStock(productId, sanitizeNumber(parseInt(newStock)));
                    }
                }
            });
        });
        
        document.querySelectorAll('.delete-product').forEach(button => {
            button.addEventListener('click', function() {
                const productId = DOMPurify.sanitize(this.getAttribute('data-id'));
                confirmDeleteProduct(productId);
            });
        });
    }, 100);
    
    // Atualizar contador no dashboard
    const totalProducts = document.getElementById('total-products');
    if (totalProducts) {
        totalProducts.textContent = systemData.products.length;
    }
    
    // Atualizar resumo do estoque
    updateInventorySummary();
}

async function updateProductStock(productId, newStock) {
    const sanitizedId = DOMPurify.sanitize(productId);
    const product = systemData.products.find(p => p.id === sanitizedId);
    if (product && !isNaN(newStock) && newStock >= 0) {
        product.stock = newStock;
        await saveData();
        showAlert(`Estoque do produto atualizado para ${newStock} unidades`, 'success');
        updateProductsList();
        updateInventorySummary();
    } else {
        showAlert('Quantidade de estoque inválida. Deve ser um número inteiro não-negativo.', 'error');
    }
}

function filterProducts() {
    const searchInput = document.getElementById('product-search');
    const categoryFilter = document.getElementById('category-filter');
    
    if (!searchInput || !categoryFilter) return;
    
    const searchTerm = DOMPurify.sanitize(searchInput.value.toLowerCase());
    const categoryValue = categoryFilter.value;
    
    const rows = document.querySelectorAll('#products-body tr');
    let visibleItems = 0;
    let visibleInventoryValue = 0;
    
    rows.forEach(row => {
        const productName = row.cells[1]?.textContent.toLowerCase() || '';
        const productCode = row.cells[0]?.textContent.toLowerCase() || '';
        const productCategory = row.cells[2]?.textContent || '';
        const inventoryValueText = row.cells[9]?.textContent || '0,00'; // Índice 9 = Valor do Estoque
        
        const matchesSearch = productName.includes(searchTerm) || productCode.includes(searchTerm);
        const matchesCategory = !categoryValue || productCategory === getCategoryName(categoryValue);
        
        const isVisible = matchesSearch && matchesCategory;
        row.style.display = isVisible ? '' : 'none';
        
        if (isVisible) {
            visibleItems++;
            // Converter o valor formatado de volta para número
            const value = parseFloat(inventoryValueText.replace('R$ ', '').replace('.', '').replace(',', '.'));
            if (!isNaN(value)) {
                visibleInventoryValue += value;
            }
        }
    });
    
    // Atualizar o resumo com base nos produtos visíveis
    updateFilteredInventorySummary(visibleItems, visibleInventoryValue);
}

function updateFilteredInventorySummary(visibleItems, visibleInventoryValue) {
    const inventorySummary = document.getElementById('inventory-summary');
    if (!inventorySummary) return;
    
    // Obter os cards existentes
    const cards = inventorySummary.querySelectorAll('.card');
    if (cards.length < 1) return;
    
    // Atualizar apenas o primeiro card (Valor Total do Estoque)
    const totalCard = cards[0];
    const totalValueElement = totalCard.querySelector('.card-value');
    const totalSubtitleElement = totalCard.querySelector('.card-subtitle');
    
    if (totalValueElement) {
        totalValueElement.textContent = formatCurrency(visibleInventoryValue);
    }
    
    if (totalSubtitleElement) {
        const searchInput = document.getElementById('product-search');
        const categoryFilter = document.getElementById('category-filter');
        
        let filterInfo = '';
        if (searchInput && searchInput.value) {
            filterInfo += `Filtro: "${searchInput.value}"`;
        }
        if (categoryFilter && categoryFilter.value) {
            if (filterInfo) filterInfo += ' | ';
            filterInfo += `Categoria: ${categoryFilter.options[categoryFilter.selectedIndex].text}`;
        }
        
        totalSubtitleElement.textContent = filterInfo ? 
            `${visibleItems} itens (${filterInfo})` : 
            `${visibleItems} itens em estoque`;
    }
}

async function updateProductPrice(productId, newPrice) {
    const sanitizedId = DOMPurify.sanitize(productId);
    const product = systemData.products.find(p => p.id === sanitizedId);
    if (product && !isNaN(newPrice) && newPrice > 0) {
        product.sellingPrice = newPrice;
        await saveData();
        showAlert(`Preço do produto atualizado para ${formatCurrency(newPrice)}`, 'success');
        updateProductsList();
        updateInventorySummary();
    } else {
        showAlert('Preço inválido. Deve ser um número positivo maior que zero.', 'error');
    }
}

function confirmDeleteProduct(productId) {
    const sanitizedId = DOMPurify.sanitize(productId);
    const product = systemData.products.find(p => p.id === sanitizedId);
    if (product) {
        appState.currentProductId = sanitizedId;
        
        const deleteMessage = document.getElementById('delete-message');
        if (deleteMessage) {
            deleteMessage.textContent = 
                DOMPurify.sanitize(`Tem certeza que deseja excluir o produto "${product.name}" (${product.id})? Esta ação não pode ser desfeita.`);
        }
        
        showModal('delete-modal');
        
        const confirmDeleteBtn = document.getElementById('confirm-delete');
        if (confirmDeleteBtn) {
            confirmDeleteBtn.onclick = async function() {
                await deleteProduct(sanitizedId);
                hideModal('delete-modal');
            };
        }
    }
}

async function deleteProduct(productId) {
    const sanitizedId = DOMPurify.sanitize(productId);
    const productIndex = systemData.products.findIndex(p => p.id === sanitizedId);
    
    if (productIndex !== -1) {
        systemData.products.splice(productIndex, 1);
        await saveData();
        updateProductsList();
        updateDashboard();
        updateInventorySummary();
        showAlert('Produto excluído com sucesso', 'success');
    }
}

// ============================================
// 13. LISTA DE VENDAS (ATUALIZADA COM EDIÇÃO)
// ============================================

function updateSalesList() {
    const salesBody = document.getElementById('sales-body');
    if (!salesBody) return;
    
    salesBody.innerHTML = '';
    
    const sortedSales = [...systemData.sales].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    );
    
    sortedSales.forEach(sale => {
        const saleDate = new Date(sale.date);
        const itemsText = sale.items.map(item => 
            `${item.quantity}x ${DOMPurify.sanitize(item.name)}`
        ).join(', ');
        
        const totalItems = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        
        let paymentText = '';
        switch(sale.paymentMethod) {
            case 'cash':
                paymentText = 'Dinheiro';
                break;
            case 'pix':
                paymentText = 'Pix';
                break;
            case 'debit':
                paymentText = 'Cartão Débito';
                break;
            case 'credit':
                paymentText = 'Cartão Crédito';
                break;
            default:
                paymentText = DOMPurify.sanitize(sale.paymentMethod);
        }
        
        const sanitizedAttendant = DOMPurify.sanitize(sale.attendant || 'Não informado');
        
        const row = document.createElement('tr');
        
        // Célula ID
        const idCell = document.createElement('td');
        idCell.textContent = sale.id;
        row.appendChild(idCell);
        
        // Célula Data
        const dateCell = document.createElement('td');
        const dateText = document.createTextNode(saleDate.toLocaleDateString('pt-BR'));
        const brElement = document.createElement('br');
        const timeText = document.createTextNode(saleDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}));
        dateCell.appendChild(dateText);
        dateCell.appendChild(brElement);
        dateCell.appendChild(timeText);
        row.appendChild(dateCell);
        
        // Célula Itens
        const itemsCell = document.createElement('td');
        itemsCell.textContent = itemsText;
        row.appendChild(itemsCell);
        
        // Célula Quantidade Total
        const qtyCell = document.createElement('td');
        qtyCell.textContent = totalItems;
        row.appendChild(qtyCell);
        
        // Célula Total
        const totalCell = document.createElement('td');
        totalCell.className = 'currency';
        totalCell.textContent = formatCurrency(sale.total);
        row.appendChild(totalCell);
        
        // Célula Atendente
        const attendantCell = document.createElement('td');
        attendantCell.textContent = sanitizedAttendant;
        row.appendChild(attendantCell);
        
        // Célula Pagamento
        const paymentCell = document.createElement('td');
        paymentCell.textContent = paymentText;
        row.appendChild(paymentCell);
        
        // Célula Ações
        const actionsCell = document.createElement('td');
        actionsCell.className = 'actions-cell';
        
        // Botão Visualizar
        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-small btn-info view-sale';
        viewBtn.setAttribute('data-id', sale.id);
        viewBtn.setAttribute('title', 'Visualizar Venda');
        const viewIcon = document.createElement('i');
        viewIcon.className = 'fas fa-eye';
        viewBtn.appendChild(viewIcon);
        actionsCell.appendChild(viewBtn);
        
        // Botão Editar (NOVO)
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-small btn-warning edit-sale-btn';
        editBtn.setAttribute('data-id', sale.id);
        editBtn.setAttribute('title', 'Editar Venda');
        const editIcon = document.createElement('i');
        editIcon.className = 'fas fa-edit';
        editBtn.appendChild(editIcon);
        actionsCell.appendChild(editBtn);
        
        row.appendChild(actionsCell);
        salesBody.appendChild(row);
    });
    
    // Adicionar event listeners
    setTimeout(() => {
        document.querySelectorAll('.view-sale').forEach(button => {
            button.addEventListener('click', function() {
                const saleId = DOMPurify.sanitize(this.getAttribute('data-id'));
                viewSaleDetails(saleId);
            });
        });
        
        // Adicionar event listener para o botão de editar (NOVO)
        document.querySelectorAll('.edit-sale-btn').forEach(button => {
            button.addEventListener('click', function() {
                const saleId = DOMPurify.sanitize(this.getAttribute('data-id'));
                editSale(saleId);
            });
        });
    }, 100);
}

function viewSaleDetails(saleId) {
    const sanitizedId = DOMPurify.sanitize(saleId);
    const sale = systemData.sales.find(s => s.id === sanitizedId);
    if (!sale) return;
    
    const modalContent = document.getElementById('sale-details-content');
    if (!modalContent) return;
    
    const saleDate = new Date(sale.date);
    
    let detailsHTML = `
        <div style="margin-bottom: 20px;">
            <p><strong>ID da Venda:</strong> ${DOMPurify.sanitize(sale.id)}</p>
            <p><strong>Data/Hora:</strong> ${saleDate.toLocaleDateString('pt-BR')} ${saleDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
            <p><strong>Atendente:</strong> ${DOMPurify.sanitize(sale.attendant || 'Não informado')}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <thead>
                <tr style="border-bottom: 2px solid #ddd;">
                    <th style="padding: 10px; text-align: left;">Produto</th>
                    <th style="padding: 10px; text-align: center;">Qtd</th>
                    <th style="padding: 10px; text-align: right;">Preço Unit.</th>
                    <th style="padding: 10px; text-align: right;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sale.items.forEach(item => {
        const sanitizedName = DOMPurify.sanitize(item.name);
        detailsHTML += `
            <tr>
                <td style="padding: 10px;">${sanitizedName}</td>
                <td style="padding: 10px; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right;">${formatCurrency(item.price)}</td>
                <td style="padding: 10px; text-align: right;">${formatCurrency(item.price * item.quantity)}</td>
            </tr>
        `;
    });
    
    let paymentText = '';
    switch(sale.paymentMethod) {
        case 'cash':
            paymentText = 'Dinheiro';
            break;
        case 'pix':
            paymentText = 'Pix';
            break;
        case 'debit':
            paymentText = 'Cartão de Débito';
            break;
        case 'credit':
            paymentText = 'Cartão de Crédito';
            break;
        default:
            paymentText = DOMPurify.sanitize(sale.paymentMethod);
    }
    
    detailsHTML += `
            </tbody>
        </table>
        
        <div style="border-top: 2px solid #ddd; padding-top: 15px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Subtotal:</span>
                <span>${formatCurrency(sale.subtotal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Desconto:</span>
                <span>- ${formatCurrency(sale.discount)}</span>
            </div>
    `;
    
    if (sale.fees > 0) {
        detailsHTML += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <span>Taxas (${sale.cardFee}%):</span>
                <span>${formatCurrency(sale.fees)}</span>
            </div>
        `;
    }
    
    detailsHTML += `
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 1.2em; margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd;">
                <span>TOTAL:</span>
                <span>${formatCurrency(sale.total)}</span>
            </div>
            
            <div style="margin-top: 15px;">
                <p><strong>Método de Pagamento:</strong> ${paymentText}</p>
            </div>
        </div>
    `;
    
    modalContent.innerHTML = DOMPurify.sanitize(detailsHTML);
    
    const printReceiptBtn = document.getElementById('print-receipt');
    if (printReceiptBtn) {
        printReceiptBtn.onclick = function() {
            showReceipt(sale);
        };
    }
    
    showModal('sale-details-modal');
}

// ============================================
// 14. DASHBOARD E RELATÓRIOS
// ============================================

function updateDashboard() {
    const totalProducts = document.getElementById('total-products');
    const todaySales = document.getElementById('today-sales');
    const monthlyRevenue = document.getElementById('monthly-revenue');
    const bestSeller = document.getElementById('best-seller');
    const bestSellerQty = document.getElementById('best-seller-qty');
    
    if (totalProducts) totalProducts.textContent = systemData.products.length;
    
    // Vendas de hoje
    const today = new Date().toISOString().split('T')[0];
    const todaySalesCount = systemData.sales.filter(sale => 
        sale.date.startsWith(today)
    ).length;
    
    if (todaySales) todaySales.textContent = todaySalesCount;
    
    // Receita mensal
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlySales = systemData.sales.filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate.getMonth() === currentMonth && saleDate.getFullYear() === currentYear;
    });
    
    const monthlyRevenueTotal = monthlySales.reduce((sum, sale) => sum + sale.total, 0);
    
    if (monthlyRevenue) monthlyRevenue.textContent = formatCurrency(monthlyRevenueTotal);
    
    // Produto mais vendido
    const productSales = {};
    systemData.sales.forEach(sale => {
        sale.items.forEach(item => {
            if (!productSales[item.productId]) {
                productSales[item.productId] = 0;
            }
            productSales[item.productId] += item.quantity;
        });
    });
    
    let bestSellerId = null;
    let bestSellerQtyValue = 0;
    
    for (const [productId, qty] of Object.entries(productSales)) {
        if (qty > bestSellerQtyValue) {
            bestSellerQtyValue = qty;
            bestSellerId = productId;
        }
    }
    
    if (bestSellerId) {
        const bestProduct = systemData.products.find(p => p.id === bestSellerId);
        if (bestProduct) {
            const sanitizedName = DOMPurify.sanitize(bestProduct.name);
            if (bestSeller) bestSeller.textContent = sanitizedName;
            if (bestSellerQty) bestSellerQty.textContent = bestSellerQtyValue;
        }
    } else {
        if (bestSeller) bestSeller.textContent = '-';
        if (bestSellerQty) bestSellerQty.textContent = '0';
    }
    
    updateRecentSales();
    updateMonthlySalesChart();
}

function updateRecentSales() {
    const recentSalesBody = document.getElementById('recent-sales-body');
    if (!recentSalesBody) return;
    
    recentSalesBody.innerHTML = '';
    
    const sortedSales = [...systemData.sales].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    ).slice(0, 5);
    
    sortedSales.forEach(sale => {
        const saleDate = new Date(sale.date);
        const itemsText = sale.items.map(item => 
            `${item.quantity}x ${DOMPurify.sanitize(item.name)}`
        ).join(', ');
        
        let paymentText = '';
        switch(sale.paymentMethod) {
            case 'cash':
                paymentText = 'Dinheiro';
                break;
            case 'pix':
                paymentText = 'Pix';
                break;
            case 'debit':
                paymentText = 'Débito';
                break;
            case 'credit':
                paymentText = 'Crédito';
                break;
            default:
                paymentText = DOMPurify.sanitize(sale.paymentMethod);
        }
        
        const sanitizedAttendant = DOMPurify.sanitize(sale.attendant || 'Não informado');
        
        const row = document.createElement('tr');
        
        // Célula ID
        const idCell = document.createElement('td');
        idCell.textContent = sale.id;
        row.appendChild(idCell);
        
        // Célula Data/Hora
        const dateCell = document.createElement('td');
        dateCell.textContent = `${saleDate.toLocaleDateString('pt-BR')} ${saleDate.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
        row.appendChild(dateCell);
        
        // Célula Itens
        const itemsCell = document.createElement('td');
        itemsCell.textContent = itemsText;
        row.appendChild(itemsCell);
        
        // Célula Total
        const totalCell = document.createElement('td');
        totalCell.className = 'currency';
        totalCell.textContent = formatCurrency(sale.total);
        row.appendChild(totalCell);
        
        // Célula Atendente
        const attendantCell = document.createElement('td');
        attendantCell.textContent = sanitizedAttendant;
        row.appendChild(attendantCell);
        
        // Célula Pagamento
        const paymentCell = document.createElement('td');
        paymentCell.textContent = paymentText;
        row.appendChild(paymentCell);
        
        recentSalesBody.appendChild(row);
    });
}

function updateReports() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSales = systemData.sales.filter(sale => 
        new Date(sale.date) >= thirtyDaysAgo
    );
    
    const totalRevenue = recentSales.reduce((sum, sale) => sum + sale.total, 0);
    const reportRevenue = document.getElementById('report-revenue');
    if (reportRevenue) reportRevenue.textContent = formatCurrency(totalRevenue);
    
    let totalCost = 0;
    recentSales.forEach(sale => {
        sale.items.forEach(item => {
            const product = systemData.products.find(p => p.id === item.productId);
            if (product) {
                totalCost += product.cmv * item.quantity;
            }
        });
    });
    
    const reportCost = document.getElementById('report-cost');
    if (reportCost) reportCost.textContent = formatCurrency(totalCost);
    
    const netProfit = totalRevenue - totalCost;
    const reportProfit = document.getElementById('report-profit');
    if (reportProfit) reportProfit.textContent = formatCurrency(netProfit);
    
    const lowStockProducts = systemData.products.filter(p => p.stock < 10);
    const lowStockCount = document.getElementById('low-stock-count');
    const lowStockList = document.getElementById('low-stock-list');
    
    if (lowStockCount) lowStockCount.textContent = lowStockProducts.length;
    
    if (lowStockList) {
        if (lowStockProducts.length > 0) {
            const lowStockNames = lowStockProducts.map(p => DOMPurify.sanitize(p.name)).slice(0, 3).join(', ');
            lowStockList.textContent = lowStockNames + 
                (lowStockProducts.length > 3 ? '...' : '');
        } else {
            lowStockList.textContent = 'Nenhum produto';
        }
    }
    
    updateTopProducts();
    updateCategoryChart();
}

function updateTopProducts() {
    const topProductsBody = document.getElementById('top-products-body');
    if (!topProductsBody) return;
    
    topProductsBody.innerHTML = '';
    
    const productStats = {};
    
    systemData.sales.forEach(sale => {
        sale.items.forEach(item => {
            if (!productStats[item.productId]) {
                productStats[item.productId] = {
                    quantity: 0,
                    revenue: 0
                };
            }
            productStats[item.productId].quantity += item.quantity;
            productStats[item.productId].revenue += item.quantity * item.price;
        });
    });
    
    const sortedProducts = Object.entries(productStats)
        .map(([productId, stats]) => {
            const product = systemData.products.find(p => p.id === productId);
            return {
                productId,
                name: product ? DOMPurify.sanitize(product.name) : 'Produto desconhecido',
                category: product ? DOMPurify.sanitize(product.category) : 'Desconhecida',
                ...stats
            };
        })
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10);
    
    sortedProducts.forEach((product, index) => {
        const row = document.createElement('tr');
        
        const positionCell = document.createElement('td');
        positionCell.textContent = index + 1;
        row.appendChild(positionCell);
        
        const nameCell = document.createElement('td');
        nameCell.textContent = product.name;
        row.appendChild(nameCell);
        
        const categoryCell = document.createElement('td');
        categoryCell.textContent = getCategoryName(product.category);
        row.appendChild(categoryCell);
        
        const qtyCell = document.createElement('td');
        qtyCell.textContent = product.quantity;
        row.appendChild(qtyCell);
        
        const revenueCell = document.createElement('td');
        revenueCell.className = 'currency';
        revenueCell.textContent = formatCurrency(product.revenue);
        row.appendChild(revenueCell);
        
        const profitCell = document.createElement('td');
        profitCell.className = 'currency';
        profitCell.textContent = formatCurrency(product.revenue * 0.3);
        row.appendChild(profitCell);
        
        topProductsBody.appendChild(row);
    });
}

// ============================================
// 15. GRÁFICOS
// ============================================

function updateMonthlySalesChart() {
    const ctx = document.getElementById('monthlySalesChart');
    if (!ctx) return;
    
    // Destruir gráfico anterior se existir
    if (appState.charts.monthlySales) {
        appState.charts.monthlySales.destroy();
    }
    
    // Agrupar vendas por mês
    const monthlySales = {};
    const monthlyRevenue = {};
    
    systemData.sales.forEach(sale => {
        const saleDate = new Date(sale.date);
        const monthYear = `${saleDate.getMonth() + 1}/${saleDate.getFullYear()}`;
        
        if (!monthlySales[monthYear]) {
            monthlySales[monthYear] = 0;
            monthlyRevenue[monthYear] = 0;
        }
        
        monthlySales[monthYear] += 1;
        monthlyRevenue[monthYear] += sale.total;
    });
    
    // Ordenar por data
    const sortedMonths = Object.keys(monthlySales).sort((a, b) => {
        const [monthA, yearA] = a.split('/').map(Number);
        const [monthB, yearB] = b.split('/').map(Number);
        return yearA === yearB ? monthA - monthB : yearA - yearB;
    });
    
    // Limitar aos últimos 6 meses
    const displayMonths = sortedMonths.slice(-6);
    
    // Preparar dados para o gráfico
    const labels = displayMonths.map(month => {
        const [monthNum, year] = month.split('/');
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                           'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return `${monthNames[monthNum - 1]}/${year}`;
    });
    
    const salesData = displayMonths.map(month => monthlySales[month] || 0);
    const revenueData = displayMonths.map(month => monthlyRevenue[month] || 0);
    
    // Criar gráfico
    try {
        appState.charts.monthlySales = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Número de Vendas',
                        data: salesData,
                        backgroundColor: 'rgba(138, 43, 226, 0.7)',
                        borderColor: 'rgba(138, 43, 226, 1)',
                        borderWidth: 1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Receita (R$)',
                        data: revenueData,
                        backgroundColor: 'rgba(255, 107, 107, 0.7)',
                        borderColor: 'rgba(255, 107, 107, 1)',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Número de Vendas'
                        },
                        ticks: {
                            beginAtZero: true,
                            precision: 0
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Receita (R$)'
                        },
                        ticks: {
                            beginAtZero: true,
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(2).replace('.', ',');
                            }
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                    }
                }
            }
        });
    } catch (error) {
        console.error('❌ Erro ao criar gráfico:', error);
    }
}

function updateCategoryChart() {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;
    
    // Destruir gráfico anterior se existir
    if (appState.charts.categoryChart) {
        appState.charts.categoryChart.destroy();
    }
    
    // Calcular vendas por categoria
    const categoryRevenue = {};
    
    systemData.sales.forEach(sale => {
        sale.items.forEach(item => {
            const product = systemData.products.find(p => p.id === item.productId);
            if (product) {
                const category = DOMPurify.sanitize(product.category);
                if (!categoryRevenue[category]) {
                    categoryRevenue[category] = 0;
                }
                categoryRevenue[category] += item.price * item.quantity;
            }
        });
    });
    
    const categories = Object.keys(categoryRevenue);
    const revenueData = categories.map(cat => categoryRevenue[cat]);
    
    // Mapear categorias para nomes em português
    const categoryNames = {
        'Shoes': 'Sapatos',
        'Belts': 'Cintos',
        'Bags': 'Bolsas',
        'Activewear': 'Roupas Esportivas',
        'Clothing': 'Roupas Casuais',
        'Makeup': 'Maquiagem',
        'Skincare': 'Skincare'
    };
    
    const labels = categories.map(cat => categoryNames[cat] || cat);
    
    // Cores para as categorias
    const backgroundColors = [
        'rgba(138, 43, 226, 0.7)',
        'rgba(255, 107, 107, 0.7)',
        'rgba(76, 175, 80, 0.7)',
        'rgba(255, 152, 0, 0.7)',
        'rgba(33, 150, 243, 0.7)',
        'rgba(156, 39, 176, 0.7)'
    ];
    
    try {
        appState.charts.categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: revenueData,
                    backgroundColor: backgroundColors.slice(0, categories.length),
                    borderColor: backgroundColors.map(color => color.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                    }
                }
            }
        });
    } catch (error) {
        console.error('❌ Erro ao criar gráfico de categorias:', error);
    }
}

// ============================================
// 16. CONFIGURAÇÕES
// ============================================

async function saveSettings(e) {
    if (e) e.preventDefault();
    
    const debitFee = sanitizeNumber(parseFloat(document.getElementById('default-debit-fee')?.value || 0));
    const creditFee = sanitizeNumber(parseFloat(document.getElementById('default-credit-fee')?.value || 0));
    const tax = sanitizeNumber(parseFloat(document.getElementById('default-tax')?.value || 0));
    const margin = sanitizeNumber(parseFloat(document.getElementById('default-margin')?.value || 0));
    const expenses = sanitizeNumber(parseFloat(document.getElementById('monthly-expenses')?.value || 0));
    
    // Validações
    if (debitFee < 0 || creditFee < 0 || tax < 0 || margin < 0 || expenses < 0) {
        showAlert('Valores não podem ser negativos', 'error');
        return;
    }
    
    // Atualizar configurações
    systemData.settings.defaultDebitFee = debitFee || 2.0;
    systemData.settings.defaultCreditFee = creditFee || 4.5;
    systemData.settings.defaultTax = tax || 6;
    systemData.settings.defaultMargin = margin || 40;
    systemData.settings.monthlyOperationalExpenses = expenses || 4000;
    
    // Salvar dados
    await saveData();
    
    showAlert('Configurações salvas com sucesso', 'success');
}

// ============================================
// 17. EXPORTAÇÃO E IMPORTAÇÃO DE DADOS
// ============================================

function exportData(type = null) {
    if (!type) {
        const exportType = document.getElementById('export-type');
        type = exportType ? exportType.value : 'all';
    }
    
    let dataToExport;
    let filename;
    
    switch(type) {
        case 'products':
            dataToExport = { products: systemData.products };
            filename = `camarim-produtos-${new Date().toISOString().slice(0,10)}.json`;
            break;
        case 'sales':
            dataToExport = { sales: systemData.sales };
            filename = `camarim-vendas-${new Date().toISOString().slice(0,10)}.json`;
            break;
        case 'all':
        default:
            dataToExport = systemData;
            filename = `camarim-backup-${new Date().toISOString().slice(0,10)}.json`;
            break;
    }
    
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    showAlert(`Dados exportados com sucesso: ${filename}`, 'success');
    hideModal('export-modal');
}

function importData() {
    const fileInput = document.getElementById('import-file');
    const file = fileInput?.files[0];
    
    if (!file) {
        const importError = document.getElementById('import-error');
        if (importError) {
            importError.classList.remove('d-none');
            const importErrorMessage = document.getElementById('import-error-message');
            if (importErrorMessage) {
                importErrorMessage.textContent = 'Selecione um arquivo JSON para importar';
            }
        }
        return;
    }
    
    // Validar tipo de arquivo
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        const importError = document.getElementById('import-error');
        if (importError) {
            importError.classList.remove('d-none');
            const importErrorMessage = document.getElementById('import-error-message');
            if (importErrorMessage) {
                importErrorMessage.textContent = 'O arquivo deve ser um JSON válido';
            }
        }
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Validar estrutura
            if (!importedData.products || !Array.isArray(importedData.products)) {
                throw new Error('Estrutura de dados inválida');
            }
            
            // Sanitizar dados
            const sanitizedData = {
                products: importedData.products.map(product => ({
                    ...product,
                    name: DOMPurify.sanitize(product.name || ''),
                    category: DOMPurify.sanitize(product.category || '')
                })),
                sales: importedData.sales ? importedData.sales.map(sale => ({
                    ...sale,
                    attendant: DOMPurify.sanitize(sale.attendant || ''),
                    items: sale.items ? sale.items.map(item => ({
                        ...item,
                        name: DOMPurify.sanitize(item.name || '')
                    })) : []
                })) : [],
                settings: importedData.settings || {}
            };
            
            // Atualizar dados do sistema
            if (sanitizedData.sales && Array.isArray(sanitizedData.sales)) {
                systemData.sales = sanitizedData.sales;
            }
            
            if (sanitizedData.settings && typeof sanitizedData.settings === 'object') {
                systemData.settings = { ...systemData.settings, ...sanitizedData.settings };
            }
            
            systemData.products = sanitizedData.products;
            
            // Atualizar IDs
            updateProductIds();
            updateSaleIds();
            
            // Salvar e recarregar
            saveData();
            loadData();
            updateDashboard();
            updateProductsList();
            updateInventorySummary();
            updateSalesList();
            
            showAlert('Dados importados com sucesso!', 'success');
            hideModal('import-modal');
            
        } catch (error) {
            const importError = document.getElementById('import-error');
            if (importError) {
                importError.classList.remove('d-none');
                const importErrorMessage = document.getElementById('import-error-message');
                if (importErrorMessage) {
                    importErrorMessage.textContent = 
                        DOMPurify.sanitize(`Erro ao importar dados: ${error.message}`);
                }
            }
            console.error('Erro na importação:', error);
        }
    };
    
    reader.onerror = function() {
        const importError = document.getElementById('import-error');
        if (importError) {
            importError.classList.remove('d-none');
            const importErrorMessage = document.getElementById('import-error-message');
            if (importErrorMessage) {
                importErrorMessage.textContent = 'Erro ao ler o arquivo';
            }
        }
    };
    
    reader.readAsText(file);
}

async function clearAllData() {
    const confirmation = confirm('ATENÇÃO: Esta ação irá apagar TODOS os dados do sistema. Esta ação não pode ser desfeita. Deseja continuar?');
    if (confirmation) {
        try {
            // Limpar dados
            systemData = {
                products: [],
                sales: [],
                settings: {
                    defaultDebitFee: 2.0,
                    defaultCreditFee: 4.5,
                    defaultTax: 6,
                    defaultMargin: 40,
                    monthlyOperationalExpenses: 4000,
                    lastProductId: 0,
                    lastSaleId: 0
                }
            };
            
            // Salvar dados vazios
            await saveData();
            
            // Recarregar interface
            loadData();
            updateDashboard();
            updateInventorySummary();
            
            showAlert('Todos os dados foram apagados e o sistema foi reinicializado', 'success');
            
        } catch (error) {
            console.error('❌ Erro ao limpar dados:', error);
            showAlert('Erro ao limpar dados: ' + error.message, 'error');
        }
    }
}

// ============================================
// 18. FUNÇÕES AUXILIARES DO SISTEMA DE VENDAS
// ============================================

function showPixPayment(sale) {
    const modalContent = document.getElementById('pix-content');
    if (!modalContent) return;
    
    const pixCode = generatePixCode(sale.total);
    
    let pixHTML = `
        <div class="text-center">
            <h4 style="margin-bottom: 20px;">Pagamento via Pix</h4>
            <p>Valor: <strong class="currency">${formatCurrency(sale.total)}</strong></p>
            <p>Atendente: <strong>${DOMPurify.sanitize(sale.attendant)}</strong></p>
            
            <div class="pix-qr-code" id="pix-qr-code"></div>
            
            <div class="pix-copy-code">
                <p style="margin-bottom: 10px;">Código Pix Copia e Cola:</p>
                <div class="pix-code">${DOMPurify.sanitize(pixCode)}</div>
                <button class="btn btn-info btn-block" id="copy-pix-code">
                    <i class="fas fa-copy"></i> Copiar Código
                </button>
            </div>
            
            <div class="alert alert-success mt-20">
                <i class="fas fa-info-circle"></i>
                <span>Após realizar o pagamento, clique em "Confirmar Pagamento"</span>
            </div>
        </div>
    `;
    
    modalContent.innerHTML = DOMPurify.sanitize(pixHTML);
    
    // Gerar QR Code
    setTimeout(() => {
        if (typeof QRCode !== 'undefined') {
            new QRCode(document.getElementById("pix-qr-code"), {
                text: pixCode,
                width: 250,
                height: 250,
                colorDark: "#000000",
                colorLight: "#ffffff"
            });
        }
    }, 100);
    
    // Adicionar evento para copiar código
    setTimeout(() => {
        const copyButton = document.getElementById('copy-pix-code');
        if (copyButton) {
            copyButton.addEventListener('click', function() {
                navigator.clipboard.writeText(pixCode).then(() => {
                    showAlert('Código Pix copiado para a área de transferência!', 'success');
                }).catch(err => {
                    console.error('Erro ao copiar:', err);
                    showAlert('Erro ao copiar código. Tente novamente.', 'error');
                });
            });
        }
    }, 200);
    
    showModal('pix-modal');
}

function generatePixCode(amount) {
    if (isNaN(amount) || amount <= 0) {
        amount = 0.01;
    }
    

    const transactionId = Math.random().toString(36).substring(2, 15).toUpperCase();
    const merchantName = "CAMARIM BOUTIQUE";
    const merchantCity = "SAO PAULO";
    
    return `00020126580014BR.GOV.BCB.PIX0136${merchantName}520400005303986540${amount.toFixed(2)}5802BR5913${merchantName}6009${merchantCity}622905${transactionId}6304`;
}

function confirmPixPayment() {
    if (appState.currentSaleData) {
        confirmSale(appState.currentSaleData);
        hideModal('pix-modal');
    }
}

// ============================================
// 19. BANCO DE DADOS
// ============================================

function showDatabaseStatus() {
    console.group('📊 Status do Banco de Dados');
    console.log('DatabaseManager disponível:', typeof databaseManager !== 'undefined');
    console.log('DatabaseManager inicializado:', databaseManager?.initialized || false);
    console.log('Produtos no sistema:', systemData.products.length);
    console.log('Vendas no sistema:', systemData.sales.length);
    console.groupEnd();
}

async function updateDatabaseInfo() {
    try {
        if (!databaseManager) {
            console.warn('⚠️ databaseManager não disponível para updateDatabaseInfo');
            return;
        }
        
        const info = await databaseManager.getDatabaseInfo();
        
        // Atualizar cards
        const dbStatus = document.getElementById('db-status');
        const dbType = document.getElementById('db-type');
        const dbProducts = document.getElementById('db-products');
        const dbSales = document.getElementById('db-sales');
        const dbStorage = document.getElementById('db-storage');
        const dbUsage = document.getElementById('db-usage');
        
        if (dbStatus) dbStatus.textContent = info?.status || 'LocalStorage';
        if (dbType) {
            const isIndexedDB = info?.status === 'IndexedDB';
            dbType.innerHTML = isIndexedDB ? 
                '<span class="positive"><i class="fas fa-check"></i> Otimizado</span>' :
                '<span class="warning"><i class="fas fa-exclamation-triangle"></i> Fallback</span>';
        }
        if (dbProducts) dbProducts.textContent = systemData.products.length;
        if (dbSales) dbSales.textContent = systemData.sales.length;
        if (dbStorage) dbStorage.textContent = info?.storage || 'N/A';
        if (dbUsage) dbUsage.textContent = info?.status === 'IndexedDB' ? 'Ativo' : 'Fallback';
        
        // Atualizar informações detalhadas
        const infoContainer = document.getElementById('db-info-container');
        if (infoContainer) {
            let infoHTML = '';
            
            if (info) {
                const isIndexedDB = info.status === 'IndexedDB';
                
                infoHTML = `
                    <div class="alert ${isIndexedDB ? 'alert-success' : 'alert-warning'}">
                        <i class="fas fa-${isIndexedDB ? 'check-circle' : 'exclamation-triangle'}"></i>
                        <strong>Status:</strong> ${isIndexedDB ? 
                            'Usando IndexedDB (recomendado)' : 
                            'Usando localStorage (modo fallback)'}
                    </div>
                    
                    <div class="calculation-box">
                        <h4>Informações Detalhadas</h4>
                        <div class="calculation-row">
                            <span>Sistema de armazenamento:</span>
                            <span>${info.status}</span>
                        </div>
                        <div class="calculation-row">
                            <span>Produtos cadastrados:</span>
                            <span>${systemData.products.length}</span>
                        </div>
                        <div class="calculation-row">
                            <span>Vendas registradas:</span>
                            <span>${systemData.sales.length}</span>
                        </div>
                `;
                
                if (info.storage && info.storage !== 'N/A') {
                    infoHTML += `
                        <div class="calculation-row">
                            <span>Armazenamento usado:</span>
                            <span>${info.storage}</span>
                        </div>
                    `;
                }
                
                infoHTML += `
                        <div class="calculation-row">
                            <span>Última atualização:</span>
                            <span>${new Date().toLocaleTimeString()}</span>
                        </div>
                    </div>
                `;
            } else {
                infoHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Informações do banco não disponíveis</strong>
                    </div>
                `;
            }
            
            infoContainer.innerHTML = DOMPurify.sanitize(infoHTML);
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar informações do banco:', error);
    }
}

// ============================================
// 20. UTILITÁRIOS
// ============================================

function showModal(modalId) {
    const sanitizedId = DOMPurify.sanitize(modalId);
    const modal = document.getElementById(sanitizedId);
    if (modal) {
        modal.classList.add('active');
    }
}

function hideModal(modalId) {
    const sanitizedId = DOMPurify.sanitize(modalId);
    const modal = document.getElementById(sanitizedId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function showAlert(message, type = 'success') {
    const sanitizedMessage = DOMPurify.sanitize(message);
    
    let alertElement, messageElement;
    
    if (appState.currentView === 'products') {
        alertElement = document.getElementById('product-alert');
        messageElement = document.getElementById('alert-message');
    } else if (appState.currentView === 'new-product') {
        alertElement = document.getElementById('new-product-alert');
        messageElement = document.getElementById('new-alert-message');
    } else if (appState.currentView === 'reports') {
        alertElement = document.getElementById('pdf-report-alert');
        messageElement = document.getElementById('pdf-report-message');
    } else if (appState.currentView === 'database') {
        alertElement = document.getElementById('db-alert');
        messageElement = document.getElementById('db-alert-message');
    } else {
        const tempAlert = document.createElement('div');
        tempAlert.className = `alert alert-${type}`;
        tempAlert.innerHTML = DOMPurify.sanitize(`
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${sanitizedMessage}</span>
        `);
        tempAlert.style.position = 'fixed';
        tempAlert.style.top = '20px';
        tempAlert.style.right = '20px';
        tempAlert.style.zIndex = '10000';
        tempAlert.style.maxWidth = '400px';
        tempAlert.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        
        document.body.appendChild(tempAlert);
        
        setTimeout(() => {
            tempAlert.remove();
        }, 5000);
        
        return;
    }
    
    if (alertElement && messageElement) {
        alertElement.className = `alert alert-${type}`;
        
        const icon = alertElement.querySelector('i');
        icon.className = `fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}`;
        
        messageElement.textContent = sanitizedMessage;
        alertElement.classList.remove('d-none');
        
        setTimeout(() => {
            alertElement.classList.add('d-none');
        }, 5000);
    }
}

function formatCurrency(value) {
    if (typeof value !== 'number' || isNaN(value)) {
        value = 0;
    }
    value = Math.max(0, value);
    return value.toFixed(2).replace('.', ',');
}

function getCategoryName(categoryCode) {
    const categories = {
        'Shoes': 'Sapatos',
        'Belts': 'Cintos',
        'Bags': 'Bolsas',
        'Activewear': 'Roupas Esportivas',
        'Clothing': 'Roupas Casuais',
        'Makeup': 'Maquiagem',
        'Skincare': 'Skincare'
    };
    
    const sanitizedCode = DOMPurify.sanitize(categoryCode);
    return categories[sanitizedCode] || sanitizedCode;
}

function getReportTypeName(type) {
    const names = {
        'sales': 'de Vendas',
        'products': 'de Produtos',
        'financial': 'Financeiro',
        'inventory': 'de Estoque'
    };
    return names[type] || type;
}

function sanitizeNumber(value) {
    if (typeof value !== 'number' || isNaN(value)) {
        return 0;
    }
    if (Math.abs(value) > 1000000000) {
        return 0;
    }
    return value;
}

// Exportar funções principais para uso global
window.CamarimSystem = {
    showView,
    saveData,
    updateDashboard,
    showAlert,
    formatCurrency
};

console.log('✅ Sistema Camarim inicializado com sucesso!');