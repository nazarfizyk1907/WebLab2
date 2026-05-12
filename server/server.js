const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Налаштування Middleware
app.use(cors());
app.use(bodyParser.json());

// Ініціалізація бази даних SQLite
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) {
        console.error('Помилка відкриття бази даних:', err.message);
    } else {
        console.log('Підключено до бази даних SQLite.');
        // Створення таблиці користувачів, якщо вона не існує
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            gender TEXT,
            birthdate TEXT
        )`);
		
		db.run(`CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            originalUrl TEXT,
            shortUrl TEXT,
            clicks INTEGER DEFAULT 0,
            FOREIGN KEY(userId) REFERENCES users(id)
        )`);
    }
});

// Маршрут для реєстрації користувача
app.post('/api/register', (req, res) => {
    const { name, email, password, gender, birthdate } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Будь ласка, заповніть усі обов’язкові поля' });
    }

    const sql = `INSERT INTO users (name, email, password, gender, birthdate) VALUES (?, ?, ?, ?, ?)`;
    const params = [name, email, password, gender, birthdate];

    db.run(sql, params, function (err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Користувач із таким email вже існує' });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ 
            message: 'Користувача успішно зареєстровано',
            userId: this.lastID 
        });
    });
});

// Маршрут для входу в систему
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Введіть email та пароль' });
    }

    const sql = `SELECT * FROM users WHERE email = ? AND password = ?`;
    db.get(sql, [email, password], (err, user) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (!user) {
            return res.status(401).json({ error: 'Невірний email або пароль' });
        }

        // Повертаємо дані користувача (крім пароля) для збереження на фронтенді
        const { password: _, ...userPublicData } = user;
        res.json({
            message: 'Вхід успішний',
            user: userPublicData
        });
    });
});

app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, gender, birthdate } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Ім\'я не може бути порожнім' });
    }

    const sql = `UPDATE users SET name = ?, gender = ?, birthdate = ? WHERE id = ?`;
    db.run(sql, [name, gender, birthdate, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Дані профілю успішно оновлено' });
    });
});

app.get('/api/links/:userId', (req, res) => {
    const sql = 'SELECT * FROM links WHERE userId = ? ORDER BY id DESC';
    db.all(sql, [req.params.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/links', (req, res) => {
    const { userId, originalUrl } = req.body;

    if (!userId || !originalUrl) {
        return res.status(400).json({ error: 'Бракує даних для створення посилання' });
    }

    const shortCode = Math.random().toString(36).substring(2, 8);

    const sql = 'INSERT INTO links (userId, originalUrl, shortUrl) VALUES (?, ?, ?)';
    db.run(sql, [userId, originalUrl, shortCode], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({ 
            id: this.lastID, 
            userId, 
            originalUrl, 
            shortUrl: shortCode, 
            clicks: 0 
        });
    });
});

app.get('/r/:shortCode', (req, res) => {
    const shortCode = req.params.shortCode;
    
    // Шукаємо посилання за коротким кодом
    const sql = 'SELECT * FROM links WHERE shortUrl = ?';
    db.get(sql, [shortCode], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).send('Посилання не знайдено');

        // Якщо знайшли — збільшуємо лічильник кліків на 1
        db.run('UPDATE links SET clicks = clicks + 1 WHERE id = ?', [row.id], (updateErr) => {
            if (updateErr) console.error('Помилка оновлення кліків:', updateErr);
            
            // Перенаправляємо користувача на оригінальний URL
            res.redirect(row.originalUrl);
        });
    });
});

app.get('/api/users/:id/stats', (req, res) => {
    const userId = req.params.id;
    
    // Рахуємо загальну кількість посилань та суму всіх кліків користувача
    const sql = 'SELECT COUNT(id) as totalLinks, SUM(clicks) as totalClicks FROM links WHERE userId = ?';
    db.get(sql, [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.json({
            totalLinks: row.totalLinks || 0,
            totalClicks: row.totalClicks || 0 // Якщо посилань немає, SUM поверне null, тому ставимо 0
        });
    });
});

app.delete('/api/links/:id', (req, res) => {
    const sql = 'DELETE FROM links WHERE id = ?';
    db.run(sql, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Посилання видалено' });
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер працює на http://localhost:${PORT}`);
});