require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const engine = require('ejs-mate');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const dayjs = require('dayjs');
const helmet = require('helmet');
const crypto = require('crypto');


// Models
const Users = require('./model/user');
const Allergy = require('./model/allergy');
const Stocks = require('./model/stocks');
const Logs = require('./model/log');
const Visits = require('./model/visit');
const Complaint = require('./model/complaint');
const Dispense = require('./model/dispense');
const Notification = require('./model/notification');

// Auth Middleware
const isLogin = require('./middleware/isLogin');

// Data Table Middlewares
const isAdmin = require('./middleware/isAdmin');
const isUsers = require('./middleware/isUsers');
const isStocks = require('./middleware/isStocks');
const isLogs = require('./middleware/isLogs');
const isVisit = require('./middleware/isVisit');
const isRequest = require('./middleware/isRequest');
const itsVisit = require('./middleware/itsVisit');

// Archive Middlewares (For your archive/history pages)
const isArchiveAdmin = require('./middleware/isArchiveAdmin');
const isArchiveStock = require('./middleware/isArchiveStock');
const isArchiveUser = require('./middleware/isArchiveUser');
const isArchiveVisit = require('./middleware/isArchiveVisit');

const app = express();
const PORT = process.env.PORT;
process.env.TZ = "Asia/Manila";

// Database Connection to!
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ AuCare DB Access Granted'))
    .catch(err => console.error('❌ AuCare DB Access Denied, Why? :', err));

// Setup ng Session
const store = new MongoDBStore({
    uri: process.env.MONGO_URI,
    collection: 'sessions'
});

store.on('error', (error) => {
    console.error('Naku, Aray mo Session store error:', error);
});

// Mga Middleware
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '0',
    etag: true
}));

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
    app.set('trust proxy', 1);
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'aucare2026',
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
        secure: isProduction,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24
    }
}));


// Helmet security middleware
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://kit.fontawesome.com",
                "https://ka-f.fontawesome.com",
                "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js",
                "https://cdn.sheetjs.com/*"
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://ka-f.fontawesome.com"
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com",
                "https://cdn.jsdelivr.net",
                "https://ka-f.fontawesome.com"
            ],
            imgSrc: [
                "'self'",
                "data:",
                "https://res.cloudinary.com",
            ],
            connectSrc: [
                "'self'",
                "https://ka-f.fontawesome.com",
                "https://cdn.jsdelivr.net"
            ],
            objectSrc: ["'none'"],
            frameSrc: ["'self'"],
        }
    })
);


app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

app.use((req, res, next) => {
    console.log(`ID Session ID: ${req.sessionID}`);
    next();
});


app.use((req, res, next) => {
    try {
        if (req.session && req.session.user) {
            // Only expose safe user data to EJS (avoid password or other sensitive fields)
            const { _id, id, username, email, role } = req.session.user;
            res.locals.user = { _id, id, username, email, role };
        } else {
            res.locals.user = null;
        }
    } catch (err) {
        console.error('⚠️ Error setting res.locals.user:', err);
        res.locals.user = null;
    }
    next();
});

const flash = require('connect-flash');
const { truncate } = require('fs/promises');

app.use(flash());

app.use((req, res, next) => {
    res.locals.messageSuccess = req.flash('messageSuccess');
    res.locals.messagePass = req.flash('messagePass');
    next();
});

// Global variables na ipapasok sa lahat ng page
app.use((req, res, next) => {
    // Transfer any session messages to res.locals (so they show in EJS)

    res.locals.back = '';
    res.locals.active = '';
    res.locals.error = req.session.error || null;
    res.locals.message = req.session.message || null;
    res.locals.warning = req.session.warning || null;
    res.locals.success = req.session.success || null;
    res.locals.denied = req.session.denied || null;

    // Always include the user if logged in
    res.locals.user = req.session.user || null;

    // Clear messages after showing them once (like flash messages)
    req.session.error = null;
    req.session.message = null;
    req.session.warning = null;
    req.session.success = null;
    req.session.denied = null;

    console.log(`🌀 Global variables ready `);
    next();
});
// Request Count Badge (para sa bilog sa sidebar)
app.use(async (req, res, next) => {
    try {
        if (req.session && req.session.user) {
            res.locals.requestCount = await Visits.countDocuments({
                archive: false,
                verify: true,
                status: 'Pending'
            });
        } else {
            res.locals.requestCount = 0;
        }
    } catch (err) {
        console.error('Request Count Error:', err.message);
        res.locals.requestCount = 0;
    }
    next();
});

// Pending Account Count Badge (para sa bilog sa "Pending Account" button)
app.use(async (req, res, next) => {
    try {
        if (req.session && req.session.user) {
            res.locals.pendingCount = await Users.countDocuments({
                verify: true,
                archive: false
            });
        } else {
            res.locals.pendingCount = 0;
        }
    } catch (err) {
        console.error('Pending Count Error:', err.message);
        res.locals.pendingCount = 0;
    }
    next();
});

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'audres25', // your folder in Cloudinary
        resource_type: 'auto',
        public_id: `${Date.now()}-${file.originalname}`
    })
});

// Create multer middleware
const upload = multer({
    storage,
    limits: { fileSize: 524288000 }, // 500MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed!"));
        }
        cb(null, true);
    }
});

const cpUpload = upload.any();

const photoStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'audres25', // your folder in Cloudinary
        resource_type: 'auto',
        public_id: `${Date.now()}-${file.originalname}`
    })
});

// Multer middleware for single file upload
const uploadPhoto = multer({
    storage: photoStorage,
    limits: { fileSize: 524288000 }, // 500MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files allowed!"));
        }
        cb(null, true);
    }
});

// routes

app.get('/', async (req, res) => {
    res.render('index');
});

