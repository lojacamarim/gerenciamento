// google-drive-backup.js
// Sistema de backup e restauração usando Google Drive API

class GoogleDriveBackup {
    constructor() {
        this.CLIENT_ID = '821978818510-ia36jn3fn9ucqgl27jmtbaqeee9kujmp.apps.googleusercontent.com'; // Substitua pelo seu Client ID
        this.API_KEY = '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'; // Substitua pela sua API Key
        this.SCOPES = 'https://www.googleapis.com/auth/drive.file';
        this.FOLDER_NAME = 'Sistema Camarim';
        this.FILE_NAME = 'camarim-backup';
        this.folderId = null;
        this.isAuthenticated = false;
        
        this.init();
    }

    async init() {
        // Carrega a API do Google
        await this.loadGoogleAPI();
        
        // Tenta autenticar automaticamente
        await this.checkAuth();
    }

    async loadGoogleAPI() {
        return new Promise((resolve) => {
            // Carrega a biblioteca do Google API
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = () => {
                gapi.load('client:auth2', () => {
                    gapi.client.init({
                        apiKey: this.API_KEY,
                        clientId: this.CLIENT_ID,
                        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
                        scope: this.SCOPES
                    }).then(() => {
                        console.log('Google API carregada');
                        resolve();
                    }).catch(error => {
                        console.error('Erro ao inicializar Google API:', error);
                        resolve();
                    });
                });
            };
            document.head.appendChild(script);
        });
    }

    async checkAuth() {
        try {
            const isSignedIn = gapi.auth2.getAuthInstance().isSignedIn.get();
            
            if (isSignedIn) {
                this.isAuthenticated = true;
                await this.findOrCreateFolder();
                this.showBackupFiles();
            } else {
                this.showLoginButton();
            }
        } catch (error) {
            console.log('Usuário não autenticado');
            this.showLoginButton();
        }
    }

    async authenticate() {
        try {
            await gapi.auth2.getAuthInstance().signIn();
            this.isAuthenticated = true;
            await this.findOrCreateFolder();
            this.showBackupFiles();
            this.hideLoginButton();
        } catch (error) {
            console.error('Erro na autenticação:', error);
            this.showError('Falha na autenticação. Tente novamente.');
        }
    }

    async logout() {
        try {
            await gapi.auth2.getAuthInstance().signOut();
            this.isAuthenticated = false;
            this.showLoginButton();
            this.hideBackupFiles();
        } catch (error) {
            console.error('Erro ao fazer logout:', error);
        }
    }

