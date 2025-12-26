// drive-backup.js
// Sistema de backup simplificado com Google Drive para Sistema Camarim

// ============================================
// CONFIGURAÇÃO INICIAL
// ============================================

// Substitua estes valores pelos seus do Google Cloud Console
var GOOGLE_CLIENT_ID = 'SEU_CLIENT_ID_AQUI.apps.googleusercontent.com';
var GOOGLE_API_KEY = 'SUA_API_KEY_AQUI'; // Opcional

// Nome da pasta de backups
var BACKUP_FOLDER_NAME = 'Camarim Backups';

// Estado do sistema de backup
var driveBackupState = {
    initialized: false,
    signedIn: false,
    gapiLoaded: false,
    gisLoaded: false,
    backupInProgress: false,
    lastBackupDate: null,
    backupFolderId: null,
    tokenClient: null
};

// ============================================
// 1. INICIALIZAÇÃO DO SISTEMA
// ============================================

/**
 * Inicializa o sistema de backup com Google Drive
 */
async function initDriveBackup() {
    console.log('🚀 Inicializando sistema de backup Google Drive...');
    
    try {
        // Carregar API do Google
        await loadGoogleApis();
        
        // Inicializar APIs
        await initGoogleApis();
        
        // Tentar login automático
        await tryAutoLogin();
        
        driveBackupState.initialized = true;
        console.log('✅ Sistema de backup Google Drive inicializado');
        
        // Adicionar interface
        setTimeout(addDriveBackupUI, 1000);
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar backup Google Drive:', error);
        showDriveBackupAlert('Sistema de backup inicializado (faça login quando necessário)', 'info');
        return false;
    }
}

/**
 * Carrega as APIs do Google
 */
function loadGoogleApis() {
    return new Promise(function(resolve, reject) {
        // Verificar se já está carregado
        if (typeof gapi !== 'undefined' && typeof google !== 'undefined') {
            driveBackupState.gapiLoaded = true;
            driveBackupState.gisLoaded = true;
            resolve();
            return;
        }
        
        // Carregar gapi (Google API Client)
        var gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.onload = function() {
            // Carregar gis (Google Identity Services)
            var gisScript = document.createElement('script');
            gisScript.src = 'https://accounts.google.com/gsi/client';
            gisScript.onload = function() {
                driveBackupState.gapiLoaded = true;
                driveBackupState.gisLoaded = true;
                resolve();
            };
            gisScript.onerror = function() {
                console.warn('⚠️ GIS não carregado, usando método alternativo');
                driveBackupState.gapiLoaded = true;
                resolve();
            };
            document.head.appendChild(gisScript);
        };
        gapiScript.onerror = function() {
            reject(new Error('Falha ao carregar API do Google'));
        };
        document.head.appendChild(gapiScript);
    });
}

/**
 * Inicializa as APIs do Google
 */
async function initGoogleApis() {
    try {
        // Inicializar gapi
        await gapi.load('client', function() {
            console.log('✅ Google API Client carregado');
        });
        
        // Inicializar cliente OAuth2 se tiver GIS
        if (driveBackupState.gisLoaded) {
            driveBackupState.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'https://www.googleapis.com/auth/drive.file',
                callback: function(response) {
                    if (response.error) {
                        console.error('❌ Erro de autenticação:', response.error);
                        showDriveBackupAlert('Erro de autenticação: ' + response.error, 'error');
                    } else {
                        driveBackupState.signedIn = true;
                        console.log('✅ Autenticado com sucesso');
                        showDriveBackupAlert('Conectado ao Google Drive com sucesso!', 'success');
                        updateDriveBackupStatus();
                    }
                }
            });
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao inicializar APIs:', error);
        throw error;
    }
}

/**
 * Tenta login automático
 */
