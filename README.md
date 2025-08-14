# Razorpay + Google Sheets Backend

1. Copy `.env.example` to `.env` and fill values.
2. Put your Google Service Account JSON at `creds/service-account.json`.
3. Share your Google Sheet with the service account email (Editor).
4. Install packages:
   npm install
5. Start server (dev):
   npm run dev
   or start:
   npm start

Flow:
- POST /api/payment/create-order  -> { amount }
  returns order object
- Frontend opens Razorpay checkout using order.id
- On success, client sends { razorpay_order_id, razorpay_payment_id, razorpay_signature, formData } to
  POST /api/payment/verify-payment
- Server verifies signature and appends a row to Google Sheet
