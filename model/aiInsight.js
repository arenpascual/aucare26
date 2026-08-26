// model/aiInsight.js
const mongoose = require('mongoose');

const aiInsightSchema = new mongoose.Schema({
  category: String,
  title: String,
  message: String,
  generatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AiInsight', aiInsightSchema);