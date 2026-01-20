const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
 archive: { type: Boolean, default: false },

status: { type: String, enum: ['pending', 'ongoing', 'completed', 'cancelled'], default: 'pending' },
complaint: { type: String, required: true, trim: true },
treatment: { type: String, trim: true },
patient: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

bloodPressure: {
 systolic: { type: Number, min: 50, max: 250 },
 diastolic: { type: Number, min: 30, max: 150 },
},

hBeat:{ type: Number, min: 30, max: 220}

});
module.exports = mongoose.model('visit', visitSchema);