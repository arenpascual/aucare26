const Users = require('../model/user');
const Allergy = require('../model/allergy');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');

const IsArchiveAdmin = async (req, res, next) => {
    try {
        // Define Administrative roles
        const allowedRoles = [
            'Super Admin', 
            'Admin', 
            'Sub-Admin'
        ];

        // 1. Fetch filtered active administrative users
        const activeAdmins = await Users.find({
            archive: true,
            verify: false, 
            suspend: false,
            role: { $in: allowedRoles }
        }).lean();

        // Get IDs for batch querying
        const adminIds = activeAdmins.map(user => user._id);

        // 2. Fetch all related data in parallel for all found admins
        const [allAllergies, allVisits] = await Promise.all([
            Allergy.find({ who: { $in: adminIds } }).lean(),
            Visits.find({ patient: { $in: adminIds } }).lean()
        ]);

        // Get visit IDs to fetch complaints and dispensed items specific to those visits
        const visitIds = allVisits.map(visit => visit._id);

        const [allComplaints, allDispensed] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean()
        ]);

        // 3. Assemble the data hierarchy: Admin -> Visits -> (Complaints & Dispensed)
        const adminsWithFullData = activeAdmins.map(admin => {
            // Get allergies for this specific admin
            const adminAllergies = allAllergies.filter(a => 
                a.who.toString() === admin._id.toString()
            );

            // Get visits for this specific admin
            const adminVisits = allVisits.filter(v => 
                v.patient.toString() === admin._id.toString()
            ).map(visit => {
                // For each visit, attach its specific complaints and dispensed items
                return {
                    ...visit,
                    complaints: allComplaints.filter(c => 
                        c.visitId.toString() === visit._id.toString()
                    ),
                    dispensed: allDispensed.filter(d => 
                        d.visitId.toString() === visit._id.toString()
                    )
                };
            });

            return {
                ...admin,
                allergies: adminAllergies,
                visits: adminVisits
            };
        });

        // 4. Set global variable for EJS access
        res.locals.allAdmins = adminsWithFullData;

        next();
    } catch (err) {
        console.error('Error in IsArchiveAdmin middleware:', err.message);
        res.locals.allAdmins = [];
        next();
    }
};

module.exports = IsArchiveAdmin;