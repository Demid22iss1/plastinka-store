const express = require("express");
const router = express.Router();
const { db } = require("../models/db");
const { requireAuth } = require("../middleware/auth");
const { getProductsWithRatings } = require("../controllers/productController");
const { getUserCart } = require("../controllers/cartController");

// Главная страница
router.get("/", async (req, res) => {
    const user = req.session.user;
    
    db.get("SELECT value FROM site_settings WHERE key = 'homepage_products'", [], async (err, setting) => {
        const homepageMode = setting ? setting.value : 'last_added';
        
        let productsQuery = "SELECT * FROM products ORDER BY id DESC LIMIT 6";
        
        db.all(productsQuery, [], async (err, products) => {
            if (err) products = [];
            
            // Получаем рейтинги для каждого продукта
            for (const product of products) {
                const rating = await new Promise((resolve) => {
                    db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as votes_count FROM ratings WHERE product_id = ?`, 
                        [product.id], (err, rating) => {
                            resolve(rating || { avg_rating: 0, votes_count: 0 });
                        });
                });
                product.avg_rating = rating.avg_rating ? parseFloat(rating.avg_rating).toFixed(1) : 0;
                product.votes_count = rating.votes_count || 0;
            }
            
            db.all("SELECT * FROM players", [], (err, players) => {
                if (err) players = [];
                
                if (req.isMobile) {
                    const content = renderMobileHome(products, user);
                    res.send(renderMobileLayout('Главная', content, user, 'home'));
                } else {
                    const html = renderDesktopHome(products, players, user);
                    res.send(html);
                }
            });
        });
    });
});

// Каталог
router.get("/catalog", async (req, res) => {
    const user = req.session.user;
    const { genre, minPrice, maxPrice, sort, search } = req.query;
    
    let sql = "SELECT * FROM products WHERE 1=1";
    let params = [];
    
    if (search && search.trim()) {
        sql += " AND (name LIKE ? OR artist LIKE ?)";
        const searchTerm = `%${search.trim()}%`;
        params.push(searchTerm, searchTerm);
    }
    if (genre && genre !== 'all') {
        sql += " AND genre = ?";
        params.push(genre);
    }
    if (minPrice) {
        sql += " AND price >= ?";
        params.push(parseFloat(minPrice));
    }
    if (maxPrice) {
        sql += " AND price <= ?";
        params.push(parseFloat(maxPrice));
    }
    
    switch(sort) {
        case 'price_asc': sql += " ORDER BY price ASC"; break;
        case 'price_desc': sql += " ORDER BY price DESC"; break;
        case 'name_asc': sql += " ORDER BY name ASC"; break;
        case 'name_desc': sql += " ORDER BY name DESC"; break;
        default: sql += " ORDER BY id DESC";
    }
    
    db.all(sql, params, async (err, products) => {
        if (err) products = [];
        
        for (const product of products) {
            const rating = await new Promise((resolve) => {
                db.get(`SELECT AVG(rating) as avg_rating, COUNT(*) as votes_count FROM ratings WHERE product_id = ?`, 
                    [product.id], (err, rating) => {
                        resolve(rating || { avg_rating: 0, votes_count: 0 });
                    });
            });
            product.avg_rating = rating.avg_rating ? parseFloat(rating.avg_rating).toFixed(1) : 0;
            product.votes_count = rating.votes_count || 0;
        }
        
        db.all("SELECT DISTINCT genre FROM products WHERE genre IS NOT NULL AND genre != ''", [], (err, genresResult) => {
            const genres = genresResult ? genresResult.map(g => g.genre) : ['Rock', 'Pop', 'Jazz', 'Electronic', 'Classical'];
            
            if (req.isMobile) {
                const content = renderMobileCatalog(products, genres, { genre, minPrice, maxPrice, sort, search }, user);
                res.send(renderMobileLayout('Каталог', content, user, 'catalog'));
            } else {
                const html = renderDesktopCatalog(products, genres, { genre, minPrice, maxPrice, sort, search }, user);
                res.send(html);
            }
        });
    });
});

// Корзина
router.get("/cart", requireAuth, async (req, res) => {
    const user = req.session.user;
    const cartItems = await getUserCart(user.id);
    
    if (req.isMobile) {
        const content = renderMobileCart(cartItems, user);
        res.send(renderMobileLayout('Корзина', content, user, 'cart'));
    } else {
        const html = renderDesktopCart(cartItems, user);
        res.send(html);
    }
});

// Профиль
router.get("/profile", requireAuth, (req, res) => {
    const user = req.session.user;
    
    db.get("SELECT avatar FROM users WHERE id = ?", [user.id], (err, userData) => {
        const avatar = userData ? userData.avatar : 'default-avatar.png';
        
        db.get("SELECT COUNT(*) as favs FROM favorites WHERE user_id = ?", [user.id], (err, favs) => {
            if (req.isMobile) {
                const content = renderMobileProfile(user, avatar, favs ? favs.favs : 0);
                res.send(renderMobileLayout('Профиль', content, user, 'profile'));
            } else {
                const html = renderDesktopProfile(user, avatar, favs ? favs.favs : 0);
                res.send(html);
            }
        });
    });
});

// Избранное
router.get("/favorites", requireAuth, (req, res) => {
    const user = req.session.user;
    const content = renderMobileFavorites(user);
    res.send(renderMobileLayout('Избранное', content, user, 'favorites'));
});

// Поиск
router.get("/search", (req, res) => {
    res.redirect("/catalog");
});

router.get("/search-page", (req, res) => {
    const query = req.query.q || '';
    res.redirect(`/catalog?search=${encodeURIComponent(query)}`);
});

// Выход
router.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

// ============================================================
// ДЕСКТОП РЕНДЕРИНГ
// ============================================================

function renderDesktopHome(products, players, user) {
    let productHTML = "";
    products.forEach(product => {
        productHTML += `
            <div class="benefit" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name)}" data-product-artist="${escapeHtml(product.artist)}" data-product-price="${product.price}" data-product-image="/uploads/${product.image}" data-product-description="${escapeHtml(product.description || 'Нет описания')}" data-product-genre="${escapeHtml(product.genre || 'Rock')}" data-product-year="${escapeHtml(product.year || '1970')}">
                <div class="image-container">
                    <img src="/uploads/${product.image}" class="graf">
                    <img src="/photo/plastinka-audio.png" class="plastinka">
                    ${product.audio ? `<audio class="album-audio" src="/audio/${product.audio}" preload="auto"></audio>` : ""}
                </div>
                <div class="benefit-info">
                    <div class="album-nazv-container">
                        <span class="album-nazv">${escapeHtml(product.name)}</span>
                    </div>
                    <div class="album-title-container">
                        <span class="album-title">${escapeHtml(product.artist)}</span>
                    </div>
                    <div class="rating-stars" data-product-id="${product.id}">
                        ${generateStarRatingHTML(product.avg_rating, product.votes_count)}
                    </div>
                    <div class="album-bottom">
                        <span class="album-price">${product.price}$</span>
                        <form action="/add-to-cart" method="POST" class="add-to-cart-form">
                            <input type="hidden" name="id" value="product_${product.id}">
                            <button type="submit" class="add-to-cart">
                                <img src="/photo/b_plus.svg" class="cart-icon">
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    });
    
    let carouselItems = "";
    for (let i = 0; i < 20; i++) {
        players.forEach(player => {
            carouselItems += `
                <div class="card" data-player-id="${player.id}" data-name="${escapeHtml(player.name)}" data-price="${player.price}" data-image="/photo/${player.image}" data-description="${escapeHtml(player.description || 'Высококачественный проигрыватель винила')}">
                    <div class="circle orange"></div>
                    <img src="/photo/${player.image}" alt="${player.name}" class="player-image">
                    <button class="view-btn">Смотреть</button>
                </div>
            `;
        });
    }
    
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Plastinka</title>
        <link rel="stylesheet" href="/style.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>
            ${desktopStyles}
        </style>
    </head>
    <body>
        <header>${renderDesktopHeader(user)}</header>
        <section class="hero"></section>
        <section class="catalog-title-section"><h2 class="catalog-title"><a href="/catalog">КАТАЛОГ</a></h2></section>
        <section class="benefits"><div class="benefits-grid">${productHTML || '<p style="text-align: center; color: #aaa;">Товаров пока нет</p>'}</div></section>
        <section class="catalog-title-section"><h2 class="catalog-title">ПРОИГРЫВАТЕЛИ</h2></section>
        <section class="player-carousel"><div class="carousel-track">${carouselItems}</div></section>
        <section class="player-carousel2"><div class="carousel-track2">${carouselItems}</div></section>
        ${renderDesktopModals()}
        <footer><img src="/photo/logo-2.svg" class="footer-logo" alt="Plastinka"></footer>
        <script>${desktopScripts}</script>
    </body>
    </html>`;
}

function renderDesktopCatalog(products, genres, filters, user) {
    let productsHTML = "";
    products.forEach(product => {
        productsHTML += `
            <div class="catalog-item" data-id="${product.id}" data-name="${escapeHtml(product.name)}" data-artist="${escapeHtml(product.artist)}" data-price="${product.price}" data-image="/uploads/${product.image}" data-description="${escapeHtml(product.description || 'Нет описания')}" data-genre="${escapeHtml(product.genre || 'Rock')}" data-year="${escapeHtml(product.year || '1970')}" data-audio="${product.audio || ''}">
                <div class="image-container vinyl-container">
                    <img src="/uploads/${product.image}" class="catalog-album-cover">
                    <img src="/photo/plastinka-audio.png" class="vinyl-disc-small">
                    ${product.audio ? `<audio class="album-audio" src="/audio/${product.audio}"></audio>` : ''}
                </div>
                <div class="catalog-item-info">
                    <div class="catalog-item-name">${escapeHtml(product.name)}</div>
                    <div class="catalog-item-artist">${escapeHtml(product.artist)}</div>
                    <div class="rating-stars" data-product-id="${product.id}">${generateStarRatingHTML(product.avg_rating, product.votes_count)}</div>
                    <div class="catalog-item-price">$${product.price}</div>
                    <div class="catalog-item-actions">
                        <form action="/add-to-cart" method="POST">
                            <input type="hidden" name="id" value="product_${product.id}">
                            <button type="submit" class="catalog-cart-btn"><i class="fas fa-shopping-cart"></i> В корзину</button>
                        </form>
                        <button onclick="toggleFavorite('product_${product.id}')" class="catalog-fav-btn"><i class="fas fa-heart"></i></button>
                    </div>
                </div>
            </div>
        `;
    });
    
    const genreOptions = genres.map(g => `<option value="${g}" ${filters.genre === g ? 'selected' : ''}>${g}</option>`).join('');
    
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Каталог · Plastinka</title>
        <link rel="stylesheet" href="/style.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <style>${desktopCatalogStyles}</style>
    </head>
    <body>
        <header>${renderDesktopHeader(user)}</header>
        <div class="catalog-container">
            <div class="catalog-header"><h1>Каталог пластинок</h1></div>
            <div class="big-search">
                <form method="GET" action="/catalog">
                    <input type="text" name="search" placeholder="Найти пластинку..." value="${escapeHtml(filters.search || '')}">
                    <button type="submit"><i class="fas fa-search"></i> Поиск</button>
                </form>
            </div>
            <button class="filter-btn" onclick="toggleFilters()"><i class="fas fa-sliders-h"></i> Фильтры <i class="fas fa-chevron-down"></i></button>
            <div class="filters-panel" id="filtersPanel">
                <form method="GET" action="/catalog" class="filters-form">
                    <input type="hidden" name="search" value="${escapeHtml(filters.search || '')}">
                    <div class="filter-group"><label>Жанр</label><select name="genre"><option value="all">Все</option>${genreOptions}</select></div>
                    <div class="filter-group"><label>Цена от</label><input type="number" name="minPrice" value="${filters.minPrice || ''}"></div>
                    <div class="filter-group"><label>Цена до</label><input type="number" name="maxPrice" value="${filters.maxPrice || ''}"></div>
                    <div class="filter-group"><label>Сортировка</label><select name="sort"><option value="">По умолчанию</option><option value="price_asc" ${filters.sort === 'price_asc' ? 'selected' : ''}>Цена ↑</option><option value="price_desc" ${filters.sort === 'price_desc' ? 'selected' : ''}>Цена ↓</option><option value="name_asc" ${filters.sort === 'name_asc' ? 'selected' : ''}>Название А-Я</option><option value="name_desc" ${filters.sort === 'name_desc' ? 'selected' : ''}>Название Я-А</option></select></div>
                    <div class="filter-actions"><button type="submit">Применить</button><a href="/catalog">Сбросить</a></div>
                </form>
            </div>
            ${products.length === 0 ? '<div class="empty-catalog"><i class="fas fa-record-vinyl"></i><p>Ничего не найдено</p></div>' : `<div class="catalog-grid">${productsHTML}</div>`}
        </div>
        ${renderDesktopModals()}
        <footer><img src="/photo/logo-2.svg" class="footer-logo"></footer>
        <script>${desktopCatalogScripts}</script>
    </body>
    </html>`;
}

function renderDesktopCart(cartItems, user) {
    if (!cartItems || cartItems.length === 0) {
        return `<!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"><title>Корзина пуста</title><link rel="stylesheet" href="/style.css"><style>${emptyCartStyles}</style></head>
        <body>
            <header>${renderDesktopHeader(user)}</header>
            <div class="empty-cart-desktop"><div class="empty-cart-card"><div class="empty-cart-icon-main">🛒</div><h2>Корзина пуста</h2><a href="/catalog" class="empty-cart-btn">В каталог</a></div></div>
            <footer><img src="/photo/logo-2.svg"></footer>
        </body>
        </html>`;
    }
    
    let itemsHTML = "";
    let totalPrice = 0;
    cartItems.forEach(item => {
        const subtotal = item.price * item.quantity;
        totalPrice += subtotal;
        const imagePath = item.type === 'player' ? `/photo/${item.image}` : `/uploads/${item.image}`;
        itemsHTML += `
            <div class="plastinka-item" data-product-id="${item.product_id}">
                <div class="image-stack"><img src="${imagePath}" class="album-image"></div>
                <div class="item-info">
                    <span class="plastinka-name">${escapeHtml(item.name)}</span>
                    <span class="plastinka-artist">${escapeHtml(item.artist)}</span>
                    <span class="plastinka-price">${item.price}$</span>
                </div>
                <div class="quantity-controls">
                    <button class="quantity-btn decrease" data-product-id="${item.product_id}">-</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn increase" data-product-id="${item.product_id}">+</button>
                </div>
                <span class="item-subtotal">${subtotal}$</span>
                <button class="remove-plastinka" data-product-id="${item.product_id}">Удалить</button>
            </div>
        `;
    });
    
    return `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Корзина</title><link rel="stylesheet" href="/style.css"><style>${cartStyles}</style></head>
    <body>
        <header>${renderDesktopHeader(user)}</header>
        <section class="plastinka-cart">
            <h1>Ваша корзина</h1>
            <div class="plastinka-grid">${itemsHTML}</div>
            <div class="cart-summary">
                <div class="summary-row"><span>Итого:</span><span class="total-price">${totalPrice}$</span></div>
                <form action="/order" method="POST"><button type="submit" class="order-btn">Заказать</button></form>
            </div>
        </section>
        <footer><img src="/photo/logo-2.svg"></footer>
        <script>${cartScripts}</script>
    </body>
    </html>`;
}

function renderDesktopProfile(user, avatar, favCount) {
    return `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Профиль</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.12/cropper.min.css"><style>${profileStyles}</style></head>
    <body>
        <header>${renderDesktopHeader(user)}</header>
        <div class="profile-wrapper">
            <div class="profile-card">
                <div class="profile-cover"></div>
                <div class="profile-avatar-wrapper">
                    <img src="/avatars/${avatar}" class="profile-avatar" id="profileAvatar" onclick="openAvatarModal()">
                    <div class="avatar-overlay" onclick="openAvatarModal()"><i class="fas fa-camera"></i></div>
                    <h2>${escapeHtml(user.username)}</h2>
                    <div class="profile-role">${user.role === 'admin' ? 'Администратор' : '🎧 Меломан'}</div>
                </div>
                <div class="profile-stats">
                    <div class="stat"><div class="stat-value">0</div><div class="stat-label">Заказов</div></div>
                    <div class="stat"><div class="stat-value" id="favCount">${favCount}</div><div class="stat-label">Избранное</div></div>
                </div>
                <div class="profile-menu">
                    <div class="menu-item" onclick="openSettingsModal()"><i class="fas fa-user-edit"></i><span>Настройки</span></div>
                    <div class="menu-item" onclick="openFavoritesModal()"><i class="fas fa-heart"></i><span>Избранное</span></div>
                </div>
                ${user.role === 'admin' ? '<a href="/admin" class="admin-panel-btn"><i class="fas fa-crown"></i> Админ панель</a>' : ''}
                <a href="/logout" class="logout-btn">Выйти</a>
            </div>
        </div>
        ${renderDesktopProfileModals(user, avatar)}
        <footer><img src="/photo/logo-2.svg"></footer>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.12/cropper.min.js"></script>
        <script>${profileScripts}</script>
    </body>
    </html>`;
}

function renderDesktopHeader(user) {
    return `
        <div class="logo"><a href="/"><img src="/photo/logo.svg" alt="Plastinka"></a></div>
        <div class="search-bar-desktop">
            <i class="fas fa-search"></i>
            <input type="text" id="desktop-search-input" placeholder="Поиск пластинок...">
            <div id="search-dropdown" class="search-dropdown"></div>
        </div>
        <div class="right-icons">
            <a href="/catalog"><img src="/photo/icon-katalog.png" alt="Каталог"></a>
            <a href="/profile"><img src="/photo/profile_icon.png" alt="Профиль"></a>
            <a href="/cart"><img src="/photo/knopka-korzina.svg" alt="Корзина"></a>
        </div>
    `;
}

function renderDesktopModals() {
    return `
        <div class="modal-overlay" id="playerModal">
            <div class="modal-content">
                <button class="modal-close" id="closeModal">&times;</button>
                <img src="" alt="Проигрыватель" class="modal-player-image" id="modalImage">
                <h2 class="modal-title" id="modalTitle"></h2>
                <p class="modal-description" id="modalDescription"></p>
                <div class="modal-price" id="modalPrice"></div>
                <form id="addToCartForm" method="POST" action="/add-to-cart">
                    <input type="hidden" name="id" id="modalProductId" value="">
                    <button type="submit" class="modal-add-to-cart">Добавить в корзину</button>
                </form>
            </div>
        </div>
        <div class="modal-overlay" id="productModalDesktop">
            <div class="modal-content">
                <button class="modal-close" id="closeProductModalDesktop">&times;</button>
                <img src="" alt="Пластинка" class="modal-player-image" id="productModalImageDesktop">
                <h2 class="modal-title" id="productModalTitleDesktop"></h2>
                <p class="modal-artist" id="productModalArtistDesktop"></p>
                <div class="modal-tags" id="productModalTagsDesktop"></div>
                <div class="rating-section" id="modalRatingSectionDesktop">
                    <div class="rating-label">Средняя оценка:</div>
                    <div class="rating-stars-large" id="modalRatingStarsDesktop"></div>
                    <div class="rating-votes" id="modalRatingVotesDesktop"></div>
                </div>
                <div class="comment-section" id="modalCommentSectionDesktop" style="display:none;">
                    <textarea id="modalCommentDesktop" placeholder="Напишите свой отзыв..." rows="3"></textarea>
                    <button onclick="submitRatingWithCommentDesktop()" class="submit-rating-btn">Отправить оценку</button>
                </div>
                <div class="comments-list" id="modalCommentsListDesktop"></div>
                <p class="modal-description" id="productModalDescriptionDesktop"></p>
                <div class="modal-price" id="productModalPriceDesktop"></div>
                <div class="modal-actions">
                    <button onclick="addToCartFromModalDesktop()" class="modal-add-to-cart">В корзину</button>
                    <button onclick="toggleFavoriteFromModalDesktop()" class="modal-fav-btn"><i class="fas fa-heart"></i></button>
                </div>
                <div id="productModalAudioDesktop" style="display:none;"></div>
                <button onclick="playModalPreviewDesktop()" class="modal-play-btn" id="productModalPlayBtnDesktop" style="display:none;"><i class="fas fa-play"></i> Прослушать</button>
            </div>
        </div>
    `;
}

function renderDesktopProfileModals(user, avatar) {
    return `
        <div id="avatarModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeAvatarModal()">&times;</button>
                <h3>📸 Изменить аватар</h3>
                <div><img src="/avatars/${avatar}" id="avatarPreview" style="width:150px;height:150px;border-radius:50%;"></div>
                <input type="file" id="avatarFileInput" accept="image/*" style="display:none;">
                <button onclick="document.getElementById('avatarFileInput').click()">Выбрать фото</button>
                <div id="cropContainer" style="display:none;"><img id="cropImage"><button onclick="cropAndUpload()">Обрезать</button></div>
            </div>
        </div>
        <div id="settingsModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeSettingsModal()">&times;</button>
                <h3>Настройки</h3>
                <form id="settingsForm">
                    <input type="text" id="settingsUsername" value="${escapeHtml(user.username)}" placeholder="Имя">
                    <input type="password" id="settingsCurrentPassword" placeholder="Текущий пароль">
                    <input type="password" id="settingsNewPassword" placeholder="Новый пароль">
                    <button type="submit">Сохранить</button>
                </form>
            </div>
        </div>
        <div id="favoritesModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeFavoritesModal()">&times;</button>
                <h3>Избранное</h3>
                <div id="favoritesList"></div>
            </div>
        </div>
    `;
}

// ============================================================
// МОБИЛЬНЫЙ РЕНДЕРИНГ
// ============================================================

function renderMobileLayout(title, content, user, activeTab = 'home') {
    return `<!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
        <title>${escapeHtml(title)} · Plastinka</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        <style>${mobileStyles}</style>
    </head>
    <body class="telegram-theme">
        <div class="top-bar">
            <img src="/photo/logo.svg" class="logo" alt="Plastinka">
            <div class="search-bar" onclick="window.location='/catalog'">
                <i class="fas fa-search"></i>
                <span>Поиск</span>
            </div>
        </div>
        <div class="content">${content}</div>
        <nav class="bottom-nav">
            <a href="/" class="nav-item ${activeTab === 'home' ? 'active' : ''}"><i class="fas fa-home"></i><span>Главная</span></a>
            <a href="/catalog" class="nav-item ${activeTab === 'catalog' ? 'active' : ''}"><i class="fas fa-record-vinyl"></i><span>Каталог</span></a>
            <a href="/favorites" class="nav-item ${activeTab === 'favorites' ? 'active' : ''}"><i class="fas fa-heart"></i><span>Избранное</span></a>
            <a href="/cart" class="nav-item ${activeTab === 'cart' ? 'active' : ''}"><i class="fas fa-shopping-cart"></i><span>Корзина</span></a>
            <a href="/profile" class="nav-item ${activeTab === 'profile' ? 'active' : ''}"><i class="fas fa-user"></i><span>Профиль</span></a>
        </nav>
        <script>${mobileScripts}</script>
    </body>
    </html>`;
}

function renderMobileHome(products, user) {
    let productsHTML = "";
    products.forEach(product => {
        productsHTML += `
            <div class="product-card" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name)}" data-product-artist="${escapeHtml(product.artist)}" data-product-price="${product.price}" data-product-image="/uploads/${product.image}" data-product-description="${escapeHtml(product.description || 'Нет описания')}" data-product-genre="${escapeHtml(product.genre || 'Rock')}" data-product-year="${escapeHtml(product.year || '1970')}" data-product-audio="${product.audio || ''}" data-audio-url="${product.audio ? '/audio/' + product.audio : ''}" onclick="showProductModal(${product.id}, '${escapeHtml(product.name)}', '${escapeHtml(product.artist)}', ${product.price}, '/uploads/${product.image}', '${escapeHtml(product.description || 'Нет описания')}', '${escapeHtml(product.genre || 'Rock')}', '${escapeHtml(product.year || '1970')}', '${product.audio || ''}')">
                <div class="product-image">
                    <img src="/uploads/${product.image}" alt="${escapeHtml(product.name)}">
                    <div class="vinyl-overlay"><img src="/photo/plastinka-audio.png" class="vinyl-icon"></div>
                </div>
                <div class="product-info">
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-artist">${escapeHtml(product.artist)}</div>
                    <div class="rating-stars" data-product-id="${product.id}">${generateStarRatingHTML(product.avg_rating, product.votes_count)}</div>
                    <div class="product-price">$${product.price}</div>
                    <div class="product-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); addToCartMobile('product_${product.id}')"><i class="fas fa-shopping-cart"></i></button>
                        <button class="action-btn" onclick="event.stopPropagation(); toggleFavoriteMobile('product_${product.id}')"><i class="fas fa-heart"></i></button>
                    </div>
                </div>
            </div>
        `;
    });
    
    return `
        <h2 class="section-title">Новинки</h2>
        <div class="products-grid">${productsHTML || '<p>Нет товаров</p>'}</div>
        ${!user ? '<div class="auth-prompt"><p>Войдите в аккаунт</p><a href="/login" class="auth-btn">Войти</a></div>' : ''}
        ${renderMobileModals()}
    `;
}

function renderMobileCatalog(products, genres, filters, user) {
    let productsHTML = "";
    products.forEach(product => {
        productsHTML += `
            <div class="product-card" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name)}" data-product-artist="${escapeHtml(product.artist)}" data-product-price="${product.price}" data-product-image="/uploads/${product.image}" data-product-description="${escapeHtml(product.description || 'Нет описания')}" data-product-genre="${escapeHtml(product.genre || 'Rock')}" data-product-year="${escapeHtml(product.year || '1970')}" data-product-audio="${product.audio || ''}" data-audio-url="${product.audio ? '/audio/' + product.audio : ''}" onclick="showProductModal(${product.id}, '${escapeHtml(product.name)}', '${escapeHtml(product.artist)}', ${product.price}, '/uploads/${product.image}', '${escapeHtml(product.description || 'Нет описания')}', '${escapeHtml(product.genre || 'Rock')}', '${escapeHtml(product.year || '1970')}', '${product.audio || ''}')">
                <div class="product-image">
                    <img src="/uploads/${product.image}" alt="${escapeHtml(product.name)}">
                    <div class="vinyl-overlay"><img src="/photo/plastinka-audio.png" class="vinyl-icon"></div>
                </div>
                <div class="product-info">
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-artist">${escapeHtml(product.artist)}</div>
                    <div class="rating-stars" data-product-id="${product.id}">${generateStarRatingHTML(product.avg_rating, product.votes_count)}</div>
                    <div class="product-price">$${product.price}</div>
                    <div class="product-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); addToCartMobile('product_${product.id}')"><i class="fas fa-shopping-cart"></i></button>
                        <button class="action-btn" onclick="event.stopPropagation(); toggleFavoriteMobile('product_${product.id}')"><i class="fas fa-heart"></i></button>
                    </div>
                </div>
            </div>
        `;
    });
    
    const genreOptions = genres.map(g => `<option value="${g}" ${filters.genre === g ? 'selected' : ''}>${g}</option>`).join('');
    
    return `
        <div class="big-search">
            <form method="GET" action="/catalog">
                <input type="text" name="search" placeholder="Поиск..." value="${escapeHtml(filters.search || '')}">
                <button type="submit">🔍</button>
            </form>
        </div>
        <button class="filter-btn" onclick="toggleFilters()">Фильтры</button>
        <div class="filters" id="filtersPanel">
            <form method="GET" action="/catalog">
                <select name="genre"><option value="all">Все жанры</option>${genreOptions}</select>
                <input type="number" name="minPrice" placeholder="Цена от" value="${filters.minPrice || ''}">
                <input type="number" name="maxPrice" placeholder="Цена до" value="${filters.maxPrice || ''}">
                <select name="sort"><option value="">По умолчанию</option><option value="price_asc" ${filters.sort === 'price_asc' ? 'selected' : ''}>Цена ↑</option><option value="price_desc" ${filters.sort === 'price_desc' ? 'selected' : ''}>Цена ↓</option></select>
                <button type="submit">Применить</button>
                <a href="/catalog">Сбросить</a>
            </form>
        </div>
        <h2 class="section-title">Все пластинки (${products.length})</h2>
        <div class="products-grid">${productsHTML || '<div class="empty-state">Ничего не найдено</div>'}</div>
        ${!user ? '<div class="auth-prompt"><p>Войдите в аккаунт</p><a href="/login" class="auth-btn">Войти</a></div>' : ''}
        ${renderMobileModals()}
    `;
}

function renderMobileCart(cartItems, user) {
    if (!cartItems || cartItems.length === 0) {
        return `
            <div class="empty-cart">
                <div class="empty-icon">🛒</div>
                <h3>Корзина пуста</h3>
                <a href="/catalog" class="empty-btn">В каталог</a>
            </div>
        `;
    }
    
    let itemsHTML = "";
    let totalPrice = 0;
    cartItems.forEach(item => {
        const subtotal = item.price * item.quantity;
        totalPrice += subtotal;
        const imagePath = item.type === 'player' ? `/photo/${item.image}` : `/uploads/${item.image}`;
        itemsHTML += `
            <div class="cart-item" data-id="${item.product_id}">
                <img src="${imagePath}" class="cart-item-image">
                <div class="cart-item-info">
                    <div class="cart-item-name">${escapeHtml(item.name)}</div>
                    <div class="cart-item-price">$${item.price}</div>
                    <div class="cart-item-quantity">
                        <button class="quantity-btn" onclick="updateQuantity('${item.product_id}', 'decrease')">-</button>
                        <span>${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity('${item.product_id}', 'increase')">+</button>
                    </div>
                </div>
                <button class="remove-btn" onclick="removeFromCart('${item.product_id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
    });
    
    return `
        <h2 class="section-title">Корзина</h2>
        <div id="cartItems">${itemsHTML}</div>
        <div class="cart-total">
            <span>Итого:</span>
            <span class="total-price">$${totalPrice}</span>
        </div>
        <button class="checkout-btn" onclick="checkout()">Оформить заказ</button>
        <script>
            function updateQuantity(id, action) {
                fetch('/api/cart/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_id: id, action: action })
                }).then(() => location.reload());
            }
            function removeFromCart(id) {
                if(confirm('Удалить товар?')) {
                    fetch('/api/cart/remove', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ product_id: id })
                    }).then(() => location.reload());
                }
            }
            function checkout() {
                if(confirm('Подтвердить заказ?')) {
                    fetch('/api/order', { method: 'POST' }).then(() => {
                        alert('Заказ оформлен!');
                        location.href = '/';
                    });
                }
            }
        </script>
    `;
}

function renderMobileProfile(user, avatar, favCount) {
    return `
        <div class="profile-header">
            <div class="avatar-container" onclick="openAvatarModal()">
                <img src="/avatars/${avatar}" class="profile-avatar" id="profileAvatar">
                <div class="avatar-overlay"><i class="fas fa-camera"></i></div>
            </div>
            <h2 class="profile-name">${escapeHtml(user.username)}</h2>
            <p class="profile-role">${user.role === 'admin' ? 'Администратор' : 'Покупатель'}</p>
        </div>
        <div class="profile-stats">
            <div class="stat"><div class="stat-value">0</div><div class="stat-label">Заказов</div></div>
            <div class="stat"><div class="stat-value" id="favCount">${favCount}</div><div class="stat-label">Избранное</div></div>
        </div>
        <div class="profile-menu">
            <div class="menu-item" onclick="openSettingsModal()"><i class="fas fa-user-edit"></i><span>Настройки</span></div>
            <div class="menu-item" onclick="openFavoritesModal()"><i class="fas fa-heart"></i><span>Избранное</span></div>
        </div>
        ${user.role === 'admin' ? '<a href="/admin" class="admin-panel-btn">Админ панель</a>' : ''}
        <a href="/logout" class="logout-btn">Выйти</a>
        ${renderMobileProfileModals(user, avatar)}
    `;
}

function renderMobileFavorites(user) {
    return `
        <h2 class="section-title">Избранное</h2>
        <div id="favoritesGrid" class="products-grid">
            <div class="empty-state">Загрузка...</div>
        </div>
        <script>
            async function loadFavorites() {
                const response = await fetch('/api/favorites/list');
                const data = await response.json();
                const container = document.getElementById('favoritesGrid');
                if (!data.success || data.favorites.length === 0) {
                    container.innerHTML = '<div class="empty-state"><div class="empty-icon">❤️</div><p>Нет избранных товаров</p><a href="/catalog" class="empty-btn">В каталог</a></div>';
                    return;
                }
                let html = '';
                for(let item of data.favorites) {
                    html += '<div class="product-card"><div class="product-image"><img src="/uploads/' + item.image + '"></div><div class="product-info"><div class="product-name">' + escapeHtml(item.name) + '</div><div class="product-artist">' + escapeHtml(item.artist) + '</div><div class="product-price">$' + item.price + '</div><div class="product-actions"><button class="action-btn" onclick="addToCartMobile(\\'product_' + item.id + '\\')"><i class="fas fa-shopping-cart"></i></button><button class="action-btn" onclick="removeFromFavorites(' + item.id + ')"><i class="fas fa-trash"></i></button></div></div></div>';
                }
                container.innerHTML = html;
            }
            async function removeFromFavorites(productId) {
                await fetch('/api/favorites/remove', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId: productId, type: 'product' })
                });
                loadFavorites();
                showToastMobile('Удалено из избранного', false);
            }
            loadFavorites();
        </script>
    `;
}

function renderMobileModals() {
    return `
        <div id="productModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeProductModal()">&times;</button>
                <img src="" alt="Пластинка" class="modal-player-image" id="productModalImage">
                <h2 class="modal-title" id="productModalTitle"></h2>
                <p class="modal-artist" id="productModalArtist"></p>
                <div class="modal-tags" id="productModalTags"></div>
                <div class="rating-section">
                    <div class="rating-label">Средняя оценка:</div>
                    <div class="rating-stars-large" id="modalRatingStars"></div>
                    <div class="rating-votes" id="modalRatingVotes"></div>
                </div>
                <div class="comments-list" id="modalCommentsList"></div>
                <p class="modal-description" id="productModalDescription"></p>
                <div class="modal-price" id="productModalPrice"></div>
                <div class="modal-actions">
                    <button onclick="addToCartFromModal()" class="modal-add-to-cart">В корзину</button>
                    <button onclick="toggleFavoriteFromModal()" class="modal-fav-btn"><i class="fas fa-heart"></i></button>
                </div>
                <button onclick="openReviewModal()" class="modal-review-btn">✍️ Оставить отзыв</button>
                <div id="productModalAudio" style="display:none;"></div>
                <button onclick="playModalPreview()" class="modal-play-btn" id="productModalPlayBtn" style="display:none;"><i class="fas fa-play"></i> Прослушать</button>
            </div>
        </div>
        <div id="reviewModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeReviewModal()">&times;</button>
                <h3>⭐ Оцените пластинку</h3>
                <div class="review-stars" id="reviewStars">
                    <i class="far fa-star" data-rating="1"></i>
                    <i class="far fa-star" data-rating="2"></i>
                    <i class="far fa-star" data-rating="3"></i>
                    <i class="far fa-star" data-rating="4"></i>
                    <i class="far fa-star" data-rating="5"></i>
                </div>
                <textarea id="reviewComment" placeholder="Ваш отзыв..." rows="4"></textarea>
                <button onclick="submitReview()" class="submit-review-btn">Отправить</button>
            </div>
        </div>
    `;
}

function renderMobileProfileModals(user, avatar) {
    return `
        <div id="avatarModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeAvatarModal()">&times;</button>
                <h3>Изменить аватар</h3>
                <img src="/avatars/${avatar}" id="avatarPreview" style="width:150px;height:150px;border-radius:50%;">
                <input type="file" id="avatarFileInput" accept="image/*" style="display:none;">
                <button onclick="document.getElementById('avatarFileInput').click()">Выбрать фото</button>
                <div id="cropContainer" style="display:none;"><img id="cropImage"><button onclick="cropAndUpload()">Обрезать</button></div>
            </div>
        </div>
        <div id="settingsModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeSettingsModal()">&times;</button>
                <h3>Настройки</h3>
                <form id="settingsForm">
                    <input type="text" id="settingsUsername" value="${escapeHtml(user.username)}">
                    <input type="password" id="settingsCurrentPassword" placeholder="Текущий пароль">
                    <input type="password" id="settingsNewPassword" placeholder="Новый пароль">
                    <button type="submit">Сохранить</button>
                </form>
            </div>
        </div>
        <div id="favoritesModal" class="modal-overlay">
            <div class="modal-content">
                <button class="modal-close" onclick="closeFavoritesModal()">&times;</button>
                <h3>Избранное</h3>
                <div id="favoritesList"></div>
            </div>
        </div>
    `;
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function generateStarRatingHTML(rating, votesCount) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let starsHtml = '';
    
    for (let i = 1; i <= 5; i++) {
        if (i <= fullStars) {
            starsHtml += '<i class="fas fa-star star filled"></i>';
        } else if (i === fullStars + 1 && hasHalfStar) {
            starsHtml += '<i class="fas fa-star-half-alt star filled"></i>';
        } else {
            starsHtml += '<i class="far fa-star star"></i>';
        }
    }
    
    return `<div class="rating-stars">${starsHtml}<span class="rating-value">${rating}</span><span class="votes-count">(${votesCount})</span></div>`;
}

// ============================================================
// СТИЛИ И СКРИПТЫ
// ============================================================

const desktopStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Rubik+Mono+One&display=swap');
    .rating-stars { display: flex; align-items: center; gap: 6px; margin: 8px 0; }
    .rating-stars .star { font-size: 16px; cursor: pointer; color: #444; }
    .rating-stars .star.filled { color: #ff7a2f; }
    .rating-stars .rating-value { font-size: 12px; color: #ff7a2f; margin-left: 6px; font-weight: bold; }
    .rating-stars .votes-count { font-size: 10px; color: #666; margin-left: 4px; }
    .rating-stars-large { display: inline-flex; gap: 10px; margin: 10px 0; }
    .rating-stars-large .star { font-size: 28px; cursor: pointer; color: #444; }
    .rating-stars-large .star.filled { color: #ff7a2f; }
    .rating-section { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 15px 0; padding: 10px; background: rgba(255,122,47,0.1); border-radius: 12px; }
    .rating-label { font-size: 14px; color: #ff7a2f; font-weight: bold; }
    .rating-votes { font-size: 12px; color: #888; }
    .comment-section { margin: 15px 0; padding: 15px; background: rgba(255,255,255,0.05); border-radius: 12px; }
    .comment-section textarea { width: 100%; background: #111; border: 1px solid #333; color: white; border-radius: 8px; padding: 10px; }
    .submit-rating-btn { background: linear-gradient(45deg, #ff7a2f, #ff0000); border: none; color: white; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
    .comments-list { margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 12px; max-height: 200px; overflow-y: auto; }
    .comment-item { padding: 10px; border-bottom: 1px solid #333; }
    .comment-header { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
    .comment-user { color: #ff7a2f; font-weight: bold; }
    .comment-date { color: #666; }
    .comment-text { font-size: 13px; color: #ccc; }
    .no-comments { text-align: center; color: #666; padding: 10px; }
    .notification { position: fixed; bottom: 20px; right: 20px; background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 14px 20px; border-radius: 12px; z-index: 9999; display: flex; align-items: center; gap: 12px; animation: slideInRight 0.3s forwards, slideOutRight 0.3s 2.7s forwards; }
    @keyframes slideInRight { to { transform: translateX(0); } }
    @keyframes slideOutRight { to { transform: translateX(400px); } }
    @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .image-container { position: relative; cursor: pointer; aspect-ratio: 1; overflow: hidden; }
    .image-container .graf { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
    .image-container .plastinka { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity 0.3s ease; animation: rotate 5s linear infinite; animation-play-state: paused; }
    .image-container:hover .graf { transform: translateX(50%); }
    .image-container:hover .plastinka { opacity: 1; animation-play-state: running; }
    header { position: sticky; top: 0; z-index: 1000; display: flex; justify-content: space-between; align-items: center; padding: 15px 5%; background: #0a0a0a; box-shadow: 0 2px 10px rgba(0,0,0,0.3); min-height: 80px; }
    .logo { flex-shrink: 0; z-index: 2; }
    .logo img { height: 50px; width: auto; display: block; }
    .search-bar-desktop { position: absolute; left: 40%; transform: translateX(-50%); width: 100%; max-width: 500px; min-width: 250px; background: #1a1a1a; border-radius: 40px; padding: 10px 20px; display: flex; align-items: center; gap: 10px; border: 1px solid #333; z-index: 1; }
    .search-bar-desktop i { color: #ff0000; font-size: 18px; }
    .search-bar-desktop input { flex: 1; background: transparent; border: none; color: white; font-size: 16px; outline: none; }
    .search-dropdown { display: none; position: absolute; top: calc(100% + 5px); left: 0; right: 0; background: #1a1a1a; border-radius: 12px; z-index: 1000; max-height: 400px; overflow-y: auto; border: 1px solid #333; }
    .search-dropdown.show { display: block; }
    .right-icons { display: flex; gap: 20px; align-items: center; flex-shrink: 0; margin-left: auto; z-index: 2; }
    .right-icons a { display: flex; align-items: center; transition: all 0.25s ease; line-height: 0; }
    .right-icons a:hover { transform: scale(1.1); filter: drop-shadow(0 0 8px rgba(255, 0, 0, 0.5)); }
    .right-icons img { height: 40px; width: auto; display: block; }
    .player-carousel, .player-carousel2 { width: 100%; overflow: hidden; background: #1e1e1e; padding: 60px 0; position: relative; }
    .player-carousel .carousel-track { display: flex; gap: 40px; width: max-content; animation: scrollLeft 60s linear infinite; align-items: center; }
    .player-carousel2 .carousel-track2 { display: flex; gap: 40px; width: max-content; animation: scrollRight 60s linear infinite; align-items: center; }
    .player-carousel:hover .carousel-track, .player-carousel2:hover .carousel-track2 { animation-play-state: paused; }
    @keyframes scrollLeft { 0% { transform: translateX(0); } 100% { transform: translateX(calc(-50%)); } }
    @keyframes scrollRight { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
    .player-carousel .card, .player-carousel2 .card { position: relative; width: 280px; height: 350px; background: transparent; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: transform 0.3s ease; cursor: pointer; }
    .player-carousel .card:hover, .player-carousel2 .card:hover { transform: translateY(-10px); z-index: 10; }
    .player-carousel .circle, .player-carousel2 .circle { position: absolute; width: 260px; height: 260px; border-radius: 50%; transition: transform 0.4s ease; }
    .player-carousel .card:hover .circle, .player-carousel2 .card:hover .circle { transform: scale(1.1); }
    .player-carousel .orange, .player-carousel2 .orange { background: #ff7a2f; }
    .player-carousel .player-image, .player-carousel2 .player-image { position: relative; width: 240px; height: auto; z-index: 2; pointer-events: none; object-fit: contain; }
    .player-carousel .view-btn, .player-carousel2 .view-btn { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%) translateY(20px); background: linear-gradient(45deg, #D74307, #ff6b2b); color: white; border: none; border-radius: 30px; padding: 10px 25px; font-size: 14px; font-weight: bold; cursor: pointer; opacity: 0; visibility: hidden; transition: all 0.3s ease; z-index: 10; white-space: nowrap; }
    .player-carousel .card:hover .view-btn, .player-carousel2 .card:hover .view-btn { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(5px); z-index: 1000; justify-content: center; align-items: center; }
    .modal-overlay.active { display: flex; }
    .modal-content { background: linear-gradient(145deg, #2a2a2a, #1e1e1e); border-radius: 20px; padding: 30px; max-width: 380px; width: 90%; position: relative; border: 1px solid #ff7a2f; max-height: 85vh; overflow-y: auto; }
    .modal-close { position: absolute; top: 15px; right: 15px; background: rgba(255,0,0,0.1); border: none; color: #fff; font-size: 30px; cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: 0.3s; }
    .modal-close:hover { background: #ff0000; transform: rotate(90deg); }
    .modal-player-image { width: 100%; max-height: 300px; object-fit: contain; margin-bottom: 20px; border-radius: 12px; }
    .modal-title { font-size: 24px; color: #ff7a2f; margin-bottom: 10px; font-weight: bold; }
    .modal-description { color: #ccc; line-height: 1.6; margin-bottom: 20px; font-size: 14px; }
    .modal-price { font-size: 28px; color: #fff; font-weight: bold; margin-bottom: 25px; }
    .modal-add-to-cart { width: 100%; padding: 12px; background: linear-gradient(45deg, #ff7a2f, #ff0000); border: none; border-radius: 10px; color: white; font-size: 16px; font-weight: bold; cursor: pointer; transition: 0.3s; }
    .benefit { cursor: pointer; }
    footer { text-align: center; padding: 40px; background: #0a0a0a; margin-top: 60px; }
    .footer-logo { height: 40px; }
`;

