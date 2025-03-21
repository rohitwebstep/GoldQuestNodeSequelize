const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const Holiday = {
  create: async (title, date, callback) => {
    try {
      // Step 1: Check if a holiday with the same title already exists
      const checkHolidaySql = `
            SELECT * FROM \`holidays\` WHERE \`title\` = ?
        `;

      const holidayResults = await sequelize.query(checkHolidaySql, {
        replacements: [title],
        type: QueryTypes.SELECT,
      });

      // Step 2: If a holiday with the same title exists, return an error
      if (holidayResults.length > 0) {
        const error = new Error("Holiday with the same name already exists");
        return callback(error, null);
      }

      // Step 3: Insert the new holiday
      const insertHolidaySql = `
            INSERT INTO \`holidays\` (\`title\`, \`date\`) VALUES (?, ?)
        `;

      const [results, metadata] = await sequelize.query(insertHolidaySql, {
        replacements: [title, date],
        type: QueryTypes.INSERT,
      });

      // Return the ID of the inserted record
      callback(null, { id: metadata.insertId, title, date });
    } catch (error) {
      callback(error, null);
    }
  },

  list: async (callback) => {
    try {
      const sql = `SELECT * FROM \`holidays\``;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  digitlAddressHoliday: async (callback) => {
    try {
      const sql = `
            SELECT * FROM \`holidays\`
            WHERE LOWER(\`title\`) LIKE '%digital%'
            AND (LOWER(\`title\`) LIKE '%verification%' OR LOWER(\`title\`) LIKE '%address%')
            LIMIT 1
        `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      // Return single entry or null if not found
      const singleEntry = results.length > 0 ? results[0] : null;
      callback(null, singleEntry);
    } catch (error) {
      callback(error, null);
    }
  },

  getHolidayById: async (id, callback) => {
    try {
      const sql = `SELECT * FROM \`holidays\` WHERE \`id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      // Return the first result if found, else null
      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      callback(error, null);
    }
  },

  getHolidayRequiredDocumentsByHolidayId: async (holiday_id, callback) => {
    try {
      const sql = `SELECT * FROM \`holiday_required_documents\` WHERE \`holiday_id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [holiday_id],
        type: QueryTypes.SELECT,
      });

      // Return the full results array
      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

  update: async (id, title, date, callback) => {
    try {
      const sql = `
            UPDATE \`holidays\`
            SET \`title\` = ?, \`date\` = ?
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: [title, date, id],
        type: QueryTypes.UPDATE,
      });

      // Return the number of affected rows
      callback(null, { affectedRows: results });
    } catch (error) {
      callback(error, null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = `
        DELETE FROM \`holidays\`
        WHERE \`id\` = ?
      `;

      // Run the query and capture the result directly
      const result = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      // The number of affected rows is the first property of the result
      callback(null, result);
    } catch (error) {
      callback(error, null);
    }
  }
};

module.exports = Holiday;
