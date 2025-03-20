const { pool, startConnection, connectionRelease } = require("../../config/db");
const moment = require("moment"); // Ensure you have moment.js installed

const tatDelay = {
  list: (callback) => {
    // SQL query to retrieve applications, customers, branches, and tat_days
    const applicationsQuery = `
      SELECT 
        cmt.report_date, 
        ca.id AS client_application_id, 
        ca.customer_id, 
        ca.branch_id, 
        ca.application_id, 
        ca.name AS application_name, 
        ca.created_at AS application_created_at, 
        cust.name AS customer_name, 
        cust.emails AS customer_emails, 
        cust.client_unique_id AS customer_unique_id, 
        cust.mobile AS customer_mobile, 
        cm.tat_days AS tat_days,
        br.name AS branch_name, 
        br.email AS branch_email, 
        br.mobile_number AS branch_mobile
      FROM client_applications AS ca
      JOIN customers AS cust ON cust.id = ca.customer_id
      JOIN branches AS br ON br.id = ca.branch_id
      LEFT JOIN customer_metas AS cm ON cm.customer_id = cust.id
      LEFT JOIN cmt_applications AS cmt ON ca.id = cmt.client_application_id
      WHERE cmt.report_date IS NULL;
    `;

    // SQL query to fetch holidays
    const holidaysQuery = `SELECT id AS holiday_id, title AS holiday_title, date AS holiday_date FROM holidays;`;

    // SQL query to fetch weekends
    const weekendsQuery = `SELECT weekends FROM company_info WHERE status = 1;`;

    startConnection((connectionError, connection) => {
      if (connectionError) {
        console.error("Connection error:", connectionError);
        return callback(connectionError, null);
      }

      // Execute the applications query
      connection.query(
        applicationsQuery,
        (appQueryError, applicationResults) => {
          if (appQueryError) {
            console.error("Application query error:", appQueryError);
            return handleQueryError(appQueryError, connection, callback);
          }

          // Execute the holidays query
          connection.query(holidaysQuery, (holQueryError, holidayResults) => {
            if (holQueryError) {
              console.error("Holidays query error:", holQueryError);
              return handleQueryError(holQueryError, connection, callback);
            }

            // Prepare holiday dates for calculations
            const holidayDates = holidayResults.map((holiday) =>
              moment(holiday.holiday_date).startOf("day")
            );

            // Execute the weekends query
            connection.query(
              weekendsQuery,
              (weekendQueryError, weekendResults) => {
                connectionRelease(connection); // Always release the connection

                if (weekendQueryError) {
                  console.error(
                    "Database query error: Weekends",
                    weekendQueryError
                  );
                  return callback(weekendQueryError, null);
                }

                const weekends = weekendResults[0]?.weekends
                  ? JSON.parse(weekendResults[0].weekends)
                  : [];
                const weekendsSet = new Set(
                  weekends.map((day) => day.toLowerCase())
                );

                // Construct the hierarchical structure for applications
                const applicationHierarchy = applicationResults.reduce(
                  (accumulator, row) => {
                    const {
                      customer_id,
                      customer_name,
                      customer_emails,
                      customer_unique_id,
                      customer_mobile,
                      tat_days,
                      branch_id,
                      branch_name,
                      branch_email,
                      branch_mobile,
                      client_application_id,
                      application_id,
                      application_name,
                      application_created_at,
                    } = row;

                    // Ensure tat_days is a reasonable value to avoid memory issues
                    const tatDays = parseInt(tat_days, 10) || 0;
                    if (tatDays < 1 || tatDays > 365) {
                      console.warn(
                        `Skipping invalid TAT days value: ${tatDays}`
                      );
                      return accumulator;
                    }

                    // Initialize customer entry if it doesn't exist
                    if (!accumulator[customer_id]) {
                      accumulator[customer_id] = {
                        customer_id,
                        customer_name,
                        customer_emails,
                        customer_unique_id,
                        customer_mobile,
                        tat_days: tatDays, // Parse TAT days as an integer
                        branches: {},
                      };
                    }

                    // Initialize branch entry if it doesn't exist
                    if (!accumulator[customer_id].branches[branch_id]) {
                      accumulator[customer_id].branches[branch_id] = {
                        branch_id,
                        branch_name,
                        branch_email,
                        branch_mobile,
                        applications: [],
                      };
                    }

                    // Calculate days out of TAT
                    const applicationDate = moment(application_created_at);
                    const dueDate = calculateDueDate(
                      applicationDate,
                      tatDays,
                      holidayDates,
                      weekendsSet
                    );

                    // Calculate days out of TAT
                    const daysOutOfTat = calculateDaysOutOfTat(
                      dueDate,
                      moment(),
                      holidayDates,
                      weekendsSet
                    );

                    // Only add application information if days out of TAT is greater than 0
                    if (daysOutOfTat > 0) {
                      accumulator[customer_id].branches[
                        branch_id
                      ].applications.push({
                        client_application_id,
                        application_id,
                        application_name,
                        application_created_at,
                        days_out_of_tat: daysOutOfTat, // Include days out of TAT
                      });
                    }

                    return accumulator;
                  },
                  {}
                );

                // Convert the application hierarchy object to an array with nested branches and applications
                const applicationHierarchyArray = Object.values(
                  applicationHierarchy
                )
                  .map((customer) => ({
                    ...customer,
                    branches: Object.values(customer.branches).filter(
                      (branch) => branch.applications.length > 0 // Only include branches with applications
                    ),
                  }))
                  .filter((customer) => customer.branches.length > 0); // Only include customers with branches

                // Map holiday results into a structured array
                const holidaysArray = holidayResults.map((holiday) => ({
                  id: holiday.holiday_id,
                  title: holiday.holiday_title,
                  date: holiday.holiday_date,
                }));

                // Callback with both the application hierarchy and holidays array
                callback(null, {
                  applicationHierarchy: applicationHierarchyArray,
                  holidays: holidaysArray,
                });
              }
            );
          });
        }
      );
    });

    function handleQueryError(error, connection, callback) {
      connectionRelease(connection); // Ensure the connection is released
      console.error("Database query error:", error);
      callback(error, null);
    }

    function calculateDaysOutOfTat(
      dueDate,
      endDate,
      holidayDates,
      weekendsSet
    ) {
      // Calculate the number of days in the range, excluding the dueDate itself
      const totalDays = endDate.diff(dueDate, "days") - 1;

      // Generate all dates in the range (excluding dueDate)
      const allDates = Array.from({ length: totalDays }, (_, i) =>
        dueDate.clone().add(i + 1, "days")
      );

      // Filter dates to include only valid business days (non-weekends, non-holidays)
      const validBusinessDays = allDates.filter((date) => {
        const dayName = date.format("dddd").toLowerCase();

        // Skip weekends and holidays in a single check
        if (
          weekendsSet.has(dayName) ||
          holidayDates.some((holiday) => holiday.isSame(date, "day"))
        ) {
          return false;
        }

        return true;
      });

      return validBusinessDays.length;
    }

    function calculateDueDate(startDate, tatDays, holidayDates, weekendsSet) {
      // Track remaining TAT days to process
      let remainingDays = tatDays;

      // Generate potential dates to check
      const potentialDates = Array.from({ length: tatDays * 2 }, (_, i) =>
        startDate.clone().add(i + 1, "days")
      );

      // Calculate the final due date
      let finalDueDate = potentialDates.find((date) => {
        const dayName = date.format("dddd").toLowerCase();

        // Skip weekends
        if (weekendsSet.has(dayName)) {
          return false;
        }

        // Skip holidays
        if (holidayDates.some((holiday) => holiday.isSame(date, "day"))) {
          return false;
        }

        remainingDays--;
        return remainingDays <= 0;
      });
      return finalDueDate;
    }
  },
};

module.exports = tatDelay;
