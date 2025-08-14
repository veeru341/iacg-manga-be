const express = require('express');
const router = express.Router();

const { 
  createOrder, 
  verifyPayment, 
  cancelPayment,  // Add this import
  webhookHandler, 
  appendForm 
} = require('../controllers/paymentController');

router.post('/create-order', createOrder);
router.post('/append-form', appendForm);
router.post('/webhook', webhookHandler);

// Payment verification routes
router.get('/verify-payment', verifyPayment);
router.post('/verify-payment', verifyPayment);

// Payment cancellation route
router.get('/cancel-payment', cancelPayment);  // Add this line

module.exports = router;
