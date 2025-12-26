// drive-manager.js
// Sistema de Backup com Google Drive para Camarim Boutique

// ============================================
// CONFIGURAÇÃO DA API DO GOOGLE DRIVE
// ============================================

// Configuração do Google Drive API
const GOOGLE_CLIENT_ID = '821978818510-oo69bs0uln83avvst0obpjmq9amgtg8c.apps.googleusercontent.com'; // Substitua com seu Client ID
const GOOGLE_API_KEY = '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'; // Substitua com sua API Key
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

// Estado do Google Drive
let googleDriveState = {
    gapiLoaded: false,
    signedIn: false,
    userEmail: null,
    lastBackup: null,
    backups: [],
    backupSettings: {
        frequency: 'none',
        retention: 30,
        lastAutoBackup: null
    }
};

// ============================================
// INICIALIZAÇÃO DO GOOGLE DRIVE
// ============================================

// Inicializar Google API
function initGoogleDrive() {
    console.log('🚀 Inicializando Google Drive Manager...');
    
    // Verificar se já existe no localStorage
    loadDriveStateFromStorage();
    
    // Carregar a biblioteca gapi
    if (!window.gapi) {
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = loadGAPI;
        script.onerror = handleGAPILoadError;
        document.head.appendChild(script);
    } else {
        loadGAPI();
    }
}

function loadGAPI() {
    if (window.gapi) {
        gapi.load('client:auth2', initGAPIClient);
    } else {
        console.error('❌ Biblioteca gapi não carregada');
        updateDriveUI();
    }
}

function handleGAPILoadError() {
    console.error('❌ Erro ao carregar Google API');
    googleDriveState.gapiLoaded = false;
    updateDriveUI();
}

async function initGAPIClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            clientId: GOOGLE_CLIENT_ID,
            discoveryDocs: DISCOVERY_DOCS,
            scope: SCOPES
        });
        
        googleDriveState.gapiLoaded = true;
        console.log('✅ Google Drive API carregada com sucesso');
        
        // Verificar se já está autenticado
        const authInstance = gapi.auth2.getAuthInstance();
        const isSignedIn = authInstance.isSignedIn.get();
        
        if (isSignedIn) {
            const user = authInstance.currentUser.get();
            googleDriveState.signedIn = true;
            googleDriveState.userEmail = user.getBasicProfile().getEmail();
            console.log(`✅ Usuário autenticado: ${googleDriveState.userEmail}`);
            
            // Carregar configurações e backups
            await loadDriveSettings();
            await listDriveBackups();
        }
        
        updateDriveUI();
        saveDriveStateToStorage();
        
    } catch (error) {
        console.error('❌ Erro ao inicializar Google Drive API:', error);
        googleDriveState.gapiLoaded = false;
        updateDriveUI();
        saveDriveStateToStorage();
    }
}

// ============================================
// GERENCIAMENTO DE ESTADO LOCAL
// ============================================

function loadDriveStateFromStorage() {
    try {
        const savedState = localStorage.getItem('camarim-drive-state');
        if (savedState) {
            const parsed = JSON.parse(savedState);
            googleDriveState.backupSettings = parsed.backupSettings || googleDriveState.backupSettings;
            googleDriveState.lastBackup = parsed.lastBackup || null;
        }
    } catch (error) {
        console.error('❌ Erro ao carregar estado do Drive:', error);
    }
}

function saveDriveStateToStorage() {
    try {
        const stateToSave = {
            backupSettings: googleDriveState.backupSettings,
            lastBackup: googleDriveState.lastBackup,
            userEmail: googleDriveState.userEmail,
            signedIn: googleDriveState.signedIn
        };
        localStorage.setItem('camarim-drive-state', JSON.stringify(stateToSave));
    } catch (error) {
        console.error('❌ Erro ao salvar estado do Drive:', error);
    }
}

// ============================================
// INTERFACE DO USUÁRIO
// ============================================

