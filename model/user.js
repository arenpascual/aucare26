const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  fName: { type: String, required: true, trim: true },
  mName: { type: String, trim: true },
  lName: { type: String, required: true, trim: true },
  xName: { type: String, trim: true },

  archive: { type: Boolean, default: false },
  isArchive: { type: String, trim: true },
  archiveAt: { type: Date },
  
  verify: { type: Boolean, default: false },
  isVerify: { type: String, trim: true },
  verifyAt: { type: Date },

  suspend: { type: Boolean, default: false },
  suspendAt: { type: Date },
  isSuspend: { type: String, trim: true },

  role: {
    type: String,
    enum: ['Student','Admin','Sub Admin','Super Admin', 'Faculty','Staff','Security','Maintenance','Canteen Staff','Visitor','Contractual','Seed','Dev'],
    required: true
  },

  access: { type: Number, enum: [0, 1], default: 0 },
  reset: { type: Boolean, default: false },

  department: { type: String, trim: true },
  campus: { type: String, trim: true },

  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  gender: { type: String, enum: ['Male', 'Female'] },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },

  eName: { type: String, required: true, trim: true },
  ePhone: { type: String, trim: true },
  eAddress: { type: String, trim: true },

  bDay: { type: Number, min: 1, max: 31 },
  bMonth: { type: Number, min: 1, max: 12 },
  bYear: { type: Number },

  height: { type: String, trim: true },
  weight: { type: String, trim: true },

  systolic: { type: Number, min: 50, max: 250 },
  diastolic: { type: Number, min: 30, max: 150 },
  
  disability: { type: String, trim: true },
  fAllergy: { type: String, trim: true },
  mAllergy: { type: String, trim: true },

  
  schoolId: { type: String, trim: true },
  course: { type: String, trim: true },
  yearLevel: { type: String, trim: true },
  section: { type: String, trim: true },

  photo: { type: String, trim: true },

  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },

  // Add this to your userSchema in model/user.js
dump: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('user', userSchema);