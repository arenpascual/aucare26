const mongoose = require('mongoose');

const dispenseSchema = new mongoose.Schema({
    visitId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'visit', 
        required: true 
    },
    who: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'user', 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['medicine', 'supply'], 
        required: true 
    },
    item: { 
        type: String, 
        required: true, 
        trim: true 
    },
    unit: { 
        type: String, 
        required: true, 
        trim: true 
    },
    qty: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    remarks: { 
        type: String, 
        trim: true 
    }
}, { timestamps: true });

module.exports = mongoose.model('dispense', dispenseSchema);