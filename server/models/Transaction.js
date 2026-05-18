const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    accountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    value: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        required: true,
        enum: ['receita', 'despesa', 'transferencia']
    },
    category: {
        type: String,
        default: 'Outros'
    },
    date: {
        type: Date,
        required: true
    },
    isPaid: {
        type: Boolean,
        default: true
    },
    notes: String
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
