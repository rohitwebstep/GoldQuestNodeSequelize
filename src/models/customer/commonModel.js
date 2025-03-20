const crypto = require("crypto");
const { pool, startConnection, connectionRelease } = require("../../config/db");

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
  isCustomerTokenValid: (_token, customer_id, callback) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function 1");
      return;
    }

    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { status: false, message: "Database connection error" },
          null
        );
      }

      const sql = `
        SELECT \`login_token\`, \`token_expiry\`
        FROM \`customers\`
        WHERE \`id\` = ?
      `;

      connection.query(sql, [customer_id], (queryErr, results) => {
        if (queryErr) {
          connectionRelease(connection);
          console.error("Database query error: 52", queryErr);
          return callback({ status: false, message: "Database error" }, null);
        }

        if (results.length === 0) {
          connectionRelease(connection);
          return callback(
            { status: false, message: "Customer not found" },
            null
          );
        }

        const currentToken = results[0].login_token;
        const tokenExpiry = new Date(results[0].token_expiry);
        const currentTime = new Date();

        if (_token !== currentToken) {
          connectionRelease(connection);
          return callback(
            { status: false, message: "Invalid token provided" },
            null
          );
        }

        if (tokenExpiry > currentTime) {
          connectionRelease(connection);
          callback(null, { status: true, message: "Token is valid" });
        } else {
          const newToken = generateToken();
          const newTokenExpiry = getTokenExpiry();

          const updateSql = `
            UPDATE \`customers\`
            SET \`login_token\` = ?, \`token_expiry\` = ?
            WHERE \`id\` = ?
          `;

          connection.query(
            updateSql,
            [newToken, newTokenExpiry, customer_id],
            (updateErr) => {
              connectionRelease(connection); // Release connection

              if (updateErr) {
                console.error("Error updating token:", updateErr);
                return callback(
                  { status: false, message: "Error updating token" },
                  null
                );
              }

              callback(null, {
                status: true,
                message: "Token was expired and has been refreshed",
                newToken,
              });
            }
          );
        }
      });
    });
  },

  /**
   * Logs customer login activities.
   * @param {number} customer_id - Customer ID
   * @param {string} action - Action performed
   * @param {string} result - Result of the action
   * @param {string} error - Error message if any
   * @param {function} callback - Callback function
   */
  customerLoginLog: (customer_id, action, result, error, callback) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function 2");
      return;
    }

    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { status: false, message: "Database connection error" },
          null
        );
      }

      const insertSql = `
        INSERT INTO \`customer_login_logs\` (\`customer_id\`, \`action\`, \`result\`, \`error\`, \`created_at\`)
        VALUES (?, ?, ?, ?, NOW())
      `;

      connection.query(
        insertSql,
        [customer_id, action, result, error],
        (insertErr) => {
          connectionRelease(connection); // Release connection

          if (insertErr) {
            console.error("Database insertion error:", insertErr);
            return callback({ status: false, message: "Database error" }, null);
          }

          callback(null, {
            status: true,
            message: "Customer login log entry added successfully",
          });
        }
      );
    });
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
  customerActivityLog: (
    customer_id,
    module,
    action,
    result,
    update,
    error,
    callback
  ) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function 3");
      return;
    }

    startConnection((err, connection) => {
      if (err) {
        console.error("Failed to connect to the database:", err);
        return callback(
          { status: false, message: "Database connection error" },
          null
        );
      }

      const insertSql = `
        INSERT INTO \`customer_activity_logs\` (\`customer_id\`, \`module\`, \`action\`, \`result\`, \`update\`, \`error\`, \`created_at\`)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      connection.query(
        insertSql,
        [customer_id, module, action, result, update, error],
        (insertErr) => {
          connectionRelease(connection); // Release connection

          if (insertErr) {
            console.error("Database insertion error:", insertErr);
            return callback({ status: false, message: "Database error" }, null);
          }

          callback(null, {
            status: true,
            message: "Customer activity log entry added successfully",
          });
        }
      );
    });
  },
};

module.exports = common;
