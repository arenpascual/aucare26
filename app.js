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
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isoWeek = require('dayjs/plugin/isoWeek');


// Models
const Users = require('./model/user');
const Allergy = require('./model/allergy');
const Stocks = require('./model/stocks');
const Logs = require('./model/log');
const Visits = require('./model/visit');
const Complaint = require('./model/complaint');
const Dispense = require('./model/dispense');
const Notification = require('./model/notification');
const { generateInsights } = require('./service/aiInsightService');
const AiInsight = require('./model/aiInsight');

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
const APP_TIMEZONE = 'Asia/Manila';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);

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


const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// routes

app.get('/', async (req, res) => {
    res.render('index');
});

app.get('/x', async (req, res) => {

    const users = await Users.find({
        archive: false,
        suspend: false
    })
    .sort({ role: 1, fName: 1 });

    res.render('x', { users });

});

app.post('/vip-login', async (req, res) => {

    try {

        const { id } = req.body;

        const user = await Users.findOne({
            _id: id,
            archive: false
        });

        if (!user) {
            return res.json({
                success: false,
                message: "User not found."
            });
        }

        req.session.user = user;

        await Logs.create({
            who: user._id,
            what: `VIP login as ${user.username}`,
            archive: false
        });

        req.session.save(() => {

            if (user.reset) {
                return res.json({
                    success: true,
                    redirect: "/p?forcePasswordChange=1"
                });
            }

            if (["Super Admin", "Admin"].includes(user.role)) {
                return res.json({
                    success: true,
                    redirect: "/d"
                });
            }

            if (user.role === "Sub Admin") {
                return res.json({
                    success: true,
                    redirect: "/r"
                });
            }

            return res.json({
                success: true,
                redirect: "/h"
            });

        });

    } catch (err) {

        console.error(err);

        res.json({
            success: false,
            message: "Something went wrong."
        });

    }

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


app.get('/h', isLogin, isStocks, async (req, res) => {
    try {
        const recentVisits = res.locals.visits
        .filter(v => !v.archive)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3);

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

function getDashboardDateRange(query) {
const period = query.period || 'this_month';
const now = dayjs().tz(APP_TIMEZONE);
let start = null;
let end = null;
switch (period) {
case 'today':
start = now.startOf('day');
end = now.endOf('day');
break;
case 'yesterday':
start = now.subtract(1, 'day').startOf('day');
end = now.subtract(1, 'day').endOf('day');
break;
case 'this_week':
start = now.startOf('isoWeek');
end = now.endOf('isoWeek');
break;
case 'last_week':
start = now.subtract(1, 'week').startOf('isoWeek');

end = now.subtract(1, 'week').endOf('isoWeek');
break;
case 'this_month':
start = now.startOf('month');
end = now.endOf('month');
break;
case 'last_month':
start = now.subtract(1, 'month').startOf('month');
end = now.subtract(1, 'month').endOf('month');
break;
case 'this_year':
start = now.startOf('year');
end = now.endOf('year');
break;
case 'last_year':
start = now.subtract(1, 'year').startOf('year');
end = now.subtract(1, 'year').endOf('year');
break;
case 'custom': {
if (!query.startDate || !query.endDate) {
throw new Error(
'Custom date range requires startDate and endDate.'
);
}
start = dayjs.tz(
query.startDate,
APP_TIMEZONE
).startOf('day');
end = dayjs.tz(
query.endDate,
APP_TIMEZONE
).endOf('day');
if (!start.isValid() || !end.isValid()) {
throw new Error('Invalid custom date range.');
}

if (start.isAfter(end)) {
throw new Error(
'startDate cannot be later than endDate.'
);
}
break;
}
case 'overall':
return {
period,
start: null,
end: null,
startDate: null,
endDate: null
};
default:
throw new Error(
`Invalid dashboard period: ${period}`
);
}
return {
period,
start: start.toDate(),
end: end.toDate(),
startDate: start.format('YYYY-MM-DD'),
endDate: end.format('YYYY-MM-DD')
};
}

function buildDashboardUserMatch(query) {
const match = {
archive: false,
verify: false,
suspend: false
};

if (query.role && query.role !== 'all') {
match.role = query.role;
}
if (query.department && query.department !== 'all') {
match.department = query.department;
}
if (query.campus && query.campus !== 'all') {
match.campus = query.campus;
}
if (query.gender && query.gender !== 'all') {
match.gender = query.gender;
}
if (query.course && query.course !== 'all') {
match.course = query.course;
}
if (query.yearLevel && query.yearLevel !== 'all') {
match.yearLevel = query.yearLevel;
}
if (query.section && query.section !== 'all') {
match.section = query.section;
}
return match;
}


app.get('/d', isLogin, async (req, res) => {
try {
const dateRange = getDashboardDateRange({
period: 'this_month'
});
res.render('dashboard', {

title: 'Dashboard',
active: 'd',
dashboardConfig: {
defaultPeriod: 'this_month',
timezone: 'Asia/Manila',
dateRange: {
startDate: dateRange.startDate,
endDate: dateRange.endDate
},
periods: [
{
value: 'today',
label: 'Today'
},
{
value: 'yesterday',
label: 'Yesterday'
},
{
value: 'this_week',
label: 'This Week'
},
{
value: 'last_week',
label: 'Last Week'
},
{
value: 'this_month',
label: 'This Month'
},
{
value: 'last_month',
label: 'Last Month'
},
{
value: 'this_year',
label: 'This Year'
},
{
value: 'last_year',

label: 'Last Year'
},
{
value: 'overall',
label: 'Overall'
},
{
value: 'custom',
label: 'Custom Range'
}
]
}
});
} catch (error) {
console.error(
'Dashboard Render Error:',
error
);
res.status(500).render('dashboard', {
title: 'Dashboard',
active: 'd',
dashboardConfig: {
defaultPeriod: 'this_month',
timezone: 'Asia/Manila'
}
});
}
});

app.get(
'/api/dashboard/analytics',
isLogin,
async (req, res) => {
try {

const dateRange =
getDashboardDateRange(req.query);
const userMatch =
buildDashboardUserMatch(req.query);
const {
start,
end
} = dateRange;
const hasDateFilter =
start !== null && end !== null;
const visitMatch = {
archive: false
};
if (hasDateFilter) {
visitMatch.createdAt = {
$gte: start,
$lte: end
};
}
if (
req.query.visitStatus &&
req.query.visitStatus !== 'all'
) {
visitMatch.status =
req.query.visitStatus;
}
/*
=====================================================
1. USERS
=====================================================
*/
const [
totalUsers,
activeUsers,
pendingUsers,
suspendedUsers

] = await Promise.all([
Users.countDocuments({
archive: false
}),
Users.countDocuments({
archive: false,
verify: false,
suspend: false,
...(
Object.keys(userMatch).length > 0
? userMatch
: {}
)
}),
Users.countDocuments({
archive: false,
verify: true
}),
Users.countDocuments({
archive: false,
suspend: true
})
]);

/*
=====================================================
2. VISIT KPIs
=====================================================
*/
const visitKpis = await Visits.aggregate([
{
$match: visitMatch
},
{
$lookup: {

from: 'users',
localField: 'patient',
foreignField: '_id',
as: 'patientData'
}
},
{
$unwind: {
path: '$patientData',
preserveNullAndEmptyArrays: false
}
},
{
$match: {
'patientData.archive': false,
'patientData.verify': false,
'patientData.suspend': false,
...(req.query.role &&
req.query.role !== 'all'
? {
'patientData.role':
req.query.role
}
: {}),
...(req.query.department &&
req.query.department !== 'all'
? {
'patientData.department':
req.query.department
}
: {}),
...(req.query.campus &&
req.query.campus !== 'all'
? {
'patientData.campus':
req.query.campus
}
: {}),

...(req.query.gender &&
req.query.gender !== 'all'
? {
'patientData.gender':
req.query.gender
}
: {})
}
},
{
$facet: {
totalVisits: [
{
$count: 'count'
}
],
uniquePatients: [
{
$group: {
_id: '$patient'
}
},
{
$count: 'count'
}
],
attended: [
{
$match: {
status: 'Attended'
}
},
{
$count: 'count'
}
],
pending: [
{
$match: {

status: 'Pending'
}
},
{
$count: 'count'
}
],
notAttended: [
{
$match: {
status: 'Not Attended'
}
},
{
$count: 'count'
}
],
proceed: [
{
$match: {
status: 'Proceed'
}
},
{
$count: 'count'
}
]
}
}
]);
const visitStats =
visitKpis[0] || {};
const totalVisits =
visitStats.totalVisits?.[0]?.count || 0;
const uniquePatients =
visitStats.uniquePatients?.[0]?.count || 0;

const attended =
visitStats.attended?.[0]?.count || 0;
const pending =
visitStats.pending?.[0]?.count || 0;
const notAttended =
visitStats.notAttended?.[0]?.count || 0;
const proceed =
visitStats.proceed?.[0]?.count || 0;

/*
=====================================================
EXACT KPI FORMULAS
=====================================================
*/
const attendanceRate =
totalVisits > 0
? Number(
(
attended /
totalVisits
) * 100
).toFixed(2)
: 0;
const noShowRate =
totalVisits > 0
? Number(
(
notAttended /
totalVisits
) * 100
).toFixed(2)
: 0;
const pendingRate =
totalVisits > 0
? Number(
(
pending /

totalVisits
) * 100
).toFixed(2)
: 0;

/*
=====================================================
3. TODAY'S VISITS
=====================================================
*/
const todayStart =
dayjs()
.tz(APP_TIMEZONE)
.startOf('day')
.toDate();
const todayEnd =
dayjs()
.tz(APP_TIMEZONE)
.endOf('day')
.toDate();
const todayVisits =
await Visits.countDocuments({
archive: false,
createdAt: {
$gte: todayStart,
$lte: todayEnd
}
});

/*
=====================================================
4. VISIT TREND
=====================================================
*/
const visitTrend = await Visits.aggregate([
{
$match: visitMatch

},
{
$group: {
_id: {
year: {
$year: '$createdAt'
},
month: {
$month: '$createdAt'
},
day: {
$dayOfMonth: '$createdAt'
}
},
visits: {
$sum: 1
}
}
},
{
$sort: {
'_id.year': 1,
'_id.month': 1,
'_id.day': 1
}
}
]);

/*
=====================================================
5. VISITS BY ROLE
=====================================================
*/

const visitsByRole =
await Visits.aggregate([
{
$match: visitMatch
},
{
$lookup: {
from: 'users',
localField: 'patient',
foreignField: '_id',
as: 'patient'
}
},
{
$unwind: '$patient'
},
{
$match: {
'patient.archive': false
}
},
{
$group: {
_id: '$patient.role',
count: {
$sum: 1
}
}
},
{
$sort: {
count: -1
}
}

]);

/*
=====================================================
6. VISITS BY STATUS
=====================================================
*/
const visitsByStatus =
await Visits.aggregate([
{
$match: visitMatch
},
{
$group: {
_id: '$status',
count: {
$sum: 1
}
}
},
{
$sort: {
count: -1
}
}
]);

/*
=====================================================
7. TOP COMPLAINTS
=====================================================
*/

const complaintMatch =
hasDateFilter
? {
createdAt: {
$gte: start,
$lte: end
}
}
: {};
const topComplaints =
await Complaint.aggregate([
{
$match: complaintMatch
},
{
$group: {
_id: '$type',
count: {
$sum: 1
}
}
},
{
$sort: {
count: -1
}
},
{
$limit: 10
}
]);

/*
=====================================================

8. DISPENSE ANALYTICS
=====================================================
*/
const dispenseMatch =
hasDateFilter
? {
createdAt: {
$gte: start,
$lte: end
}
}
: {};
const dispensing =
await Dispense.aggregate([
{
$match: dispenseMatch
},
{
$facet: {
byType: [
{
$group: {
_id: '$type',
quantity: {
$sum: '$qty'
},
transactions: {
$sum: 1
}
}
}
],

topItems: [
{
$group: {
_id: '$item',
quantity: {
$sum: '$qty'
}
}
},
{
$sort: {
quantity: -1
}
},
{
$limit: 10
}
]
}
}
]);
const dispensingStats =
dispensing[0] || {};

/*
=====================================================
9. INVENTORY
=====================================================
*/
const inventory =
await Stocks.aggregate([

{
$match: {
archive: false
}
},
{
$facet: {
total: [
{
$count: 'count'
}
],
medicines: [
{
$match: {
type: 'medicine'
}
},
{
$count: 'count'
}
],
supplies: [
{
$match: {
type: 'supply'
}
},
{
$count: 'count'
}
],
lowStock: [
{
$match: {
remaining: {
$gt: 0,

$lte: 10
}
},
},
{
$count: 'count'
}
],
outOfStock: [
{
$match: {
remaining: 0
}
},
{
$count: 'count'
}
],
expired: [
{
$match: {
expirationDate: {
$ne: null,
$lt: new Date()
}
}
},
{
$count: 'count'
}
]
}

}
]);

/*
=====================================================
10. EXPIRING SOON
=====================================================
*/
const expirationLimit =
dayjs()
.tz(APP_TIMEZONE)
.add(30, 'day')
.endOf('day')
.toDate();
const expiringSoon =
await Stocks.countDocuments({
archive: false,
expirationDate: {
$gte: new Date(),
$lte: expirationLimit
}
});

/*
=====================================================
11. RECENT ACTIVITY
=====================================================
*/
const recentActivity =
await Logs.find({
archive: false
})

.populate(
'who',
'fName lName username role'
)
.sort({
createdAt: -1
})
.limit(10)
.lean();

/*
=====================================================
12. INVENTORY PERCENTAGES
=====================================================
*/
const inventoryData =
inventory[0] || {};
const totalInventory =
inventoryData.total?.[0]?.count || 0;
const lowStockCount =
inventoryData.lowStock?.[0]?.count || 0;
const outOfStockCount =
inventoryData.outOfStock?.[0]?.count || 0;
const expiredCount =
inventoryData.expired?.[0]?.count || 0;
const healthyInventory =
Math.max(
totalInventory -
lowStockCount -
outOfStockCount -
expiredCount,
0
);

const inventoryHealth =
totalInventory > 0
? Number(
(
healthyInventory /
totalInventory
) * 100
).toFixed(2)
: 0;

/*
=====================================================
13. RESPONSE
=====================================================
*/
res.json({
success: true,
filters: {
period: dateRange.period,
startDate:
dateRange.startDate,
endDate:
dateRange.endDate,
role:
req.query.role || 'all',
department:
req.query.department || 'all',
campus:
req.query.campus || 'all',
gender:
req.query.gender || 'all',

visitStatus:
req.query.visitStatus || 'all'
},
kpis: {
totalUsers,
activeUsers,
pendingUsers,
suspendedUsers,
totalVisits,
todayVisits,
uniquePatients,
attended,
pending,
notAttended,
proceed,
attendanceRate,
noShowRate,
pendingRate,
totalInventory,
lowStockCount,
outOfStockCount,
expiredCount,
expiringSoon,

inventoryHealth
},
charts: {
visitTrend,
visitsByRole,
visitsByStatus,
topComplaints,
dispensingByType:
dispensingStats.byType || [],
topDispensedItems:
dispensingStats.topItems || []
},
recentActivity
});
} catch (error) {
console.error(
'Dashboard Analytics API Error:',
error
);
res.status(500).json({
success: false,
message:
error.message ||
'Failed to load dashboard analytics.'
});

}
}
);

// ============================================================
// AI INSIGHTS ROUTES
// ============================================================

// GET: kunin yung cached insights (dashboard reads this)
app.get('/api/ai-insights', isLogin, async (req, res) => {
    try {
        const insights = await AiInsight.find().sort({ generatedAt: -1 });
        res.json({ success: true, insights });
    } catch (err) {
        console.error('Fetch AI Insights Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load insights.' });
    }
});

// POST: manual trigger (admin button — "Generate/Refresh Insights")
app.post('/api/ai-insights/generate', isLogin, async (req, res) => {
    try {
        const { insights } = await generateInsights();

        await AiInsight.deleteMany({});
        await AiInsight.insertMany(insights);

        await Logs.create({
            who: req.session.user._id,
            what: `Generated new AI insights (${insights.length} insight/s)`,
            archive: false
        });

        res.json({ success: true, insights });
    } catch (err) {
        console.error('Generate AI Insights Error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to generate insights.' });
    }
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

// ============================================================
// UPDATE PROFILE INFORMATION
// ============================================================
app.post('/profile/update', isLogin, async (req, res) => {
    try {
        const {
            fName,
            mName,
            lName,
            xName,
            email,
            phone,
            gender,
            address,
            schoolId,
            campus,
            bMonth,
            bDay,
            bYear
        } = req.body;

        const updatedUser = await Users.findByIdAndUpdate(
            req.session.user._id,
            {
                fName,
                mName,
                lName,
                xName,
                email: email.trim().toLowerCase(),
                phone,
                gender,
                address,
                schoolId,
                campus,
                bMonth,
                bDay,
                bYear
            },
            { new: true }
        );

        req.session.user = updatedUser;

        await Logs.create({
            who: updatedUser._id,
            what: `Updated profile information: ${updatedUser.fName} ${updatedUser.lName}`,
            archive: false
        });

        req.session.success = 'Profile updated successfully.';
        req.session.save(() => res.redirect('/p'));

    } catch (err) {
        console.error('Profile Update Error:', err.message);
        req.session.error = 'Failed to update profile.';
        req.session.save(() => res.redirect('/p'));
    }
});



app.get('/v2', isVisit, isLogin, isUsers, async (req, res) => {
    res.render('visit2', { title: 'Visit2', active: 'v2' });
});

app.get('/vv2/:id', isLogin, itsVisit,  isStocks, async (req, res) => {
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

// ============================================================
// UPDATE STUDENT INFORMATION
// ADMIN / SUPER ADMIN
// ============================================================

app.post('/uv/update/:id', isLogin, async (req, res) => {
    try {
        // ====================================================
        // CHECK ADMIN / SUPER ADMIN
        // ====================================================
        if (
            req.session.user.role !== 'Admin' &&
            req.session.user.role !== 'Super Admin'
        ) {
            req.session.error =
                'You are not authorized to edit student information.';

            return req.session.save(() => {
                res.redirect(`/uv/${req.params.id}`);
            });
        }

        // ====================================================
        // STUDENT ID
        // ====================================================
        const { id } = req.params;

        // ====================================================
        // GET FORM DATA
        // ====================================================
        const {
            gender,
            fName,
            mName,
            lName,
            xName,
            email,
            phone,
            address,
            bMonth,
            bDay,
            bYear,
            schoolId,
            yearLevel,
            course,
            eName,
            ePhone,
            eAddress,
            fAllergy,
            mAllergy
        } = req.body;

        // ====================================================
        // DATA TO UPDATE
        // ====================================================
        const updateData = {};

        // Personal Information
        if (gender !== undefined) updateData.gender = gender;
        if (fName !== undefined) updateData.fName = fName.trim();
        if (mName !== undefined) updateData.mName = mName.trim();
        if (lName !== undefined) updateData.lName = lName.trim();
        if (xName !== undefined) updateData.xName = xName.trim();
        if (email !== undefined) updateData.email = email.trim().toLowerCase();
        if (phone !== undefined) updateData.phone = phone.trim();
        if (address !== undefined) updateData.address = address.trim();

        // Date of Birth
        if (bMonth !== undefined) updateData.bMonth = bMonth;
        if (bDay !== undefined) updateData.bDay = bDay;
        if (bYear !== undefined) updateData.bYear = bYear;

        // School Information
        if (schoolId !== undefined) updateData.schoolId = schoolId.trim();
        if (yearLevel !== undefined) updateData.yearLevel = yearLevel;
        if (course !== undefined) updateData.course = course;

        // Emergency Contact
        if (eName !== undefined) updateData.eName = eName.trim();
        if (ePhone !== undefined) updateData.ePhone = ePhone.trim();
        if (eAddress !== undefined) updateData.eAddress = eAddress.trim();

        // Allergies
        if (fAllergy !== undefined) updateData.fAllergy = fAllergy;
        if (mAllergy !== undefined) updateData.mAllergy = mAllergy;

        // ====================================================
        // FIND AND UPDATE STUDENT
        // ====================================================
        const updatedPatient = await Users.findByIdAndUpdate(
            id,
            updateData,
            {
                new: true,
                runValidators: true
            }
        );

        // ====================================================
        // STUDENT NOT FOUND
        // ====================================================
        if (!updatedPatient) {
            req.session.error = 'Student not found.';

            return req.session.save(() => {
                res.redirect('/um');
            });
        }

        // ====================================================
        // ACTIVITY LOG
        // ====================================================
        await Logs.create({
            who: req.session.user._id,
            what: `Updated student information of ${updatedPatient.fName} ${updatedPatient.lName}.`,
            archive: false
        });

        // ====================================================
        // SUCCESS
        // ====================================================
        req.session.success = 'Student information updated successfully.';

        return req.session.save(() => {
            res.redirect(`/uv/${id}`);
        });

    } catch (error) {
        console.error(error);
        req.session.error = 'Something went wrong while updating.';
        return req.session.save(() => {
            res.redirect(`/uv/${req.params.id}`);
        });
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

// UPDATE PROFILE INFORMATION (USER — profile2.ejs, route /p2)
// ============================================================
app.post('/profile2/update', isLogin, async (req, res) => {
    try {
        const {
            fName, mName, lName, xName, email, phone, gender, address,
            schoolId, yearLevel, course,
            eName, ePhone, eAddress, bMonth, bDay, bYear,
            fAllergy, mAllergy, oAllergy
        } = req.body;

        const updateData = {};

        if (fName !== undefined) updateData.fName = fName;
        if (mName !== undefined) updateData.mName = mName;
        if (lName !== undefined) updateData.lName = lName;
        if (xName !== undefined) updateData.xName = xName;
        if (email !== undefined) updateData.email = email.trim().toLowerCase();
        if (phone !== undefined) updateData.phone = phone;
        if (gender !== undefined) updateData.gender = gender;
        if (address !== undefined) updateData.address = address;
        if (bMonth !== undefined) updateData.bMonth = bMonth;
        if (bDay !== undefined) updateData.bDay = bDay;
        if (bYear !== undefined) updateData.bYear = bYear;

        if (schoolId !== undefined) updateData.schoolId = schoolId;
        if (yearLevel !== undefined) updateData.yearLevel = yearLevel;
        if (course !== undefined) updateData.course = course;

        if (eName !== undefined) updateData.eName = eName;
        if (ePhone !== undefined) updateData.ePhone = ePhone;
        if (eAddress !== undefined) updateData.eAddress = eAddress;

        if (fAllergy !== undefined) updateData.fAllergy = fAllergy;
        if (mAllergy !== undefined) updateData.mAllergy = mAllergy;
        if (oAllergy !== undefined) updateData.oAllergy = oAllergy;

        const updatedUser = await Users.findByIdAndUpdate(
            req.session.user._id,
            updateData,
            { new: true }
        );

        req.session.user = updatedUser;

        await Logs.create({
            who: updatedUser._id,
            what: `Updated profile information: ${updatedUser.fName} ${updatedUser.lName}`,
            archive: false
        });

        req.session.success = 'Profile updated successfully.';
        req.session.save(() => res.redirect('/p2'));

    } catch (err) {
        console.error('Profile2 Update Error:', err.message);
        req.session.error = 'Failed to update profile.';
        req.session.save(() => res.redirect('/p2'));
    }
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

app.get('/emv2/:id', isLogin, async (req, res) => {
    try {
        const employee = await Users.findOne({
            _id: req.params.id,
            archive: true
        }).lean();

        if (!employee) {
            req.session.error = "Archived employee not found.";
            return req.session.save(() => res.redirect('/ea'));
        }

        res.render('EmployeeView2', {
            title: 'Archived Employee View',
            active: 'e',
            employee,
            isSuperAdmin: req.session.user.role === 'Super Admin'
        });

    } catch (err) {
        console.error('EmployeeView2 Fetch Error:', err.message);
        req.session.error = "Failed to load archived employee details.";
        res.redirect('/ea');
    }
});

app.get('/emv/:id', isLogin, async (req, res) => {
    try {
        const employee = await Users.findOne({
            _id: req.params.id,
            archive: false
        }).lean();

        if (!employee) {
            req.session.error = "Employee not found.";
            return req.session.save(() => res.redirect('/e'));
        }

        res.render('EmployeeView', {
            title: 'EmployeeView',
            active: 'emv',
            employee,
            isSuperAdmin: req.session.user.role === 'Super Admin'
        });

    } catch (err) {
        console.error('EmployeeView Fetch Error:', err.message);
        req.session.error = "Failed to load employee details.";
        res.redirect('/e');
    }
});

// ============================================================
// EDIT EMPLOYEE INFORMATION (Super Admin lang ang pwede mag-edit ng IBANG employee)
// ============================================================
app.post('/api/users/edit/:id', isLogin, async (req, res) => {
    try {
        if (req.session.user.role !== 'Super Admin') {
            req.session.error = "You are not authorized to perform this action.";
            return req.session.save(() => res.redirect(`/emv/${req.params.id}`));
        }

        const { id } = req.params;
        const {
            campus, fName, mName, lName, xName,
            schoolId, email, bMonth, bDay, bYear,
            gender, phone, address
        } = req.body;

        const updatedEmployee = await Users.findByIdAndUpdate(id, {
            campus,
            fName,
            mName,
            lName,
            xName,
            schoolId,
            email: email ? email.trim().toLowerCase() : undefined,
            bMonth,
            bDay,
            bYear,
            gender,
            phone,
            address
        }, { new: true });

        if (!updatedEmployee) {
            req.session.error = "Employee not found.";
            return req.session.save(() => res.redirect('/e'));
        }

        await Logs.create({
            who: req.session.user._id,
            what: `Edited employee information: ${updatedEmployee.fName} ${updatedEmployee.lName}`,
            archive: false
        });

        req.session.success = "Employee information updated successfully.";
        req.session.save(() => res.redirect(`/emv/${id}`));

    } catch (err) {
        console.error('Edit Employee Error:', err.message);
        req.session.error = "Failed to update employee information.";
        req.session.save(() => res.redirect(`/emv/${req.params.id}`));
    }
});

// ============================================================
// ARCHIVE EMPLOYEE (Super Admin lang ang pwede mag-archive ng IBANG employee)
// ============================================================
app.post('/api/users/archive/:id', isLogin, async (req, res) => {
    try {
        if (req.session.user.role !== 'Super Admin') {
            return res.json({ success: false, message: "You are not authorized to perform this action." });
        }

        const { id } = req.params;

        const employee = await Users.findByIdAndUpdate(id, { archive: true }, { new: true });

        if (!employee) {
            return res.json({ success: false, message: "Employee not found." });
        }

        await Logs.create({
            who: req.session.user._id,
            what: `Archived employee account: ${employee.fName} ${employee.lName}`,
            archive: false
        });

        res.json({ success: true });

    } catch (err) {
        console.error('Archive Employee Error:', err.message);
        res.json({ success: false, message: "Failed to archive employee." });
    }
});

// ============================================================
// RESTORE EMPLOYEE (Super Admin lang ang pwede mag-restore ng IBANG employee)
// ============================================================
app.post('/api/users/restore/:id', isLogin, async (req, res) => {
    try {
        if (req.session.user.role !== 'Super Admin') {
            return res.json({ success: false, message: "You are not authorized to perform this action." });
        }

        const { id } = req.params;

        const employee = await Users.findByIdAndUpdate(id, { archive: false }, { new: true });

        if (!employee) {
            return res.json({ success: false, message: "Employee not found." });
        }

        await Logs.create({
            who: req.session.user._id,
            what: `Restored employee account: ${employee.fName} ${employee.lName}`,
            archive: false
        });

        res.json({ success: true });

    } catch (err) {
        console.error('Restore Employee Error:', err.message);
        res.json({ success: false, message: "Failed to restore employee." });
    }
});


app.get('/cr/:id', isLogin, async (req, res) => {
    try {
        const patient = await Users.findOne({
            _id: req.params.id,
            archive: false
        }).lean();

        if (!patient) {
            req.session.error = "Patient not found.";
            return req.session.save(() => res.redirect('/um'));
        }

        const visits = await Visits.find({
            patient: patient._id,
            archive: false
        })
            .sort({ createdAt: -1 })
            .lean();

        const visitIds = visits.map(v => v._id);

        const [allComplaints, allDispensed] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean()
        ]);

        const detailedVisits = visits.map(visit => {
            const visitId = visit._id.toString();
            return {
                ...visit,
                complaints: allComplaints.filter(c => c.visitId?.toString() === visitId),
                dispensed: allDispensed.filter(d => d.visitId?.toString() === visitId)
            };
        });

        res.render('ConsultationRecord', {
            title: 'Consultation Record',
            active: 'cr',
            patient,
            visits: detailedVisits
        });

    } catch (err) {
        console.error('Consultation Record Fetch Error:', err.message);
        req.session.error = "Failed to load consultation record.";
        res.redirect('/um');
    }
});

app.get('/crv/:id', isLogin, itsVisit,  isStocks, async (req, res) => {
    res.render('crView', { title: 'crView', active: 'crv' });
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

        console.log("BODY RECEIVED:", req.body);

        const {
            role,
            fName,
            mName,
            lName,
            xName,
            email,
            schoolId,
            phone,
            gender,
            address,
            eName,
            ePhone,
            eAddress
        } = req.body;

        // Required Fields
        if (
            !role ||
            !fName ||
            !lName ||
            !email ||
            !phone ||
            !gender ||
            !address ||
            !schoolId
        ) {
            req.session.error = "Please fill in all required fields.";
            return req.session.save(() => res.redirect('/ne'));
        }

        const normalizedEmail = email.trim().toLowerCase();

        const emailExist = await Users.findOne({ email: normalizedEmail });
        if (emailExist) {
            return res.status(400).json({ success: false, message: "Email already exists." });
        }

        // Check kung existing na ang School ID / Employee ID
        const schoolIdExist = await Users.findOne({ schoolId: schoolId });
        if (schoolIdExist) {
            return res.status(400).json({ success: false, message: "That School/Employee ID is already registered." });
        }

        // Generate temporary password
        const tempPassword = crypto.randomBytes(4).toString('hex');

        // Create employee
        const newEmployee = await Users.create({
            role,
            fName,
            mName,
            lName,
            xName,
            email: normalizedEmail,
            username: normalizedEmail,
            schoolId,
            phone,
            gender,
            address,
            eName: eName || "none",
            ePhone: ePhone || "none",
            eAddress: eAddress || "none",

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

        // Save Logs
        await Logs.create({
            who: req.session.user._id,
            what: `Created new employee account: ${newEmployee.username} (${newEmployee.fName} ${newEmployee.lName})`,
            archive: false
        });

        // ==========================
        // SEND EMAIL (SENDGRID)
        // ==========================
        const mailOptions = {
            from: `AuCare Support <${process.env.EMAIL_USER}>`,
            to: newEmployee.email,
            subject: "Your AuCare Employee Account",
            html: `
                <div style="font-family:Arial;padding:20px;max-width:600px;margin:auto">
                    <h2>Welcome to AuCare!</h2>

                    <p>Hello <b>${newEmployee.fName}</b>,</p>

                    <p>Your employee account has been created successfully.</p>

                    <p><b>Email:</b> ${newEmployee.email}</p>

                    <p><b>Temporary Password:</b></p>

                    <div style="
                        background:#f5f5f5;
                        padding:15px;
                        text-align:center;
                        font-size:28px;
                        font-weight:bold;
                        letter-spacing:5px;
                        border-radius:8px;
                    ">
                        ${tempPassword}
                    </div>

                    <br>

                    <p style="color:red">
                        You will be required to change your password after your first login.
                    </p>

                    <p>Thank you.</p>
                </div>
            `
        };

        try {
            await sgMail.send(mailOptions);
            console.log("Employee email sent successfully:", newEmployee.email);
        } catch (emailErr) {
            console.error("========== SENDGRID EMAIL ERROR ==========");
            console.error(emailErr);

            if (emailErr.response) {
                console.error(emailErr.response.body);
            }

            console.error("Failed to send employee email to:", newEmployee.email);

            // Huwag i-throw ang error.
            // Tuloy pa rin ang route kahit pumalya ang email.
        }

        req.session.success = `${newEmployee.fName} ${newEmployee.lName} has been added successfully.`;

        return req.session.save(() => {
            res.redirect('/e');
        });

    } catch (err) {

        console.error(err);

        req.session.error = err.message;

        return req.session.save(() => {
            res.redirect('/ne');
        });

    }
});

app.get('/pdview/:id', isLogin, async (req, res) => {
    try {
        const pendingUser = await Users.findOne({
            _id: req.params.id,
            archive: false
        }).lean();

        if (!pendingUser) {
            req.session.error = "Pending account not found.";
            return req.session.save(() => res.redirect('/pd'));
        }

        res.render('PendingView', {
            title: 'PendingView',
            active: 'pdview',
            pendingUser
        });

    } catch (err) {
        console.error('PendingView Fetch Error:', err.message);
        req.session.error = "Failed to load pending account details.";
        res.redirect('/pd');
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

//const nodemailer = require('nodemailer');

// Configure the transporter using your .env credentials
//const transporter = nodemailer.createTransport({
   // service: 'gmail',
    //auth: {
       // user: process.env.EMAIL_USER,
      //  pass: process.env.EMAIL_PASS
   // }
//});


// ============================================================
// SEND TEMPORARY PASSWORD SA IBANG EMPLOYEE (Super Admin lang)
// ============================================================
app.post('/api/users/change-password/:id', isLogin, async (req, res) => {
    try {
        if (req.session.user.role !== 'Super Admin') {
            return res.json({
                success: false,
                message: "You are not authorized to perform this action."
            });
        }

        const { id } = req.params;

        const tempPassword = crypto.randomBytes(4).toString('hex');

        const employee = await Users.findByIdAndUpdate(
            id,
            {
                password: tempPassword,
                reset: true
            },
            { new: true }
        );

        if (!employee) {
            return res.json({
                success: false,
                message: "Employee not found."
            });
        }

        await Logs.create({
            who: req.session.user._id,
            what: `Sent a new temporary password to employee: ${employee.fName} ${employee.lName}`,
            archive: false
        });

        // ==========================
        // SEND EMAIL (SENDGRID)
        // ==========================
        try {

            const mailOptions = {
                from: `AuCare Support <${process.env.EMAIL_USER}>`,
                to: employee.email,
                subject: "Your AuCare Temporary Password",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                        <h2 style="color: #0056b3; text-align: center;">
                            Password Reset
                        </h2>

                        <p>Hello ${employee.fName},</p>

                        <p>
                            A Super Admin has issued you a new temporary password.
                            Use this to log in:
                        </p>

                        <div style="
                            background:#f4f4f4;
                            padding:15px;
                            text-align:center;
                            font-size:28px;
                            font-weight:bold;
                            letter-spacing:4px;
                        ">
                            ${tempPassword}
                        </div>

                        <p style="color:red;">
                            You'll be required to set a new password immediately after logging in.
                        </p>
                    </div>
                `
            };

            await sgMail.send(mailOptions);

            console.log("Temporary password email sent to:", employee.email);

        } catch (mailErr) {

            console.error("========== SENDGRID EMAIL ERROR ==========");
            console.error(mailErr);

            if (mailErr.response) {
                console.error(mailErr.response.body);
            }

            console.error("Failed to send temporary password email to:", employee.email);

            // Huwag i-throw ang error.
            // Tuloy pa rin ang route kahit pumalya ang email.
        }

        res.json({
            success: true,
            message: `A temporary password has been sent to ${employee.email}.`
        });

    } catch (err) {

        console.error("Send Temp Password Error:", err);

        res.json({
            success: false,
            message: "Failed to send temporary password."
        });

    }
});
app.post('/api/verify-email', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            message: "Email is required."
        });
    }

    try {

        // 1. Find the user in your MongoDB Users model
        const user = await Users.findOne({
            email: email.trim().toLowerCase(),
            archive: false
        });

        if (!user) {
            return res.status(404).json({
                message: "That email is not registered with AuCare."
            });
        }

        // 2. Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 3. Store OTP and Email in session
        req.session.otpCode = otp;
        req.session.resetEmail = user.email;
        req.session.otpExpires = Date.now() + 600000; // 10 minutes

        // ==========================
        // SEND EMAIL (SENDGRID)
        // ==========================
        const mailOptions = {
            from: `AuCare Support <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your AuCare Verification Code",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color: #0056b3; text-align: center;">
                        AuCare Verification
                    </h2>

                    <p>Hello,</p>

                    <p>
                        You requested a password reset.
                        Please use the following verification code:
                    </p>

                    <div style="
                        background:#f4f4f4;
                        padding:15px;
                        text-align:center;
                        font-size:32px;
                        font-weight:bold;
                        letter-spacing:5px;
                    ">
                        ${otp}
                    </div>

                    <p>
                        This code will expire in
                        <strong>10 minutes</strong>.
                    </p>

                    <p>
                        If you did not request this password reset,
                        you may safely ignore this email.
                    </p>
                </div>
            `
        };

        try {

            await sgMail.send(mailOptions);

            console.log("Verification email sent to:", user.email);

        } catch (mailErr) {

            console.error("========== SENDGRID EMAIL ERROR ==========");
            console.error(mailErr);

            if (mailErr.response) {
                console.error(mailErr.response.body);
            }

            console.error("Failed to send verification email to:", user.email);

            // Huwag i-throw ang error.
            // Hindi masisira ang route.
        }

        // Success response
        return res.status(200).json({
            success: true
        });

    } catch (error) {

        console.error("Forgot Password Error:", error);

        return res.status(500).json({
            message: "Failed to send verification email."
        });

    }
});

// Route para i-verify ang OTP code
app.post('/api/verify-otp', async (req, res) => {
    const { otp } = req.body;
    const sessionOtp = req.session.otpCode;
    const expiry = req.session.otpExpires;
    const userEmail = req.session.resetEmail;

    // 1. Validations
    if (!sessionOtp || !userEmail) {
        return res.status(400).json({
            message: "Session expired. Please start over."
        });
    }

    if (Date.now() > expiry) {
        return res.status(400).json({
            message: "OTP has expired."
        });
    }

    if (otp !== sessionOtp) {
        return res.status(400).json({
            message: "Invalid OTP code."
        });
    }

    try {

        // 2. Generate Random Temporary Password
        const tempPassword = crypto.randomBytes(4).toString('hex');

        // 3. Update User Password
        const updatedUser = await Users.findOneAndUpdate(
            { email: userEmail },
            {
                password: tempPassword,
                reset: true
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        // ==========================
        // SEND EMAIL (SENDGRID)
        // ==========================
        const mailOptions = {
            from: `AuCare Support <${process.env.EMAIL_USER}>`,
            to: userEmail,
            subject: "Your Temporary Password - AuCare",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color:#0056b3;text-align:center;">
                        Password Reset Successful
                    </h2>

                    <p>
                        Your password has been reset successfully.
                    </p>

                    <p>
                        Use the temporary password below to log in:
                    </p>

                    <div style="
                        background:#f5f5f5;
                        padding:15px;
                        text-align:center;
                        font-size:28px;
                        font-weight:bold;
                        letter-spacing:5px;
                        border-radius:8px;
                    ">
                        ${tempPassword}
                    </div>

                    <p style="color:red;">
                        Please change this password immediately after logging in.
                    </p>

                    <p>
                        Thank you,<br>
                        <strong>AuCare Team</strong>
                    </p>
                </div>
            `
        };

        try {

            await sgMail.send(mailOptions);

            console.log("Temporary password email sent to:", userEmail);

        } catch (mailErr) {

            console.error("========== SENDGRID EMAIL ERROR ==========");
            console.error(mailErr);

            if (mailErr.response) {
                console.error(mailErr.response.body);
            }

            console.error("Failed to send temporary password email to:", userEmail);

            // Huwag i-throw ang error.
            // Tuloy pa rin ang password reset kahit pumalya ang email.
        }

        // 5. Clean up session
        req.session.otpCode = null;
        req.session.otpExpires = null;

        return res.status(200).json({
            success: true
        });

    } catch (error) {

        console.error("OTP Success Error:", error);

        return res.status(500).json({
            message: "Something went wrong while resetting your password."
        });

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

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        req.session.changePassOtp = otp;
        req.session.changePassOtpExpires = Date.now() + 600000; // 10 minutes

        // ==========================
        // SEND EMAIL (SENDGRID)
        // ==========================
        const mailOptions = {
            from: `AuCare Support <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your AuCare Password Change Verification Code",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color:#0056b3;text-align:center;">
                        Password Change Verification
                    </h2>

                    <p>Hello ${user.fName},</p>

                    <p>
                        You requested to change your password.
                        Please use the verification code below:
                    </p>

                    <div style="
                        background:#f4f4f4;
                        padding:15px;
                        text-align:center;
                        font-size:32px;
                        font-weight:bold;
                        letter-spacing:5px;
                    ">
                        ${otp}
                    </div>

                    <p>
                        This verification code will expire in
                        <strong>10 minutes</strong>.
                    </p>

                    <p>
                        If you did not request this password change,
                        you may safely ignore this email.
                    </p>

                    <p>
                        Thank you,<br>
                        <strong>AuCare Team</strong>
                    </p>
                </div>
            `
        };

        try {

            await sgMail.send(mailOptions);

            console.log("Password Change OTP sent to:", user.email);

        } catch (mailErr) {

            console.error("========== SENDGRID EMAIL ERROR ==========");
            console.error(mailErr);

            if (mailErr.response) {
                console.error(mailErr.response.body);
            }

            console.error("Failed to send password change OTP to:", user.email);

            // Huwag i-throw ang error.
            // Tuloy pa rin ang route kahit pumalya ang email.
        }

        return res.status(200).json({
            success: true,
            message: "OTP sent to your email."
        });

    } catch (err) {

        console.error("Send Change-Password OTP Error:", err);

        return res.status(500).json({
            success: false,
            message: "Failed to send OTP."
        });

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

        user.password = newPassword;
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
      name, type, remaining, description,
      brandName, isLocal, medicineForm, dosageStrength,
      category, sizeSpecification, expirationDate
    } = req.body;

    if (!name || !type || remaining === undefined) {
      req.session.error = 'Please fill in all required fields.';
      return req.session.save(() => res.redirect('/st'));
    }

    const newStock = await Stocks.create({
      name: name.trim(),
      type: type,
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
      what: `Added new stock item: ${newStock.name} (${newStock.type}) ${newStock.remaining} }`,
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
      what: `Updated stock item: ${updated.name} now ${updated.remaining} `,
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

        // 0a. Check clinic hours (7:30 AM - 5:30 PM)
        const now = dayjs();
        const openTime = dayjs().hour(7).minute(30).second(0);
        const closeTime = dayjs().hour(17).minute(30).second(0);

        if (now.isBefore(openTime) || now.isAfter(closeTime)) {
            req.session.error = "The clinic is currently closed. Clinic hours are 7:30 AM to 5:30 PM.";
            return req.session.save(() => res.redirect('/h'));
        }

        // 0b. Check if user already has a pending visit today
        const startOfDay = dayjs().startOf('day').toDate();
        const endOfDay = dayjs().endOf('day').toDate();

        const existingVisit = await Visits.findOne({
            patient: userId,
            archive: false,
            status: { $ne: 'Attended' },
            createdAt: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        if (existingVisit) {
            req.session.error = "You already have a pending visit request today. Please wait until it's attended before submitting another.";
            return req.session.save(() => res.redirect('/h'));
        }

        // 0c. Check and deduct medicine stock first
        let updatedStock = null;
        const hasMedicineRequest =
            item &&
            qty &&
            item.trim() !== "" &&
            Number(qty) > 0;

        if (hasMedicineRequest) {
            const quantity = Number(qty);

            updatedStock = await Stocks.findOneAndUpdate(
                {
                    name: item,
                    type: 'medicine',
                    archive: false,
                    remaining: { $gte: quantity }
                },
                {
                    $inc: {
                        remaining: -quantity
                    }
                },
                {
                    new: true
                }
            );

            if (!updatedStock) {
                const stockCheck = await Stocks.findOne({
                    name: item,
                    type: 'medicine',
                    archive: false
                });

                if (!stockCheck) {
                    req.session.error = `Medicine "${item}" is no longer available.`;
                } else {
                    req.session.error = `Not enough stock for "${item}". Only ${stockCheck.remaining} ${stockCheck.unit} left.`;
                }

                return req.session.save(() => res.redirect('/h'));
            }
        }

        try {

            // 1. Save Visit (Mother Record)
            const savedVisit = await Visits.create({
                patient: userId,
                concern: concern || "Health Consultation",
                status: "Pending",
                archive: false,
                verify: true
            });

            // 2. Save Complaint (Child Record)
            if (complaint && complaint.trim() !== "") {
                await Complaint.create({
                    visitId: savedVisit._id,
                    type: complaint.trim()
                });
            }

            // 3. Save Dispensed Medicine
            if (hasMedicineRequest && updatedStock) {
                await Dispense.create({
                    visitId: savedVisit._id,
                    who: userId,
                    type: "medicine",
                    item: item,
                    qty: Number(qty),
                    unit: updatedStock.unit
                });
            }

            // 4. Activity Log
            await Logs.create({
                who: userId,
                what: hasMedicineRequest
                    ? `Submitted a visit request: ${concern || "Health Consultation"} (with ${qty} ${updatedStock.unit} of "${item}")`
                    : `Submitted a visit request: ${concern || "Health Consultation"}`,
                archive: false
            });

            req.session.success = "Request Submitted Successfully!";
            return res.redirect("/h");

        } catch (innerErr) {

            // Restore deducted stock if something failed
            if (hasMedicineRequest && updatedStock) {
                await Stocks.findByIdAndUpdate(
                    updatedStock._id,
                    {
                        $inc: {
                            remaining: Number(qty)
                        }
                    }
                );
            }

            throw innerErr;
        }

    } catch (err) {
        console.error("Submission Error:", err);

        req.session.error = "An error occurred while submitting.";
        req.session.save(() => res.redirect("/h"));
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
        // Check & Deduct Stock (kung may piniling gamot)
        // ==========================
        let updatedStock = null;
        const hasMedicineRequest = item && item.trim() !== "" && qty && Number(qty) > 0;

        if (hasMedicineRequest) {
            const quantity = Number(qty);

            updatedStock = await Stocks.findOneAndUpdate(
                {
                    name: item,
                    type: 'medicine',
                    archive: false,
                    remaining: { $gte: quantity } // dapat sapat ang stock
                },
                {
                    $inc: { remaining: -quantity }
                },
                { new: true }
            );

            if (!updatedStock) {
                const stockCheck = await Stocks.findOne({ name: item, type: 'medicine', archive: false });

                if (!stockCheck) {
                    req.session.error = `Medicine "${item}" is no longer available.`;
                } else {
                    req.session.error = `Not enough stock for "${item}". Only ${stockCheck.remaining} ${stockCheck.unit} left.`;
                }

                return res.redirect("/v2");
            }
        }

        try {
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
            if (hasMedicineRequest && updatedStock) {
                await new Dispense({
                    visitId: savedVisit._id,
                    who: patientId,
                    type: "medicine",
                    item,
                    qty: Number(qty),
                    unit: updatedStock.unit // galing sa stock record, hindi hardcoded
                }).save();
            }

            // ==========================
            // Log Activity
            // ==========================
            const patientUser = await Users.findById(patientId);

            await Logs.create({
                who: sessionUserId,
                what: hasMedicineRequest
                    ? `Created a visit record for ${patientUser ? patientUser.fName + ' ' + patientUser.lName : 'a patient'} (with ${qty} ${updatedStock.unit} of "${item}")`
                    : `Created a visit record for ${patientUser ? patientUser.fName + ' ' + patientUser.lName : 'a patient'}`,
                archive: false
            });

            // ==========================
            // Success
            // ==========================
            req.session.success = "Request Submitted Successfully!";
            res.redirect("/v2");

        } catch (innerErr) {
            // Kung nabigo ang pag-save PAGKATAPOS na-deduct na ang stock,
            // ibalik ang stock para hindi mapunta sa limbo ang bawas
            if (hasMedicineRequest && updatedStock) {
                await Stocks.findByIdAndUpdate(updatedStock._id, { $inc: { remaining: Number(qty) } });
            }
            throw innerErr;
        }

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

        const visit = await Visits.findByIdAndUpdate(
            requestId,
            {
                status: 'Proceed',
                verify: false
            },
            { new: true }
        );

        // ✅ Notification (in-app)
        if (visit) {

            await Notification.create({
                who: visit.patient,
                message: 'You may now proceed to the clinic.',
                type: 'visit',
                link: `/vv1/${visit._id}`
            });

            // ✅ Log Activity
            const patient = await Users.findById(visit.patient);

            await Logs.create({
                who: req.session.user._id,
                what: `Approved visit request to proceed: ${
                    patient ? patient.fName + ' ' + patient.lName : 'Unknown patient'
                }`,
                archive: false
            });

            // ==========================
            // SEND EMAIL (SENDGRID)
            // ==========================
            try {

                if (patient && patient.email) {

                    const mailOptions = {
                        from: `AuCare Support <${process.env.EMAIL_USER}>`,
                        to: patient.email,
                        subject: "AuCare: You May Now Proceed to the Clinic",
                        html: `
                            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">

                                <h2 style="color:#0056b3;text-align:center;">
                                    Visit Update
                                </h2>

                                <p>Hello ${patient.fName},</p>

                                <p>
                                    Your clinic visit request has been reviewed.
                                </p>

                                <p>
                                    <strong>You may now proceed to the clinic.</strong>
                                </p>

                                <p style="color:red;">
                                    Please head to the clinic at your earliest convenience.
                                </p>

                                <p>
                                    Thank you,<br>
                                    <strong>AuCare Team</strong>
                                </p>

                            </div>
                        `
                    };

                    await sgMail.send(mailOptions);

                    console.log("Proceed request email sent to:", patient.email);

                }

            } catch (mailErr) {

                console.error("========== SENDGRID EMAIL ERROR ==========");
                console.error(mailErr);

                if (mailErr.response) {
                    console.error(mailErr.response.body);
                }

                console.error("Failed to send proceed request email to:", patient?.email);

                // Huwag i-throw ang error.
                // Tuloy pa rin ang route kahit pumalya ang email.

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

        await Logs.create({
            who: req.session.user._id,
            what: `Updated vitals for visit ID: ${req.params.id}`,
            archive: false
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

        await Logs.create({
            who: req.session.user._id,
            what: `Cleared vitals for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) {
        res.redirect('back');
    }
});

app.post('/visit/vitals2/:id', async (req, res) => {
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

        await Logs.create({
            who: req.session.user._id,
            what: `Updated vitals for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${req.params.id}`);
    } catch (err) {
        console.error(err);
        res.redirect('back');
    }
});

// 2. DELETE/CLEAR VITALS
app.post('/visit/vitals2/delete/:id', async (req, res) => {
    try {
        await Visits.findByIdAndUpdate(req.params.id, {
            $set: {
                bloodPressure: { systolic: null, diastolic: null },
                hBeat: null,
                temperature: '' // Clear temperature
            }
        });

        await Logs.create({
            who: req.session.user._id,
            what: `Cleared vitals for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${req.params.id}`);
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

        // ✅ Log Activity
        const patient = await Users.findById(visit.patient);

        await Logs.create({
            who: req.session.user._id,
            what: `Marked visit as Attended for ${
                patient ? patient.fName + ' ' + patient.lName : 'Unknown patient'
            }`,
            archive: false
        });

        // ==========================
        // SEND EMAIL (SENDGRID)
        // ==========================
        try {

            if (patient && patient.email) {

                const mailOptions = {
                    from: `AuCare Support <${process.env.EMAIL_USER}>`,
                    to: patient.email,
                    subject: "AuCare: Your Visit Has Been Attended",
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">

                            <h2 style="color:#0056b3;text-align:center;">
                                Visit Completed
                            </h2>

                            <p>Hello ${patient.fName},</p>

                            <p>
                                Your clinic visit has been successfully marked as
                                <strong>Attended</strong>.
                            </p>

                            <p>
                                Thank you for visiting the AuCare Clinic.
                            </p>

                            <p>
                                We hope you're feeling better. If you need further
                                medical assistance, don't hesitate to visit us again.
                            </p>

                            <br>

                            <p>
                                Thank you,<br>
                                <strong>AuCare Team</strong>
                            </p>

                        </div>
                    `
                };

                await sgMail.send(mailOptions);

                console.log("Visit completion email sent to:", patient.email);

            }

        } catch (mailErr) {

            console.error("========== SENDGRID EMAIL ERROR ==========");
            console.error(mailErr);

            if (mailErr.response) {
                console.error(mailErr.response.body);
            }

            console.error("Failed to send visit completion email to:", patient?.email);

            // Huwag i-throw ang error.
            // Tuloy pa rin ang route kahit pumalya ang email.

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

        await Logs.create({
            who: req.session.user._id,
            what: `Updated treatment for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) {
        res.redirect('back');
    }
});

app.post('/visit/treatment/delete/:id', async (req, res) => {
    try {
        await Visits.findByIdAndUpdate(req.params.id, { treatment: '', status: 'Proceed' });

        await Logs.create({
            who: req.session.user._id,
            what: `Cleared treatment for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

app.post('/visit/update-treatment2/:id', async (req, res) => {
    try {
        const visit = await Visits.findByIdAndUpdate(req.params.id, {
            treatment: req.body.treatment,
        }, { new: true });

        await Logs.create({
            who: req.session.user._id,
            what: `Updated treatment for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${req.params.id}`);
    } catch (err) {
        res.redirect('back');
    }
});

app.post('/visit/treatment2/delete/:id', async (req, res) => {
    try {
        await Visits.findByIdAndUpdate(req.params.id, { treatment: '', status: 'Proceed' });

        await Logs.create({
            who: req.session.user._id,
            what: `Cleared treatment for visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

// --- 3. MEDICINE (Add & Delete) ---

app.post('/visit/add-medicine/:id', async (req, res) => {
    try {
        const { item, qty, unit, remarks } = req.body;
        const quantity = parseInt(qty, 10);

        // Basic validation
        if (!item || !quantity || quantity <= 0) {
            req.session.errorMsg = "Please select a valid medicine and quantity.";
            return res.redirect('back');
        }

        const visit = await Visits.findById(req.params.id);
        if (!visit) {
            req.session.errorMsg = "Visit not found.";
            return res.redirect('back');
        }

        // Atomically deduct stock ONLY if enough remaining exists
        // Prevents race conditions (two people dispensing at the same time)
        const updatedStock = await Stocks.findOneAndUpdate(
            {
                name: item,
                type: 'medicine',
                archive: false,
                remaining: { $gte: quantity } // must have enough stock
            },
            {
                $inc: { remaining: -quantity }
            },
            { new: true }
        );

        // If null, either the medicine doesn't exist, or not enough stock remaining
        if (!updatedStock) {
            const stockCheck = await Stocks.findOne({ name: item, type: 'medicine', archive: false });

            if (!stockCheck) {
                req.session.errorMsg = `Medicine "${item}" not found in stocks.`;
            } else {
                req.session.errorMsg = `Not enough stock for "${item}". Only ${stockCheck.remaining} ${stockCheck.unit} left.`;
            }

            return res.redirect('back');
        }

        // Record the dispense using the actual unit from stocks (not user input)
        await Dispense.create({
            visitId: req.params.id,
            who: visit.patient,
            type: 'medicine',
            item,
            qty: quantity,
            unit: updatedStock.unit,
            remarks
        });

        await Logs.create({
            who: req.session.user._id,
            what: `Added medicine "${item}" (${quantity} ${updatedStock.unit}) to visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) {
        console.error('Error in add-medicine route:', err.message);
        res.redirect('back');
    }
});

app.post('/visit/medicine/delete/:id', async (req, res) => {
    try {
        const dispensedItem = await Dispense.findByIdAndDelete(req.params.id);

        if (!dispensedItem) {
            return res.redirect('back');
        }

        // Ibalik ang stock na nabawas noong na-dispense ito
        const restoredStock = await Stocks.findOneAndUpdate(
            {
                name: dispensedItem.item,
                type: 'medicine'
                // hindi natin nilagyan ng archive:false dito, para kahit na-archive na yung
                // stock item pagkatapos i-dispense, mababawi pa rin ang tamang quantity
            },
            {
                $inc: { remaining: dispensedItem.qty }
            },
            { new: true }
        );

        await Logs.create({
            who: req.session.user._id,
            what: restoredStock
                ? `Removed medicine "${dispensedItem.item}" (${dispensedItem.qty} ${dispensedItem.unit}) from visit ID: ${dispensedItem.visitId} — stock restored (now ${restoredStock.remaining} ${restoredStock.unit})`
                : `Removed medicine "${dispensedItem.item}" from visit ID: ${dispensedItem.visitId} — WARNING: matching stock item not found, stock not restored`,
            archive: false
        });

        res.redirect(`/vv2/${dispensedItem.visitId}`);
    } catch (err) {
        console.error('Error in medicine delete route:', err.message);
        res.redirect('back');
    }
});

app.post('/visit/add-medicine2/:id', async (req, res) => {
    try {
        const { item, qty, unit, remarks } = req.body;
        const quantity = parseInt(qty, 10);

        // Basic validation
        if (!item || !quantity || quantity <= 0) {
            req.session.errorMsg = "Please select a valid medicine and quantity.";
            return res.redirect('back');
        }

        const visit = await Visits.findById(req.params.id);
        if (!visit) {
            req.session.errorMsg = "Visit not found.";
            return res.redirect('back');
        }

        // Atomically deduct stock ONLY if enough remaining exists
        // Prevents race conditions (two people dispensing at the same time)
        const updatedStock = await Stocks.findOneAndUpdate(
            {
                name: item,
                type: 'medicine',
                archive: false,
                remaining: { $gte: quantity } // must have enough stock
            },
            {
                $inc: { remaining: -quantity }
            },
            { new: true }
        );

        // If null, either the medicine doesn't exist, or not enough stock remaining
        if (!updatedStock) {
            const stockCheck = await Stocks.findOne({ name: item, type: 'medicine', archive: false });

            if (!stockCheck) {
                req.session.errorMsg = `Medicine "${item}" not found in stocks.`;
            } else {
                req.session.errorMsg = `Not enough stock for "${item}". Only ${stockCheck.remaining} ${stockCheck.unit} left.`;
            }

            return res.redirect('back');
        }

        // Record the dispense using the actual unit from stocks (not user input)
        await Dispense.create({
            visitId: req.params.id,
            who: visit.patient,
            type: 'medicine',
            item,
            qty: quantity,
            unit: updatedStock.unit,
            remarks
        });

        await Logs.create({
            who: req.session.user._id,
            what: `Added medicine "${item}" (${quantity} ${updatedStock.unit}) to visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${req.params.id}`);
    } catch (err) {
        console.error('Error in add-medicine route:', err.message);
        res.redirect('back');
    }
});

app.post('/visit/medicine2/delete/:id', async (req, res) => {
    try {
        const dispensedItem = await Dispense.findByIdAndDelete(req.params.id);

        if (!dispensedItem) {
            return res.redirect('back');
        }

        // Ibalik ang stock na nabawas noong na-dispense ito
        const restoredStock = await Stocks.findOneAndUpdate(
            {
                name: dispensedItem.item,
                type: 'medicine'
                // hindi natin nilagyan ng archive:false dito, para kahit na-archive na yung
                // stock item pagkatapos i-dispense, mababawi pa rin ang tamang quantity
            },
            {
                $inc: { remaining: dispensedItem.qty }
            },
            { new: true }
        );

        await Logs.create({
            who: req.session.user._id,
            what: restoredStock
                ? `Removed medicine "${dispensedItem.item}" (${dispensedItem.qty} ${dispensedItem.unit}) from visit ID: ${dispensedItem.visitId} — stock restored (now ${restoredStock.remaining} ${restoredStock.unit})`
                : `Removed medicine "${dispensedItem.item}" from visit ID: ${dispensedItem.visitId} — WARNING: matching stock item not found, stock not restored`,
            archive: false
        });

        res.redirect(`/crv/${dispensedItem.visitId}`);
    } catch (err) {
        console.error('Error in medicine delete route:', err.message);
        res.redirect('back');
    }
});

// --- 4. COMPLAINTS (Add & Delete) ---
app.post('/visit/complaint/add/:id', async (req, res) => {
    try {
        await Complaint.create({ visitId: req.params.id, type: req.body.type });

        await Logs.create({
            who: req.session.user._id,
            what: `Added complaint "${req.body.type}" to visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/vv2/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

app.post('/visit/complaint/delete/:id', async (req, res) => {
    try {
        const item = await Complaint.findByIdAndDelete(req.params.id);

        await Logs.create({
            who: req.session.user._id,
            what: `Removed complaint "${item ? item.type : 'Unknown'}" from visit ID: ${item ? item.visitId : req.params.id}`,
            archive: false
        });

        res.redirect(`/vv2/${item.visitId}`);
    } catch (err) { res.redirect('back'); }
});

app.post('/visit/complaint2/add/:id', async (req, res) => {
    try {
        await Complaint.create({ visitId: req.params.id, type: req.body.type });

        await Logs.create({
            who: req.session.user._id,
            what: `Added complaint "${req.body.type}" to visit ID: ${req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${req.params.id}`);
    } catch (err) { res.redirect('back'); }
});

app.post('/visit/complaint2/delete/:id', async (req, res) => {
    try {
        const item = await Complaint.findByIdAndDelete(req.params.id);

        await Logs.create({
            who: req.session.user._id,
            what: `Removed complaint "${item ? item.type : 'Unknown'}" from visit ID: ${item ? item.visitId : req.params.id}`,
            archive: false
        });

        res.redirect(`/crv/${item.visitId}`);
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

        const newUser = await Users.create({
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
            verify: true,
            suspend: false,
            access: 0,
            reset: false,
            dump: false
        });

        await Logs.create({
            who: newUser._id,
            what: `New account registered: ${newUser.fName} ${newUser.lName} (${newUser.email})`,
            archive: false
        });

        return res.status(200).json({ success: true });

        } catch (err) {
        console.log(err);

        // Kung dalawang tao ang nag-sign up nang sabay-sabay gamit ang parehong
        // schoolId/email, ito ang huling depensa laban sa duplicate (MongoDB unique index)
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: "That email or School/Employee ID is already registered." });
        }

        return res.status(500).json({ success: false, message: "Registration failed. " + err.message });
    }
});

app.post('/api/users/approve/:id', isLogin, async (req, res) => {
    try {
        const { id } = req.params;

        // Real temp password, generated only now that the account is approved
        const tempPassword = crypto.randomBytes(4).toString('hex');

        const user = await Users.findByIdAndUpdate(
            id,
            {
                verify: false,
                verifyAt: Date.now(),
                isVerify: req.session.user.username,
                password: tempPassword,
                reset: true
            },
            { new: true }
        );

        if (!user) {
            return res.json({
                success: false,
                message: 'User not found.'
            });
        }

        await Logs.create({
            who: req.session.user._id,
            what: `Approved account: ${user.username} (${user.fName} ${user.lName})`,
            archive: false
        });

        // Create notification regardless of email result
        await Notification.create({
            who: user._id,
            message: 'Your account is approved. Check your email for a temporary password.',
            type: 'approval',
            link: '/p2'
        });

        // Return success immediately
        res.json({ success: true });

        // Send email in the background
        const mailOptions = {
            from: `AuCare Support <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Your AuCare Account Has Been Approved",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto; padding: 20px; border: 1px solid #eee;">
                    <h2 style="color:#0056b3;text-align:center;">
                        Account Approved
                    </h2>

                    <p>Hello ${user.fName},</p>

                    <p>
                        Your AuCare account has been reviewed and approved.
                        Log in using your email and the temporary password below:
                    </p>

                    <p>
                        <strong>Email (Username):</strong> ${user.email}
                    </p>

                    <div style="
                        background:#f4f4f4;
                        padding:15px;
                        text-align:center;
                        font-size:28px;
                        font-weight:bold;
                        letter-spacing:4px;
                    ">
                        ${tempPassword}
                    </div>

                    <p style="color:red;">
                        You'll be required to set a new password immediately after logging in.
                    </p>

                    <p>
                        Thank you,<br>
                        <strong>AuCare Team</strong>
                    </p>
                </div>
            `
        };

        try {
            await sgMail.send(mailOptions);
            console.log(`Approval email sent to ${user.email}`);
        } catch (emailErr) {
            console.error('================ EMAIL ERROR ================');
            console.error(emailErr);

            if (emailErr.response) {
                console.error(emailErr.response.body);
            }

            console.error('Failed to send approval email to:', user.email);
            // Don't throw the error.
            // The account is already approved.
        }

    } catch (err) {
        console.error('Approve Error:', err);

        return res.json({
            success: false,
            message: 'Failed to approve account.'
        });
    }
});

app.post('/api/users/reject/:id', isLogin, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await Users.findByIdAndDelete(id);

        if (!user) {
            return res.json({ success: false, message: 'User not found.' });
        }

        await Logs.create({
            who: req.session.user._id,
            what: `Rejected pending account: ${user.username} (${user.fName} ${user.lName})`,
            archive: false
        });

        res.json({ success: true });

    } catch (err) {
        console.error('Reject Error:', err);
        res.json({ success: false, message: 'Failed to reject account.' });
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