const desktopCatalogStyles = `
    .catalog-container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .catalog-header h1 { text-align: center; color: white; margin-bottom: 20px; }
    .big-search { margin-bottom: 20px; }
    .big-search form { display: flex; gap: 10px; }
    .big-search input { flex: 1; background: #1a1a1a; border: 1px solid #333; border-radius: 40px; padding: 14px 20px; color: white; font-size: 16px; outline: none; }
    .big-search button { background: linear-gradient(45deg, #ff0000, #990000); border: none; border-radius: 40px; padding: 0 24px; color: white; font-weight: bold; cursor: pointer; }
    .filter-btn { width: 100%; background: #1a1a1a; border: 1px solid #333; border-radius: 40px; padding: 12px 20px; color: white; font-size: 14px; cursor: pointer; margin-bottom: 15px; display: flex; align-items: center; justify-content: center; gap: 10px; }
    .filters-panel { background: #181818; padding: 20px; border-radius: 12px; margin-bottom: 30px; display: none; }
    .filters-panel.open { display: block; }
    .filters-form { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
    .filter-group { display: flex; flex-direction: column; gap: 8px; }
    .filter-group label { font-size: 12px; text-transform: uppercase; color: #aaa; }
    .filter-group select, .filter-group input { background: #111; border: 1px solid #333; color: #fff; padding: 8px 12px; border-radius: 8px; }
    .filter-actions { display: flex; gap: 10px; margin-left: auto; }
    .filter-actions button, .filter-actions a { background: linear-gradient(45deg, #ff0000, #990000); color: white; border: none; padding: 8px 20px; border-radius: 30px; cursor: pointer; text-decoration: none; }
    .filter-actions a { background: #333; }
    .catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 30px; margin-top: 30px; }
    .catalog-item { background: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #333; cursor: pointer; transition: transform 0.2s; }
    .catalog-item:hover { transform: translateY(-5px); border-color: #ff0000; }
    .image-container { position: relative; aspect-ratio: 1; }
    .catalog-album-cover { position: relative; z-index: 2; width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
    .vinyl-disc-small { position: absolute; top: 0; left: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; opacity: 0; animation: spin 4s linear infinite; animation-play-state: paused; }
    .image-container:hover .catalog-album-cover { transform: translateX(50%); }
    .image-container:hover .vinyl-disc-small { opacity: 1; animation-play-state: running; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .catalog-item-info { padding: 15px; }
    .catalog-item-name { color: white; font-size: 18px; font-weight: bold; }
    .catalog-item-artist { color: #aaa; font-size: 14px; margin-top: 4px; }
    .catalog-item-price { color: #ff0000; font-size: 20px; font-weight: bold; margin: 10px 0; }
    .catalog-item-actions { display: flex; gap: 10px; }
    .catalog-cart-btn { flex: 1; background: linear-gradient(45deg, #ff0000, #990000); border: none; color: #fff; padding: 8px; border-radius: 8px; cursor: pointer; }
    .catalog-fav-btn { background: #333; border: none; color: #fff; width: 36px; border-radius: 8px; cursor: pointer; }
    .catalog-fav-btn:hover { background: #ff0000; }
    .empty-catalog { text-align: center; padding: 60px; background: #1a1a1a; border-radius: 12px; }
`;

