// Sistema de Diagnóstico para Google Drive API
console.log('🔍 Iniciando diagnóstico do Google Drive API...');

// Verificar se as APIs estão carregadas
console.log('1. Verificando bibliotecas externas:');
console.log('- gapi disponível:', typeof gapi !== 'undefined');
console.log('- gapi.client disponível:', gapi && typeof gapi.client !== 'undefined');
console.log('- gapi.auth2 disponível:', gapi && typeof gapi.auth2 !== 'undefined');

// Verificar configurações
console.log('\n2. Verificando configurações:');
console.log('- Client ID configurado:', window.CamarimDriveBackup?.clientId !== 'YOUR_CLIENT_ID.apps.googleusercontent.com');
console.log('- API Key configurada:', window.CamarimDriveBackup?.apiKey !== 'YOUR_API_KEY');

// Verificar URLs permitidas
console.log('\n3. Verificando origem atual:');
console.log('- URL atual:', window.location.origin);
console.log('- Protocolo:', window.location.protocol);
console.log('- Host:', window.location.host);

// Testar conexão básica
async function testGoogleAPI() {
    console.log('\n4. Testando conexão com Google APIs:');
    
    try {
        // Tentar carregar a biblioteca se não estiver carregada
        if (!window.gapi) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://apis.google.com/js/api.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        
        // Inicializar cliente básico
        await gapi.load('client', {
            callback: () => console.log('✅ Biblioteca gapi.client carregada'),
            onerror: () => console.error('❌ Erro ao carregar gapi.client'),
            timeout: 5000
        });
        
        console.log('✅ Teste de API concluído');
        return true;
    } catch (error) {
        console.error('❌ Erro no teste:', error);
        return false;
    }
}

// Executar diagnóstico
testGoogleAPI().then(success => {
    console.log('\n📋 RESUMO DO DIAGNÓSTICO:');
    console.log('- Conectividade Google API:', success ? '✅ OK' : '❌ FALHOU');
    
    // Sugestões baseadas nos resultados
    console.log('\n💡 SUGESTÕES:');
    
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        console.log('⚠️ Use HTTPS ou localhost (Google OAuth requer HTTPS em produção)');
    }
    
    if (window.CamarimDriveBackup?.clientId === 'YOUR_CLIENT_ID.apps.googleusercontent.com') {
        console.log('⚠️ Atualize o Client ID no arquivo drive-backup.js');
    }
    
    if (window.CamarimDriveBackup?.apiKey === 'YOUR_API_KEY') {
        console.log('⚠️ Atualize a API Key no arquivo drive-backup.js');
    }
    
    if (!window.gapi) {
        console.log('⚠️ Biblioteca Google API não carregada. Verifique bloqueadores de script.');
    }
});