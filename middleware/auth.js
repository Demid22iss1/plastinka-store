const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Требуется авторизация' });
        }
        return res.redirect("/login");
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user) return res.redirect("/login");
    if (req.session.user.role !== "admin") {
        return res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Доступ запрещен</title>
            <style>
                body{background:#0f0f0f;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;padding:20px;text-align:center}
                .error-container{max-width:500px;padding:40px;background:#181818;border-radius:16px;}
                h1{color:#ff0000;margin-bottom:20px}
                a{color:#fff;text-decoration:none;padding:10px 20px;background:linear-gradient(45deg,#ff0000,#990000);border-radius:8px;display:inline-block}
            </style>
            </head>
            <body>
            <div class="error-container">
                <h1>🚫 Доступ запрещен</h1>
                <p>Страница только для администраторов.</p>
                <a href="/">Вернуться на главную</a>
            </div>
            </body>
            </html>
        `);
    }
    next();
};

module.exports = { requireAuth, requireAdmin };