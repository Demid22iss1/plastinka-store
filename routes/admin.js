const express = require("express");
const router = express.Router();
const { db } = require("../models/db");
const { requireAdmin } = require("../middleware/auth");
const upload = require("../middleware/upload");
const bcrypt = require("bcryptjs");

// Главная админ панель
router.get("/", requireAdmin, async (req, res) => {
    const products = await new Promise(resolve => db.all("SELECT * FROM products ORDER BY id DESC", [], (err, data) => resolve(data || [])));
    const players = await new Promise(resolve => db.all("SELECT * FROM players ORDER BY id DESC", [], (err, data) => resolve(data || [])));
    const users = await new Promise(resolve => db.all("SELECT id, username, role, avatar FROM users ORDER BY id DESC", [], (err, data) => resolve(data || [])));
    
    let productsRows = '';
    for (const p of products) {
        const rating = await new Promise(resolve => db.get("SELECT AVG(rating) as avg_rating, COUNT(*) as votes_count FROM ratings WHERE product_id = ?", [p.id], (err, data) => resolve(data || { avg_rating: 0, votes_count: 0 })));
        productsRows += `<tr><td>📀</td><td><img src="/uploads/${escapeHtml(p.image)}" style="width:50px;height:50px;object-fit:cover;"></td><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.artist)}</td><td>${escapeHtml(p.genre || '-')}</td><td>${escapeHtml(p.year || '-')}</td><td>$${p.price}</td><td>${rating.avg_rating ? rating.avg_rating.toFixed(1) : 0}⭐ (${rating.votes_count})</td><td><button onclick="editProduct(${p.id})">✏️</button> <button onclick="deleteProduct(${p.id})">🗑️</button></td></tr>`;
    }
    
    let playersRows = '';
    for (const p of players) {
        playersRows += `<tr><td>🎵</td><td><img src="/photo/${escapeHtml(p.image)}" style="width:50px;height:50px;object-fit:cover;"></td><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.description || '-')}</td><td>$${p.price}</td><td><button onclick="editPlayer(${p.id})">✏️</button> <button onclick="deletePlayer(${p.id})">🗑️</button></td></tr>`;
    }
    
    let usersRows = '';
    for (const u of users) {
        const reviewsCount = await new Promise(resolve => db.get("SELECT COUNT(*) as count FROM ratings WHERE user_id = ?", [u.id], (err, data) => resolve(data?.count || 0)));
        const favoritesCount = await new Promise(resolve => db.get("SELECT COUNT(*) as count FROM favorites WHERE user_id = ?", [u.id], (err, data) => resolve(data?.count || 0)));
        usersRows += `<tr><td><img src="/avatars/${escapeHtml(u.avatar || 'default-avatar.png')}" style="width:40px;height:40px;border-radius:50%;"></td><td><strong>${escapeHtml(u.username)}</strong></td><td><span class="badge ${u.role === 'admin' ? 'admin' : 'user'}">${u.role === 'admin' ? '👑 Админ' : '👤 Пользователь'}</span></td><td><button onclick="viewReviews(${u.id}, '${escapeHtml(u.username)}')">📝 ${reviewsCount}</button></td><td><button onclick="viewFavorites(${u.id})">❤️ ${favoritesCount}</button></td><td><button onclick="editUser(${u.id}, '${escapeHtml(u.username)}', '${u.role}')">✏️</button> ${u.username !== 'admin' ? '<button onclick="deleteUser(' + u.id + ')">🗑️</button>' : ''}</td></tr>`;
    }
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Админ панель</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                *{margin:0;padding:0;box-sizing:border-box;}
                body{background:#0f0f0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;}
                .container{max-width:1400px;margin:0 auto;}
                h1{color:#ff0000;margin-bottom:20px;}
                h2{margin:30px 0 15px;color:#ff7a2f;}
                table{width:100%;border-collapse:collapse;background:#1a1a1a;border-radius:12px;overflow:hidden;}
                th,td{padding:12px;text-align:left;border-bottom:1px solid #333;}
                th{background:#222;color:#ff7a2f;}
                button{padding:8px 16px;margin:0 4px;border:none;border-radius:6px;cursor:pointer;}
                .add-btn{background:linear-gradient(45deg,#4CAF50,#2e7d32);color:white;}
                .badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;}
                .badge.admin{background:rgba(244,67,54,0.2);color:#f44336;}
                .badge.user{background:rgba(33,150,243,0.2);color:#2196F3;}
                .nav{display:flex;gap:20px;margin-bottom:30px;}
                .nav a{color:#fff;text-decoration:none;padding:10px 20px;background:#1a1a1a;border-radius:8px;}
                .nav a:hover{background:#ff0000;}
                .modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);justify-content:center;align-items:center;}
                .modal-content{background:#1e1e1e;padding:30px;border-radius:16px;width:90%;max-width:500px;}
                .modal-content input,.modal-content textarea{width:100%;padding:10px;margin:10px 0;background:#111;border:1px solid #333;color:#fff;border-radius:8px;}
                .modal-buttons{display:flex;gap:10px;margin-top:20px;}
                .modal-buttons button{flex:1;}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="nav">
                    <a href="/">🏠 На сайт</a>
                    <a href="/logout">🚪 Выйти</a>
                    <a href="/admin/settings">⚙️ Настройки главной</a>
                </div>
                <h1>👑 Админ панель</h1>
                <div style="margin-bottom:20px;">
                    <button class="add-btn" onclick="openAddProductModal()">+ Добавить пластинку</button>
                    <button class="add-btn" onclick="openAddPlayerModal()">+ Добавить проигрыватель</button>
                </div>
                
                <h2>📀 Пластинки</h2>
                <table><thead><tr><th>Тип</th><th>Изобр.</th><th>Название</th><th>Исполнитель</th><th>Жанр</th><th>Год</th><th>Цена</th><th>Рейтинг</th><th>Действия</th></tr></thead><tbody>${productsRows || '<tr><td colspan="9">Нет пластинок</td>'}</tbody></table>
                
                <h2>🎵 Проигрыватели</h2>
                <table><thead><tr><th>Тип</th><th>Изобр.</th><th>Название</th><th>Описание</th><th>Цена</th><th>Действия</th></tr></thead><tbody>${playersRows || '<tr><td colspan="6">Нет проигрывателей</td>'}</tbody></table>
                
                <h2>👥 Пользователи</h2>
                <table><thead><tr><th>Аватар</th><th>Имя</th><th>Роль</th><th>Отзывы</th><th>Избранное</th><th>Действия</th></tr></thead><tbody>${usersRows || '<tr><td colspan="6">Нет пользователей</td>'}</tbody></table>
            </div>
            
            <div id="itemModal" class="modal"><div class="modal-content"><button class="modal-close" onclick="closeModal('itemModal')">&times;</button><h3 id="modalTitle">Добавить товар</h3><form id="itemForm" enctype="multipart/form-data"><input type="hidden" id="itemId" name="id"><input type="hidden" id="itemType" name="type"><input type="text" id="itemName" name="name" placeholder="Название" required><input type="text" id="itemArtist" name="artist" placeholder="Исполнитель"><input type="text" id="itemGenre" name="genre" placeholder="Жанр"><input type="text" id="itemYear" name="year" placeholder="Год"><input type="number" id="itemPrice" name="price" placeholder="Цена" step="0.01" required><textarea id="itemDescription" name="description" placeholder="Описание"></textarea><input type="file" id="itemImage" name="image" accept="image/*"><input type="file" id="itemAudio" name="audio" accept="audio/*"><div class="modal-buttons"><button type="submit">Сохранить</button><button type="button" onclick="closeModal('itemModal')">Отмена</button></div></form></div></div>
            
            <div id="userModal" class="modal"><div class="modal-content"><button class="modal-close" onclick="closeModal('userModal')">&times;</button><h3>Редактировать пользователя</h3><form id="userForm"><input type="hidden" id="editUserId"><input type="text" id="editUsername" placeholder="Имя"><select id="editRole"><option value="user">Пользователь</option><option value="admin">Администратор</option></select><input type="password" id="editPassword" placeholder="Новый пароль"><div class="modal-buttons"><button type="submit">Сохранить</button><button type="button" onclick="closeModal('userModal')">Отмена</button></div></form></div></div>
            
            <div id="reviewsModal" class="modal"><div class="modal-content"><button class="modal-close" onclick="closeModal('reviewsModal')">&times;</button><h3 id="reviewsTitle">Отзывы пользователя</h3><div id="reviewsList"></div></div></div>
            
            <div id="favoritesModal" class="modal"><div class="modal-content"><button class="modal-close" onclick="closeModal('favoritesModal')">&times;</button><h3 id="favoritesTitle">Избранное пользователя</h3><div id="favoritesList"></div></div></div>
            
            <script>
                function openAddProductModal() { openModal('product', 'add'); }
                function openAddPlayerModal() { openModal('player', 'add'); }
                function editProduct(id) { openModal('product', 'edit', id); }
                function editPlayer(id) { openModal('player', 'edit', id); }
                
                function openModal(type, action, id) {
                    const modal = document.getElementById('itemModal');
                    document.getElementById('modalTitle').innerText = action === 'add' ? 'Добавить ' + (type === 'product' ? 'пластинку' : 'проигрыватель') : 'Редактировать';
                    document.getElementById('itemType').value = type;
                    document.getElementById('itemId').value = id || '';
                    if (action === 'edit' && id) {
                        fetch('/admin/get-item', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type: type, id: id })
                        }).then(r => r.json()).then(data => {
                            document.getElementById('itemName').value = data.name || '';
                            document.getElementById('itemArtist').value = data.artist || '';
                            document.getElementById('itemGenre').value = data.genre || '';
                            document.getElementById('itemYear').value = data.year || '';
                            document.getElementById('itemPrice').value = data.price || '';
                            document.getElementById('itemDescription').value = data.description || '';
                        });
                    } else {
                        document.getElementById('itemForm').reset();
                    }
                    modal.style.display = 'flex';
                }
                
                function deleteProduct(id) { if(confirm('Удалить пластинку?')) deleteItem('product', id); }
                function deletePlayer(id) { if(confirm('Удалить проигрыватель?')) deleteItem('player', id); }
                
                function deleteItem(type, id) {
                    fetch('/admin/delete-item', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type: type, id: id })
                    }).then(() => location.reload());
                }
                
                function editUser(id, name, role) {
                    document.getElementById('editUserId').value = id;
                    document.getElementById('editUsername').value = name;
                    document.getElementById('editRole').value = role;
                    document.getElementById('userModal').style.display = 'flex';
                }
                
                function deleteUser(id) { if(confirm('Удалить пользователя?')) fetch('/admin/delete-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) }).then(() => location.reload()); }
                
                function viewReviews(userId, userName) {
                    document.getElementById('reviewsTitle').innerHTML = 'Отзывы: ' + userName;
                    document.getElementById('reviewsList').innerHTML = '<div style="text-align:center;padding:20px;">Загрузка...</div>';
                    document.getElementById('reviewsModal').style.display = 'flex';
                    fetch('/admin/user-reviews/' + userId).then(r => r.json()).then(data => {
                        if(data.length === 0) { document.getElementById('reviewsList').innerHTML = '<div class="empty-data">Нет отзывов</div>'; return; }
                        let html = '';
                        for(let r of data) {
                            html += '<div style="padding:10px;border-bottom:1px solid #333;"><strong>' + escapeHtml(r.product_name) + '</strong><br>⭐' + r.rating + '/5<br>' + (r.comment ? '<i>"' + escapeHtml(r.comment) + '"</i><br>' : '') + '<small>' + new Date(r.created_at).toLocaleDateString() + '</small></div>';
                        }
                        document.getElementById('reviewsList').innerHTML = html;
                    });
                }
                
                function viewFavorites(userId) {
                    document.getElementById('favoritesTitle').innerHTML = 'Избранное';
                    document.getElementById('favoritesList').innerHTML = '<div style="text-align:center;padding:20px;">Загрузка...</div>';
                    document.getElementById('favoritesModal').style.display = 'flex';
                    fetch('/admin/user-favorites/' + userId).then(r => r.json()).then(data => {
                        if(data.length === 0) { document.getElementById('favoritesList').innerHTML = '<div class="empty-data">Нет избранного</div>'; return; }
                        let html = '';
                        for(let item of data) {
                            html += '<div style="padding:10px;border-bottom:1px solid #333;"><strong>' + escapeHtml(item.name) + '</strong><br>' + escapeHtml(item.artist) + '<br>$' + item.price + '</div>';
                        }
                        document.getElementById('favoritesList').innerHTML = html;
                    });
                }
                
                function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }
                
                document.getElementById('itemForm').onsubmit = function(e) {
                    e.preventDefault();
                    const formData = new FormData(this);
                    fetch('/admin/save-item', { method: 'POST', body: formData }).then(() => location.reload());
                };
                
                document.getElementById('userForm').onsubmit = function(e) {
                    e.preventDefault();
                    const data = { id: document.getElementById('editUserId').value, username: document.getElementById('editUsername').value, role: document.getElementById('editRole').value, password: document.getElementById('editPassword').value };
                    fetch('/admin/update-user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(() => location.reload());
                };
                
                function escapeHtml(str) { if (!str) return ''; return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
            </script>
        </body>
        </html>
    `);
});

// Настройки главной страницы
router.get("/settings", requireAdmin, (req, res) => {
    db.get("SELECT value FROM site_settings WHERE key = 'homepage_products'", [], (err, setting) => {
        const currentMode = setting ? setting.value : 'last_added';
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"><title>Настройки главной</title><style>
                body{background:#0f0f0f;color:#fff;font-family:sans-serif;padding:20px;}
                .container{max-width:500px;margin:0 auto;background:#1a1a1a;padding:30px;border-radius:16px;}
                h1{color:#ff0000;margin-bottom:20px;}
                .option{margin:15px 0;padding:15px;background:#222;border-radius:8px;cursor:pointer;}
                .option.selected{border:2px solid #ff0000;background:#2a2a2a;}
                .save-btn{width:100%;padding:12px;background:linear-gradient(45deg,#ff0000,#990000);border:none;border-radius:8px;color:white;font-weight:bold;cursor:pointer;margin-top:20px;}
                .back{display:block;margin-top:20px;color:#aaa;text-align:center;}
            </style></head>
            <body>
            <div class="container">
                <h1>⚙️ Настройка главной</h1>
                <form action="/admin/settings" method="POST">
                    <div class="option ${currentMode === 'last_added' ? 'selected' : ''}" onclick="selectOption('last_added')">
                        <input type="radio" name="homepage_products" value="last_added" id="last_added" ${currentMode === 'last_added' ? 'checked' : ''}> 
                        <label for="last_added"><strong>Последние добавленные</strong><br><small>Показывать 6 последних</small></label>
                    </div>
                    <div class="option ${currentMode === 'all' ? 'selected' : ''}" onclick="selectOption('all')">
                        <input type="radio" name="homepage_products" value="all" id="all" ${currentMode === 'all' ? 'checked' : ''}> 
                        <label for="all"><strong>Все пластинки</strong><br><small>Показывать все (до 12)</small></label>
                    </div>
                    <button type="submit" class="save-btn">Сохранить</button>
                </form>
                <a href="/admin" class="back">← Вернуться</a>
            </div>
            <script>
                function selectOption(value) { document.getElementById(value).checked = true; document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected')); event.currentTarget.classList.add('selected'); }
            </script>
            </body>
            </html>
        `);
    });
});

router.post("/settings", requireAdmin, (req, res) => {
    const { homepage_products } = req.body;
    db.run("INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)", ['homepage_products', homepage_products], () => {
        res.redirect("/admin/settings?saved=1");
    });
});

// API для админ панели
router.post("/get-item", requireAdmin, express.json(), (req, res) => {
    const { type, id } = req.body;
    const table = type === 'product' ? 'products' : 'players';
    db.get(`SELECT * FROM ${table} WHERE id = ?`, [id], (err, item) => {
        res.json(item || {});
    });
});

router.post("/save-item", requireAdmin, upload.fields([{ name: 'image' }, { name: 'audio' }]), (req, res) => {
    const { type, id, name, artist, genre, year, price, description } = req.body;
    const imageFile = req.files?.image?.[0];
    const audioFile = req.files?.audio?.[0];
    
    if (type === 'product') {
        if (id && id !== '' && id !== 'undefined') {
            let query = "UPDATE products SET name=?, artist=?, price=?, description=?, genre=?, year=?";
            let params = [name, artist, parseFloat(price), description || '', genre || '', year || ''];
            if (imageFile) { query += ", image=?"; params.push(imageFile.filename); }
            if (audioFile) { query += ", audio=?"; params.push(audioFile.filename); }
            query += " WHERE id=?";
            params.push(parseInt(id));
            db.run(query, params, (err) => res.json({ success: !err }));
        } else {
            db.run("INSERT INTO products (name, artist, price, image, audio, description, genre, year) VALUES (?,?,?,?,?,?,?,?)",
                [name, artist, parseFloat(price), imageFile?.filename || null, audioFile?.filename || null, description || '', genre || '', year || ''],
                (err) => res.json({ success: !err }));
        }
    } else {
        if (id && id !== '' && id !== 'undefined') {
            let query = "UPDATE players SET name=?, price=?, description=?";
            let params = [name, parseFloat(price), description || ''];
            if (imageFile) { query += ", image=?"; params.push(imageFile.filename); }
            query += " WHERE id=?";
            params.push(parseInt(id));
            db.run(query, params, (err) => res.json({ success: !err }));
        } else {
            db.run("INSERT INTO players (name, price, image, description) VALUES (?,?,?,?)",
                [name, parseFloat(price), imageFile?.filename || null, description || ''],
                (err) => res.json({ success: !err }));
        }
    }
});

router.post("/delete-item", requireAdmin, express.json(), (req, res) => {
    const { type, id } = req.body;
    const table = type === 'product' ? 'products' : 'players';
    db.run(`DELETE FROM ${table} WHERE id=?`, [id], (err) => res.json({ success: !err }));
});

router.post("/update-user", requireAdmin, express.json(), (req, res) => {
    const { id, username, role, password } = req.body;
    if (password && password.trim()) {
        const hashedPassword = bcrypt.hashSync(password, 10);
        db.run("UPDATE users SET username=?, role=?, password=? WHERE id=?", [username, role, hashedPassword, id], (err) => res.json({ success: !err }));
    } else {
        db.run("UPDATE users SET username=?, role=? WHERE id=?", [username, role, id], (err) => res.json({ success: !err }));
    }
});

router.post("/delete-user", requireAdmin, express.json(), (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM users WHERE id=? AND username!='admin'", [id], (err) => res.json({ success: !err }));
});

router.get("/user-reviews/:userId", requireAdmin, (req, res) => {
    db.all("SELECT r.*, p.name as product_name, p.artist as product_artist FROM ratings r JOIN products p ON r.product_id=p.id WHERE r.user_id=? ORDER BY r.created_at DESC", [req.params.userId], (err, rows) => {
        res.json(rows || []);
    });
});

router.get("/user-favorites/:userId", requireAdmin, (req, res) => {
    db.all("SELECT f.product_id, f.added_at FROM favorites f WHERE f.user_id=?", [req.params.userId], async (err, favs) => {
        if (!favs || favs.length === 0) return res.json([]);
        const items = [];
        for (const fav of favs) {
            const productId = fav.product_id;
            if (productId.startsWith('product_')) {
                const id = productId.replace('product_', '');
                const product = await new Promise(resolve => db.get("SELECT name, artist, price, image FROM products WHERE id=?", [id], (err, data) => resolve(data)));
                if (product) items.push({ ...fav, type: 'product', name: product.name, artist: product.artist, price: product.price, image: product.image });
            } else if (productId.startsWith('player_')) {
                const id = productId.replace('player_', '');
                const player = await new Promise(resolve => db.get("SELECT name, price, image FROM players WHERE id=?", [id], (err, data) => resolve(data)));
                if (player) items.push({ ...fav, type: 'player', name: player.name, artist: 'Проигрыватель', price: player.price, image: player.image });
            }
        }
        res.json(items);
    });
});

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

module.exports = router;