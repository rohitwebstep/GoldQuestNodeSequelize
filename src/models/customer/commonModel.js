const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

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
    if (typeof callback !== "function") {
      console.error("Callback is not a function");
      return;
    }

    try {
      const sql = `
            SELECT \`login_token\`, \`token_expiry\`
            FROM \`customers\`
            WHERE \`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [customer_id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ status: false, message: "Customer not found" }, null);
      }

      const currentToken = results[0].login_token;
      const tokenExpiry = new Date(results[0].token_expiry);
      const currentTime = new Date();

      if (_token !== currentToken) {
        return callback({ status: false, message: "Invalid token provided" }, null);
      }

      if (tokenExpiry > currentTime) {
        return callback(null, { status: true, message: "Token is valid" });
      }

      // Token expired, generate a new one
      const newToken = generateToken();
      const newTokenExpiry = getTokenExpiry(); // Ensure this returns a valid Date or timestamp

      const updateSql = `
            UPDATE \`customers\`
            SET \`login_token\` = ?, \`token_expiry\` = ?
            WHERE \`id\` = ?
        `;

      await sequelize.query(updateSql, {
        replacements: [newToken, newTokenExpiry, customer_id],
        type: QueryTypes.UPDATE,
      });

      return callback(null, {
        status: true,
        message: "Token was expired and has been refreshed",
        newToken,
      });

    } catch (error) {
      console.error("Database error:", error);
      return callback({ status: false, message: "Internal server error" }, null);
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
    if (typeof callback !== "function") {
      console.error("Callback is not a function");
      return;
    }

    try {
      const insertSql = `
            INSERT INTO \`customer_login_logs\` (\`customer_id\`, \`action\`, \`result\`, \`error\`, \`created_at\`)
            VALUES (?, ?, ?, ?, NOW())
        `;

      await sequelize.query(insertSql, {
        replacements: [customer_id, action, result, error],
        type: QueryTypes.INSERT,
      });

      callback(null, {
        status: true,
        message: "Customer login log entry added successfully",
      });

    } catch (error) {
      console.error("Database error:", error);
      callback({ status: false, message: "Failed to add login log" }, null);
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
  customerActivityLog: async (
    customer_id,
    mailModule,
    action,
    result,
    update,
    error,
    callback
  ) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function");
      return;
    }

    try {
      const insertSql = `
            INSERT INTO \`customer_activity_logs\` (\`customer_id\`, \`module\`, \`action\`, \`result\`, \`update\`, \`error\`, \`created_at\`)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
        `;

      await sequelize.query(insertSql, {
        replacements: [customer_id, module, action, result, update, error],
        type: QueryTypes.INSERT,
      });

      callback(null, {
        status: true,
        message: "Customer activity log entry added successfully",
      });

    } catch (error) {
      console.error("Database error:", error);
      callback({ status: false, message: "Failed to add activity log" }, null);
    }
  },

};

module.exports = common;
