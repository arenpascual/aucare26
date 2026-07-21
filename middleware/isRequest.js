const Visits = require('../model/visit');
const Users = require('../model/user');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Allergy = require('../model/allergy');

const isRequest = async (req, res, next) => {
    try {
        // 1. Fetch all visits na hindi archived at verified
        const allRequest = await Visits.find({ archive: false, verify: true })
            .populate('patient')
            .sort({ _id: -1 })
            .lean();

        // 2. Filter out visits na may null/deleted patient para iwas crash
        const validVisits = allRequest.filter(v => v.patient && v.patient._id);

        // 3. Prepare IDs safely
        const visitIds = validVisits.map(v => v._id);
        // Gumamit ng Set at Array.from para tanggalin ang duplicate patient IDs
        const patientIds = [...new Set(validVisits.map(v => v.patient._id.toString()))];

        // 4. Batch fetch related data
        const [allComplaints, allDispensed, allAllergies] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean(),
            Allergy.find({ who: { $in: patientIds } }).lean()
        ]);

        // 5. Combine data safely
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

        // 6. Pass to template
        res.locals.allRequest = detailedVisits;

        next();
    } catch (err) {
        console.error('Error in isRequest middleware:', err.message);
        res.locals.allRequest = [];
        next();
    }
};

module.exports = isRequest;