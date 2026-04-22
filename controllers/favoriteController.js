const { db } = require("../models/db");

async function getFavorites(userId) {
    return new Promise((resolve) => {
        db.all(`
            SELECT f.*, p.name, p.artist, p.price, p.image, p.id as product_db_id
            FROM favorites f
            JOIN products p ON f.product_id = 'product_' || p.id
            WHERE f.user_id = ?
            ORDER BY f.added_at DESC
        `, [userId], (err, products) => {
            
            db.all(`
                SELECT f.*, p.name, p.price, p.image, p.id as player_db_id
                FROM favorites f
                JOIN players p ON f.product_id = 'player_' || p.id
                WHERE f.user_id = ?
                ORDER BY f.added_at DESC
            `, [userId], (err2, players) => {
                
                const allFavorites = [];
                if (products) {
                    products.forEach(p => {
                        allFavorites.push({
                            id: p.product_db_id,
                            type: 'product',
                            name: p.name,
                            artist: p.artist,
                            price: p.price,
                            image: p.image,
                            added_at: p.added_at
                        });
                    });
                }
                if (players) {
                    players.forEach(p => {
                        allFavorites.push({
                            id: p.player_db_id,
                            type: 'player',
                            name: p.name,
                            artist: 'Проигрыватель',
                            price: p.price,
                            image: p.image,
                            added_at: p.added_at
                        });
                    });
                }
                allFavorites.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));
                resolve(allFavorites);
            });
        });
    });
}

async function toggleFavorite(userId, productId) {
    return new Promise((resolve) => {
        db.get("SELECT * FROM favorites WHERE user_id = ? AND product_id = ?", 
            [userId, productId], (err, fav) => {
                if (fav) {
                    db.run("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", 
                        [userId, productId], (err) => {
                            resolve({ action: "removed", success: true });
                        });
                } else {
                    db.run("INSERT INTO favorites (user_id, product_id) VALUES (?, ?)", 
                        [userId, productId], (err) => {
                            resolve({ action: "added", success: true });
                        });
                }
            });
    });
}

module.exports = { getFavorites, toggleFavorite };