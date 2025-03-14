import os
import json
import logging
from dotenv import load_dotenv
from pathlib import Path

# Carregar variáveis de ambiente do arquivo .env
env_path = Path(__file__).parent / '.env'
load_dotenv(dotenv_path=env_path)

# Configurações do servidor
SERVER_CONFIG = {
    "host": os.getenv("SERVER_HOST", "127.0.0.1"),
    "port": int(os.getenv("SERVER_PORT", 5000)),
    "debug": os.getenv("DEBUG", "False").lower() == "true",
    "cors_origins": os.getenv("CORS_ORIGINS", "*").split(","),
    "log_level": os.getenv("LOG_LEVEL", "INFO").upper(),
}

# Configurações da API OpenAI
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

# Configurações do banco de dados
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./nexus_ai.db')

# Configurações de segurança
SECRET_KEY = os.getenv('SECRET_KEY', 'nexus_ai_secret_key_change_in_production')

# Configurações dos módulos de IA
AI_MODULES = {
    "DATABANK": {
        "enabled": os.getenv("ENABLE_DATABANK", "True").lower() == "true",
        "response_time": float(os.getenv("DATABANK_RESPONSE_TIME", 1.0)),
        "keywords": ["informação", "dados", "pesquisa", "busca", "procura", "encontra"]
    },
    "AUTOMA": {
        "enabled": os.getenv("ENABLE_AUTOMA", "True").lower() == "true",
        "response_time": float(os.getenv("AUTOMA_RESPONSE_TIME", 1.5)),
        "keywords": ["automatizar", "automação", "tarefa", "rotina", "script", "executar"]
    },
    "CODEX": {
        "enabled": os.getenv("ENABLE_CODEX", "True").lower() == "true",
        "response_time": float(os.getenv("CODEX_RESPONSE_TIME", 2.0)),
        "keywords": ["código", "programar", "desenvolver", "função", "classe", "algoritmo"]
    },
    "VOX": {
        "enabled": os.getenv("ENABLE_VOX", "True").lower() == "true",
        "response_time": float(os.getenv("VOX_RESPONSE_TIME", 0.8)),
        "keywords": ["falar", "dizer", "voz", "áudio", "som", "escutar"]
    },
    "ALGOR": {
        "enabled": os.getenv("ENABLE_ALGOR", "True").lower() == "true",
        "response_time": float(os.getenv("ALGOR_RESPONSE_TIME", 1.8)),
        "keywords": ["calcular", "análise", "estatística", "previsão", "tendência", "padrão"]
    },
    "NEURAL": {
        "enabled": os.getenv("ENABLE_NEURAL", "True").lower() == "true",
        "response_time": float(os.getenv("NEURAL_RESPONSE_TIME", 1.2)),
        "keywords": ["aprender", "entender", "compreender", "interpretar", "analisar"]
    }
}

# Configurações de logging
LOGGING_CONFIG = {
    "version": 1,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": SERVER_CONFIG["log_level"],
            "formatter": "standard",
            "stream": "ext://sys.stdout",
        },
        "file": {
            "class": "logging.FileHandler",
            "level": SERVER_CONFIG["log_level"],
            "formatter": "standard",
            "filename": os.getenv("LOG_FILE", "nexus_ai.log"),
            "mode": "a",
        },
    },
    "loggers": {
        "": {  # root logger
            "handlers": ["console", "file"],
            "level": SERVER_CONFIG["log_level"],
            "propagate": True
        }
    }
}

# Função para salvar configurações personalizadas
def save_custom_config(config_data, config_file="custom_config.json"):
    try:
        with open(config_file, 'w') as f:
            json.dump(config_data, f, indent=4)
        return True
    except Exception as e:
        logging.error(f"Erro ao salvar configurações: {e}")
        return False

# Função para carregar configurações personalizadas
def load_custom_config(config_file="custom_config.json"):
    try:
        if os.path.exists(config_file):
            with open(config_file, 'r') as f:
                custom_config = json.load(f)
            return custom_config
        return {}
    except Exception as e:
        logging.error(f"Erro ao carregar configurações: {e}")
        return {}

# Verificar configurações críticas
if not OPENAI_API_KEY and SERVER_CONFIG["debug"]:
    print("AVISO: OPENAI_API_KEY não está configurada. Algumas funcionalidades podem não funcionar corretamente.") 