function updateDriveUI() {
    const authStatus = document.getElementById('drive-auth-status');
    const authSection = document.getElementById('drive-auth-section');
    const backupSection = document.getElementById('drive-backup-section');
    
    if (!authStatus || !authSection || !backupSection) return;
    
    if (!googleDriveState.gapiLoaded) {
        authStatus.innerHTML = `
            <i class="fas fa-exclamation-triangle backup-warning"></i>
            <span>Google Drive API não carregada. Verifique sua conexão.</span>
        `;
        authSection.classList.add('d-none');
        backupSection.classList.add('d-none');
        return;
    }
    
    if (googleDriveState.signedIn) {
        authStatus.innerHTML = `
            <i class="fas fa-check-circle backup-success"></i>
            <span>Conectado como: <strong>${googleDriveState.userEmail}</strong></span>
        `;
        authStatus.classList.add('drive-status-connected');
        authSection.classList.add('d-none');
        backupSection.classList.remove('d-none');
        
        // Atualizar informações de backup
        updateBackupInfo();
        
    } else {
        authStatus.innerHTML = `
            <i class="fas fa-info-circle backup-info"></i>
            <span>Não conectado ao Google Drive</span>
        `;
        authStatus.classList.add('drive-status-disconnected');
        authSection.classList.remove('d-none');
        backupSection.classList.add('d-none');
    }
    
    saveDriveStateToStorage();
}

function updateBackupInfo() {
    const lastBackupInfo = document.getElementById('last-backup-info');
    const availableBackups = document.getElementById('available-backups');
    
    if (lastBackupInfo) {
        if (googleDriveState.lastBackup) {
            const date = new Date(googleDriveState.lastBackup);
            lastBackupInfo.textContent = `Último: ${date.toLocaleDateString('pt-BR')}`;
        } else {
            lastBackupInfo.textContent = 'Nenhum backup';
        }
    }
    
    if (availableBackups) {
        if (googleDriveState.backups.length > 0) {
            availableBackups.textContent = `${googleDriveState.backups.length} backup(s) disponível(is)`;
        } else {
            availableBackups.textContent = 'Nenhum backup';
        }
    }
}

// ============================================
// AUTENTICAÇÃO
// ============================================

// Autenticar com Google
async function authenticateGoogleDrive() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        const user = await authInstance.signIn();
        
        googleDriveState.signedIn = true;
        googleDriveState.userEmail = user.getBasicProfile().getEmail();
        
        console.log(`✅ Autenticado: ${googleDriveState.userEmail}`);
        
        // Carregar configurações e backups
        await loadDriveSettings();
        await listDriveBackups();
        
        updateDriveUI();
        saveDriveStateToStorage();
        
        showAlert('Conectado ao Google Drive com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro na autenticação:', error);
        showAlert('Erro ao conectar com Google Drive: ' + (error.error || error.message), 'error');
    }
}

// Desconectar do Google
async function signOutGoogleDrive() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        
        googleDriveState.signedIn = false;
        googleDriveState.userEmail = null;
        googleDriveState.backups = [];
        googleDriveState.lastBackup = null;
        
        updateDriveUI();
        saveDriveStateToStorage();
        
        showAlert('Desconectado do Google Drive', 'info');
        
    } catch (error) {
        console.error('❌ Erro ao desconectar:', error);
        showAlert('Erro ao desconectar do Google Drive', 'error');
    }
}

// ============================================
// OPERAÇÕES DE BACKUP
// ============================================

// Listar backups no Google Drive
async function listDriveBackups() {
    try {
        const response = await gapi.client.drive.files.list({
            q: "name contains 'camarim-backup-' and mimeType='application/json'",
            fields: 'files(id, name, createdTime, modifiedTime, size)',
            orderBy: 'createdTime desc',
            pageSize: 50
        });
        
        googleDriveState.backups = response.result.files || [];
        
        // Encontrar último backup
        if (googleDriveState.backups.length > 0) {
            googleDriveState.lastBackup = googleDriveState.backups[0].createdTime;
            renderBackupList();
        }
        
        saveDriveStateToStorage();
        return googleDriveState.backups;
        
    } catch (error) {
        console.error('❌ Erro ao listar backups:', error);
        showAlert('Erro ao listar backups do Google Drive', 'error');
        return [];
    }
}

