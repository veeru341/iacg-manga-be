const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const paymentRoutes = require('./routes/paymentRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const path = require('path');

const app = express();

// Error handling for startup issues (add at the top)
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled Rejection:', error);
});

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

// CORS - Updated for Railway deployment with flexible origins
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow Railway domains
    if (origin.includes('railway.app')) {
      return callback(null, true);
    }
    
    // Allow your production domains
    const allowedDomains = [
      'https://iacg.co.in',
      'https://www.iacg.co.in',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:3001'
    ];
    
    if (allowedDomains.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Routes
app.use('/api/payment', paymentRoutes);

// Health check with detailed info
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  try {
    res.json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 'not set',
      host: '0.0.0.0',
      message: 'Manga Art Course Backend is healthy! 🎨'
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Debug endpoint (remove in production)
app.get('/debug-env', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  
  res.json({
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    hasGoogleCreds: !!process.env.GOOGLE_CREDENTIALS_JSON,
    hasRazorpayKey: !!process.env.RAZORPAY_KEY_ID,
    hasRazorpaySecret: !!process.env.RAZORPAY_KEY_SECRET,
    baseUrl: process.env.BASE_URL || 'not set'
  });
});

// Error handler middleware
app.use(errorHandler);

// 🎯 CRITICAL FIX: Server configuration for Railway
// Use 3000 as fallback instead of 5001/8080 to avoid port conflicts
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Railway requires this host

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server with enhanced logging
const server = app.listen(PORT, HOST, () => {
  console.log('🚀 ===================================');
  console.log(`🎨 Manga Art Course Backend Started`);
  console.log(`📍 Host: ${HOST}`);
  console.log(`🔌 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health Check: http://${HOST}:${PORT}/health`);
  console.log(`📋 API Base: http://${HOST}:${PORT}/api/payment`);
  console.log('🚀 ===================================');
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('💡 Try using a different port or kill the process using this port');
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

module.exports = app;
