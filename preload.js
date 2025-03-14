const { contextBridge, ipcRenderer, shell } = require('electron');

console.log('Preload script carregado com sucesso!');

// Cache para requisições
const requestCache = {
    cache: new Map(),
    maxSize: 50,
    maxAge: 60000, // 1 minuto
    
    set(key, value) {
        // Limpar cache se estiver muito grande
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    },
    
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        // Verificar se o item expirou
        if (Date.now() - item.timestamp > this.maxAge) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    },
    
    clear() {
        this.cache.clear();
    }
};

// Expõe APIs seguras do Node.js e do Electron para o processo de renderização
contextBridge.exposeInMainWorld('electron', {
    // Funções para comunicação com o processo principal
    send: (channel, data) => {
        // Lista de canais permitidos para envio
        const validChannels = ['toMain', 'openExternal', 'minimize', 'maximize', 'close'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        // Lista de canais permitidos para recebimento
        const validChannels = ['fromMain', 'updateStatus'];
        if (validChannels.includes(channel)) {
            // Remover o listener antigo para evitar duplicação
            ipcRenderer.removeAllListeners(channel);
            // Adicionar o novo listener
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },
    // Funções de sistema
    getVersion: () => {
        console.log('Versão do Electron solicitada:', process.versions.electron);
        return process.versions.electron;
    },
    // Informações do sistema
    getSystemInfo: () => {
        return {
            platform: process.platform,
            arch: process.arch,
            versions: process.versions,
            memory: process.getSystemMemoryInfo ? process.getSystemMemoryInfo() : null
        };
    },
    // Abrir links externos
    openExternal: (url) => {
        if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
            shell.openExternal(url);
            return true;
        }
        return false;
    }
});

// Expõe APIs seguras do Node.js
contextBridge.exposeInMainWorld('api', {
    // Funções para comunicação com o backend
    fetch: async (url, options = {}) => {
        console.log('Fetch API solicitada para URL:', url);
        
        // Verificar se é uma requisição GET que pode ser cacheada
        if (options.method === undefined || options.method === 'GET') {
            const cacheKey = url + JSON.stringify(options);
            const cachedResponse = requestCache.get(cacheKey);
            
            if (cachedResponse) {
                console.log('Retornando resposta em cache para:', url);
                return Promise.resolve(new Response(new Blob([JSON.stringify(cachedResponse)]), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }
            
            try {
                console.log('Iniciando requisição HTTP via IPC para:', url);
                
                // Usar IPC para fazer a requisição HTTP através do processo principal
                const result = await ipcRenderer.invoke('http-request', {
                    url: url,
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    body: options.body
                });
                
                if (result.error) {
                    console.error('Erro retornado pelo IPC:', result.error);
                    throw new Error(result.error);
                }
                
                console.log('Resposta recebida via IPC, status:', result.status);
                
                // Criar um objeto Response similar ao da Fetch API
                const response = {
                    ok: result.ok,
                    status: result.status,
                    statusText: result.statusText,
                    headers: result.headers,
                    json: () => {
                        try {
                            const jsonData = JSON.parse(result.data);
                            console.log('Dados JSON parseados com sucesso');
                            
                            // Armazenar no cache se for bem-sucedido
                            if (result.ok) {
                                requestCache.set(cacheKey, jsonData);
                            }
                            
                            return Promise.resolve(jsonData);
                        } catch (e) {
                            console.error('Erro ao fazer parse do JSON:', e);
                            console.error('Dados recebidos:', result.data);
                            return Promise.reject(new Error('Erro ao fazer parse do JSON'));
                        }
                    },
                    text: () => Promise.resolve(result.data)
                };
                
                return response;
            } catch (error) {
                console.error('Erro na requisição fetch:', error);
                throw error;
            }
        }
        
        // Para outros métodos HTTP, não usar cache
        return fetch(url, options);
    },
    
    // Funções para WebSocket
    WebSocket: (url) => {
        console.log('WebSocket API solicitada para URL:', url);
        
        // Criar um objeto WebSocket personalizado que usa IPC
        class CustomWebSocket {
            // Constantes de estado do WebSocket
            static get CONNECTING() { return 0; }
            static get OPEN() { return 1; }
            static get CLOSING() { return 2; }
            static get CLOSED() { return 3; }
            
            constructor(url) {
                this.url = url;
                this.connectionId = null;
                this.readyState = CustomWebSocket.CONNECTING; // CONNECTING
                
                // Adicionar constantes como propriedades da instância também
                this.CONNECTING = CustomWebSocket.CONNECTING;
                this.OPEN = CustomWebSocket.OPEN;
                this.CLOSING = CustomWebSocket.CLOSING;
                this.CLOSED = CustomWebSocket.CLOSED;
                
                // Callbacks
                this.onopen = null;
                this.onmessage = null;
                this.onerror = null;
                this.onclose = null;
                
                // Eventos
                this._listeners = {
                    open: [],
                    message: [],
                    error: [],
                    close: []
                };
                
                // Iniciar conexão
                this._connect();
            }
            
            async _connect() {
                try {
                    // Solicitar conexão via IPC
                    this.connectionId = await ipcRenderer.invoke('ws-connect', this.url);
                    console.log('WebSocket conectado via IPC, ID:', this.connectionId);
                    
                    // Configurar listeners para eventos
                    ipcRenderer.on(`ws-open-${this.connectionId}`, () => {
                        console.log('WebSocket aberto');
                        this.readyState = CustomWebSocket.OPEN; // OPEN
                        
                        const event = { type: 'open', target: this };
                        if (this.onopen) this.onopen(event);
                        this._dispatchEvent('open', event);
                    });
                    
                    ipcRenderer.on(`ws-message-${this.connectionId}`, (event, data) => {
                        console.log('WebSocket mensagem recebida');
                        
                        const messageEvent = { 
                            type: 'message',
                            data: data, 
                            target: this 
                        };
                        
                        if (this.onmessage) this.onmessage(messageEvent);
                        this._dispatchEvent('message', messageEvent);
                    });
                    
                    ipcRenderer.on(`ws-error-${this.connectionId}`, (event, error) => {
                        console.error('WebSocket erro:', error);
                        
                        const errorEvent = { 
                            type: 'error',
                            error: error, 
                            target: this 
                        };
                        
                        if (this.onerror) this.onerror(errorEvent);
                        this._dispatchEvent('error', errorEvent);
                    });
                    
                    ipcRenderer.on(`ws-close-${this.connectionId}`, (event, { code, reason }) => {
                        console.log('WebSocket fechado:', code, reason);
                        this.readyState = CustomWebSocket.CLOSED; // CLOSED
                        
                        const closeEvent = { 
                            type: 'close',
                            code: code, 
                            reason: reason, 
                            target: this,
                            wasClean: code === 1000
                        };
                        
                        if (this.onclose) this.onclose(closeEvent);
                        this._dispatchEvent('close', closeEvent);
                        
                        // Remover listeners
                        this._removeAllListeners();
                    });
                } catch (error) {
                    console.error('Erro ao conectar WebSocket via IPC:', error);
                    this.readyState = CustomWebSocket.CLOSED; // CLOSED
                    
                    const errorEvent = { 
                        type: 'error',
                        error: error, 
                        target: this 
                    };
                    
                    if (this.onerror) this.onerror(errorEvent);
                    this._dispatchEvent('error', errorEvent);
                    
                    const closeEvent = { 
                        type: 'close',
                        code: 1006, 
                        reason: 'Erro de conexão', 
                        target: this,
                        wasClean: false
                    };
                    
                    if (this.onclose) this.onclose(closeEvent);
                    this._dispatchEvent('close', closeEvent);
                }
            }
            
            _removeAllListeners() {
                if (this.connectionId) {
                    ipcRenderer.removeAllListeners(`ws-open-${this.connectionId}`);
                    ipcRenderer.removeAllListeners(`ws-message-${this.connectionId}`);
                    ipcRenderer.removeAllListeners(`ws-error-${this.connectionId}`);
                    ipcRenderer.removeAllListeners(`ws-close-${this.connectionId}`);
                }
            }
            
            _dispatchEvent(type, event) {
                if (this._listeners[type]) {
                    this._listeners[type].forEach(listener => {
                        try {
                            listener(event);
                        } catch (error) {
                            console.error(`Erro ao executar listener de ${type}:`, error);
                        }
                    });
                }
            }
            
            addEventListener(type, listener) {
                if (this._listeners[type]) {
                    this._listeners[type].push(listener);
                }
            }
            
            removeEventListener(type, listener) {
                if (this._listeners[type]) {
                    const index = this._listeners[type].indexOf(listener);
                    if (index !== -1) {
                        this._listeners[type].splice(index, 1);
                    }
                }
            }
            
            async send(data) {
                if (this.readyState !== CustomWebSocket.OPEN) {
                    throw new Error('WebSocket não está conectado');
                }
                
                try {
                    const result = await ipcRenderer.invoke('ws-send', {
                        connectionId: this.connectionId,
                        message: data
                    });
                    
                    if (!result.success) {
                        throw new Error(result.error || 'Erro ao enviar mensagem');
                    }
                } catch (error) {
                    console.error('Erro ao enviar mensagem WebSocket:', error);
                    
                    const errorEvent = { 
                        type: 'error',
                        error: error, 
                        target: this 
                    };
                    
                    if (this.onerror) this.onerror(errorEvent);
                    this._dispatchEvent('error', errorEvent);
                }
            }
            
            close(code = 1000, reason = '') {
                if (this.readyState === CustomWebSocket.CLOSED) return; // Já fechado
                
                try {
                    console.log('Fechando WebSocket, ID:', this.connectionId);
                    this.readyState = CustomWebSocket.CLOSING; // CLOSING
                    
                    ipcRenderer.invoke('ws-close', this.connectionId)
                        .catch(error => {
                            console.error('Erro ao fechar WebSocket:', error);
                            
                            const errorEvent = { 
                                type: 'error',
                                error: error, 
                                target: this 
                            };
                            
                            if (this.onerror) this.onerror(errorEvent);
                            this._dispatchEvent('error', errorEvent);
                        });
                } catch (error) {
                    console.error('Erro ao fechar WebSocket:', error);
                    
                    const errorEvent = { 
                        type: 'error',
                        error: error, 
                        target: this 
                    };
                    
                    if (this.onerror) this.onerror(errorEvent);
                    this._dispatchEvent('error', errorEvent);
                }
            }
        }
        
        return new CustomWebSocket(url);
    },
    
    // Limpar cache
    clearCache: () => {
        console.log('Limpando cache de requisições');
        requestCache.clear();
        return true;
    },
    
    // Armazenamento local
    storage: {
        get: (key) => {
            try {
                const value = localStorage.getItem(key);
                return value ? JSON.parse(value) : null;
            } catch (error) {
                console.error('Erro ao ler do localStorage:', error);
                return null;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Erro ao escrever no localStorage:', error);
                return false;
            }
        },
        remove: (key) => {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.error('Erro ao remover do localStorage:', error);
                return false;
            }
        },
        clear: () => {
            try {
                localStorage.clear();
                return true;
            } catch (error) {
                console.error('Erro ao limpar localStorage:', error);
                return false;
            }
        }
    },
    
    // Funções de utilidade
    utils: {
        // Formatar data
        formatDate: (date) => {
            const d = new Date(date);
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
        },
        // Gerar ID único
        generateId: () => {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }
    }
});

// Detectar se o preload está sendo executado em modo de desenvolvimento
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
if (isDev) {
    console.log('NEXUS AI rodando em modo de desenvolvimento');
    
    // Expor APIs adicionais apenas em modo de desenvolvimento
    contextBridge.exposeInMainWorld('dev', {
        isDevMode: true,
        reload: () => {
            location.reload();
        },
        inspect: (selector) => {
            const element = document.querySelector(selector);
            if (element) {
                console.log('Elemento inspecionado:', element);
            } else {
                console.warn('Elemento não encontrado:', selector);
            }
        }
    });
}

console.log('APIs expostas com sucesso!'); 