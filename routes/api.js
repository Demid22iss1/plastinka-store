const express = require("express");
const router = express.Router();
const { db } = require("../models/db");
const { requireAuth } = require("../middleware/auth");
const upload = require("../middleware/upload");
const bcrypt = require("bcryptjs");

// Telegram авторизация
router.post("/telegram-auth", express.json(), (req, res) => {
    const { id, first_name, last_name, username, photo_url } = req.body;
    if (!id) return res.json({ success: false, error: "No telegram id" });
    
    db.get("SELECT * FROM users WHERE telegram_id = ?", [id], (err, user) => {
        if (err) return res.json({ success: false, error: err.message });
        
        if (user) {
            req.session.user = { id: user.id, username: user.username, role: user.role, avatar: user.avatar, telegram_id: id };
            res.json({ success: true, isNew: false });
        } else {
            const newUsername = username || `tg_user_${id}`;
            const defaultPassword = Math.random().toString(36).substring(2, 15);
            const hash = bcrypt.hashSync(defaultPassword, 10);
            
            db.run("INSERT INTO users (username, password, role, telegram_id, avatar) VALUES (?, ?, 'user', ?, ?)",
                [newUsername, hash, id, 'default-avatar.png'],
                function(err) {
                    if (err) return res.json({ success: false, error: err.message });
                    req.session.user = { id: this.lastID, username: newUsername, role: 'user', avatar: 'default-avatar.png', telegram_id: id };
                    res.json({ success: true, isNew: true });
                }
            );
        }
    });
});

// Аватар
router.post("/upload-avatar", requireAuth, upload.single("avatar"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
    db.run("UPDATE users SET avatar = ? WHERE id = ?", [req.file.filename, req.session.user.id], (err) => {
        if (err) return res.status(500).json({ error: "Ошибка сохранения аватара" });
        req.session.user.avatar = req.file.filename;
        res.json({ success: true, avatar: `/avatars/${req.file.filename}` });
    });
});

// Обновление профиля
router.post("/update-profile", requireAuth, express.json(), (req, res) => {
    const { username, currentPassword, newPassword } = req.body;
    const userId = req.session.user.id;
    
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
        if (err || !user) return res.status(404).json({ error: "Пользователь не найден" });
        
        const updateUser = () => {
            if (currentPassword && newPassword) {
                if (bcrypt.compareSync(currentPassword, user.password)) {
                    const hashedPassword = bcrypt.hashSync(newPassword, 10);
                    db.run("UPDATE users SET username = ?, password = ? WHERE id = ?", [username || user.username, hashedPassword, userId], (err) => {
                        if (err) return res.json({ success: false, error: "Ошибка обновления" });
                        req.session.user.username = username || user.username;
                        res.json({ success: true });
                    });
                } else {
                    res.json({ success: false, error: "Неверный текущий пароль" });
                }
            } else {
                db.run("UPDATE users SET username = ? WHERE id = ?", [username || user.username, userId], (err) => {
                    if (err) return res.json({ success: false, error: "Ошибка обновления" });
                    req.session.user.username = username || user.username;
                    res.json({ success: true });
                });
            }
        };
        
        if (username && username !== user.username) {
            db.get("SELECT id FROM users WHERE username = ? AND id != ?", [username, userId], (err, existing) => {
                if (existing) return res.json({ success: false, error: "Имя пользователя уже занято" });
                updateUser();
            });
        } else {
            updateUser();
        }
    });
});

// Избранное
router.get("/favorites/status/:productId", requireAuth, (req, res) => {
    const { productId } = req.params;
    const userId = req.session.user.id;
    db.get("SELECT 1 FROM favorites WHERE user_id = ? AND product_id = ?", [userId, productId], (err, fav) => {
        res.json({ isFavorite: !!fav });
    });
});

router.get("/favorites/count", requireAuth, (req, res) => {
    db.get("SELECT COUNT(*) as count FROM favorites WHERE user_id = ?", [req.session.user.id], (err, result) => {
        res.json({ count: result?.count || 0 });
    });
});

