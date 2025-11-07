const crypto = require("crypto");
const { sequelize } = require("../../../config/db");
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
  isBranchTokenValid: async (_token, customer_id, sub_user_id, branch_id, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      let sql, queryParams, currentRole;

      // Determine which table to query based on sub_user_id presence
      if (customer_id && String(customer_id).trim() !== "") {
        sql = `SELECT login_token, token_expiry FROM customers WHERE id = ?`;
        queryParams = [customer_id];
        currentRole = "Additional User";
      }else if (sub_user_id && String(sub_user_id).trim() !== "") {
        sql = `SELECT login_token, token_expiry FROM branch_sub_users WHERE id = ?`;
        queryParams = [sub_user_id];
        currentRole = "Sub User";
      } else {
        sql = `SELECT login_token, token_expiry FROM branches WHERE id = ?`;
        queryParams = [branch_id];
        currentRole = "Branch";
      }

      const results = await sequelize.query(sql, {
        replacements: queryParams,
        type: QueryTypes.SELECT,
      });

      // Handle case where no records are found
      if (results.length === 0) {
        return callback?.({ status: false, message: `${currentRole} not found` }, null);
      }

      const { login_token: currentToken, token_expiry } = results[0];
      const tokenExpiry = new Date(token_expiry);
      const currentTime = new Date();

      // Check if provided token matches stored token
      if (_token !== currentToken) {
        return callback?.({ status: false, message: `Invalid token provided for ${currentRole}` }, null);
      }

      // If token is still valid, return success
      if (tokenExpiry > currentTime) {
        return callback?.(null, { status: true, message: "Token is valid" });
      }

      // If token expired, refresh it
      const newToken = generateToken();
      const newTokenExpiry = getTokenExpiry();


      let updateSql, updateQueryParams;

      // Determine which table to query based on sub_user_id presence
      if (customer_id && String(customer_id).trim() !== "") {
        updateSql = `UPDATE customers SET login_token = ?, token_expiry = ? WHERE id = ?`;
        updateQueryParams = [newToken, newTokenExpiry, customer_id];
      }else if (sub_user_id && String(sub_user_id).trim() !== "") {
        updateSql = `UPDATE branch_sub_users SET login_token = ?, token_expiry = ? WHERE id = ?`;
        updateQueryParams = [newToken, newTokenExpiry, sub_user_id];
      } else {
        updateSql = `UPDATE branches SET login_token = ?, token_expiry = ? WHERE id = ?`;
        updateQueryParams = [newToken, newTokenExpiry, branch_id];
      }
      
      await sequelize.query(updateSql, {
        replacements: updateQueryParams,
        type: QueryTypes.UPDATE,
      });

      callback?.(null, {
        status: true,
        message: "Token was expired and has been refreshed",
        newToken,
      });

    } catch (err) {
      console.error("Database query error:", err);
      callback?.({ status: false, message: "Database query error", error: err }, null);
    }
  },

  branchLoginLog: async (branch_id, action, result, error, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function.");
        return;
      }

      const insertSql = `
        INSERT INTO branch_login_logs (branch_id, action, result, error, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `;

      await sequelize.query(insertSql, {
        replacements: [branch_id, action, result, error],
        type: QueryTypes.INSERT,
      });

      return callback?.(null, {
        status: true,
        message: "Branch login log entry added successfully",
      });
    } catch (err) {
      console.error("Database insert error:", err);
      return callback?.({ message: "Database insert error", error: err }, null);
    }
  },

  branchActivityLog: async (
    branch_id,
    module,
    action,
    result,
    update,
    error,
    callback
  ) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function.");
      return;
    }

    try {
      const insertSql = `
        INSERT INTO \`branch_activity_logs\` (\`branch_id\`, \`module\`, \`action\`, \`result\`, \`update\`, \`error\`, \`created_at\`)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;

      await sequelize.query(insertSql, {
        replacements: [branch_id, module, action, result, update, error],
        type: QueryTypes.INSERT,
      });

      callback(null, {
        status: true,
        message: "Branch activity log entry added successfully.",
      });
    } catch (err) {
      console.error("Error inserting branch activity log:", err);
      callback(
        {
          status: false,
          message: "Failed to add branch activity log.",
          error: err.message,
        },
        null
      );
    }
  },

  isBranchAuthorizedForAction: async (branch_id, action, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      const sql = `SELECT permissions FROM branches WHERE id = ?`;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback?.({ status: false, message: "Branch not found" });
      }

      const permissionsRaw = results[0].permissions;

      // If the permissions field is null/empty
      if (!permissionsRaw) {
        console.error("Permissions field is empty or null");
        return callback?.({ status: false, message: "Access Denied" });
      }

      let permissions;
      try {
        permissions = JSON.parse(permissionsRaw);
      } catch (jsonError) {
        console.error("Error parsing permissions JSON:", jsonError);
        return callback?.({ status: false, message: "Invalid permissions format" });
      }

      // Ensure permissions is an object (handles edge cases where it's a stringified string)
      if (typeof permissions === "string") {
        try {
          permissions = JSON.parse(permissions);
        } catch (jsonError) {
          console.error("Error parsing permissions JSON again:", jsonError);
          return callback?.({ status: false, message: "Invalid permissions format" });
        }
      }

      // Check if the requested action is allowed
      if (!permissions[action]) {
        console.error(`Action '${action}' is not found in permissions`);
        return callback?.({ status: false, message: "Access Denied" });
      }

      return callback?.({ status: true, message: "Authorization Successful" });

    } catch (err) {
      console.error("Database query error:", err);
      return callback?.({ status: false, message: "Database query error", error: err });
    }
  },

  getBranchandCustomerEmailsForNotification: async (branch_id, callback) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function");
      return;
    }

    try {
      // First query to get branch email and customer_id from the branches table
      const branchSql = `
            SELECT \`name\`, \`email\`, \`customer_id\`
            FROM \`branches\`
            WHERE \`id\` = ?
        `;
      const branchResults = await sequelize.query(branchSql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      if (branchResults.length === 0) {
        return callback({ status: false, message: "Branch not found" }, null);
      }

      const branch = branchResults[0];
      const customerId = branch.customer_id;

      // Second query to get customer email from the customers table
      const customerSql = `
            SELECT \`emails\`, \`name\`
            FROM \`customers\`
            WHERE \`id\` = ?
        `;

      const customerResults = await sequelize.query(customerSql, {
        replacements: [customerId],
        type: QueryTypes.SELECT,
      });

      if (customerResults.length === 0) {
        return callback({ status: false, message: "Customer not found" }, null);
      }

      const customer = customerResults[0];

      // Return both branch and customer emails
      callback(null, {
        status: true,
        message: "Emails retrieved successfully",
        branch,
        customer,
      });

    } catch (error) {
      console.error("Database query error:", error);
      callback({ status: false, message: "Internal Server Error" }, null);
    }
  },

  getCustomerNameByBranchID: async (branch_id, callback) => {
    try {
      if (typeof callback !== "function") {
        console.error("Callback is not a function");
        return;
      }

      // Query to get customer_id from branches table
      const branchSql = `
        SELECT \`customer_id\`
        FROM \`branches\`
        WHERE \`id\` = ?;
      `;

      const branchResults = await sequelize.query(branchSql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      if (branchResults.length === 0) {
        return callback({ status: false, message: "Branch not found" }, null);
      }

      const customerId = branchResults[0].customer_id;

      // Query to get customer name from customers table
      const customerSql = `
        SELECT \`name\`
        FROM \`customers\`
        WHERE \`id\` = ?;
      `;

      const customerResults = await sequelize.query(customerSql, {
        replacements: [customerId],
        type: QueryTypes.SELECT,
      });

      if (customerResults.length === 0) {
        return callback({ status: false, message: "Customer not found" }, null);
      }

      callback(null, {
        status: true,
        message: "Customer name retrieved successfully",
        customer_name: customerResults[0].name,
        branch_id: branch_id,
      });
    } catch (error) {
      console.error("Error fetching customer name:", error);
      callback({ status: false, message: "Internal server error" }, null);
    }
  },

};

module.exports = common;
