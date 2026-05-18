const mongoose = require('mongoose');

const bankTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    bank: {
        type: String,
        required: true,
        enum: ['nubank', 'itau', 'bradesco', 'santander', 'bb', 'caixa', 'inter', 'c6bank']
    },
    accessToken: {
        type: String,
        required: true
    },
    refreshToken: {
        type: String
    },
    idToken: {
        type: String
    },
    expiresAt: {
        type: Date,
        required: true
    },
    connectedAt: {
        type: Date,
        default: Date.now
    },
    lastSyncedAt: {
        type: Date
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'revoked'],
        default: 'active'
    }
}, { 
    timestamps: true,
    indexes: [
        { userId: 1, bank: 1 }
    ]
});

module.exports = mongoose.model('BankToken', bankTokenSchema);
