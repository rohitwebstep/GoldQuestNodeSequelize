const { sequelize } = require("../../../config/db");
const { QueryTypes } = require("sequelize");

const reportCaseStatus = {
  reportFormJsonByServiceID: async (service_id, callback) => {
    try {
      const sql = "SELECT `json` FROM `report_forms` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [service_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length ? results[0] : null);
    } catch (error) {
      console.error("Error fetching report form JSON:", error);
      callback(error, null);
    }
  },


  annexureData: async (client_application_id, db_table, callback) => {
    try {
      // Check if the table exists
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?`;

      const results = await sequelize.query(checkTableSql, {
        replacements: [db_table],
        type: QueryTypes.SELECT,
      });

      if (results[0].count === 0) {
        // Table does not exist, create it
        const createTableSql = `
          CREATE TABLE \`${db_table}\` (
            \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
            \`cmt_id\` bigint(20) NOT NULL,
            \`client_application_id\` bigint(20) NOT NULL,
            \`branch_id\` int(11) NOT NULL,
            \`customer_id\` int(11) NOT NULL,
            \`status\` ENUM(
              'nil', 'initiated', 'hold', 'closure_advice', 'wip', 'insuff', 'completed', 
              'stopcheck', 'active_employment', 'not_doable', 'candidate_denied', 
              'completed_green', 'completed_orange', 'completed_red', 'completed_yellow', 'completed_pink'
            ) DEFAULT NULL,
            \`is_submitted\` TINYINT(1) DEFAULT 0,
            \`is_billed\` TINYINT(1) DEFAULT 0,
            \`billed_date\` TIMESTAMP NULL DEFAULT NULL,
            \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            KEY \`client_application_id\` (\`client_application_id\`),
            KEY \`cmt_application_customer_id\` (\`customer_id\`),
            KEY \`cmt_application_cmt_id\` (\`cmt_id\`),
            CONSTRAINT \`fk_${db_table}_client_application_id\` FOREIGN KEY (\`client_application_id\`) REFERENCES \`client_applications\` (\`id\`) ON DELETE CASCADE,
            CONSTRAINT \`fk_${db_table}_customer_id\` FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\` (\`id\`) ON DELETE CASCADE,
            CONSTRAINT \`fk_${db_table}_cmt_id\` FOREIGN KEY (\`cmt_id\`) REFERENCES \`cmt_applications\` (\`id\`) ON DELETE CASCADE
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

        await sequelize.query(createTableSql, { type: QueryTypes.RAW });
      }

      // Fetch data after ensuring the table exists
      const sql = `SELECT * FROM \`${db_table}\` WHERE \`client_application_id\` = ?`;
      const dataResults = await sequelize.query(sql, {
        replacements: [client_application_id],
        type: QueryTypes.SELECT,
      });

      callback(null, dataResults[0] || null);
    } catch (error) {
      console.error("Error in annexureData:", error);
      callback(error, null);
    }
  },

};

module.exports = reportCaseStatus;
