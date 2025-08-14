// googleSheetsService.js
require("dotenv").config();
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

// Build Google Auth instance with multiple credential sources
let authInstance = null;
function getAuth() {
  if (authInstance) return authInstance;

  const options = { scopes: ["https://www.googleapis.com/auth/spreadsheets"] };

  // 1) Inline JSON
  const inlineJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (inlineJson) {
    try {
      options.credentials = JSON.parse(inlineJson);
      authInstance = new google.auth.GoogleAuth(options);
      return authInstance;
    } catch (e) {
      throw new Error(
        "Invalid GOOGLE_CREDENTIALS_JSON: must contain valid service account JSON"
      );
    }
  }

  // 2) Base64 encoded JSON
  const base64Json = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (base64Json) {
    try {
      const decoded = Buffer.from(base64Json, "base64").toString("utf8");
      options.credentials = JSON.parse(decoded);
      authInstance = new google.auth.GoogleAuth(options);
      return authInstance;
    } catch (e) {
      throw new Error(
        "Invalid GOOGLE_CREDENTIALS_BASE64: must be base64 of service account JSON"
      );
    }
  }

  // 3) File path
  const credentialsFilePath =
    process.env.GOOGLE_CREDENTIALS_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, "your-google-credentials.json");

  if (!fs.existsSync(credentialsFilePath)) {
    throw new Error(
      "Google credentials not found. Set GOOGLE_CREDENTIALS_PATH or GOOGLE_APPLICATION_CREDENTIALS to a valid file, or provide GOOGLE_CREDENTIALS_JSON / GOOGLE_CREDENTIALS_BASE64."
    );
  }

  authInstance = new google.auth.GoogleAuth({
    keyFile: credentialsFilePath,
    scopes: options.scopes,
  });
  return authInstance;
}

/**
 * Get spreadsheet configuration
 */
function getSpreadsheetConfig() {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEETS_RANGE || "Sheet1!A1";

  if (!spreadsheetId) {
    throw new Error(
      "Missing spreadsheet ID. Set GOOGLE_SHEETS_SPREADSHEET_ID (preferred) or GOOGLE_SHEET_ID in your .env"
    );
  }

  return { spreadsheetId, range };
}

/**
 * Get sheets API client
 */
async function getSheetsClient() {
  const client = await getAuth().getClient();
  return google.sheets({ version: "v4", auth: client });
}

/**
 * Append a row to the spreadsheet
 * @param {Array} values - Array of values to append
 */
async function appendRow(values) {
  try {
    const { spreadsheetId, range } = getSpreadsheetConfig();
    const sheets = await getSheetsClient();

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });
    
    console.log("Row appended successfully");
    return result;
  } catch (error) {
    console.error("Error appending row:", error);
    throw error;
  }
}

/**
 * Get all rows from the spreadsheet
 * @returns {Array} All rows data
 */
async function getAllRows() {
  const { spreadsheetId } = getSpreadsheetConfig();
  const sheets = await getSheetsClient();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:Z', // Get all columns
    });
    
    return response.data.values || [];
  } catch (error) {
    console.error('Error getting all rows:', error);
    throw error;
  }
}

/**
 * Find row index by order ID
 * @param {string} orderId - The order ID to search for
 * @returns {number} Row index (1-based for Google Sheets) or -1 if not found
 */
async function findRowByOrderId(orderId) {
  try {
    console.log('Searching for order ID:', orderId);
    const rows = await getAllRows();
    
    if (!rows || rows.length === 0) {
      console.log('No rows found in spreadsheet');
      return -1;
    }

    console.log(`Total rows to search: ${rows.length}`);

    // Search for order ID in column J (index 9)
    // Columns: A=timestamp, B=name, C=mobile, D=email, E=city, F=experience, G=amount, H=currency, I=payment_id, J=order_id
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row && row[9] === orderId) { // Column J (order_id)
        const foundIndex = i + 1; // Return 1-based row number for Google Sheets
        console.log(`✅ Order ID found at row ${foundIndex}`);
        return foundIndex;
      }
    }
    
    console.log(`❌ Order ID ${orderId} not found in spreadsheet`);
    return -1; // Not found
  } catch (error) {
    console.error('Error finding row by order ID:', error);
    return -1;
  }
}

/**
 * Update specific columns in an existing row
 * @param {number} rowIndex - 1-based row number
 * @param {Array} paymentData - Array of payment data to update
 */
async function updateRow(rowIndex, paymentData) {
  const { spreadsheetId } = getSpreadsheetConfig();
  const sheets = await getSheetsClient();

  try {
    console.log(`Updating row ${rowIndex} with data:`, paymentData);
    
    // Update columns G through L (amount, currency, payment_id, order_id, status, payment_timestamp)
    const range = `Sheet1!G${rowIndex}:L${rowIndex}`;
    
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [paymentData],
      },
    });
    
    console.log(`✅ Row ${rowIndex} updated successfully`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error updating row ${rowIndex}:`, error);
    throw error;
  }
}

/**
 * Update specific columns in a row by range
 * @param {number} rowIndex - 1-based row number
 * @param {string} startColumn - Starting column (e.g., 'G')
 * @param {string} endColumn - Ending column (e.g., 'L')
 * @param {Array} data - Array of data to update
 */
async function updateRowRange(rowIndex, startColumn, endColumn, data) {
  const { spreadsheetId } = getSpreadsheetConfig();
  const sheets = await getSheetsClient();

  try {
    const range = `Sheet1!${startColumn}${rowIndex}:${endColumn}${rowIndex}`;
    
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [data],
      },
    });
    
    console.log(`Row ${rowIndex} updated successfully in range ${range}:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error updating row ${rowIndex} in range ${range}:`, error);
    throw error;
  }
}

/**
 * Clear specific columns in a row
 * @param {number} rowIndex - 1-based row number
 * @param {string} startColumn - Starting column (e.g., 'G')
 * @param {string} endColumn - Ending column (e.g., 'L')
 */
async function clearRowRange(rowIndex, startColumn, endColumn) {
  const { spreadsheetId } = getSpreadsheetConfig();
  const sheets = await getSheetsClient();

  try {
    const range = `Sheet1!${startColumn}${rowIndex}:${endColumn}${rowIndex}`;
    
    const response = await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range,
    });
    
    console.log(`Row ${rowIndex} cleared successfully in range ${range}`);
    return response.data;
  } catch (error) {
    console.error(`Error clearing row ${rowIndex} in range ${range}:`, error);
    throw error;
  }
}

// ✅ Export all functions (this was missing in your original file)
module.exports = { 
  appendRow, 
  getAllRows,
  findRowByOrderId,
  updateRow,
  updateRowRange,
  clearRowRange
};