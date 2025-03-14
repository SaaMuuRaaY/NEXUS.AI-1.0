import logging
import logging.config
from main import app
from config import SERVER_CONFIG, LOGGING_CONFIG

# Configurar logging
logging.config.dictConfig(LOGGING_CONFIG)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info(f"Iniciando NEXUS AI Backend em {SERVER_CONFIG['host']}:{SERVER_CONFIG['port']}")
    app.run(host=SERVER_CONFIG["host"], port=SERVER_CONFIG["port"], debug=SERVER_CONFIG["debug"]) 