// drive-backup.js
// Sistema de backup e sincronização com Google Drive para Sistema Camarim
// Última atualização: 2025

// ============================================
// CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================

// Configuração da API do Google Drive
const GOOGLE_API_CONFIG = {
    clientId: '951619466938-fnhdvhrvpp3jmj8om1pracs1pqarui1k.apps.googleusercontent.com', // Substituir pelo seu Client ID
    apiKey: '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', // Substituir pela sua API Key
    discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    scope: 'https://www.googleapis.com/auth/drive.file'
};

// ID da pasta de backups no Google Drive
const BACKUP_FOLDER_ID = '1vvVotz0czoNzU-dtNc854UQnnnN1SZAX'; // Substituir pelo ID da sua pasta no Drive

// Nome da pasta de backups
const BACKUP_FOLDER_NAME = 'Camarim Backups';

// Configuração do sistema de backup
const BACKUP_CONFIG = {
    maxBackups: 10, // Número máximo de backups mantidos
    autoBackup: true, // Fazer backup automático ao salvar dados
    backupInterval: 3600000, // Intervalo de backup automático (1 hora em ms)
    chunkSize: 10 * 1024 * 1024 // Tamanho máximo de arquivo (10MB)
};

// Estado do sistema de backup
const driveBackupState = {
    initialized: false,
    signedIn: false,
    gapiLoaded: false,
    backupInProgress: false,
    lastBackupDate: null,
    backupFolderId: null,
    lastError: null
};

// ============================================
// 1. INICIALIZAÇÃO DO SISTEMA DE BACKUP
// ============================================

/**
 * Inicializa o sistema de backup com Google Drive
 */
async function initDriveBackup() {
    console.log('🚀 Inicializando sistema de backup Google Drive...');
    
    try {
        // Carregar API do Google
        await loadGapi();
        
        // Inicializar cliente do Google
        await initGapiClient();
        
        // Verificar e criar pasta de backups
        await ensureBackupFolder();
        
        driveBackupState.initialized = true;
        console.log('✅ Sistema de backup Google Drive inicializado');
        
        // Iniciar backup automático se configurado
        if (BACKUP_CONFIG.autoBackup) {
            startAutoBackup();
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar backup Google Drive:', error);
        driveBackupState.lastError = error.message;
        showDriveBackupAlert('Erro ao conectar com Google Drive', 'error');
        return false;
    }
}

/**
 * Carrega a API do Google
 */
function loadGapi() {
    return new Promise((resolve, reject) => {
        if (typeof gapi === 'undefined') {
            // Carregar script da API do Google
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                gapi.load('client:auth2', () => {
                    driveBackupState.gapiLoaded = true;
                    resolve();
                });
            };
            script.onerror = () => reject(new Error('Falha ao carregar API do Google'));
            document.head.appendChild(script);
        } else if (!driveBackupState.gapiLoaded) {
            gapi.load('client:auth2', () => {
                driveBackupState.gapiLoaded = true;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Inicializa o cliente da API do Google
 */
async function initGapiClient() {
    try {
        await gapi.client.init({
            apiKey: GOOGLE_API_CONFIG.apiKey,
            clientId: GOOGLE_API_CONFIG.clientId,
            discoveryDocs: GOOGLE_API_CONFIG.discoveryDocs,
            scope: GOOGLE_API_CONFIG.scope
        });
        
        // Atualizar estado de autenticação
        const isSignedIn = gapi.auth2.getAuthInstance().isSignedIn.get();
        driveBackupState.signedIn = isSignedIn;
        
        console.log(`🔐 Cliente Google API inicializado: ${isSignedIn ? 'Logado' : 'Deslogado'}`);
        
    } catch (error) {
        console.error('❌ Erro ao inicializar cliente Google:', error);
        throw error;
    }
}

// ============================================
// 2. AUTENTICAÇÃO COM GOOGLE DRIVE
// ============================================

/**
 * Faz login no Google Drive
 */
async function signInToDrive() {
    try {
        if (!driveBackupState.gapiLoaded) {
            await loadGapi();
            await initGapiClient();
        }
        
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signIn();
        
        driveBackupState.signedIn = true;
        console.log('✅ Login realizado com sucesso');
        showDriveBackupAlert('Conectado ao Google Drive com sucesso!', 'success');
        
        // Verificar/criar pasta de backups
        await ensureBackupFolder();
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao fazer login:', error);
        showDriveBackupAlert('Erro ao conectar com Google Drive: ' + error.message, 'error');
        return false;
    }
}

/**
 * Faz logout do Google Drive
 */
async function signOutFromDrive() {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        await authInstance.signOut();
        
        driveBackupState.signedIn = false;
        console.log('✅ Logout realizado');
        showDriveBackupAlert('Desconectado do Google Drive', 'info');
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao fazer logout:', error);
        return false;
    }
}

/**
 * Retorna o status de autenticação
 */
function isSignedIn() {
    return driveBackupState.signedIn;
}

/**
 * Obtém informações do usuário logado
 */
function getCurrentUser() {
    if (!driveBackupState.signedIn) return null;
    
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        const currentUser = authInstance.currentUser.get();
        const profile = currentUser.getBasicProfile();
        
        return {
            name: profile.getName(),
            email: profile.getEmail(),
            imageUrl: profile.getImageUrl()
        };
    } catch (error) {
        return null;
    }
}

// ============================================
// 3. GERENCIAMENTO DA PASTA DE BACKUPS
// ============================================

/**
 * Verifica se a pasta de backups existe, caso contrário, cria
 */
async function ensureBackupFolder() {
    try {
        let folderId = BACKUP_FOLDER_ID;
        
        // Se não há ID específico, procura por nome
        if (!folderId || folderId === 'FOLDER_ID_HERE') {
            folderId = await findBackupFolderByName();
            
            // Se não encontrou, cria nova pasta
            if (!folderId) {
                folderId = await createBackupFolder();
            }
        } else {
            // Verifica se a pasta com ID específico existe
            const folderExists = await checkFolderExists(folderId);
            if (!folderExists) {
                folderId = await createBackupFolder();
            }
        }
        
        driveBackupState.backupFolderId = folderId;
        console.log(`📁 Pasta de backups: ${folderId}`);
        
        return folderId;
        
    } catch (error) {
        console.error('❌ Erro ao configurar pasta de backups:', error);
        throw error;
    }
}

/**
 * Procura pasta de backups pelo nome
 */
async function findBackupFolderByName() {
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });
        
        if (response.result.files && response.result.files.length > 0) {
            return response.result.files[0].id;
        }
        
        return null;
        
    } catch (error) {
        console.error('❌ Erro ao buscar pasta:', error);
        return null;
    }
}

/**
 * Cria uma nova pasta de backups
 */
async function createBackupFolder() {
    try {
        const fileMetadata = {
            name: BACKUP_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        };
        
        const response = await gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });
        
        console.log(`✅ Pasta criada: ${response.result.id}`);
        return response.result.id;
        
    } catch (error) {
        console.error('❌ Erro ao criar pasta:', error);
        throw error;
    }
}

