const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { db } = require("../models/db");

// Страница входа
router.get("/login", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Вход · Plastinka</title>
            <link rel="stylesheet" href="/style.css">
            <style>
                body{background:#0f0f0f;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
                .login-container{max-width:400px;width:100%;padding:40px;background:#181818;border-radius:16px;text-align:center;}
                .login-container img{width:150px;margin-bottom:20px;}
                h1{color:white;margin-bottom:10px;}
                .subtitle{color:#888;margin-bottom:30px;}
                .form-group{margin-bottom:20px;text-align:left;}
                .form-group label{display:block;margin-bottom:8px;color:#aaa;}
                .form-group input{width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;box-sizing:border-box;}
                .login-btn{width:100%;padding:14px;border:none;background:linear-gradient(45deg,#ff0000,#990000);color:#fff;border-radius:10px;font-weight:bold;cursor:pointer;}
                .register-link{margin-top:20px;color:#aaa;}
                .register-link a{color:#ff0000;text-decoration:none;}
                .error-message{background:rgba(255,0,0,0.1);border:1px solid #ff0000;color:#ff0000;padding:10px;border-radius:8px;margin-bottom:20px;}
            </style>
        </head>
        <body>
            <div class="login-container">
                <img src="/photo/logo.svg">
                <h1>Добро пожаловать</h1>
                <div class="subtitle">Войдите в свой аккаунт</div>
                ${req.query.error ? '<div class="error-message">❌ Неверное имя пользователя или пароль</div>' : ''}
                ${req.query.registered ? '<div class="error-message" style="background:rgba(0,255,0,0.1);border-color:#00ff00;color:#00ff00;">✅ Регистрация успешна!</div>' : ''}
                <form action="/login" method="POST">
                    <div class="form-group"><label>Имя пользователя</label><input type="text" name="username" required></div>
                    <div class="form-group"><label>Пароль</label><input type="password" name="password" required></div>
                    <button type="submit" class="login-btn">Войти</button>
                </form>
                <div class="register-link">Нет аккаунта? <a href="/register">Зарегистрироваться</a></div>
                <a href="/" style="display:block;margin-top:20px;color:#666;">← Вернуться на главную</a>
            </div>
        </body>
        </html>
    `);
});

router.post("/login", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = { id: user.id, username: user.username, role: user.role, avatar: user.avatar };
            res.redirect("/");
        } else {
            res.redirect("/login?error=1");
        }
    });
});

// Страница регистрации
router.get("/register", (req, res) => {
    if (req.session.user) return res.redirect("/");
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Регистрация · Plastinka</title>
            <link rel="stylesheet" href="/style.css">
            <style>
                body{background:#0f0f0f;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}
                .register-container{max-width:400px;width:100%;padding:40px;background:#181818;border-radius:16px;text-align:center;}
                .register-container img{width:150px;margin-bottom:20px;}
                h1{color:white;margin-bottom:10px;}
                .subtitle{color:#888;margin-bottom:30px;}
                .form-group{margin-bottom:20px;text-align:left;}
                .form-group label{display:block;margin-bottom:8px;color:#aaa;}
                .form-group input{width:100%;padding:12px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;box-sizing:border-box;}
                .register-btn{width:100%;padding:14px;border:none;background:linear-gradient(45deg,#ff0000,#990000);color:#fff;border-radius:10px;font-weight:bold;cursor:pointer;}
                .login-link{margin-top:20px;color:#aaa;}
                .login-link a{color:#ff0000;text-decoration:none;}
                .error-message{background:rgba(255,0,0,0.1);border:1px solid #ff0000;color:#ff0000;padding:10px;border-radius:8px;margin-bottom:20px;}
            </style>
        </head>
        <body>
            <div class="register-container">
                <img src="/photo/logo.svg">
                <h1>Создать аккаунт</h1>
                <div class="subtitle">Присоединяйтесь к Plastinka</div>
                ${req.query.error === 'exists' ? '<div class="error-message">❌ Пользователь с таким именем уже существует</div>' : ''}
                <form action="/register" method="POST">
                    <div class="form-group"><label>Имя пользователя</label><input type="text" name="username" required></div>
                    <div class="form-group"><label>Пароль</label><input type="password" name="password" required></div>
                    <button type="submit" class="register-btn">Зарегистрироваться</button>
                </form>
                <div class="login-link">Уже есть аккаунт? <a href="/login">Войти</a></div>
                <a href="/" style="display:block;margin-top:20px;color:#666;">← Вернуться на главную</a>
            </div>
        </body>
        </html>
    `);
});

router.post("/register", (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (user) return res.redirect("/register?error=exists");
        const hash = bcrypt.hashSync(password, 10);
        db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", [username, hash, "user"], function(err) {
            if (err) return res.redirect("/register?error=exists");
            res.redirect("/login?registered=1");
        });
    });
});

module.exports = router;