app.post('/login', async (req, res) => {
    try {
        const { email, password, captcha_input, captcha_expected } = req.body;

        if (!captcha_input || captcha_input !== captcha_expected) {
            req.session.error = "Captcha is incorrect. Please try again.";
            return req.session.save(() => res.redirect('/'));
        }

        if (!email || !password) {
            req.session.error = "Please provide both email and password.";
            return req.session.save(() => res.redirect('/'));
        }

        const user = await Users.findOne({ email: email.trim().toLowerCase(), archive: false });

        if (!user || user.password !== password) {
            req.session.error = "Invalid email or password.";
            return req.session.save(() => res.redirect('/'));
        }

        if (user.verify === true) {
            req.session.error = "Your account is still pending admin approval. Please wait for confirmation via email.";
            return req.session.save(() => res.redirect('/'));
        }

        if (user.suspend) {
            req.session.error = "Your account has been suspended.";
            return req.session.save(() => res.redirect('/'));
        }

        req.session.user = user;

        await Logs.create({
            who: user._id,
            what: `User logged into the system: ${user.username}`,
            archive: false
        });

        req.session.save(() => {
            // Still on the temporary password issued at approval — force a change first.
            if (user.reset) {
                if (['Super Admin', 'Admin'].includes(user.role)) {
                    return res.redirect('/p?forcePasswordChange=1');
                }
                if (['Sub Admin'].includes(user.role)) {
                    return res.redirect('/p?forcePasswordChange=1');
                }
                if (['Student'].includes(user.role)) {
                    return res.redirect('/p?forcePasswordChange=1');
                }
                return res.redirect('/p?forcePasswordChange=1');
            }
            if (['Super Admin', 'Admin'].includes(user.role)) {
                return res.redirect('/d');
            } else if (['Sub Admin'].includes(user.role)) {
                return res.redirect('/r');
            } else if (['Student'].includes(user.role)) {
                return res.redirect('/h');
            } else {
                return res.redirect('/h');
            }
        });

    } catch (err) {
        console.error('Login Error:', err.message);
        req.session.error = "An error occurred during login.";
        req.session.save(() => res.redirect('/'));
    }
});


app.get('/h', isLogin, async (req, res) => {
    try {
        const recentVisits = await Visits.find({
            patient: req.session.user._id,
            archive: false
        })
            .sort({ createdAt: -1 })
            .limit(3);

        // Check kung may pending pa (hindi pa Attended) na request ngayong araw
        const startOfDay = dayjs().startOf('day').toDate();
        const endOfDay = dayjs().endOf('day').toDate();

        const activeVisit = await Visits.findOne({
            patient: req.session.user._id,
            archive: false,
            status: { $ne: 'Attended' },
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        });

        // Check kung bukas ang clinic ngayon (7:30 AM - 5:30 PM)
        const now = dayjs();
        const openTime = dayjs().hour(7).minute(30).second(0);
        const closeTime = dayjs().hour(17).minute(30).second(0);
        const isClinicOpen = now.isAfter(openTime) && now.isBefore(closeTime);

        res.render('home', {
            title: 'Home',
            active: 'h',
            recentVisits,
            hasActiveVisit: !!activeVisit,
            isClinicOpen
        });

    } catch (err) {
        console.error('Home Fetch Error:', err.message);
        res.render('home', { title: 'Home', active: 'h', recentVisits: [], hasActiveVisit: false, isClinicOpen: false });
    }
});

app.get('/d', isLogin, async (req, res) => {
    res.render('dashboard', { title: 'Dashboard', active: 'd' });
});

app.get('/r', isRequest, isLogin, async (req, res) => {
    res.render('request', { title: 'Request', active: 'r' });
});

app.get('/st', isLogin, isStocks, async (req, res) => {
    res.render('stocks', {
        title: 'Stocks',
        active: 'st',
        stocks: res.locals.stocks || [],
        lowStocks: res.locals.lowStocks || [],
        outOfStocks: res.locals.outOfStocks || [],
        medicines: res.locals.medicines || [],
        supplies: res.locals.supplies || []
    });
});

app.get('/s', async (req, res) => {
    res.render('sign', { title: 'Sign', active: 's' });
});

app.get('/hp', async (req, res) => {
    res.render('help', { title: 'Help', active: 'hp' });
});

app.get('/f', async (req, res) => {
    res.render('forgot', { title: 'Forgot Password', active: 'f' });
});

app.get('/vs', isLogin, async (req, res) => {
    res.render('VisitSubmit', { title: 'Visit Submit', active: 'v' });
});

app.get('/v1', isLogin, async (req, res) => {
    res.render('visit1', { title: 'Visit1', active: 'v1' });
});

app.get('/vv1/:id', isLogin, async (req, res) => {
    try {
        const visit = await Visits.findOne({
            _id: req.params.id,
            patient: req.session.user._id, // para hindi makita ng ibang user ang record mo
            archive: false
        });

        if (!visit) {
            req.session.error = "Visit record not found.";
            return req.session.save(() => res.redirect('/h'));
        }

        const complaints = await Complaint.find({ visitId: visit._id });
        const medicines = await Dispense.find({ visitId: visit._id });

        res.render('VisitView1', {
            title: 'Visit View1',
            active: 'v1',
            visit,
            complaints,
            medicines
        });

    } catch (err) {
        console.error('VisitView1 Fetch Error:', err.message);
        req.session.error = "Failed to load visit details.";
        res.redirect('/h');
    }
});

app.get('/p', isLogin, async (req, res) => {
    res.render('profile', { title: 'Profile', active: 'p' });
});

app.get('/v2', isVisit, isLogin, isUsers, async (req, res) => {
    res.render('visit2', { title: 'Visit2', active: 'v2' });
});

app.get('/vv2/:id', isLogin, itsVisit, async (req, res) => {
    res.render('VisitView2', { title: 'Visit Details', active: 'v2' });
});

