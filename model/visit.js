const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
 archive: { type: Boolean, default: false },
 verify: { type: Boolean, default: true },

status: { type: String, enum: ['Pending', 'Attended', 'Not Attended', 'Proceed'], default: 'Pending' },
complaint: { type: String, required: false, trim: true },
concern: { type: String, required: true },
treatment: { type: String, trim: true },
patient: {type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },

bloodPressure: {
 systolic: { type: Number, min: 50, max: 250 },
 diastolic: { type: Number, min: 30, max: 150 },
},

hBeat:{ type: Number, min: 30, max: 220},

temperature: { type: String, trim: true },

}
, {
  timestamps: true
});
module.exports = mongoose.model('visit', visitSchema);