const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const moment = require("moment"); // Ensure you have moment.js installed
// Function to hash the password using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

function calculateDueDate(startDate, tatDays = 0, holidayDates, weekendsSet) {
  // console.log("Starting calculation...");
  // console.log("Start Date:", startDate.format("YYYY-MM-DD"));
  // console.log("TAT Days:", tatDays);
  // console.log("Holiday Dates:", holidayDates.map(date => date.format("YYYY-MM-DD")));
  // console.log("Weekends Set:", weekendsSet);

  // Track remaining TAT days to process
  let remainingDays = tatDays;

  // Generate potential dates to check
  const potentialDates = Array.from({ length: tatDays * 2 }, (_, i) =>
    startDate.clone().add(i + 1, "days")
  );

  // console.log("Generated Potential Dates:", potentialDates.map(date => date.format("YYYY-MM-DD")));

  // Calculate the final due date
  let finalDueDate = potentialDates.find((date) => {
    const dayName = date.format("dddd").toLowerCase();
    // console.log(`Checking date: ${date.format("YYYY-MM-DD")} (Day: ${dayName})`);

    // Skip weekends
    if (weekendsSet.has(dayName)) {
      // console.log(`Skipping ${date.format("YYYY-MM-DD")} - It's a weekend.`);
      return false;
    }

    // Skip holidays
    if (holidayDates.some((holiday) => holiday.isSame(date, "day"))) {
      // console.log(`Skipping ${date.format("YYYY-MM-DD")} - It's a holiday.`);
      return false;
    }

    remainingDays--;
    // console.log(`Remaining Days: ${remainingDays}`);

    return remainingDays <= 0;
  });

  // console.log("Final Due Date:", finalDueDate ? finalDueDate.format("YYYY-MM-DD") : "Not Found");
  return finalDueDate;
}

