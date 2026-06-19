import os

# backend/ 自身目录
BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
# 项目根 iangame/
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')


class Config:
    SECRET_KEY = os.environ.get('IAN_SECRET_KEY', 'ian-dev-secret-change-me-in-prod')
    # SQLite 单文件
    _DB_PATH = os.environ.get('IAN_DB_PATH', os.path.join(DATA_DIR, 'iangame.db'))
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'IAN_DB', 'sqlite:///' + _DB_PATH
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}
    # Session
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 30  # 30 天
    # 上传单次分数上限(防刷)
    MAX_SCORE_PER_SUBMIT = 9_999_999
