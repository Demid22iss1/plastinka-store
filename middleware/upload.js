const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "image" || file.fieldname === "product_image") {
            cb(null, "public/uploads/");
        } else if (file.fieldname === "player_image") {
            cb(null, "public/photo/");
        } else if (file.fieldname === "avatar") {
            cb(null, "public/avatars/");
        } else {
            cb(null, "public/audio/");
        }
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

module.exports = upload;