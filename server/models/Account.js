const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
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
    type: {
        type: String,
        required: true,
        enum: ['corrente', 'poupanca', 'investimento', 'carteira', 'digital']
    },
    balance: {
        type: Number,
        default: 0
    },
    initialBalance: {
        type: Number,
        default: 0
    },
    bankName: String,
    bankLogo: String,
    color: {
        type: String,
        default: '#6366f1'
    }
}, { timestamps: true });

module.exports = mongoose.model('Account', accountSchema);