app.get('/nv', isLogin, async (req, res) => {
    res.render('NewVisit', { title: 'New Visit', active: 'v2' });
});

app.get('/va', isArchiveVisit, isLogin, async (req, res) => {
    res.render('VisitArchive', { title: 'Visit Archive', active: 'v2' });
});

app.get('/e', isAdmin, isLogin, async (req, res) => {
    res.render('employee', { title: 'Employee', active: 'e' });
});

app.get('/ne', isLogin, async (req, res) => {
    res.render('NewEmployee', { title: 'New Employee', active: 'e' });
});

app.get('/ea', isArchiveAdmin, isLogin, async (req, res) => {
    res.render('EmployeeArchive', { title: 'Employee Archive', active: 'e' });
});

app.get('/um', isUsers, isLogin, async (req, res) => {
    res.render('UserManagement', { title: 'User Management', active: 'um' });
});

app.get('/uv/:id', isLogin, async (req, res) => {
    try {
        const patient = await Users.findOne({
            _id: req.params.id,
            archive: false
        }).lean();

        if (!patient) {
            req.session.error = "User not found.";
            return req.session.save(() => res.redirect('/um'));
        }

        const dob = (patient.bMonth && patient.bDay && patient.bYear)
            ? `${patient.bMonth}/${patient.bDay}/${patient.bYear}`
            : 'N/A';

        res.render('userView', {
            title: 'userView',
            active: 'um',
            patient,
            dob
        });

    } catch (err) {
        console.error('UserView Fetch Error:', err.message);
        req.session.error = "Failed to load user details.";
        res.redirect('/um');
    }
});

app.get('/ua', isArchiveUser, isLogin, async (req, res) => {
    res.render('UserArchive', { title: 'User Archive', active: 'um' });
});

app.get('/nu', isLogin, async (req, res) => {
    res.render('NewUser', { title: 'New User', active: 'um' });
});

app.get('/l', isLogs, isLogin, async (req, res) => {
    res.render('logs', { title: 'Logs', active: 'l' });
});

app.get('/otp', async (req, res) => {
    res.render('otp', { title: 'Otp', active: 'otp' });
});

app.get('/ih', async (req, res) => {
    res.render('Inventoryhistory', { title: 'Inventoryhistory', active: 'ih' });
});

app.get('/pd', isLogin, async (req, res) => {
    try {
        const pendingUsers = await Users.find({ verify: true, archive: false }).sort({ createdAt: -1 });
        res.render('pending', { title: 'Pending Accounts', active: 'pd', pendingUsers });
    } catch (err) {
        console.error('Pending Fetch Error:', err.message);
        req.session.error = "Failed to load pending accounts.";
        res.redirect('/d');
    }
});

app.get('/p2', async (req, res) => {
    res.render('profile2', { title: 'profile2', active: 'p2' });
});

app.get('/np', isLogin, async (req, res) => {
    try {
        const notifications = await Notification.find({
            who: req.session.user._id,
            archive: false
        }).sort({ createdAt: -1 });

        console.log(JSON.stringify(notifications, null, 2));

        res.render('notifpage', {
            title: 'notifpage',
            active: 'np',
            notifications
        });
    } catch (err) {
        console.error('Notification Fetch Error:', err.message);
        res.render('notifpage', { title: 'notifpage', active: 'np', notifications: [] });
    }
});

app.get('/sa', isLogin, async (req, res) => {
    try {
        const allVisits = await Visits.find({
            patient: req.session.user._id,
            archive: false
        }).sort({ createdAt: -1 });

        const now = dayjs();
        const openTime = dayjs().hour(7).minute(30).second(0);
        const closeTime = dayjs().hour(17).minute(30).second(0);
        const isClinicOpen = now.isAfter(openTime) && now.isBefore(closeTime);

        const startOfDay = dayjs().startOf('day').toDate();
        const endOfDay = dayjs().endOf('day').toDate();

        const activeVisit = await Visits.findOne({
            patient: req.session.user._id,
            archive: false,
            status: { $ne: 'Attended' },
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        });

        res.render('SeeAll', {
            title: 'SeeAll',
            active: 'sa',
            allVisits,
            hasActiveVisit: !!activeVisit,
            isClinicOpen
        });
    } catch (err) {
        console.error('SeeAll Fetch Error:', err.message);
        res.render('SeeAll', { title: 'SeeAll', active: 'sa', allVisits: [], hasActiveVisit: false, isClinicOpen: false });
    }
});


app.post('/api/notifications/read/:id', isLogin, async (req, res) => {
    try {
        const notif = await Notification.findOneAndUpdate(
            { _id: req.params.id, who: req.session.user._id },
            { read: true },
            { new: true }
        );
        if (!notif) return res.json({ success: false, message: 'Notification not found.' });
        res.json({ success: true, link: notif.link || '/h' });
    } catch (err) {
        console.error('Mark Notification Read Error:', err.message);
        res.json({ success: false, message: 'Failed to mark as read.' });
    }
});

