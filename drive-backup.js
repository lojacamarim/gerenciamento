// ============================================
// SISTEMA DE BACKUP NO GOOGLE DRIVE
// ============================================

let driveBackup = {
    isInitialized: false,
    accessToken: null,
    clientId: '821978818510-ia36jn3fn9ucqgl27jmtbaqeee9kujmp.apps.googleusercontent.com', // Substituir pelo seu Client ID
    apiKey: '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', // Substituir pela sua API Key
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    scope: 'https://www.googleapis.com/auth/drive.file',
    folderName: 'Camarim-Backup-System',
    folderId: null,
    backups: [],
    
    // Inicializar cliente Google API
    init: async function() {
        console.log('🔄 Inicializando Google Drive Backup System...');
        
        return new Promise((resolve, reject) => {
            // Carregar biblioteca Google API
            if (!window.gapi) {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.onload = () => {
                    this.loadClient().then(resolve).catch(reject);
                };
                script.onerror = () => {
                    console.error('❌ Erro ao carregar Google API');
                    reject(new Error('Não foi possível carregar Google API'));
                };
                document.head.appendChild(script);
            } else {
                this.loadClient().then(resolve).catch(reject);
            }
        });
    },
    
    // Carregar cliente Google
    loadClient: async function() {
        return new Promise((resolve, reject) => {
            gapi.load('client:auth2', async () => {
                try {
                    await gapi.client.init({
                        apiKey: this.apiKey,
                        clientId: this.clientId,
                        discoveryDocs: this.discoveryDocs,
                        scope: this.scope
                    });
                    
                    // Verificar se já está logado
                    const authInstance = gapi.auth2.getAuthInstance();
                    if (authInstance.isSignedIn.get()) {
                        this.accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
                        await this.setupDriveFolder();
                        this.isInitialized = true;
                        console.log('✅ Google Drive conectado');
                    }
                    
                    resolve();
                } catch (error) {
                    console.error('❌ Erro ao inicializar cliente Google:', error);
                    reject(error);
                }
            });
        });
    },
    
    // Fazer login no Google Drive
    login: async function() {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            const user = await authInstance.signIn();
            this.accessToken = user.getAuthResponse().access_token;
            
            await this.setupDriveFolder();
            this.isInitialized = true;
            
            console.log('✅ Login Google Drive realizado com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro no login Google Drive:', error);
            return false;
        }
    },
    
    // Fazer logout do Google Drive
    logout: async function() {
        try {
            const authInstance = gapi.auth2.getAuthInstance();
            await authInstance.signOut();
            
            this.accessToken = null;
            this.isInitialized = false;
            this.folderId = null;
            this.backups = [];
            
            console.log('✅ Logout Google Drive realizado');
            return true;
        } catch (error) {
            console.error('❌ Erro no logout Google Drive:', error);
            return false;
        }
    },
    
    // Criar ou obter pasta de backups
    setupDriveFolder: async function() {
        try {
            console.log('📁 Verificando pasta de backups no Drive...');
            
            // Procurar pasta existente
            const response = await gapi.client.drive.files.list({
                q: `name='${this.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });
            
            if (response.result.files.length > 0) {
                this.folderId = response.result.files[0].id;
                console.log(`✅ Pasta encontrada: ${this.folderId}`);
            } else {
                // Criar nova pasta
                const createResponse = await gapi.client.drive.files.create({
                    resource: {
                        name: this.folderName,
                        mimeType: 'application/vnd.google-apps.folder'
                    },
                    fields: 'id'
                });
                
                this.folderId = createResponse.result.id;
                console.log(`✅ Nova pasta criada: ${this.folderId}`);
            }
            
            return this.folderId;
        } catch (error) {
            console.error('❌ Erro ao configurar pasta no Drive:', error);
            throw error;
        }
    },
    
    // Listar todos os backups disponíveis
    listBackups: async function() {
        if (!this.isInitialized || !this.folderId) {
            throw new Error('Drive não inicializado. Faça login primeiro.');
        }
        
        try {
            const response = await gapi.client.drive.files.list({
                q: `'${this.folderId}' in parents and name contains 'camarim-backup' and mimeType='application/json' and trashed=false`,
                fields: 'files(id, name, createdTime, modifiedTime, size)',
                orderBy: 'createdTime desc',
                spaces: 'drive'
            });
            
            this.backups = response.result.files.map(file => ({
                id: file.id,
                name: file.name,
                createdTime: new Date(file.createdTime),
                modifiedTime: new Date(file.modifiedTime),
                size: parseInt(file.size) || 0,
                readableSize: this.formatFileSize(parseInt(file.size) || 0)
            }));
            
            console.log(`📦 ${this.backups.length} backups encontrados`);
            return this.backups;
        } catch (error) {
            console.error('❌ Erro ao listar backups:', error);
            throw error;
        }
    },
    
    // Criar novo backup
    createBackup: async function(data, description = '') {
        if (!this.isInitialized || !this.folderId) {
            throw new Error('Drive não inicializado. Faça login primeiro.');
        }
        
        try {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const fileName = `camarim-backup-${timestamp}.json`;
            
            // Adicionar metadados ao backup
            const backupData = {
                ...data,
                _backupMetadata: {
                    created: new Date().toISOString(),
                    system: 'Camarim Boutique Management System',
                    version: '1.0',
                    description: description,
                    productCount: data.products?.length || 0,
                    saleCount: data.sales?.length || 0
                }
            };
            
            const fileContent = JSON.stringify(backupData, null, 2);
            const blob = new Blob([fileContent], { type: 'application/json' });
            
            // Criar metadados do arquivo
            const metadata = {
                name: fileName,
                mimeType: 'application/json',
                parents: [this.folderId],
                description: `Backup Camarim - ${description || timestamp}`
            };
            
            // Converter Blob para base64
            const base64Data = await this.blobToBase64(blob);
            
            // Fazer upload usando multipart upload
            const boundary = '-------314159265358979323846';
            const delimiter = "\r\n--" + boundary + "\r\n";
            const close_delim = "\r\n--" + boundary + "--";
            
            const multipartRequestBody =
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                JSON.stringify(metadata) +
                delimiter +
                'Content-Type: application/json\r\n\r\n' +
                base64Data +
                close_delim;
            
            const request = gapi.client.request({
                path: '/upload/drive/v3/files',
                method: 'POST',
                params: {
                    uploadType: 'multipart'
                },
                headers: {
                    'Content-Type': 'multipart/related; boundary="' + boundary + '"'
                },
                body: multipartRequestBody
            });
            
            const response = await request;
            console.log('✅ Backup criado com sucesso:', response.result.name);
            
            // Atualizar lista de backups
            await this.listBackups();
            
            return {
                success: true,
                fileId: response.result.id,
                fileName: response.result.name,
                createdTime: new Date()
            };
        } catch (error) {
            console.error('❌ Erro ao criar backup:', error);
            throw error;
        }
    },
    
    // Restaurar backup específico
    restoreBackup: async function(fileId) {
        if (!this.isInitialized) {
            throw new Error('Drive não inicializado. Faça login primeiro.');
        }
        
        try {
            console.log(`🔄 Restaurando backup: ${fileId}`);
            
            // Baixar arquivo
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            
            const backupData = response.result;
            
            // Validar estrutura do backup
            if (!backupData.products || !Array.isArray(backupData.products)) {
                throw new Error('Arquivo de backup inválido: estrutura de produtos ausente');
            }
            
            // Remover metadados de backup se existirem
            if (backupData._backupMetadata) {
                delete backupData._backupMetadata;
            }
            
            console.log(`✅ Backup carregado: ${backupData.products.length} produtos, ${backupData.sales?.length || 0} vendas`);
            
            return backupData;
        } catch (error) {
            console.error('❌ Erro ao restaurar backup:', error);
            throw error;
        }
    },
    
    // Excluir backup
    deleteBackup: async function(fileId) {
        if (!this.isInitialized) {
            throw new Error('Drive não inicializado. Faça login primeiro.');
        }
        
        try {
            await gapi.client.drive.files.delete({
                fileId: fileId
            });
            
            console.log('🗑️ Backup excluído com sucesso');
            
            // Atualizar lista de backups
            await this.listBackups();
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao excluir backup:', error);
            throw error;
        }
    },
    
    // Obter informações de uso do Drive
    getDriveUsage: async function() {
        if (!this.isInitialized) {
            return null;
        }
        
        try {
            const response = await gapi.client.drive.about.get({
                fields: 'storageQuota'
            });
            
            const quota = response.result.storageQuota;
            return {
                used: parseInt(quota.usageInDrive),
                total: parseInt(quota.limit),
                usedPercentage: quota.limit ? (parseInt(quota.usageInDrive) / parseInt(quota.limit) * 100).toFixed(1) : 0
            };
        } catch (error) {
            console.error('❌ Erro ao obter uso do Drive:', error);
            return null;
        }
    },
    
    // Formatar tamanho do arquivo
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    // Converter Blob para base64
    blobToBase64: function(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result.split(',')[1];
                resolve(base64data);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    },
    
    // Verificar status da conexão
    getStatus: function() {
        return {
            isInitialized: this.isInitialized,
            isLoggedIn: this.accessToken !== null,
            folderId: this.folderId,
            backupsCount: this.backups.length
        };
    }
};

// ============================================
// INTEGRAÇÃO COM O SISTEMA CAMARIM
// ============================================

// Registrar sistema de backup no window
window.CamarimDriveBackup = driveBackup;

// Modificar o sistema existente para integrar com o Drive
document.addEventListener('DOMContentLoaded', async function() {
    // Aguardar carregamento do sistema principal
    setTimeout(async () => {
        await integrateDriveBackup();
    }, 1000);
});

async function integrateDriveBackup() {
    console.log('🔄 Integrando Google Drive Backup com o sistema Camarim...');
    
    // Adicionar botão de backup no header se não existir
    const headerButtons = document.querySelector('.header-buttons');
    if (headerButtons && !document.getElementById('drive-backup-btn')) {
        const backupBtn = document.createElement('button');
        backupBtn.id = 'drive-backup-btn';
        backupBtn.className = 'btn btn-primary';
        backupBtn.innerHTML = '<i class="fab fa-google-drive"></i> Drive Backup';
        backupBtn.title = 'Backup no Google Drive';
        backupBtn.style.marginLeft = '10px';
        backupBtn.addEventListener('click', () => showDriveBackupModal());
        headerButtons.appendChild(backupBtn);
    }
    
    // Adicionar item no menu de banco de dados
    const databaseView = document.getElementById('database-view');
    if (databaseView && !document.getElementById('drive-backup-section')) {
        const driveSection = document.createElement('div');
        driveSection.id = 'drive-backup-section';
        driveSection.className = 'database-section';
        driveSection.innerHTML = `
            <h3><i class="fab fa-google-drive"></i> Google Drive Backup</h3>
            <div id="drive-status-container">
                <div class="alert alert-info">
                    <i class="fas fa-sync"></i>
                    <span>Inicializando sistema de backup...</span>
                </div>
            </div>
            <div id="drive-backup-controls" style="display: none;">
                <div class="form-group">
                    <label for="backup-description">Descrição do Backup (opcional):</label>
                    <input type="text" id="backup-description" class="form-control" placeholder="Ex: Backup antes de alterações">
                </div>
                <div class="button-group">
                    <button id="create-backup-btn" class="btn btn-success">
                        <i class="fas fa-cloud-upload-alt"></i> Criar Backup no Drive
                    </button>
                    <button id="refresh-backups-btn" class="btn btn-info">
                        <i class="fas fa-sync"></i> Atualizar Lista
                    </button>
                </div>
                <div id="drive-usage-info" class="mt-20"></div>
            </div>
            <div id="drive-backups-list" class="mt-20">
                <h4>Backups Disponíveis</h4>
                <div id="backups-list-container" class="card-list">
                    <div class="text-center text-muted">
                        <i class="fas fa-spinner fa-spin"></i>
                        Carregando backups...
                    </div>
                </div>
            </div>
        `;
        databaseView.appendChild(driveSection);
    }
    
    // Inicializar sistema de backup
    try {
        await driveBackup.init();
        updateDriveStatus();
        
        // Se já estiver logado, carregar backups
        if (driveBackup.isInitialized) {
            await loadDriveBackups();
            updateDriveUsage();
        }
    } catch (error) {
        console.warn('⚠️ Não foi possível inicializar Google Drive Backup:', error);
        updateDriveStatus(false, 'Google Drive não disponível');
    }
    
    // Configurar event listeners
    setupDriveEventListeners();
}

function setupDriveEventListeners() {
    // Botão de login/logout
    document.addEventListener('click', function(e) {
        if (e.target.closest('#drive-login-btn')) {
            handleDriveLogin();
        } else if (e.target.closest('#drive-logout-btn')) {
            handleDriveLogout();
        } else if (e.target.closest('#create-backup-btn')) {
            createDriveBackup();
        } else if (e.target.closest('#refresh-backups-btn')) {
            loadDriveBackups();
        }
    });
    
    // Delegação de eventos para a lista de backups
    document.addEventListener('click', function(e) {
        const restoreBtn = e.target.closest('.restore-backup-btn');
        const deleteBtn = e.target.closest('.delete-backup-btn');
        
        if (restoreBtn) {
            const fileId = restoreBtn.dataset.fileId;
            const fileName = restoreBtn.dataset.fileName;
            confirmRestoreBackup(fileId, fileName);
        } else if (deleteBtn) {
            const fileId = deleteBtn.dataset.fileId;
            const fileName = deleteBtn.dataset.fileName;
            confirmDeleteBackup(fileId, fileName);
        }
    });
}

function updateDriveStatus(isConnected = null, message = '') {
    const statusContainer = document.getElementById('drive-status-container');
    const controlsContainer = document.getElementById('drive-backup-controls');
    
    if (!statusContainer) return;
    
    const status = driveBackup.getStatus();
    const isLoggedIn = isConnected !== null ? isConnected : status.isLoggedIn;
    
    if (isLoggedIn) {
        statusContainer.innerHTML = `
            <div class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <strong>Conectado ao Google Drive</strong>
                <br>
                <small>Pasta: ${driveBackup.folderName} • ${status.backupsCount} backups</small>
                <button id="drive-logout-btn" class="btn btn-small btn-danger" style="float: right; margin-top: -5px;">
                    <i class="fas fa-sign-out-alt"></i> Sair
                </button>
            </div>
        `;
        if (controlsContainer) controlsContainer.style.display = 'block';
    } else {
        statusContainer.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Google Drive não conectado</strong>
                <br>
                <small>${message || 'Faça login para usar o sistema de backup em nuvem'}</small>
                <button id="drive-login-btn" class="btn btn-small btn-success" style="float: right; margin-top: -5px;">
                    <i class="fab fa-google"></i> Login Google Drive
                </button>
            </div>
        `;
        if (controlsContainer) controlsContainer.style.display = 'none';
    }
}

async function handleDriveLogin() {
    try {
        showAlert('Conectando ao Google Drive...', 'info');
        const success = await driveBackup.login();
        
        if (success) {
            showAlert('Conectado ao Google Drive com sucesso!', 'success');
            updateDriveStatus(true);
            await loadDriveBackups();
            updateDriveUsage();
        } else {
            showAlert('Falha ao conectar ao Google Drive', 'error');
        }
    } catch (error) {
        console.error('❌ Erro no login:', error);
        showAlert('Erro ao conectar: ' + error.message, 'error');
    }
}

async function handleDriveLogout() {
    if (confirm('Deseja realmente sair do Google Drive? Os backups permanecerão na nuvem.')) {
        try {
            await driveBackup.logout();
            showAlert('Desconectado do Google Drive', 'info');
            updateDriveStatus(false);
        } catch (error) {
            showAlert('Erro ao desconectar: ' + error.message, 'error');
        }
    }
}

async function loadDriveBackups() {
    const listContainer = document.getElementById('backups-list-container');
    if (!listContainer) return;
    
    try {
        listContainer.innerHTML = `
            <div class="text-center">
                <i class="fas fa-spinner fa-spin"></i> Carregando backups...
            </div>
        `;
        
        const backups = await driveBackup.listBackups();
        
        if (backups.length === 0) {
            listContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    Nenhum backup encontrado no Google Drive
                </div>
            `;
            return;
        }
        
        let backupsHTML = '';
        
        backups.forEach((backup, index) => {
            const isRecent = index === 0;
            const date = backup.createdTime.toLocaleDateString('pt-BR');
            const time = backup.createdTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            backupsHTML += `
                <div class="card backup-card ${isRecent ? 'recent-backup' : ''}">
                    <div class="card-header">
                        <div class="backup-icon">
                            <i class="fas fa-database"></i>
                        </div>
                        <div>
                            <h4 class="backup-title">${backup.name}</h4>
                            <div class="backup-subtitle">
                                ${date} às ${time} • ${backup.readableSize}
                                ${isRecent ? '<span class="badge badge-success">Mais Recente</span>' : ''}
                            </div>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-primary restore-backup-btn" 
                                data-file-id="${backup.id}" 
                                data-file-name="${backup.name}">
                            <i class="fas fa-download"></i> Restaurar
                        </button>
                        <button class="btn btn-danger delete-backup-btn" 
                                data-file-id="${backup.id}" 
                                data-file-name="${backup.name}">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </div>
                </div>
            `;
        });
        
        listContainer.innerHTML = backupsHTML;
        
    } catch (error) {
        console.error('❌ Erro ao carregar backups:', error);
        listContainer.innerHTML = `
            <div class="alert alert-error">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar backups: ${error.message}
            </div>
        `;
    }
}

async function createDriveBackup() {
    if (!driveBackup.isInitialized) {
        showAlert('Faça login no Google Drive primeiro', 'error');
        return;
    }
    
    const description = document.getElementById('backup-description')?.value || '';
    
    if (!confirm(`Criar backup no Google Drive?\n\nDescrição: ${description || '(sem descrição)'}`)) {
        return;
    }
    
    try {
        showAlert('Criando backup no Google Drive...', 'info');
        
        // Obter dados atuais do sistema
        const systemData = window.systemData || await databaseManager.getSystemData();
        
        const result = await driveBackup.createBackup(systemData, description);
        
        if (result.success) {
            showAlert(`Backup criado com sucesso: ${result.fileName}`, 'success');
            
            // Limpar descrição
            const descInput = document.getElementById('backup-description');
            if (descInput) descInput.value = '';
            
            // Atualizar lista de backups
            await loadDriveBackups();
            updateDriveUsage();
        }
    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        showAlert('Erro ao criar backup: ' + error.message, 'error');
    }
}

async function confirmRestoreBackup(fileId, fileName) {
    if (!confirm(`ATENÇÃO: Restaurar o backup "${fileName}"?\n\nIsso substituirá TODOS os dados atuais. Deseja continuar?`)) {
        return;
    }
    
    try {
        showAlert(`Restaurando backup "${fileName}"...`, 'info');
        
        const backupData = await driveBackup.restoreBackup(fileId);
        
        // Substituir dados do sistema
        window.systemData = backupData;
        
        // Atualizar DatabaseManager
        if (window.databaseManager && databaseManager.saveSystemData) {
            await databaseManager.saveSystemData(backupData);
        }
        
        // Recarregar interface
        if (window.loadData) loadData();
        if (window.updateDashboard) updateDashboard();
        if (window.updateProductsList) updateProductsList();
        if (window.updateSalesList) updateSalesList();
        if (window.updateInventorySummary) updateInventorySummary();
        
        showAlert(`Backup "${fileName}" restaurado com sucesso!`, 'success');
        
    } catch (error) {
        console.error('❌ Erro ao restaurar backup:', error);
        showAlert('Erro ao restaurar backup: ' + error.message, 'error');
    }
}

async function confirmDeleteBackup(fileId, fileName) {
    if (!confirm(`Excluir permanentemente o backup "${fileName}"?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    try {
        const success = await driveBackup.deleteBackup(fileId);
        
        if (success) {
            showAlert(`Backup "${fileName}" excluído com sucesso`, 'success');
            await loadDriveBackups();
            updateDriveUsage();
        }
    } catch (error) {
        console.error('❌ Erro ao excluir backup:', error);
        showAlert('Erro ao excluir backup: ' + error.message, 'error');
    }
}

async function updateDriveUsage() {
    const usageContainer = document.getElementById('drive-usage-info');
    if (!usageContainer) return;
    
    try {
        const usage = await driveBackup.getDriveUsage();
        
        if (usage) {
            const usedGB = (usage.used / 1024 / 1024 / 1024).toFixed(2);
            const totalGB = (usage.total / 1024 / 1024 / 1024).toFixed(2);
            
            usageContainer.innerHTML = `
                <div class="storage-usage">
                    <div class="usage-label">
                        <i class="fas fa-hdd"></i> Uso do Google Drive
                    </div>
                    <div class="usage-bar">
                        <div class="usage-fill" style="width: ${usage.usedPercentage}%"></div>
                    </div>
                    <div class="usage-stats">
                        ${usedGB} GB de ${totalGB} GB (${usage.usedPercentage}%)
                    </div>
                </div>
            `;
        } else {
            usageContainer.innerHTML = '';
        }
    } catch (error) {
        console.error('❌ Erro ao obter uso do Drive:', error);
        usageContainer.innerHTML = '';
    }
}

function showDriveBackupModal() {
    // Criar modal se não existir
    if (!document.getElementById('drive-backup-modal')) {
        const modalHTML = `
            <div class="modal" id="drive-backup-modal">
                <div class="modal-content" style="max-width: 800px;">
                    <div class="modal-header">
                        <h3><i class="fab fa-google-drive"></i> Sistema de Backup - Google Drive</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="modal-drive-status"></div>
                        <div class="modal-section">
                            <h4><i class="fas fa-cloud-upload-alt"></i> Criar Novo Backup</h4>
                            <div class="form-group">
                                <label for="modal-backup-description">Descrição (opcional):</label>
                                <input type="text" id="modal-backup-description" class="form-control" 
                                       placeholder="Ex: Backup semanal - vendas de Natal">
                            </div>
                            <button id="modal-create-backup" class="btn btn-success btn-block">
                                <i class="fas fa-cloud-upload-alt"></i> Criar Backup Agora
                            </button>
                        </div>
                        <div class="modal-section">
                            <h4><i class="fas fa-history"></i> Backups Disponíveis</h4>
                            <div id="modal-backups-list" class="backups-list-modal">
                                <div class="text-center text-muted">
                                    <i class="fas fa-spinner fa-spin"></i> Carregando...
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary modal-close">Fechar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Configurar eventos do modal
        document.getElementById('drive-backup-modal').addEventListener('click', function(e) {
            if (e.target === this || e.target.classList.contains('modal-close')) {
                this.classList.remove('active');
            }
        });
        
        document.getElementById('modal-create-backup').addEventListener('click', async function() {
            const description = document.getElementById('modal-backup-description')?.value || '';
            if (!driveBackup.isInitialized) {
                showAlert('Faça login no Google Drive primeiro', 'error');
                return;
            }
            
            try {
                this.disabled = true;
                this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';
                
                const systemData = window.systemData || await databaseManager.getSystemData();
                const result = await driveBackup.createBackup(systemData, description);
                
                if (result.success) {
                    showAlert(`Backup criado: ${result.fileName}`, 'success');
                    document.getElementById('modal-backup-description').value = '';
                    await updateModalBackupsList();
                }
            } catch (error) {
                showAlert('Erro: ' + error.message, 'error');
            } finally {
                this.disabled = false;
                this.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Criar Backup Agora';
            }
        });
    }
    
    // Atualizar conteúdo do modal
    updateModalContent();
    
    // Mostrar modal
    document.getElementById('drive-backup-modal').classList.add('active');
}

async function updateModalContent() {
    const status = driveBackup.getStatus();
    const statusContainer = document.getElementById('modal-drive-status');
    
    if (statusContainer) {
        if (status.isLoggedIn) {
            statusContainer.innerHTML = `
                <div class="alert alert-success">
                    <i class="fas fa-check-circle"></i>
                    Conectado ao Google Drive • ${status.backupsCount} backups
                </div>
            `;
        } else {
            statusContainer.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    Não conectado ao Google Drive
                    <button id="modal-login-btn" class="btn btn-small btn-success" style="float: right;">
                        <i class="fab fa-google"></i> Login
                    </button>
                </div>
            `;
            
            // Adicionar evento ao botão de login
            setTimeout(() => {
                const loginBtn = document.getElementById('modal-login-btn');
                if (loginBtn) {
                    loginBtn.addEventListener('click', async function() {
                        await handleDriveLogin();
                        updateModalContent();
                        updateModalBackupsList();
                    });
                }
            }, 100);
        }
    }
    
    await updateModalBackupsList();
}

async function updateModalBackupsList() {
    const listContainer = document.getElementById('modal-backups-list');
    if (!listContainer) return;
    
    try {
        const backups = driveBackup.isInitialized ? await driveBackup.listBackups() : [];
        
        if (backups.length === 0) {
            listContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    ${driveBackup.isInitialized ? 'Nenhum backup encontrado' : 'Faça login para ver os backups'}
                </div>
            `;
            return;
        }
        
        let backupsHTML = '<div class="backup-list">';
        
        backups.slice(0, 10).forEach((backup, index) => {
            const date = backup.createdTime.toLocaleDateString('pt-BR');
            const time = backup.createdTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            backupsHTML += `
                <div class="backup-item ${index === 0 ? 'recent' : ''}">
                    <div class="backup-item-info">
                        <div class="backup-item-name">${backup.name}</div>
                        <div class="backup-item-meta">
                            ${date} às ${time} • ${backup.readableSize}
                            ${index === 0 ? '<span class="badge badge-success">Mais Recente</span>' : ''}
                        </div>
                    </div>
                    <div class="backup-item-actions">
                        <button class="btn btn-small btn-primary restore-backup-modal" 
                                data-file-id="${backup.id}" 
                                data-file-name="${backup.name}">
                            <i class="fas fa-download"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        backupsHTML += '</div>';
        
        listContainer.innerHTML = backupsHTML;
        
        // Adicionar eventos aos botões do modal
        document.querySelectorAll('.restore-backup-modal').forEach(button => {
            button.addEventListener('click', async function() {
                const fileId = this.dataset.fileId;
                const fileName = this.dataset.fileName;
                
                if (confirm(`Restaurar backup "${fileName}"?`)) {
                    try {
                        showAlert(`Restaurando ${fileName}...`, 'info');
                        const backupData = await driveBackup.restoreBackup(fileId);
                        
                        window.systemData = backupData;
                        if (databaseManager.saveSystemData) {
                            await databaseManager.saveSystemData(backupData);
                        }
                        
                        // Recarregar sistema
                        if (window.loadData) loadData();
                        if (window.updateDashboard) updateDashboard();
                        
                        showAlert('Backup restaurado com sucesso!', 'success');
                        document.getElementById('drive-backup-modal').classList.remove('active');
                    } catch (error) {
                        showAlert('Erro: ' + error.message, 'error');
                    }
                }
            });
        });
        
    } catch (error) {
        listContainer.innerHTML = `
            <div class="alert alert-error">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar backups
            </div>
        `;
    }
}

// Adicionar estilos CSS
const driveBackupStyles = `
<style>
    .backup-card {
        margin-bottom: 15px;
        border-left: 4px solid #4285f4;
    }
    
    .backup-card.recent-backup {
        border-left-color: #34a853;
        background-color: rgba(52, 168, 83, 0.05);
    }
    
    .backup-icon {
        background-color: #4285f4;
        color: white;
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 15px;
    }
    
    .backup-title {
        font-size: 16px;
        margin: 0;
        color: #333;
    }
    
    .backup-subtitle {
        font-size: 13px;
        color: #666;
        margin-top: 5px;
    }
    
    .backup-card .card-footer {
        display: flex;
        justify-content: space-between;
        padding: 15px;
        background-color: #f8f9fa;
        border-top: 1px solid #eee;
    }
    
    .storage-usage {
        background-color: #f8f9fa;
        border-radius: 8px;
        padding: 15px;
        margin-top: 20px;
    }
    
    .usage-label {
        font-weight: 600;
        margin-bottom: 10px;
        color: #555;
    }
    
    .usage-bar {
        height: 10px;
        background-color: #e9ecef;
        border-radius: 5px;
        overflow: hidden;
        margin-bottom: 10px;
    }
    
    .usage-fill {
        height: 100%;
        background-color: #4285f4;
        transition: width 0.3s ease;
    }
    
    .usage-stats {
        font-size: 12px;
        color: #777;
        text-align: right;
    }
    
    .backup-list {
        max-height: 400px;
        overflow-y: auto;
    }
    
    .backup-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        border-bottom: 1px solid #eee;
        transition: background-color 0.2s;
    }
    
    .backup-item:hover {
        background-color: #f8f9fa;
    }
    
    .backup-item.recent {
        background-color: rgba(52, 168, 83, 0.05);
        border-left: 3px solid #34a853;
    }
    
    .backup-item-name {
        font-weight: 500;
        color: #333;
    }
    
    .backup-item-meta {
        font-size: 12px;
        color: #777;
        margin-top: 5px;
    }
    
    .button-group {
        display: flex;
        gap: 10px;
        margin: 15px 0;
    }
    
    .button-group .btn {
        flex: 1;
    }
</style>
`;

// Adicionar estilos ao documento
document.head.insertAdjacentHTML('beforeend', driveBackupStyles);

// Função helper para mostrar alertas
function showAlert(message, type = 'success') {
    if (window.showAlert) {
        window.showAlert(message, type);
    } else {
        // Fallback simples
        alert(`${type.toUpperCase()}: ${message}`);
    }
}

console.log('✅ Google Drive Backup System carregado!');

// Configurações que precisam ser atualizadas pelo usuário:
console.log(`
⚠️ CONFIGURAÇÃO NECESSÁRIA:
1. Vá para https://console.developers.google.com/
2. Crie um novo projeto ou selecione um existente
3. Ative a API do Google Drive
4. Crie credenciais (OAuth Client ID) para aplicação web
5. Adicione http://localhost e seu domínio em "Origens JavaScript autorizadas"
6. Atualize as variáveis no início do arquivo:
   - clientId: 'SEU_CLIENT_ID.apps.googleusercontent.com'
   - apiKey: 'SUA_API_KEY'
`);