/**
 * Verifica se uma pasta existe pelo ID
 */
async function checkFolderExists(folderId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: folderId,
            fields: 'id, name, trashed'
        });
        
        return !response.result.trashed;
        
    } catch (error) {
        return false;
    }
}

// ============================================
// 4. OPERAÇÕES DE BACKUP
// ============================================

/**
 * Faz backup dos dados atuais no Google Drive
 * @param {string} description - Descrição opcional do backup
 */
async function createBackup(description = '') {
    if (driveBackupState.backupInProgress) {
        showDriveBackupAlert('Já há um backup em andamento', 'warning');
        return false;
    }
    
    if (!driveBackupState.signedIn) {
        showDriveBackupAlert('Faça login no Google Drive primeiro', 'warning');
        return false;
    }
    
    try {
        driveBackupState.backupInProgress = true;
        showDriveBackupAlert('Criando backup no Google Drive...', 'info');
        
        // Obter dados do sistema
        const systemData = await getSystemDataForBackup();
        
        // Criar nome do arquivo com timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDescription = description ? `_${description.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
        const fileName = `camarim_backup_${timestamp}${backupDescription}.json`;
        
        // Converter dados para JSON
        const fileContent = JSON.stringify(systemData, null, 2);
        
        // Criar metadados do arquivo
        const fileMetadata = {
            name: fileName,
            mimeType: 'application/json',
            parents: [driveBackupState.backupFolderId],
            description: `Backup Camarim - ${new Date().toLocaleString('pt-BR')}${description ? ' - ' + description : ''}`
        };
        
        // Criar blob do arquivo
        const blob = new Blob([fileContent], { type: 'application/json' });
        
        // Upload para o Google Drive
        await uploadFileToDrive(fileMetadata, blob);
        
        // Atualizar data do último backup
        driveBackupState.lastBackupDate = new Date();
        
        // Limitar número de backups
        await limitBackupCount();
        
        showDriveBackupAlert('Backup criado com sucesso no Google Drive!', 'success');
        console.log('✅ Backup criado:', fileName);
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        showDriveBackupAlert('Erro ao criar backup: ' + error.message, 'error');
        return false;
        
    } finally {
        driveBackupState.backupInProgress = false;
    }
}

/**
 * Obtém os dados do sistema para backup
 */
async function getSystemDataForBackup() {
    // Usar o databaseManager existente ou localStorage como fallback
    if (typeof databaseManager !== 'undefined' && databaseManager.getSystemData) {
        return await databaseManager.getSystemData();
    } else {
        // Fallback para localStorage
        const savedData = localStorage.getItem('camarim-system-data');
        return savedData ? JSON.parse(savedData) : { products: [], sales: [], settings: {} };
    }
}

/**
 * Faz upload de arquivo para o Google Drive
 */
