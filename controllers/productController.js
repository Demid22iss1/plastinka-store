const { db } = require("../models/db");

async function getProductRating(productId) {
    return new Promise((resolve) => {
        db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as votes_count FROM ratings WHERE product_id = ?`, 
            [productId], (err, rating) => {
                resolve({
                    avg_rating: rating?.avg_rating ? parseFloat(rating.avg_rating).toFixed(1) : 0,
                    votes_count: rating?.votes_count || 0
                });
            });
    });
}

async function getProductsWithRatings(products) {
    for (const product of products) {
        const rating = await getProductRating(product.id);
        product.avg_rating = rating.avg_rating;
        product.votes_count = rating.votes_count;
    }
    return products;
}

module.exports = { getProductRating, getProductsWithRatings };