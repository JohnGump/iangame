import os

# backend/ 自身目录
BACKEND_DIR = os.path.abspath(os.path.dirname(__file__))
# 项目根 iangame/
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
os.makedirs(DATA_DIR, exist_ok=True)  # 确保 data/ 目录存在(SQLite 父目录缺失会 unable to open database file)


class Config:
    SECRET_KEY = os.environ.get('IAN_SECRET_KEY', 'ian-dev-secret-change-me-in-prod')
    # SQLite 单文件。IAN_DB 既可传完整 URI(sqlite:///xxx),也可传裸文件路径
    _DB_PATH = os.environ.get('IAN_DB_PATH', os.path.join(DATA_DIR, 'iangame.db'))
    _IAN_DB = os.environ.get('IAN_DB', 'sqlite:///' + _DB_PATH)
    # 若传入的不是 URI(无 scheme),自动补 sqlite:/// 前缀
    SQLALCHEMY_DATABASE_URI = _IAN_DB if '://' in _IAN_DB else 'sqlite:///' + _IAN_DB
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {'pool_pre_ping': True}
    # Session
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    # 经 Cloudflare Tunnel 全程 HTTPS,session cookie 标记 Secure
    # 本机 HTTP 开发时可设环境变量 IAN_COOKIE_SECURE=0 关闭
    SESSION_COOKIE_SECURE = os.environ.get('IAN_COOKIE_SECURE', '1') != '0'
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 30  # 30 天
    # 上传单次分数上限(防刷)
    MAX_SCORE_PER_SUBMIT = 9_999_999
    # 游戏令牌签名密钥(防直接调 API 刷分;部署时建议覆盖)
    GAME_TOKEN_KEY = os.environ.get('IAN_TOKEN_KEY', SECRET_KEY + '-game-token')
    GAME_TOKEN_TTL = 7200  # 令牌有效期 2 小时
