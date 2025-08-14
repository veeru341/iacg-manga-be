const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const paymentRoutes = require('./routes/paymentRoutes');
const { errorHandler } = require('./middleware/errorHandler');
const path = require('path');

const app = express();

// Error handling for startup issues
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit immediately - let Railway handle restarts
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

// CORS - Simplified for Railway
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
      'https://www.iacg.co.in'
    ];
    
    if (allowedDomains.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    return callback(null, true); // Allow all in production for now
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Routes
app.use('/api/payment', paymentRoutes);

// Health check
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

// Error handler middleware
app.use(errorHandler);

// 🎯 CRITICAL FIX: Let Railway handle port assignment completely
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log(`🔍 Attempting to start server on ${HOST}:${PORT}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

// Start server with Railway-optimized configuration
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

// ✅ FIXED: Better error handling that doesn't cause restart loops
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.error('🔄 Railway will handle port assignment - this might be a temporary issue');
    
    // Don't exit immediately - let Railway's health checks handle this
    setTimeout(() => {
      console.log('🔄 Attempting graceful shutdown...');
      process.exit(1);
    }, 5000); // Give 5 seconds delay
  } else {
    console.error('❌ Unexpected server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;
