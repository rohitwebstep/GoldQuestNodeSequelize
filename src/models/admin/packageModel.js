const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Package = {
  create: async (title, description, admin_id, callback) => {
    try {
      // Step 1: Check if a package with the same title already exists
      const checkPackageSql = `SELECT * FROM packages WHERE title = ?`;
      const [packageResults = []] = await sequelize.query(checkPackageSql, {
        replacements: [title],
        type: sequelize.QueryTypes.SELECT,
      });
  
      // Now we can safely check for the length
      if (packageResults.length > 0) {
        return callback({ message: "Package with the same title already exists." }, null);
      }
  
      // Step 2: Insert new package
      const insertSql = `
        INSERT INTO packages (title, description, admin_id)
        VALUES (?, ?, ?)
      `;
      const [results] = await sequelize.query(insertSql, {
        replacements: [title, description, admin_id],
        type: sequelize.QueryTypes.INSERT,
      });
  
      return callback(null, { status: true, message: "Package created successfully", results });
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },  

  list: async (callback) => {
    try {
      const sql = "SELECT * FROM `packages`";

      // Execute query using Sequelize raw query
      const results = await sequelize.query(sql, {
        type: sequelize.QueryTypes.SELECT,
      });

      return callback(null, results);
    } catch (err) {
      console.error("Database query error:", err);
      return callback(err, null);
    }
  },

  getPackageById: async (id, callback) => {
    try {
      const sql = `SELECT * FROM packages WHERE id = ?`;

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: sequelize.QueryTypes.SELECT,
      });
      if (results && results.length > 0) {
        return callback(null, results[0]); // Return the first package
      } else {
        return callback(null, { status: false, message: "No package found with the given ID" });
      }
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  update: async (id, title, description, callback) => {
    try {
      // Step 1: Check if a package with the same title already exists
      const checkPackageSql = `SELECT * FROM packages WHERE title = ? AND id != ?`;
      const packageResults = await sequelize.query(checkPackageSql, {
        replacements: [title, id],
        type: sequelize.QueryTypes.SELECT,
      });

      if (packageResults.length > 0) {
        return callback({ message: "Package with the same title already exists." }, null);
      }

      // Step 2: Update package details
      const updateSql = `
        UPDATE packages
        SET title = ?, description = ?
        WHERE id = ?
      `;
      const [results] = await sequelize.query(updateSql, {
        replacements: [title, description, id],
        type: sequelize.QueryTypes.UPDATE,
      });

      return callback(null, { status: true, message: "Package updated successfully", results });
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = `DELETE FROM packages WHERE id = ?`;
  
      // Perform the delete query
      const result = await sequelize.query(sql, {
        replacements: [id],
        type: sequelize.QueryTypes.DELETE,
      });
      
      // Check if any rows were affected (check result.affectedRows)
      if (result && result.affectedRows > 0) {
        return callback(null, { status: true, message: "Package deleted successfully", result });
      } else {
        return callback(null, { status: false, message: "No package found with the given ID" });
      }
    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  }
  
};

module.exports = Package;
