from datetime import datetime

from extensions import db


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(20), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Game(db.Model):
    __tablename__ = 'games'
    id = db.Column(db.Integer, primary_key=True)
    slug = db.Column(db.String(32), unique=True, nullable=False, index=True)
    name = db.Column(db.String(40), nullable=False)
    category = db.Column(db.String(20), nullable=False, index=True)
    icon = db.Column(db.String(8), default='🎮')
    color = db.Column(db.String(9), default='#b537f2')
    desc = db.Column(db.String(200), default='')
    controls = db.Column(db.String(200), default='')
    sort = db.Column(db.Integer, default=0)


class Score(db.Model):
    __tablename__ = 'scores'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    game_slug = db.Column(db.String(32), db.ForeignKey('games.slug'), nullable=False, index=True)
    score = db.Column(db.Integer, nullable=False, default=0)
    level = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Favorite(db.Model):
    __tablename__ = 'favorites'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    game_slug = db.Column(db.String(32), db.ForeignKey('games.slug'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (
        db.UniqueConstraint('user_id', 'game_slug', name='uq_user_game'),
    )


class LoginAttempt(db.Model):
    """登录失败记录(跨 worker 共享,防暴力破解)。定期清理过期记录。"""
    __tablename__ = 'login_attempts'
    id = db.Column(db.Integer, primary_key=True)
    ip = db.Column(db.String(64), nullable=False, index=True)
    ts = db.Column(db.Float, nullable=False)  # 失败时间戳(epoch 秒)


# 13 款游戏种子数据
SEED_GAMES = [
    {"slug": "pvz", "name": "植物大战僵尸", "category": "defense", "icon": "🌻", "color": "#5fd35f",
     "desc": "布置植物军团,抵御一波波僵尸入侵草坪", "controls": "点击空地放置植物,收集阳光"},
    {"slug": "kof", "name": "拳皇激斗", "category": "battle", "icon": "👊", "color": "#ff2e63",
     "desc": "经典格斗对决,拳脚连招加必杀技", "controls": "A/D 移动 · W 跳 · J 拳 · K 脚 · L 必杀"},
    {"slug": "snake", "name": "霓虹贪吃蛇", "category": "casual", "icon": "🐍", "color": "#00e0ff",
     "desc": "操控霓虹蛇吞噬光点,越长越快", "controls": "方向键控制方向"},
    {"slug": "tetris", "name": "俄罗斯方块", "category": "puzzle", "icon": "🟦", "color": "#b537f2",
     "desc": "经典方块消除,整行消除得分", "controls": "←→ 移动 · ↑ 旋转 · ↓ 加速 · 空格直落"},
    {"slug": "g2048", "name": "2048", "category": "puzzle", "icon": "🔢", "color": "#ffb627",
     "desc": "滑动合并相同数字,挑战 2048", "controls": "方向键合并"},
    {"slug": "breakout", "name": "打砖块", "category": "casual", "icon": "🧱", "color": "#ff7847",
     "desc": "移动挡板反弹小球,击碎所有砖块", "controls": "鼠标 / 方向键移动挡板"},
    {"slug": "minesweeper", "name": "扫雷", "category": "puzzle", "icon": "💣", "color": "#7c8ba0",
     "desc": "逻辑推理标记地雷,揭开所有安全格", "controls": "左键揭开 · 右键插旗"},
    {"slug": "gomoku", "name": "五子棋", "category": "battle", "icon": "⚫", "color": "#00e0ff",
     "desc": "人机对弈,五子连珠者胜", "controls": "点击棋盘落子"},
    {"slug": "flappy", "name": "像素小鸟", "category": "casual", "icon": "🐤", "color": "#ffb627",
     "desc": "点击让小鸟飞跃管道,挑战极限", "controls": "点击 / 空格让小鸟上飞"},
    {"slug": "shooter", "name": "飞机大战", "category": "shooter", "icon": "🚀", "color": "#b537f2",
     "desc": "驾驶战机消灭敌机,拾取强化道具", "controls": "鼠标 / 方向键移动,自动开火"},
    {"slug": "tankbattle", "name": "坦克大战", "category": "shooter", "icon": "🛡️", "color": "#5fd35f",
     "desc": "操控坦克摧毁敌方,保卫基地", "controls": "方向键移动 · 空格开炮"},
    {"slug": "memory", "name": "记忆翻牌", "category": "puzzle", "icon": "🃏", "color": "#ff2e63",
     "desc": "翻开卡牌找出相同图案,考验记忆", "controls": "点击翻牌配对"},
    {"slug": "ironcommand", "name": "铁幕指挥官", "category": "strategy", "icon": "⚙️", "color": "#3da9fc",
     "desc": "红警风即时战略:采矿、建造基地、生产军队,指挥作战摧毁敌方主基地(含战争迷雾、科技树、可选核弹)",
     "controls": "左键框选单位·右键移动/攻击·WASD移视野·右侧面板建造生产"},
]

CATEGORY_LABELS = {
    'casual': '休闲',
    'puzzle': '益智',
    'shooter': '射击',
    'battle': '对战',
    'defense': '塔防',
    'strategy': '策略',
}
