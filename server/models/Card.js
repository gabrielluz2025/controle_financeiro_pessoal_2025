const mongoose = require('mongoose');

const cardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    limit: {
        type: Number,
        required: true
    },
    availableLimit: {
        type: Number,
        required: true
    },
    dueDay: {
        type: Number,
        required: true,
        min: 1,
        max: 31
    },
    closingDay: Number,
    brand: {
        type: String,
        default: 'Visa'
    },
    color: {
        type: String,
        default: '#1a1a2e'
    },
    linkedAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account'
    }
}, { timestamps: true });

module.exports = mongoose.model('Card', cardSchema);
