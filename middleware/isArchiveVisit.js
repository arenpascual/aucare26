const Visits = require('../model/visit');
const Users = require('../model/user');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Allergy = require('../model/allergy');

const isArchiveVisit = async (req, res, next) => {
    try {
        // 1. Fetch all visits that are not archived
        // We populate 'patient' to get User details (name, role, etc.)
        const allVisits = await Visits.find({ archive: true, verify: true })
            .populate('patient')
            .sort({ _id: -1 })
            .lean();

        // 2. Prepare for batch fetching related data
        const visitIds = allVisits.map(v => v._id);
        const patientIds = allVisits.map(v => v.patient._id);

        // 3. Fetch related data using your flow requirements
        const [allComplaints, allDispensed, allAllergies] = await Promise.all([
            // complaint.visitID = visit.id
            Complaint.find({ visitId: { $in: visitIds } }).lean(),
            // dispense.visitId = visit.id
            Dispense.find({ visitId: { $in: visitIds } }).lean(),
            // allergy.who = user.id
            Allergy.find({ who: { $in: patientIds } }).lean()
        ]);

        // 4. Combine everything into the visit objects
        const detailedVisits = allVisits.map(visit => {
            const patientId = visit.patient._id.toString();
            const visitId = visit._id.toString();

            return {
                ...visit,
                // Attach multiple complaints for this visit
                complaints: allComplaints.filter(c => c.visitId.toString() === visitId),
                // Attach medicines/supplies dispensed during this visit
                dispensed: allDispensed.filter(d => d.visitId.toString() === visitId),
                // Attach the patient's allergies (linked via patient ID)
                patientAllergies: allAllergies.filter(a => a.who.toString() === patientId)
            };
        });

        // 5. Store in res.locals for EJS
        res.locals.allVisits = detailedVisits;

        next();
    } catch (err) {
        console.error('Error in isArchiveVisit middleware:', err.message);
        res.locals.allVisits = [];
        next();
    }
};

module.exports = isArchiveVisit;