router.get("/favorites/list", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    
    db.all(`SELECT f.*, p.name, p.artist, p.price, p.image, p.id as product_db_id
            FROM favorites f JOIN products p ON f.product_id = 'product_' || p.id
            WHERE f.user_id = ? ORDER BY f.added_at DESC`, [userId], (err, products) => {
        
        db.all(`SELECT f.*, p.name, p.price, p.image, p.id as player_db_id
                FROM favorites f JOIN players p ON f.product_id = 'player_' || p.id
                WHERE f.user_id = ? ORDER BY f.added_at DESC`, [userId], (err2, players) => {
            
            const allFavorites = [];
            if (products) {
                products.forEach(p => {
                    allFavorites.push({ id: p.product_db_id, type: 'product', name: p.name, artist: p.artist, price: p.price, image: p.image, added_at: p.added_at });
                });
            }
            if (players) {
                players.forEach(p => {
                    allFavorites.push({ id: p.player_db_id, type: 'player', name: p.name, artist: 'Проигрыватель', price: p.price, image: p.image, added_at: p.added_at });
                });
            }
            allFavorites.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
            res.json({ success: true, favorites: allFavorites });
        });
    });
});

router.post("/favorites/toggle", requireAuth, express.json(), (req, res) => {
    const { id } = req.body;
    const userId = req.session.user.id;
    
    db.get("SELECT * FROM favorites WHERE user_id = ? AND product_id = ?", [userId, id], (err, fav) => {
        if (fav) {
            db.run("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", [userId, id], () => {
                res.json({ success: true, action: "removed" });
            });
        } else {
            db.run("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)", [userId, id], () => {
                res.json({ success: true, action: "added" });
            });
        }
    });
});

router.post("/favorites/remove", requireAuth, express.json(), (req, res) => {
    const { productId, type } = req.body;
    const userId = req.session.user.id;
    const fullProductId = type === 'product' ? `product_${productId}` : `player_${productId}`;
    
    db.run("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", [userId, fullProductId], () => {
        res.json({ success: true });
    });
});

// Корзина
router.post("/cart/add", requireAuth, express.json(), (req, res) => {
    const { id } = req.body;
    const userId = req.session.user.id;
    
    db.get("SELECT * FROM carts WHERE user_id = ? AND product_id = ?", [userId, id], (err, existing) => {
        if (existing) {
            db.run("UPDATE carts SET quantity = quantity + 1 WHERE user_id = ? AND product_id = ?", [userId, id], () => {
                res.json({ success: true });
            });
        } else {
            db.run("INSERT INTO carts (user_id, product_id, quantity) VALUES (?, ?, 1)", [userId, id], () => {
                res.json({ success: true });
            });
        }
    });
});

router.post("/cart/update", requireAuth, express.json(), (req, res) => {
    const { product_id, action } = req.body;
    const userId = req.session.user.id;
    
    db.get("SELECT * FROM carts WHERE user_id = ? AND product_id = ?", [userId, product_id], (err, cartItem) => {
        if (!cartItem) return res.json({ success: false });
        
        let newQuantity = cartItem.quantity;
        if (action === 'increase') newQuantity++;
        else if (action === 'decrease') newQuantity--;
        
        if (newQuantity <= 0) {
            db.run("DELETE FROM carts WHERE user_id = ? AND product_id = ?", [userId, product_id], () => {
                res.json({ success: true });
            });
        } else {
            db.run("UPDATE carts SET quantity = ? WHERE user_id = ? AND product_id = ?", [newQuantity, userId, product_id], () => {
                res.json({ success: true });
            });
        }
    });
});

router.post("/cart/remove", requireAuth, express.json(), (req, res) => {
    const { product_id } = req.body;
    const userId = req.session.user.id;
    
    db.run("DELETE FROM carts WHERE user_id = ? AND product_id = ?", [userId, product_id], () => {
        res.json({ success: true });
    });
});

