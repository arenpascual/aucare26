const mongoose = require('mongoose');

const stockSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['medicine', 'supply'],
    required: true
  },
  unit: {
    type: String,
    required: true,
    trim: true
  },
  remaining: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  archive: {
    type: Boolean,
    default: false
  },
  // --- MEDICINE ATTRIBUTES ---
  genericName: {
    type: String,
    trim: true,
    default: ''
  },
  brandName: {
    type: String,
    trim: true,
    default: ''
  },
  isLocal: {
    type: Boolean,
    default: false
  },
  medicineForm: {
    type: String,
    enum: ['', 'Tablet', 'Capsule', 'Syrup', 'Suspension', 'Ointment', 'Drop', 'Inhaler'],
    default: ''
  },
  dosageStrength: {
    type: String,
    trim: true,
    default: ''
  },
  // --- MEDICAL SUPPLIES ATTRIBUTES ---
  category: {
    type: String,
    enum: ['', 'Disinfectant', 'Bandaging', 'Personal Protective Equipment (PPE)', 'Diagnostic Tool'],
    default: ''
  },
  sizeSpecification: {
    type: String,
    trim: true,
    default: ''
  },
  // --- SHARED ATTRIBUTES ---
  expirationDate: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Stocks', stockSchema);