const cartStyles = `
    .plastinka-cart { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
    .plastinka-cart h1 { color: white; margin-bottom: 30px; }
    .plastinka-grid { display: flex; flex-direction: column; gap: 20px; }
    .plastinka-item { background: #1a1a1a; border-radius: 12px; padding: 20px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .image-stack { width: 100px; height: 100px; }
    .album-image { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; }
    .item-info { flex: 1; }
    .plastinka-name { font-size: 18px; font-weight: bold; display: block; }
    .plastinka-artist { color: #888; font-size: 14px; }
    .plastinka-price { color: #ff0000; font-weight: bold; font-size: 16px; }
    .quantity-controls { display: flex; align-items: center; gap: 15px; }
    .quantity-btn { width: 35px; height: 35px; border-radius: 50%; border: 2px solid #D74307; background: transparent; color: #D74307; font-size: 20px; cursor: pointer; }
    .quantity-value { font-size: 20px; min-width: 40px; text-align: center; }
    .item-subtotal { font-size: 18px; font-weight: bold; color: #D74307; }
    .remove-plastinka { background: rgba(244,67,54,0.2); border: none; color: #f44336; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
    .cart-summary { background: #2A2A2A; border-radius: 12px; padding: 30px; margin-top: 40px; text-align: right; }
    .summary-row { display: flex; justify-content: flex-end; gap: 20px; padding: 15px 0; border-bottom: 1px solid #333; }
    .total-price { font-size: 32px; color: #D74307; font-weight: bold; }
    .order-btn { padding: 15px 40px; background: linear-gradient(45deg, #D74307, #ff6b2b); color: #fff; border: none; border-radius: 8px; font-size: 20px; cursor: pointer; margin-top: 20px; }
`;

