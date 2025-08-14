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

// Security middleware
app.use(helmet());

// Logging middleware
app.use(morgan('dev'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }
    
    // Allow Railway domains
    if (origin && origin.includes('railway.app')) {
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
    
    if (origin && allowedDomains.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // For production, be more permissive for now
    return callback(null, true);
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// API Routes
app.use('/api/payment', paymentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('🏥 Health check requested');
  try {
    res.json({ 
      ok: true, 
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 'not set',
      message: 'Manga Art Course Backend is healthy! 🎨',
      uptime: process.uptime(),
      memory: process.memoryUsage()
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

// Debug endpoint (only for non-production)
app.get('/debug-env', (req, res) => {
  const allow = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEBUG_ENV === 'true';
  if (!allow) return res.status(404).json({ error: 'Not found' });
  res.json({
    nodeEnv: process.env.NODE_ENV,
    portPresent: !!process.env.PORT,
    hasGoogleCredsJson: !!process.env.GOOGLE_CREDENTIALS_JSON,
    hasGoogleCredsBase64: !!process.env.GOOGLE_CREDENTIALS_BASE64,
    hasRazorpayKey: !!process.env.RAZORPAY_KEY_ID,
    hasRazorpaySecret: !!process.env.RAZORPAY_KEY_SECRET,
    baseUrl: process.env.BASE_URL ? 'set' : 'not set',
    googleSheetId: process.env.GOOGLE_SHEET_ID ? 'set' : 'not set'
  });
});



// Catch-all route for undefined endpoints
app.get('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'This endpoint does not exist',
    availableEndpoints: [
      'GET /health',
      'GET /thankyou',
      'POST /api/payment/create',
      'POST /api/payment/verify-payment',
      'POST /api/payment/webhook'
    ]
  });
});

// Error handler middleware (must be last)
app.use(errorHandler);

// IMPORTANT: NO app.listen() here - server.js handles that
module.exports = app;