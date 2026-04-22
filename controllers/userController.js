const { db } = require("../models/db");
const bcrypt = require("bcryptjs");

async function getUserById(userId) {
    return new Promise((resolve) => {
        db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
            resolve(user);
        });
    });
}

async function updateUser(userId, data) {
    return new Promise((resolve) => {
        const { username, password, avatar } = data;
        let query = "UPDATE users SET username = ?";
        let params = [username];
        
        if (password) {
            const hashedPassword = bcrypt.hashSync(password, 10);
            query += ", password = ?";
            params.push(hashedPassword);
        }
        
        if (avatar) {
            query += ", avatar = ?";
            params.push(avatar);
        }
        
        query += " WHERE id = ?";
        params.push(userId);
        
        db.run(query, params, (err) => {
            resolve(!err);
        });
    });
}

module.exports = { getUserById, updateUser };