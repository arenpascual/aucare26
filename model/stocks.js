// model/stocks.js
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
        trim: true       // e.g. "pcs", "packs", "bottles", "mg"
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
    }
}, { timestamps: true });

module.exports = mongoose.model('Stocks', stockSchema);
