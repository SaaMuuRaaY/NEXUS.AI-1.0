from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, List, Optional, Any, Set
import uvicorn
import json
import os
import logging
import asyncio
import time
from datetime import datetime

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("nexus_ai.log")
    ]
)
logger = logging.getLogger("nexus_ai")

# Inicialização da aplicação FastAPI
app = FastAPI(
    title="NEXUS AI API",
    description="API para o assistente de IA pessoal NEXUS AI",
    version="1.0.0"
)

# Configuração de CORS para permitir requisições do frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todas as origens
    allow_credentials=True,
    allow_methods=["*"],  # Permite todos os métodos
    allow_headers=["*"],  # Permite todos os cabeçalhos
)

# Middleware para logging de requisições
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    
    # Gerar ID único para a requisição
    request_id = f"{int(start_time * 1000)}"
    
    # Log da requisição
    logger.info(f"Request {request_id} started: {request.method} {request.url.path}")
    
    try:
        # Processar a requisição
        response = await call_next(request)
        
        # Calcular tempo de processamento
        process_time = time.time() - start_time
        
        # Log da resposta
        logger.info(f"Request {request_id} completed: {response.status_code} in {process_time:.4f}s")
        
        # Adicionar headers de performance
        response.headers["X-Process-Time"] = f"{process_time:.4f}"
        response.headers["X-Request-ID"] = request_id
        
        return response
    except Exception as e:
        # Log de erro
        logger.error(f"Request {request_id} failed: {str(e)}")
        
        # Retornar erro 500 em caso de exceção não tratada
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro interno do servidor"}
        )

# Modelos de dados
class ChatMessage(BaseModel):
    message: str
    module: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    module: str
    timestamp: str

# Armazenamento temporário para conexões WebSocket
active_connections: Set[WebSocket] = set()

# Módulos de IA
class AIModule:
    def __init__(self, name: str):
        self.name = name
        logger.info(f"Módulo {name} inicializado")
    
    async def process(self, message: str) -> str:
        # Implementação básica, cada módulo específico deve sobrescrever este método
        return f"Processado por {self.name}: {message}"

class DatabankAI(AIModule):
    def __init__(self):
        super().__init__("DATABANK AI")
    
    async def process(self, message: str) -> str:
        # Simulação de busca de informações
        await asyncio.sleep(0.5)  # Simular processamento assíncrono
        return f"DATABANK AI encontrou informações relacionadas a: {message}"

class AutomaAI(AIModule):
    def __init__(self):
        super().__init__("AUTOMA AI")
    
    async def process(self, message: str) -> str:
        # Simulação de automação
        await asyncio.sleep(0.3)  # Simular processamento assíncrono
        return f"AUTOMA AI está pronto para automatizar: {message}"

class CodexAI(AIModule):
    def __init__(self):
        super().__init__("CODEX AI")
    
    async def process(self, message: str) -> str:
        # Simulação de geração de código
        await asyncio.sleep(0.7)  # Simular processamento assíncrono
        return f"CODEX AI gerou código para: {message}"

class VoxAI(AIModule):
    def __init__(self):
        super().__init__("VOX AI")
    
    async def process(self, message: str) -> str:
        # Simulação de processamento de voz
        await asyncio.sleep(0.2)  # Simular processamento assíncrono
        return f"VOX AI processou o comando de voz: {message}"

class AlgorAI(AIModule):
    def __init__(self):
        super().__init__("ALGOR AI")
    
    async def process(self, message: str) -> str:
        # Simulação de otimização de algoritmos
        await asyncio.sleep(0.6)  # Simular processamento assíncrono
        return f"ALGOR AI otimizou algoritmos para: {message}"

class NeuralAI(AIModule):
    def __init__(self):
        super().__init__("NEURAL AI")
    
    async def process(self, message: str) -> str:
        # Simulação de aprendizado
        await asyncio.sleep(0.4)  # Simular processamento assíncrono
        return f"NEURAL AI aprendeu sobre: {message}"

