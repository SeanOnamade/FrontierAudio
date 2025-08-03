"""
Configuration settings for Airport Operations Voice Assistant
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Config:
    """Base configuration class"""
    
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
    OPENAI_MAX_TOKENS = int(os.getenv('OPENAI_MAX_TOKENS', '300'))
    OPENAI_TEMPERATURE = float(os.getenv('OPENAI_TEMPERATURE', '0.1'))
    
    # Database Configuration
    DATABASE_PATH = os.getenv('DATABASE_PATH', 'united_airlines_normalized.db')
    DATABASE_TIMEOUT = int(os.getenv('DATABASE_TIMEOUT', '30'))
    
    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = os.getenv('FLASK_DEBUG', 'True').lower() == 'true'
    HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    PORT = int(os.getenv('FLASK_PORT', '3000'))
    
    # Voice Assistant Configuration
    CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.7'))
    MAX_LATENCY_SECONDS = float(os.getenv('MAX_LATENCY_SECONDS', '3.0'))
    WAKE_WORDS = os.getenv('WAKE_WORDS', 'jarvis,hey jarvis').split(',')
    
    # Speech Configuration
    SPEECH_LANGUAGE = os.getenv('SPEECH_LANGUAGE', 'en-US')
    SPEECH_RATE = float(os.getenv('SPEECH_RATE', '1.0'))
    SPEECH_PITCH = float(os.getenv('SPEECH_PITCH', '1.0'))
    SPEECH_VOLUME = float(os.getenv('SPEECH_VOLUME', '1.0'))
    
    # Logging Configuration
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'voice_assistant.log')
    LOG_MAX_BYTES = int(os.getenv('LOG_MAX_BYTES', '10485760'))  # 10MB
    LOG_BACKUP_COUNT = int(os.getenv('LOG_BACKUP_COUNT', '5'))
    
    # Security Configuration
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*')
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', '1048576'))  # 1MB
    
    # Performance Configuration
    MAX_CONVERSATION_HISTORY = int(os.getenv('MAX_CONVERSATION_HISTORY', '50'))
    QUERY_TIMEOUT_SECONDS = int(os.getenv('QUERY_TIMEOUT_SECONDS', '30'))
    
    # UI Configuration
    UI_THEME = os.getenv('UI_THEME', 'dark')
    ENABLE_DEBUG_UI = os.getenv('ENABLE_DEBUG_UI', 'True').lower() == 'true'
    
    # Text-to-SQL Enhancement Flags (for safe rollback)
    ENHANCED_PROMPTS_ENABLED = os.getenv('ENHANCED_PROMPTS_ENABLED', 'True').lower() == 'true'
    ENHANCED_SCHEMA_ENABLED = os.getenv('ENHANCED_SCHEMA_ENABLED', 'True').lower() == 'true'
    QUERY_CLASSIFICATION_ENABLED = os.getenv('QUERY_CLASSIFICATION_ENABLED', 'True').lower() == 'true'
    
    # New Classification Enhancement Flags (performance boosters - enabled by default)
    ENHANCED_KEYWORDS_ENABLED = os.getenv('ENHANCED_KEYWORDS_ENABLED', 'True').lower() == 'true'
    ENHANCED_PHRASES_ENABLED = os.getenv('ENHANCED_PHRASES_ENABLED', 'True').lower() == 'true'
    CLARIFICATION_ENABLED = os.getenv('CLARIFICATION_ENABLED', 'False').lower() == 'true'
    LEARNING_ENABLED = os.getenv('LEARNING_ENABLED', 'False').lower() == 'true'
    
    # Transparent Response System (enabled by default - improves UX without risk)
    TRANSPARENT_RESPONSES_ENABLED = os.getenv('TRANSPARENT_RESPONSES_ENABLED', 'True').lower() == 'true'
    
    @classmethod
    def validate_config(cls):
        """Validate configuration settings"""
        errors = []
        
        # Check required settings
        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY is required")
        
        if not os.path.exists(cls.DATABASE_PATH):
            errors.append(f"Database file not found: {cls.DATABASE_PATH}")
        
        # Validate numeric ranges
        if not 0 <= cls.CONFIDENCE_THRESHOLD <= 1:
            errors.append("CONFIDENCE_THRESHOLD must be between 0 and 1")
        
        if cls.MAX_LATENCY_SECONDS <= 0:
            errors.append("MAX_LATENCY_SECONDS must be positive")
        
        if not 0 <= cls.SPEECH_RATE <= 3:
            errors.append("SPEECH_RATE must be between 0 and 3")
        
        if not 0 <= cls.SPEECH_PITCH <= 2:
            errors.append("SPEECH_PITCH must be between 0 and 2")
        
        if not 0 <= cls.SPEECH_VOLUME <= 1:
            errors.append("SPEECH_VOLUME must be between 0 and 1")
        
        return errors
    
    @classmethod
    def get_speech_config(cls):
        """Get speech configuration as dict"""
        return {
            'language': cls.SPEECH_LANGUAGE,
            'rate': cls.SPEECH_RATE,
            'pitch': cls.SPEECH_PITCH,
            'volume': cls.SPEECH_VOLUME
        }
    
    @classmethod
    def get_openai_config(cls):
        """Get OpenAI configuration as dict"""
        return {
            'api_key': cls.OPENAI_API_KEY,
            'model': cls.OPENAI_MODEL,
            'max_tokens': cls.OPENAI_MAX_TOKENS,
            'temperature': cls.OPENAI_TEMPERATURE
        }
    
    @classmethod
    def get_wake_words(cls):
        """Get list of wake words"""
        return [word.strip().lower() for word in cls.WAKE_WORDS]

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    LOG_LEVEL = 'DEBUG'

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    LOG_LEVEL = 'WARNING'
    SECRET_KEY = os.getenv('SECRET_KEY')  # Must be set in production
    
    @classmethod
    def validate_config(cls):
        """Additional validation for production"""
        errors = super().validate_config()
        
        if cls.SECRET_KEY == 'dev-secret-key-change-in-production':
            errors.append("SECRET_KEY must be changed in production")
        
        return errors

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DATABASE_PATH = ':memory:'  # In-memory database for tests
    OPENAI_API_KEY = 'test-key'
    DEBUG = True

# Configuration mapping
config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}

def get_config(config_name=None):
    """Get configuration class based on environment"""
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'default')
    
    return config_map.get(config_name, DevelopmentConfig) 