    async findOrCreateFolder() {
        try {
            // Procura a pasta existente
            const response = await gapi.client.drive.files.list({
                q: `name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                fields: 'files(id, name)'
            });

            if (response.result.files.length > 0) {
                this.folderId = response.result.files[0].id;
                console.log('Pasta encontrada:', this.folderId);
            } else {
                // Cria nova pasta
                const folderMetadata = {
                    name: this.FOLDER_NAME,
                    mimeType: 'application/vnd.google-apps.folder'
                };

                const folder = await gapi.client.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });

                this.folderId = folder.result.id;
                console.log('Pasta criada:', this.folderId);
            }
        } catch (error) {
            console.error('Erro ao criar/encontrar pasta:', error);
            throw error;
        }
    }

    async createBackup(data, description = 'Backup automático') {
        if (!this.isAuthenticated) {
            throw new Error('Usuário não autenticado');
        }

        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `${this.FILE_NAME}_${timestamp}.json`;
            
            const fileMetadata = {
                name: fileName,
                mimeType: 'application/json',
                parents: [this.folderId],
                description: description,
                properties: {
                    type: 'backup',
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                }
            };

            const content = JSON.stringify(data, null, 2);
            const blob = new Blob([content], { type: 'application/json' });

            const formData = new FormData();
            formData.append('metadata', new Blob([JSON.stringify(fileMetadata)], { type: 'application/json' }));
            formData.append('file', blob);

            const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${gapi.auth.getToken().access_token}`
                },
                body: formData
            });

            const result = await response.json();
            console.log('Backup criado:', result);
            
            // Atualiza a lista de arquivos
            await this.showBackupFiles();
            
            return result;
        } catch (error) {
            console.error('Erro ao criar backup:', error);
            throw error;
        }
    }

    async listBackupFiles() {
        if (!this.isAuthenticated || !this.folderId) {
            throw new Error('Usuário não autenticado ou pasta não encontrada');
        }

        try {
            const response = await gapi.client.drive.files.list({
                q: `'${this.folderId}' in parents and mimeType='application/json' and trashed=false`,
                fields: 'files(id, name, createdTime, modifiedTime, size, description, properties)',
                orderBy: 'createdTime desc'
            });

            return response.result.files;
        } catch (error) {
            console.error('Erro ao listar arquivos:', error);
            throw error;
        }
    }

    async getBackupFile(fileId) {
        try {
            const response = await gapi.client.drive.files.get({
                fileId: fileId,
                alt: 'media'
            });

            return response.result;
        } catch (error) {
            console.error('Erro ao obter arquivo:', error);
            throw error;
        }
    }

    async restoreFromBackup(fileId) {
        try {
            const backupData = await this.getBackupFile(fileId);
            return backupData;
        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            throw error;
        }
    }

    async deleteBackup(fileId) {
        try {
            await gapi.client.drive.files.delete({
                fileId: fileId
            });
            
            console.log('Backup excluído:', fileId);
            await this.showBackupFiles();
        } catch (error) {
            console.error('Erro ao excluir backup:', error);
            throw error;
        }
    }

    // Interface do usuário
    showLoginButton() {
        // Cria botão de login se não existir
        if (!document.getElementById('google-login-btn')) {
            const loginBtn = document.createElement('button');
            loginBtn.id = 'google-login-btn';
            loginBtn.className = 'btn btn-primary';
            loginBtn.innerHTML = '<i class="fab fa-google"></i> Conectar com Google Drive';
            loginBtn.onclick = () => this.authenticate();
            
            // Adiciona ao header
            const headerActions = document.getElementById('header-actions');
            if (headerActions) {
                headerActions.insertBefore(loginBtn, headerActions.firstChild);
            }
        }
    }

    hideLoginButton() {
        const loginBtn = document.getElementById('google-login-btn');
        if (loginBtn) {
            loginBtn.remove();
        }
    }

    showUserInfo() {
        if (!this.isAuthenticated) return;

        const authInstance = gapi.auth2.getAuthInstance();
        const user = authInstance.currentUser.get();
        const profile = user.getBasicProfile();

        // Cria elemento de informações do usuário
        const userInfo = document.createElement('div');
        userInfo.id = 'google-user-info';
        userInfo.className = 'user-info';
        userInfo.innerHTML = `
            <img src="${profile.getImageUrl()}" alt="Foto" class="user-avatar">
            <div class="user-details">
                <span class="user-name">${profile.getName()}</span>
                <button class="btn-logout" onclick="driveBackup.logout()">Sair</button>
            </div>
        `;

        // Adiciona ao header
        const headerActions = document.getElementById('header-actions');
        if (headerActions) {
            headerActions.insertBefore(userInfo, headerActions.firstChild);
        }
    }

    async showBackupFiles() {
        try {
            const files = await this.listBackupFiles();
            this.createBackupModal(files);
            this.showUserInfo();
        } catch (error) {
            console.error('Erro ao mostrar arquivos:', error);
        }
    }

    hideBackupFiles() {
        const backupModal = document.getElementById('backup-modal');
        if (backupModal) {
            backupModal.remove();
        }
        
        const userInfo = document.getElementById('google-user-info');
        if (userInfo) {
            userInfo.remove();
        }
    }

    createBackupModal(files) {
        // Remove modal anterior se existir
        const existingModal = document.getElementById('backup-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Cria modal
        const modal = document.createElement('div');
        modal.id = 'backup-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Backups do Google Drive</h3>
                    <button class="modal-close" onclick="this.parentElement.parentElement.remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="backup-actions">
                        <button class="btn btn-success" onclick="driveBackup.createSystemBackup()">
                            <i class="fas fa-cloud-upload-alt"></i> Criar Backup Agora
                        </button>
                    </div>
                    
                    <div class="backup-list" id="backup-list">
                        ${this.renderBackupList(files)}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-light" onclick="this.parentElement.parentElement.parentElement.remove()">Fechar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    renderBackupList(files) {
        if (!files || files.length === 0) {
            return '<p class="no-backups">Nenhum backup encontrado.</p>';
        }

        let html = '<table class="backup-table">';
        html += `
            <thead>
                <tr>
                    <th>Nome</th>
                    <th>Criado em</th>
                    <th>Tamanho</th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
        `;

        files.forEach(file => {
            const date = new Date(file.createdTime).toLocaleString();
            const size = file.size ? this.formatBytes(file.size) : 'N/A';
            
            html += `
                <tr>
                    <td>${file.name}</td>
                    <td>${date}</td>
                    <td>${size}</td>
                    <td class="backup-actions-cell">
                        <button class="btn btn-sm btn-info" onclick="driveBackup.restoreBackup('${file.id}')">
                            <i class="fas fa-download"></i> Restaurar
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="driveBackup.deleteBackupFile('${file.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        return html;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Métodos para integração com o sistema existente
    async createSystemBackup() {
        try {
            // Obtém dados do sistema (ajuste conforme sua estrutura)
            const products = window.products || [];
            const sales = window.sales || [];
            const settings = window.settings || {};
            
            const backupData = {
                products,
                sales,
                settings,
                timestamp: new Date().toISOString(),
                version: '1.0'
            };

            await this.createBackup(backupData, 'Backup do Sistema Camarim');
            this.showSuccess('Backup criado com sucesso!');
            
            // Atualiza a lista
            const files = await this.listBackupFiles();
            this.updateBackupList(files);
        } catch (error) {
            console.error('Erro ao criar backup do sistema:', error);
            this.showError('Erro ao criar backup: ' + error.message);
        }
    }

    async restoreBackup(fileId) {
        if (!confirm('Deseja restaurar este backup? Os dados atuais serão substituídos.')) {
            return;
        }

        try {
            const backupData = await this.restoreFromBackup(fileId);
            
            // Restaura dados no sistema (ajuste conforme sua estrutura)
            if (backupData.products) {
                window.products = backupData.products;
                localStorage.setItem('camarim_products', JSON.stringify(backupData.products));
            }
            
            if (backupData.sales) {
                window.sales = backupData.sales;
                localStorage.setItem('camarim_sales', JSON.stringify(backupData.sales));
            }
            
            if (backupData.settings) {
                window.settings = backupData.settings;
                localStorage.setItem('camarim_settings', JSON.stringify(backupData.settings));
            }
            
            this.showSuccess('Backup restaurado com sucesso!');
            
            // Recarrega a página para aplicar as alterações
            setTimeout(() => {
                location.reload();
            }, 1500);
        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            this.showError('Erro ao restaurar backup: ' + error.message);
        }
    }

    async deleteBackupFile(fileId) {
        if (!confirm('Tem certeza que deseja excluir este backup?')) {
            return;
        }

        try {
            await this.deleteBackup(fileId);
            this.showSuccess('Backup excluído com sucesso!');
            
            // Atualiza a lista
            const files = await this.listBackupFiles();
            this.updateBackupList(files);
        } catch (error) {
            console.error('Erro ao excluir backup:', error);
            this.showError('Erro ao excluir backup: ' + error.message);
        }
    }

    updateBackupList(files) {
        const backupList = document.getElementById('backup-list');
        if (backupList) {
            backupList.innerHTML = this.renderBackupList(files);
        }
    }

    showSuccess(message) {
        // Usa o sistema de alertas existente ou cria um novo
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-success';
        alertDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        
        document.querySelector('.main-content').prepend(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 3000);
    }

    showError(message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-error';
        alertDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
        
        document.querySelector('.main-content').prepend(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 3000);
    }

    // Método para abrir o modal
    openBackupModal() {
        if (!this.isAuthenticated) {
            this.showLoginButton();
            alert('Por favor, conecte-se ao Google Drive primeiro.');
            return;
        }
        
        this.showBackupFiles();
        document.getElementById('backup-modal').style.display = 'block';
    }
}

// Estilos CSS para o sistema de backup
const backupStyles = `
    .user-info {
        display: flex;
        align-items: center;
        margin-right: 15px;
        padding: 5px 10px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }
    
    .user-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        margin-right: 10px;
    }
    
    .user-details {
        display: flex;
        flex-direction: column;
    }
    
    .user-name {
        font-size: 12px;
        font-weight: 500;
    }
    
    .btn-logout {
        background: none;
        border: none;
        color: #dc3545;
        font-size: 11px;
        cursor: pointer;
        text-align: left;
        padding: 0;
        margin-top: 2px;
    }
    
    .btn-logout:hover {
        text-decoration: underline;
    }
    
    .backup-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 20px;
    }
    
    .backup-table th {
        background: #f8f9fa;
        padding: 12px;
        text-align: left;
        border-bottom: 2px solid #dee2e6;
    }
    
    .backup-table td {
        padding: 12px;
        border-bottom: 1px solid #dee2e6;
    }
    
    .backup-table tr:hover {
        background: #f8f9fa;
    }
    
    .backup-actions-cell {
        display: flex;
        gap: 5px;
    }
    
    .no-backups {
        text-align: center;
        padding: 40px;
        color: #6c757d;
    }
    
    .backup-actions {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 20px;
    }
`;

// Adiciona os estilos ao documento
const styleSheet = document.createElement('style');
styleSheet.textContent = backupStyles;
document.head.appendChild(styleSheet);

// Variável global para acesso
let driveBackup;

// Inicializa quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    driveBackup = new GoogleDriveBackup();
});

// Adiciona botão de backup ao header
document.addEventListener('DOMContentLoaded', () => {
    // Adiciona após o carregamento completo
    setTimeout(() => {
        const headerActions = document.getElementById('header-actions');
        if (headerActions) {
            const backupBtn = document.createElement('button');
            backupBtn.className = 'btn btn-info';
            backupBtn.id = 'backup-drive-btn';
            backupBtn.innerHTML = '<i class="fas fa-cloud"></i> Drive Backup';
            backupBtn.onclick = () => {
                if (driveBackup) {
                    driveBackup.openBackupModal();
                }
            };
            
            // Insere antes do botão de exportar
            const exportBtn = document.getElementById('export-btn');
            if (exportBtn) {
                headerActions.insertBefore(backupBtn, exportBtn);
            } else {
                headerActions.appendChild(backupBtn);
            }
        }
    }, 1000);
});