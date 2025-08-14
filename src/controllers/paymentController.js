const crypto = require('crypto');
const path = require('path');
const razorpay = require('../utils/razorpayClient');
const { appendRow, findRowByOrderId, updateRow } = require('../services/googleSheetsService');

const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || null;

/**
 * Create Razorpay order
 * body: { amount (number, INR rupees), currency (optional), notes (optional obj) }
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { amount, currency = 'INR', notes = {} } = req.body;

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ error: 'amount is required and must be a number' });
    }

    const amountInPaise = Math.round(Number(amount) * 100);
    const options = {
      amount: amountInPaise,
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes,
    };

    const order = await razorpay.orders.create(options);
    res.json({ order });
  } catch (err) {
    next(err);
  }
};

/**
 * Verify payment from client handler
 * body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    console.log('=== PAYMENT VERIFICATION START ===');
    console.log('Request method:', req.method);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);

    // Handle both GET (callback redirect) and POST (manual verification)
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.method === 'GET' ? req.query : req.body;

    console.log('Extracted values:', {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature: razorpay_signature ? 'present' : 'missing'
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log('Missing required fields!');
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify signature
    console.log('Verifying signature...');
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    console.log('Signature match:', generated_signature === razorpay_signature);

    if (generated_signature !== razorpay_signature) {
      console.log('Signature verification failed!');
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    // Fetch payment details from Razorpay
    console.log('Fetching payment details from Razorpay...');
    let paymentDetails = null;
    try {
      paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
      console.log('Payment details fetched successfully:', paymentDetails?.id);
    } catch (fetchError) {
      console.error('Error fetching payment details:', fetchError);
    }

    // Update Google Sheet
    console.log('Attempting to update Google Sheet...');
    try {
      console.log('Searching for order ID:', razorpay_order_id);
      const rowIndex = await findRowByOrderId(razorpay_order_id);
      console.log('Row search result:', rowIndex);

      if (rowIndex !== -1) {
        const paymentData = [
          paymentDetails?.amount ? paymentDetails.amount / 100 : 1, // G: amount in INR
          paymentDetails?.currency || 'INR',                        // H
          razorpay_payment_id,                                      // I
          razorpay_order_id,                                        // J
          paymentDetails?.status || 'captured',                     // K
          new Date().toISOString()                                  // L
        ];

        console.log('Payment data to update:', paymentData);
        console.log('Calling updateRow function...');

        await updateRow(rowIndex, paymentData);
        console.log(`✅ Successfully updated row ${rowIndex} with payment details`);
      } else {
        console.log('⚠️ Row not found, creating new one...');
        const paymentRow = [
          new Date().toISOString(),                                 // A
          '',                                                        // B name
          '',                                                        // C mobile
          paymentDetails?.email || '',                               // D
          '',                                                        // E city
          '',                                                        // F exp
          paymentDetails?.amount ? paymentDetails.amount / 100 : 1,  // G
          paymentDetails?.currency || 'INR',                         // H
          razorpay_payment_id,                                       // I
          razorpay_order_id,                                         // J
          paymentDetails?.status || 'captured',                      // K
          new Date().toISOString()                                   // L
        ];

        console.log('Creating new row with data:', paymentRow);
        await appendRow(paymentRow);
        console.log('✅ Created new row for payment details');
      }
    } catch (error) {
      console.error('❌ Error updating spreadsheet:', error.message);
      console.error('Full error details:', error.stack);
      throw error;
    }

    console.log('=== PAYMENT VERIFICATION COMPLETE ===');

    // Redirect to hosted Thank You page
    return res.redirect('https://iacg.co.in/manga-art-thank-you-page/');

  } catch (err) {
    console.error('❌ Payment verification error:', err);
    next(err);
  }
};

/**
 * Handle payment cancellation
 */
exports.cancelPayment = async (req, res, next) => {
  try {
    console.log('=== PAYMENT CANCELLED ===');
    console.log('Query params:', req.query);

    // Get order_id from query parameters (Razorpay sends this)
    const { order_id } = req.query;

    if (order_id) {
      try {
        console.log('Searching for cancelled order:', order_id);
        // Update the Google Sheet to mark as cancelled
        const rowIndex = await findRowByOrderId(order_id);
        if (rowIndex !== -1) {
          const cancelData = [
            '',              // G: amount (empty)
            '',              // H: currency (empty)  
            '',              // I: payment_id (empty)
            order_id,        // J: order_id (keep existing)
            'cancelled',     // K: status
            new Date().toISOString() // L: cancellation timestamp
          ];

          await updateRow(rowIndex, cancelData);
          console.log(`✅ Updated row ${rowIndex} - marked as cancelled`);
        } else {
          console.log('Order not found for cancellation:', order_id);
        }
      } catch (error) {
        console.error('Error updating cancelled payment in spreadsheet:', error);
      }
    }

    // Redirect to localhost frontend for cancelled payments
    return res.redirect('http://localhost:5173/');

  } catch (err) {
    console.error('Cancel payment error:', err);
    next(err);
  }
};

/**
 * Enhanced Razorpay webhook handler with comprehensive payment status handling
 */
exports.webhookHandler = async (req, res, next) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature for security
    if (RAZORPAY_WEBHOOK_SECRET) {
      const generated = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(payload).digest('hex');
      if (generated !== signature) {
        console.warn('Invalid webhook signature');
        return res.status(400).send('invalid signature');
      }
    } else {
      console.warn('RAZORPAY_WEBHOOK_SECRET not set — skipping webhook signature verification');
    }

    const event = JSON.parse(payload.toString());
    console.log('Webhook received:', event.event, 'for payment:', event.payload?.payment?.entity?.id);

    // Handle different payment events
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;

      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;

      case 'payment.pending':
        await handlePaymentPending(event.payload.payment.entity);
        break;

      case 'payment.authorized':
        await handlePaymentAuthorized(event.payload.payment.entity);
        break;

      default:
        console.log('Unhandled webhook event:', event.event);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Handle successful payment capture
