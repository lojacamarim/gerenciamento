// cloud.js - Funcionalidades de Nuvem para GitHub Pages
const CloudManager = (function() {
    // Configurações
    const CONFIG = {
        GITHUB_API: 'https://api.github.com',
        STORAGE_KEY: 'camarim_cloud_config',
        BACKUP_FILENAME: 'camarim-backup.json'
    };
    
    // Estado
    let githubToken = '';
    let gistId = '';
    let lastSync = 'Nunca';
    let autoSyncInterval = 0;
    
    // Inicializar do localStorage
    function init() {
        try {
            const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (saved) {
                const config = JSON.parse(saved);
                githubToken = config.token || '';
                gistId = config.gistId || '';
                lastSync = config.lastSync || 'Nunca';
                autoSyncInterval = config.autoSyncInterval || 0;
            }
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
        }
    }
    
    // Salvar configurações
    function saveConfig() {
        const config = {
            token: githubToken,
            gistId: gistId,
            lastSync: lastSync,
            autoSyncInterval: autoSyncInterval,
            updated: new Date().toISOString()
        };
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(config));
    }
    
    // Testar token do GitHub
    async function testToken(token) {
        if (!token) return { valid: false, error: 'Token não fornecido' };
        
        try {
            const response = await fetch(`${CONFIG.GITHUB_API}/user`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                return { 
                    valid: true, 
                    username: userData.login,
                    message: 'Token válido!'
                };
            } else {
                return { 
                    valid: false, 
                    error: `Token inválido (Status: ${response.status})` 
                };
            }
        } catch (error) {
            return { 
                valid: false, 
                error: `Erro de conexão: ${error.message}` 
            };
        }
    }
    
    // Salvar backup no Gist
    async function saveBackup(data, description = 'Backup Camarim') {
        if (!githubToken) {
            throw new Error('Token do GitHub não configurado');
        }
        
        try {
            // Preparar dados do backup
            const backup = {
                version: '2.0',
                created: new Date().toISOString(),
                description: description,
                data: {
                    products: data.products || [],
                    sales: data.sales || [],
                    settings: data.settings || {},
                    summary: {
                        totalProducts: (data.products || []).length,
                        totalSales: (data.sales || []).length,
                        backupSize: JSON.stringify(data).length
                    }
                }
            };
            
            const gistData = {
                description: description,
                public: false, // Sempre privado por segurança
                files: {
                    [CONFIG.BACKUP_FILENAME]: {
                        content: JSON.stringify(backup, null, 2)
                    }
                }
            };
            
            // Criar ou atualizar Gist
            let url = `${CONFIG.GITHUB_API}/gists`;
            let method = 'POST';
            
            if (gistId) {
                url = `${CONFIG.GITHUB_API}/gists/${gistId}`;
                method = 'PATCH';
            }
            
            console.log('Enviando backup para:', url);
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gistData)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
            }
            
            const result = await response.json();
            gistId = result.id;
            lastSync = new Date().toLocaleString('pt-BR');
            
            saveConfig();
            
            return {
                success: true,
                gistId: result.id,
                gistUrl: result.html_url,
                rawUrl: result.files[CONFIG.BACKUP_FILENAME].raw_url,
                description: result.description,
                createdAt: result.created_at
            };
            
        } catch (error) {
            console.error('Erro ao salvar backup:', error);
            throw error;
        }
    }
    
    // Carregar backup do Gist
    async function loadBackup(gistIdentifier = null) {
        try {
            let rawUrl;
            
            // Determinar a URL do Gist
            if (gistIdentifier && gistIdentifier.includes('github.com')) {
                // É uma URL completa
                const match = gistIdentifier.match(/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/i);
                if (match) {
                    const [, , id] = match;
                    rawUrl = `https://gist.githubusercontent.com/raw/${id}`;
                } else {
                    throw new Error('URL do Gist inválida');
                }
            } else if (gistIdentifier) {
                // É um ID de Gist
                rawUrl = `https://gist.githubusercontent.com/raw/${gistIdentifier}`;
            } else if (gistId) {
                // Usar Gist configurado
                rawUrl = `https://gist.githubusercontent.com/raw/${gistId}`;
            } else {
                throw new Error('Nenhum Gist especificado');
            }
            
            console.log('Carregando backup de:', rawUrl);
            
            // Usar proxy CORS se necessário
            let fetchUrl = rawUrl;
            const useCorsProxy = false; // Desative se não precisar
            
            if (useCorsProxy) {
                fetchUrl = `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`;
            }
            
            const response = await fetch(fetchUrl);
            
            if (!response.ok) {
                throw new Error(`Erro ao baixar: ${response.status} ${response.statusText}`);
            }
            
            const backup = await response.json();
            
            // Validar estrutura do backup
            if (!backup.data || !backup.version) {
                throw new Error('Formato de backup inválido');
            }
            
            return {
                success: true,
                data: backup.data,
                metadata: {
                    version: backup.version,
                    created: backup.created,
                    description: backup.description
                }
            };
            
        } catch (error) {
            console.error('Erro ao carregar backup:', error);
            throw error;
        }
    }
    
    // Atualizar interface
    function updateUI() {
        // Atualizar status do token
        const tokenStatus = document.getElementById('token-status');
        if (tokenStatus) {
            if (githubToken) {
                tokenStatus.textContent = '✓ Configurado';
                tokenStatus.style.color = '#28a745';
            } else {
                tokenStatus.textContent = 'Não configurado';
                tokenStatus.style.color = '#dc3545';
            }
        }
        
        // Atualizar última sincronização
        const lastSyncEl = document.getElementById('last-sync');
        if (lastSyncEl) {
            lastSyncEl.textContent = lastSync;
        }
        
        // Atualizar Gist atual
        const currentGist = document.getElementById('current-gist');
        if (currentGist) {
            currentGist.textContent = gistId 
                ? `${gistId.substring(0, 8)}...` 
                : 'Nenhum';
        }
        
        // Atualizar informações
        const tokenInfo = document.getElementById('token-info');
        if (tokenInfo) {
            tokenInfo.textContent = githubToken 
                ? 'Token salvo localmente' 
                : 'Configure na seção abaixo';
        }
        
        const syncInfo = document.getElementById('sync-info');
        if (syncInfo) {
            syncInfo.textContent = lastSync === 'Nunca' 
                ? 'Aguardando primeira sincronização' 
                : 'Último backup';
        }
        
        const gistInfo = document.getElementById('gist-info');
        if (gistInfo) {
            gistInfo.textContent = gistId 
                ? 'Gist privado criado' 
                : 'Nenhum Gist criado ainda';
        }
        
        // Atualizar tamanho do backup
        const backupSize = document.getElementById('backup-size');
        if (backupSize) {
            // Estimativa baseada nos dados atuais
            const estimate = getBackupSizeEstimate();
            backupSize.textContent = estimate;
        }
    }
    
    // Estimar tamanho do backup
    function getBackupSizeEstimate() {
        try {
            let totalSize = 0;
            
            // Produtos
            if (window.products && Array.isArray(window.products)) {
                totalSize += JSON.stringify(window.products).length;
            }
            
            // Vendas
            if (window.sales && Array.isArray(window.sales)) {
                totalSize += JSON.stringify(window.sales).length;
            }
            
            // Configurações
            if (window.settings && typeof window.settings === 'object') {
                totalSize += JSON.stringify(window.settings).length;
            }
            
            if (totalSize === 0) return '0 KB';
            
            const kb = totalSize / 1024;
            return kb < 1024 
                ? `${kb.toFixed(1)} KB` 
                : `${(kb / 1024).toFixed(2)} MB`;
        } catch (error) {
            return '? KB';
        }
    }
    
    // Mostrar mensagem
    function showMessage(message, type = 'info', duration = 5000) {
        // Tentar usar o sistema de alertas existente
        const alertDiv = document.getElementById('cloud-alert');
        const warningDiv = document.getElementById('cloud-warning');
        
        if (type === 'success' && alertDiv) {
            const messageSpan = alertDiv.querySelector('#cloud-alert-message');
            if (messageSpan) {
                messageSpan.textContent = message;
            }
            alertDiv.classList.remove('d-none');
            if (warningDiv) warningDiv.classList.add('d-none');
            
            setTimeout(() => {
                alertDiv.classList.add('d-none');
            }, duration);
        } else if ((type === 'error' || type === 'warning') && warningDiv) {
            const messageSpan = warningDiv.querySelector('#cloud-warning-message');
            if (messageSpan) {
                messageSpan.textContent = message;
            }
            warningDiv.classList.remove('d-none');
            if (alertDiv) alertDiv.classList.add('d-none');
            
            setTimeout(() => {
                warningDiv.classList.add('d-none');
            }, duration);
        } else {
            // Fallback: alert simples
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }
    
    // Inicializar na carga da página
    document.addEventListener('DOMContentLoaded', function() {
        init();
        updateUI();
        setupEventListeners();
        
        console.log('Cloud Manager inicializado');
        console.log('Token configurado:', githubToken ? 'Sim' : 'Não');
        console.log('Gist ID:', gistId || 'Nenhum');
    });
    
    // Configurar listeners de eventos
    function setupEventListeners() {
        // Botão salvar token
        const saveTokenBtn = document.getElementById('save-token');
        if (saveTokenBtn) {
            saveTokenBtn.addEventListener('click', async function() {
                const tokenInput = document.getElementById('github-token');
                if (!tokenInput) return;
                
                const token = tokenInput.value.trim();
                if (!token) {
                    showMessage('Por favor, insira um token do GitHub', 'error');
                    return;
                }
                
                // Mostrar loading
                const originalText = saveTokenBtn.innerHTML;
                saveTokenBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...';
                saveTokenBtn.disabled = true;
                
                try {
                    const testResult = await testToken(token);
                    
                    if (testResult.valid) {
                        githubToken = token;
                        saveConfig();
                        showMessage(
                            `Token configurado com sucesso! Usuário: ${testResult.username}`,
                            'success'
                        );
                        tokenInput.value = ''; // Limpar por segurança
                        updateUI();
                    } else {
                        showMessage(
                            `Token inválido: ${testResult.error}`,
                            'error'
                        );
                    }
                } catch (error) {
                    showMessage(`Erro: ${error.message}`, 'error');
                } finally {
                    saveTokenBtn.innerHTML = originalText;
                    saveTokenBtn.disabled = false;
                }
            });
        }
        
        // Botão testar token
        const testTokenBtn = document.getElementById('test-token');
        if (testTokenBtn) {
            testTokenBtn.addEventListener('click', async function() {
                if (!githubToken) {
                    showMessage('Configure um token primeiro', 'error');
                    return;
                }
                
                const originalText = testTokenBtn.innerHTML;
                testTokenBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando...';
                testTokenBtn.disabled = true;
                
                try {
                    const testResult = await testToken(githubToken);
                    if (testResult.valid) {
                        showMessage(
                            `Token válido! Conectado como ${testResult.username}`,
                            'success'
                        );
                    } else {
                        showMessage(
                            `Token inválido: ${testResult.error}`,
                            'error'
                        );
                    }
                } catch (error) {
                    showMessage(`Erro: ${error.message}`, 'error');
                } finally {
                    testTokenBtn.innerHTML = originalText;
                    testTokenBtn.disabled = false;
                }
            });
        }
        
        // Botão salvar na nuvem
        const saveCloudBtn = document.getElementById('save-to-cloud');
        if (saveCloudBtn) {
            saveCloudBtn.addEventListener('click', async function() {
                if (!githubToken) {
                    showMessage('Configure um token do GitHub primeiro', 'error');
                    return;
                }
                
                const originalText = saveCloudBtn.innerHTML;
                saveCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                saveCloudBtn.disabled = true;
                
                try {
                    // Coletar dados do sistema
                    const systemData = {
                        products: window.products || [],
                        sales: window.sales || [],
                        settings: window.settings || {}
                    };
                    
                    // Verificar se há dados
                    if (systemData.products.length === 0 && systemData.sales.length === 0) {
                        showMessage('Nenhum dado para salvar', 'warning');
                        return;
                    }
                    
                    const result = await saveBackup(
                        systemData, 
                        `Backup Camarim - ${new Date().toLocaleDateString('pt-BR')}`
                    );
                    
                    showMessage(
                        `Backup salvo com sucesso! Gist: ${result.gistId.substring(0, 8)}...`,
                        'success'
                    );
                    
                    // Mostrar link para compartilhar
                    if (confirm('Backup criado! Deseja copiar o link para compartilhar?')) {
                        const shareUrl = `${window.location.origin}${window.location.pathname}?gist=${result.gistId}`;
                        navigator.clipboard.writeText(shareUrl)
                            .then(() => showMessage('Link copiado!', 'success'))
                            .catch(() => {
                                // Fallback
                                prompt('Copie este link:', shareUrl);
                            });
                    }
                    
                    updateUI();
                    
                } catch (error) {
                    showMessage(`Erro ao salvar: ${error.message}`, 'error');
                    console.error('Detalhes do erro:', error);
                } finally {
                    saveCloudBtn.innerHTML = originalText;
                    saveCloudBtn.disabled = false;
                }
            });
        }
        
        // Botão carregar da nuvem
        const loadCloudBtn = document.getElementById('load-from-cloud');
        if (loadCloudBtn) {
            loadCloudBtn.addEventListener('click', async function() {
                if (!gistId) {
                    showMessage('Nenhum backup salvo anteriormente', 'error');
                    return;
                }
                
                if (!confirm('ATENÇÃO: Isso substituirá todos os dados atuais. Continuar?')) {
                    return;
                }
                
                const originalText = loadCloudBtn.innerHTML;
                loadCloudBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
                loadCloudBtn.disabled = true;
                
                try {
                    const result = await loadBackup(gistId);
                    
                    // Importar dados para o sistema
                    if (result.data.products && Array.isArray(result.data.products)) {
                        window.products = result.data.products;
                        localStorage.setItem('products', JSON.stringify(window.products));
                    }
                    
                    if (result.data.sales && Array.isArray(result.data.sales)) {
                        window.sales = result.data.sales;
                        localStorage.setItem('sales', JSON.stringify(window.sales));
                    }
                    
                    if (result.data.settings && typeof result.data.settings === 'object') {
                        window.settings = result.data.settings;
                        localStorage.setItem('settings', JSON.stringify(window.settings));
                    }
                    
                    showMessage(
                        `Backup carregado com sucesso! ${result.metadata.description}`,
                        'success'
                    );
                    
                    // Recarregar views
                    if (typeof loadDashboardData === 'function') {
                        loadDashboardData();
                    }
                    if (typeof renderProducts === 'function') {
                        renderProducts();
                    }
                    if (typeof renderSales === 'function') {
                        renderSales();
                    }
                    
                    updateUI();
                    
                } catch (error) {
                    showMessage(`Erro ao carregar: ${error.message}`, 'error');
                } finally {
                    loadCloudBtn.innerHTML = originalText;
                    loadCloudBtn.disabled = false;
                }
            });
        }
        
        // Botão carregar por link
        const loadLinkBtn = document.getElementById('load-from-link');
        if (loadLinkBtn) {
            loadLinkBtn.addEventListener('click', async function() {
                const gistUrl = prompt('Cole a URL completa do Gist (ex: https://gist.github.com/usuario/abc123):');
                
                if (!gistUrl || !gistUrl.includes('gist.github.com')) {
                    showMessage('URL inválida', 'error');
                    return;
                }
                
                if (!confirm('ATENÇÃO: Isso substituirá todos os dados atuais. Continuar?')) {
                    return;
                }
                
                const originalText = loadLinkBtn.innerHTML;
                loadLinkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
                loadLinkBtn.disabled = true;
                
                try {
                    const result = await loadBackup(gistUrl);
                    
                    // Importar dados
                    if (result.data.products && Array.isArray(result.data.products)) {
                        window.products = result.data.products;
                        localStorage.setItem('products', JSON.stringify(window.products));
                    }
                    
                    if (result.data.sales && Array.isArray(result.data.sales)) {
                        window.sales = result.data.sales;
                        localStorage.setItem('sales', JSON.stringify(window.sales));
                    }
                    
                    if (result.data.settings && typeof result.data.settings === 'object') {
                        window.settings = result.data.settings;
                        localStorage.setItem('settings', JSON.stringify(window.settings));
                    }
                    
                    // Salvar o Gist ID para referência futura
                    const match = gistUrl.match(/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/i);
                    if (match) {
                        const [, , id] = match;
                        gistId = id;
                        saveConfig();
                    }
                    
                    showMessage(
                        `Backup carregado com sucesso! ${result.metadata.description}`,
                        'success'
                    );
                    
                    // Recarregar views
                    if (typeof loadDashboardData === 'function') {
                        loadDashboardData();
                    }
                    if (typeof renderProducts === 'function') {
                        renderProducts();
                    }
                    if (typeof renderSales === 'function') {
                        renderSales();
                    }
                    
                    updateUI();
                    
                } catch (error) {
                    showMessage(`Erro ao carregar: ${error.message}`, 'error');
                } finally {
                    loadLinkBtn.innerHTML = originalText;
                    loadLinkBtn.disabled = false;
                }
            });
        }
        
        // Auto-sync
        const autoSyncSelect = document.getElementById('auto-sync');
        if (autoSyncSelect) {
            autoSyncSelect.value = autoSyncInterval.toString();
            
            autoSyncSelect.addEventListener('change', function() {
                autoSyncInterval = parseInt(this.value) || 0;
                saveConfig();
                
                if (autoSyncInterval > 0) {
                    showMessage(
                        `Sincronização automática ativada a cada ${autoSyncInterval} minutos`,
                        'success'
                    );
                } else {
                    showMessage('Sincronização automática desativada', 'info');
                }
            });
        }
        
        // Configurar GitHub (modal)
        const configGitHubBtn = document.getElementById('config-github-btn');
        if (configGitHubBtn) {
            configGitHubBtn.addEventListener('click', function() {
                showMessage('Use a seção "Configuração do GitHub" abaixo', 'info');
            });
        }
    }
    
    // Retornar API pública
    return {
        // Getters
        getToken: () => githubToken,
        getGistId: () => gistId,
        getLastSync: () => lastSync,
        
        // Métodos principais
        setToken: function(token) {
            githubToken = token;
            saveConfig();
            updateUI();
        },
        
        saveBackup: async function(data, description) {
            return await saveBackup(data, description);
        },
        
        loadBackup: async function(gistIdentifier) {
            return await loadBackup(gistIdentifier);
        },
        
        testToken: async function(token) {
            return await testToken(token || githubToken);
        },
        
        // UI
        updateUI: updateUI,
        showMessage: showMessage,
        
        // Utilitários
        getBackupSize: getBackupSizeEstimate
    };
})();

// Expor globalmente
window.CloudManager = CloudManager;