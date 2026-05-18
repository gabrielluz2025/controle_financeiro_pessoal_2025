const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    connectedBanks: [{
        bankId: String,
        connectedAt: Date,
        status: {
            type: String,
            enum: ['connected', 'disconnected', 'error'],
            default: 'connected'
        }
    }],
    preferences: {
        theme: { type: String, default: 'light' },
        currency: { type: String, default: 'BRL' },
        language: { type: String, default: 'pt-BR' }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);
