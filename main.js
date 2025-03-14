const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const url = require('url');
const http = require('http');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const os = require('os');

// Configurações do aplicativo
const CONFIG = {
  // Configurações da janela principal
  window: {
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets/icons/icon.ico'),
    title: 'NEXUS AI - Assistente Pessoal',
    backgroundColor: '#121212',
    show: false, // Não mostrar até que esteja pronto
  },
  // Configurações do backend
  backend: {
    host: '127.0.0.1',
    port: 5000,
    protocol: 'http',
    wsProtocol: 'ws',
    timeout: 10000, // 10 segundos
  },
  // Configurações de desenvolvimento
  dev: {
    openDevTools: true,
    reloadOnChange: false,
  }
};

// Carregar configurações personalizadas se existirem
try {
  const userDataPath = app.getPath('userData');
  const configPath = path.join(userDataPath, 'config.json');
  
  if (fs.existsSync(configPath)) {
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    Object.assign(CONFIG, userConfig);
    console.log('Configurações personalizadas carregadas com sucesso');
  }
} catch (error) {
  console.error('Erro ao carregar configurações personalizadas:', error);
}

// Salvar configurações
function saveConfig() {
  try {
    const userDataPath = app.getPath('userData');
    const configPath = path.join(userDataPath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(CONFIG, null, 2));
    return true;
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    return false;
  }
}

// Mantenha uma referência global do objeto window, se você não fizer isso, a janela
// será fechada automaticamente quando o objeto JavaScript for coletado pelo garbage collector.
let mainWindow;

function createWindow() {
  console.log('Criando janela principal...');
  
  // Cria a janela do navegador.
  mainWindow = new BrowserWindow({
    ...CONFIG.window,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      spellcheck: true
    }
  });

  const indexPath = path.join(__dirname, 'index.html');
  console.log('Carregando arquivo HTML:', indexPath);
  
  // Carrega o index.html do app.
  mainWindow.loadURL(url.format({
    pathname: indexPath,
    protocol: 'file:',
    slashes: true
  }));

  // Mostrar janela quando estiver pronta
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Abre o DevTools em modo de desenvolvimento
  if (process.argv.includes('--dev') || CONFIG.dev.openDevTools) {
    console.log('Modo de desenvolvimento detectado, abrindo DevTools...');
    mainWindow.webContents.openDevTools();
  }

  // Emitido quando a janela é fechada.
  mainWindow.on('closed', function () {
    // Desreferencia o objeto da janela, geralmente você armazenaria as janelas
    // em um array se seu app suporta múltiplas janelas, este é o momento
    // quando você deve excluir o elemento correspondente.
    mainWindow = null;
  });
  
  // Manipular links externos para abrir no navegador padrão
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  
  // Verificar conexão com o backend ao iniciar
  checkBackendConnection();
}

// Verificar conexão com o backend
function checkBackendConnection() {
  const { protocol, host, port, timeout } = CONFIG.backend;
  const statusUrl = `${protocol}://${host}:${port}/status`;
  
  console.log(`Verificando conexão com o backend: ${statusUrl}`);
  
  const client = protocol === 'https' ? https : http;
  const req = client.get(statusUrl, { timeout }, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('Conexão com o backend estabelecida com sucesso');
        try {
          const response = JSON.parse(data);
          console.log('Informações do backend:', response);
          
          if (mainWindow) {
            mainWindow.webContents.send('backend-status', { 
              connected: true, 
              info: response 
            });
          }
        } catch (error) {
          console.error('Erro ao processar resposta do backend:', error);
        }
      } else {
        console.error(`Erro ao conectar com o backend: ${res.statusCode}`);
        if (mainWindow) {
          mainWindow.webContents.send('backend-status', { 
            connected: false, 
            error: `Erro HTTP: ${res.statusCode}` 
          });
        }
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('Erro ao conectar com o backend:', error.message);
    if (mainWindow) {
      mainWindow.webContents.send('backend-status', { 
        connected: false, 
        error: error.message 
      });
    }
  });
  
  req.on('timeout', () => {
    req.destroy();
    console.error('Timeout ao conectar com o backend');
    if (mainWindow) {
      mainWindow.webContents.send('backend-status', { 
        connected: false, 
        error: 'Timeout ao conectar com o backend' 
      });
    }
  });
}

// Este método será chamado quando o Electron terminar a inicialização
// e estiver pronto para criar janelas do navegador.
// Algumas APIs podem ser usadas somente depois que este evento ocorre.
app.on('ready', () => {
  console.log('Electron está pronto, criando janela...');
  createWindow();
});

