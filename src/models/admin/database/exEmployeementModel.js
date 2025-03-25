const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const ExEmployeementModel = {
  create: async (
    company_name,
    poc_name,
    designation,
    email_id,
    contact,
    land_line_no,
    tot,
    verification_mode,
    pricing,
    verification_process,
    remarks,
    admin_id,
    callback
  ) => {
    try {
      // Insert the new Ex-Employment
      const insertExEmploymentSql = `
            INSERT INTO \`ex_employment_database\` (
                \`company_name\`,
                \`poc_name\`,
                \`designation\`,
                \`email_id\`,
                \`contact\`,
                \`land_line_no\`,
                \`tot\`,
                \`verification_mode\`,
                \`pricing\`,
                \`verification_process\`,
                \`remarks\`,
                \`added_by\`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

      const [results] = await sequelize.query(insertExEmploymentSql, {
        replacements: [
          company_name,
          poc_name,
          designation,
          email_id,
          contact,
          land_line_no,
          tot,
          verification_mode,
          pricing,
          verification_process,
          remarks,
          admin_id,
        ],
        type: QueryTypes.INSERT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error inserting ex-employment record:", error);
      callback(new Error("Failed to insert ex-employment record"), null);
    }
  },

  list: async (callback) => {
    try {
      const sql = `
            SELECT 
                EED.*, 
                A.name AS \`added_by_name\` 
            FROM \`ex_employment_database\` AS EED 
            INNER JOIN \`admins\` AS A ON A.id = EED.added_by
        `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching ex-employment records:", error);
      callback(new Error("Failed to fetch ex-employment records"), null);
    }
  },

  getExEmployeementById: async (id, callback) => {
    try {
      const sql = `
            SELECT 
                EED.*, 
                A.name AS \`added_by_name\` 
            FROM \`ex_employment_database\` AS EED 
            INNER JOIN \`admins\` AS A ON A.id = EED.added_by 
            WHERE EED.\`id\` = ?
        `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error fetching ex-employment record:", error);
      callback(new Error("Failed to fetch ex-employment record"), null);
    }
  },

  update: async (
    id,
    company_name,
    poc_name,
    designation,
    email_id,
    contact,
    land_line_no,
    tot,
    verification_mode,
    pricing,
    verification_process,
    remarks,
    callback
  ) => {
    try {
      const sql = `
            UPDATE \`ex_employment_database\`
            SET 
                \`company_name\` = ?, 
                \`poc_name\` = ?, 
                \`designation\` = ?, 
                \`email_id\` = ?, 
                \`contact\` = ?, 
                \`land_line_no\` = ?, 
                \`tot\` = ?, 
                \`verification_mode\` = ?, 
                \`pricing\` = ?, 
                \`verification_process\` = ?, 
                \`remarks\` = ?
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: [
          company_name,
          poc_name,
          designation,
          email_id,
          contact,
          land_line_no,
          tot,
          verification_mode,
          pricing,
          verification_process,
          remarks,
          id,
        ],
        type: QueryTypes.UPDATE, // ✅ Correct query type
      });

      callback(null, results);
    } catch (error) {
      console.error("Error updating ex-employment record:", error);
      callback(new Error("Failed to update ex-employment record"), null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = `
            DELETE FROM \`ex_employment_database\`
            WHERE \`id\` = ?
        `;

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.DELETE, // ✅ Correct query type
      });

      callback(null, results);
    } catch (error) {
      console.error("Error deleting ex-employment record:", error);
      callback(new Error("Failed to delete ex-employment record"), null);
    }
  },

};

module.exports = ExEmployeementModel;
