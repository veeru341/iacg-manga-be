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

// CORS - use an env origin or allow all (dev)
app.use(cors({ origin: 'http://localhost:5173' }));


// Routes
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// Error handler
app.use(errorHandler);

module.exports = app;