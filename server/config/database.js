const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/financeiro';
        
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });

        console.log('✅ MongoDB conectado com sucesso');
        return mongoose.connection;
    } catch (error) {
        console.error('❌ Erro ao conectar MongoDB:', error.message);
        // Em desenvolvimento, continuar sem MongoDB
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    }
};

const disconnectDB = async () => {
    try {
        await mongoose.disconnect();
        console.log('✅ MongoDB desconectado');
    } catch (error) {
        console.error('❌ Erro ao desconectar MongoDB:', error.message);
    }
};

module.exports = {
    connectDB,
    disconnectDB
};
