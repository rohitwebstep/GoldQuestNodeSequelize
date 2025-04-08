const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Admin = {

  findByEmailOrMobile: async (username, callback) => {
    const sql = `
      SELECT \`id\`, \`emp_id\`, \`name\`, \`profile_picture\`, \`email\`, \`mobile\`, \`status\`, \`login_token\`, \`token_expiry\`, \`otp\`, \`two_factor_enabled\`, \`otp_expiry\`, \`role\`
      FROM \`admins\`
      WHERE \`email\` = ? OR \`mobile\` = ?
    `;

    const [results] = await sequelize.query(sql, {
      replacements: [username, username], // Positional replacements using ?
      type: QueryTypes.SELECT,
    });

    if (results.length === 0) {
      return callback(
        { message: "No admin found with the provided email or mobile" },
        null
      );
    }
    callback(null, results);
  },

  list: async (callback) => {
    try {
      const sql = `
        SELECT id, emp_id, name, role, profile_picture, email, service_ids, status, mobile, is_qc_verifier, is_report_generator 
        FROM admins
      `;

      // Execute query using Sequelize raw query
      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  filterAdmins: async ({ status, role }, callback) => {
    try {
      let sql = `
        SELECT 
          id, emp_id, name, role, profile_picture, email, 
          service_ids, status, mobile 
        FROM admins
      `;
      const conditions = [];
      const values = [];

      // Normalize status filter (expecting "1" or "0" as string)
      if (status !== undefined) {
        const statusValue = status === "active" || status === "1" ? "1" : "0";
        conditions.push("status = ?");
        values.push(statusValue);
      }

      // Apply role filter if provided
      if (role) {
        conditions.push("role = ?");
        values.push(role);
      }

      // Append conditions only if there are any filters
      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }

      // Execute raw query using Sequelize
      const results = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  filterAdminsForReport: async ({ status, type }, callback) => {
    if (!type) {
      return callback({ message: "Type is required" }, null);
    }

    let column;
    switch (type) {
      case 'QCVerificationTeam':
        column = 'is_qc_verifier';
        break;
      case 'ReportGenerationTeam':
        column = 'is_report_generator';
        break;
      default:
        return callback({ message: "Invalid type provided" }, null);
    }

    try {
      let sql = `
        SELECT 
          id, emp_id, name, role, profile_picture, email, 
          service_ids, status, mobile 
        FROM admins
      `;

      const conditions = [];
      const values = [];

      // Handle status filter
      if (status !== undefined) {
        const statusValue = (status === "active" || status === "1") ? "1" : "0";
        conditions.push("status = ?");
        values.push(statusValue);
      }

      // Add type-specific column filter
      if (column) {
        conditions.push(`${column} = ?`);
        values.push("1");
      }

      // Append conditions if any
      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }

      const results = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },


  create: async (data, callback) => {
    try {
      const { name, mobile, email, employee_id, role, password, service_ids, is_qc_verifier, is_report_generator } = data;

      // SQL query to check if any field already exists in the admins table
      const checkExistingQuery = `
        SELECT * FROM \`admins\` WHERE \`email\` = ? OR \`mobile\` = ? OR \`emp_id\` = ?
      `;

      const existingAdmins = await sequelize.query(checkExistingQuery, {
        replacements: [email, mobile, employee_id],
        type: QueryTypes.SELECT,
      });

      if (existingAdmins.length > 0) {
        const usedFields = [];

        for (const admin of existingAdmins) {
          if (admin.email === email) usedFields.push("email");
          if (admin.mobile === mobile) usedFields.push("mobile");
          if (admin.emp_id === employee_id) usedFields.push("Employee ID");
        }

        if (usedFields.length > 0) {
          return callback(
            {
              message: `Another admin is registered with the following ${usedFields.join(" and ")}.`,
            },
            null
          );
        }
      }

      // If role is 'admin', exclude service_ids
      const sql =
        role.toLowerCase() === "admin"
          ? `INSERT INTO \`admins\` (\`name\`, \`emp_id\`, \`mobile\`, \`email\`, \`role\`, \`is_qc_verifier\`, \`is_report_generator\`, \`status\`, \`password\`) 
             VALUES (?, ?, ?, ?, ?, ?, md5(?))`
          : `INSERT INTO \`admins\` (\`name\`, \`emp_id\`, \`mobile\`, \`email\`, \`role\`, \`is_qc_verifier\`, \`is_report_generator\`, \`service_ids\`, \`status\`, \`password\`) 
             VALUES (?, ?, ?, ?, ?, ?, ?, md5(?))`;

      const queryParams =
        role.toLowerCase() === "admin"
          ? [name, employee_id, mobile, email, role, is_qc_verifier, is_report_generator, "1", password]
          : [name, employee_id, mobile, email, role, is_qc_verifier, is_report_generator, service_ids, "1", password];

      const results = await sequelize.query(sql, {
        replacements: queryParams,
        type: QueryTypes.INSERT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  update: async (data, callback) => {
    try {
      const { id, name, mobile, email, employee_id, role, status, service_ids, is_qc_verifier, is_report_generator } = data;

      // SQL query to check if any field already exists in the admins table (excluding current ID)
      const checkExistingQuery = `
        SELECT * FROM \`admins\` 
        WHERE (\`email\` = ? OR \`mobile\` = ? OR \`emp_id\` = ?) AND \`id\` != ?
      `;

      const existingAdmins = await sequelize.query(checkExistingQuery, {
        replacements: [email, mobile, employee_id, id],
        type: QueryTypes.SELECT,
      });

      if (existingAdmins.length > 0) {
        const usedFields = [];

        for (const admin of existingAdmins) {
          if (admin.email === email) usedFields.push("email");
          if (admin.mobile === mobile) usedFields.push("mobile");
          if (admin.emp_id === employee_id) usedFields.push("Employee ID");
        }

        if (usedFields.length > 0) {
          return callback(
            {
              message: `Another admin is registered with the following ${usedFields.join(" and ")}.`,
            },
            null
          );
        }
      }

      // Prepare update query based on the role
      const sql =
        role.toLowerCase() === "admin"
          ? `UPDATE \`admins\` 
             SET \`name\` = ?, \`emp_id\` = ?, \`mobile\` = ?, \`email\` = ?, \`role\` = ?, \`is_qc_verifier\` = ?, \`is_report_generator\` = ?, \`status\` = ? 
             WHERE \`id\` = ?`
          : `UPDATE \`admins\` 
             SET \`name\` = ?, \`emp_id\` = ?, \`mobile\` = ?, \`email\` = ?, \`role\` = ?, \`is_qc_verifier\` = ?, \`is_report_generator\` = ?, \`service_ids\` = ?, \`status\` = ? 
             WHERE \`id\` = ?`;

      const queryParams =
        role.toLowerCase() === "admin"
          ? [name, employee_id, mobile, email, role, is_qc_verifier, is_report_generator, status, id]
          : [name, employee_id, mobile, email, role, is_qc_verifier, is_report_generator, service_ids, status, id];

      const results = await sequelize.query(sql, {
        replacements: queryParams,
        type: QueryTypes.UPDATE,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = `DELETE FROM \`admins\` WHERE \`id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  upload: async (id, savedImagePaths, callback) => {
    try {
      const sqlUpdateCustomer = `
        UPDATE admins 
        SET profile_picture = ?
        WHERE id = ?
      `;

      const joinedPaths = savedImagePaths.join(", ");
      const queryParams = [joinedPaths, id];

      // Execute raw query using Sequelize
      const [results] = await sequelize.query(sqlUpdateCustomer, {
        replacements: queryParams,
        type: QueryTypes.UPDATE,
      });

      // Check if any rows were affected
      if (results.affectedRows > 0) {
        return callback(true, results); // Success
      } else {
        return callback(false, {
          error: "No rows updated. Please check the Admin ID.",
          details: results,
          query: sqlUpdateCustomer,
          params: queryParams,
        });
      }
    } catch (err) {
      console.error("Database update error:", err);
      return callback(false, {
        error: "Database error occurred.",
        details: err,
        query: sqlUpdateCustomer,
        params: [savedImagePaths.join(", "), id],
      });
    }
  },

  findByEmailOrMobile: async (username, callback) => {
    try {
      const sql = `
        SELECT \`id\`, \`emp_id\`, \`name\`, \`profile_picture\`, \`email\`, \`mobile\`, 
               \`status\`, \`login_token\`, \`token_expiry\`, \`otp\`, 
               \`two_factor_enabled\`, \`otp_expiry\`, \`role\`
        FROM \`admins\`
        WHERE \`email\` = ? OR \`mobile\` = ?
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [username, username],
      });

      if (results.length === 0) {
        return callback(
          { message: "No admin found with the provided email or mobile" },
          null
        );
      }

      callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  findByEmailOrMobileAllInfo: async (username, callback) => {
    try {
      const sql = `
        SELECT * FROM \`admins\`
        WHERE \`email\` = ? OR \`mobile\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [username, username],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(
          { message: "No admin found with the provided email or mobile" },
          null
        );
      }

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  validatePassword: async (username, password, callback) => {
    try {
      const sql = `
        SELECT \`id\`, \`emp_id\`, \`name\`, \`profile_picture\`, \`email\`, \`mobile\`, \`status\`
        FROM \`admins\`
        WHERE (\`email\` = ? OR \`mobile\` = ?)
        AND \`password\` = MD5(?)
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
        replacements: [username, username, password],
      });

      if (results.length === 0) {
        return callback(
          { message: "Incorrect username or password" },
          null
        );
      }

      callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  updatePassword: async (new_password, admin_id, callback) => {
    try {

      const sql = `
        UPDATE \`admins\`
        SET 
          \`password\` = MD5(?), 
          \`reset_password_token\` = NULL, 
          \`login_token\` = NULL, 
          \`token_expiry\` = NULL, 
          \`password_token_expiry\` = NULL 
        WHERE \`id\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [new_password, admin_id],
        type: QueryTypes.UPDATE,
      });

      // Check if any rows were updated
      if (results[1] === 0) {
        return callback(
          { message: "Admin not found or password not updated." },
          null
        );
      }

      return callback(null, {
        message: "Password updated successfully.",
        affectedRows: results[1],
      });

    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { message: "An error occurred while updating the password.", error },
        null
      );
    }
  },

  updateOTP: async (admin_id, otp, otp_expiry, callback) => {
    try {
      const sql = `
        UPDATE \`admins\`
        SET 
          \`otp\` = ?, 
          \`otp_expiry\` = ?,  
          \`reset_password_token\` = NULL, 
          \`login_token\` = NULL, 
          \`token_expiry\` = NULL, 
          \`password_token_expiry\` = NULL 
        WHERE \`id\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [otp, otp_expiry, admin_id],
        type: QueryTypes.UPDATE,
      });

      // Check if any rows were updated
      if (results[1] === 0) {
        return callback(
          { message: "Admin not found or OTP not updated. Please check the provided details." },
          null
        );
      }

      return callback(null, {
        message: "OTP updated successfully.",
        affectedRows: results[1],
      });
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { message: "An error occurred while updating the OTP.", error },
        null
      );
    }
  },

  updateToken: async (id, token, tokenExpiry, callback) => {
    const sql = `
      UPDATE admins
      SET login_token = ?, token_expiry = ?
      WHERE id = ?
    `;

    try {
      const [results] = await sequelize.query(sql, {
        replacements: [token, tokenExpiry, id], // Using ? placeholders
        type: QueryTypes.UPDATE,
      });

      if (results === 0) {
        return callback(
          { message: "Token update failed. Admin not found or no changes made." },
          null
        );
      }

      callback(null, { message: "Token updated successfully" });
    } catch (err) {
      console.error("Database update error:", err);
      return callback({ message: "Database update error", error: err }, null);
    }
  },

  setResetPasswordToken: async (id, token, tokenExpiry, callback) => {
    try {
      const sql = `
        UPDATE \`admins\`
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

      const results = await sequelize.query(sql, {
        replacements: [token, tokenExpiry, 1, id],
        type: QueryTypes.UPDATE,
      });

      if (results[1] === 0) {
        return callback(
          { success: false, message: "No admin found with the provided ID or no update required" },
          null
        );
      }

      return callback(null, {
        success: true,
        message: "Password reset token updated successfully",
        data: { affectedRows: results[1] },
      });
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { success: false, message: "Failed to update reset password token", error },
        null
      );
    }
  },

  updatePasswordResetPermission: async (status, admin_id, callback) => {
    try {
      const sql = `
        UPDATE \`admins\`
        SET \`can_request_password_reset\` = ?
        WHERE \`id\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [status, admin_id],
        type: QueryTypes.UPDATE,
      });

      if (results[1] === 0) {
        return callback(
          { success: false, message: "No admin found with the provided ID or no update was necessary" },
          null
        );
      }

      return callback(null, {
        success: true,
        message: `Password reset permission updated successfully to ${status ? 'Allowed' : 'Denied'}`,
        data: { affectedRows: results[1] },
      });
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { success: false, message: "Failed to update password reset permission", error },
        null
      );
    }
  },

  validateLogin: async (id, callback) => {
    try {
      const sql = `
        SELECT \`login_token\`, \`token_expiry\`
        FROM \`admins\`
        WHERE \`id\` = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Admin not found" }, null);
      }

      return callback(null, results);
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { message: "Database query error", error },
        null
      );
    }
  },

  // Clear login token and token expiry
  logout: async (id, callback) => {
    try {
      const sql = `
          UPDATE \`admins\`
          SET \`login_token\` = NULL, \`token_expiry\` = NULL
          WHERE \`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.UPDATE,
      });

      if (results[1] === 0) {
        return callback(
          {
            message:
              "Token clear failed. Admin not found or no changes made.",
          },
          null
        );
      }

      return callback(null, results);
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { message: "Database update error", error },
        null
      );
    }
  },

  findById: async (id, callback) => {
    try {
      const sql = `
        SELECT id, emp_id, name, profile_picture, email, mobile, status, login_token, token_expiry
        FROM admins
        WHERE id = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Admin not found" }, null);
      }

      callback(null, results[0]);
    } catch (error) {
      console.error("Database query error:", error);
      return callback(
        { message: "Database query error", error },
        null
      );
    }
  },

  fetchAllowedServiceIds: async (id, callback) => {
    try {
      const sql = `
        SELECT service_ids, role FROM admins
        WHERE id = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "Admin not found" }, null);
      }

      const { role, service_ids } = results[0];

      // If the role is not "admin" or "admin_user"
      if (!["admin", "admin_user"].includes(role)) {
        try {
          // Convert service_ids string to an array and map to numbers
          const serviceIdsArr = service_ids ? service_ids.split(",").map(Number) : [];

          return callback(null, { finalServiceIds: serviceIdsArr });
        } catch (parseErr) {
          console.error("Error parsing service_ids:", parseErr);
          return callback({ message: "Error parsing service_ids data", error: parseErr }, null);
        }
      }

      // If the role is "admin" or "admin_user"
      return callback(null, { finalServiceIds: [] });
    } catch (error) {
      console.error("Database query error:", error);
      return callback({ message: "Database query error", error }, null);
    }
  }
};

module.exports = Admin;
