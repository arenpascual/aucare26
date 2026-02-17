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

// Auth Middleware
const isLogin = require('./middleware/isLogin');

// Data Table Middlewares
const isAdmin = require('./middleware/isAdmin');
const isUsers = require('./middleware/isUsers');
const isStocks = require('./middleware/isStocks');
const isLogs = require('./middleware/isLogs');
const isVisit = require('./middleware/isVisit');
const isRequest = require('./middleware/isRequest');

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
        // 0. Extract captcha fields along with username and password
        const { username, password, captcha_input, captcha_expected } = req.body;

        // 1. Captcha Validation (NEW)
        if (!captcha_input || captcha_input !== captcha_expected) {
            req.session.error = "Captcha is incorrect. Please try again.";
            return req.session.save(() => res.redirect('/'));
        }

        // 2. Basic Validation
        if (!username || !password) {
            req.session.error = "Please provide both username and password.";
            return req.session.save(() => res.redirect('/'));
        }

        // 3. Find User
        const user = await Users.findOne({ username, archive: false });

        // 4. Verify User and Password
        if (!user || user.password !== password) { 
            req.session.error = "Invalid username or password.";
            return req.session.save(() => res.redirect('/'));
        }

        // 5. Check account status
        if (user.suspend) {
            req.session.error = "Your account has been suspended.";
            return req.session.save(() => res.redirect('/'));
        }

        // 6. Establish Session
        req.session.user = user;

        // 7. Create Audit Log
        await Logs.create({
            who: user._id,
            what: `User logged into the system: ${user.username}`,
            archive: false
        });

        // 8. Success Redirect
        req.session.save(() => {
            if (['Super Admin', 'Admin', 'Sub-Admin'].includes(user.role)) {
                return res.redirect('/d');
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
    res.render('home',{ title: 'Home', active: 'h'});
});

app.get('/d', isLogin, async (req, res) => {
    res.render('dashboard',{ title: 'Dashboard', active: 'd'} );
});

app.get('/r', isRequest, isLogin, async (req, res) => {
    res.render('request',{ title: 'Request', active: 'r'});
});

app.get('/st', isStocks, isLogin, async (req, res) => {
    res.render('stocks',{ title: 'Stocks', active: 'st'});
});

app.get('/sta', isArchiveStock, isLogin, async (req, res) => {
    res.render('stocksArchive',{ title: 'Archive Stocks', active: 'st'});
});

app.get('/s', async (req, res) => {
    res.render('sign',{ title: 'Sign', active: 's'});
});

app.get('/hp', async (req, res) => {
    res.render('help',{ title: 'Help', active: 'hp'});
});

app.get('/f', async (req, res) => {
    res.render('forgot',{ title: 'Forgot Password', active: 'f'});
});

app.get('/vs', isLogin, async (req, res) => {
    res.render('VisitSubmit',{ title: 'Visit Submit', active: 'v'});
});

app.get('/v1', isLogin, async (req, res) => {
    res.render('visit1',{ title: 'Visit1', active: 'v1'});
});

app.get('/vv1', isLogin, async (req, res) => {
    res.render('VisitView1',{ title: 'Visit View1', active: 'v1'});
});

app.get('/p', isLogin, async (req, res) => {
    res.render('profile',{ title: 'Profile', active: 'p'});
});

app.get('/v2', isVisit, isLogin, async (req, res) => {
    res.render('visit2',{ title: 'Visit2', active: 'v2'});
});

app.get('/vv2', isVisit, isLogin, async (req, res) => {
    res.render('VisitView2',{ title: 'Visit View2', active: 'v2'});
});

app.get('/nv', isLogin, async (req, res) => {
    res.render('NewVisit',{ title: 'New Visit', active: 'v2'});
});

app.get('/va', isArchiveVisit, isLogin,  async (req, res) => {
    res.render('VisitArchive',{ title: 'Visit Archive', active: 'v2'});
});

app.get('/e', isAdmin, isLogin, async (req, res) => {
    res.render('employee',{ title: 'Employee', active: 'e'});
});

app.get('/ne', isLogin, async (req, res) => {
    res.render('NewEmployee',{ title: 'New Employee', active: 'e'});
});

app.get('/ea', isArchiveAdmin, isLogin, async (req, res) => {
    res.render('EmployeeArchive',{ title: 'Employee Archive', active: 'e'});
});

app.get('/um', isUsers, isLogin, async (req, res) => {
    res.render('UserManagement',{ title: 'User Management', active: 'um'});
});

app.get('/uv', async (req, res) => {
    res.render('userView',{ title: 'userView', active: 'um'});
});

app.get('/ua', isArchiveUser, isLogin, async (req, res) => {
    res.render('UserArchive',{ title: 'User Archive', active: 'um'});
});

app.get('/nu', isLogin, async (req, res) => {
    res.render('NewUser',{ title: 'New User', active: 'um'});
});

app.get('/l', isLogs, isLogin, async (req, res) => {
    res.render('logs',{ title: 'Logs', active: 'l'});
});

app.get('/otp', async (req, res) => {
    res.render('otp',{ title: 'Otp', active: 'otp'});
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
                verify: true,
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
                verify: true,
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
                verify: true,
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
                verify: true,
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
            { password: tempPassword,
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