async function handlePaymentCaptured(payment) {
  try {
    const rowIndex = await findRowByOrderId(payment.order_id);
    if (rowIndex !== -1) {
      const paymentData = [
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'captured',
        new Date().toISOString()
      ];
      await updateRow(rowIndex, paymentData);
      console.log('✅ Payment captured - updated row:', rowIndex);

      // Optional: Send confirmation email to user
      // await sendPaymentConfirmationEmail(payment);
    } else {
      // Create new row if not found
      const row = [
        new Date().toISOString(),
        '',
        '',
        payment?.email || '',
        '',
        '',
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'captured',
        new Date().toISOString()
      ];
      await appendRow(row);
      console.log('✅ Payment captured - created new row');
    }
  } catch (error) {
    console.error('Error handling captured payment:', error);
  }
}

// Handle failed payments
async function handlePaymentFailed(payment) {
  try {
    const rowIndex = await findRowByOrderId(payment.order_id);
    if (rowIndex !== -1) {
      const paymentData = [
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'failed',
        new Date().toISOString()
      ];
      await updateRow(rowIndex, paymentData);
      console.log('❌ Payment failed - updated row:', rowIndex);

      // Optional: Send failure notification
      // await sendPaymentFailureEmail(payment);
    } else {
      // Create new row for failed payment
      const row = [
        new Date().toISOString(),
        '',
        '',
        payment?.email || '',
        '',
        '',
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'failed',
        new Date().toISOString()
      ];
      await appendRow(row);
      console.log('❌ Payment failed - created new row');
    }
  } catch (error) {
    console.error('Error handling failed payment:', error);
  }
}

// Handle pending payments (amount deducted but not confirmed)
async function handlePaymentPending(payment) {
  try {
    const rowIndex = await findRowByOrderId(payment.order_id);
    if (rowIndex !== -1) {
      const paymentData = [
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'pending',
        new Date().toISOString()
      ];
      await updateRow(rowIndex, paymentData);
      console.log('⏳ Payment pending - updated row:', rowIndex);

      // Optional: Send pending payment notification
      // await sendPaymentPendingEmail(payment);
    } else {
      // Create new row for pending payment
      const row = [
        new Date().toISOString(),
        '',
        '',
        payment?.email || '',
        '',
        '',
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'pending',
        new Date().toISOString()
      ];
      await appendRow(row);
      console.log('⏳ Payment pending - created new row');
    }
  } catch (error) {
    console.error('Error handling pending payment:', error);
  }
}

// Handle authorized payments (amount blocked but not captured)
async function handlePaymentAuthorized(payment) {
  try {
    const rowIndex = await findRowByOrderId(payment.order_id);
    if (rowIndex !== -1) {
      const paymentData = [
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'authorized',
        new Date().toISOString()
      ];
      await updateRow(rowIndex, paymentData);
      console.log('🔒 Payment authorized - updated row:', rowIndex);
    } else {
      // Create new row for authorized payment
      const row = [
        new Date().toISOString(),
        '',
        '',
        payment?.email || '',
        '',
        '',
        payment?.amount / 100,
        payment?.currency || 'INR',
        payment?.id || '',
        payment?.order_id || '',
        'authorized',
        new Date().toISOString()
      ];
      await appendRow(row);
      console.log('🔒 Payment authorized - created new row');
    }
  } catch (error) {
    console.error('Error handling authorized payment:', error);
  }
}

/**
 * Append form data to Google Sheets and create payment
 */
exports.appendForm = async (req, res, next) => {
  try {
    const { formData = {} } = req.body || {};

    if (Object.keys(formData).length === 0) {
      return res.status(400).send({ message: 'Form data is required' });
    }

    const timestamp = new Date().toISOString();
    const name = formData?.name || '';
    const mobile = formData?.mobile || '';
    const email = formData?.email || '';
    const city = formData?.city || '';
    const experience = formData?.experience || '';

    // Create Razorpay order
    // In your appendForm function in paymentController.js
    const order = await razorpay.orders.create({
      amount: 100,
      currency: 'INR',
      receipt: `rcpt_${Date.now()}`,
      notes: {
        name,
        email,
        mobile,
        business_name: 'IACG MULTIMEDIA PRIVATE LIMITED' // Add this
      }
    });


    if (!order) {
      return res.status(500).send({ message: 'Failed to create Razorpay order' });
    }

    // Save form in Google Sheet
    const row = [
      timestamp,
      name,
      mobile,
      email,
      city,
      experience,
      '',
      '',
      '',
      order.id,
      'pending',
      ''
    ];
    await appendRow(row);

    console.log('Form data stored with order ID:', order.id);

    // Build payment link with proper cancel URL
    const callbackUrl = `${process.env.BASE_URL || 'http://localhost:5001'}/api/payment/verify-payment`;
    const cancelUrl = `${process.env.BASE_URL || 'http://localhost:5001'}/api/payment/cancel-payment`;
    const paymentLink = `https://api.razorpay.com/v1/checkout/embedded?order_id=${order.id}&key_id=${process.env.RAZORPAY_KEY_ID}&callback_url=${callbackUrl}&cancel_url=${cancelUrl}`;

    res.json({ paymentLink });

  } catch (err) {
    console.error(err);
    next(err);
  }
};
