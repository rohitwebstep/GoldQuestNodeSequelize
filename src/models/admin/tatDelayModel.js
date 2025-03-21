const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

const moment = require("moment"); // Ensure you have moment.js installed

const tatDelay = {
  list: async (callback) => {
    try {
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

      const holidaysQuery = `SELECT id AS holiday_id, title AS holiday_title, date AS holiday_date FROM holidays;`;
      const weekendsQuery = `SELECT weekends FROM company_info WHERE status = 1;`;

      const [applicationResults, holidayResults, weekendResults] = await Promise.all([
        sequelize.query(applicationsQuery, { type: QueryTypes.SELECT }),
        sequelize.query(holidaysQuery, { type: QueryTypes.SELECT }),
        sequelize.query(weekendsQuery, { type: QueryTypes.SELECT })
      ]);

      const holidayDates = new Set(holidayResults.map(holiday => moment(holiday.holiday_date).format("YYYY-MM-DD")));
      const weekendsSet = new Set(
        weekendResults[0]?.weekends ? JSON.parse(weekendResults[0].weekends).map(day => day.toLowerCase()) : []
      );

      const applicationHierarchy = applicationResults.reduce((acc, row) => {
        const {
          customer_id, customer_name, customer_emails, customer_unique_id,
          customer_mobile, tat_days, branch_id, branch_name, branch_email,
          branch_mobile, client_application_id, application_id,
          application_name, application_created_at
        } = row;

        const tatDays = parseInt(tat_days, 10) || 0;
        if (tatDays < 1 || tatDays > 365) return acc;

        if (!acc[customer_id]) {
          acc[customer_id] = {
            customer_id, customer_name, customer_emails, customer_unique_id,
            customer_mobile, tat_days: tatDays, branches: {}
          };
        }

        if (!acc[customer_id].branches[branch_id]) {
          acc[customer_id].branches[branch_id] = {
            branch_id, branch_name, branch_email, branch_mobile, applications: []
          };
        }

        const applicationDate = moment(application_created_at);
        const dueDate = calculateDueDate(applicationDate, tatDays, holidayDates, weekendsSet);
        const daysOutOfTat = calculateDaysOutOfTat(dueDate, moment(), holidayDates, weekendsSet);

        if (daysOutOfTat > 0) {
          acc[customer_id].branches[branch_id].applications.push({
            client_application_id, application_id, application_name,
            application_created_at, days_out_of_tat: daysOutOfTat
          });
        }

        return acc;
      }, {});

      const applicationHierarchyArray = Object.values(applicationHierarchy).map(customer => ({
        ...customer,
        branches: Object.values(customer.branches).filter(branch => branch.applications.length > 0)
      })).filter(customer => customer.branches.length > 0);

      callback(null, {
        applicationHierarchy: applicationHierarchyArray,
        holidays: holidayResults
      });

    } catch (error) {
      console.error("Error fetching applications:", error);
      callback(error, null);
    }

    function calculateDaysOutOfTat(dueDate, endDate, holidayDates, weekendsSet) {
      let daysOutOfTat = 0;
      let currentDate = dueDate.clone().add(1, "day");

      while (currentDate.isBefore(endDate, "day")) {
        if (!weekendsSet.has(currentDate.format("dddd").toLowerCase()) &&
          !holidayDates.has(currentDate.format("YYYY-MM-DD"))) {
          daysOutOfTat++;
        }
        currentDate.add(1, "day");
      }

      return daysOutOfTat;
    }

    function calculateDueDate(startDate, tatDays, holidayDates, weekendsSet) {
      let dueDate = startDate.clone();
      let daysRemaining = tatDays;

      while (daysRemaining > 0) {
        dueDate.add(1, "day");
        if (!weekendsSet.has(dueDate.format("dddd").toLowerCase()) &&
          !holidayDates.has(dueDate.format("YYYY-MM-DD"))) {
          daysRemaining--;
        }
      }

      return dueDate;
    }
  },

};

module.exports = tatDelay;
