const express = require("express");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const app = express();

// Подключаем модули
const { initDb, db } = require("./models/db");
const authMiddleware = require("./middleware/auth");
const uploadMiddleware = require("./middleware/upload");

// Подключаем маршруты
const authRoutes = require("./routes/auth");
const apiRoutes = require("./routes/api");
const pagesRoutes = require("./routes/pages");
const adminRoutes = require("./routes/admin");

// ============================================================
// НАСТРОЙКИ MIDDLEWARE
// ============================================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.use(session({
    secret: "plastinka-secret-key-2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Определение мобильного устройства
app.use((req, res, next) => {
    req.isMobile = /mobile|android|iphone|ipad|phone/i.test(req.headers['user-agent'] || '');
    next();
});

// Глобальная функция escapeHtml
app.use((req, res, next) => {
    res.locals.escapeHtml = (str) => {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };
    next();
});

// ============================================================
// ПОДКЛЮЧЕНИЕ МАРШРУТОВ
// ============================================================
app.use("/", pagesRoutes);
app.use("/", authRoutes);
app.use("/api", apiRoutes);
app.use("/admin", adminRoutes);

// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================
const PORT = process.env.PORT || 3000;

// Инициализация БД и запуск сервера
initDb().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Сервер запущен на порту ${PORT}`);
        console.log(`📱 Мобильная версия: http://localhost:${PORT}`);
        console.log(`💻 Десктоп версия: http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error("Ошибка инициализации БД:", err);
    process.exit(1);
});

module.exports = app;