async function tryAutoLogin() {
    // Verificar se já tem token salvo
    var token = localStorage.getItem('google_drive_token');
    if (token) {
        try {
            // Validar token
            var response = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + token);
            if (response.ok) {
                driveBackupState.signedIn = true;
                console.log('✅ Login automático realizado');
            }
        } catch (error) {
            // Token inválido
            localStorage.removeItem('google_drive_token');
        }
    }
}

// ============================================
// 2. AUTENTICAÇÃO SIMPLIFICADA
// ============================================

/**
 * Faz login no Google Drive
 */
async function signInToDrive() {
    try {
        if (!driveBackupState.gisLoaded) {
            showDriveBackupAlert('API do Google não carregada. Recarregue a página.', 'error');
            return false;
        }
        
        // Solicitar token
        driveBackupState.tokenClient.requestAccessToken({
            prompt: 'consent'
        });
        
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao fazer login:', error);
        showDriveBackupAlert('Erro ao conectar: ' + error.message, 'error');
        return false;
    }
}

/**
 * Faz logout do Google Drive
 */
async function signOutFromDrive() {
    try {
        if (driveBackupState.signedIn) {
            var token = google.accounts.oauth2.getToken();
            if (token) {
                google.accounts.oauth2.revoke(token.access_token, function() {
                    console.log('✅ Token revogado');
                });
            }
        }
        
        driveBackupState.signedIn = false;
        localStorage.removeItem('google_drive_token');
        
        console.log('✅ Logout realizado');
        showDriveBackupAlert('Desconectado do Google Drive', 'info');
        updateDriveBackupStatus();
        
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
 * Obtém token de acesso
 */
function getAccessToken() {
    if (!driveBackupState.signedIn) return null;
    
    try {
        var token = google.accounts.oauth2.getToken();
        return token ? token.access_token : null;
    } catch (error) {
        return null;
    }
}

// ============================================
// 3. OPERAÇÕES DE BACKUP SIMPLIFICADAS
// ============================================

/**
 * Cria um backup no Google Drive
 */
async function createBackup(description) {
    if (!driveBackupState.signedIn) {
        showDriveBackupAlert('Faça login no Google Drive primeiro', 'warning');
        return false;
    }
    
    try {
        driveBackupState.backupInProgress = true;
        showDriveBackupAlert('Criando backup no Google Drive...', 'info');
        
        // 1. Obter dados do sistema
        var systemData = await getSystemDataForBackup();
        
        // 2. Criar nome do arquivo
        var timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .substring(0, 19);
        
        var fileName = 'Camarim_Backup_' + timestamp + '.json';
        if (description) {
            fileName = 'Camarim_' + description.replace(/[^a-zA-Z0-9]/g, '_') + '_' + timestamp + '.json';
        }
        
        // 3. Converter para JSON
        var fileContent = JSON.stringify(systemData, null, 2);
        
        // 4. Encontrar ou criar pasta de backups
        var folderId = await findOrCreateBackupFolder();
        
        // 5. Upload para o Google Drive
        var success = await uploadToGoogleDrive(fileName, fileContent, folderId, description);
        
        if (success) {
            driveBackupState.lastBackupDate = new Date();
            showDriveBackupAlert('✅ Backup criado com sucesso!', 'success');
            console.log('✅ Backup criado: ' + fileName);
            
            // Atualizar lista de backups
            setTimeout(loadBackupList, 1000);
        }
        
        return success;
        
    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        showDriveBackupAlert('Erro ao criar backup: ' + error.message, 'error');
        return false;
        
    } finally {
        driveBackupState.backupInProgress = false;
    }
}

/**
 * Obtém dados do sistema para backup
 */
async function getSystemDataForBackup() {
    // Usar databaseManager ou localStorage
    if (typeof databaseManager !== 'undefined' && databaseManager.getSystemData) {
        return await databaseManager.getSystemData();
    } else {
        var savedData = localStorage.getItem('camarim-system-data');
        return savedData ? JSON.parse(savedData) : {
            products: [],
            sales: [],
            settings: {},
            backupInfo: {
                date: new Date().toISOString(),
                version: '1.0',
                totalProducts: 0,
                totalSales: 0
            }
        };
    }
}

/**
 * Encontra ou cria pasta de backups
 */
async function findOrCreateBackupFolder() {
    try {
        // Verificar se já temos o ID da pasta
        if (driveBackupState.backupFolderId) {
            return driveBackupState.backupFolderId;
        }
        
        var token = getAccessToken();
        if (!token) throw new Error('Token não disponível');
        
        // Procurar pasta existente
        var searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
            'q=' + encodeURIComponent("name='" + BACKUP_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false") +
            '&fields=files(id,name)' +
            '&access_token=' + token;
        
        var response = await fetch(searchUrl);
        var data = await response.json();
        
        if (data.files && data.files.length > 0) {
            driveBackupState.backupFolderId = data.files[0].id;
            return data.files[0].id;
        }
        
        // Criar nova pasta
        var createUrl = 'https://www.googleapis.com/drive/v3/files?access_token=' + token;
        var folderData = {
            name: BACKUP_FOLDER_NAME,
            mimeType: 'application/vnd.google-apps.folder'
        };
        
        var createResponse = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(folderData)
        });
        
        var newFolder = await createResponse.json();
        driveBackupState.backupFolderId = newFolder.id;
        
        console.log('✅ Pasta de backups criada: ' + newFolder.id);
        return newFolder.id;
        
    } catch (error) {
        console.error('❌ Erro ao configurar pasta:', error);
        throw error;
    }
}

/**
 * Faz upload de arquivo para o Google Drive
 */
async function uploadToGoogleDrive(fileName, fileContent, folderId, description) {
    try {
        var token = getAccessToken();
        if (!token) throw new Error('Token não disponível');
        
        // Criar metadados do arquivo
        var metadata = {
            name: fileName,
            mimeType: 'application/json',
            parents: [folderId],
            description: 'Backup Camarim - ' + new Date().toLocaleString('pt-BR') + (description ? ' - ' + description : '')
        };
        
        // Criar formulário para upload multipart
        var form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));
        
        // Fazer upload
        var uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&access_token=' + token;
        var response = await fetch(uploadUrl, {
            method: 'POST',
            body: form
        });
        
        if (!response.ok) {
            var error = await response.json();
            throw new Error(error.error ? error.error.message : 'Erro no upload');
        }
        
        var result = await response.json();
        console.log('✅ Upload realizado: ' + result.id);
        return true;
        
    } catch (error) {
        console.error('❌ Erro no upload:', error);
        throw error;
    }
}

