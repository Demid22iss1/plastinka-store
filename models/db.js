const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");

const db = new sqlite3.Database("./database.sqlite");

function initDb() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Создание всех таблиц
            db.run(`CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                artist TEXT,
                price REAL,
                image TEXT,
                audio TEXT,
                description TEXT,
                genre TEXT,
                year TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                price REAL,
                image TEXT,
                description TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT DEFAULT 'user',
                avatar TEXT DEFAULT 'default-avatar.png',
                telegram_id INTEGER
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS carts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product_id TEXT,
                quantity INTEGER DEFAULT 1,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, product_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS favorites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product_id TEXT,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, product_id)
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS site_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )`);

            db.run(`CREATE TABLE IF NOT EXISTS ratings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                product_id INTEGER,
                rating INTEGER CHECK(rating >= 1 AND rating <= 5),
                comment TEXT,
                admin_reply TEXT,
                admin_reply_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES products(id),
                UNIQUE(user_id, product_id)
            )`);

            // Добавление тестовых данных
            addTestData().then(() => resolve()).catch(reject);
        });
    });
}

function addTestData() {
    return new Promise((resolve) => {
        // Настройки главной страницы
        db.get("SELECT COUNT(*) as count FROM site_settings WHERE key = 'homepage_products'", [], (err, result) => {
            if (!err && result.count === 0) {
                db.run("INSERT INTO site_settings (key, value) VALUES (?, ?)", ['homepage_products', 'last_added']);
            }
        });

        // Тестовые проигрыватели
        db.get("SELECT COUNT(*) as count FROM players", [], (err, result) => {
            if (!err && result.count === 0) {
                const players = [
                    ['Pro-Ject Debut Carbon', 499, 'proigrvatel1.png', 'Высококачественный проигрыватель винила с углеволокновым тонармом.'],
                    ['Audio-Technica AT-LP120', 299, 'proigrvatel2.png', 'Профессиональный проигрыватель с прямым приводом.'],
                    ['Rega Planar 3', 899, 'proigrvatel3.png', 'Легендарный британский проигрыватель.']
                ];
                const stmt = db.prepare("INSERT INTO players (name, price, image, description) VALUES (?, ?, ?, ?)");
                players.forEach(p => stmt.run(p));
                stmt.finalize();
            }
        });

        // Тестовые пластинки
        db.get("SELECT COUNT(*) as count FROM products", [], (err, result) => {
            if (!err && result.count === 0) {
                const products = [
                    ['Dark Side of the Moon', 'Pink Floyd', 35, 'dark-side.png', 'dark-side.mp3', 'Легендарный альбом', 'Rock', '1973'],
                    ['Abbey Road', 'The Beatles', 40, 'abbey-road.png', 'abbey-road.mp3', 'Последний записанный альбом', 'Rock', '1969'],
                    ['Thriller', 'Michael Jackson', 45, 'thriller.png', 'thriller.mp3', 'Самый продаваемый альбом', 'Pop', '1982']
                ];
                const stmt = db.prepare("INSERT INTO products (name, artist, price, image, audio, description, genre, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                products.forEach(p => stmt.run(p));
                stmt.finalize();
            }
        });

        // Администратор
        db.get("SELECT COUNT(*) as count FROM users", [], (err, result) => {
            if (!err && result.count === 0) {
                const hash = bcrypt.hashSync("admin123", 10);
                db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ["admin", hash, "admin"]);
                console.log("👤 Создан пользователь admin с паролем admin123");
            }
            setTimeout(resolve, 500);
        });
    });
}

// Создание папок
const uploadDirs = ['public/uploads', 'public/audio', 'public/photo', 'public/avatars'];
uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Создана папка: ${dir}`);
    }
});

module.exports = { db, initDb };