async function uploadFileToDrive(metadata, blob) {
    return new Promise((resolve, reject) => {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelimiter = "\r\n--" + boundary + "--";
        
        // Criar corpo da requisição multipart
        const contentType = 'application/json';
        const base64Data = btoa(unescape(encodeURIComponent(blob)));
        
        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: ' + contentType + '\r\n' +
            'Content-Transfer-Encoding: base64\r\n' +
            '\r\n' +
            base64Data +
            closeDelimiter;
        
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
        
        request.execute(response => {
            if (response.error) {
                reject(new Error(response.error.message));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Limita o número de backups mantidos
 */
async function limitBackupCount() {
    try {
        const backups = await listBackups();
        
        if (backups.length > BACKUP_CONFIG.maxBackups) {
            // Ordenar por data (mais antigos primeiro)
            backups.sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
            
            // Excluir os backups mais antigos
            const backupsToDelete = backups.slice(0, backups.length - BACKUP_CONFIG.maxBackups);
            
            for (const backup of backupsToDelete) {
                await deleteBackup(backup.id);
                console.log(`🗑️ Backup antigo excluído: ${backup.name}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao limitar backups:', error);
    }
}

// ============================================
// 5. LISTAGEM E RESTAURAÇÃO DE BACKUPS
// ============================================

/**
 * Lista todos os backups disponíveis no Google Drive
 */
async function listBackups() {
    if (!driveBackupState.signedIn) {
        showDriveBackupAlert('Faça login no Google Drive primeiro', 'warning');
        return [];
    }
    
    try {
        const response = await gapi.client.drive.files.list({
            q: `'${driveBackupState.backupFolderId}' in parents and mimeType='application/json' and name contains 'camarim_backup' and trashed=false`,
            fields: 'files(id, name, size, createdTime, modifiedTime, description)',
            orderBy: 'createdTime desc',
            spaces: 'drive'
        });
        
        const backups = response.result.files || [];
        
        // Formatar informações dos backups
        return backups.map(backup => ({
            id: backup.id,
            name: backup.name,
            size: backup.size ? formatFileSize(backup.size) : 'N/A',
            createdTime: new Date(backup.createdTime),
            formattedDate: new Date(backup.createdTime).toLocaleString('pt-BR'),
            description: backup.description || ''
        }));
        
    } catch (error) {
        console.error('❌ Erro ao listar backups:', error);
        showDriveBackupAlert('Erro ao listar backups: ' + error.message, 'error');
        return [];
    }
}

/**
 * Restaura um backup específico do Google Drive
 * @param {string} fileId - ID do arquivo de backup
 */
async function restoreBackup(fileId) {
    if (!driveBackupState.signedIn) {
        showDriveBackupAlert('Faça login no Google Drive primeiro', 'warning');
        return false;
    }
    
    const confirmRestore = confirm('ATENÇÃO: Esta ação irá substituir TODOS os dados atuais pelos do backup selecionado. Deseja continuar?');
    if (!confirmRestore) return false;
    
    try {
        showDriveBackupAlert('Restaurando backup...', 'info');
        
        // Baixar arquivo do Google Drive
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        const backupData = response.result;
        
        // Validar estrutura dos dados
        if (!backupData.products || !Array.isArray(backupData.products)) {
            throw new Error('Arquivo de backup inválido');
        }
        
        // Criar backup atual antes de restaurar
        await createAutoBackup('pre_restore');
        
        // Restaurar dados no sistema
        await restoreSystemData(backupData);
        
        showDriveBackupAlert('Backup restaurado com sucesso!', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao restaurar backup:', error);
        showDriveBackupAlert('Erro ao restaurar backup: ' + error.message, 'error');
        return false;
    }
}

/**
 * Restaura os dados do sistema a partir do backup
 */
async function restoreSystemData(backupData) {
    // Atualizar dados no sistema
    systemData = {
        products: backupData.products || [],
        sales: backupData.sales || [],
        settings: backupData.settings || systemData.settings
    };
    
    // Salvar dados localmente
    if (typeof databaseManager !== 'undefined' && databaseManager.saveSystemData) {
        await databaseManager.saveSystemData(systemData);
    } else {
        // Fallback para localStorage
        localStorage.setItem('camarim-system-data', JSON.stringify(systemData));
    }
    
    // Recarregar interface
    if (typeof loadData === 'function') loadData();
    if (typeof updateDashboard === 'function') updateDashboard();
    if (typeof updateProductsList === 'function') updateProductsList();
    if (typeof updateInventorySummary === 'function') updateInventorySummary();
    if (typeof updateSalesList === 'function') updateSalesList();
}

/**
 * Exclui um backup específico
 */
async function deleteBackup(fileId) {
    try {
        await gapi.client.drive.files.delete({
            fileId: fileId
        });
        
        console.log('🗑️ Backup excluído:', fileId);
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao excluir backup:', error);
        return false;
    }
}

/**
 * Faz download de um backup para o computador local
 */
async function downloadBackup(fileId, fileName) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        const backupData = response.result;
        const dataStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName || `backup_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        showDriveBackupAlert('Backup baixado com sucesso!', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao baixar backup:', error);
        showDriveBackupAlert('Erro ao baixar backup: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// 6. BACKUP AUTOMÁTICO
// ============================================

/**
 * Inicia o sistema de backup automático
 */
function startAutoBackup() {
    if (!BACKUP_CONFIG.autoBackup) return;
    
    // Fazer backup imediato se nunca foi feito
    if (!driveBackupState.lastBackupDate) {
        setTimeout(createAutoBackup, 5000);
    }
    
    // Configurar backup periódico
    setInterval(createAutoBackup, BACKUP_CONFIG.backupInterval);
    
    console.log('⏰ Backup automático configurado');
}

/**
 * Cria backup automático
 */
async function createAutoBackup(reason = 'auto') {
    if (!driveBackupState.signedIn || driveBackupState.backupInProgress) return;
    
    try {
        const lastBackup = driveBackupState.lastBackupDate;
        const now = new Date();
        
        // Verificar se já passou tempo suficiente desde o último backup
        if (lastBackup && (now - lastBackup) < (BACKUP_CONFIG.backupInterval / 2)) {
            return;
        }
        
        console.log(`🔄 Criando backup automático (${reason})...`);
        await createBackup(`auto_${reason}`);
        
    } catch (error) {
        console.error('❌ Erro no backup automático:', error);
    }
}

// ============================================
// 7. INTEGRAÇÃO COM A INTERFACE DO SISTEMA
// ============================================

/**
 * Adiciona a interface de backup ao sistema
 */
function addDriveBackupUI() {
    // Adicionar botão de backup no cabeçalho
    const headerActions = document.querySelector('.header-actions');
    if (headerActions && !document.getElementById('drive-backup-btn')) {
        const backupBtn = document.createElement('button');
        backupBtn.id = 'drive-backup-btn';
        backupBtn.className = 'btn btn-info';
        backupBtn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Backup Drive';
        backupBtn.title = 'Backup no Google Drive';
        backupBtn.style.marginLeft = '10px';
        
        backupBtn.addEventListener('click', () => {
            showDriveBackupModal();
        });
        
        headerActions.appendChild(backupBtn);
    }
    
    // Adicionar seção de backup nas configurações
    addBackupSectionToSettings();
}

/**
 * Adiciona seção de backup nas configurações
 */
function addBackupSectionToSettings() {
    const settingsView = document.getElementById('settings-view');
    if (!settingsView) return;
    
    // Verificar se a seção já existe
    if (document.getElementById('drive-backup-section')) return;
    
    const backupSection = document.createElement('div');
    backupSection.id = 'drive-backup-section';
    backupSection.className = 'card';
    backupSection.innerHTML = `
        <div class="card-header">
            <h3><i class="fas fa-cloud"></i> Backup no Google Drive</h3>
        </div>
        <div class="card-body">
            <div id="drive-backup-status" class="alert alert-info">
                <i class="fas fa-sync"></i> Carregando status do backup...
            </div>
            
            <div id="drive-backup-controls" class="d-none">
                <div class="form-group">
                    <button id="drive-login-btn" class="btn btn-success">
                        <i class="fas fa-sign-in-alt"></i> Conectar ao Google Drive
                    </button>
                    <button id="drive-logout-btn" class="btn btn-warning ml-10">
                        <i class="fas fa-sign-out-alt"></i> Desconectar
                    </button>
                </div>
                
                <div class="form-group">
                    <button id="drive-create-backup-btn" class="btn btn-primary">
                        <i class="fas fa-cloud-upload-alt"></i> Criar Backup Agora
                    </button>
                    <button id="drive-manage-backups-btn" class="btn btn-info ml-10">
                        <i class="fas fa-list"></i> Gerenciar Backups
                    </button>
                </div>
                
                <div id="drive-user-info" class="user-info-card"></div>
            </div>
            
            <div id="drive-backup-info" class="mt-20">
                <h4>Últimos Backups</h4>
                <div id="drive-backup-list" class="backup-list">
                    <div class="text-center text-muted">
                        <i class="fas fa-cloud"></i>
                        <p>Nenhum backup disponível</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Adicionar após a seção de exportação/importação
    const exportSection = settingsView.querySelector('#export-import-section');
    if (exportSection) {
        exportSection.parentNode.insertBefore(backupSection, exportSection.nextSibling);
    } else {
        settingsView.querySelector('.card-body').appendChild(backupSection);
    }
    
    // Adicionar event listeners
    setTimeout(() => {
        setupDriveBackupEventListeners();
        updateDriveBackupStatus();
    }, 100);
}

/**
 * Configura os event listeners para os controles de backup
 */
function setupDriveBackupEventListeners() {
    // Botão de login
    const loginBtn = document.getElementById('drive-login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            await signInToDrive();
            updateDriveBackupStatus();
            loadBackupList();
        });
    }
    
    // Botão de logout
    const logoutBtn = document.getElementById('drive-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await signOutFromDrive();
            updateDriveBackupStatus();
        });
    }
    
    // Botão de criar backup
    const createBackupBtn = document.getElementById('drive-create-backup-btn');
    if (createBackupBtn) {
        createBackupBtn.addEventListener('click', async () => {
            const description = prompt('Descrição do backup (opcional):', '');
            await createBackup(description);
            loadBackupList();
            updateDriveBackupStatus();
        });
    }
    
    // Botão de gerenciar backups
    const manageBackupsBtn = document.getElementById('drive-manage-backups-btn');
    if (manageBackupsBtn) {
        manageBackupsBtn.addEventListener('click', () => {
            showDriveBackupModal();
        });
    }
}

/**
 * Atualiza o status do backup na interface
 */
async function updateDriveBackupStatus() {
    const statusElement = document.getElementById('drive-backup-status');
    const controlsElement = document.getElementById('drive-backup-controls');
    const userInfoElement = document.getElementById('drive-user-info');
    
    if (!statusElement || !controlsElement) return;
    
    if (!driveBackupState.initialized) {
        statusElement.className = 'alert alert-warning';
        statusElement.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sistema de backup não inicializado';
        controlsElement.classList.add('d-none');
        return;
    }
    
    if (!driveBackupState.signedIn) {
        statusElement.className = 'alert alert-warning';
        statusElement.innerHTML = '<i class="fas fa-cloud"></i> Conecte-se ao Google Drive para fazer backup dos seus dados';
        controlsElement.classList.remove('d-none');
        
        // Mostrar apenas botão de login
        document.getElementById('drive-logout-btn')?.classList.add('d-none');
        document.getElementById('drive-create-backup-btn')?.classList.add('d-none');
        document.getElementById('drive-manage-backups-btn')?.classList.add('d-none');
        
        if (userInfoElement) userInfoElement.innerHTML = '';
        
    } else {
        const user = getCurrentUser();
        
        statusElement.className = 'alert alert-success';
        statusElement.innerHTML = `<i class="fas fa-check-circle"></i> Conectado ao Google Drive${driveBackupState.lastBackupDate ? ` | Último backup: ${driveBackupState.lastBackupDate.toLocaleString('pt-BR')}` : ''}`;
        
        controlsElement.classList.remove('d-none');
        
        // Mostrar todos os controles
        document.getElementById('drive-login-btn')?.classList.add('d-none');
        document.getElementById('drive-logout-btn')?.classList.remove('d-none');
        document.getElementById('drive-create-backup-btn')?.classList.remove('d-none');
        document.getElementById('drive-manage-backups-btn')?.classList.remove('d-none');
        
        // Mostrar informações do usuário
        if (userInfoElement && user) {
            userInfoElement.innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">
                        ${user.imageUrl ? `<img src="${user.imageUrl}" alt="${user.name}">` : '<i class="fas fa-user"></i>'}
                    </div>
                    <div class="user-details">
                        <strong>${user.name}</strong>
                        <small>${user.email}</small>
                    </div>
                </div>
            `;
        }
    }
}

/**
 * Carrega a lista de backups na interface
 */
async function loadBackupList() {
    const backupListElement = document.getElementById('drive-backup-list');
    if (!backupListElement) return;
    
    backupListElement.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando backups...</div>';
    
    try {
        const backups = await listBackups();
        
        if (backups.length === 0) {
            backupListElement.innerHTML = `
                <div class="text-center text-muted">
                    <i class="fas fa-cloud"></i>
                    <p>Nenhum backup disponível</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="table-container">';
        html += '<table class="data-table">';
        html += '<thead><tr><th>Data</th><th>Arquivo</th><th>Tamanho</th><th>Ações</th></tr></thead>';
        html += '<tbody>';
        
        backups.forEach(backup => {
            const backupDate = backup.formattedDate;
            const backupName = backup.name.replace('camarim_backup_', '').replace('.json', '');
            const truncatedName = backupName.length > 30 ? backupName.substring(0, 30) + '...' : backupName;
            
            html += `
                <tr>
                    <td>${backupDate}</td>
                    <td title="${backupName}">${truncatedName}</td>
                    <td>${backup.size}</td>
                    <td class="actions-cell">
                        <button class="btn btn-small btn-success restore-backup-btn" data-id="${backup.id}" title="Restaurar este backup">
                            <i class="fas fa-download"></i>
                        </button>
                        <button class="btn btn-small btn-info download-backup-btn" data-id="${backup.id}" data-name="${backup.name}" title="Baixar backup">
                            <i class="fas fa-file-download"></i>
                        </button>
                        <button class="btn btn-small btn-danger delete-backup-btn" data-id="${backup.id}" title="Excluir backup">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
        
        backupListElement.innerHTML = DOMPurify.sanitize(html);
        
        // Adicionar event listeners aos botões
        setTimeout(() => {
            // Botões de restaurar
            document.querySelectorAll('.restore-backup-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fileId = btn.getAttribute('data-id');
                    const success = await restoreBackup(fileId);
                    if (success) {
                        showDriveBackupAlert('Dados restaurados com sucesso! Recarregando...', 'success');
                        setTimeout(() => location.reload(), 2000);
                    }
                });
            });
            
            // Botões de download
            document.querySelectorAll('.download-backup-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fileId = btn.getAttribute('data-id');
                    const fileName = btn.getAttribute('data-name');
                    await downloadBackup(fileId, fileName);
                });
            });
            
            // Botões de excluir
            document.querySelectorAll('.delete-backup-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fileId = btn.getAttribute('data-id');
                    if (confirm('Tem certeza que deseja excluir este backup?')) {
                        const success = await deleteBackup(fileId);
                        if (success) {
                            showDriveBackupAlert('Backup excluído com sucesso!', 'success');
                            loadBackupList();
                        }
                    }
                });
            });
        }, 100);
        
    } catch (error) {
        backupListElement.innerHTML = `
            <div class="alert alert-error">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar backups: ${error.message}
            </div>
        `;
    }
}

/**
 * Mostra modal completo de gerenciamento de backups
 */
function showDriveBackupModal() {
    // Criar modal se não existir
    if (!document.getElementById('drive-backup-modal')) {
        createDriveBackupModal();
    }
    
    const modal = document.getElementById('drive-backup-modal');
    modal.classList.add('active');
    
    // Carregar lista de backups
    loadBackupListModal();
}

/**
 * Cria o modal de gerenciamento de backups
 */
function createDriveBackupModal() {
    const modal = document.createElement('div');
    modal.id = 'drive-backup-modal';
    modal.className = 'modal';
    
    modal.innerHTML = DOMPurify.sanitize(`
        <div class="modal-content" style="max-width: 900px;">
            <div class="modal-header">
                <h2><i class="fas fa-cloud"></i> Gerenciamento de Backups - Google Drive</h2>
                <button class="modal-close">&times;</button>
            </div>
            
            <div class="modal-body">
                <div class="row">
                    <div class="col-6">
                        <div class="card">
                            <div class="card-header">
                                <h3><i class="fas fa-user"></i> Status da Conexão</h3>
                            </div>
                            <div class="card-body">
                                <div id="drive-modal-status" class="alert alert-info">
                                    <i class="fas fa-sync fa-spin"></i> Verificando status...
                                </div>
                                
                                <div id="drive-modal-controls" class="text-center">
                                    <button id="drive-modal-login" class="btn btn-success btn-large">
                                        <i class="fas fa-sign-in-alt"></i> Conectar ao Google Drive
                                    </button>
                                    <p class="text-muted mt-10">Conecte-se para sincronizar seus dados na nuvem</p>
                                </div>
                                
                                <div id="drive-modal-user" class="d-none">
                                    <!-- Informações do usuário serão inseridas aqui -->
                                </div>
                            </div>
                        </div>
                        
                        <div class="card mt-20">
                            <div class="card-header">
                                <h3><i class="fas fa-cloud-upload-alt"></i> Criar Novo Backup</h3>
                            </div>
                            <div class="card-body">
                                <div class="form-group">
                                    <label for="backup-description">Descrição (opcional):</label>
                                    <input type="text" id="backup-description" class="form-control" placeholder="Ex: Backup antes da promoção">
                                </div>
                                <button id="drive-modal-create-backup" class="btn btn-primary btn-block">
                                    <i class="fas fa-cloud-upload-alt"></i> Criar Backup Agora
                                </button>
                                <p class="text-muted mt-10">
                                    <i class="fas fa-info-circle"></i> Os backups são armazenados na pasta "Camarim Backups" do seu Google Drive
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="col-6">
                        <div class="card">
                            <div class="card-header">
                                <h3><i class="fas fa-history"></i> Backups Disponíveis</h3>
                            </div>
                            <div class="card-body">
                                <div id="drive-modal-backup-list" class="backup-list-modal">
                                    <div class="text-center">
                                        <i class="fas fa-cloud"></i>
                                        <p>Conecte-se ao Google Drive para ver seus backups</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="modal-footer">
                <button class="btn btn-secondary modal-close">Fechar</button>
            </div>
        </div>
    `);
    
    document.body.appendChild(modal);
    
    // Adicionar event listeners
    setTimeout(() => {
        // Botão de fechar
        modal.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        });
        
        // Botão de login
        const loginBtn = document.getElementById('drive-modal-login');
        if (loginBtn) {
            loginBtn.addEventListener('click', async () => {
                await signInToDrive();
                updateDriveModalStatus();
                loadBackupListModal();
            });
        }
        
        // Botão de criar backup
        const createBackupBtn = document.getElementById('drive-modal-create-backup');
        if (createBackupBtn) {
            createBackupBtn.addEventListener('click', async () => {
                const description = document.getElementById('backup-description')?.value || '';
                await createBackup(description);
                loadBackupListModal();
                updateDriveModalStatus();
            });
        }
        
        // Atualizar status inicial
        updateDriveModalStatus();
    }, 100);
}

/**
 * Atualiza o status no modal
 */
function updateDriveModalStatus() {
    const statusElement = document.getElementById('drive-modal-status');
    const controlsElement = document.getElementById('drive-modal-controls');
    const userElement = document.getElementById('drive-modal-user');
    const createBackupBtn = document.getElementById('drive-modal-create-backup');
    
    if (!statusElement || !controlsElement || !userElement) return;
    
    if (!driveBackupState.signedIn) {
        statusElement.className = 'alert alert-warning';
        statusElement.innerHTML = '<i class="fas fa-cloud"></i> Não conectado ao Google Drive';
        controlsElement.classList.remove('d-none');
        userElement.classList.add('d-none');
        if (createBackupBtn) createBackupBtn.disabled = true;
        
    } else {
        const user = getCurrentUser();
        
        statusElement.className = 'alert alert-success';
        statusElement.innerHTML = `<i class="fas fa-check-circle"></i> Conectado ao Google Drive${driveBackupState.lastBackupDate ? `<br><small>Último backup: ${driveBackupState.lastBackupDate.toLocaleString('pt-BR')}</small>` : ''}`;
        
        controlsElement.classList.add('d-none');
        userElement.classList.remove('d-none');
        if (createBackupBtn) createBackupBtn.disabled = false;
        
        // Mostrar informações do usuário
        if (user) {
            userElement.innerHTML = `
                <div class="user-info-large">
                    <div class="user-avatar-large">
                        ${user.imageUrl ? `<img src="${user.imageUrl}" alt="${user.name}">` : '<i class="fas fa-user-circle"></i>'}
                    </div>
                    <div class="user-details-large">
                        <strong>${user.name}</strong>
                        <small>${user.email}</small>
                        <div class="mt-10">
                            <button id="drive-modal-logout" class="btn btn-small btn-warning">
                                <i class="fas fa-sign-out-alt"></i> Desconectar
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            // Adicionar event listener para logout
            const logoutBtn = document.getElementById('drive-modal-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', async () => {
                    await signOutFromDrive();
                    updateDriveModalStatus();
                    loadBackupListModal();
                });
            }
        }
    }
}

/**
 * Carrega a lista de backups no modal
 */
async function loadBackupListModal() {
    const backupListElement = document.getElementById('drive-modal-backup-list');
    if (!backupListElement) return;
    
    if (!driveBackupState.signedIn) {
        backupListElement.innerHTML = `
            <div class="text-center">
                <i class="fas fa-cloud"></i>
                <p>Conecte-se ao Google Drive para ver seus backups</p>
            </div>
        `;
        return;
    }
    
    backupListElement.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando backups...</div>';
    
    try {
        const backups = await listBackups();
        
        if (backups.length === 0) {
            backupListElement.innerHTML = `
                <div class="text-center">
                    <i class="fas fa-cloud"></i>
                    <p>Nenhum backup encontrado</p>
                    <p class="text-muted">Crie seu primeiro backup usando o botão ao lado</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="backup-grid">';
        
        backups.forEach(backup => {
            const backupDate = backup.formattedDate;
            const backupName = backup.name.replace('camarim_backup_', '').replace('.json', '').replace(/_/g, ' ');
            const isRecent = (new Date() - backup.createdTime) < 24 * 60 * 60 * 1000; // Menos de 24 horas
            
            html += `
                <div class="backup-card ${isRecent ? 'recent' : ''}">
                    <div class="backup-card-header">
                        <i class="fas fa-file-archive"></i>
                        <span class="backup-date">${backupDate}</span>
                        ${isRecent ? '<span class="badge badge-success">RECENTE</span>' : ''}
                    </div>
                    <div class="backup-card-body">
                        <div class="backup-name" title="${backupName}">${backupName}</div>
                        <div class="backup-size">${backup.size}</div>
                        ${backup.description ? `<div class="backup-description">${backup.description}</div>` : ''}
                    </div>
                    <div class="backup-card-footer">
                        <button class="btn btn-small btn-success restore-backup-modal-btn" data-id="${backup.id}">
                            <i class="fas fa-download"></i> Restaurar
                        </button>
                        <button class="btn btn-small btn-info download-backup-modal-btn" data-id="${backup.id}" data-name="${backup.name}">
                            <i class="fas fa-file-download"></i> Baixar
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        backupListElement.innerHTML = DOMPurify.sanitize(html);
        
        // Adicionar event listeners
        setTimeout(() => {
            // Botões de restaurar
            document.querySelectorAll('.restore-backup-modal-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fileId = btn.getAttribute('data-id');
                    const success = await restoreBackup(fileId);
                    if (success) {
                        showDriveBackupAlert('Dados restaurados com sucesso! Recarregando...', 'success');
                        setTimeout(() => location.reload(), 2000);
                    }
                });
            });
            
            // Botões de download
            document.querySelectorAll('.download-backup-modal-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const fileId = btn.getAttribute('data-id');
                    const fileName = btn.getAttribute('data-name');
                    await downloadBackup(fileId, fileName);
                });
            });
        }, 100);
        
    } catch (error) {
        backupListElement.innerHTML = `
            <div class="alert alert-error">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar backups: ${error.message}
            </div>
        `;
    }
}

// ============================================
// 8. FUNÇÕES AUXILIARES
// ============================================

/**
 * Formata tamanho de arquivo para leitura humana
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Mostra alerta no sistema de backup
 */
function showDriveBackupAlert(message, type = 'info') {
    const sanitizedMessage = DOMPurify.sanitize(message);
    
    // Usar sistema de alerta existente se disponível
    if (typeof showAlert === 'function') {
        showAlert(sanitizedMessage, type);
    } else {
        // Criar alerta temporário
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.style.position = 'fixed';
        alertDiv.style.top = '20px';
        alertDiv.style.right = '20px';
        alertDiv.style.zIndex = '10000';
        alertDiv.style.maxWidth = '400px';
        alertDiv.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            <span>${sanitizedMessage}</span>
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }
}

// ============================================
// 9. INTEGRAÇÃO COM O SISTEMA PRINCIPAL
// ============================================

/**
 * Integra o sistema de backup com o sistema principal
 */
function integrateDriveBackupWithSystem() {
    console.log('🔧 Integrando sistema de backup com sistema principal...');
    
    // Adicionar UI ao sistema
    addDriveBackupUI();
    
    // Sobrescrever função saveData para incluir backup automático
    const originalSaveData = window.saveData;
    if (originalSaveData) {
        window.saveData = async function() {
            // Executar save original
            const result = await originalSaveData.apply(this, arguments);
            
            // Fazer backup automático se configurado
            if (BACKUP_CONFIG.autoBackup && driveBackupState.signedIn && !driveBackupState.backupInProgress) {
                setTimeout(() => createAutoBackup('after_save'), 3000);
            }
            
            return result;
        };
    }
    
    // Adicionar opção de backup no menu de exportação
    addBackupToExportMenu();
    
    console.log('✅ Sistema de backup integrado com sucesso');
}

/**
 * Adiciona opção de backup no menu de exportação
 */
function addBackupToExportMenu() {
    const exportModal = document.getElementById('export-modal');
    if (!exportModal) return;
    
    // Verificar se já existe a opção de backup
    if (exportModal.querySelector('.backup-drive-option')) return;
    
    const exportTypeSelect = document.getElementById('export-type');
    if (exportTypeSelect) {
        const backupOption = document.createElement('option');
        backupOption.value = 'drive';
        backupOption.textContent = 'Backup no Google Drive';
        backupOption.className = 'backup-drive-option';
        exportTypeSelect.appendChild(backupOption);
    }
    
    // Modificar função de exportação para incluir backup
    const originalExportData = window.exportData;
    if (originalExportData) {
        window.exportData = function(type) {
            if (type === 'drive') {
                showDriveBackupModal();
                hideModal('export-modal');
            } else {
                originalExportData(type);
            }
        };
    }
}

// ============================================
// 10. INICIALIZAÇÃO AUTOMÁTICA
// ============================================

/**
 * Inicializa automaticamente quando o DOM estiver carregado
 */
document.addEventListener('DOMContentLoaded', async function() {
    console.log('📦 Carregando sistema de backup Google Drive...');
    
    // Aguardar sistema principal carregar
    setTimeout(async () => {
        try {
            // Inicializar sistema de backup
            await initDriveBackup();
            
            // Integrar com sistema principal
            integrateDriveBackupWithSystem();
            
        } catch (error) {
            console.error('❌ Erro na inicialização do backup:', error);
        }
    }, 2000);
});

// ============================================
// 11. EXPORTAÇÃO DE FUNÇÕES PARA USO GLOBAL
// ============================================

window.DriveBackupSystem = {
    // Configuração
    init: initDriveBackup,
    isInitialized: () => driveBackupState.initialized,
    
    // Autenticação
    signIn: signInToDrive,
    signOut: signOutFromDrive,
    isSignedIn: isSignedIn,
    getCurrentUser: getCurrentUser,
    
    // Operações de backup
    createBackup: createBackup,
    listBackups: listBackups,
    restoreBackup: restoreBackup,
    deleteBackup: deleteBackup,
    downloadBackup: downloadBackup,
    
    // UI
    showBackupModal: showDriveBackupModal,
    updateBackupStatus: updateDriveBackupStatus,
    loadBackupList: loadBackupList,
    
    // Configurações
    config: BACKUP_CONFIG,
    state: driveBackupState
};

console.log('✅ Sistema de backup Google Drive carregado');