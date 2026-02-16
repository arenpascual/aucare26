const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
    // visitId: Links this complaint to a specific visit
    visitId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'visit',
        required: true
    },
    // type: The specific medical complaint (e.g., "Headache", "Fever")
    type: {
        type: String,
        required: true,
        trim: true
    }
}, { timestamps: true });

module.exports = mongoose.model('complaint', complaintSchema);