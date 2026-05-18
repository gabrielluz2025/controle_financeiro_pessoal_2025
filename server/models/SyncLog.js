const mongoose = require('mongoose');

const syncLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bank: {
        type: String,
        required: true
    },
    syncType: {
        type: String,
        enum: ['accounts', 'transactions', 'cards', 'full'],
        default: 'full'
    },
    status: {
        type: String,
        enum: ['success', 'failed', 'partial'],
        default: 'success'
    },
    itemsSynced: {
        type: Number,
        default: 0
    },
    error: {
        type: String
    },
    startedAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date
    },
    duration: {
        type: Number // em milissegundos
    }
}, { 
    timestamps: true
});

module.exports = mongoose.model('SyncLog', syncLogSchema);