app.post('/new-employee', isLogin, async (req, res) => {
    try {

        console.log('BODY RECEIVED:', req.body); // TEMPORARY DEBUG LINE

        const { role, fName, mName, lName, xName, email, schoolId, eName, eAddress, ePhone } = req.body;

        if (!role || !fName || !lName || !email) {
            req.session.error = "Please fill in all required fields.";
            return req.session.save(() => res.redirect('/ne'));
        }

        const normalizedEmail = email.trim().toLowerCase();

        const emailExist = await Users.findOne({ email: normalizedEmail });
        if (emailExist) {
            req.session.error = "That email is already registered.";
            return req.session.save(() => res.redirect('/ne'));
        }

        const tempPassword = crypto.randomBytes(4).toString('hex');

        const newEmployee = await Users.create({
            fName, mName, lName, xName,
            role,
            email: normalizedEmail,
            username: normalizedEmail,
            schoolId,
            eName,
            ePhone,
            eAddress,
            password: tempPassword,
            archive: false,
            verify: false,
            verifyAt: Date.now(),
            isVerify: req.session.user.username,
            suspend: false,
            access: 0,
            reset: true,
            dump: false
        });

        await Logs.create({
            who: req.session.user._id,
            what: `Created new employee account: ${newEmployee.username} (${newEmployee.fName} ${newEmployee.lName})`,
            archive: false
        });

        const mailOptions = {
            from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
            to: newEmployee.email,
            subject: "Your AuCare Employee Account",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #0056b3; text-align: center;">Account Created</h2>
                    <p>Hello ${newEmployee.fName},</p>
                    <p>An AuCare employee account has been created for you. Log in using your email and the temporary password below:</p>
                    <p><strong>Email (Username):</strong> ${newEmployee.email}</p>
                    <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 4px;">
                        ${tempPassword}
                    </div>
                    <p style="color: red;">You'll be required to set a new password immediately after logging in.</p>
                </div>`
        };
        await transporter.sendMail(mailOptions);

        req.session.success = `Employee account for "${newEmployee.fName} ${newEmployee.lName}" has been created.`;
        req.session.save(() => res.redirect('/e'));

    } catch (err) {
        console.error('New Employee Error:', err.message);
        req.session.error = "Failed to create employee account. " + err.message;
        req.session.save(() => res.redirect('/e'));
    }
});






app.get('/seed-admins', async (req, res) => {
    try {
        const adminAccounts = [
            {
                fName: "Super",
                lName: "Admin",
                eName: "SuperAdmin",
                username: "superadmin",
                email: "superadmin@aucare.com",
                password: "password123",
                role: "Super Admin",
                dump: true,
                archive: false,
                verify: false,
                suspend: false
            },
            {
                fName: "Aren",
                lName: "Pascual",
                eName: "arenpascual",
                username: "aren123",
                email: "aren@aucare.com",
                password: "arenpo123",
                role: "Student",
                dump: true,
                archive: false,
                verify: false,
                suspend: false
            },
            {
                fName: "System",
                lName: "Admin",
                eName: "SysAdmin",
                username: "admin",
                email: "admin@aucare.com",
                password: "password123",
                role: "Admin",
                dump: true,
                archive: false,
                verify: false,
                suspend: false
            },
            {
                fName: "Support",
                lName: "Admin",
                eName: "SubAdmin",
                username: "subadmin",
                email: "subadmin@aucare.com",
                password: "password123",
                role: "Sub Admin",
                dump: true,
                archive: false,
                verify: false,
                suspend: false
            }
        ];

        await Users.insertMany(adminAccounts);
        res.send("Successfully inserted 3 Admin accounts with plain text passwords.");
    } catch (err) {
        console.error("Seeding Error:", err.message);
        res.status(500).send(`Seeding Error: ${err.message}`);
    }
});

const nodemailer = require('nodemailer');

// Configure the transporter using your .env credentials
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

app.post('/api/verify-email', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required." });

    try {
        // 1. Find the user in your MongoDB Users model
        const user = await Users.findOne({
            email: email.trim().toLowerCase(),
            archive: false
        });

        if (!user) {
            return res.status(404).json({ message: "That email is not registered with AuCare." });
        }

        // 2. Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. Store OTP and Email in session for verification on the /otp page
        req.session.otpCode = otp;
        req.session.resetEmail = user.email;
        req.session.otpExpires = Date.now() + 600000; // Code valid for 10 mins

        // 4. Send the Email
        const mailOptions = {
            from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your AuCare Verification Code",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #0056b3; text-align: center;">AuCare Verification</h2>
                    <p>Hello,</p>
                    <p>You requested a password reset. Please use the following code:</p>
                    <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                        ${otp}
                    </div>
                    <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
                </div>`
        };

        await transporter.sendMail(mailOptions);

        // 5. Send success back to your frontend script
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("Forgot Password Error:", error);
        res.status(500).json({ message: "Failed to send verification email." });
    }
});

