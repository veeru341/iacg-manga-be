const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const paymentRoutes = require('./routes/paymentRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const path = require('path');

const app = express();

// Serve static files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// Optional: direct route for thank you page
app.get('/thankyou', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'thankyou.html'));
});

// Middlewares
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Updated for Railway deployment
const corsOptions = {
  origin: [
    'http://localhost:5173',  // Local development
    'https://your-frontend-domain.com', // Your production frontend domain
    // Add your Railway frontend URL when you have it
  ],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Routes
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/health', (req, res) => res.json({ 
  ok: true, 
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV || 'development'
}));

// Error handling for startup issues
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
  process.exit(1);
});

// Error handler middleware
app.use(errorHandler);

// 🎯 CRITICAL FIX: Configure server to listen on Railway's requirements
const PORT = process.env.PORT || 5001;
const HOST = '0.0.0.0'; // Railway requires this host

// Start server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://${HOST}:${PORT}/health`);
});

module.exports = app;