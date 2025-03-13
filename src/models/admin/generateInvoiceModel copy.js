const crypto = require("crypto");
const { sequelize } = require("../../config/db");
const { QueryTypes } = require("sequelize");

// Function to hash the password using MD5
const hashPassword = (password) =>
  crypto.createHash("md5").update(password).digest("hex");

const generateInvoiceModel = {
  generateInvoice: async (customerId, month, year, callback) => {
    try {
      // Select customer details
      const customerQuery = `
        SELECT 
          c.id, 
          c.client_unique_id, 
          c.name, 
          c.emails, 
          c.mobile, 
          c.services, 
          cm.address, 
          cm.contact_person_name, 
          cm.escalation_admin_id, 
          cm.single_point_of_contact, 
          cm.gst_number,
          cm.payment_contact_person,
          cm.state,
          cm.state_code,
          escalation_admin.name AS escalation_admin_name
        FROM customers c
        LEFT JOIN customer_metas cm ON cm.customer_id = c.id
        LEFT JOIN admins escalation_admin ON escalation_admin.id = cm.escalation_admin_id AND cm.escalation_admin_id IS NOT NULL
        WHERE c.id = ?;
      `;

      const [customerResults] = await sequelize.query(customerQuery, {
        replacements: [customerId],
        type: sequelize.QueryTypes.SELECT,
      });

      if (!customerResults || customerResults.length === 0) {
        throw new Error("Customer not found.");
      }

      const customerData = customerResults;
      const servicesData = JSON.parse(customerData.services);
      // console.log(`servicesData - `, servicesData);
      // Update service titles
      for (const group of servicesData) {
        const serviceSql = `SELECT title FROM services WHERE id = ?`;
        const [results] = await sequelize.query(serviceSql, {
          replacements: [group.serviceId],
          type: sequelize.QueryTypes.SELECT,
        });
        if (results && results.length > 0) {
          group.serviceTitle = results[0].title;
        }
      }
      customerData.services = JSON.stringify(servicesData);

      // Fetch applications
      const applicationQuery = `
        SELECT
          ca.id,
          ca.branch_id,
          ca.application_id,
          ca.employee_id,
          ca.name,
          ca.services,
          ca.status,
          ca.created_at,
          cmt.report_date
        FROM 
          client_applications ca
        LEFT JOIN 
          cmt_applications cmt ON cmt.client_application_id = ca.id
        WHERE 
          (ca.status = 'completed' OR ca.status = 'closed') 
          AND ca.customer_id = ?
          AND MONTH(cmt.report_date) = ?
          AND YEAR(cmt.report_date) = ? 
        ORDER BY ca.branch_id;
      `;

      const applicationResults = await sequelize.query(applicationQuery, {
        replacements: [customerId, month, year],
        type: sequelize.QueryTypes.SELECT,
      });

      // Group applications by branch
      const branchApplicationsMap = {};
      // console.log(`applicationResults - `, applicationResults);
      applicationResults.forEach((application) => {
        const branchId = application.branch_id;
        if (!branchApplicationsMap[branchId]) {
          branchApplicationsMap[branchId] = {
            id: branchId,
            applications: [],
          };
        }
        application.statusDetails = [];
        branchApplicationsMap[branchId].applications.push(application);
      });

      // Fetch branch details
      const branchIds = Object.keys(branchApplicationsMap);
      // console.log(`branchApplicationsMap - `, branchApplicationsMap);
      const branchesWithApplications = await Promise.all(
        branchIds.map(async (branchId) => {
          const branchQuery = `SELECT id, name FROM branches WHERE id = ?`;
          const [branchResults] = await sequelize.query(branchQuery, {
            replacements: [branchId],
            type: sequelize.QueryTypes.SELECT,
          });
          return branchResults.length > 0
            ? {
              id: branchResults[0].id,
              name: branchResults[0].name,
              applications: branchApplicationsMap[branchId].applications,
            }
            : null;
        })
      ).then(results => results.filter(Boolean));

      // Process application services
      const completeStatusGroups = [
        "completed",
        "completed_green",
        "completed_red",
        "completed_yellow",
        "completed_pink",
        "completed_orange",
      ];

      await Promise.all(
        applicationResults.map(async (application) => {
          const services = application.services.split(",");
          await Promise.all(
            services.map(async (serviceId) => {
              const reportFormQuery = `
                SELECT json
                FROM report_forms
                WHERE service_id = ?;
              `;
              const [reportFormResults] = await sequelize.query(reportFormQuery, {
                replacements: [serviceId],
                type: sequelize.QueryTypes.SELECT,
              });

              if (reportFormResults.length > 0) {
                const reportFormJson = JSON.parse(reportFormResults[0].json);
                const dbTable = reportFormJson.db_table;

                const [columnResults] = await sequelize.query(
                  `SHOW COLUMNS FROM \`${dbTable}\` WHERE \`Field\` LIKE 'additional_fee%'`
                );
                // console.log(`columnResults - `, columnResults);
                const additionalFeeColumn =
                  columnResults.length > 0 ? columnResults[0].Field : null;

                const statusQuery = `
                  SELECT status${additionalFeeColumn ? `, ${additionalFeeColumn}` : ""}
                  FROM ${dbTable}
                  WHERE client_application_id = ? AND is_billed != 1 AND status IN (${completeStatusGroups.map(() => "?").join(", ")});
                `;
                const [statusResults] = await sequelize.query(statusQuery, {
                  replacements: [application.id, ...completeStatusGroups],
                  type: sequelize.QueryTypes.SELECT,
                });

                if (statusResults.length > 0 && statusResults[0].status !== null) {
                  application.statusDetails.push({
                    serviceId,
                    status: statusResults[0].status,
                    additionalFee: additionalFeeColumn ? statusResults[0][additionalFeeColumn] : null,
                  });

                  await sequelize.query(
                    `UPDATE ${dbTable} SET is_billed = 1, billed_date = NOW() WHERE client_application_id = ?`,
                    { replacements: [application.id] }
                  );
                }
              }
            })
          );
        })
      );

      // Filter out applications with empty statusDetails
      branchesWithApplications.forEach((branch) => {
        branch.applications = branch.applications.filter(
          (application) => application.statusDetails.length > 0
        );
      });
      console.log(`branchesWithApplications - `, branchesWithApplications);

      callback(null, {
        customerInfo: customerData,
        applicationsByBranch: branchesWithApplications,
      });
    } catch (error) {
      // console.error("Error in generateInvoice:", error);
      throw error;
    }
  },
};

module.exports = generateInvoiceModel;