// Route para i-verify ang OTP code
app.post('/api/verify-otp', async (req, res) => {
    const { otp } = req.body;
    const sessionOtp = req.session.otpCode;
    const expiry = req.session.otpExpires;
    const userEmail = req.session.resetEmail; // Sinave natin ito sa /verify-email route

    // 1. Validations
    if (!sessionOtp || !userEmail) {
        return res.status(400).json({ message: "Session expired. Please start over." });
    }
    if (Date.now() > expiry) {
        return res.status(400).json({ message: "OTP has expired." });
    }
    if (otp !== sessionOtp) {
        return res.status(400).json({ message: "Invalid OTP code." });
    }

    try {
        // 2. Generate Random Temporary Password (8 characters)
        const tempPassword = crypto.randomBytes(4).toString('hex');

        // 3. Update User Password sa MongoDB
        // TANDAAN: Kung gumagamit ka ng bcrypt, i-hash mo muna ang tempPassword bago i-save.
        // Pero base sa code mo kanina, plain text ang gamit mo (user.password === password)
        const updatedUser = await Users.findOneAndUpdate(
            { email: userEmail },
            {
                password: tempPassword,
                reset: true
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found." });
        }

        // 4. Send the Temporary Password to Email
        const mailOptions = {
            from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: "Your Temporary Password - AuCare",
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd;">
                    <h2 style="color: #0056b3;">Password Reset Successful</h2>
                    <p>Your password has been reset. Use the temporary password below to log in:</p>
                    <div style="background: #fdfdfd; padding: 10px; border: 1px dashed #ccc; font-size: 20px; text-align: center; font-weight: bold;">
                        ${tempPassword}
                    </div>
                    <p style="color: red;">Important: Please change this password immediately after logging in for your security.</p>
                    <br>
                    
                </div>`
        };

        await transporter.sendMail(mailOptions);

        // 5. Clean up session
        req.session.otpCode = null;
        req.session.otpExpires = null;
        // Keep req.session.resetEmail temporarily if needed for the success page

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error("OTP Success Error:", error);
        res.status(500).json({ message: "Something went wrong while resetting your password." });
    }
});

// Route para sa Success Page
app.get('/success', (req, res) => {
    res.render('successOtp', { title: 'Success', active: 'f' });
});

// ============================================================
// CHANGE PASSWORD (Logged-in User) - OTP Verification
// ============================================================

// Step 1: Send / Resend OTP papunta sa email ng naka-login na user
app.post('/api/account/send-password-otp', isLogin, async (req, res) => {
    try {
        const user = await Users.findById(req.session.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        req.session.changePassOtp = otp;
        req.session.changePassOtpExpires = Date.now() + 600000; // 10 minutes

        const mailOptions = {
            from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your AuCare Password Change Verification Code",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #0056b3; text-align: center;">Password Change Verification</h2>
                    <p>Hello ${user.fName},</p>
                    <p>You requested to change your password. Please use the following code:</p>
                    <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                        ${otp}
                    </div>
                    <p>This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
                </div>`
        };

        await transporter.sendMail(mailOptions);

        return res.status(200).json({ success: true, message: "OTP sent to your email." });

    } catch (err) {
        console.error('Send Change-Password OTP Error:', err.message);
        res.status(500).json({ success: false, message: "Failed to send OTP." });
    }
});

// Step 2: I-verify ang OTP + i-update ang password
app.post('/api/account/verify-password-otp', isLogin, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword, otp } = req.body;

        const sessionOtp = req.session.changePassOtp;
        const expiry = req.session.changePassOtpExpires;

        if (!sessionOtp) {
            return res.status(400).json({ success: false, message: "No OTP request found. Please click Get OTP." });
        }
        if (Date.now() > expiry) {
            return res.status(400).json({ success: false, message: "OTP has expired. Please request a new code." });
        }
        if (!otp || otp !== sessionOtp) {
            return res.status(400).json({ success: false, message: "Invalid OTP code." });
        }

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: "Please fill in all password fields." });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "New password and confirm password do not match." });
        }

        const passwordRules = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRules.test(newPassword)) {
            return res.status(400).json({ success: false, message: "Password does not meet the requirements." });
        }

        const user = await Users.findById(req.session.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (user.password !== currentPassword) {
            return res.status(400).json({ success: false, message: "Current password is incorrect." });
        }

        user.password = newPassword; s
        user.reset = false;
        await user.save();

        req.session.user.password = newPassword;
        req.session.user.reset = false;   // ⬅️ IDAGDAG ITO — kulang ito dati

        await Logs.create({
            who: user._id,
            what: `User changed their password: ${user.username}`,
            archive: false
        });

        req.session.changePassOtp = null;
        req.session.changePassOtpExpires = null;

        req.session.save(() => {
            return res.status(200).json({ success: true, message: "Password updated successfully." });
        });

    } catch (err) {
        console.error('Verify Change-Password OTP Error:', err.message);
        res.status(500).json({ success: false, message: "Failed to update password." });
    }
});

// BAGONG ROUTE — para sa first-time forced password reset (walang OTP)
app.post('/api/account/reset-temp-password', isLogin, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, message: "Please fill in all password fields." });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, message: "New password and confirm password do not match." });
        }

        const passwordRules = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>])(?=.*[A-Za-z])(?=.*\d).{8,}$/;
        if (!passwordRules.test(newPassword)) {
            return res.status(400).json({ success: false, message: "Password does not meet the requirements." });
        }

        const user = await Users.findById(req.session.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (user.password !== currentPassword) {
            return res.status(400).json({ success: false, message: "Temporary password is incorrect." });
        }

        if (!user.reset) {
            return res.status(400).json({ success: false, message: "This action is not allowed." });
        }

        // Update database
        user.password = newPassword; // Remind: Recommended to hash this with bcrypt
        user.reset = false;
        await user.save();

        // Update session state
        req.session.user.password = newPassword;
        req.session.user.reset = false;

        await Logs.create({
            who: user._id,
            what: `User set new password after temp password reset: ${user.username}`,
            archive: false
        });

        // Determine Redirect URL based on Role
        let redirect = "/h";
        if (['Super Admin', 'Admin'].includes(user.role)) {
            redirect = "/d";
        } else if (['Sub Admin'].includes(user.role)) {
            redirect = "/r";
        } else if (['Student'].includes(user.role)) {
            redirect = "/h";
        }

        // Save session before sending response
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ success: false, message: "Session update failed." });
            }
            return res.status(200).json({ success: true, redirect });
        });

    } catch (err) {
        console.error('Reset Temp Password Error:', err.message);
        res.status(500).json({ success: false, message: "Failed to update password." });
    }
});

// ============================================================
// STOCKS API ROUTES  — paste these into your app.js
// (add after your existing routes, before the 404 handler)
// ============================================================

// ─── GET: Archive Page ──────────────────────────────────────
app.get('/sta', isArchiveStock, isLogin, async (req, res) => {
    res.render('stocksArchive', { title: 'Archive Stocks', active: 'st' });
});

