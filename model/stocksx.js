const mongoose = require('mongoose');

const StocksSchema = new mongoose.Schema({
 archive: { type: Boolean, default: false },

type: { type: String, enum: ['medicine', 'supply'], required: true },

name: { type: String, required: true, trim: true },
description: { type: String, trim: true },

price: { type: Number, required: true, min: 0 },
unit: { type: String, required: true, trim: true },

remaining: { type: Number, required: true, min: 0, default: 0 },
beginning: { type: Number, required: true, min: 0 },

restockAt: { type: Number, min: 0, default: 0 },

default: { type: Number, required: true, min: 1}

});
module.exports = mongoose.model('stocks', StocksSchema);