const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ========================================
// Configuration
// ========================================
const PORT = 3000;
const JWT_SECRET = 'tkb-secret-2026-hoanghieu';
const JWT_EXPIRES = '30d';
const DB_FILE = path.join(__dirname, 'database.json');

// ========================================
// Simple JSON Database
// ========================================
class JsonDB {
    constructor(filepath) {
        this.filepath = filepath;
        this.data = this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.filepath)) {
                return JSON.parse(fs.readFileSync(this.filepath, 'utf8'));
            }
        } catch (e) {
            console.error('DB load error:', e.message);
        }
        return { users: [], schedules: [] };
    }

    _save() {
        fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf8');
    }

    // --- Users ---
    getUsers() {
        return this.data.users.map(u => ({ ...u, password: undefined }));
    }

    findUserById(id) {
        return this.data.users.find(u => u.id === id);
    }

    findUserByEmail(email) {
        return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    }

    createUser(user) {
        this.data.users.push(user);
        this._save();
        return { ...user, password: undefined };
    }

    deleteUser(id) {
        const idx = this.data.users.findIndex(u => u.id === id);
        if (idx === -1) return false;
        this.data.users.splice(idx, 1);
        this._save();
        return true;
    }

    // --- Schedules ---
    getSchedules() {
        return this.data.schedules;
    }

    createSchedule(schedule) {
        this.data.schedules.push(schedule);
        this._save();
        return schedule;
    }

    updateSchedule(id, updates) {
        const idx = this.data.schedules.findIndex(s => s.id === id);
        if (idx === -1) return null;
        this.data.schedules[idx] = { ...this.data.schedules[idx], ...updates };
        this._save();
        return this.data.schedules[idx];
    }

    deleteSchedule(id) {
        const idx = this.data.schedules.findIndex(s => s.id === id);
        if (idx === -1) return false;
        this.data.schedules.splice(idx, 1);
        this._save();
        return true;
    }
}

// ========================================
// Initialize Database & Seed Admin
// ========================================
const db = new JsonDB(DB_FILE);

function seedAdmin() {
    const existing = db.findUserByEmail('admin@tkb.com');
    if (!existing) {
        const hashed = bcrypt.hashSync('Admin@123456', 10);
        db.createUser({
            id: generateId(),
            email: 'admin@tkb.com',
            displayName: 'Admin',
            password: hashed,
            role: 'admin',
            createdAt: new Date().toISOString()
        });
        console.log('');
        console.log('╔══════════════════════════════════════════╗');
        console.log('║    ✅ Tài khoản Admin đã được tạo        ║');
        console.log('║    Email:    admin@tkb.com               ║');
        console.log('║    Mật khẩu: Admin@123456                ║');
        console.log('╚══════════════════════════════════════════╝');
        console.log('');
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ========================================
// Express App Setup
// ========================================
const app = express();
app.use(cors());
app.use(express.json());

// Serve web frontend
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// Auth Middleware
// ========================================
function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token không hợp lệ' });
    }
    try {
        const token = header.replace('Bearer ', '');
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.findUserById(decoded.id);
        if (!user) return res.status(401).json({ error: 'Tài khoản không tồn tại' });
        req.user = user;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
    }
}

function adminRequired(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Chỉ Admin mới có quyền thực hiện' });
    }
    next();
}

// ========================================
// Auth Routes
// ========================================
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
    }

    const user = db.findUserByEmail(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    res.json({
        token,
        user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            role: user.role
        }
    });
});

app.get('/api/auth/me', authRequired, (req, res) => {
    res.json({
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role
    });
});

// ========================================
// User Management Routes (Admin Only)
// ========================================
app.get('/api/users', authRequired, adminRequired, (req, res) => {
    res.json(db.getUsers());
});

app.post('/api/users', authRequired, adminRequired, (req, res) => {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
        return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
    }

    if (db.findUserByEmail(email)) {
        return res.status(409).json({ error: 'Email này đã được sử dụng' });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const user = db.createUser({
        id: generateId(),
        email: email.toLowerCase().trim(),
        displayName: displayName.trim(),
        password: hashed,
        role: 'user',
        createdAt: new Date().toISOString()
    });

    res.status(201).json(user);
});

app.delete('/api/users/:id', authRequired, adminRequired, (req, res) => {
    const userId = req.params.id;

    // Prevent self-deletion
    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Không thể xóa chính mình' });
    }

    if (db.deleteUser(userId)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }
});

// ========================================
// Schedule Routes
// ========================================
app.get('/api/schedules', authRequired, (req, res) => {
    res.json(db.getSchedules());
});

app.post('/api/schedules', authRequired, adminRequired, (req, res) => {
    const { name, periodStart, periodEnd, timeStart, timeEnd, room, lecturer, days, dateFrom, dateTo } = req.body;

    if (!name || !periodStart || !periodEnd || !timeStart || !timeEnd || !room || !lecturer || !days || !dateFrom || !dateTo) {
        return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
    }

    const schedule = db.createSchedule({
        id: generateId(),
        name: name.trim(),
        periodStart: parseInt(periodStart),
        periodEnd: parseInt(periodEnd),
        timeStart,
        timeEnd,
        room: room.trim(),
        lecturer: lecturer.trim(),
        days,
        dateFrom,
        dateTo,
        createdBy: req.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    res.status(201).json(schedule);
});

app.put('/api/schedules/:id', authRequired, adminRequired, (req, res) => {
    const { name, periodStart, periodEnd, timeStart, timeEnd, room, lecturer, days, dateFrom, dateTo } = req.body;

    const updated = db.updateSchedule(req.params.id, {
        name: name?.trim(),
        periodStart: periodStart ? parseInt(periodStart) : undefined,
        periodEnd: periodEnd ? parseInt(periodEnd) : undefined,
        timeStart,
        timeEnd,
        room: room?.trim(),
        lecturer: lecturer?.trim(),
        days,
        dateFrom,
        dateTo,
        updatedAt: new Date().toISOString()
    });

    if (updated) {
        res.json(updated);
    } else {
        res.status(404).json({ error: 'Không tìm thấy môn học' });
    }
});

app.delete('/api/schedules/:id', authRequired, adminRequired, (req, res) => {
    if (db.deleteSchedule(req.params.id)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Không tìm thấy môn học' });
    }
});

// ========================================
// SPA Fallback (serve index.html for non-API routes)
// ========================================
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// ========================================
// Start Server
// ========================================
seedAdmin();

app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    let lanIP = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                lanIP = net.address;
                break;
            }
        }
    }

    console.log('🚀 Server đang chạy!');
    console.log(`   Web Admin:  http://localhost:${PORT}`);
    console.log(`   LAN (cho app): http://${lanIP}:${PORT}`);
    console.log('');
});
