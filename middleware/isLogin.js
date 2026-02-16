const Users = require('../model/user');
const Allergy = require('../model/allergy');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');

const isLogin = async (req, res, next) => {
    try {
        // 1. Check if user session exists
        if (!req.session || !req.session.user) {
            // Allow access to the login/landing page to prevent infinite redirects
            if (req.path === '/' || req.path === '/') {
                return next();
            }
            req.session.denied = "Please login to access this page.";
            return res.redirect('/'); 
        }

        const userId = req.session.user._id;

        // 2. Fetch User and their specific Allergies and Visits
        const [userData, userAllergies, userVisits] = await Promise.all([
            Users.findById(userId).lean(),
            Allergy.find({ who: userId }).lean(),
            Visits.find({ patient: userId }).lean()
        ]);

        if (!userData) {
            req.session.user = null;
            req.session.error = "User account not found.";
            return res.redirect('/');
        }

        // 3. Fetch Complaints and Dispensed items related to this user's visits
        const visitIds = userVisits.map(v => v._id);
        const [allComplaints, allDispensed] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean()
        ]);

        // 4. Map the data: Nest Complaints and Dispensed items inside each Visit
        const detailedVisits = userVisits.map(visit => {
            return {
                ...visit,
                complaints: allComplaints.filter(c => c.visitId.toString() === visit._id.toString()),
                dispensed: allDispensed.filter(d => d.visitId.toString() === visit._id.toString())
            };
        });

        // 5. Attach fresh data to res.locals for EJS access
        res.locals.user = userData;
        res.locals.allergies = userAllergies;
        res.locals.visits = detailedVisits;
        
        // Update session with fresh data
        req.session.user = userData;

        next();
    } catch (err) {
        console.error('⚠️ Authentication Middleware Error:', err.message);
        res.status(500).render('index', { 
            title: 'Error', 
            error: 'An internal error occurred during authentication.' 
        });
    }
};

module.exports = isLogin;