router.get("/cart/list", requireAuth, (req, res) => {
    const userId = req.session.user.id;
    
    db.all("SELECT * FROM carts WHERE user_id = ?", [userId], async (err, cartItems) => {
        if (err || !cartItems || cartItems.length === 0) return res.json({ items: [] });
        
        const items = [];
        for (const item of cartItems) {
            const parts = item.product_id.split('_');
            const type = parts[0];
            const id = parts[1];
            
            if (type === 'player') {
                const player = await new Promise(resolve => {
                    db.get("SELECT * FROM players WHERE id = ?", [id], (err, data) => resolve(data));
                });
                if (player) {
                    items.push({ product_id: item.product_id, type: 'player', name: player.name, artist: 'Проигрыватель', price: player.price, image: player.image, quantity: item.quantity });
                }
            } else {
                const product = await new Promise(resolve => {
                    db.get("SELECT * FROM products WHERE id = ?", [id], (err, data) => resolve(data));
                });
                if (product) {
                    items.push({ product_id: item.product_id, type: 'product', name: product.name, artist: product.artist, price: product.price, image: product.image, quantity: item.quantity });
                }
            }
        }
        res.json({ items });
    });
});

router.post("/order", requireAuth, (req, res) => {
    db.run("DELETE FROM carts WHERE user_id = ?", [req.session.user.id], () => {
        res.json({ success: true });
    });
});

// Рейтинг
router.get("/rating/:productId", (req, res) => {
    const productId = req.params.productId;
    
    db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as votes_count FROM ratings WHERE product_id = ?`, [productId], (err, result) => {
        db.all(`SELECT r.rating, r.comment, r.created_at, u.username, r.admin_reply
                FROM ratings r JOIN users u ON r.user_id = u.id
                WHERE r.product_id = ? AND r.comment IS NOT NULL AND r.comment != ''
                ORDER BY r.created_at DESC LIMIT 10`, [productId], (err2, comments) => {
            res.json({
                avg_rating: result?.avg_rating ? parseFloat(result.avg_rating).toFixed(1) : 0,
                votes_count: result?.votes_count || 0,
                comments: comments || []
            });
        });
    });
});

router.post("/rating/:productId", requireAuth, express.json(), (req, res) => {
    const productId = req.params.productId;
    const userId = req.session.user.id;
    const { rating, comment } = req.body;
    
    db.run(`INSERT INTO ratings (user_id, product_id, rating, comment, updated_at) 
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, product_id) 
            DO UPDATE SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP`,
        [userId, productId, rating, comment || null, rating, comment || null],
        function(err) {
            db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as votes_count FROM ratings WHERE product_id = ?`, [productId], (err, result) => {
                db.all(`SELECT r.rating, r.comment, r.created_at, u.username, r.admin_reply
                        FROM ratings r JOIN users u ON r.user_id = u.id
                        WHERE r.product_id = ? AND r.comment IS NOT NULL AND r.comment != ''
                        ORDER BY r.created_at DESC LIMIT 10`, [productId], (err2, comments) => {
                    res.json({
                        success: true,
                        avg_rating: result?.avg_rating ? parseFloat(result.avg_rating).toFixed(1) : 0,
                        votes_count: result?.votes_count || 0,
                        comments: comments || []
                    });
                });
            });
        });
});

// Поиск
router.get("/search", (req, res) => {
    const query = req.query.q || '';
    if (query.length < 1) return res.json({ results: [] });
    
    const searchPattern = `%${query}%`;
    
    db.all(`SELECT id, name, artist, price, image, audio, description, genre, year, 'product' as type 
            FROM products WHERE name LIKE ? OR artist LIKE ? LIMIT 10`, [searchPattern, searchPattern], (err, products) => {
        
        db.all(`SELECT id, name, 'Проигрыватель' as artist, price, image, description, 'player' as type 
                FROM players WHERE name LIKE ? LIMIT 5`, [searchPattern], (err2, players) => {
            
            res.json({ results: [...(products || []), ...(players || [])] });
        });
    });
});

module.exports = router;