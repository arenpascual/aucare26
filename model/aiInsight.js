// model/aiInsight.js
const mongoose = require('mongoose');

const aiInsightSchema = new mongoose.Schema({
  category: String,
  title: String,
  message: String,
  filterLabel: String, // anong filter ang pinagbasehan ng insight na ito
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' }, // sino ang nag-generate
  generatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AiInsight', aiInsightSchema);  