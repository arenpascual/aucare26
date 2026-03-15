const Visits = require('../model/visit');
const Complaint = require('../model/complaint');
const Dispense = require('../model/dispense');
const Allergy = require('../model/allergy');

const itsVisit = async (req, res, next) => {
    try {
        const visitId = req.params.id; // Kunin ang ID mula sa URL

        // 1. Fetch the specific visit using ID and populate patient
        const visit = await Visits.findById(visitId)
            .populate('patient')
            .lean();

        if (!visit) {
            console.error('Visit not found');
            return res.redirect('/v2'); // Ibalik sa listahan kung walang nahanap
        }

        // 2. Fetch related data for this SPECIFIC visit only
        const [complaints, dispensed, allergies] = await Promise.all([
            // complaint.visitId = visit.id
            Complaint.find({ visitId: visit._id }).lean(),
            // dispense.visitId = visit.id
            Dispense.find({ visitId: visit._id }).lean(),
            // allergy.who = patient.id
            Allergy.find({ who: visit.patient._id }).lean()
        ]);

        // 3. Combine the data into one object
        const detailedVisit = {
            ...visit,
            complaints,
            dispensed,
            patientAllergies: allergies
        };

        // 4. Store in res.locals.v (v para maikli gamitin sa EJS)
        res.locals.v = detailedVisit;

        next();
    } catch (err) {
        console.error('Error in isVisit middleware:', err.message);
        res.redirect('/v2');
    }
};

module.exports = itsVisit;