// ============================================
// 4. LISTAGEM E RESTAURAÇÃO
// ============================================

/**
 * Lista backups disponíveis
 */
async function listBackups() {
    if (!driveBackupState.signedIn) {
        return [];
    }
    
    try {
        var token = getAccessToken();
        if (!token) return [];
        
        // Primeiro, garantir que temos a pasta
        var folderId = await findOrCreateBackupFolder();
        
        // Buscar arquivos na pasta
        var searchUrl = 'https://www.googleapis.com/drive/v3/files?' +
            'q=' + encodeURIComponent("'" + folderId + "' in parents and mimeType='application/json' and trashed=false") +
            '&fields=files(id,name,size,createdTime,modifiedTime,description)' +
            '&orderBy=createdTime desc' +
            '&pageSize=20' +
            '&access_token=' + token;
        
        var response = await fetch(searchUrl);
        var data = await response.json();
        
        if (!data.files) return [];
        
        // Formatar resultados
        return data.files.map(function(file) {
            return {
                id: file.id,
                name: file.name,
                size: file.size ? formatFileSize(file.size) : 'N/A',
                createdTime: new Date(file.createdTime),
                formattedDate: new Date(file.createdTime).toLocaleString('pt-BR'),
                description: file.description || ''
            };
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar backups:', error);
        return [];
    }
}

/**
 * Restaura um backup
 */
async function restoreBackup(fileId) {
    if (!driveBackupState.signedIn) {
        showDriveBackupAlert('Faça login no Google Drive primeiro', 'warning');
        return false;
    }
    
    var confirmRestore = confirm('⚠️ ATENÇÃO!\n\nEsta ação irá substituir TODOS os dados atuais pelos do backup selecionado.\n\nDeseja continuar?');
    if (!confirmRestore) return false;
    
    try {
        showDriveBackupAlert('Restaurando backup...', 'info');
        
        var token = getAccessToken();
        if (!token) throw new Error('Token não disponível');
        
        // Baixar arquivo
        var downloadUrl = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&access_token=' + token;
        var response = await fetch(downloadUrl);
        
        if (!response.ok) {
            throw new Error('Erro ao baixar arquivo');
        }
        
        var backupData = await response.json();
        
        // Validar dados
        if (!backupData.products || !Array.isArray(backupData.products)) {
            throw new Error('Arquivo de backup inválido');
        }
        
        // Criar backup dos dados atuais antes de restaurar
        await createBackup('antes_da_restauracao');
        
        // Restaurar dados
        await restoreSystemData(backupData);
        
        showDriveBackupAlert('✅ Backup restaurado com sucesso!', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao restaurar backup:', error);
        showDriveBackupAlert('Erro ao restaurar: ' + error.message, 'error');
        return false;
    }
}

/**
 * Restaura dados no sistema
 */
async function restoreSystemData(backupData) {
    // Atualizar dados do sistema
    if (typeof systemData !== 'undefined') {
        systemData = {
            products: backupData.products || [],
            sales: backupData.sales || [],
            settings: backupData.settings || (systemData ? systemData.settings : {})
        };
    }
    
    // Salvar no databaseManager
    if (typeof databaseManager !== 'undefined' && databaseManager.saveSystemData) {
        await databaseManager.saveSystemData(systemData);
    } else {
        // Fallback para localStorage
        localStorage.setItem('camarim-system-data', JSON.stringify(systemData));
    }
    
    // Recarregar interface
    setTimeout(function() {
        if (typeof loadData === 'function') loadData();
        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof updateProductsList === 'function') updateProductsList();
        if (typeof updateInventorySummary === 'function') updateInventorySummary();
        if (typeof updateSalesList === 'function') updateSalesList();
    }, 500);
}

/**
 * Baixa um backup localmente
 */
async function downloadBackup(fileId, fileName) {
    try {
        var token = getAccessToken();
        if (!token) throw new Error('Token não disponível');
        
        // Baixar arquivo
        var downloadUrl = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media&access_token=' + token;
        var response = await fetch(downloadUrl);
        
        if (!response.ok) {
            throw new Error('Erro ao baixar arquivo');
        }
        
        var backupData = await response.json();
        var dataStr = JSON.stringify(backupData, null, 2);
        var blob = new Blob([dataStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        
        // Criar link de download
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName || 'backup_camarim_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);
        
        showDriveBackupAlert('✅ Backup baixado com sucesso!', 'success');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao baixar backup:', error);
        showDriveBackupAlert('Erro ao baixar: ' + error.message, 'error');
        return false;
    }
}

// ============================================
// 5. INTERFACE DO USUÁRIO
// ============================================

/**
 * Adiciona interface de backup
 */
function addDriveBackupUI() {
    // Botão no cabeçalho
    addHeaderButton();
    
    // Seção nas configurações
    addSettingsSection();
    
    // Modal de gerenciamento
    createBackupModal();
}

/**
 * Adiciona botão no cabeçalho
 */
function addHeaderButton() {
    var headerActions = document.querySelector('.header-actions');
    if (!headerActions) return;
    
    if (document.getElementById('drive-backup-btn')) return;
    
    var button = document.createElement('button');
    button.id = 'drive-backup-btn';
    button.className = 'btn btn-info';
    button.innerHTML = '<i class="fas fa-cloud"></i> Drive';
    button.title = 'Backup no Google Drive';
    button.style.marginLeft = '10px';
    
    button.addEventListener('click', function() {
        showBackupModal();
    });
    
    headerActions.appendChild(button);
}

/**
 * Adiciona seção nas configurações
 */
function addSettingsSection() {
    var settingsView = document.getElementById('settings-view');
    if (!settingsView) return;
    
    if (document.getElementById('drive-backup-section')) return;
    
    var section = document.createElement('div');
    section.id = 'drive-backup-section';
    section.className = 'card mt-20';
    section.innerHTML = '\
        <div class="card-header">\
            <h3><i class="fas fa-cloud"></i> Backup no Google Drive</h3>\
        </div>\
        <div class="card-body">\
            <div id="drive-status" class="alert alert-info">\
                <i class="fas fa-sync fa-spin"></i> Verificando status...\
            </div>\
            \
            <div id="drive-controls" class="d-none">\
                <div class="form-group">\
                    <button id="drive-login-btn" class="btn btn-success">\
                        <i class="fas fa-sign-in-alt"></i> Conectar ao Google Drive\
                    </button>\
                    <button id="drive-logout-btn" class="btn btn-warning ml-10">\
                        <i class="fas fa-sign-out-alt"></i> Desconectar\
                    </button>\
                </div>\
                \
                <div class="form-group mt-20">\
                    <label for="backup-desc">Descrição do backup (opcional):</label>\
                    <input type="text" id="backup-desc" class="form-control" placeholder="Ex: Backup mensal">\
                </div>\
                \
                <button id="drive-create-btn" class="btn btn-primary">\
                    <i class="fas fa-cloud-upload-alt"></i> Criar Backup Agora\
                </button>\
                \
                <button id="drive-manage-btn" class="btn btn-info ml-10">\
                    <i class="fas fa-list"></i> Ver Backups\
                </button>\
            </div>\
        </div>\
    ';
    
    settingsView.appendChild(section);
    
    // Adicionar event listeners
    setTimeout(function() {
        document.getElementById('drive-login-btn')?.addEventListener('click', signInToDrive);
        document.getElementById('drive-logout-btn')?.addEventListener('click', signOutFromDrive);
        document.getElementById('drive-create-btn')?.addEventListener('click', function() {
            var desc = document.getElementById('backup-desc')?.value || '';
            createBackup(desc);
        });
        document.getElementById('drive-manage-btn')?.addEventListener('click', showBackupModal);
        
        // Atualizar status
        updateDriveStatus();
    }, 100);
}

/**
 * Cria modal de backup
 */
function createBackupModal() {
    if (document.getElementById('backup-modal')) return;
    
    var modal = document.createElement('div');
    modal.id = 'backup-modal';
    modal.className = 'modal';
    
    modal.innerHTML = '\
        <div class="modal-content" style="max-width: 800px;">\
            <div class="modal-header">\
                <h2><i class="fas fa-cloud"></i> Backups - Google Drive</h2>\
                <button class="modal-close">&times;</button>\
            </div>\
            \
            <div class="modal-body">\
                <div class="row">\
                    <div class="col-6">\
                        <div class="card">\
                            <div class="card-header">\
                                <h3><i class="fas fa-user"></i> Status</h3>\
                            </div>\
                            <div class="card-body">\
                                <div id="modal-status" class="alert alert-info">\
                                    <i class="fas fa-cloud"></i> Pronto para conectar\
                                </div>\
                                \
                                <div id="modal-login-section" class="text-center">\
                                    <button id="modal-login-btn" class="btn btn-success btn-large">\
                                        <i class="fas fa-sign-in-alt"></i> Conectar ao Google Drive\
                                    </button>\
                                    <p class="text-muted mt-10">Armazene seus backups na nuvem</p>\
                                </div>\
                                \
                                <div id="modal-user-section" class="d-none">\
                                    <div class="user-info-box">\
                                        <i class="fas fa-user-circle fa-3x"></i>\
                                        <div class="user-details">\
                                            <strong>Conectado</strong><br>\
                                            <small>Google Drive</small>\
                                        </div>\
                                    </div>\
                                    \
                                    <div class="mt-20">\
                                        <button id="modal-logout-btn" class="btn btn-warning btn-block">\
                                            <i class="fas fa-sign-out-alt"></i> Desconectar\
                                        </button>\
                                    </div>\
                                </div>\
                            </div>\
                        </div>\
                        \
                        <div class="card mt-20">\
                            <div class="card-header">\
                                <h3><i class="fas fa-plus"></i> Novo Backup</h3>\
                            </div>\
                            <div class="card-body">\
                                <div class="form-group">\
                                    <label>Descrição:</label>\
                                    <input type="text" id="modal-backup-desc" class="form-control" placeholder="Ex: Backup semanal">\
                                </div>\
                                <button id="modal-create-btn" class="btn btn-primary btn-block" disabled>\
                                    <i class="fas fa-cloud-upload-alt"></i> Criar Backup\
                                </button>\
                            </div>\
                        </div>\
                    </div>\
                    \
                    <div class="col-6">\
                        <div class="card">\
                            <div class="card-header">\
                                <h3><i class="fas fa-history"></i> Backups Disponíveis</h3>\
                            </div>\
                            <div class="card-body" style="height: 500px; overflow-y: auto;">\
                                <div id="backup-list-container">\
                                    <div class="text-center text-muted p-40">\
                                        <i class="fas fa-cloud fa-3x"></i>\
                                        <p class="mt-20">Conecte-se para ver seus backups</p>\
                                    </div>\
                                </div>\
                            </div>\
                        </div>\
                    </div>\
                </div>\
            </div>\
            \
            <div class="modal-footer">\
                <button class="btn btn-secondary modal-close">Fechar</button>\
            </div>\
        </div>\
    ';
    
    document.body.appendChild(modal);
    
    // Event listeners do modal
    setTimeout(function() {
        // Botões de fechar
        var closeButtons = modal.querySelectorAll('.modal-close');
        for (var i = 0; i < closeButtons.length; i++) {
            closeButtons[i].addEventListener('click', function() {
                modal.classList.remove('active');
            });
        }
        
        // Login/Logout
        document.getElementById('modal-login-btn')?.addEventListener('click', async function() {
            await signInToDrive();
            updateModalStatus();
            loadModalBackupList();
        });
        
        document.getElementById('modal-logout-btn')?.addEventListener('click', async function() {
            await signOutFromDrive();
            updateModalStatus();
            loadModalBackupList();
        });
        
        // Criar backup
        document.getElementById('modal-create-btn')?.addEventListener('click', async function() {
            var desc = document.getElementById('modal-backup-desc')?.value || '';
            await createBackup(desc);
            loadModalBackupList();
        });
        
        // Atualizar status inicial
        updateModalStatus();
    }, 100);
}

/**
 * Atualiza status na interface
 */
function updateDriveStatus() {
    var statusEl = document.getElementById('drive-status');
    var controlsEl = document.getElementById('drive-controls');
    
    if (!statusEl || !controlsEl) return;
    
    if (driveBackupState.signedIn) {
        statusEl.className = 'alert alert-success';
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Conectado ao Google Drive';
        controlsEl.classList.remove('d-none');
        document.getElementById('drive-login-btn')?.classList.add('d-none');
        document.getElementById('drive-logout-btn')?.classList.remove('d-none');
    } else {
        statusEl.className = 'alert alert-warning';
        statusEl.innerHTML = '<i class="fas fa-cloud"></i> Conecte-se ao Google Drive para backup na nuvem';
        controlsEl.classList.remove('d-none');
        document.getElementById('drive-login-btn')?.classList.remove('d-none');
        document.getElementById('drive-logout-btn')?.classList.add('d-none');
    }
}

/**
 * Atualiza status no modal
 */
function updateModalStatus() {
    var statusEl = document.getElementById('modal-status');
    var loginSection = document.getElementById('modal-login-section');
    var userSection = document.getElementById('modal-user-section');
    var createBtn = document.getElementById('modal-create-btn');
    
    if (!statusEl) return;
    
    if (driveBackupState.signedIn) {
        statusEl.className = 'alert alert-success';
        statusEl.innerHTML = '<i class="fas fa-check-circle"></i> Conectado ao Google Drive';
        
        if (loginSection) loginSection.classList.add('d-none');
        if (userSection) userSection.classList.remove('d-none');
        if (createBtn) createBtn.disabled = false;
        
    } else {
        statusEl.className = 'alert alert-info';
        statusEl.innerHTML = '<i class="fas fa-cloud"></i> Conecte-se ao Google Drive';
        
        if (loginSection) loginSection.classList.remove('d-none');
        if (userSection) userSection.classList.add('d-none');
        if (createBtn) createBtn.disabled = true;
    }
}

/**
 * Carrega lista de backups no modal
 */
async function loadModalBackupList() {
    var container = document.getElementById('backup-list-container');
    if (!container) return;
    
    if (!driveBackupState.signedIn) {
        container.innerHTML = '\
            <div class="text-center text-muted p-40">\
                <i class="fas fa-cloud fa-3x"></i>\
                <p class="mt-20">Conecte-se para ver seus backups</p>\
            </div>\
        ';
        return;
    }
    
    container.innerHTML = '\
        <div class="text-center p-40">\
            <i class="fas fa-spinner fa-spin fa-2x"></i>\
            <p class="mt-20">Carregando backups...</p>\
        </div>\
    ';
    
    try {
        var backups = await listBackups();
        
        if (backups.length === 0) {
            container.innerHTML = '\
                <div class="text-center text-muted p-40">\
                    <i class="fas fa-inbox fa-3x"></i>\
                    <p class="mt-20">Nenhum backup encontrado</p>\
                    <p class="text-muted">Crie seu primeiro backup!</p>\
                </div>\
            ';
            return;
        }
        
        var html = '<div class="backup-list">';
        
        for (var i = 0; i < backups.length; i++) {
            var backup = backups[i];
            var dateStr = backup.formattedDate;
            var name = backup.name.replace('.json', '');
            
            html += '\
                <div class="backup-item">\
                    <div class="backup-item-header">\
                        <i class="fas fa-file-archive"></i>\
                        <span class="backup-date">' + dateStr + '</span>\
                    </div>\
                    <div class="backup-item-body">\
                        <div class="backup-name">' + name + '</div>\
                        <div class="backup-size">' + backup.size + '</div>\
                    </div>\
                    <div class="backup-item-actions">\
                        <button class="btn btn-small btn-success restore-btn" data-id="' + backup.id + '">\
                            <i class="fas fa-download"></i> Restaurar\
                        </button>\
                        <button class="btn btn-small btn-info download-btn" data-id="' + backup.id + '" data-name="' + backup.name + '">\
                            <i class="fas fa-file-download"></i> Baixar\
                        </button>\
                    </div>\
                </div>\
            ';
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Adicionar event listeners
        setTimeout(function() {
            // Botões de restaurar
            var restoreBtns = container.querySelectorAll('.restore-btn');
            for (var i = 0; i < restoreBtns.length; i++) {
                restoreBtns[i].addEventListener('click', async function() {
                    var fileId = this.getAttribute('data-id');
                    var success = await restoreBackup(fileId);
                    if (success) {
                        var modal = document.getElementById('backup-modal');
                        if (modal) modal.classList.remove('active');
                    }
                });
            }
            
            // Botões de download
            var downloadBtns = container.querySelectorAll('.download-btn');
            for (var i = 0; i < downloadBtns.length; i++) {
                downloadBtns[i].addEventListener('click', async function() {
                    var fileId = this.getAttribute('data-id');
                    var fileName = this.getAttribute('data-name');
                    await downloadBackup(fileId, fileName);
                });
            }
        }, 100);
        
    } catch (error) {
        container.innerHTML = '\
            <div class="alert alert-error">\
                <i class="fas fa-exclamation-triangle"></i>\
                Erro ao carregar backups: ' + error.message + '\
            </div>\
        ';
    }
}

/**
 * Mostra o modal de backup
 */
function showBackupModal() {
    var modal = document.getElementById('backup-modal');
    if (modal) {
        modal.classList.add('active');
        updateModalStatus();
        loadModalBackupList();
    }
}

// ============================================
// 6. FUNÇÕES AUXILIARES
// ============================================

/**
 * Formata tamanho do arquivo
 */
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    
    var k = 1024;
    var sizes = ['Bytes', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Mostra alerta
 */
function showDriveBackupAlert(message, type) {
    // Usar sistema existente se disponível
    if (typeof showAlert === 'function') {
        showAlert(message, type);
    } else {
        // Criar alerta simples
        var alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-' + type;
        alertDiv.style.cssText = '\
            position: fixed;\
            top: 20px;\
            right: 20px;\
            z-index: 10000;\
            max-width: 400px;\
            padding: 15px;\
            border-radius: 5px;\
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);\
        ';
        
        var icon = type === 'success' ? 'check-circle' :
                  type === 'error' ? 'exclamation-triangle' :
                  type === 'warning' ? 'exclamation-circle' : 'info-circle';
        
        alertDiv.innerHTML = '\
            <i class="fas fa-' + icon + '" style="margin-right: 10px;"></i>\
            <span>' + message + '</span>\
        ';
        
        document.body.appendChild(alertDiv);
        
        setTimeout(function() {
            alertDiv.remove();
        }, 5000);
    }
}

// ============================================
// 7. INTEGRAÇÃO COM O SISTEMA
// ============================================

/**
 * Integra com o sistema principal
 */
function integrateWithMainSystem() {
    console.log('🔧 Integrando backup com sistema principal...');
    
    // Sobrescrever saveData para backup automático
    if (typeof saveData === 'function') {
        var originalSaveData = saveData;
        saveData = async function() {
            var result = await originalSaveData.apply(this, arguments);
            
            // Backup automático após salvar (apenas se estiver logado)
            if (driveBackupState.signedIn && !driveBackupState.backupInProgress) {
                setTimeout(function() {
                    createBackup('auto_save');
                }, 3000);
            }
            
            return result;
        };
    }
    
    console.log('✅ Backup integrado com sistema');
}

// ============================================
// 8. INICIALIZAÇÃO AUTOMÁTICA
// ============================================

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', function() {
    console.log('📦 Inicializando sistema de backup...');
    
    // Aguardar um pouco para o sistema principal carregar
    setTimeout(async function() {
        try {
            await initDriveBackup();
            integrateWithMainSystem();
        } catch (error) {
            console.warn('⚠️ Backup não inicializado:', error);
        }
    }, 3000);
});

// ============================================
// 9. API PÚBLICA
// ============================================

window.DriveBackup = {
    // Autenticação
    login: signInToDrive,
    logout: signOutFromDrive,
    isLoggedIn: isSignedIn,
    
    // Operações
    createBackup: createBackup,
    listBackups: listBackups,
    restoreBackup: restoreBackup,
    downloadBackup: downloadBackup,
    
    // UI
    showModal: showBackupModal,
    updateStatus: updateDriveStatus,
    
    // Configuração
    setClientId: function(clientId) {
        GOOGLE_CLIENT_ID = clientId;
    },
    
    // Estado
    getState: function() {
        return driveBackupState;
    }
};

console.log('✅ Sistema de backup Google Drive carregado');