// Sai quando todas as janelas estiverem fechadas.
app.on('window-all-closed', function () {
  // No macOS é comum para aplicativos e sua barra de menu 
  // permanecerem ativos até que o usuário explicitamente encerre com Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  // No macOS é comum recriar uma janela no aplicativo quando o
  // ícone da dock é clicado e não há outras janelas abertas.
  if (mainWindow === null) {
    createWindow();
  }
});

// Adicionar handler para requisições HTTP
ipcMain.handle('http-request', async (event, options) => {
  console.log('Recebida solicitação HTTP do renderer:', options.url);
  
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(options.url);
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: CONFIG.backend.timeout
      };
      
      console.log('Fazendo requisição HTTP:', requestOptions);
      
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          console.log('Resposta recebida com status:', res.statusCode);
          
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            data: data
          });
        });
      });
      
      req.on('error', (error) => {
        console.error('Erro na requisição HTTP:', error.message);
        reject({ error: error.message });
      });
      
      // Adicionar timeout
      req.setTimeout(CONFIG.backend.timeout, () => {
        req.destroy();
        reject({ error: 'Timeout na requisição' });
      });
      
      // Enviar corpo da requisição se existir
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    } catch (error) {
      console.error('Erro ao processar requisição:', error.message);
      reject({ error: error.message });
    }
  });
});

// Armazenar conexões WebSocket
const wsConnections = {};

// Adicionar handler para WebSocket
ipcMain.handle('ws-connect', async (event, url) => {
  console.log('Recebida solicitação WebSocket do renderer:', url);
  
  try {
    const ws = new WebSocket(url, {
      handshakeTimeout: CONFIG.backend.timeout
    });
    
    // Gerar um ID único para esta conexão
    const connectionId = Date.now().toString();
    
    // Armazenar a conexão
    wsConnections[connectionId] = ws;
    
    // Configurar eventos
    ws.on('open', () => {
      console.log(`WebSocket ${connectionId} conectado com sucesso`);
      event.sender.send(`ws-open-${connectionId}`);
    });
    
    ws.on('message', (data) => {
      console.log(`WebSocket ${connectionId} recebeu mensagem:`, data.toString().substring(0, 100) + (data.toString().length > 100 ? '...' : ''));
      event.sender.send(`ws-message-${connectionId}`, data.toString());
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket ${connectionId} erro:`, error.message);
      event.sender.send(`ws-error-${connectionId}`, error.message);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`WebSocket ${connectionId} fechado:`, code, reason);
      event.sender.send(`ws-close-${connectionId}`, { 
        code, 
        reason: reason ? reason.toString() : 'Conexão fechada' 
      });
      delete wsConnections[connectionId];
    });
    
    // Retornar o ID da conexão
    return connectionId;
  } catch (error) {
    console.error('Erro ao criar conexão WebSocket:', error.message);
    throw new Error(`Erro ao criar conexão WebSocket: ${error.message}`);
  }
});

// Adicionar handler para enviar mensagens WebSocket
ipcMain.handle('ws-send', async (event, { connectionId, message }) => {
  console.log(`Enviando mensagem via WebSocket ${connectionId}`);
  
  try {
    const ws = wsConnections[connectionId];
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket não está conectado');
    }
    
    ws.send(message);
    return { success: true };
  } catch (error) {
    console.error('Erro ao enviar mensagem WebSocket:', error.message);
    return { success: false, error: error.message };
  }
});

// Adicionar handler para fechar conexão WebSocket
ipcMain.handle('ws-close', async (event, connectionId) => {
  console.log(`Fechando WebSocket ${connectionId}`);
  
  try {
    const ws = wsConnections[connectionId];
    
    if (ws) {
      ws.close();
      delete wsConnections[connectionId];
    }
    
    return { success: true };
  } catch (error) {
    console.error('Erro ao fechar WebSocket:', error.message);
    return { success: false, error: error.message };
  }
});

// Adicionar handler para obter informações do sistema
ipcMain.handle('get-system-info', async () => {
  return {
    platform: process.platform,
    arch: process.arch,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    memory: process.getSystemMemoryInfo(),
    cpu: os.cpus(),
    uptime: os.uptime(),
    hostname: os.hostname()
  };
});

// Adicionar handler para salvar configurações
ipcMain.handle('save-config', async (event, newConfig) => {
  try {
    // Mesclar com configurações existentes
    Object.assign(CONFIG, newConfig);
    
    // Salvar configurações
    const success = saveConfig();
    
    return { success };
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    return { success: false, error: error.message };
  }
});

// Adicionar handler para mostrar diálogo de arquivo
ipcMain.handle('show-dialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (error) {
    console.error('Erro ao mostrar diálogo:', error);
    return { canceled: true, error: error.message };
  }
});

// Neste arquivo você pode incluir o resto do código específico do processo principal do seu app
// Você também pode colocar eles em arquivos separados e requeridos-as aqui. 