const emptyCartStyles = `
    .empty-cart-desktop { display: flex; justify-content: center; align-items: center; min-height: calc(100vh - 200px); padding: 40px; }
    .empty-cart-card { background: rgba(24,24,24,0.95); border-radius: 40px; padding: 60px 80px; text-align: center; max-width: 600px; width: 100%; }
    .empty-cart-icon-main { font-size: 120px; margin-bottom: 30px; animation: float 3s ease-in-out infinite; }
    @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
    .empty-cart-card h2 { font-size: 36px; margin-bottom: 20px; background: linear-gradient(135deg, #fff, #ff7a2f); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .empty-cart-btn { display: inline-block; background: linear-gradient(45deg, #ff0000, #990000); color: white; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; }
`;

const profileStyles = `
    .profile-wrapper { max-width: 1000px; margin: 40px auto; padding: 0 20px; }
    .profile-card { background: rgba(24,24,24,0.95); border-radius: 32px; overflow: hidden; }
    .profile-cover { height: 160px; background: linear-gradient(135deg, #ff0000, #990000); }
    .profile-avatar-wrapper { text-align: center; margin-top: -70px; }
    .profile-avatar { width: 130px; height: 130px; border-radius: 50%; border: 5px solid #1a1a1a; object-fit: cover; cursor: pointer; }
    .avatar-overlay { position: absolute; bottom: 5px; right: 5px; background: #ff0000; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; cursor: pointer; border: 2px solid #1a1a1a; }
    .profile-avatar-wrapper h2 { margin-top: 15px; font-size: 32px; }
    .profile-role { color: #ff4444; font-size: 16px; margin-top: 5px; }
    .profile-stats { display: flex; justify-content: center; gap: 60px; padding: 25px; background: rgba(0,0,0,0.3); margin: 25px 30px; border-radius: 24px; }
    .stat { text-align: center; }
    .stat-value { font-size: 32px; font-weight: bold; color: #ff4444; }
    .stat-label { color: #aaa; font-size: 13px; }
    .profile-menu { margin: 20px 30px 30px; display: flex; flex-direction: column; gap: 12px; }
    .menu-item { display: flex; align-items: center; gap: 18px; padding: 16px 20px; background: rgba(10,10,10,0.6); border-radius: 20px; border: 1px solid #333; cursor: pointer; }
    .menu-item:hover { background: rgba(255,0,0,0.1); border-color: #ff0000; transform: translateX(8px); }
    .menu-item i:first-child { width: 30px; font-size: 20px; color: #ff4444; }
    .admin-panel-btn { display: block; margin: 15px 30px; padding: 16px; text-align: center; background: linear-gradient(45deg, #ff0000, #990000); color: white; border-radius: 20px; text-decoration: none; font-weight: bold; }
    .logout-btn { display: block; margin: 15px 30px; padding: 16px; text-align: center; background: transparent; color: #ff4444; border: 1px solid #ff4444; border-radius: 20px; text-decoration: none; }
`;

const mobileStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f0f0f; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding-bottom: 70px; }
    .top-bar { background: #0a0a0a; padding: 12px 16px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 100; border-bottom: 1px solid #222; }
    .top-bar .logo { height: 32px; width: auto; }
    .search-bar { flex: 1; background: #1a1a1a; border-radius: 20px; padding: 8px 16px; display: flex; align-items: center; gap: 8px; color: #888; font-size: 14px; border: 1px solid #333; cursor: pointer; }
    .search-bar i { color: #ff0000; }
    .content { padding: 16px; }
    .section-title { font-size: 20px; font-weight: bold; margin: 20px 0 16px; padding-left: 12px; position: relative; }
    .section-title::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: linear-gradient(180deg, #ff0000, #990000); border-radius: 2px; }
    .products-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
    .product-card { background: #1a1a1a; border-radius: 12px; overflow: hidden; border: 1px solid #333; cursor: pointer; transition: transform 0.2s; }
    .product-card:active { transform: scale(0.98); }
    .product-image { position: relative; aspect-ratio: 1; background: #111; }
    .product-image img { width: 100%; height: 100%; object-fit: cover; }
    .vinyl-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
    .product-card:active .vinyl-overlay { opacity: 1; }
    .vinyl-icon { width: 50px; height: 50px; animation: spin 2s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .product-info { padding: 12px; }
    .product-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .product-artist { font-size: 12px; color: #888; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .rating-stars { display: flex; align-items: center; gap: 4px; margin: 6px 0; }
    .rating-stars .star { font-size: 10px; color: #444; }
    .rating-stars .star.filled { color: #ff7a2f; }
    .rating-value { font-size: 10px; color: #ff7a2f; margin-left: 4px; }
    .votes-count { font-size: 9px; color: #666; }
    .product-price { color: #ff0000; font-weight: bold; font-size: 16px; margin-bottom: 8px; }
    .product-actions { display: flex; gap: 8px; }
    .action-btn { flex: 1; background: #333; border: none; color: white; padding: 8px; border-radius: 8px; font-size: 14px; cursor: pointer; transition: 0.2s; }
    .action-btn:active { background: #ff0000; }
    .bottom-nav { position: fixed; bottom: 0; left: 0; right: 0; background: #0a0a0a; display: flex; justify-content: space-around; padding: 8px 0 12px; border-top: 1px solid #222; z-index: 1000; }
    .nav-item { color: #888; text-decoration: none; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; flex: 1; transition: color 0.2s; }
    .nav-item i { font-size: 20px; }
    .nav-item.active { color: #ff0000; }
    .auth-prompt { background: linear-gradient(45deg, #ff0000, #990000); padding: 20px; border-radius: 12px; text-align: center; margin-top: 20px; }
    .auth-prompt p { margin-bottom: 12px; font-size: 14px; }
    .auth-btn { display: inline-block; background: white; color: #ff0000; padding: 10px 30px; border-radius: 30px; text-decoration: none; font-weight: bold; font-size: 14px; }
    .empty-state { text-align: center; padding: 60px 20px; }
    .empty-icon { font-size: 60px; color: #333; margin-bottom: 20px; }
    .empty-btn { display: inline-block; background: linear-gradient(45deg, #ff0000, #990000); color: white; padding: 12px 24px; border-radius: 30px; text-decoration: none; font-weight: bold; }
    .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); backdrop-filter: blur(5px); z-index: 2000; justify-content: center; align-items: center; }
    .modal-overlay.active { display: flex; }
    .modal-content { background: linear-gradient(145deg, #2a2a2a, #1e1e1e); border-radius: 20px; padding: 24px; max-width: 90%; width: 350px; position: relative; border: 1px solid #ff7a2f; max-height: 85vh; overflow-y: auto; }
    .modal-close { position: absolute; top: 15px; right: 15px; background: rgba(255,0,0,0.1); border: none; color: #fff; font-size: 30px; cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: 0.3s; }
    .modal-close:active { background: #ff0000; transform: rotate(90deg); }
    .modal-player-image { width: 100%; max-height: 200px; object-fit: contain; margin-bottom: 16px; border-radius: 12px; }
    .modal-title { font-size: 22px; color: #ff7a2f; margin-bottom: 8px; font-weight: bold; }
    .modal-artist { color: #aaa; font-size: 16px; margin-bottom: 12px; }
    .modal-tags { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .modal-tag { background: rgba(255,122,47,0.2); padding: 4px 12px; border-radius: 20px; font-size: 11px; color: #ff7a2f; }
    .rating-section { margin: 15px 0; }
    .rating-label { font-size: 12px; color: #888; margin-bottom: 5px; }
    .rating-stars-large { display: flex; gap: 8px; margin-bottom: 5px; }
    .rating-stars-large .star { font-size: 20px; cursor: pointer; color: #444; }
    .rating-stars-large .star.filled { color: #ff7a2f; }
    .rating-votes { font-size: 11px; color: #666; }
    .comments-list { background: #111; border-radius: 12px; padding: 12px; max-height: 200px; overflow-y: auto; margin: 15px 0; }
    .comment-item { padding: 10px 0; border-bottom: 1px solid #333; }
    .comment-header { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .comment-user { color: #ff7a2f; font-weight: bold; font-size: 12px; }
    .comment-date { color: #666; font-size: 10px; }
    .comment-text { color: #ccc; font-size: 13px; }
    .modal-description { color: #ccc; line-height: 1.5; margin-bottom: 16px; font-size: 14px; }
    .modal-price { font-size: 28px; color: #fff; font-weight: bold; margin-bottom: 20px; }
    .modal-actions { display: flex; gap: 12px; margin-bottom: 12px; }
    .modal-add-to-cart { flex: 1; padding: 12px; background: linear-gradient(45deg, #ff7a2f, #ff0000); border: none; border-radius: 10px; color: white; font-size: 16px; font-weight: bold; cursor: pointer; }
    .modal-fav-btn { width: 48px; background: rgba(255,255,255,0.1); border: 1px solid #ff0000; border-radius: 10px; color: #ff0000; font-size: 20px; cursor: pointer; }
    .modal-fav-btn.active { background: #ff0000; color: white; }
    .modal-play-btn { width: 100%; padding: 10px; background: rgba(255,255,255,0.1); border: 1px solid #ff7a2f; border-radius: 10px; color: #ff7a2f; font-size: 14px; cursor: pointer; margin-top: 10px; }
    .modal-review-btn { width: 100%; margin: 10px 0; padding: 10px; background: rgba(255,122,47,0.2); border: 1px solid #ff7a2f; border-radius: 10px; color: #ff7a2f; font-size: 14px; cursor: pointer; }
    .toast-notification { position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); background: #4CAF50; color: white; padding: 10px 20px; border-radius: 8px; z-index: 3000; animation: fadeOut 2s forwards; font-size: 14px; white-space: nowrap; }
    @keyframes fadeOut { 0% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; visibility: hidden; } }
    .profile-header { text-align: center; padding: 20px; }
    .profile-avatar { width: 100px; height: 100px; border-radius: 50%; border: 3px solid #ff0000; margin-bottom: 16px; object-fit: cover; }
    .profile-name { font-size: 24px; margin-bottom: 4px; }
    .profile-role { color: #888; }
    .profile-stats { display: flex; justify-content: center; gap: 40px; padding: 20px; background: #1a1a1a; border-radius: 12px; margin: 20px 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #ff0000; }
    .stat-label { color: #888; font-size: 12px; }
    .profile-menu { background: #1a1a1a; border-radius: 12px; overflow: hidden; }
    .menu-item { display: flex; align-items: center; gap: 12px; padding: 16px; color: white; border-bottom: 1px solid #333; cursor: pointer; }
    .admin-panel-btn { display: block; background: linear-gradient(45deg, #ff0000, #990000); color: white; text-decoration: none; padding: 16px; border-radius: 12px; text-align: center; margin: 20px 0; font-weight: bold; }
    .logout-btn { display: block; background: #222; color: #ff4444; text-decoration: none; padding: 16px; border-radius: 12px; text-align: center; margin-top: 20px; border: 1px solid #ff4444; }
    .cart-item { display: flex; align-items: center; gap: 12px; background: #1a1a1a; padding: 12px; border-radius: 12px; margin-bottom: 12px; }
    .cart-item-image { width: 70px; height: 70px; object-fit: cover; border-radius: 8px; }
    .cart-item-info { flex: 1; }
    .cart-item-name { font-weight: bold; font-size: 14px; margin-bottom: 4px; }
    .cart-item-price { color: #ff0000; font-weight: bold; margin-bottom: 8px; }
    .cart-item-quantity { display: flex; align-items: center; gap: 10px; }
    .quantity-btn { width: 28px; height: 28px; border-radius: 50%; background: #333; border: none; color: white; cursor: pointer; font-size: 16px; }
    .remove-btn { background: transparent; border: none; color: #ff4444; font-size: 18px; cursor: pointer; padding: 8px; }
    .cart-total { background: #1a1a1a; padding: 16px; border-radius: 12px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }
    .total-price { font-size: 22px; font-weight: bold; color: #ff0000; }
    .checkout-btn { width: 100%; background: linear-gradient(45deg, #ff0000, #990000); border: none; color: white; padding: 14px; border-radius: 12px; font-weight: bold; font-size: 16px; margin-top: 16px; cursor: pointer; }
    .avatar-container { position: relative; display: inline-block; cursor: pointer; }
    .avatar-overlay { position: absolute; bottom: 5px; right: 5px; background: #ff0000; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 2px solid #1a1a1a; }
    .avatar-overlay i { color: white; font-size: 14px; }
    .big-search { margin-bottom: 20px; }
    .big-search form { display: flex; gap: 10px; }
    .big-search input { flex: 1; background: #1a1a1a; border: 1px solid #333; border-radius: 40px; padding: 12px 16px; color: white; font-size: 14px; }
    .big-search button { background: linear-gradient(45deg, #ff0000, #990000); border: none; border-radius: 40px; padding: 0 20px; color: white; font-weight: bold; }
    .filter-btn { width: 100%; background: #1a1a1a; border: 1px solid #333; border-radius: 40px; padding: 10px; margin-bottom: 15px; text-align: center; cursor: pointer; }
    .filters { display: none; background: #1a1a1a; border-radius: 16px; padding: 16px; margin-bottom: 20px; }
    .filters.open { display: block; }
    .filters select, .filters input { width: 100%; padding: 10px; margin-bottom: 10px; background: #111; border: 1px solid #333; border-radius: 8px; color: white; }
    .filters button, .filters a { width: 100%; padding: 10px; margin-top: 5px; background: linear-gradient(45deg, #ff0000, #990000); border: none; border-radius: 8px; color: white; text-align: center; display: block; text-decoration: none; }
    .empty-cart { text-align: center; padding: 60px 20px; }
    .empty-cart .empty-icon { font-size: 80px; margin-bottom: 20px; }
    @media (max-width: 480px) { .products-grid { grid-template-columns: 1fr; } }
`;

const desktopScripts = `
    let currentPlayingAudio = null;
    let currentPlayingPlastinka = null;
    let currentProductId = null;
    let searchTimeout = null;
    let currentModalProductId = null;
    let currentSelectedRating = null;

    function showToast(message, isError) {
        const toast = document.createElement('div');
        toast.className = 'notification';
        toast.innerHTML = '<div class="notification-icon">' + (isError ? '❌' : '✅') + '</div>' +
            '<div class="notification-content">' +
            '<span class="notification-title">' + (isError ? 'Ошибка' : 'Успешно') + '</span>' +
            '<span class="notification-message">' + message + '</span>' +
            '</div><div class="notification-progress"></div>';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function renderComments(comments, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!comments || comments.length === 0) {
            container.innerHTML = '<div class="no-comments">📝 Пока нет комментариев</div>';
            return;
        }
        let html = '';
        for (let i = 0; i < comments.length; i++) {
            const c = comments[i];
            let stars = '';
            for (let s = 1; s <= 5; s++) {
                stars += s <= c.rating ? '<i class="fas fa-star" style="color:#ff7a2f; font-size:10px;"></i>' : '<i class="far fa-star" style="color:#555; font-size:10px;"></i>';
            }
            html += '<div class="comment-item"><div class="comment-header"><span class="comment-user">' + escapeHtml(c.username) + '</span><span class="comment-date">' + new Date(c.created_at).toLocaleDateString() + '</span></div><div><span class="comment-rating">' + stars + '</span></div><div class="comment-text">' + escapeHtml(c.comment) + '</div></div>';
        }
        container.innerHTML = html;
    }

    function renderStarsInModal(containerId, rating) {
        const container = document.getElementById(containerId);
        if (!container) return;
        let starsHtml = '';
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) starsHtml += '<i class="fas fa-star star filled" data-value="' + i + '"></i>';
            else if (i === fullStars + 1 && hasHalfStar) starsHtml += '<i class="fas fa-star-half-alt star filled" data-value="' + i + '"></i>';
            else starsHtml += '<i class="far fa-star star" data-value="' + i + '"></i>';
        }
        container.innerHTML = starsHtml;
        const stars = container.querySelectorAll('.star');
        stars.forEach(star => {
            star.style.cursor = 'pointer';
            star.addEventListener('mouseenter', function() {
                const value = parseInt(this.dataset.value);
                stars.forEach((s, idx) => {
                    if (idx < value) s.classList.add('hover');
                    else s.classList.remove('hover');
                });
            });
            star.addEventListener('mouseleave', () => stars.forEach(s => s.classList.remove('hover')));
            star.addEventListener('click', function() {
                const value = parseInt(this.dataset.value);
                currentSelectedRating = value;
                document.getElementById('modalCommentSectionDesktop').style.display = 'block';
                stars.forEach((s, idx) => {
                    if (idx < value) s.classList.add('filled');
                    else s.classList.remove('filled');
                });
            });
        });
    }

    function updateCardRating(container, rating) {
        const stars = container.querySelectorAll('.star');
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        stars.forEach((star, i) => {
            if (i < fullStars) star.classList.add('filled');
            else if (i === fullStars && hasHalfStar) star.classList.add('filled');
            else star.classList.remove('filled');
        });
        const ratingValue = container.querySelector('.rating-value');
        if (ratingValue) ratingValue.textContent = rating;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function openProductModal(id, name, artist, price, image, description, genre, year, audio) {
        currentProductId = 'product_' + id;
        currentModalProductId = id;
        document.getElementById('productModalImageDesktop').src = image;
        document.getElementById('productModalTitleDesktop').textContent = name;
        document.getElementById('productModalArtistDesktop').textContent = artist;
        document.getElementById('productModalTagsDesktop').innerHTML = '<span class="modal-tag">' + genre + '</span><span class="modal-tag">' + year + '</span>';
        document.getElementById('productModalDescriptionDesktop').textContent = description;
        document.getElementById('productModalPriceDesktop').innerHTML = price + ' <span>$</span>';
        
        fetch('/api/rating/' + id).then(r => r.json()).then(data => {
            renderStarsInModal('modalRatingStarsDesktop', parseFloat(data.avg_rating));
            document.getElementById('modalRatingVotesDesktop').textContent = '(' + data.votes_count + ' оценок)';
            renderComments(data.comments, 'modalCommentsListDesktop');
        });
        
        if (audio) {
            document.getElementById('productModalAudioDesktop').innerHTML = audio;
            document.getElementById('productModalPlayBtnDesktop').style.display = 'flex';
        } else {
            document.getElementById('productModalPlayBtnDesktop').style.display = 'none';
        }
        
        document.getElementById('modalCommentSectionDesktop').style.display = 'none';
        document.getElementById('modalCommentDesktop').value = '';
        currentSelectedRating = null;
        document.getElementById('productModalDesktop').classList.add('active');
        
        const track = document.querySelector('.player-carousel .carousel-track');
        const track2 = document.querySelector('.player-carousel2 .carousel-track2');
        if (track) track.style.animationPlayState = 'paused';
        if (track2) track2.style.animationPlayState = 'paused';
        updateFavoriteStatusDesktop(id);
    }

    function openPlayerModal(id, name, price, image, description) {
        document.getElementById('modalImage').src = image;
        document.getElementById('modalTitle').textContent = name;
        document.getElementById('modalDescription').textContent = description;
        document.getElementById('modalPrice').innerHTML = price + ' <span>$</span>';
        document.getElementById('modalProductId').value = 'player_' + id;
        document.getElementById('playerModal').classList.add('active');
        
        const track = document.querySelector('.player-carousel .carousel-track');
        const track2 = document.querySelector('.player-carousel2 .carousel-track2');
        if (track) track.style.animationPlayState = 'paused';
        if (track2) track2.style.animationPlayState = 'paused';
    }

    function performSearch(query) {
        const searchDropdown = document.getElementById('search-dropdown');
        if (!searchDropdown) return;
        if (query.length < 1) {
            searchDropdown.innerHTML = '';
            searchDropdown.classList.remove('show');
            return;
        }
        searchDropdown.innerHTML = '<div class="search-no-results">🔍 Поиск...</div>';
        searchDropdown.classList.add('show');
        
        fetch('/api/search?q=' + encodeURIComponent(query))
            .then(r => r.json())
            .then(data => {
                if (!data.results || data.results.length === 0) {
                    searchDropdown.innerHTML = '<div class="search-no-results">🔍 Ничего не найдено</div><button class="search-catalog-btn" onclick="window.location.href=\'/catalog\'">📀 Поиск в каталоге</button>';
                    return;
                }
                let html = '';
                for (let item of data.results) {
                    const imagePath = item.type === 'product' ? '/uploads/' + item.image : '/photo/' + item.image;
                    const productId = item.type + '_' + item.id;
                    html += '<div class="search-result-item-dropdown" data-type="' + item.type + '" data-id="' + item.id + '">' +
                        '<img src="' + imagePath + '" class="search-result-image">' +
                        '<div class="search-result-info"><div class="search-result-name">' + escapeHtml(item.name) + '</div><div class="search-result-artist">' + escapeHtml(item.artist) + '</div></div>' +
                        '<span class="search-result-price">$' + item.price + '</span>' +
                        '<div class="search-result-actions">' +
                        '<button class="search-cart-btn" data-id="' + productId + '">🛒</button>' +
                        '<button class="search-detail-btn" data-id="' + item.id + '" data-type="' + item.type + '" data-name="' + escapeHtml(item.name) + '" data-artist="' + escapeHtml(item.artist) + '" data-price="' + item.price + '" data-image="' + imagePath + '" data-description="' + escapeHtml(item.description || 'Нет описания') + '" data-genre="' + (item.genre || 'Rock') + '" data-year="' + (item.year || '1970') + '" data-audio="' + (item.audio || '') + '">📋</button>' +
                        '</div></div>';
                }
                html += '<button class="search-catalog-btn" onclick="window.location.href=\'/catalog\'">Поиск в каталоге →</button>';
                searchDropdown.innerHTML = html;
                
                document.querySelectorAll('.search-cart-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        fetch('/api/cart/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: btn.dataset.id })
                        }).then(() => showToast('Товар добавлен в корзину', false));
                    });
                });
                
                document.querySelectorAll('.search-detail-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        searchDropdown.classList.remove('show');
                        if (btn.dataset.type === 'product') {
                            openProductModal(btn.dataset.id, btn.dataset.name, btn.dataset.artist, btn.dataset.price, btn.dataset.image, btn.dataset.description, btn.dataset.genre, btn.dataset.year, btn.dataset.audio);
                        } else {
                            openPlayerModal(btn.dataset.id, btn.dataset.name, btn.dataset.price, btn.dataset.image, btn.dataset.description);
                        }
                    });
                });
                
                document.querySelectorAll('.search-result-item-dropdown').forEach(item => {
                    item.addEventListener('click', (e) => {
                        if (e.target.tagName === 'BUTTON') return;
                        item.querySelector('.search-detail-btn').click();
                    });
                });
            });
    }

    document.addEventListener('DOMContentLoaded', () => {
        const searchInput = document.getElementById('desktop-search-input');
        const searchDropdown = document.getElementById('search-dropdown');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
            });
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.length >= 1) performSearch(searchInput.value);
            });
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const q = encodeURIComponent(searchInput.value);
                    if (q) window.location.href = '/search-page?q=' + q;
                }
            });
        }
        document.addEventListener('click', (e) => {
            if (searchDropdown && !searchDropdown.contains(e.target) && e.target !== searchInput) {
                searchDropdown.classList.remove('show');
            }
        });
        
        document.querySelectorAll('.rating-stars').forEach(container => {
            const productId = container.dataset.productId;
            fetch('/api/rating/' + productId).then(r => r.json()).then(data => {
                if (data.avg_rating) {
                    updateCardRating(container, parseFloat(data.avg_rating));
                    const ratingValue = container.querySelector('.rating-value');
                    if (ratingValue) ratingValue.textContent = data.avg_rating;
                    const votesSpan = container.querySelector('.votes-count');
                    if (votesSpan) votesSpan.textContent = '(' + data.votes_count + ')';
                }
            });
        });
    });

    document.querySelectorAll('.benefit').forEach(benefit => {
        const imageContainer = benefit.querySelector('.image-container');
        const audio = benefit.querySelector('.album-audio');
        const plastinka = benefit.querySelector('.plastinka');
        if (imageContainer && audio && plastinka) {
            imageContainer.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                if (currentPlayingAudio && currentPlayingAudio !== audio) {
                    currentPlayingAudio.pause();
                    currentPlayingAudio.currentTime = 0;
                    if (currentPlayingPlastinka) currentPlayingPlastinka.style.animationPlayState = 'paused';
                }
                audio.currentTime = 0;
                audio.play().catch(err => console.log('Audio error:', err));
                plastinka.style.animationPlayState = 'running';
                currentPlayingAudio = audio;
                currentPlayingPlastinka = plastinka;
            });
            imageContainer.addEventListener('mouseleave', (e) => {
                e.stopPropagation();
                audio.pause();
                audio.currentTime = 0;
                plastinka.style.animationPlayState = 'paused';
                if (currentPlayingAudio === audio) {
                    currentPlayingAudio = null;
                    currentPlayingPlastinka = null;
                }
            });
        }
        benefit.addEventListener('click', (e) => {
            if (e.target.closest('.add-to-cart-form')) return;
            openProductModal(
                benefit.dataset.productId,
                benefit.dataset.productName,
                benefit.dataset.productArtist,
                benefit.dataset.productPrice,
                benefit.dataset.productImage,
                benefit.dataset.productDescription,
                benefit.dataset.productGenre,
                benefit.dataset.productYear,
                ''
            );
        });
    });

    async function updateFavoriteStatusDesktop(productId) {
        try {
            const response = await fetch('/api/favorites/status/product_' + productId);
            const data = await response.json();
            const favBtn = document.getElementById('productModalFavBtnDesktop');
            if (favBtn) {
                if (data.isFavorite) {
                    favBtn.style.color = '#ff0000';
                    favBtn.style.background = 'rgba(255, 0, 0, 0.2)';
                } else {
                    favBtn.style.color = '#fff';
                    favBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                }
            }
        } catch (error) {
            console.error('Error:', error);
        }
    }

    function addToCartFromModalDesktop() {
        fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: currentProductId })
        }).then(() => {
            showToast('Товар добавлен в корзину', false);
            closeProductModalDesktop();
        });
    }

    function toggleFavoriteFromModalDesktop() {
        const fullProductId = 'product_' + currentModalProductId;
        fetch('/api/favorites/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: fullProductId })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showToast(data.action === 'added' ? 'Добавлено в избранное' : 'Удалено из избранного', false);
                updateFavoriteStatusDesktop(currentModalProductId);
            }
        });
    }

    function playModalPreviewDesktop() {
        const audioFile = document.getElementById('productModalAudioDesktop').innerText;
        if (audioFile) {
            const audio = new Audio('/audio/' + audioFile);
            audio.play();
        }
    }

    function closeProductModalDesktop() {
        document.getElementById('productModalDesktop').classList.remove('active');
        const track = document.querySelector('.player-carousel .carousel-track');
        const track2 = document.querySelector('.player-carousel2 .carousel-track2');
        if (track) track.style.animationPlayState = 'running';
        if (track2) track2.style.animationPlayState = 'running';
    }

    function submitRatingWithCommentDesktop() {
        const comment = document.getElementById('modalCommentDesktop').value;
        const productId = currentModalProductId;
        const rating = currentSelectedRating;
        if (!rating) {
            showToast('⭐ Сначала выберите оценку!', true);
            return;
        }
        fetch('/api/rating/' + productId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating, comment: comment || '' })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showToast('⭐ Спасибо за оценку!', false);
                renderStarsInModal('modalRatingStarsDesktop', parseFloat(data.avg_rating));
                document.getElementById('modalRatingVotesDesktop').textContent = '(' + data.votes_count + ' оценок)';
                renderComments(data.comments, 'modalCommentsListDesktop');
                document.getElementById('modalCommentSectionDesktop').style.display = 'none';
                document.getElementById('modalCommentDesktop').value = '';
                currentSelectedRating = null;
                const productCardStars = document.querySelector('.rating-stars[data-product-id="' + productId + '"]');
                if (productCardStars) updateCardRating(productCardStars, parseFloat(data.avg_rating));
            }
        });
    }

    const modalDesktop = document.getElementById('productModalDesktop');
    const closeProductBtn = document.getElementById('closeProductModalDesktop');
    if (modalDesktop && closeProductBtn) {
        closeProductBtn.addEventListener('click', closeProductModalDesktop);
        modalDesktop.addEventListener('click', (e) => {
            if (e.target === modalDesktop) closeProductModalDesktop();
        });
    }

    const track = document.querySelector('.player-carousel .carousel-track');
    const track2 = document.querySelector('.player-carousel2 .carousel-track2');
    if (track) {
        track.addEventListener('mouseenter', () => track.style.animationPlayState = 'paused');
        track.addEventListener('mouseleave', () => track.style.animationPlayState = 'running');
    }
    if (track2) {
        track2.addEventListener('mouseenter', () => track2.style.animationPlayState = 'paused');
        track2.addEventListener('mouseleave', () => track2.style.animationPlayState = 'running');
    }

    const modal = document.getElementById('playerModal');
    const closeBtn = document.getElementById('closeModal');
    function closeModal() {
        modal.classList.remove('active');
        if (track) track.style.animationPlayState = 'running';
        if (track2) track2.style.animationPlayState = 'running';
    }
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.card');
            if (!card) return;
            openPlayerModal(card.dataset.playerId, card.dataset.name, card.dataset.price, card.dataset.image, card.dataset.description);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) closeModal();
        if (e.key === 'Escape' && document.getElementById('productModalDesktop') && document.getElementById('productModalDesktop').classList.contains('active')) closeProductModalDesktop();
    });

    const addToCartForm = document.getElementById('addToCartForm');
    if (addToCartForm) {
        addToCartForm.addEventListener('submit', () => setTimeout(closeModal, 100));
    }
`;

const desktopCatalogScripts = `
    function toggleFilters() {
        const panel = document.getElementById('filtersPanel');
        panel.classList.toggle('open');
    }
    
    function toggleFavorite(id) {
        fetch('/api/favorites/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        }).then(() => showToast('Избранное обновлено', false));
    }
    
    document.querySelectorAll('.image-container').forEach(c => {
        const a = c.querySelector('.album-audio');
        if (a) {
            c.addEventListener('mouseenter', () => {
                a.currentTime = 0;
                a.play().catch(e => console.log('Audio error:', e));
            });
            c.addEventListener('mouseleave', () => {
                a.pause();
                a.currentTime = 0;
            });
        }
    });
    
    document.querySelectorAll('.rating-stars').forEach(container => {
        const productId = container.dataset.productId;
        fetch('/api/rating/' + productId).then(r => r.json()).then(data => {
            if (data.avg_rating) updateCardRating(container, parseFloat(data.avg_rating), data.votes_count);
        });
    });
    
    function updateCardRating(container, rating, votesCount) {
        let starsHtml = '';
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) starsHtml += '<i class="fas fa-star star filled"></i>';
            else if (i === fullStars + 1 && hasHalfStar) starsHtml += '<i class="fas fa-star-half-alt star filled"></i>';
            else starsHtml += '<i class="far fa-star star"></i>';
        }
        starsHtml += '<span class="rating-value">' + rating + '</span>';
        starsHtml += '<span class="votes-count">(' + votesCount + ')</span>';
        container.innerHTML = starsHtml;
        container.dataset.rating = rating;
    }
    
    let currentModalProductId = null;
    let currentModalProductRealId = null;
    let currentModalSelectedRating = null;
    
    function showProductModalDesktop(id, name, artist, price, image, description, genre, year, audio) {
        currentModalProductId = 'product_' + id;
        currentModalProductRealId = id;
        document.getElementById('productModalImageDesktop').src = image;
        document.getElementById('productModalTitleDesktop').textContent = name;
        document.getElementById('productModalArtistDesktop').textContent = artist;
        document.getElementById('productModalTagsDesktop').innerHTML = '<span class="modal-tag">' + genre + '</span><span class="modal-tag">' + year + '</span>';
        document.getElementById('productModalDescriptionDesktop').textContent = description;
        document.getElementById('productModalPriceDesktop').innerHTML = price + ' <span>$</span>';
        
        if (audio && audio !== '') {
            document.getElementById('productModalAudioDesktop').innerHTML = audio;
            document.getElementById('productModalPlayBtnDesktop').style.display = 'flex';
        } else {
            document.getElementById('productModalPlayBtnDesktop').style.display = 'none';
        }
        
        fetch('/api/rating/' + id).then(r => r.json()).then(data => {
            renderStarsInModalDesktop('modalRatingStarsDesktop', parseFloat(data.avg_rating), id);
            document.getElementById('modalRatingVotesDesktop').textContent = '(' + data.votes_count + ' оценок)';
            renderCommentsDesktop(data.comments, 'modalCommentsListDesktop');
        });
        
        fetch('/api/favorites/check/' + currentModalProductId).then(r => r.json()).then(data => {
            const favBtn = document.getElementById('productModalFavBtnDesktop');
            if (data.isFavorite) favBtn.classList.add('active');
            else favBtn.classList.remove('active');
        });
        
        document.getElementById('productModal').classList.add('active');
    }
    
    function closeProductModalDesktop() {
        document.getElementById('productModal').classList.remove('active');
        document.getElementById('modalCommentSectionDesktop').style.display = 'none';
        document.getElementById('modalCommentDesktop').value = '';
        currentModalSelectedRating = null;
        if (window.currentAudioPlayer) {
            window.currentAudioPlayer.pause();
            window.currentAudioPlayer = null;
        }
    }
    
    function renderStarsInModalDesktop(containerId, rating) {
        const container = document.getElementById(containerId);
        if (!container) return;
        let starsHtml = '';
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) starsHtml += '<i class="fas fa-star star filled" data-value="' + i + '"></i>';
            else if (i === fullStars + 1 && hasHalfStar) starsHtml += '<i class="fas fa-star-half-alt star filled" data-value="' + i + '"></i>';
            else starsHtml += '<i class="far fa-star star" data-value="' + i + '"></i>';
        }
        container.innerHTML = starsHtml;
        const stars = container.querySelectorAll('.star');
        stars.forEach(star => {
            star.style.cursor = 'pointer';
            star.addEventListener('mouseenter', function() {
                const value = parseInt(this.dataset.value);
                stars.forEach((s, idx) => {
                    if (idx < value) s.classList.add('hover');
                    else s.classList.remove('hover');
                });
            });
            star.addEventListener('mouseleave', () => stars.forEach(s => s.classList.remove('hover')));
            star.addEventListener('click', function() {
                const value = parseInt(this.dataset.value);
                currentModalSelectedRating = value;
                document.getElementById('modalCommentSectionDesktop').style.display = 'block';
                stars.forEach((s, idx) => {
                    if (idx < value) s.classList.add('filled');
                    else s.classList.remove('filled');
                });
            });
        });
    }
    
    function renderCommentsDesktop(comments, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!comments || comments.length === 0) {
            container.innerHTML = '<div class="no-comments">📝 Пока нет комментариев</div>';
            return;
        }
        let html = '';
        comments.forEach(c => {
            let stars = '';
            for (let s = 1; s <= 5; s++) {
                stars += s <= c.rating ? '<i class="fas fa-star" style="color:#ff7a2f; font-size:10px;"></i>' : '<i class="far fa-star" style="color:#555; font-size:10px;"></i>';
            }
            html += '<div class="comment-item"><div class="comment-header"><span class="comment-user">' + escapeHtml(c.username) + '</span><span class="comment-date">' + new Date(c.created_at).toLocaleDateString() + '</span></div><div class="comment-rating">' + stars + '</div><div class="comment-text">' + escapeHtml(c.comment || '') + '</div></div>';
        });
        container.innerHTML = html;
    }
    
    function submitRatingWithCommentDesktop() {
        const rating = currentModalSelectedRating;
        const comment = document.getElementById('modalCommentDesktop').value;
        const productId = currentModalProductRealId;
        if (!rating) {
            showToast('⭐ Сначала выберите оценку!', true);
            return;
        }
        fetch('/api/rating/' + productId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: rating, comment: comment || '' })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showToast('⭐ Спасибо за оценку!', false);
                renderStarsInModalDesktop('modalRatingStarsDesktop', parseFloat(data.avg_rating));
                document.getElementById('modalRatingVotesDesktop').textContent = '(' + data.votes_count + ' оценок)';
                renderCommentsDesktop(data.comments, 'modalCommentsListDesktop');
                document.getElementById('modalCommentSectionDesktop').style.display = 'none';
                document.getElementById('modalCommentDesktop').value = '';
                currentModalSelectedRating = null;
                const productCardStars = document.querySelector('.rating-stars[data-product-id="' + productId + '"]');
                if (productCardStars) updateCardRating(productCardStars, parseFloat(data.avg_rating), data.votes_count);
            }
        });
    }
    
    function addToCartFromModalDesktop() {
        if (currentModalProductId) {
            fetch('/api/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentModalProductId })
            }).then(() => {
                showToast('Товар добавлен в корзину', false);
                closeProductModalDesktop();
            });
        }
    }
    
    function toggleFavoriteFromModalDesktop() {
        if (currentModalProductId) {
            fetch('/api/favorites/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentModalProductId })
            }).then(() => {
                const favBtn = document.getElementById('productModalFavBtnDesktop');
                if (favBtn.classList.contains('active')) {
                    favBtn.classList.remove('active');
                    showToast('Удалено из избранного', false);
                } else {
                    favBtn.classList.add('active');
                    showToast('Добавлено в избранное', false);
                }
            });
        }
    }
    
    function playModalPreviewDesktop() {
        const audioFile = document.getElementById('productModalAudioDesktop').innerText;
        if (audioFile) {
            if (window.currentAudioPlayer) window.currentAudioPlayer.pause();
            window.currentAudioPlayer = new Audio('/audio/' + audioFile);
            window.currentAudioPlayer.play();
        }
    }
    
    document.getElementById('closeProductModalDesktop')?.addEventListener('click', closeProductModalDesktop);
    document.getElementById('productModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('productModal')) closeProductModalDesktop();
    });
    
    document.querySelectorAll('.catalog-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.catalog-cart-btn') || e.target.closest('.catalog-fav-btn')) return;
            showProductModalDesktop(
                item.dataset.id, item.dataset.name, item.dataset.artist, item.dataset.price,
                item.dataset.image, item.dataset.description, item.dataset.genre, item.dataset.year, item.dataset.audio || ''
            );
        });
    });
    
    const searchInput = document.getElementById('desktop-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const q = encodeURIComponent(this.value);
                if (q) window.location.href = '/catalog?search=' + q;
            }
        });
    }
`;

const cartScripts = `
    document.querySelectorAll('.increase').forEach(btn => {
        btn.addEventListener('click', function() {
            updateQuantity(this.dataset.productId, 'increase');
        });
    });
    document.querySelectorAll('.decrease').forEach(btn => {
        btn.addEventListener('click', function() {
            updateQuantity(this.dataset.productId, 'decrease');
        });
    });
    document.querySelectorAll('.remove-plastinka').forEach(btn => {
        btn.addEventListener('click', function() {
            if (confirm('Удалить товар?')) removeFromCart(this.dataset.productId);
        });
    });
    function updateQuantity(id, action) {
        fetch('/update-cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: id, action: action })
        }).then(r => r.json()).then(data => {
            if (data.success) location.reload();
        });
    }
    function removeFromCart(id) {
        fetch('/remove-from-cart-ajax', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: id })
        }).then(r => r.json()).then(data => {
            if (data.success) location.reload();
        });
    }
`;

const profileScripts = `
    let cropper = null;
    
    function openAvatarModal() {
        document.getElementById('avatarModal').style.display = 'flex';
    }
    function closeAvatarModal() {
        document.getElementById('avatarModal').style.display = 'none';
        if (cropper) cropper.destroy();
    }
    function openSettingsModal() {
        document.getElementById('settingsModal').style.display = 'flex';
    }
    function closeSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
    }
    function openFavoritesModal() {
        document.getElementById('favoritesModal').style.display = 'flex';
        loadFavoritesList();
    }
    function closeFavoritesModal() {
        document.getElementById('favoritesModal').style.display = 'none';
    }
    
    document.getElementById('avatarFileInput')?.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const cropImage = document.getElementById('cropImage');
                cropImage.src = e.target.result;
                document.getElementById('cropContainer').style.display = 'block';
                if (cropper) cropper.destroy();
                cropper = new Cropper(cropImage, { aspectRatio: 1, viewMode: 1 });
            };
            reader.readAsDataURL(file);
        }
    });
    
    function cropAndUpload() {
        if (!cropper) return;
        const canvas = cropper.getCroppedCanvas({ width: 300, height: 300 });
        canvas.toBlob(blob => {
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.jpg');
            fetch('/api/upload-avatar', { method: 'POST', body: formData })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        location.reload();
                    }
                });
        });
    }
    
    document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('settingsUsername').value;
        const currentPassword = document.getElementById('settingsCurrentPassword').value;
        const newPassword = document.getElementById('settingsNewPassword').value;
        const response = await fetch('/api/update-profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, currentPassword, newPassword })
        });
        const data = await response.json();
        if (data.success) {
            alert('Настройки сохранены');
            location.reload();
        } else {
            alert(data.error);
        }
    });
    
    async function loadFavoritesList() {
        const container = document.getElementById('favoritesList');
        const response = await fetch('/api/favorites/list');
        const data = await response.json();
        if (!data.success || data.favorites.length === 0) {
            container.innerHTML = '<div class="empty-data">Нет избранного</div>';
            return;
        }
        let html = '';
        for (let item of data.favorites) {
            html += '<div class="favorite-item"><img src="/uploads/' + item.image + '"><div><strong>' + escapeHtml(item.name) + '</strong><br>' + escapeHtml(item.artist) + '<br>$' + item.price + '</div><button onclick="removeFromFavorites(' + item.id + ')">Удалить</button></div>';
        }
        container.innerHTML = html;
    }
    
    async function removeFromFavorites(productId) {
        await fetch('/api/favorites/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: productId, type: 'product' })
        });
        loadFavoritesList();
        updateFavCount();
    }
    
    async function updateFavCount() {
        const response = await fetch('/api/favorites/count');
        const data = await response.json();
        const favStat = document.querySelector('#favCount');
        if (favStat) favStat.textContent = data.count;
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
`;

const mobileScripts = `
    let pressTimer = null;
    let currentAudio = null;
    let currentModalProductId = null;
    let currentModalProductRealId = null;
    let currentSelectedRating = null;
    let reviewProductId = null;
    let reviewSelectedRating = 0;
    
    const tg = window.Telegram?.WebApp;
    if (tg) {
        tg.expand();
        if (window.history.length > 1) {
            tg.BackButton.show();
            tg.BackButton.onClick(() => window.history.back());
        }
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser && tgUser.id) {
            fetch('/api/telegram-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: tgUser.id,
                    first_name: tgUser.first_name || '',
                    last_name: tgUser.last_name || '',
                    username: tgUser.username || '',
                    photo_url: tgUser.photo_url || ''
                })
            }).then(res => res.json()).then(data => {
                if (data.success && !${!!user}) window.location.reload();
            }).catch(err => console.error('Auth error:', err));
        }
    }
    
    function showToastMobile(message, isError) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = (isError ? '❌ ' : '✅ ') + message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }
    
    function addToCartMobile(id) {
        fetch('/api/cart/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        }).then(() => showToastMobile('Товар добавлен в корзину', false));
        if (tg) tg.HapticFeedback.impactOccurred('light');
    }
    
    function toggleFavoriteMobile(id) {
        fetch('/api/favorites/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: id })
        }).then(() => showToastMobile('Избранное обновлено', false));
        if (tg) tg.HapticFeedback.impactOccurred('light');
    }
    
    function playVinylAudio(audioUrl) {
        if (!audioUrl) return;
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
        currentAudio = new Audio(audioUrl);
        currentAudio.play().catch(e => console.log('Audio error:', e));
    }
    
    function setupLongPress(element, audioUrl) {
        if (!element || !audioUrl) return;
        element.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => playVinylAudio(audioUrl), 500);
        });
        element.addEventListener('touchend', () => clearTimeout(pressTimer));
        element.addEventListener('touchcancel', () => clearTimeout(pressTimer));
    }
    
    function showProductModal(id, name, artist, price, image, description, genre, year, audio) {
        currentModalProductId = 'product_' + id;
        currentModalProductRealId = id;
        document.getElementById('productModalImage').src = image;
        document.getElementById('productModalTitle').innerText = name;
        document.getElementById('productModalArtist').innerText = artist;
        document.getElementById('productModalTags').innerHTML = '<span class="modal-tag">' + genre + '</span><span class="modal-tag">' + year + '</span>';
        document.getElementById('productModalDescription').innerText = description;
        document.getElementById('productModalPrice').innerHTML = price + ' <span>$</span>';
        
        if (audio) {
            document.getElementById('productModalAudio').innerHTML = audio;
            document.getElementById('productModalPlayBtn').style.display = 'flex';
        } else {
            document.getElementById('productModalPlayBtn').style.display = 'none';
        }
        
        fetch('/api/rating/' + id).then(r => r.json()).then(data => {
            renderStarsInModal('modalRatingStars', parseFloat(data.avg_rating));
            document.getElementById('modalRatingVotes').innerText = '(' + data.votes_count + ' оценок)';
            renderComments(data.comments, 'modalCommentsList');
        });
        
        document.getElementById('productModal').classList.add('active');
    }
    
    function closeProductModal() {
        document.getElementById('productModal').classList.remove('active');
        if (currentAudio) currentAudio.pause();
    }
    
    function renderStarsInModal(containerId, rating) {
        const container = document.getElementById(containerId);
        if (!container) return;
        let starsHtml = '';
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        for (let i = 1; i <= 5; i++) {
            if (i <= fullStars) starsHtml += '<i class="fas fa-star star filled" data-value="' + i + '"></i>';
            else if (i === fullStars + 1 && hasHalfStar) starsHtml += '<i class="fas fa-star-half-alt star filled" data-value="' + i + '"></i>';
            else starsHtml += '<i class="far fa-star star" data-value="' + i + '"></i>';
        }
        container.innerHTML = starsHtml;
        const stars = container.querySelectorAll('.star');
        stars.forEach(star => {
            star.addEventListener('click', function() {
                currentSelectedRating = parseInt(this.dataset.value);
                stars.forEach((s, idx) => {
                    if (idx < currentSelectedRating) s.classList.add('filled');
                    else s.classList.remove('filled');
                });
            });
        });
    }
    
    function renderComments(comments, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!comments || comments.length === 0) {
            container.innerHTML = '<div class="no-comments">📝 Пока нет комментариев</div>';
            return;
        }
        let html = '';
        comments.forEach(c => {
            html += '<div class="comment-item"><div class="comment-header"><span class="comment-user">' + escapeHtml(c.username) + '</span><span class="comment-date">' + new Date(c.created_at).toLocaleDateString() + '</span></div><div class="comment-text">' + escapeHtml(c.comment || '') + '</div></div>';
        });
        container.innerHTML = html;
    }
    
    function addToCartFromModal() {
        if (currentModalProductId) {
            fetch('/api/cart/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentModalProductId })
            }).then(() => {
                showToastMobile('Товар добавлен в корзину', false);
                closeProductModal();
            });
        }
    }
    
    function toggleFavoriteFromModal() {
        if (currentModalProductId) {
            fetch('/api/favorites/toggle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentModalProductId })
            }).then(() => showToastMobile('Избранное обновлено', false));
        }
    }
    
    function playModalPreview() {
        const audioFile = document.getElementById('productModalAudio').innerText;
        if (audioFile) {
            if (currentAudio) currentAudio.pause();
            currentAudio = new Audio('/audio/' + audioFile);
            currentAudio.play();
        }
    }
    
    function openReviewModal() {
        reviewProductId = currentModalProductRealId;
        reviewSelectedRating = 0;
        document.querySelectorAll('#reviewStars i').forEach(star => {
            star.className = 'far fa-star';
        });
        document.getElementById('reviewComment').value = '';
        document.getElementById('reviewModal').classList.add('active');
    }
    
    function closeReviewModal() {
        document.getElementById('reviewModal').classList.remove('active');
    }
    
    document.querySelectorAll('#reviewStars i').forEach(star => {
        star.addEventListener('click', function() {
            reviewSelectedRating = parseInt(this.dataset.rating);
            document.querySelectorAll('#reviewStars i').forEach((s, idx) => {
                if (idx < reviewSelectedRating) s.className = 'fas fa-star';
                else s.className = 'far fa-star';
            });
        });
    });
    
    function submitReview() {
        if (!reviewSelectedRating) {
            showToastMobile('Выберите оценку!', true);
            return;
        }
        const comment = document.getElementById('reviewComment').value;
        fetch('/api/rating/' + reviewProductId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating: reviewSelectedRating, comment: comment })
        }).then(r => r.json()).then(data => {
            if (data.success) {
                showToastMobile('Спасибо за отзыв!', false);
                closeReviewModal();
                closeProductModal();
            }
        });
    }
    
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    
    function toggleFilters() {
        const panel = document.getElementById('filtersPanel');
        if (panel) panel.classList.toggle('open');
    }
    
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.product-card').forEach(card => {
            const audioUrl = card.dataset.audioUrl;
            if (audioUrl) setupLongPress(card, audioUrl);
        });
        
        document.querySelectorAll('.rating-stars').forEach(container => {
            const productId = container.dataset.productId;
            if (productId) {
                fetch('/api/rating/' + productId).then(r => r.json()).then(data => {
                    if (data.avg_rating) {
                        const stars = container.querySelectorAll('.star');
                        const rating = parseFloat(data.avg_rating);
                        const fullStars = Math.floor(rating);
                        const hasHalfStar = rating % 1 >= 0.5;
                        stars.forEach((star, idx) => {
                            if (idx < fullStars) star.classList.add('filled');
                            else if (idx === fullStars && hasHalfStar) star.classList.add('filled');
                            else star.classList.remove('filled');
                        });
                        const ratingValue = container.querySelector('.rating-value');
                        if (ratingValue) ratingValue.textContent = rating;
                        const votesSpan = container.querySelector('.votes-count');
                        if (votesSpan) votesSpan.textContent = '(' + data.votes_count + ')';
                    }
                });
            }
        });
    });
`;

module.exports = router;