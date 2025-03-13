const crypto = require("crypto");
const { sequelize } = require("../../config/db"); // Assuming Sequelize is set up

// Generates a new random token
const generateToken = () => crypto.randomBytes(32).toString("hex");

// Returns the expiry time for the token (1 hour from now)
const getTokenExpiry = () => new Date(Date.now() + 3600000).toISOString();

const common = {
  /**
   * Validates the customer's token and refreshes it if expired.
   * @param {string} _token - Provided token
   * @param {number} customer_id - Customer ID
   * @param {function} callback - Callback function
   */
  isCustomerTokenValid: async (_token, customer_id, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      const sql = `
        SELECT login_token, token_expiry
        FROM customers
        WHERE id = ?
      `;

      const [results] = await sequelize.query(sql, {
        replacements: [customer_id],
        type: sequelize.QueryTypes.SELECT,
      });

      if (!results) {
        return callback({ status: false, message: "Customer not found" }, null);
      }

      const { login_token: currentToken, token_expiry } = results;
      const tokenExpiry = new Date(token_expiry);
      const currentTime = new Date();

      if (_token !== currentToken) {
        return callback({ status: false, message: "Invalid token provided" }, null);
      }

      if (tokenExpiry > currentTime) {
        return callback(null, { status: true, message: "Token is valid" });
      }

      // If token expired, generate a new one
      const newToken = generateToken();
      const newTokenExpiry = getTokenExpiry();

      await sequelize.query(
        `UPDATE customers SET login_token = ?, token_expiry = ? WHERE id = ?`,
        { replacements: [newToken, newTokenExpiry, customer_id], type: sequelize.QueryTypes.UPDATE }
      );

      callback(null, {
        status: true,
        message: "Token was expired and has been refreshed",
        newToken,
      });
    } catch (error) {
      console.error("Database error:", error);
      callback({ status: false, message: "Database error" }, null);
    }
  },

  /**
   * Logs customer login activities.
   * @param {number} customer_id - Customer ID
   * @param {string} action - Action performed
   * @param {string} result - Result of the action
   * @param {string} error - Error message if any
   * @param {function} callback - Callback function
   */
  customerLoginLog: async (customer_id, action, result, error, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      await sequelize.query(
        `
        INSERT INTO customer_login_logs (customer_id, action, result, error, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `,
        { replacements: [customer_id, action, result, error], type: sequelize.QueryTypes.INSERT }
      );

      callback(null, {
        status: true,
        message: "Customer login log entry added successfully",
      });
    } catch (error) {
      console.error("Database insertion error:", error);
      callback({ status: false, message: "Database error" }, null);
    }
  },

  /**
   * Logs other customer activities.
   * @param {number} customer_id - Customer ID
   * @param {string} module - Module name
   * @param {string} action - Action performed
   * @param {string} result - Result of the action
   * @param {string} update - Update description
   * @param {string} error - Error message if any
   * @param {function} callback - Callback function
   */
  customerActivityLog: async (customer_id, module, action, result, update, error, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      await sequelize.query(
        `
        INSERT INTO customer_activity_logs (customer_id, module, action, result, update, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `,
        { replacements: [customer_id, module, action, result, update, error], type: sequelize.QueryTypes.INSERT }
      );

      callback(null, {
        status: true,
        message: "Customer activity log entry added successfully",
      });
    } catch (error) {
      console.error("Database insertion error:", error);
      callback({ status: false, message: "Database error" }, null);
    }
  },
};

module.exports = common;
