import re
from functools import wraps

from flask import (
    Flask, render_template, request, session, redirect,
    url_for, jsonify, g, abort,
)
from sqlalchemy import func
from werkzeug.security import generate_password_hash, check_password_hash

from config import Config
from extensions import db
from models import User, Game, Score, Favorite, SEED_GAMES, CATEGORY_LABELS

_USERNAME_RE = re.compile(r'^[\w\u4e00-\u9fa5]{2,20}$')


def login_required(f):
    @wraps(f)
    def _w(*a, **kw):
        if 'uid' not in session:
            if request.path.startswith('/api/'):
                return jsonify(ok=False, error='请先登录'), 401
            return redirect(url_for('login'))
        return f(*a, **kw)
    return _w


def create_app(config_class=Config):
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    app.config.from_object(config_class)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        _seed()

    # ---- 每请求加载当前用户 ----
    @app.before_request
    def _load_user():
        uid = session.get('uid')
        g.user = db.session.get(User, uid) if uid else None

    @app.context_processor
    def _ctx():
        games = Game.query.order_by(Game.sort).all()
        counts = {}
        for gm in games:
            counts[gm.category] = counts.get(gm.category, 0) + 1
        return dict(
            current_user=g.user,
            all_games=games,
            category_counts=counts,
            category_labels=CATEGORY_LABELS,
        )

    # ================= 页面 =================
    @app.route('/')
    def index():
        hot = Game.query.order_by(Game.sort).limit(8).all()
        return render_template('index.html', hot_games=hot)

    @app.route('/games')
    def games_page():
        return render_template('games.html')

    @app.route('/play/<slug>')
    def play(slug):
        game = Game.query.filter_by(slug=slug).first()
        if not game:
            abort(404)
        return render_template('play.html', game=game)

    @app.route('/login')
    def login():
        return render_template('login.html', mode='login')

    @app.route('/register')
    def register():
        return render_template('login.html', mode='register')

    @app.route('/logout')
    def logout():
        session.pop('uid', None)
        return redirect(url_for('index'))

    @app.route('/profile')
    @login_required
    def profile():
        return render_template('profile.html')

    # ================= API =================
    @app.post('/api/register')
    def api_register():
        d = request.get_json(silent=True) or {}
        u = (d.get('username') or '').strip()
        p = d.get('password') or ''
        if not _USERNAME_RE.match(u):
            return jsonify(ok=False, error='用户名需 2-20 位(字母/数字/下划线/中文)'), 400
        if not (4 <= len(p) <= 60):
            return jsonify(ok=False, error='密码需 4-60 位'), 400
        if User.query.filter_by(username=u).first():
            return jsonify(ok=False, error='用户名已被占用'), 409
        user = User(username=u, password_hash=generate_password_hash(p))
        db.session.add(user)
        db.session.commit()
        session['uid'] = user.id
        return jsonify(ok=True, user=_pub(user))

    @app.post('/api/login')
    def api_login():
        d = request.get_json(silent=True) or {}
        u = (d.get('username') or '').strip()
        p = d.get('password') or ''
        user = User.query.filter_by(username=u).first()
        if not user or not check_password_hash(user.password_hash, p):
            return jsonify(ok=False, error='用户名或密码错误'), 401
        session['uid'] = user.id
        return jsonify(ok=True, user=_pub(user))

    @app.post('/api/logout')
    def api_logout():
        session.pop('uid', None)
        return jsonify(ok=True)

    @app.get('/api/me')
    def api_me():
        return jsonify(ok=True, user=_pub(g.user) if g.user else None)

    @app.get('/api/games')
    def api_games():
        return jsonify(ok=True, games=[_game_pub(gm) for gm in Game.query.order_by(Game.sort).all()])

    @app.get('/api/leaderboard/<slug>')
    def api_leaderboard(slug):
        rows = (
            db.session.query(User.username.label('u'), func.max(Score.score).label('s'))
            .join(User, Score.user_id == User.id)
            .filter(Score.game_slug == slug)
            .group_by(User.id)
            .order_by(func.max(Score.score).desc())
            .limit(20).all()
        )
        return jsonify(ok=True, board=[{'username': r.u, 'score': r.s} for r in rows])

    @app.post('/api/score')
    @login_required
    def api_score():
        d = request.get_json(silent=True) or {}
        slug = (d.get('slug') or '').strip()
        try:
            score = int(d.get('score') or 0)
            level = int(d.get('level') or 0)
        except (TypeError, ValueError):
            return jsonify(ok=False, error='参数错误'), 400
        if not Game.query.filter_by(slug=slug).first():
            return jsonify(ok=False, error='游戏不存在'), 404
        if score < 0 or score > app.config['MAX_SCORE_PER_SUBMIT']:
            return jsonify(ok=False, error='分数非法'), 400
        sc = Score(user_id=g.user.id, game_slug=slug, score=score, level=level)
        db.session.add(sc)
        db.session.commit()
        higher = db.session.query(func.count(Score.id)).filter(
            Score.game_slug == slug, Score.score > score).scalar() or 0
        rank = higher + 1
        best = db.session.query(func.max(Score.score)).filter_by(
            user_id=g.user.id, game_slug=slug).scalar() or 0
        return jsonify(ok=True, rank=int(rank), best=int(best))

    @app.get('/api/favorite')
    @login_required
    def api_fav_list():
        favs = Favorite.query.filter_by(user_id=g.user.id).all()
        return jsonify(ok=True, favorites=[f.game_slug for f in favs])

    @app.post('/api/favorite')
    @login_required
    def api_fav_toggle():
        d = request.get_json(silent=True) or {}
        slug = (d.get('slug') or '').strip()
        if not Game.query.filter_by(slug=slug).first():
            return jsonify(ok=False, error='游戏不存在'), 404
        fav = Favorite.query.filter_by(user_id=g.user.id, game_slug=slug).first()
        if fav:
            db.session.delete(fav)
            db.session.commit()
            return jsonify(ok=True, favorite=False)
        db.session.add(Favorite(user_id=g.user.id, game_slug=slug))
        db.session.commit()
        return jsonify(ok=True, favorite=True)

    @app.get('/api/profile')
    @login_required
    def api_profile():
        uid = g.user.id
        records = (
            db.session.query(
                Score.game_slug.label('slug'),
                func.max(Score.score).label('best'),
                func.count(Score.id).label('plays'),
            )
            .filter_by(user_id=uid)
            .group_by(Score.game_slug).all()
        )
        best_map = {r.slug: {'best': r.best, 'plays': r.plays} for r in records}
        favs = [f.game_slug for f in Favorite.query.filter_by(user_id=uid).all()]
        games = Game.query.order_by(Game.sort).all()
        data = []
        for gm in games:
            b = best_map.get(gm.slug)
            data.append({
                'slug': gm.slug, 'name': gm.name, 'icon': gm.icon, 'color': gm.color,
                'best': b['best'] if b else 0, 'plays': b['plays'] if b else 0,
            })
        return jsonify(ok=True, username=g.user.username, favorites=favs, games=data)

    @app.errorhandler(404)
    def _404(e):
        if request.path.startswith('/api/'):
            return jsonify(ok=False, error='not found'), 404
        return render_template('404.html'), 404

    return app


def _pub(user):
    return {'id': user.id, 'username': user.username}


def _game_pub(gm):
    return {
        'slug': gm.slug, 'name': gm.name, 'category': gm.category,
        'icon': gm.icon, 'color': gm.color, 'desc': gm.desc, 'controls': gm.controls,
    }


def _seed():
    if Game.query.first():
        return
    for i, g in enumerate(SEED_GAMES):
        db.session.add(Game(sort=i, **g))
    db.session.commit()


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=5000, debug=True)
