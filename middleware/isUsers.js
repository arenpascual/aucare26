const Users = require('../model/user');
const Allergy = require('../model/allergy');
const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');

// Pinagsasama-sama ang items ayon sa key (isang pass lang)
const groupBy = (items, key) => {
    const map = new Map();
    for (const item of items) {
        const k = String(item[key]);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(item);
    }
    return map;
};

const isUsers = async (req, res, next) => {
    try {
        const allowedRoles = [
            'Student',
            'Faculty',
            'Staff',
        ];

        const activeUsers = await Users.find({
            archive: false,
            verify: false,
            suspend: false,
            role: { $in: allowedRoles }
        }).lean();

        const userIds = activeUsers.map(user => user._id);

        const [allAllergies, allVisits] = await Promise.all([
            Allergy.find({ who: { $in: userIds } }).lean(),
            Visits.find({ patient: { $in: userIds } }).lean()
        ]);

        const visitIds = allVisits.map(visit => visit._id);

        const [allComplaints, allDispensed] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean()
        ]);

        const allergiesByUser = groupBy(allAllergies, 'who');
        const visitsByUser = groupBy(allVisits, 'patient');
        const complaintsByVisit = groupBy(allComplaints, 'visitId');
        const dispensedByVisit = groupBy(allDispensed, 'visitId');

        const usersWithFullData = activeUsers.map(user => {
            const uid = String(user._id);

            const userVisits = (visitsByUser.get(uid) || []).map(visit => {
                const vid = String(visit._id);

                return {
                    ...visit,
                    complaints: complaintsByVisit.get(vid) || [],
                    dispensed: dispensedByVisit.get(vid) || []
                };
            });

            return {
                ...user,
                allergies: allergiesByUser.get(uid) || [],
                visits: userVisits
            };
        });

        res.locals.allUsers = usersWithFullData;

        next();
    } catch (err) {
        console.error('Error in isUsers middleware:', err.message);
        res.locals.allUsers = [];
        next();
    }
};

module.exports = isUsers;