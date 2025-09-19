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

      let client_application_ids_query_condition = '';
      let customer_ids_query_condition = '';

      // Get the current date
      const now = new Date();
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      let customer_ids = [];
      let client_application_ids = [];

      if (filter_status && filter_status !== null && filter_status !== "") {
        let sql = `SELECT customer_id FROM customers WHERE status = 1`;

        switch (filter_status) {
          case 'overallCount':
            sql = `
                    SELECT DISTINCT
                      a.id,
                      a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      (
                        b.overall_status = 'wip'
                        OR b.overall_status = 'insuff'
                        OR (b.overall_status = 'completed' 
                          AND LOWER(b.final_verification_status) IN ('green', 'red', 'yellow', 'pink', 'orange')
                          AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                        )
                      )
                      AND (c.status = 1)
              `;
            break;
          case 'qcStatusPendingCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                  FROM 
                    client_applications a 
                    JOIN customers c ON a.customer_id = c.id
                    JOIN cmt_applications b ON a.id = b.client_application_id
                  WHERE
                    (LOWER(b.is_verify) = 'no' OR b.is_verify IS NULL OR b.is_verify = '')
                    AND a.status = 'completed';
              `;
            break;
          case 'wipCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE 
                      c.status = 1
                      AND b.overall_status = 'wip'
              `;
            break;
          case 'insuffCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE 
                      c.status = 1
                      AND b.overall_status = 'insuff'
              `;
            break;
          case 'previousCompletedCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      b.overall_status = 'completed'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND c.status = 1
              `;
            break;
          case 'stopcheckCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      b.overall_status = 'stopcheck'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND c.status = 1
              `;
            break;
          case 'activeEmploymentCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      b.overall_status = 'active employment'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND c.status = 1
              `;
            break;
          case 'nilCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      b.overall_status = 'nil'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND c.status = 1
              `;
            break;
          case 'notDoableCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      b.overall_status = 'not doable'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND c.status = 1
              `;
            break;
          case 'candidateDeniedCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    FROM 
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    WHERE
                      b.overall_status = 'candidate denied'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND c.status = 1
              `;
            break;
          case 'completedGreenCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    from
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    where
                      b.overall_status ='completed'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND LOWER(b.final_verification_status) = 'green'
                      AND c.status=1
              `;
            break;
          case 'completedRedCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    from
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    where
                      b.overall_status ='completed'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND LOWER(b.final_verification_status) = 'red'
                      AND c.status=1
              `;
            break;
          case 'completedYellowCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    from
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    where
                      b.overall_status ='completed'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND LOWER(b.final_verification_status)  = 'yellow'
                      AND c.status=1
              `;
            break;
          case 'completedPinkCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    from
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    where
                      b.overall_status ='completed'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND LOWER(b.final_verification_status) = 'pink'
                      AND c.status=1
              `;
            break;
          case 'completedOrangeCount':
            sql = `
                  SELECT DISTINCT
                    a.id,
                    a.customer_id
                    from
                      client_applications a 
                      JOIN customers c ON a.customer_id = c.id
                      JOIN cmt_applications b ON a.id = b.client_application_id 
                    where
                      b.overall_status ='completed'
                      AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                      AND LOWER(b.final_verification_status) = 'orange'
                      AND c.status=1
              `;
            break;
        }

        const results = await sequelize.query(sql, {
          replacements: [filter_status],
          type: QueryTypes.SELECT,
        });

        // Loop through results and push customer_id to the array
        results.forEach((row) => {
          client_application_ids.push(row.id);
          customer_ids.push(row.customer_id);
        });

        // Generate client_application_ids query condition if the array is not empty

        if (client_application_ids.length > 0) {
          client_application_ids_query_condition = `ca.id IN (${client_application_ids.join(",")})`;
        }

        // Generate customer_ids query condition if the array is not empty
        if (customer_ids.length > 0) {
          customer_ids_query_condition = `AND customers.id IN (${customer_ids.join(",")})`;
        }
      }
      // If no filter_status is provided, proceed with the final SQL query without filters
      const finalSql = `WITH BranchesCTE AS (
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
                            COALESCE(application_counts.application_count, 0) AS application_count,
                            COALESCE(completed_counts.completed_count, 0) AS completedApplicationsCount,
                            COALESCE(pending_counts.pending_count, 0) AS pendingApplicationsCount
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
                            INNER JOIN
                                cmt_applications cmt ON ca.id = cmt.client_application_id
                            WHERE
                                (
                                  cmt.overall_status = 'wip'
                                  OR cmt.overall_status = 'insuff'
                                  OR (cmt.overall_status = 'completed' 
                                    AND LOWER(cmt.final_verification_status) IN ('green', 'red', 'yellow', 'pink', 'orange')
                                    AND (cmt.report_date LIKE '${yearMonth}-%' OR cmt.report_date LIKE '%-${monthYear}')
                                  )
                                )
                                ${client_application_ids_query_condition}
                            GROUP BY
                                b.customer_id
                        ) AS application_counts ON customers.id = application_counts.customer_id
                        LEFT JOIN (
                            SELECT
                                b.customer_id,
                                COUNT(ca.id) AS completed_count
                            FROM
                                BranchesCTE b
                            INNER JOIN
                                client_applications ca ON b.branch_id = ca.branch_id
                            INNER JOIN
                                cmt_applications cmt ON ca.id = cmt.client_application_id
                            WHERE
                                cmt.overall_status ='completed'
                                AND (cmt.report_date LIKE '${yearMonth}-%' OR cmt.report_date LIKE '%-${monthYear}')
                                AND LOWER(cmt.final_verification_status) IN ('green', 'red', 'yellow', 'pink', 'orange')
                            GROUP BY
                                b.customer_id
                        ) AS completed_counts ON customers.id = completed_counts.customer_id
                        LEFT JOIN (
                            SELECT
                                b.customer_id,
                                COUNT(ca.id) AS pending_count
                            FROM
                                BranchesCTE b
                            INNER JOIN
                                client_applications ca ON b.branch_id = ca.branch_id
                            INNER JOIN
                                cmt_applications cmt ON ca.id = cmt.client_application_id
                            WHERE
                                (LOWER(cmt.is_verify) = 'no' OR cmt.is_verify IS NULL OR cmt.is_verify = '')
                                AND ca.status = 'completed'
                            GROUP BY
                                b.customer_id
                        ) AS pending_counts ON customers.id = pending_counts.customer_id
                        WHERE
                            customers.status = 1
                            ${customer_ids_query_condition}
                            AND COALESCE(application_counts.application_count, 0) > 0
                        ORDER BY
                            application_counts.latest_application_date DESC;
                        `;
                        console.log(`finalSql - `, finalSql);
      const results = await sequelize.query(finalSql, {
        type: QueryTypes.SELECT,
      });

      if (results.length === 0) {
        return callback(null, []);
      }

      // Process each result to fetch client_spoc names
      for (const result of results) {
        const headBranchApplicationsCountQuery = `SELECT COUNT(*) FROM \`client_applications\` ca INNER JOIN \`branches\` b ON ca.branch_id = b.id WHERE ca.customer_id = ? AND b.customer_id = ? AND b.is_head = ?`;
        const headBranchApplicationsCount = await new Promise(
          async (resolve, reject) => {
            const headBranchResults = await sequelize.query(headBranchApplicationsCountQuery, {
              replacements: [result.main_id, result.main_id, 1, 1],
              type: QueryTypes.SELECT,
            });
            resolve(headBranchResults[0]["COUNT(*)"]);
          }
        );
        result.head_branch_applications_count = headBranchApplicationsCount;
        // if (result.branch_count === 1) {
        // Query client_spoc table to fetch names for these IDs
        const headBranchQuery = `SELECT id, is_head FROM \`branches\` WHERE \`customer_id\` = ? AND \`is_head\` = ?`;

        try {
          const headBranchID = await new Promise(async (resolve, reject) => {
            const headBranchResults = await sequelize.query(headBranchQuery, {
              replacements: [result.main_id, 1],
              type: QueryTypes.SELECT,
            });
            resolve(
              headBranchResults.length > 0
                ? headBranchResults[0].id
                : null
            );
          });

          // Attach head branch id and application count to the current result
          result.head_branch_id = headBranchID;
        } catch (headBranchErr) {
          console.error(
            "Error fetching head branch id or applications count:",
            headBranchErr
          );
          result.head_branch_id = null;
          result.head_branch_applications_count = 0;
        }
        // }
      }
      callback(null, results);
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

      // Get the current date and month
      const now = new Date();
      const month = `${String(now.getMonth() + 1).padStart(2, '0')}`;
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      // Define SQL conditions for each filter status
      const conditions = {
        overallCount: `AND (cmt.overall_status='wip' OR cmt.overall_status='insuff' OR cmt.overall_status='initiated' OR cmt.overall_status='hold' OR cmt.overall_status='closure advice' OR cmt.overall_status='stopcheck' OR cmt.overall_status='active employment' OR cmt.overall_status='nil' OR cmt.overall_status='' OR cmt.overall_status='not doable' OR cmt.overall_status='candidate denied' OR (cmt.overall_status='completed' AND cmt.report_date LIKE '${yearMonth}-%') OR (cmt.overall_status='completed' AND cmt.report_date NOT LIKE '${yearMonth}-%'))`,
        qcStatusPendingCount: `AND (LOWER(cmt.is_verify) = 'no' OR cmt.is_verify IS NULL OR cmt.is_verify = '') AND ca.status = 'completed'`,
        wipCount: `AND cmt.overall_status = 'wip'`,
        insuffCount: `AND cmt.overall_status = 'insuff'`,
        completedGreenCount: `AND cmt.overall_status = 'completed' AND cmt.report_date LIKE '${yearMonth}-%' AND LOWER(cmt.final_verification_status) = 'green'`,
        completedRedCount: `AND cmt.overall_status = 'completed' AND cmt.report_date LIKE '${yearMonth}-%' AND LOWER(cmt.final_verification_status) = 'red'`,
        completedYellowCount: `AND cmt.overall_status = 'completed' AND cmt.report_date LIKE '${yearMonth}-%' AND LOWER(cmt.final_verification_status) = 'yellow'`,
        completedPinkCount: `AND cmt.overall_status = 'completed' AND cmt.report_date LIKE '${yearMonth}-%' AND LOWER(cmt.final_verification_status) = 'pink'`,
        completedOrangeCount: `AND cmt.overall_status = 'completed' AND cmt.report_date LIKE '${yearMonth}-%' AND LOWER(cmt.final_verification_status) = 'orange'`,
        previousCompletedCount: `AND (cmt.overall_status = 'completed' AND cmt.report_date NOT LIKE '${yearMonth}-%') AND c.status=1`,
        stopcheckCount: `AND cmt.overall_status = 'stopcheck'`,
        activeEmploymentCount: `AND cmt.overall_status = 'active employment'`,
        nilCount: `AND cmt.overall_status IN ('nil', '')`,
        candidateDeniedCount: `AND cmt.overall_status = 'candidate denied'`,
        notDoableCount: `AND cmt.overall_status = 'not doable'`,
        initiatedCount: `AND cmt.overall_status = 'initiated'`,
        holdCount: `AND cmt.overall_status = 'hold'`,
        closureAdviceCount: `AND cmt.overall_status = 'closure advice'`,
        notReadyCount: `AND cmt.overall_status !='completed'`,
        downloadReportCount: `AND (cmt.overall_status = 'completed')`
      };

      // Construct SQL condition based on filter_status
      let sqlCondition = '';
      if (filter_status && filter_status.trim() !== "") {
        sqlCondition = conditions[filter_status] || '';
      }

      // Base SQL query
      let sql = `
        SELECT 
          ca.*, 
          ca.id AS main_id, 
          cmt.is_verify,
          cmt.dob,
          cmt.initiation_date,
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
          \`customers\` AS c 
        ON 
          c.id = ca.customer_id
        LEFT JOIN 
          \`customer_metas\` AS customer_metas 
        ON 
          customer_metas.customer_id = ca.customer_id
        LEFT JOIN 
          \`admins\` AS report_admin 
        ON 
          report_admin.id = cmt.report_generate_by
        WHERE 
          c.status = 1
          AND ca.\`branch_id\` = ?
          ${sqlCondition}`;

      const params = [branch_id];

      // Check if status is provided and add the corresponding condition
      if (typeof status === "string" && status.trim() !== "") {
        sql += ` AND ca.\`status\` = ?`; // Add filter for status
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

  applicationDataByClientApplicationID: async (client_application_id, branch_id, callback) => {
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

      // Get the current date and month
      const now = new Date();
      const month = `${String(now.getMonth() + 1).padStart(2, '0')}`;
      const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      // SQL query with JOINs to fetch required data
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
          \`client_applications\` ca
        LEFT JOIN 
          \`cmt_applications\` cmt 
        ON 
          ca.id = cmt.client_application_id
        LEFT JOIN 
          \`customer_metas\` AS customer_metas 
        ON 
          customer_metas.customer_id = ca.customer_id
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
          ca.\`branch_id\` = ?
        ORDER BY ca.\`created_at\` DESC`;

      const results = await sequelize.query(sql, {
        replacements: [client_application_id, branch_id],
        type: QueryTypes.SELECT,
      });

      const formattedResults = results.map(result => ({
        ...result,
        created_at: new Date(result.created_at).toISOString(),
        deadline_date: calculateDueDate(
          moment(result.created_at),
          result.tat_days,
          holidayDates,
          weekendsSet
        )
      }));

      callback(null, formattedResults[0] || null); // Return the first formatted result or null
    } catch (error) {
      console.error("Error fetching application data:", error);
      callback(error, null);
    }
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

  filterOptionsForCustomers: async (callback) => {
    // Get the current date
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

    let filterOptions = {
      overallCount: 0,
      qcStatusPendingCount: 0,
      wipCount: 0,
      insuffCount: 0,
      previousCompletedCount: 0,
      stopcheckCount: 0,
      activeEmploymentCount: 0,
      nilCount: 0,
      notDoableCount: 0,
      candidateDeniedCount: 0,
      completedGreenCount: 0,
      completedRedCount: 0,
      completedYellowCount: 0,
      completedPinkCount: 0,
      completedOrangeCount: 0,
    };

    const overallCountSQL = `
        SELECT
          COUNT(*) as overall_count
        FROM 
          client_applications a 
          JOIN customers c ON a.customer_id = c.id
          JOIN cmt_applications b ON a.id = b.client_application_id 
        WHERE
          (
            b.overall_status = 'wip'
            OR b.overall_status = 'insuff'
            OR (b.overall_status = 'completed' 
              AND LOWER(b.final_verification_status) IN ('green', 'red', 'yellow', 'pink', 'orange')
              AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
            )
          )
          AND (c.status = 1)
      `;

    const overallCountResult = await sequelize.query(overallCountSQL, {
      type: QueryTypes.SELECT,
    });

    if (overallCountResult.length > 0) {
      filterOptions.overallCount = overallCountResult[0].overall_count || 0;
    }

    const qcStatusPendingSQL = `
          select
            count(*) as overall_count
          from 
            client_applications a 
            JOIN customers c ON a.customer_id = c.id
            JOIN cmt_applications b ON a.id = b.client_application_id 
          where
            (LOWER(b.is_verify) = 'no' OR b.is_verify IS NULL OR b.is_verify = '')
            AND a.status='completed'
          order by 
            b.id DESC
        `;

    const qcStatusPendingResult = await sequelize.query(qcStatusPendingSQL, {
      type: QueryTypes.SELECT,
    });

    if (qcStatusPendingResult.length > 0) {
      filterOptions.qcStatusPendingCount = qcStatusPendingResult[0].overall_count || 0;
    }

    const wipInsuffSQL = `
          SELECT 
            b.overall_status, 
            COUNT(*) AS overall_count
          FROM 
            client_applications a 
            JOIN customers c ON a.customer_id = c.id
            JOIN cmt_applications b ON a.id = b.client_application_id 
          WHERE 
            c.status = 1
            AND b.overall_status IN ('wip', 'insuff')
          GROUP BY 
            b.overall_status
        `;

    const wipInsuffResult = await sequelize.query(wipInsuffSQL, {
      type: QueryTypes.SELECT,
    });

    wipInsuffResult.forEach(row => {
      if (row.overall_status === 'wip') {
        filterOptions.wipCount = row.overall_count;
      } else if (row.overall_status === 'insuff') {
        filterOptions.insuffCount = row.overall_count;
      }
    });

    const completedStocheckactiveEmployementNilNotDoubleCandidateDeniedSQL = `
            SELECT
              COUNT(*) as overall_count,
              b.overall_status
            from 
              client_applications a 
              JOIN customers c ON a.customer_id = c.id
              JOIN cmt_applications b ON a.id = b.client_application_id 
            where
              b.overall_status IN ('completed','stopcheck','active employment','nil','not doable','candidate denied')
              AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
              AND c.status=1
            GROUP BY
              b.overall_status
          `;

    const completedStocheckactiveEmployementNilNotDoubleCandidateDeniedResult = await sequelize.query(completedStocheckactiveEmployementNilNotDoubleCandidateDeniedSQL, {
      type: QueryTypes.SELECT,
    });

    completedStocheckactiveEmployementNilNotDoubleCandidateDeniedResult.forEach(row => {
      if (row.overall_status === 'completed') {
        filterOptions.previousCompletedCount = row.overall_count;
      } else if (row.overall_status === 'stopcheck') {
        filterOptions.stopcheckCount = row.overall_count;
      } else if (row.overall_status === 'active employment') {
        filterOptions.activeEmploymentCount = row.overall_count;
      } else if (row.overall_status === 'nil' || row.overall_status === '' || row.overall_status === null) {
        filterOptions.nilCount = row.overall_count;
      } else if (row.overall_status === 'not doable') {
        filterOptions.notDoableCount = row.overall_count;
      } else if (row.overall_status === 'candidate denied') {
        filterOptions.candidateDeniedCount = row.overall_count;
      }
    });

    const completedGreenRedYellowPinkOrangeSQL = `
              SELECT
                COUNT(*) as overall_count,
                b.final_verification_status
              from
                client_applications a 
                JOIN customers c ON a.customer_id = c.id
                JOIN cmt_applications b ON a.id = b.client_application_id 
              where
                b.overall_status ='completed'
                AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')
                AND LOWER(b.final_verification_status) IN ('green', 'red', 'yellow', 'pink', 'orange')
                AND c.status=1
              GROUP BY
                b.final_verification_status
            `;

    const completedGreenRedYellowPinkOrangeResult = await sequelize.query(completedGreenRedYellowPinkOrangeSQL, {
      type: QueryTypes.SELECT,
    });

    completedGreenRedYellowPinkOrangeResult.forEach(row => {
      const status = row.final_verification_status.toLowerCase();
      if (status === 'green') {
        filterOptions.completedGreenCount = row.overall_count;
      } else if (status === 'red') {
        filterOptions.completedRedCount = row.overall_count;
      } else if (status === 'yellow') {
        filterOptions.completedYellowCount = row.overall_count;
      } else if (status === 'pink') {
        filterOptions.completedPinkCount = row.overall_count;
      } else if (status === 'orange') {
        filterOptions.completedOrangeCount = row.overall_count;
      }
    });
    const transformedFilterOptions = Object.entries(filterOptions).map(([status, count]) => ({
      status,
      count
    }));

    return callback(null, transformedFilterOptions);


  },

  filterOptionsForApplicationListing: (customer_id, branch_id, callback) => {
    // Get the current date
    const now = new Date();
    const month = `${String(now.getMonth() + 1).padStart(2, '0')}`;
    const year = `${now.getFullYear()}`;
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

    let filterOptions = {
      overallCount: 0,
      wipCount: 0,
      insuffCount: 0,
      completedGreenCount: 0,
      completedRedCount: 0,
      completedYellowCount: 0,
      completedPinkCount: 0,
      completedOrangeCount: 0,
      previousCompletedCount: 0,
      stopcheckCount: 0,
      activeEmploymentCount: 0,
      nilCount: 0,
      candidateDeniedCount: 0,
      notDoableCount: 0,
      initiatedCount: 0,
      holdCount: 0,
      closureAdviceCount: 0,
      qcStatusPendingCount: 0,
      notReadyCount: 0,
      downloadReportCount: 0,
    };

    let conditions = {
      overallCount: `AND (b.overall_status='wip' OR b.overall_status='insuff' OR b.overall_status='initiated' OR b.overall_status='hold' OR b.overall_status='closure advice' OR b.overall_status='stopcheck' OR b.overall_status='active employment' OR b.overall_status='nil' OR b.overall_status='' OR b.overall_status='not doable' OR b.overall_status='candidate denied' OR (b.overall_status='completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) OR (b.overall_status='completed' AND b.report_date NOT LIKE '%-${month}-%'))`,
      wipCount: `AND (b.overall_status = 'wip')`,
      insuffCount: `AND (b.overall_status = 'insuff')`,
      completedGreenCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='green'`,
      completedRedCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='red'`,
      completedYellowCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='yellow'`,
      completedPinkCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='pink'`,
      completedOrangeCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='orange'`,
      previousCompletedCount: `AND (b.overall_status = 'completed' AND b.report_date NOT LIKE '%-${month}-%')`,
      stopcheckCount: `AND (b.overall_status = 'stopcheck')`,
      activeEmploymentCount: `AND (b.overall_status = 'active employment')`,
      nilCount: `AND (b.overall_status = 'nil' OR b.overall_status = '')`,
      candidateDeniedCount: `AND (b.overall_status = 'candidate denied')`,
      notDoableCount: `AND (b.overall_status = 'not doable')`,
      initiatedCount: `AND (b.overall_status = 'initiated')`,
      holdCount: `AND (b.overall_status = 'hold')`,
      closureAdviceCount: `AND (b.overall_status = 'closure advice')`,
      qcStatusPendingCount: `AND (LOWER(b.is_verify) = 'no' OR b.is_verify IS NULL OR b.is_verify = '') AND a.status='completed'`,
      notReadyCount: `AND b.overall_status NOT IN ('completed', 'stopcheck')`,
      downloadReportCount: `AND (b.overall_status = 'completed')`
    };

    let sqlQueries = [];

    // Build SQL queries for each filter option
    for (let key in filterOptions) {
      if (filterOptions.hasOwnProperty(key)) {
        let condition = conditions[key];
        if (condition) {
          const SQL = `
              SELECT count(*) AS count
              FROM client_applications a
              JOIN customers c ON a.customer_id = c.id
              JOIN cmt_applications b ON a.id = b.client_application_id
              WHERE a.customer_id = ? 
              AND CAST(a.branch_id AS CHAR) = ?
              ${condition}
              AND c.status = 1
            `;

          sqlQueries.push(new Promise(async (resolve, reject) => {
            try {
              const result = await sequelize.query(SQL, {
                replacements: [customer_id, branch_id],
                type: QueryTypes.SELECT,
              });

              filterOptions[key] = result[0]?.count || 0;
              resolve();
            } catch (error) {
              reject(error);
            }
          }));
        }
      }
    }

    // After all queries finish, execute the callback
    Promise.all(sqlQueries)
      .then(() => {
        const transformedFilterOptions = Object.entries(filterOptions).map(([status, count]) => ({
          status,
          count
        }));

        callback(null, transformedFilterOptions);
      })
      .catch((err) => {
        callback(err, null);
      });
  },

  filterOptionsForBranch: (branch_id, callback) => {
    // Get the current date
    const now = new Date();
    const month = `${String(now.getMonth() + 1).padStart(2, '0')}`;
    const year = `${now.getFullYear()}`;
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthYear = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

    let filterOptions = {
      overallCount: 0,
      wipCount: 0,
      insuffCount: 0,
      completedGreenCount: 0,
      completedRedCount: 0,
      completedYellowCount: 0,
      completedPinkCount: 0,
      completedOrangeCount: 0,
      previousCompletedCount: 0,
      stopcheckCount: 0,
      activeEmploymentCount: 0,
      nilCount: 0,
      candidateDeniedCount: 0,
      notDoableCount: 0,
      initiatedCount: 0,
      holdCount: 0,
      closureAdviceCount: 0,
      qcStatusPendingCount: 0,
      notReadyCount: 0,
      downloadReportCount: 0,
    };

    let conditions = {
      overallCount: `AND (b.overall_status='wip' OR b.overall_status='insuff' OR b.overall_status='initiated' OR b.overall_status='hold' OR b.overall_status='closure advice' OR b.overall_status='stopcheck' OR b.overall_status='active employment' OR b.overall_status='nil' OR b.overall_status='' OR b.overall_status='not doable' OR b.overall_status='candidate denied' OR (b.overall_status='completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) OR (b.overall_status='completed' AND b.report_date NOT LIKE '%-${month}-%'))`,
      wipCount: `AND (b.overall_status = 'wip')`,
      insuffCount: `AND (b.overall_status = 'insuff')`,
      completedGreenCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='green'`,
      completedRedCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='red'`,
      completedYellowCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='yellow'`,
      completedPinkCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='pink'`,
      completedOrangeCount: `AND (b.overall_status = 'completed' AND (b.report_date LIKE '${yearMonth}-%' OR b.report_date LIKE '%-${monthYear}')) AND LOWER(b.final_verification_status)='orange'`,
      previousCompletedCount: `AND (b.overall_status = 'completed' AND b.report_date NOT LIKE '%-${month}-%')`,
      stopcheckCount: `AND (b.overall_status = 'stopcheck')`,
      activeEmploymentCount: `AND (b.overall_status = 'active employment')`,
      nilCount: `AND (b.overall_status = 'nil' OR b.overall_status = '')`,
      candidateDeniedCount: `AND (b.overall_status = 'candidate denied')`,
      notDoableCount: `AND (b.overall_status = 'not doable')`,
      initiatedCount: `AND (b.overall_status = 'initiated')`,
      holdCount: `AND (b.overall_status = 'hold')`,
      closureAdviceCount: `AND (b.overall_status = 'closure advice')`,
      qcStatusPendingCount: `AND (LOWER(b.is_verify) = 'no' OR b.is_verify IS NULL OR b.is_verify = '') AND a.status='completed'`,
      notReadyCount: `AND b.overall_status NOT IN ('completed', 'stopcheck')`,
      downloadReportCount: `AND (b.overall_status = 'completed')`
    };

    let sqlQueries = Object.entries(filterOptions).map(([key]) => {
      let condition = conditions[key];
      if (condition) {
        const SQL = `
              SELECT COUNT(*) AS count
              FROM client_applications a
              JOIN customers c ON a.customer_id = c.id
              JOIN cmt_applications b ON a.id = b.client_application_id
              WHERE a.branch_id = ?
              ${condition}
              AND c.status = 1
          `;

        return sequelize.query(SQL, {
          replacements: [branch_id],
          type: QueryTypes.SELECT,
        }).then(result => {
          filterOptions[key] = result[0]?.count || 0;
        });
      }
    });

    console.log(`Executing SQL queries...`);

    // Execute all queries
    Promise.all(sqlQueries)
      .then(() => {
        console.log(`Final Filter Options:`, filterOptions);
        const transformedFilterOptions = Object.entries(filterOptions).map(([status, count]) => ({ status, count }));
        callback(null, transformedFilterOptions);
      })
      .catch(err => {
        console.error(`Error fetching filter options:`, err);
        callback(err, null);
      });
  },

  applicationByRefID: async (ref_id, callback) => {

    try {
      const sql =
        "SELECT CA.*, C.name AS customer_name FROM `client_applications` AS CA INNER JOIN `customers` AS C ON C.id = CA.customer_id WHERE CA.`application_id` = ? ORDER BY `created_at` DESC";

      const results = await sequelize.query(sql, {
        replacements: [ref_id],  // No need to convert to a string
        type: QueryTypes.SELECT,
      });

      callback(null, results.length > 0 ? results[0] : null);
    } catch (error) {
      console.error("Error in getCMTApplicationById:", error);
      callback(error, null);
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

  getCMTApplicationIDByClientApplicationId: async (client_application_id, callback) => {
    try {
      if (!client_application_id) {
        return callback(null, false);
      }

      const sql = "SELECT `id` FROM `cmt_applications` WHERE `client_application_id` = ?";

      const results = await sequelize.query(sql, {
        replacements: [client_application_id],
        type: QueryTypes.SELECT,
      });

      return callback(null, results.length > 0 ? results[0].id : false);
    } catch (error) {
      console.error("Error fetching CMT Application ID:", error);
      callback(error, null);
    }
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
      const existingColumnsLower = existingColumns.map(col => col.toLowerCase());
      const missingColumns = fields.filter((field) => !existingColumnsLower.includes(field.toLowerCase()));

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

        // Check if table exists
        const tableExistsSql = `
    SELECT COUNT(*) as count 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() 
    AND table_name = ?`;

        const [tableExistsResult] = await sequelize.query(tableExistsSql, {
          replacements: [dbTable],
          type: QueryTypes.SELECT,
        });

        if (tableExistsResult.count === 0) {
          console.warn(`Table "${dbTable}" does not exist.`);
          return;
        }

        // 1. Check for existing columns in cmt_applications
        const checkColumnsSql = `SHOW COLUMNS FROM \`${dbTable}\``;
        const [results] = await sequelize.query(checkColumnsSql, { type: QueryTypes.SHOW });

        const existingColumns = results.map((row) => row.Field);
        const existingColumnsFromFileInoutNames = fileInputNames.filter((field) => existingColumns.includes(field));

        const selectQuery = `SELECT ${existingColumnsFromFileInoutNames.length > 0 ? existingColumnsFromFileInoutNames.join(", ") : "*"} FROM ${dbTable} WHERE client_application_id = ?`;
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
