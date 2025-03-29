const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Generates a new random token
const generateToken = () => crypto.randomBytes(32).toString("hex");

const getCurrentTime = () => new Date();

// Utility function to get token expiry time (15 minutes from the current time)
const getTokenExpiry = () => {
  const expiryDurationInMinutes = 3; // Duration for token expiry in minutes
  return new Date(getCurrentTime().getTime() + expiryDurationInMinutes * 60000);
};

const common = {
  /**
   * Validates the admin's token and refreshes it if expired.
   * @param {string} _token - Provided token
   * @param {number} admin_id - Admin ID
   * @param {function} callback - Callback function
   */
  isAdminTokenValid: async (_token, admin_id, callback) => {
    const sql = `
      SELECT login_token, token_expiry
      FROM admins
      WHERE id = ?
    `;

    try {
      const results = await sequelize.query(sql, {
        replacements: [admin_id], // Secure ? placeholder
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ status: false, message: "Admin not found" }, null);
      }

      const currentToken = results[0].login_token;
      const tokenExpiry = new Date(results[0].token_expiry);
      const currentTime = new Date();

      if (_token !== currentToken) {
        return callback(
          { status: false, message: "Invalid token provided" },
          null
        );
      }

      if (tokenExpiry > currentTime) {
        return callback(null, { status: true, message: "Token is valid" });
      } else {
        // Generate new token & expiry
        const newToken = generateToken();
        const newTokenExpiry = getTokenExpiry();

        const updateSql = `
          UPDATE admins
          SET login_token = ?, token_expiry = ?
          WHERE id = ?
        `;

        await sequelize.query(updateSql, {
          replacements: [newToken, newTokenExpiry, admin_id],
          type: QueryTypes.UPDATE,
        });

        return callback(null, {
          status: true,
          message: "Token was expired and has been refreshed",
          newToken,
        });
      }
    } catch (err) {
      console.error("Database query error:", err);
      return callback(
        { status: false, message: "Database error", error: err },
        null
      );
    }
  },

  /**
   * Logs admin login activities.
   * @param {number} admin_id - Admin ID
   * @param {string} action - Action performed
   * @param {string} result - Result of the action
   * @param {string} error - Error message if any
   * @param {function} callback - Callback function
   */
  adminLoginLog: async (admin_id, action, result, error, callback) => {
    const insertSql = `
      INSERT INTO admin_login_logs (admin_id, action, result, error, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;

    try {
      await sequelize.query(insertSql, {
        replacements: [admin_id, action, result, error], // Using ? placeholders
        type: QueryTypes.INSERT,
      });

      callback(null, {
        status: true,
        message: "Admin login log entry added successfully",
      });
    } catch (err) {
      console.error("Database insertion error:", err);
      return callback(
        { status: false, message: "Database error", error: err },
        null
      );
    }
  },

  /**
   * Logs other admin activities.
   * @param {number} admin_id - Admin ID
   * @param {string} module - Module name
   * @param {string} action - Action performed
   * @param {string} result - Result of the action
   * @param {string} update - Update description
   * @param {string} error - Error message if any
   * @param {function} callback - Callback function
   */
  adminActivityLog: async (
    admin_id,
    mailModule,
    action,
    result,
    update,
    error,
    callback
  ) => {
    try {
      const sql = `
        INSERT INTO admin_activity_logs 
        (admin_id, module, action, result, \`update\`, error, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      await sequelize.query(sql, {
        replacements: [
          admin_id || null,
          module || null,
          action || null,
          result || null,
          update || null,
          error || null,
        ],
        type: QueryTypes.INSERT,
      });

      return callback(null, {
        status: true,
        message: "Admin activity log entry added successfully",
      });
    } catch (err) {
      console.error("Database insertion error:", err);
      return callback(
        { status: false, message: "Database error", error: err },
        null
      );
    }
  },

  /**
   * Checks if the admin is authorized for a specific action.
   * @param {number} admin_id - Admin ID
   * @param {string} action - Action performed
   * @param {function} callback - Callback function
   */
  isAdminAuthorizedForAction: async (admin_id, action, callback) => {
    try {
      // Step 1: Fetch Admin Role
      const adminSQL = `SELECT role FROM admins WHERE id = ?`;
      const adminResult = await sequelize.query(adminSQL, {
        replacements: [admin_id],
        type: QueryTypes.SELECT,
      });

      if (adminResult.length === 0) {
        return callback({ message: "No admin found with the provided ID" }, null);
      }

      const role = adminResult[0].role;

      // Step 2: Fetch Permissions for the Role
      const permissionsJsonByRoleSQL = `SELECT json FROM permissions WHERE role = ?`;
      const permissionsResult = await sequelize.query(permissionsJsonByRoleSQL, {
        replacements: [role],
        type: QueryTypes.SELECT,
      });

      if (permissionsResult.length === 0) {
        return callback({ status: false, message: "Access Denied" }, null);
      }

      const permissionsRaw = permissionsResult[0].json;
      if (!permissionsRaw) {
        return callback({ status: false, message: "Access Denied" }, null);
      }

      // Step 3: Parse Permissions JSON
      let permissions;
      try {
        permissions = JSON.parse(permissionsRaw);
        if (typeof permissions === "string") {
          permissions = JSON.parse(permissions);
        }
      } catch (parseErr) {
        console.error("Error parsing permissions JSON:", parseErr);
        return callback({ status: false, message: "Access Denied" }, null);
      }
      // console.log(`permissions - `, permissions);
      // console.log(`action - `, action);
      // Step 4: Check if Action is Allowed
      if (!permissions[action]) {
        return callback({ status: false, message: "Access Denied" }, null);
      }

      return callback({
        status: true,
        message: "Authorization Successful",
      });

    } catch (err) {
      console.error("Database query error:", err);
      return callback({ status: false, message: "Database error", error: err }, null);
    }
  },

};

module.exports = common;
