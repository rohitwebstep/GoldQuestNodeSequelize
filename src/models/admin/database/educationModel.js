const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const Education = {
  create: async (
    college_name,
    poc_name,
    designation,
    email,
    contact,
    verification_mode,
    turn_around_time,
    verification_process,
    remarks,
    admin_id,
    callback
  ) => {
    try {
      const insertEducationSql = `
            INSERT INTO \`education_database\` (
                \`college_name\`,
                \`poc_name\`,
                \`designation\`,
                \`email\`,
                \`contact\`,
                \`verification_mode\`,
                \`turn_around_time\`,
                \`verification_process\`,
                \`remarks\`,
                \`added_by\`
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `;

      const results = await sequelize.query(insertEducationSql, {
        replacements: [
          college_name,
          poc_name,
          designation,
          email,
          contact,
          verification_mode,
          turn_around_time,
          verification_process,
          remarks,
          admin_id,
        ],
        type: QueryTypes.INSERT, // ✅ Correct Query Type
      });

      callback(null, results);
    } catch (error) {
      console.error("Error inserting education record:", error);
      callback(new Error("Failed to insert education record"), null);
    }
  },

  list: async (callback) => {
    try {
      const sql = `
            SELECT ED.*, A.name AS \`added_by_name\`
            FROM \`education_database\` AS ED
            INNER JOIN \`admins\` AS A ON A.id = ED.added_by;
        `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching education records:", error);
      callback(new Error("Failed to fetch education records"), null);
    }
  },

  getEducationById: async (id, callback) => {
    try {
      const sql = `
            SELECT ED.*, A.name AS \`added_by_name\`
            FROM \`education_database\` AS ED
            INNER JOIN \`admins\` AS A ON A.id = ED.added_by
            WHERE ED.\`id\` = ?;
        `;

      const results = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length ? results[0] : null);
    } catch (error) {
      console.error("Error fetching education record:", error);
      callback(new Error("Failed to fetch education record"), null);
    }
  },

  update: async (
    id,
    college_name,
    poc_name,
    designation,
    email,
    contact,
    verification_mode,
    turn_around_time,
    verification_process,
    remarks,
    callback
  ) => {
    try {
      const sql = `
        UPDATE 
            \`education_database\`
        SET 
            \`college_name\` = ?,
            \`poc_name\` = ?,
            \`designation\` = ?,
            \`email\` = ?,
            \`contact\` = ?,
            \`verification_mode\` = ?,
            \`turn_around_time\` = ?,
            \`verification_process\` = ?,
            \`remarks\` = ?,
            \`updated_at\` = NOW()
        WHERE \`id\` = ?;
        `;

      const [results] = await sequelize.query(sql, {
        replacements: [
          college_name,
          poc_name,
          designation,
          email,
          contact,
          verification_mode,
          turn_around_time,
          verification_process,
          remarks,
          id,
        ],
        type: QueryTypes.UPDATE,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error updating education record:", error);
      callback(new Error("Failed to update education record"), null);
    }
  },

  delete: async (id, callback) => {
    try {
      const sql = `
        DELETE FROM \`education_database\`
        WHERE \`id\` = ?;
        `;

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.DELETE,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error deleting education record:", error);
      callback(new Error("Failed to delete education record"), null);
    }
  },

};

module.exports = Education;