// POST: Add New Stock
app.post('/api/stocks/add', isLogin, async (req, res) => {
  try {
    const {
      name, type, unit, remaining, description,
      brandName, isLocal, medicineForm, dosageStrength,
      category, sizeSpecification, expirationDate
    } = req.body;

    if (!name || !type || !unit || remaining === undefined) {
      req.session.error = 'Please fill in all required fields.';
      return req.session.save(() => res.redirect('/st'));
    }

    const newStock = await Stocks.create({
      name: name.trim(),
      type: type,
      unit: unit.trim(),
      remaining: Number(remaining),
      description: description ? description.trim() : '',
      genericName: name.trim(),
      brandName: brandName ? brandName.trim() : '',
      isLocal: isLocal === 'true' || isLocal === true,
      medicineForm: medicineForm || '',
      dosageStrength: dosageStrength ? dosageStrength.trim() : '',
      category: category || '',
      sizeSpecification: sizeSpecification ? sizeSpecification.trim() : '',
      expirationDate: expirationDate ? new Date(expirationDate) : null,
      archive: false
    });

    await Logs.create({
      who: req.session.user._id,
      what: `Added new stock item: ${newStock.name} (${newStock.type}) ${newStock.remaining} ${newStock.unit}`,
      archive: false
    });

    req.session.success = `"${newStock.name}" has been added to stocks.`;
    req.session.save(() => res.redirect('/st'));
  } catch (err) {
    console.error('Add Stock Error:', err.message);
    req.session.error = 'Failed to add item. Please try again.';
    req.session.save(() => res.redirect('/st'));
  }
});

// POST: Edit/Update Stock
app.post('/api/stocks/edit/:id', isLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, type, unit, remaining, description,
      brandName, isLocal, medicineForm, dosageStrength,
      category, sizeSpecification, expirationDate
    } = req.body;

    const updated = await Stocks.findByIdAndUpdate(id, {
      name: name.trim(),
      type: type,
      unit: unit.trim(),
      remaining: Number(remaining),
      description: description ? description.trim() : '',
      genericName: name.trim(),
      brandName: brandName ? brandName.trim() : '',
      isLocal: isLocal === 'true' || isLocal === true,
      medicineForm: medicineForm || '',
      dosageStrength: dosageStrength ? dosageStrength.trim() : '',
      category: category || '',
      sizeSpecification: sizeSpecification ? sizeSpecification.trim() : '',
      expirationDate: expirationDate ? new Date(expirationDate) : null
    }, { new: true });

    if (!updated) {
      req.session.error = 'Item not found.';
      return req.session.save(() => res.redirect('/st'));
    }

    await Logs.create({
      who: req.session.user._id,
      what: `Updated stock item: ${updated.name} now ${updated.remaining} ${updated.unit}`,
      archive: false
    });

    req.session.success = `"${updated.name}" has been updated.`;
    req.session.save(() => res.redirect('/st'));
  } catch (err) {
    console.error('Edit Stock Error:', err.message);
    req.session.error = 'Failed to update item.';
    req.session.save(() => res.redirect('/st'));
  }
});

// ─── POST: Archive Stock (JSON response for fetch()) ────────
app.post('/api/stocks/archive/:id', isLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Stocks.findByIdAndUpdate(id, { archive: true }, { new: true });

        if (!item) return res.json({ success: false, message: 'Item not found.' });

        await Logs.create({
            who: req.session.user._id,
            what: `Archived stock item: ${item.name}`,
            archive: false
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Archive Stock Error:', err.message);
        res.json({ success: false, message: 'Failed to archive item.' });
    }
});

// ─── POST: Restore Stock from Archive ───────────────────────
app.post('/api/stocks/restore/:id', isLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Stocks.findByIdAndUpdate(id, { archive: false }, { new: true });

        if (!item) return res.json({ success: false, message: 'Item not found.' });

        await Logs.create({
            who: req.session.user._id,
            what: `Restored stock item from archive: ${item.name}`,
            archive: false
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Restore Stock Error:', err.message);
        res.json({ success: false, message: 'Failed to restore item.' });
    }
});

// ─── POST: Permanently Delete Stock ─────────────────────────
app.post('/api/stocks/delete/:id', isLogin, async (req, res) => {
    try {
        const { id } = req.params;
        const item = await Stocks.findByIdAndDelete(id);

        if (!item) return res.json({ success: false, message: 'Item not found.' });

        await Logs.create({
            who: req.session.user._id,
            what: `Permanently deleted stock item: ${item.name}`,
            archive: false
        });

        res.json({ success: true });
    } catch (err) {
        console.error('Delete Stock Error:', err.message);
        res.json({ success: false, message: 'Failed to delete item.' });
    }
});

app.post('/visitnow', async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { concern, complaint, item, qty } = req.body;

         //0a. I-check kung bukas pa ang clinic (7:30 AM - 5:30 PM)
        const now = dayjs();
        const openTime = dayjs().hour(7).minute(30).second(0);
        const closeTime = dayjs().hour(17).minute(30).second(0);

        if (now.isBefore(openTime) || now.isAfter(closeTime)) {
            req.session.error = "The clinic is currently closed. Clinic hours are 7:30 AM to 5:30 PM.";
            return req.session.save(() => res.redirect('/h'));
        }

        // 0b. I-check kung may pending pa (hindi Attended) na request ngayong araw
        const startOfDay = dayjs().startOf('day').toDate();
        const endOfDay = dayjs().endOf('day').toDate();

        const existingVisit = await Visits.findOne({
            patient: userId,
            archive: false,
            status: { $ne: 'Attended' },
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        });

        if (existingVisit) {
            req.session.error = "You already have a pending visit request today. Please wait until it's attended before submitting another.";
            return req.session.save(() => res.redirect('/h'));
        }

        // 1. I-save ang Visit (Mother Record)
        // Gumamit tayo ng default string kung sakaling walang complaint para hindi mag-error ang model validation
        const newVisit = new Visits({
            patient: userId,
            concern: concern || "Health Consultation",
            complaint: complaint || "No specific complaint",
            status: 'Pending',
            archive: false,
            verify: true
        });
        const savedVisit = await newVisit.save();

        // 2. I-save ang Complaint sa sariling collection (kung may input ang user)
        if (complaint && complaint.trim() !== "") {
            const newComplaint = new Complaint({
                visitId: savedVisit._id,
                type: complaint
            });
            await newComplaint.save();
        }

        // 3. I-save sa Dispense collection kung may piniling gamot at quantity
        // Ginamit ang trim() para masigurong hindi lang spaces ang laman
        if (item && qty && item.trim() !== "") {
            const newDispense = new Dispense({
                visitId: savedVisit._id,
                who: userId,
                type: 'medicine',
                item: item,
                qty: Number(qty),
                unit: 'pcs'
            });
            await newDispense.save();
        }

        // 4. Set success message sa session
        req.session.success = "Request Submitted Successfully!";
        res.redirect('/h');

    } catch (err) {
        console.error('Submission Error:', err.message);
        req.session.error = "An error occurred while submitting.";
        res.redirect('/h');
    }
});