# Inicialização dos módulos
modules = {
    "databank": DatabankAI(),
    "automa": AutomaAI(),
    "codex": CodexAI(),
    "vox": VoxAI(),
    "algor": AlgorAI(),
    "neural": NeuralAI()
}

# Função para determinar qual módulo deve processar a mensagem
async def route_message(message: str) -> tuple:
    # Implementação de roteamento baseado em palavras-chave
    keywords = {
        "databank": ["buscar", "encontrar", "informação", "dados", "pesquisar"],
        "automa": ["automatizar", "executar", "tarefa", "abrir", "fechar"],
        "codex": ["código", "programar", "desenvolver", "função", "classe"],
        "vox": ["falar", "dizer", "ouvir", "voz", "áudio"],
        "algor": ["otimizar", "algoritmo", "eficiência", "melhorar", "performance"],
        "neural": ["aprender", "treinar", "adaptar", "personalizar", "preferência"]
    }
    
    # Contar ocorrências de palavras-chave
    scores = {module: 0 for module in modules}
    message_lower = message.lower()
    
    for module, words in keywords.items():
        for word in words:
            if word in message_lower:
                scores[module] += 1
    
    # Selecionar o módulo com maior pontuação
    if max(scores.values()) > 0:
        selected_module = max(scores.items(), key=lambda x: x[1])[0]
    else:
        # Se nenhum módulo específico for identificado, usar o NEURAL AI como fallback
        selected_module = "neural"
    
    logger.info(f"Mensagem roteada para o módulo: {selected_module}")
    return selected_module, await modules[selected_module].process(message)

# Tratamento de exceções global
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Erro não tratado: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Ocorreu um erro interno no servidor"}
    )

# Rotas da API
@app.get("/")
async def root():
    return {"message": "NEXUS AI API está online"}

@app.get("/status")
async def status():
    return {
        "status": "online",
        "modules": list(modules.keys()),
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@app.post("/chat", response_model=ChatResponse)
async def chat(message: ChatMessage):
    try:
        # Se um módulo específico for solicitado, use-o
        if message.module and message.module in modules:
            module_name = message.module
            response = await modules[module_name].process(message.message)
        else:
            # Caso contrário, determine o módulo apropriado
            module_name, response = await route_message(message.message)
        
        # Registrar a interação
        logger.info(f"Mensagem processada pelo módulo {module_name}: {message.message[:50]}...")
        
        return ChatResponse(
            response=response,
            module=module_name,
            timestamp=datetime.now().isoformat()
        )
    except Exception as e:
        logger.error(f"Erro ao processar mensagem: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Gerenciador de conexões WebSocket
class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"Nova conexão WebSocket estabelecida. Total: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"Conexão WebSocket encerrada. Total: {len(self.active_connections)}")
    
    async def send_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Erro ao enviar mensagem para WebSocket: {str(e)}")

# Instância do gerenciador de conexões
manager = ConnectionManager()

# WebSocket para comunicação em tempo real
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message_data = json.loads(data)
                message_text = message_data.get("message", "")
                module_name = message_data.get("module")
                
                if module_name and module_name in modules:
                    response = await modules[module_name].process(message_text)
                else:
                    module_name, response = await route_message(message_text)
                
                await manager.send_message({
                    "response": response,
                    "module": module_name,
                    "timestamp": datetime.now().isoformat()
                }, websocket)
            except json.JSONDecodeError:
                await manager.send_message({
                    "error": "Formato de mensagem inválido",
                    "timestamp": datetime.now().isoformat()
                }, websocket)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"Erro na conexão WebSocket: {str(e)}")
        if websocket in manager.active_connections:
            manager.disconnect(websocket)

# Inicialização do servidor
if __name__ == "__main__":
    logger.info("Iniciando servidor NEXUS AI...")
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True) 