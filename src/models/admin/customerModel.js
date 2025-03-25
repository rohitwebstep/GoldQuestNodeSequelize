const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Admin = {
  findByEmailOrMobile: async (username, callback) => {
    try {
      const sql = `
            SELECT \`id\`, \`emp_id\`, \`name\`, \`profile_picture\`, 
                   \`email\`, \`mobile\`, \`status\`, \`login_token\`, \`token_expiry\`
            FROM \`admins\`
            WHERE \`email\` = ? OR \`mobile\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [username, username],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback({ message: "No admin found with the provided email or mobile" }, null);
      }

      callback(null, results);
    } catch (error) {
      console.error("Error finding admin by email or mobile:", error);
      callback(error, null);
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
        replacements: [username, username, password],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(
          { message: "Incorrect password or username" },
          null
        );
      }

      callback(null, results);
    } catch (error) {
      callback({ message: "An error occurred while validating credentials", error }, null);
    }
  },

  updateToken: async (id, token, tokenExpiry, callback) => {
    try {
      const sql = `
        UPDATE \`admins\`
        SET \`login_token\` = ?, \`token_expiry\` = ?
        WHERE \`id\` = ?
      `;

      const [results] = await sequelize.query(sql, {
        replacements: [token, tokenExpiry, id],
        type: QueryTypes.UPDATE, // Changed to UPDATE instead of SELECT
      });

      if (results.affectedRows === 0) {
        return callback(
          {
            message: "Token update failed. Admin not found or no changes made.",
          },
          null
        );
      }

      callback(null, results);
    } catch (error) {
      callback(
        { message: "An error occurred while updating the token", error },
        null
      );
    }
  },

  validateLogin: async (id, callback) => {
    try {
      const sql = `
        SELECT \`login_token\`
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

      callback(null, results);
    } catch (error) {
      callback({ message: "An error occurred while validating login", error }, null);
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

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.UPDATE, // Changed to UPDATE instead of SELECT
      });

      if (results.affectedRows === 0) {
        return callback(
          {
            message: "Token clear failed. Admin not found or no changes made.",
          },
          null
        );
      }

      callback(null, results);
    } catch (error) {
      callback({ message: "An error occurred while logging out", error }, null);
    }
  }

};

module.exports = Admin;
