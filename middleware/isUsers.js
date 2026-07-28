const Users = require('../model/user');
const Allergy = require('../model/allergy');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint'); // New model for multiple complaints
const Dispense = require('../model/dispense');   // New model for medicines/supplies used

const isUsers = async (req, res, next) => {
    try {
        // Define roles matching your schema enums 
        const allowedRoles = [
            'Student', 
            'Faculty', 
            'Staff', 

        ];

        // 1. Fetch filtered active users [cite: 46, 51, 53, 58]
        const activeUsers = await Users.find({
            archive: false,
            verify: false, 
            suspend: false,
            role: { $in: allowedRoles }
        }).lean();

        // Get IDs for batch querying
        const userIds = activeUsers.map(user => user._id);

        // 2. Fetch all related data in parallel for all found users
        const [allAllergies, allVisits] = await Promise.all([
            Allergy.find({ who: { $in: userIds } }).lean(),
            Visits.find({ patient: { $in: userIds } }).lean()
        ]);

        // Get visit IDs to fetch complaints and dispensed items specific to those visits
        const visitIds = allVisits.map(visit => visit._id);

        const [allComplaints, allDispensed] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean()
        ]);

        // 3. Assemble the data hierarchy: User -> Visits -> (Complaints & Dispensed)
        const usersWithFullData = activeUsers.map(user => {
            // Get allergies for this specific user
            const userAllergies = allAllergies.filter(a => 
                a.who.toString() === user._id.toString()
            );

            // Get visits for this specific user
            const userVisits = allVisits.filter(v => 
                v.patient.toString() === user._id.toString()
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
                ...user,
                allergies: userAllergies,
                visits: userVisits
            };
        });

        // 4. Set global variable for EJS access [cite: 248, 257]
        res.locals.allUsers = usersWithFullData;

        next();
    } catch (err) {
        console.error('Error in isUsers middleware:', err.message);
        res.locals.allUsers = [];
        next();
    }
};

module.exports = isUsers;