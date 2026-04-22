const { db } = require("../models/db");

async function getUserCart(userId) {
    return new Promise((resolve) => {
        db.all("SELECT * FROM carts WHERE user_id = ?", [userId], async (err, cartItems) => {
            if (err || !cartItems || cartItems.length === 0) {
                resolve([]);
                return;
            }
            
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
                        items.push({
                            product_id: item.product_id,
                            type: 'player',
                            name: player.name,
                            artist: 'Проигрыватель',
                            price: player.price,
                            image: player.image,
                            quantity: item.quantity
                        });
                    }
                } else {
                    const product = await new Promise(resolve => {
                        db.get("SELECT * FROM products WHERE id = ?", [id], (err, data) => resolve(data));
                    });
                    if (product) {
                        items.push({
                            product_id: item.product_id,
                            type: 'product',
                            name: product.name,
                            artist: product.artist,
                            price: product.price,
                            image: product.image,
                            quantity: item.quantity
                        });
                    }
                }
            }
            resolve(items);
        });
    });
}

module.exports = { getUserCart };