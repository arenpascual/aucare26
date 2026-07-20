const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    who: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true }, // kanino ito para
    message: { type: String, required: true },
    type: { type: String, default: 'general' }, // 'approval', 'visit', 'complaint', 'general'
    link: { type: String, default: '/h' }, // saan pupunta pag na-click ang notification
    read: { type: Boolean, default: false },
    archive: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);