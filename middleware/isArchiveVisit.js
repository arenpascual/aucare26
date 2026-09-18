const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Allergy = require('../model/allergy');

const isArchiveVisit = async (req, res, next) => {
    try {
        const archivedVisits = await Visits.find({ archive: true })
            .populate('patient')
            .sort({ createdAt: -1 })
            .lean();

        const validVisits = archivedVisits.filter(v => v.patient && v.patient._id);
        const visitIds = validVisits.map(v => v._id);
        const patientIds = [...new Set(validVisits.map(v => v.patient._id.toString()))];

        const [allComplaints, allDispensed, allAllergies] = await Promise.all([
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            Dispense.find({ visitId: { $in: visitIds } }).lean(),
            Allergy.find({ who: { $in: patientIds } }).lean()
        ]);

        const detailedVisits = validVisits.map(visit => {
            const visitId = visit._id.toString();
            const patientId = visit.patient._id.toString();

            return {
                ...visit,
                complaints: allComplaints.filter(c => c.visitId?.toString() === visitId),
                dispensed: allDispensed.filter(d => d.visitId?.toString() === visitId),
                patientAllergies: allAllergies.filter(a => a.who?.toString() === patientId)
            };
        });

        res.locals.allRequest = detailedVisits;

        next();
    } catch (err) {
        console.error('Error in isArchiveVisit middleware:', err.message);
        res.locals.allRequest = [];
        next();
    }
};

module.exports = isArchiveVisit;