const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const Branch = {
  findByEmailOrMobile: async (username, callback) => {
    try {
      // Query the branches table first
      const sqlBranches = `
        SELECT 'branch' AS type, id, id AS branch_id, customer_id, name, name AS branch_name, 
               email, status, login_token, token_expiry, otp, two_factor_enabled, otp_expiry
        FROM branches
        WHERE email = ?`;

      const branchResults = await sequelize.query(sqlBranches, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      // If branch is found, return it immediately
      if (branchResults.length > 0) {
        return callback(null, branchResults);
      }

      // If not found in branches, check the sub-user table
      const sqlSubUsers = `
        SELECT 'sub_user' AS type, sub_users.id, sub_users.branch_id, sub_users.customer_id, 
               sub_users.email, sub_users.status, sub_users.login_token, sub_users.token_expiry, 
               branch.name AS branch_name
        FROM branch_sub_users AS sub_users
        INNER JOIN branches AS branch ON branch.id = sub_users.branch_id
        WHERE sub_users.email = ?`;

      const subUserResults = await sequelize.query(sqlSubUsers, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      // If sub-user is found, return it
      if (subUserResults.length > 0) {
        return callback(null, subUserResults);
      }

      // If neither found, return an error
      return callback({ message: "No branch or sub-user found with the provided email" }, null);
    } catch (error) {
      console.error("Database query error:", error);
      return callback({ message: "Database query error", error }, null);
    }
  },

  findByEmailOrMobileForBranchLogin: async (username, password, callback) => {
    try {
      // Query the branches table first
      const sqlBranches = `
        SELECT 'branch' AS type, id, id AS branch_id, customer_id, name, name AS branch_name, 
               email, status, login_token, token_expiry, otp, two_factor_enabled, otp_expiry
        FROM branches
        WHERE email = ?`;

      const branchResults = await sequelize.query(sqlBranches, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      // If branch is found, return it immediately
      if (branchResults.length > 0) {
        return callback(null, branchResults);
      }

      // If not found in branches, check the sub-user table
      const sqlSubUsers = `
        SELECT 'sub_user' AS type, sub_users.id, sub_users.branch_id, sub_users.customer_id, 
               sub_users.email, sub_users.status, sub_users.login_token, sub_users.token_expiry, 
               branch.name AS branch_name
        FROM branch_sub_users AS sub_users
        INNER JOIN branches AS branch ON branch.id = sub_users.branch_id
        WHERE sub_users.email = ?`;

      const subUserResults = await sequelize.query(sqlSubUsers, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      // If sub-user is found, return it
      if (subUserResults.length > 0) {
        return callback(null, subUserResults);
      }

      // If not found in branches, check the customers (sub-user) table
      const sqlAdditionalUsers = `
        SELECT 
          id AS customer_id, 
          'additional_user' AS type,
          username, 
          password, 
          raw_password
        FROM customers 
        WHERE username = ? AND password = MD5(?)
      `;

      const additionalUserResults = await sequelize.query(sqlAdditionalUsers, {
        replacements: [username, password],
        type: QueryTypes.SELECT,
      });

      // If sub-users are found, fetch branch details for each
      if (additionalUserResults.length > 0) {
        const enrichedUsers = [];

        for (const user of additionalUserResults) {
          const sqlBranchDetails = `
            SELECT 
              id AS branch_id, 
              name, 
              email, 
              mobile_number 
            FROM branches 
            WHERE customer_id = ?
          `;

          const branchDetails = await sequelize.query(sqlBranchDetails, {
            replacements: [user.customer_id],
            type: QueryTypes.SELECT,
          });

          // Attach branch details to each user
          enrichedUsers.push({
            ...user,
            branchDetails,
          });
        }

        return callback(null, enrichedUsers);
      }

      // If neither found, return an error
      return callback({ message: "No branch, sub-user or additional user found with the provided email" }, null);
    } catch (error) {
      console.error("Database query error:", error);
      return callback({ message: "Database query error", error }, null);
    }
  },

  findByEmailOrMobileAllInfo: async (username, callback) => {
    try {
      // Query the branches table first
      const sqlBranches = `
            SELECT 'branch' AS type, id, customer_id, name, email, mobile_number, is_head, head_id, password, two_factor_enabled, reset_password_token, password_reset_requested_at, password_reset_request_count, can_request_password_reset, otp, login_token, token_expiry, password_token_expiry, otp_expiry, permissions, status, created_at, updated_at
            FROM \`branches\` 
            WHERE \`email\` = ?
        `;

      const branchResults = await sequelize.query(sqlBranches, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      if (branchResults.length > 0) {
        return callback(null, branchResults);
      }

      // If not found in branches, query the branch_sub_users table
      const sqlSubUsers = `
            SELECT 'sub_user' AS type, id, branch_id, customer_id, email, password, reset_password_token, login_token, token_expiry, password_token_expiry, status, created_at, updated_at 
            FROM \`branch_sub_users\` 
            WHERE \`email\` = ?
        `;

      const subUserResults = await sequelize.query(sqlSubUsers, {
        replacements: [username],
        type: QueryTypes.SELECT,
      });

      if (subUserResults.length === 0) {
        return callback({ message: "No branch or sub-user found with the provided email" }, null);
      }

      return callback(null, subUserResults);
    } catch (error) {
      console.error("Error fetching user information:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  updatePasswordResetPermission: async (status, branch_id, callback) => {
    try {
      const sql = `
            UPDATE \`branches\`
            SET \`can_request_password_reset\` = ?
            WHERE \`id\` = ?
        `;

      const [affectedRows] = await sequelize.query(sql, {
        replacements: [status, branch_id],
        type: QueryTypes.UPDATE,
      });

      if (affectedRows === 0) {
        return callback({
          success: false,
          message: "No branch found with the provided ID or no update was necessary"
        }, null);
      }

      return callback(null, {
        success: true,
        message: `Password reset permission updated successfully to ${status ? 'Allowed' : 'Denied'}`,
        data: { affectedRows }
      });
    } catch (error) {
      console.error("Error updating password reset permission:", error);
      return callback({
        success: false,
        message: "Database query failed",
        error
      }, null);
    }
  },

  setResetPasswordToken: async (id, token, tokenExpiry, callback) => {
    try {
      const sql = `
            UPDATE \`branches\`
            SET 
                \`reset_password_token\` = ?, 
                \`password_token_expiry\` = ?,
                \`can_request_password_reset\` = ?,
                \`password_reset_request_count\` = 
                    CASE 
                        WHEN DATE(\`password_reset_requested_at\`) = CURDATE() 
                        THEN \`password_reset_request_count\` + 1 
                        ELSE 1 
                    END,
                \`password_reset_requested_at\` = 
                    CASE 
                        WHEN DATE(\`password_reset_requested_at\`) = CURDATE() 
                        THEN \`password_reset_requested_at\` 
                        ELSE NOW() 
                    END
            WHERE \`id\` = ?
        `;

      const [affectedRows] = await sequelize.query(sql, {
        replacements: [token, tokenExpiry, 1, id],
        type: QueryTypes.UPDATE,
      });

      if (affectedRows === 0) {
        return callback({ success: false, message: "No branch found with the provided ID or no update required" }, null);
      }

      return callback(null, {
        success: true,
        message: "Password reset token updated successfully",
        data: { affectedRows }
      });
    } catch (error) {
      console.error("Error updating password reset token:", error);
      return callback({ success: false, message: "Database query failed", error }, null);
    }
  },

  validatePassword: async (email, password, type, callback) => {
    try {
      let sql;

      if (type === "branch") {
        sql = `
          SELECT id FROM branches
          WHERE email = ? 
          AND (password = MD5(?) OR password = ?)
        `;
      } else if (type === "sub_user") {
        sql = `
          SELECT id FROM branch_sub_users
          WHERE email = ? 
          AND (password = MD5(?) OR password = ?)
        `;
      } else {
        return callback({ message: "Invalid user type for login" }, null);
      }

      const results = await sequelize.query(sql, {
        replacements: [email, password, password],
        type: QueryTypes.SELECT,
      });

      // Return true if a match is found, otherwise return false
      return callback(null, results.length > 0);
    } catch (error) {
      console.error("Database query error:", error);
      return callback({ message: "Database query error", error }, null);
    }
  },

  updatePassword: async (new_password, branch_id, callback) => {
    try {
      const sql = `UPDATE \`branches\` SET \`password\` = MD5(?), \`reset_password_token\` = null, \`login_token\` = null, \`token_expiry\` = null, \`password_token_expiry\` = null WHERE \`id\` = ?`;

      const [affectedRows] = await sequelize.query(sql, {
        replacements: [new_password, branch_id],
        type: QueryTypes.UPDATE,
      });

      // Check if the password was updated
      if (affectedRows === 0) {
        return callback(
          { message: "Branch not found or password not updated. Please check the provided details." },
          null
        );
      }

      callback(null, { message: "Password updated successfully.", affectedRows });
    } catch (error) {
      console.error("Error updating password:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  updateOTP: async (branch_id, otp, otp_expiry, callback) => {
    try {
      const sql = `
            UPDATE \`branches\` 
            SET 
                \`otp\` = ?, 
                \`otp_expiry\` = ?,  
                \`reset_password_token\` = NULL, 
                \`login_token\` = NULL, 
                \`token_expiry\` = NULL, 
                \`password_token_expiry\` = NULL 
            WHERE \`id\` = ?
        `;

      const [affectedRows] = await sequelize.query(sql, {
        replacements: [otp, otp_expiry, branch_id],
        type: QueryTypes.UPDATE,
      });

      // Check if the OTP was updated
      if (affectedRows === 0) {
        return callback(
          { message: "Branch not found or OTP not updated. Please check the provided details." },
          null
        );
      }

      callback(null, { message: "OTP updated successfully.", affectedRows });
    } catch (error) {
      console.error("Error updating OTP:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  updateToken: async (id, token, tokenExpiry, type, callback) => {
    try {
      let sql;

      if (type === "branch") {
        sql = `
          UPDATE branches
          SET login_token = ?, token_expiry = ?
          WHERE id = ?
        `;
      } else if (type === "sub_user") {
        sql = `
          UPDATE branch_sub_users
          SET login_token = ?, token_expiry = ?
          WHERE id = ?
        `;
      } else if (type === "additional_user") {
        sql = `
          UPDATE customers
          SET login_token = ?, token_expiry = ?
          WHERE id = ?
        `;
      } else {
        return callback?.({ message: "Invalid user type for token update" }, null);
      }

      const [results] = await sequelize.query(sql, {
        replacements: [token, tokenExpiry, id],
        type: QueryTypes.UPDATE,
      });

      if (results === 0) {
        return callback?.({ message: "Token update failed. No matching record found." }, null);
      }

      return callback?.(null, { message: "Token updated successfully" });
    } catch (error) {
      console.error("Database update error:", error);
      return callback?.({ message: "Database update error", error }, null);
    }
  },

  validateLogin: async (id, callback) => {
    try {
      const sql = `
            SELECT \`login_token\`, \`token_expiry\`
            FROM \`branches\`
            WHERE \`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (!results || results.length === 0) {
        return callback({ message: "Branch not found" }, null);
      }

      return callback(null, results[0]);

    } catch (error) {
      console.error("Error validating login:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  logout: async (id, callback) => {
    try {
      const sql = `
            UPDATE \`branches\`
            SET \`login_token\` = NULL, \`token_expiry\` = NULL
            WHERE \`id\` = ?
        `;

      const result = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.UPDATE,
      });

      const affectedRows = result[1];

      if (affectedRows === 0) {
        return callback({ message: "Token clear failed. Branch not found or no changes made." }, null);
      }

      return callback(null, { success: true, message: "Logout successful.", affectedRows });

    } catch (error) {
      console.error("Error during logout:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  findById: async (customer_id, sub_user_id, branch_id, callback) => {
    try {
      let sql = "";
      let queryParams = [];

      // Determine SQL query based on whether sub_user_id is provided
      if (customer_id && String(customer_id).trim() !== "") {
        sql = `
          SELECT id as customer_id, status, login_token, token_expiry
          FROM customers
          WHERE id = ?
        `;
        queryParams = [customer_id];
      } else if (sub_user_id && String(sub_user_id).trim() !== "") {
        sql = `
          SELECT id, customer_id, email, status, login_token, token_expiry
          FROM branch_sub_users
          WHERE branch_id = ? AND id = ?
        `;
        queryParams = [branch_id, sub_user_id];
      } else {
        sql = `
          SELECT id, customer_id, name, email, status, login_token, token_expiry
          FROM branches
          WHERE id = ?
        `;
        queryParams = [branch_id];
      }

      const results = await sequelize.query(sql, {
        replacements: queryParams,
        type: QueryTypes.SELECT,
      });

      console.log(`results - `, results);

      // Handle case where no records are found
      if (results.length === 0) {
        return callback?.({ message: "Branch or sub_user not found" }, null);
      }

      // Return the first result (should be one result if ID is unique)
      return callback?.(null, results[0]);
    } catch (err) {
      console.error("Database query error:", err);
      return callback?.({ message: "Database query error", error: err }, null);
    }
  },

  isBranchActive: async (id, callback) => {
    try {
      const sql = `SELECT status FROM branches WHERE id = ?`;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Branch not found" }, null);
      }

      const isActive = results[0].status == 1;

      return callback(null, { isActive });
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { message: "Database query error", error: error },
        null
      );
    }
  },
  isBranchSubUserActive: async (id, callback) => {
    try {
      const sql = `
            SELECT \`status\`
            FROM \`branch_sub_users\`
            WHERE \`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (!results || results.length === 0) {
        return callback({ message: "Branch sub-user not found" }, null);
      }

      const isActive = results[0].status === 1;
      return callback(null, { isActive });

    } catch (error) {
      console.error("Error checking branch sub-user status:", error);
      return callback({ message: "Database query failed", error }, null);
    }
  },

  isCustomerActive: async (customerID, callback) => {
    try {
      const sql = `SELECT status FROM customers WHERE id = ?`;

      const results = await sequelize.query(sql, {
        replacements: [customerID],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Customer not found" }, null);
      }

      // Convert status to boolean (1 = active, 0 = inactive)
      const isActive = results[0].status == 1;

      return callback(null, { isActive });
    } catch (error) {
      console.error("Database query error:", error);
      return callback({ message: "Database query error", error }, null);
    }
  },
};

module.exports = Branch;