// Renderizar lista de backups
function renderBackupList() {
    const backupList = document.getElementById('backup-list');
    const backupListContainer = document.getElementById('backup-list-container');
    
    if (!backupList || !backupListContainer) return;
    
    if (googleDriveState.backups.length === 0) {
        backupList.innerHTML = '<p class="text-center" style="padding: 20px;">Nenhum backup encontrado</p>';
        backupListContainer.classList.add('d-none');
        return;
    }
    
    backupListContainer.classList.remove('d-none');
    
    let html = '';
    googleDriveState.backups.forEach((file, index) => {
        const date = new Date(file.createdTime);
        const size = file.size ? (parseInt(file.size) / 1024).toFixed(1) + ' KB' : 'Desconhecido';
        
        html += `
            <div class="drive-file-item" data-file-id="${file.id}">
                <div class="drive-file-info">
                    <h5>${file.name.replace('.json', '')}</h5>
                    <div class="file-date">${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</div>
                </div>
                <div class="drive-file-actions">
                    <span class="file-size">${size}</span>
                    <button class="btn btn-small btn-success restore-backup-btn" data-file-id="${file.id}" title="Restaurar este backup">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn btn-small btn-danger delete-backup-btn" data-file-id="${file.id}" title="Excluir este backup">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    backupList.innerHTML = html;
    
    // Adicionar event listeners
    setTimeout(() => {
        document.querySelectorAll('.restore-backup-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const fileId = this.getAttribute('data-file-id');
                restoreFromDrive(fileId);
            });
        });
        
        document.querySelectorAll('.delete-backup-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const fileId = this.getAttribute('data-file-id');
                deleteDriveBackup(fileId);
            });
        });
        
        document.querySelectorAll('.drive-file-item').forEach(item => {
            item.addEventListener('click', function() {
                const fileId = this.getAttribute('data-file-id');
                showBackupDetails(fileId);
            });
        });
    }, 100);
}

// Fazer backup para o Google Drive
async function backupToDrive() {
    if (!googleDriveState.signedIn) {
        showAlert('Conecte-se ao Google Drive primeiro', 'error');
        return;
    }
    
    try {
        showAlert('Criando backup no Google Drive...', 'info');
        
        // Preparar dados para backup
        const backupData = {
            ...systemData,
            backupInfo: {
                created: new Date().toISOString(),
                totalProducts: systemData.products.length,
                totalSales: systemData.sales.length,
                appVersion: '1.0'
            }
        };
        
        const backupStr = JSON.stringify(backupData, null, 2);
        const fileName = `camarim-backup-${new Date().toISOString().slice(0,19).replace(/[:.]/g, '-')}.json`;
        
        // Criar arquivo no Google Drive
        const fileMetadata = {
            name: fileName,
            mimeType: 'application/json',
            description: 'Backup do Sistema Camarim',
            parents: ['root'] // Salvar na raiz do Drive
        };
        
        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            media: {
                mimeType: 'application/json',
                body: backupStr
            },
            fields: 'id, name, createdTime'
        });
        
        googleDriveState.lastBackup = response.result.createdTime;
        
        // Adicionar à lista local
        googleDriveState.backups.unshift({
            id: response.result.id,
            name: response.result.name,
            createdTime: response.result.createdTime
        });
        
        // Limitar número de backups antigos
        await cleanupOldBackups();
        
        updateBackupInfo();
        renderBackupList();
        saveDriveStateToStorage();
        
        showAlert(`Backup "${fileName}" criado com sucesso no Google Drive!`, 'success');
        
        // Salvar configurações
        await saveDriveSettings();
        
    } catch (error) {
        console.error('❌ Erro ao fazer backup:', error);
        showAlert('Erro ao criar backup no Google Drive: ' + error.message, 'error');
    }
}

// Restaurar backup do Google Drive
async function restoreFromDrive(fileId) {
    if (!systemData) {
        showAlert('Sistema não inicializado corretamente', 'error');
        return;
    }
    
    if (!confirm('ATENÇÃO: Esta ação irá substituir TODOS os dados atuais. Deseja continuar?')) {
        return;
    }
    
    try {
        showAlert('Restaurando backup do Google Drive...', 'info');
        
        // Baixar arquivo do Google Drive
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        const importData = response.result;
        
        // Validar estrutura
        if (!importData.products || !Array.isArray(importData.products)) {
            throw new Error('Arquivo de backup inválido');
        }
        
        // Atualizar systemData (deve estar disponível globalmente)
        if (window.systemData) {
            window.systemData = {
                products: importData.products || [],
                sales: importData.sales || [],
                settings: importData.settings || window.systemData.settings
            };
            
            // Salvar dados localmente
            if (window.saveData) {
                await window.saveData();
            }
            
            // Recarregar views (se as funções estiverem disponíveis)
            if (window.loadData) window.loadData();
            if (window.updateDashboard) window.updateDashboard();
            if (window.updateProductsList) window.updateProductsList();
            if (window.updateSalesList) window.updateSalesList();
            if (window.updateInventorySummary) window.updateInventorySummary();
        }
        
        showAlert('Backup restaurado com sucesso!', 'success');
        
        // Fechar modal
        hideModal('google-drive-modal');
        
    } catch (error) {
        console.error('❌ Erro ao restaurar backup:', error);
        showAlert('Erro ao restaurar backup: ' + error.message, 'error');
    }
}

// Excluir backup do Google Drive
async function deleteDriveBackup(fileId) {
    if (!confirm('Tem certeza que deseja excluir este backup?')) {
        return;
    }
    
    try {
        await gapi.client.drive.files.delete({
            fileId: fileId
        });
        
        // Remover da lista local
        googleDriveState.backups = googleDriveState.backups.filter(b => b.id !== fileId);
        
        // Atualizar interface
        renderBackupList();
        updateBackupInfo();
        saveDriveStateToStorage();
        
        showAlert('Backup excluído com sucesso', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao excluir backup:', error);
        showAlert('Erro ao excluir backup: ' + error.message, 'error');
    }
}

// Limpar backups antigos
async function cleanupOldBackups() {
    const retentionDays = googleDriveState.backupSettings.retention || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const oldBackups = googleDriveState.backups.filter(backup => {
        const backupDate = new Date(backup.createdTime);
        return backupDate < cutoffDate;
    });
    
    for (const backup of oldBackups) {
        try {
            await gapi.client.drive.files.delete({
                fileId: backup.id
            });
            console.log(`🗑️ Backup antigo excluído: ${backup.name}`);
        } catch (error) {
            console.error(`❌ Erro ao excluir backup antigo: ${backup.name}`, error);
        }
    }
    
    // Atualizar lista
    googleDriveState.backups = googleDriveState.backups.filter(backup => {
        const backupDate = new Date(backup.createdTime);
        return backupDate >= cutoffDate;
    });
    
    saveDriveStateToStorage();
}

// ============================================
// CONFIGURAÇÕES
// ============================================

// Carregar configurações do backup
async function loadDriveSettings() {
    try {
        // Verificar se existe arquivo de configurações
        const response = await gapi.client.drive.files.list({
            q: "name = 'camarim-drive-settings.json'",
            fields: 'files(id)',
            pageSize: 1
        });
        
        if (response.result.files && response.result.files.length > 0) {
            const settingsFile = await gapi.client.drive.files.get({
                fileId: response.result.files[0].id,
                alt: 'media'
            });
            
            googleDriveState.backupSettings = settingsFile.result;
            
            // Atualizar campos do formulário
            const frequencySelect = document.getElementById('backup-frequency');
            const retentionInput = document.getElementById('backup-retention');
            
            if (frequencySelect) frequencySelect.value = googleDriveState.backupSettings.frequency;
            if (retentionInput) retentionInput.value = googleDriveState.backupSettings.retention;
        }
        
        saveDriveStateToStorage();
        
    } catch (error) {
        console.log('📭 Nenhuma configuração salva encontrada, usando padrões');
    }
}

// Salvar configurações do backup
async function saveDriveSettings() {
    try {
        const frequencySelect = document.getElementById('backup-frequency');
        const retentionInput = document.getElementById('backup-retention');
        
        googleDriveState.backupSettings = {
            frequency: frequencySelect ? frequencySelect.value : 'none',
            retention: retentionInput ? parseInt(retentionInput.value) : 30,
            lastAutoBackup: googleDriveState.backupSettings.lastAutoBackup,
            userEmail: googleDriveState.userEmail
        };
        
        const settingsStr = JSON.stringify(googleDriveState.backupSettings, null, 2);
        
        // Verificar se já existe arquivo de configurações
        const listResponse = await gapi.client.drive.files.list({
            q: "name = 'camarim-drive-settings.json'",
            fields: 'files(id)',
            pageSize: 1
        });
        
        let fileId;
        if (listResponse.result.files && listResponse.result.files.length > 0) {
            // Atualizar arquivo existente
            fileId = listResponse.result.files[0].id;
            
            await gapi.client.drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'application/json',
                    body: settingsStr
                }
            });
        } else {
            // Criar novo arquivo
            const createResponse = await gapi.client.drive.files.create({
                resource: {
                    name: 'camarim-drive-settings.json',
                    mimeType: 'application/json',
                    parents: ['root']
                },
                media: {
                    mimeType: 'application/json',
                    body: settingsStr
                }
            });
            
            fileId = createResponse.result.id;
        }
        
        saveDriveStateToStorage();
        showAlert('Configurações do Google Drive salvas com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar configurações:', error);
        showAlert('Erro ao salvar configurações do Google Drive', 'error');
    }
}

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

async function showBackupDetails(fileId) {
    try {
        const file = googleDriveState.backups.find(b => b.id === fileId);
        if (!file) return;
        
        // Tentar baixar parte do arquivo para mostrar detalhes
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        const backupData = response.result;
        const date = new Date(file.createdTime);
        
        let detailsHTML = `
            <div class="alert alert-success">
                <h4>${file.name}</h4>
                <p><strong>Data:</strong> ${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}</p>
                <p><strong>Produtos:</strong> ${backupData.products?.length || 0}</p>
                <p><strong>Vendas:</strong> ${backupData.sales?.length || 0}</p>
        `;
        
        if (backupData.backupInfo) {
            detailsHTML += `
                <p><strong>Versão:</strong> ${backupData.backupInfo.appVersion || '1.0'}</p>
                <p><strong>Criado em:</strong> ${new Date(backupData.backupInfo.created).toLocaleString('pt-BR')}</p>
            `;
        }
        
        detailsHTML += `</div>`;
        
        showModalWithContent('Detalhes do Backup', detailsHTML);
        
    } catch (error) {
        console.error('❌ Erro ao mostrar detalhes:', error);
        showAlert('Erro ao carregar detalhes do backup', 'error');
    }
}

function showModalWithContent(title, content) {
    // Criar modal dinâmico
    const modalHTML = `
        <div class="modal active" id="details-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="document.getElementById('details-modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-light" onclick="document.getElementById('details-modal').remove()">Fechar</button>
                </div>
            </div>
        </div>
    `;
    
    // Adicionar ao body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
}

// Verificar e executar backup automático
async function checkAutoBackup() {
    if (!googleDriveState.signedIn || googleDriveState.backupSettings.frequency === 'none') {
        return;
    }
    
    const now = new Date();
    const lastBackup = googleDriveState.backupSettings.lastAutoBackup ? 
        new Date(googleDriveState.backupSettings.lastAutoBackup) : null;
    
    let needsBackup = false;
    
    switch(googleDriveState.backupSettings.frequency) {
        case 'daily':
            needsBackup = !lastBackup || now.getDate() !== lastBackup.getDate();
            break;
        case 'weekly':
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            needsBackup = !lastBackup || lastBackup < weekAgo;
            break;
        case 'monthly':
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            needsBackup = !lastBackup || lastBackup < monthAgo;
            break;
    }
    
    if (needsBackup) {
        console.log('🔄 Executando backup automático...');
        await backupToDrive();
        googleDriveState.backupSettings.lastAutoBackup = now.toISOString();
        await saveDriveSettings();
    }
}

// ============================================
// FUNÇÕES PÚBLICAS (INTERFACE)
// ============================================

// Interface pública do módulo Google Drive
window.GoogleDriveManager = {
    init: initGoogleDrive,
    authenticate: authenticateGoogleDrive,
    signOut: signOutGoogleDrive,
    backup: backupToDrive,
    restore: restoreFromDrive,
    listBackups: listDriveBackups,
    updateUI: updateDriveUI,
    checkAutoBackup: checkAutoBackup,
    getState: () => googleDriveState,
    isAuthenticated: () => googleDriveState.signedIn
};

// ============================================
// INICIALIZAÇÃO AUTOMÁTICA
// ============================================

// Inicializar quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar Google Drive após um pequeno delay
    setTimeout(() => {
        if (typeof initGoogleDrive === 'function') {
            initGoogleDrive();
        }
    }, 2000);
    
    // Verificar backup automático periodicamente
    setInterval(() => {
        if (googleDriveState.signedIn && typeof checkAutoBackup === 'function') {
            checkAutoBackup();
        }
    }, 60 * 60 * 1000); // 1 hora
});

// Expor funções globais necessárias
window.authenticateGoogleDrive = authenticateGoogleDrive;
window.signOutGoogleDrive = signOutGoogleDrive;
window.backupToDrive = backupToDrive;
window.restoreFromDrive = restoreFromDrive;

// ============================================
// CARREGAMENTO DINÂMICO DO MODAL
// ============================================

async function loadDriveModal() {
    try {
        const response = await fetch('drive-modal.html');
        const modalHTML = await response.text();
        
        const container = document.getElementById('drive-modal-container');
        if (container) {
            container.innerHTML = modalHTML;
            initializeDriveModal();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar modal do Drive:', error);
        // Criar modal básico se o arquivo não carregar
        createBasicDriveModal();
    }
}

function initializeDriveModal() {
    // Atualizar email do usuário se estiver autenticado
    const userEmailElement = document.getElementById('drive-user-email');
    if (userEmailElement && googleDriveState.userEmail) {
        userEmailElement.textContent = googleDriveState.userEmail;
    }
    
    // Atualizar contagem de backups
    const backupCountElement = document.getElementById('drive-backup-count');
    if (backupCountElement) {
        backupCountElement.textContent = googleDriveState.backups.length;
    }
    
    // Atualizar barra de uso
    updateDriveUsageBar();
    
    // Configurar event listeners do modal
    setupDriveModalListeners();
}

function createBasicDriveModal() {
    const basicModal = `
        <div class="modal" id="google-drive-modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Google Drive Backup</h3>
                    <button class="modal-close" data-modal="google-drive-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Modal do Google Drive não carregado. Recarregue a página.</span>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-light" data-modal="google-drive-modal">Fechar</button>
                </div>
            </div>
        </div>
    `;
    
    const container = document.getElementById('drive-modal-container');
    if (container) {
        container.innerHTML = basicModal;
    }
}

function updateDriveUsageBar() {
    const usageBar = document.getElementById('drive-usage-bar');
    const usageText = document.getElementById('drive-usage-text');
    
    if (!usageBar || !usageText) return;
    
    // Estimativa: cada backup ~10-100KB
    const estimatedSize = googleDriveState.backups.length * 50; // 50KB médio
    const usagePercentage = Math.min(100, (estimatedSize / (15 * 1024)) * 100); // 15GB limite
    
    usageBar.style.width = `${usagePercentage}%`;
    usageText.textContent = `Estimativa de uso: ${estimatedSize.toFixed(1)} KB`;
}

function setupDriveModalListeners() {
    // Botão de autenticação
    const authBtn = document.getElementById('drive-auth-btn');
    if (authBtn) {
        authBtn.addEventListener('click', authenticateGoogleDrive);
    }
    
    // Botão de desconectar
    const signoutBtn = document.getElementById('drive-signout-btn');
    if (signoutBtn) {
        signoutBtn.addEventListener('click', signOutGoogleDrive);
    }
    
    // Cards de backup/restauração
    const backupCard = document.getElementById('backup-now-card');
    if (backupCard) {
        backupCard.addEventListener('click', backupToDrive);
    }
    
    const restoreCard = document.getElementById('restore-drive-card');
    if (restoreCard) {
        restoreCard.addEventListener('click', function() {
            const container = document.getElementById('backup-list-container');
            if (container) {
                container.classList.toggle('d-none');
                if (!container.classList.contains('d-none')) {
                    listDriveBackups();
                }
            }
        });
    }
    
    // Botão salvar configurações
    const saveSettingsBtn = document.getElementById('save-drive-settings');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveDriveSettings);
        saveSettingsBtn.disabled = false;
    }
}

// Carregar modal quando o sistema estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        loadDriveModal();
    }, 1000);
});