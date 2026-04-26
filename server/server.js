require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');

// ========================================
// Configuration
// ========================================
const PORT = 3000;
const JWT_SECRET = 'tkb-secret-2026-hoanghieu';
const JWT_EXPIRES = '30d';

// ========================================
// MongoDB Connection & Schemas
// ========================================
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tkb_db';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Đã kết nối với MongoDB Cloud!'))
    .catch(err => console.error('❌ Lỗi kết nối MongoDB:', err));

// --- User Schema ---
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

userSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.password; // Do not send password in API responses
    }
});
const User = mongoose.model('User', userSchema);

// --- Schedule Schema ---
const scheduleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    periodStart: { type: Number, required: true },
    periodEnd: { type: Number, required: true },
    timeStart: { type: String, required: true },
    timeEnd: { type: String, required: true },
    room: { type: String, required: true },
    lecturer: { type: String, required: true },
    days: [{ type: Number, required: true }],
    dateFrom: { type: String, required: true },
    dateTo: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

scheduleSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
    }
});
const Schedule = mongoose.model('Schedule', scheduleSchema);


// ========================================
// Initialize Database & Seed Admin
// ========================================
async function seedAdmin() {
    try {
        const existing = await User.findOne({ email: 'admin@tkb.com' });
        if (!existing) {
            const hashed = bcrypt.hashSync('Admin@123456', 10);
            await User.create({
                email: 'admin@tkb.com',
                displayName: 'Admin',
                password: hashed,
                role: 'admin'
            });
            console.log('');
            console.log('╔══════════════════════════════════════════╗');
            console.log('║    ✅ Tài khoản Admin đã được tạo       ║');
            console.log('║    Email:    admin@tkb.com              ║');
            console.log('║    Mật khẩu: Admin@123456               ║');
            console.log('╚══════════════════════════════════════════╝');
            console.log('');
        }
    } catch (e) {
        console.error('Lỗi khi mồi tài khoản Admin:', e);
    }
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
async function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token không hợp lệ' });
    }
    try {
        const token = header.replace('Bearer ', '');
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
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
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
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
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
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
app.get('/api/users', authRequired, adminRequired, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/users', authRequired, adminRequired, async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        if (!email || !password || !displayName) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ error: 'Email này đã được sử dụng' });
        }

        const hashed = bcrypt.hashSync(password, 10);
        const newUser = await User.create({
            email: email.toLowerCase().trim(),
            displayName: displayName.trim(),
            password: hashed,
            role: 'user'
        });

        res.status(201).json(newUser);
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.delete('/api/users/:id', authRequired, adminRequired, async (req, res) => {
    try {
        const userId = req.params.id;

        // Prevent self-deletion
        if (userId === req.user.id.toString()) {
            return res.status(400).json({ error: 'Không thể xóa chính mình' });
        }

        const deleted = await User.findByIdAndDelete(userId);
        if (deleted) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ========================================
// Schedule Routes
// ========================================
app.get('/api/schedules', authRequired, async (req, res) => {
    try {
        const schedules = await Schedule.find().sort({ createdAt: 1 });
        res.json(schedules);
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.post('/api/schedules', authRequired, adminRequired, async (req, res) => {
    try {
        const { name, periodStart, periodEnd, timeStart, timeEnd, room, lecturer, days, dateFrom, dateTo } = req.body;

        if (!name || !periodStart || !periodEnd || !timeStart || !timeEnd || !room || !lecturer || !days || !dateFrom || !dateTo) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        const newSchedule = await Schedule.create({
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
            createdBy: req.user.id
        });

        res.status(201).json(newSchedule);
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.put('/api/schedules/:id', authRequired, adminRequired, async (req, res) => {
    try {
        const { name, periodStart, periodEnd, timeStart, timeEnd, room, lecturer, days, dateFrom, dateTo } = req.body;

        const updates = { updatedAt: new Date() };
        if (name !== undefined) updates.name = name.trim();
        if (periodStart !== undefined) updates.periodStart = parseInt(periodStart);
        if (periodEnd !== undefined) updates.periodEnd = parseInt(periodEnd);
        if (timeStart !== undefined) updates.timeStart = timeStart;
        if (timeEnd !== undefined) updates.timeEnd = timeEnd;
        if (room !== undefined) updates.room = room.trim();
        if (lecturer !== undefined) updates.lecturer = lecturer.trim();
        if (days !== undefined) updates.days = days;
        if (dateFrom !== undefined) updates.dateFrom = dateFrom;
        if (dateTo !== undefined) updates.dateTo = dateTo;

        const updated = await Schedule.findByIdAndUpdate(req.params.id, updates, { new: true });
        
        if (updated) {
            res.json(updated);
        } else {
            res.status(404).json({ error: 'Không tìm thấy môn học' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

app.delete('/api/schedules/:id', authRequired, adminRequired, async (req, res) => {
    try {
        const deleted = await Schedule.findByIdAndDelete(req.params.id);
        if (deleted) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Không tìm thấy môn học' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Lỗi server' });
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