app.post('/visitnow2', async (req, res) => {
    try {
        const sessionUserId = req.session.user._id;

        const {
            patient,
            concern,
            complaint,
            item,
            qty
        } = req.body;

        // If admin selected a patient, use that.
        // Otherwise use the logged in user.
        const patientId = patient || sessionUserId;

        // ==========================
        // Create Visit
        // ==========================
        const newVisit = new Visits({
            patient: patientId,
            concern: concern || "Health Consultation",
            complaint: complaint || "No specific complaint",
            status: "Proceed",
            archive: false,
            verify: false
        });

        const savedVisit = await newVisit.save();

        // ==========================
        // Save Complaint
        // ==========================
        if (complaint && complaint.trim() !== "") {
            await new Complaint({
                visitId: savedVisit._id,
                type: complaint
            }).save();
        }

        // ==========================
        // Save Medicine Request
        // ==========================
        if (
            item &&
            item.trim() !== "" &&
            qty &&
            Number(qty) > 0
        ) {
            await new Dispense({
                visitId: savedVisit._id,
                who: patientId,
                type: "medicine",
                item,
                qty: Number(qty),
                unit: "pcs"
            }).save();
        }

        // ==========================
        // Success
        // ==========================
        req.session.success = "Request Submitted Successfully!";
        res.redirect("/v2");

    } catch (err) {
        console.error("Submission Error:", err);

        req.session.error = "An error occurred while submitting.";
        res.redirect("/v2");
    }
});