const Customer = {
  list: async (filter_status, callback) => {
    try {
      let customersIDConditionString = "";

      if (filter_status && filter_status !== null && filter_status !== "") {
        // Query when `filter_status` exists
        const sql = `
        SELECT b.customer_id, 
               b.id AS branch_id, 
               b.name AS branch_name, 
               COUNT(ca.id) AS application_count,
               MAX(ca.created_at) AS latest_application_date
        FROM client_applications ca
        INNER JOIN branches b ON ca.branch_id = b.id
        INNER JOIN customers c ON ca.customer_id = c.id  -- Join with customers table
        WHERE ca.status = ? 
          AND c.status = 1  -- Ensure that the customer status is 1
        GROUP BY b.customer_id, b.id, b.name
        ORDER BY latest_application_date DESC;
      `;

        const results = await sequelize.query(sql, {
          replacements: [filter_status],
          type: QueryTypes.SELECT,
        });

        const customers_id = results.map(row => row.customer_id);
        if (customers_id.length > 0) {
          customersIDConditionString = ` AND customers.id IN (${customers_id.join(",")})`;
        }
      }
      // If no filter_status is provided, proceed with the final SQL query without filters
      const finalSql = `
          WITH BranchesCTE AS (
              SELECT 
                  b.id AS branch_id,
                  b.customer_id
              FROM 
                  branches b
          )
          SELECT 
              customers.client_unique_id,
              customers.name,
              customer_metas.tat_days,
              customer_metas.single_point_of_contact,
              customers.id AS main_id,
              COALESCE(branch_counts.branch_count, 0) AS branch_count,
              COALESCE(application_counts.application_count, 0) AS application_count
          FROM 
              customers
          LEFT JOIN 
              customer_metas ON customers.id = customer_metas.customer_id
          LEFT JOIN (
              SELECT 
                  customer_id, 
                  COUNT(*) AS branch_count
              FROM 
                  branches
              GROUP BY 
                  customer_id
          ) AS branch_counts ON customers.id = branch_counts.customer_id
          LEFT JOIN (
              SELECT 
                  b.customer_id, 
                  COUNT(ca.id) AS application_count,
                  MAX(ca.created_at) AS latest_application_date
              FROM 
                  BranchesCTE b
              INNER JOIN 
                  client_applications ca ON b.branch_id = ca.branch_id
                  WHERE ca.status != 'completed'
              GROUP BY 
                  b.customer_id
          ) AS application_counts ON customers.id = application_counts.customer_id
          WHERE 
              COALESCE(application_counts.application_count, 0) > 0
              ${customersIDConditionString}
          ORDER BY 
              application_counts.latest_application_date DESC;
        `;

      const finalResults = await sequelize.query(finalSql, {
        type: QueryTypes.SELECT,
      });

      callback(null, finalResults);
    } catch (error) {
      callback(error, null);
    }
  },

  listByCustomerID: async (customer_id, filter_status, callback) => {
    try {
      let sql = `
        SELECT 
            b.id AS branch_id, 
            b.name AS branch_name, 
            COUNT(CASE WHEN ca.status != 'completed' THEN ca.id END) AS application_count,
            MAX(ca.created_at) AS latest_application_date
        FROM client_applications ca
        INNER JOIN branches b ON ca.branch_id = b.id
        WHERE b.customer_id = ?`;

      const queryParams = [customer_id];

      if (filter_status && filter_status.trim() !== "") {
        sql += ` AND ca.status = ?`;
        queryParams.push(filter_status);
      }

      sql += ` GROUP BY b.id, b.name 
               ORDER BY latest_application_date DESC;`;

      const results = await sequelize.query(sql, {
        replacements: queryParams,
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error in listByCustomerID:", error);
      callback(error, null);
    }
  },

  applicationListByBranch: async (filter_status, branch_id, status, callback) => {
    try {
      // Fetch holidays
      const holidaysQuery = `SELECT id AS holiday_id, title AS holiday_title, date AS holiday_date FROM holidays;`;
      const holidayResults = await sequelize.query(holidaysQuery, { type: QueryTypes.SELECT });

      // Prepare holiday dates for calculations
      const holidayDates = holidayResults.map(holiday => moment(holiday.holiday_date).startOf("day"));

      // Fetch weekends
      const weekendsQuery = `SELECT weekends FROM company_info WHERE status = 1;`;
      const weekendResults = await sequelize.query(weekendsQuery, { type: QueryTypes.SELECT });

      const weekends = weekendResults[0]?.weekends ? JSON.parse(weekendResults[0].weekends) : [];
      const weekendsSet = new Set(weekends.map(day => day.toLowerCase()));

      // Base SQL query
      let sql = `
        SELECT 
          ca.*, 
          ca.id AS main_id, 
          cmt.is_verify,
          cmt.dob,
          cmt.first_insufficiency_marks,
          cmt.first_insuff_date,
          cmt.first_insuff_reopened_date,
          cmt.second_insufficiency_marks,
          cmt.second_insuff_date,
          cmt.second_insuff_reopened_date,
          cmt.third_insufficiency_marks,
          cmt.third_insuff_date,
          cmt.third_insuff_reopened_date,
          cmt.overall_status,
          cmt.final_verification_status,
          cmt.report_date,
          cmt.report_status,
          cmt.report_type,
          cmt.qc_done_by,
          qc_admin.name AS qc_done_by_name,
          cmt.delay_reason,
          cmt.report_generate_by,
          report_admin.name AS report_generated_by_name,
          cmt.case_upload,
          customer_metas.tat_days
        FROM 
          client_applications ca
        LEFT JOIN 
          cmt_applications cmt 
        ON 
          ca.id = cmt.client_application_id
        LEFT JOIN 
          admins AS qc_admin 
        ON 
          qc_admin.id = cmt.qc_done_by
        LEFT JOIN 
          customer_metas 
        ON 
          customer_metas.customer_id = ca.customer_id
        LEFT JOIN 
          admins AS report_admin 
        ON 
          report_admin.id = cmt.report_generate_by
        WHERE 
          ca.branch_id = ?`;

      const params = [branch_id];

      // Apply filters dynamically
      if (filter_status?.trim()) {
        sql += ` AND ca.status = ?`;
        params.push(filter_status);
      }

      if (status?.trim()) {
        sql += ` AND ca.status = ?`;
        params.push(status);
      }

      sql += ` ORDER BY ca.created_at DESC;`;

      // Execute query
      const results = await sequelize.query(sql, { replacements: params, type: QueryTypes.SELECT });

      // Format results
      const formattedResults = results.map((result, index) => {
        return {
          ...result,
          created_at: new Date(result.created_at).toISOString(), // Format created_at
          deadline_date: calculateDueDate(
            moment(result.created_at),
            result.tat_days,
            holidayDates,
            weekendsSet
          )
        };
      });
      callback(null, formattedResults);
    } catch (err) {
      console.error("Error fetching applications:", err);
      callback(err, null);
    }
  },

  applicationDataByClientApplicationID: (
    client_application_id,
    branch_id,
    callback
  ) => {
    // Start a connection
    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      // Base SQL query with JOINs to fetch client_spoc_name and cmt_applications data if it exists
      let sql = `
        SELECT 
          ca.*, 
          ca.id AS main_id, 
          cmt.first_insufficiency_marks,
          cmt.first_insuff_date,
          cmt.first_insuff_reopened_date,
          cmt.second_insufficiency_marks,
          cmt.second_insuff_date,
          cmt.second_insuff_reopened_date,
          cmt.third_insufficiency_marks,
          cmt.third_insuff_date,
          cmt.third_insuff_reopened_date,
          cmt.overall_status,
          cmt.report_date,
          cmt.report_status,
          cmt.report_type,
          cmt.qc_done_by,
          qc_admin.name AS qc_done_by_name,
          cmt.delay_reason,
          cmt.report_generate_by,
          report_admin.name AS report_generated_by_name,
          cmt.case_upload
        FROM 
          \`client_applications\` ca
        LEFT JOIN 
          \`cmt_applications\` cmt 
        ON 
          ca.id = cmt.client_application_id
        LEFT JOIN 
          \`admins\` AS qc_admin 
        ON 
          qc_admin.id = cmt.qc_done_by
        LEFT JOIN 
          \`admins\` AS report_admin 
        ON 
          report_admin.id = cmt.report_generate_by
        WHERE 
          ca.\`id\` = ? AND
          ca.\`branch_id\` = ?`;

      const params = [client_application_id, branch_id]; // Start with branch_id

      sql += ` ORDER BY ca.\`created_at\` DESC;`;

      // Execute the query using the connection
      connection.query(sql, params, (err, results) => {
        connectionRelease(connection); // Release the connection
        if (err) {
          console.error("Database query error: 18", err);
          return callback(err, null);
        }
        callback(null, results[0]);
      });
    });
  },

  applicationByID: async (application_id, branch_id, callback) => {
    try {
      const sql = `
        SELECT 
            CA.*, 
            C.name AS customer_name 
        FROM client_applications AS CA 
        INNER JOIN customers AS C ON C.id = CA.customer_id 
        WHERE CA.id = ? 
          AND CA.branch_id = ? 
        ORDER BY CA.created_at DESC
        LIMIT 1;
      `;

      const results = await sequelize.query(sql, {
        replacements: [application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error in applicationByID:", error);
      callback(error, null);
    }
  },

  annexureData: async (client_application_id, db_table, callback) => {
    try {
      // Check if the table exists in the database
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?`;

      const [tableCheck] = await sequelize.query(checkTableSql, {
        replacements: [db_table],
        type: QueryTypes.SELECT,
      });

      // If the table does not exist, create it
      if (tableCheck.count === 0) {

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
            \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

      // Fetch data from the table
      const sql = `SELECT * FROM \`${db_table}\` WHERE \`client_application_id\` = ?`;

      const results = await sequelize.query(sql, {
        replacements: [client_application_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (err) {
      console.error("Error in annexureData function:", err);
      callback(err, null);
    }
  },

  filterOptions: async (callback) => {
    try {
      const sql = `
        SELECT \`status\`, COUNT(*) AS \`count\` 
        FROM \`client_applications\` 
        GROUP BY \`status\`
      `;

      const results = await sequelize.query(sql, {
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (error) {
      console.error("Error fetching filter options:", error);
      callback(error, null);
    }
  },

  filterOptionsForBranch: async (branch_id, callback) => {
    try {
      const sql = `
        SELECT \`status\`, COUNT(*) AS \`count\` 
        FROM \`client_applications\` 
        WHERE \`branch_id\` = ?
        GROUP BY \`status\`
      `;

      const results = await sequelize.query(sql, {
        replacements: [branch_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results);
    } catch (err) {
      console.error("Error fetching filter options:", err);
      callback(err, null);
    }
  },

  getCMTApplicationById: async (client_application_id, callback) => {
    try {
      const sql = `
        SELECT * 
        FROM cmt_applications 
        WHERE client_application_id = ? 
        LIMIT 1;
      `;

      const results = await sequelize.query(sql, {
        replacements: [client_application_id],  // No need to convert to a string
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error in getCMTApplicationById:", error);
      callback(error, null);
    }
  },

  getCMTApplicationIDByClientApplicationId: (
    client_application_id,
    callback
  ) => {
    if (!client_application_id) {
      return callback(null, false);
    }

    // Start a connection
    startConnection((err, connection) => {
      if (err) {
        return callback(err, null);
      }

      const sql =
        "SELECT `id` FROM `cmt_applications` WHERE `client_application_id` = ?";

      connection.query(sql, [client_application_id], (err, results) => {
        connectionRelease(connection); // Release connection
        if (err) {
          console.error("Database query error: 24", err);
          return callback(err, null);
        }

        if (results.length > 0) {
          return callback(null, results[0].id);
        }
        callback(null, false);
      });
    });
  },

  getCMTAnnexureByApplicationId: async (
    client_application_id,
    db_table,
    callback
  ) => {
    try {
      // 1. Check if the table exists
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = ?`;

      const tableResults = await sequelize.query(checkTableSql, {
        replacements: [process.env.DB_NAME || "goldquest", db_table],
        type: QueryTypes.SELECT,
      });

      if (tableResults[0].count === 0) {
        // 2. Create table if not exists
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
            \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

      // Fetch data from the table
      await fetchData();
    } catch (error) {
      return callback(error, null);
    }

    async function fetchData() {
      try {
        const sql = `SELECT * FROM \`${db_table}\` WHERE \`client_application_id\` = ?`;
        const results = await sequelize.query(sql, {
          replacements: [client_application_id],
          type: QueryTypes.SELECT,
        });

        const response = results.length > 0 ? results[0] : null;
        callback(null, response);
      } catch (error) {
        callback(error, null);
      }
    }
  },

  reportFormJsonByServiceID: async (service_id, callback) => {
    try {
      const sql = `
        SELECT rf.json, s.excel_sorting 
        FROM report_forms rf 
        INNER JOIN services s ON s.id = rf.service_id 
        WHERE rf.service_id = ?
      `;

      const results = await sequelize.query(sql, {
        replacements: [service_id],
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (err) {
      console.error("Error fetching report form JSON:", err);
      callback(err, null);
    }
  },

  generateReport: async (
    mainJson,
    client_application_id,
    branch_id,
    customer_id,
    callback
  ) => {
    try {
      const fields = Object.keys(mainJson);

      // 1. Check for existing columns in cmt_applications
      const checkColumnsSql = "SHOW COLUMNS FROM `cmt_applications`";
      const [results] = await sequelize.query(checkColumnsSql, { type: QueryTypes.SHOW });

      const existingColumns = results.map((row) => row.Field);
      const missingColumns = fields.filter((field) => !existingColumns.includes(field));
      // 2. Add missing columns if any
      const addMissingColumns = async () => {
        if (missingColumns.length > 0) {
          try {
            for (const column of missingColumns) {
              const alterQuery = `ALTER TABLE cmt_applications ADD COLUMN ${column} LONGTEXT`; // Adjust data type as needed
              await sequelize.query(alterQuery, { type: QueryTypes.RAW });
            }
          } catch (error) {
            console.error("Error adding missing columns:", error);
            throw error;
          }
        }
      };

      // 3. Check if entry exists by client_application_id and insert/update accordingly
      const checkAndUpsertEntry = async () => {
        try {
          const checkEntrySql = "SELECT * FROM cmt_applications WHERE client_application_id = ?";
          const entryResults = await sequelize.query(checkEntrySql, {
            replacements: [client_application_id],
            type: QueryTypes.SELECT,
          });

          // Add branch_id and customer_id to mainJson
          mainJson.branch_id = branch_id;
          mainJson.customer_id = customer_id;

          if (entryResults.length > 0) {
            // console.log(`mainJson - `, mainJson);

            // Get keys (indexes) and values (although you're not really using them in this case)
            const indexes = Object.keys(mainJson);
            const values = Object.values(mainJson);

            // Prepare the update query
            const updateSql = `UPDATE cmt_applications SET ${indexes.map(key => `${key} = ?`).join(', ')} WHERE client_application_id = ?`;

            // Insert the values into the query and include the client_application_id at the end
            await sequelize.query(updateSql, {
              replacements: [...Object.values(mainJson), client_application_id],
              type: QueryTypes.UPDATE,
            });

            // Fetch the updated record (you can return any column, such as 'client_application_id')
            const updatedRow = await sequelize.query(
              "SELECT id FROM cmt_applications WHERE client_application_id = ?",
              {
                replacements: [client_application_id],
                type: QueryTypes.SELECT,
              }
            );

            if (updatedRow.length > 0) {
              const insertId = updatedRow[0].id;// Or use other columns if needed
              // console.log('Updated row ID:', insertId);
              callback(null, { insertId });
            } else {
              // console.log('No row found after update');
              callback(null, { message: 'Update failed or no rows affected' });
            }
          } else {

            const replacements = {
              ...mainJson,  // Spread the mainJson object properties into the replacements
              client_application_id,
              branch_id,
              customer_id
            };

            // console.log(`replacements - `, replacements);

            // Get keys (indexes) and values
            const indexes = Object.keys(replacements);
            const values = Object.values(replacements);

            // Build the SQL query dynamically
            const insertSql = `INSERT INTO cmt_applications (${indexes.join(', ')}) VALUES (${indexes.map(() => '?').join(', ')})`;

            const insertResult = await sequelize.query(insertSql, {
              replacements: values,
              type: QueryTypes.INSERT,
            });
            // console.log(`insertResult - `, insertResult);
            const insertId = insertResult[0];

            callback(null, { insertId });
          }
        } catch (error) {
          console.error("Error inserting/updating entry:", error);
          callback(error, null);
        }
      };

      // Execute the operations in sequence
      await addMissingColumns();
      await checkAndUpsertEntry();
    } catch (error) {
      console.error("Unexpected error in generateReport:", error);
      callback(error, null);
    }
  },

  createOrUpdateAnnexure: async (
    cmt_id,
    client_application_id,
    branch_id,
    customer_id,
    db_table,
    mainJson,
    callback
  ) => {
    try {
      const fields = Object.keys(mainJson);
      // Check if the table exists
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = ?`;

      const tableResults = await sequelize.query(checkTableSql, {
        replacements: [process.env.DB_NAME || "goldquest", db_table],
        type: QueryTypes.SELECT,
      });

      if (tableResults[0].count === 0) {
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

      // Check if all required columns exist
      const checkColumnsSql = `SHOW COLUMNS FROM \`${db_table}\``;
      const results = await sequelize.query(checkColumnsSql, { type: QueryTypes.SELECT });

      const existingColumns = results.map((row) => row.Field);
      const missingColumns = fields.filter((field) => !existingColumns.includes(field));

      if (missingColumns.length > 0) {
        await Promise.all(
          missingColumns.map(async (column) => {
            const alterTableSql = `ALTER TABLE \`${db_table}\` ADD COLUMN \`${column}\` LONGTEXT`;
            return sequelize.query(alterTableSql, { type: QueryTypes.RAW });
          })
        );
      }

      // Check if the entry exists
      const checkEntrySql = `SELECT * FROM \`${db_table}\` WHERE client_application_id = ?`;
      const entryResults = await sequelize.query(checkEntrySql, {
        replacements: [client_application_id],
        type: QueryTypes.SELECT,
      });

      if (entryResults.length > 0) {
        // Update existing entry
        const updateSql = `UPDATE \`${db_table}\` SET ${Object.keys(mainJson)
          .map((key) => `\`${key}\` = ?`)
          .join(", ")} WHERE client_application_id = ?`;

        const updateResult = await sequelize.query(updateSql, {
          replacements: [...Object.values(mainJson), client_application_id],
          type: QueryTypes.UPDATE,
        });

        callback(null, { message: "Updated successfully" });
      } else {
        // Insert new entry
        const insertSql = `INSERT INTO \`${db_table}\` (${Object.keys(mainJson)
          .concat(["client_application_id", "branch_id", "customer_id", "cmt_id"])
          .map((key) => `\`${key}\``)
          .join(", ")}) VALUES (${Object.keys(mainJson)
            .concat(["client_application_id", "branch_id", "customer_id", "cmt_id"])
            .map(() => "?")
            .join(", ")})`;

        await sequelize.query(insertSql, {
          replacements: [...Object.values(mainJson), client_application_id, branch_id, customer_id, cmt_id],
          type: QueryTypes.RAW,
        });

        callback(null, { message: "Inserted successfully" });
      }
    } catch (error) {
      console.error("Error in createOrUpdateAnnexure:", error);
      callback(error, null);
    }
  },

  upload: async (
    client_application_id,
    db_table,
    db_column,
    savedImagePaths,
    callback
  ) => {
    try {
      const checkTableSql = `
        SELECT COUNT(*) AS count 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = ?`;

      const tableResults = await sequelize.query(checkTableSql, {
        replacements: [db_table],
        type: QueryTypes.SELECT,
      });

      if (tableResults[0].count === 0) {
        const createTableSql = `
          CREATE TABLE \`${db_table}\` (
            \`id\` BIGINT(20) NOT NULL AUTO_INCREMENT,
            \`cmt_id\` BIGINT(20) NOT NULL,
            \`client_application_id\` BIGINT(20) NOT NULL,
            \`branch_id\` INT(11) NOT NULL,
            \`customer_id\` INT(11) NOT NULL,
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

      await proceedToCheckColumns();
    } catch (error) {
      console.error("Error processing upload:", error);
      callback(false, { error: "Unexpected error occurred.", details: error });
    }

    async function proceedToCheckColumns() {
      try {
        const currentColumnsSql = `SHOW COLUMNS FROM \`${db_table}\``;
        const results = await sequelize.query(currentColumnsSql, {
          type: QueryTypes.SELECT,
        });

        const existingColumns = results.map((row) => row.Field);
        const missingColumns = [db_column].filter(
          (field) => !existingColumns.includes(field)
        );

        for (const column of missingColumns) {
          const alterTableSql = `ALTER TABLE \`${db_table}\` ADD COLUMN \`${column}\` LONGTEXT`;
          await sequelize.query(alterTableSql, { type: QueryTypes.RAW });
        }

        const insertSql = `
          UPDATE \`${db_table}\` 
          SET \`${db_column}\` = ? 
          WHERE \`client_application_id\` = ?`;

        const joinedPaths = savedImagePaths.join(", ");
        const updateResults = await sequelize.query(insertSql, {
          replacements: [joinedPaths, client_application_id],
          type: QueryTypes.UPDATE,
        });

        callback(true, updateResults);
      } catch (error) {
        console.error("Error adding columns or inserting data:", error);
        callback(false, { error: "Error updating table.", details: error });
      }
    }
  },

  getAttachmentsByClientAppID: async (client_application_id, callback) => {
    if (typeof callback !== "function") {
      console.error("Callback is not a function");
      return;
    }

    try {
      // Step 1: Get `services` from `client_applications`
      const sql = "SELECT `services` FROM `client_applications` WHERE `id` = ?";
      const results = await sequelize.query(sql, {
        replacements: [client_application_id],
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(null, []); // No services found, return empty array
      }

      const services = results[0].services.split(","); // Split services by comma
      const dbTableFileInputs = {}; // Object to store db_table and file inputs

      // Step 2: Fetch `json` for each service from `report_forms`
      const serviceQueries = services.map(async (service) => {
        const query = "SELECT `json` FROM `report_forms` WHERE `id` = ?";
        const result = await sequelize.query(query, {
          replacements: [service],
          type: QueryTypes.SELECT,
        });

        if (result.length > 0) {
          try {
            const jsonData = JSON.parse(result[0].json);
            const dbTable = jsonData.db_table;

            if (!dbTableFileInputs[dbTable]) {
              dbTableFileInputs[dbTable] = [];
            }

            // Extract file input names
            jsonData.rows.forEach((row) => {
              row.inputs.forEach((input) => {
                if (input.type === "file") {
                  dbTableFileInputs[dbTable].push(input.name);
                }
              });
            });
          } catch (parseErr) {
            console.error("Error parsing JSON for service:", service, parseErr);
          }
        }
      });

      await Promise.all(serviceQueries); // Wait for all service queries to complete

      // Step 3: Fetch the `cloud_host`
      const hostSql = `SELECT \`cloud_host\` FROM \`app_info\` WHERE \`status\` = 1 AND \`interface_type\` = ? ORDER BY \`updated_at\` DESC LIMIT 1`;
      const hostResults = await sequelize.query(hostSql, {
        replacements: ["backend"],
        type: QueryTypes.SELECT,
      });

      const host = hostResults.length > 0 ? hostResults[0].cloud_host : "www.example.com"; // Fallback host

      // Step 4: Fetch file attachments from each table
      let finalAttachments = [];
      const tableQueries = Object.entries(dbTableFileInputs).map(async ([dbTable, fileInputNames]) => {
        const selectQuery = `SELECT ${fileInputNames.length > 0 ? fileInputNames.join(", ") : "*"} FROM ${dbTable} WHERE client_application_id = ?`;
        const rows = await sequelize.query(selectQuery, {
          replacements: [client_application_id],
          type: QueryTypes.SELECT,
        });

        rows.forEach((row) => {
          Object.values(row)
            .filter((value) => value) // Remove falsy values
            .join(",")
            .split(",")
            .forEach((attachment) => {
              finalAttachments.push(`${attachment}`);
            });
        });
      });

      await Promise.all(tableQueries); // Wait for all table queries to complete

      // Step 5: Return final attachments
      callback(null, finalAttachments.join(", "));

    } catch (error) {
      console.error("Database query error:", error);
      callback({ status: false, message: "Internal Server Error" }, null);
    }
  },

  updateReportDownloadStatus: async (id, callback) => {
    try {
      const sql = `
        UPDATE client_applications
        SET is_report_downloaded = 1
        WHERE id = ?
      `;

      const [results] = await sequelize.query(sql, {
        replacements: [id],
        type: QueryTypes.UPDATE, // Change to UPDATE
      });

      callback(null, results);
    } catch (error) {
      callback(error, null);
    }
  },

};

module.exports = Customer;
