const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
 who: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'user',
  required: true

 },
  what: { type: String, trim: true },

 archive: { type: Boolean, default: false },
 
});
module.exports = mongoose.model('log', logSchema);