// Route para i-update ang status at i-set ang verify sa false
app.get('/proceed-request/:id', async (req, res) => {
    try {
        const requestId = req.params.id;

        const visit = await Visits.findByIdAndUpdate(requestId, {
            status: 'Proceed',
            verify: false
        }, { new: true });

        // ✅ Notification (in-app)
        if (visit) {
            await Notification.create({
                who: visit.patient,
                message: 'You may now proceed to the clinic.',
                type: 'visit',
                link: `/vv1/${visit._id}`
            });

            // ✅ Email Notification
            try {
                const patient = await Users.findById(visit.patient);
                if (patient && patient.email) {
                    const mailOptions = {
                        from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
                        to: patient.email,
                        subject: "AuCare: You May Now Proceed to the Clinic",
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                                <h2 style="color: #0056b3; text-align: center;">Visit Update</h2>
                                <p>Hello ${patient.fName},</p>
                                <p>Your clinic visit request has been reviewed. You may now proceed to the clinic.</p>
                                <p style="color: red;">Please head to the clinic at your earliest convenience.</p>
                            </div>`
                    };
                    await transporter.sendMail(mailOptions);
                }
            } catch (mailErr) {
                console.error('Proceed Request Email Error:', mailErr.message);
            }
        }
        res.redirect('/r');
    } catch (err) {
        console.error("Error updating status and verify:", err);
        res.status(500).send("Nagkaroon ng error sa pag-update.");
    }
});
// --- 1. VITALS (Update & Clear) ---
// 1. UPDATE VITALS (including Temperature)
app.post('/visit/vitals/:id', async (req, res) => {
    try {
        const { systolic, diastolic, hBeat, temperature } = req.body;
        await Visits.findByIdAndUpdate(req.params.id, {
            $set: {
                'bloodPressure.systolic': systolic,
                'bloodPressure.diastolic': diastolic,
                'hBeat': hBeat,
                'temperature': temperature // Save temperature here
            }
        });
        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) {
        console.error(err);
        res.redirect('back');
    }
});

// 2. DELETE/CLEAR VITALS
app.post('/visit/vitals/delete/:id', async (req, res) => {
    try {
        await Visits.findByIdAndUpdate(req.params.id, {
            $set: {
                bloodPressure: { systolic: null, diastolic: null },
                hBeat: null,
                temperature: '' // Clear temperature
            }
        });
        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) {
        res.redirect('back');
    }
});

app.post('/successVisit/:id', async (req, res) => {
    try {

        const visitId = req.params.id;

        // Hanapin ang visit
        const visit = await Visits.findById(visitId);

        if (!visit) {
            req.session.error = "Visit not found.";
            return res.redirect('/v2');
        }

        // Kunin lahat ng na-dispense sa visit
        const dispensedItems = await Dispense.find({ visitId });

        // Bawasan ang stocks
        for (const item of dispensedItems) {

            const stock = await Stocks.findOne({
                name: item.item,
                type: item.type,
                archive: false
            });

            if (stock) {

                stock.remaining = Math.max(
                    0,
                    stock.remaining - item.qty
                );

                await stock.save();
            }
        }

        // Mark as Attended
        visit.status = 'Attended';
        await visit.save();

        // Notification (in-app)
        await Notification.create({
            who: visit.patient,
            message: 'Your visit has been attended.',
            type: 'visit',
            link: `/vv1/${visit._id}`
        });

        // ✅ Email Notification
        try {
            const patient = await Users.findById(visit.patient);
            if (patient && patient.email) {
                const mailOptions = {
                    from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
                    to: patient.email,
                    subject: "AuCare: Your Visit Has Been Attended",
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                            <h2 style="color: #0056b3; text-align: center;">Visit Completed</h2>
                            <p>Hello ${patient.fName},</p>
                            <p>Your clinic visit has been marked as attended. Thank you for visiting AuCare.</p>
                        </div>`
                };
                await transporter.sendMail(mailOptions);
            }
        } catch (mailErr) {
            console.error('Success Visit Email Error:', mailErr.message);
        }

        req.session.success = "Visit completed successfully.";

        res.redirect(`/vv2/${visit._id}`);

    } catch (err) {
        console.error(err);
        req.session.error = "Unable to complete visit.";
        res.redirect('back');
    }
});

// --- 2. TREATMENT (Update & Clear) ---
app.post('/visit/update-treatment/:id', async (req, res) => {
    try {
        const visit = await Visits.findByIdAndUpdate(req.params.id, {
            treatment: req.body.treatment,
        }, { new: true });

        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) {
        res.redirect('back');
    }
});

app.post('/visit/treatment/delete/:id', async (req, res) => {
    try {
        await Visits.findByIdAndUpdate(req.params.id, { treatment: '', status: 'Proceed' });
        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

// --- 3. MEDICINE (Add & Delete) ---
app.post('/visit/add-medicine/:id', async (req, res) => {
    try {
        const { item, qty, unit, remarks } = req.body;
        const visit = await Visits.findById(req.params.id);
        await Dispense.create({ visitId: req.params.id, who: visit.patient, type: 'medicine', item, qty, unit, remarks });
        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

app.post('/visit/medicine/delete/:id', async (req, res) => {
    try {
        const item = await Dispense.findByIdAndDelete(req.params.id);
        res.redirect(`/vv2/${item.visitId}`);
    } catch (err) { res.redirect('back'); }
});

// --- 4. COMPLAINTS (Add & Delete) ---
app.post('/visit/complaint/add/:id', async (req, res) => {
    try {
        await Complaint.create({ visitId: req.params.id, type: req.body.type });
        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

app.post('/visit/complaint/delete/:id', async (req, res) => {
    try {
        const item = await Complaint.findByIdAndDelete(req.params.id);
        res.redirect(`/vv2/${item.visitId}`);
    } catch (err) { res.redirect('back'); }
});
app.post('/signup', async (req, res) => {
    try {
        const {
            fName, mName, lName, xName,
            role,
            phone, gender, address, email,
            schoolId, campus, course, yearLevel, section,
            bDay, bMonth, bYear,
            fAllergy, mAllergy,
            eName, ePhone, eAddress
        } = req.body;

        const normalizedEmail = email.trim().toLowerCase();

        const emailExist = await Users.findOne({ email: normalizedEmail });
        if (emailExist) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }

        // Email doubles as the username. Password is a random placeholder —
        // the account can't log in until it's verified AND has a real
        // temporary password (issued on approval below).
        const placeholderPassword = crypto.randomBytes(16).toString('hex');

        await Users.create({
            fName, mName, lName, xName,
            role,
            phone, gender, address, email: normalizedEmail,
            schoolId, campus, course, yearLevel, section,
            bDay, bMonth, bYear,
            fAllergy, mAllergy,
            username: normalizedEmail,
            password: placeholderPassword,
            eName, ePhone, eAddress,
            archive: false,
            verify: false,
            suspend: false,
            access: 0,
            reset: false,
            dump: false
        });

        return res.status(200).json({ success: true });

    } catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Registration failed. " + err.message });
    }
});

app.post('/api/users/approve/:id', isLogin, async (req, res) => {
    try {
        const { id } = req.params;

        // Real temp password, generated only now that the account is approved
        const tempPassword = crypto.randomBytes(4).toString('hex');

        const user = await Users.findByIdAndUpdate(id, {
            verify: true,
            verifyAt: Date.now(),
            isVerify: req.session.user.username,
            password: tempPassword,
            reset: true
        }, { new: true });

        if (!user) return res.json({ success: false, message: 'User not found.' });

        await Logs.create({
            who: req.session.user._id,
            what: `Approved account: ${user.username} (${user.fName} ${user.lName})`,
            archive: false
        });

        const mailOptions = {
            from: `"AuCare Support" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your AuCare Account Has Been Approved",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #0056b3; text-align: center;">Account Approved</h2>
                    <p>Hello ${user.fName},</p>
                    <p>Your AuCare account has been reviewed and approved. Log in using your email and the temporary password below:</p>
                    <p><strong>Email (Username):</strong> ${user.email}</p>
                    <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 4px;">
                        ${tempPassword}
                    </div>
                    <p style="color: red;">You'll be required to set a new password immediately after logging in.</p>
                </div>`
        };
        await transporter.sendMail(mailOptions);

        await Notification.create({
            who: user._id,
            message: 'Your account is approved. Check your email for a temporary password.',
            type: 'approval',
            link: '/p2'
        });

        res.json({ success: true });

    } catch (err) {
        console.error('Approve Error:', err.message);
        res.json({ success: false, message: 'Failed to approve account.' });
    }
});

app.use((req, res) => {
    res.status(404);
    res.locals.error = 'Oops! Page cannot be found!';
    console.log(`404 triggered: ${res.locals.error}`);
    res.render('index', { title: 'Invalid URL' });
});

app.use((err, req, res, next) => {
    console.error('⚠️ Error occurred:', err.message);
    res.locals.error = 'Oh no! Page is missing!';
    res.status(500).render('index', {
        title: 'File Missing',
        message: `OH NO! File in Directory is missing!' ${err.message}`,
        error: `OH NO! File in Directory is missing!`
    });
});

// Sumakses ka dyan boy!
app.listen(PORT, () => {
    console.log(`🚀 Kudos Master Aren! Running at http://localhost:${PORT}`);
});
