const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Service = {
  create: async (title, description, email_description, short_code, group, sac_code, excel_sorting, admin_id, callback) => {
    try {
      // Step 1: Check for existing service
      const checkServiceSql = `
        SELECT * FROM services WHERE title = ? OR short_code = ?
      `;

      const [serviceResults] = await sequelize.query(checkServiceSql, {
        replacements: [title, short_code],
        type: QueryTypes.SELECT,
      });

      if (serviceResults && serviceResults.length > 0) {
        let errorMessage = "Service with the following values already exists: ";

        const titleExists = serviceResults.some(
          (result) => result.title.toLowerCase() === title.toLowerCase()
        );
        if (titleExists) errorMessage += "`title` ";

        const shortCodeExists = serviceResults.some(
          (result) => result.short_code.toLowerCase() === short_code.toLowerCase()
        );
        if (shortCodeExists) errorMessage += "`short_code` ";

        return callback({ message: errorMessage.trim() }, null);
      }

      // Step 2: Insert new service
      const insertServiceSql = `
          INSERT INTO services (title, description, email_description, short_code, \`group\`, sac_code, excel_sorting, admin_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

      const [results] = await sequelize.query(insertServiceSql, {
        replacements: [title, description, email_description, short_code, group, sac_code, excel_sorting, admin_id],
        type: QueryTypes.INSERT,
      });

      callback(null, { id: results, message: "Service created successfully" });

    } catch (err) {
      console.error("Database query error:", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  },

  list: async (callback) => {
    try {
      const sql = "SELECT * FROM `services`";

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

  serviceByTitle: async (searchWords, callback) => {
    try {
      if (!Array.isArray(searchWords) || searchWords.length === 0) {
        return callback(new Error("Invalid search words"), null);
      }

      // Convert search words into a SQL "LIKE" clause
      const likeClauses = searchWords.map(() => `LOWER(title) LIKE LOWER(?)`).join(" AND ");
      const sql = `SELECT * FROM services WHERE ${likeClauses} LIMIT 1`;

      const values = searchWords.map(word => `%${word.toLowerCase()}%`);

      const [results] = await sequelize.query(sql, {
        replacements: values,
        type: QueryTypes.SELECT,
      });

      callback(null, results || null);

    } catch (err) {
      console.error("Database query error:", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  digitalAddressService: async (callback) => {
    try {
      const sql = `
        SELECT * FROM services
        WHERE LOWER(title) LIKE '%digital%'
        AND (LOWER(title) LIKE '%verification%' OR LOWER(title) LIKE '%address%')
        LIMIT 1
      `;

      const [results] = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results || null);

    } catch (err) {
      console.error("Database query error:", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  digitlAddressService: async (callback) => {
    const sql = `
      SELECT * FROM \`services\`
      WHERE LOWER(\`title\`) LIKE '%digital%'
      AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
      LIMIT 1
    `;
    const results = await sequelize.query(sql, {
      type: QueryTypes.SELECT,
    });
    const singleEntry = results.length > 0 ? results[0] : null;
    callback(null, singleEntry); // Return single entry or null if not found
  },

  getServiceById: async (id, callback) => {
    try {
      const sql = "SELECT * FROM `services` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT, // Ensures we only retrieve data
      });

      if (results.length === 0) {
        return callback({ message: "Service not found" }, null);
      }

      callback(null, results[0]); // Return the first result
    } catch (err) {
      console.error("Database query error: 49", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  getServiceRequiredDocumentsByServiceId: async (service_id, callback) => {
    try {
      const sql = "SELECT `email_description`, `title` FROM `services` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [service_id],
        type: QueryTypes.SELECT, // Ensures data retrieval
      });

      if (results.length === 0) {
        return callback({ message: "Service not found" }, null);
      }

      callback(null, results[0]); // Return the first result
    } catch (err) {
      console.error("Database query error: 50", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  update: async (id, title, description, email_description, short_code, sac_code, excel_sorting, callback) => {
    try {
      // Step 1: Check if a service with the same title or short_code already exists (excluding current id)
      const checkServiceSql = `
        SELECT * FROM \`services\` WHERE (\`title\` = ? OR \`short_code\` = ?) AND \`id\` != ?
      `;
      const serviceResults = await sequelize.query(checkServiceSql, {
        replacements: [title, short_code, id],
        type: QueryTypes.SELECT,
      });

      if (serviceResults.length > 0) {
        let errorMessage = "Service with the following values already exists: ";

        const titleExists = serviceResults.some(
          (result) => result.title.toLowerCase() === title.toLowerCase()
        );
        if (titleExists) {
          errorMessage += "`title` ";
        }

        const shortCodeExists = serviceResults.some(
          (result) => result.short_code.toLowerCase() === short_code.toLowerCase()
        );
        if (shortCodeExists) {
          errorMessage += "`short_code` ";
        }

        return callback({ message: errorMessage.trim() }, null);
      }

      // Step 2: Perform the update
      const updateSql = `
        UPDATE \`services\`
        SET \`title\` = ?, \`description\` = ?, \`email_description\` = ?, \`short_code\` = ?, \`sac_code\` = ?, \`excel_sorting\` = ?
        WHERE \`id\` = ?
      `;

      const [results] = await sequelize.query(updateSql, {
        replacements: [title, description, email_description, short_code, sac_code, excel_sorting, id],
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (err) {
      console.error("Database query error: 51", err);
      callback({ message: "Database query error", error: err }, null);
    }
  },

  delete: async (id, callback) => {
    try {
      const deleteSql = `
        DELETE FROM \`services\`
        WHERE \`id\` = ?
      `;

      // Perform the delete query
      const result = await sequelize.query(deleteSql, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      // If result is an object, check affectedRows or similar fields
      if (result && result.affectedRows > 0) {
        return callback(null, { status: true, message: "Service deleted successfully", result });
      } else {
        return callback(null, { status: false, message: "No service found with the given ID" });
      }
    } catch (err) {
      console.error("Database query error: 51", err);
      return callback({ message: "Database query error", error: err }, null);
    }
  }

};

module.exports = Service;
