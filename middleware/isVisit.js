const Visits = require('../model/visit');
const Users = require('../model/user');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Allergy = require('../model/allergy');

const isVisit = async (req, res, next) => {
    try {
        // 1. Fetch visits (unarchived & unverified)
        const allVisits = await Visits.find({ archive: false, verify: false })
            .populate('patient')
            .sort({ _id: -1 })
            .lean();

        // 2. Safely filter out visits where patient is null or deleted
        const validVisits = allVisits.filter(v => v.patient && v.patient._id);

        // 3. Extract IDs safely (Unique patient IDs to prevent redundant queries)
        const visitIds = validVisits.map(v => v._id);
        const patientIds = [...new Set(validVisits.map(v => v.patient._id.toString()))];

        // 4. Batch fetch related data
        const [allComplaints, allDispensed, allAllergies] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean(),
            Allergy.find({ who: { $in: patientIds } }).lean()
        ]);

        // 5. Combine data back with optional chaining (?.)
        const detailedVisits = validVisits.map(visit => {
            const patientId = visit.patient._id.toString();
            const visitId = visit._id.toString();

            return {
                ...visit,
                complaints: allComplaints.filter(c => c.visitId?.toString() === visitId),
                dispensed: allDispensed.filter(d => d.visitId?.toString() === visitId),
                patientAllergies: allAllergies.filter(a => a.who?.toString() === patientId)
            };
        });

        // 6. Pass data to EJS
        res.locals.allVisits = detailedVisits;

        next();
    } catch (err) {
        console.error('Error in isVisit middleware:', err.message);
        res.locals.allVisits = [];
        next();
    }
};

module.exports = isVisit;