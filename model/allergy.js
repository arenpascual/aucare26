const mongoose = require('mongoose');

const allergySchema = new mongoose.Schema({
  who: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'user',
  required: true
},

 isAllergy: { type: String, trim: true },

});
module.exports = mongoose.model('allergy', allergySchema);