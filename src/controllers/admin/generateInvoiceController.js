const crypto = require("crypto");
const GenerateInvoice = require("../../models/admin/generateInvoiceModel");
const Customer = require("../../models/customer/customerModel");
const ClientApplication = require("../../models/customer/branch/clientApplicationModel");
const Branch = require("../../models/customer/branch/branchModel");
const AdminCommon = require("../../models/admin/commonModel");
const BranchCommon = require("../../models/customer/branch/commonModel");
const AppModel = require("../../models/appModel");
const Service = require("../../models/admin/serviceModel");
const {
  finalReportMail,
} = require("../../mailer/admin/client-master-tracker/finalReportMail");
const {
  qcReportCheckMail,
} = require("../../mailer/admin/client-master-tracker/qcReportCheckMail");
const {
  readyForReport,
} = require("../../mailer/admin/client-master-tracker/readyForReport");

const fs = require("fs");
const path = require("path");
const { upload, saveImage, saveImages } = require("../../utils/cloudImageSave");

function calculateServiceStats(applications, services) {
  const serviceStats = {};
  const allServiceIds = [];
  const servicesToAllocate = [];

  applications.forEach((application) => {
    application.applications.forEach((app) => {
      const serviceIds = app.services.split(",");

      serviceIds.forEach((serviceId) => {
        const id = parseInt(serviceId, 10);
        allServiceIds.push(id);

        // Check if the service ID exists in the customer services
        const serviceExists = services.some(
          (service) => service.serviceId === id
        );

        // Initialize the service stats if it doesn't exist
        if (!serviceStats[id]) {
          if (serviceExists) {
            const service = services.find((s) => s.serviceId === id);
            serviceStats[id] = {
              serviceId: id,
              serviceTitle: service.serviceTitle,
              price: parseFloat(service.price),
              count: 0,
              totalCost: 0,
            };
          } else {
            servicesToAllocate.push(id);
            return; // Skip further processing for this ID
          }
        }

        // Safely increment the count for existing service stats
        serviceStats[id].count += 1;
      });
    });
  });

  // Calculate total cost for each service
  for (const id in serviceStats) {
    serviceStats[id].totalCost =
      serviceStats[id].count * serviceStats[id].price;
  }

  return { serviceStats, servicesToAllocate }; // Return servicesToAllocate as well
}

// Function to calculate overall costs
function calculateOverallCosts(serviceStats, percentage) {
  let overallServiceAmount = 0;

  for (const stat of Object.values(serviceStats)) {
    overallServiceAmount += stat.totalCost;
  }

  const cgstAmount = (overallServiceAmount * (percentage / 100)).toFixed(2);
  const sgstAmount = (overallServiceAmount * (percentage / 100)).toFixed(2);
  const totalTax = (parseFloat(cgstAmount) + parseFloat(sgstAmount)).toFixed(2);
  const totalAmount = (overallServiceAmount + parseFloat(totalTax)).toFixed(2);

  return {
    overallServiceAmount: overallServiceAmount.toFixed(2),
    cgst: {
      percentage: percentage,
      tax: cgstAmount,
    },
    sgst: {
      percentage: percentage,
      tax: sgstAmount,
    },
    totalTax,
    totalAmount,
  };
}

async function getServiceNames(serviceIds) {
  // Helper function to fetch a service by ID
  const fetchServiceById = (serviceId) => {
    return new Promise((resolve, reject) => {
      Service.getServiceById(serviceId, (err, service) => {
        if (err) return reject(err);
        resolve(service);
      });
    });
  };

  try {
    // Fetch all services concurrently using Promise.all
    const servicePromises = serviceIds.map(async (serviceId) => {
      const service = await fetchServiceById(serviceId);
      if (service && service.title) {
        return {
          id: service.id,
          title: service.title,
          shortCode: service.short_code,
        };
      }
      return null;
    });

    // Wait for all promises to resolve and filter out any null results
    const serviceNames = (await Promise.all(servicePromises)).filter(Boolean);
    return serviceNames;
  } catch (error) {
    console.error("Error fetching service data:", error);
    return [];
  }
}

// Controller to list all customers
exports.generateInvoice = async (req, res) => {
  const { customer_id, month, year, admin_id, _token } = req.query; // Renamed for clarity

  // Check for missing required fields
  const missingFields = [];
  if (
    !customer_id ||
    customer_id === "" ||
    customer_id === undefined ||
    customer_id === "undefined"
  ) {
    missingFields.push("Customer ID");
  }

  if (!month || month === "" || month === undefined || month === "undefined") {
    missingFields.push("generate_invoice Month");
  }

  if (!year || year === "" || year === undefined || year === "undefined") {
    missingFields.push("generate_invoice Year");
  }

  if (!year || year === "" || year === undefined || year === "undefined") {
    missingFields.push("generate_invoice Year");
  }

  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  // Return error response for any missing fields
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Action for admin authorization
  const actionPayload = "create_invoice";
  AdminCommon.isAdminAuthorizedForAction(
    admin_id,
    actionPayload,
    async (authResult) => {
      if (!authResult.status) {
        return res.status(403).json({
          status: false,
          message: authResult.message, // Message from the authorization function
        });
      }

      // Verify admin token
      AdminCommon.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
        if (err) {
          console.error("Error checking token validity:", err);
          return res.status(500).json({ status: false, message: err.message });
        }

        if (!tokenResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenResult.message,
          });
        }

        const newToken = tokenResult.newToken;
        AppModel.companyInfo((err, companyInfo) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({
              status: false,
              message: err.message,
              token: newToken,
            });
          }

          // Fetch customer information and applications
          GenerateInvoice.generateInvoice(
            customer_id,
            month,
            year,
            async (err, results) => {
              if (err) {
                console.error("Database error:", err);
                return res.status(500).json({
                  status: false,
                  message: err.message,
                  token: newToken,
                });
              }

              // Extract services and applications
              const services = JSON.parse(results.customerInfo.services); // Parse services JSON string
              const applications = results.applicationsByBranch;

              // Calculate service statistics
              const { serviceStats, servicesToAllocate } =
                calculateServiceStats(applications, services);

              // Calculate overall costs with 9% as parameter
              const overallCosts = calculateOverallCosts(serviceStats, 9);

              // Convert serviceStats to an array for easy access
              const totalCostsArray = Object.values(serviceStats);

              // Log the results
              const finalArr = {
                serviceInfo: totalCostsArray,
                costInfo: overallCosts,
              };

              const customerServiceList = JSON.parse(
                results.customerInfo.services
              );
              const customerServiceIds =
                customerServiceList.length > 0
                  ? customerServiceList.map((service) => service.serviceId)
                  : [];

              const serviceNames = await getServiceNames(customerServiceIds);

              // Respond with the fetched customer data and applications
              return res.json({
                status: true,
                serviceNames,
                message: "Data fetched successfully.",
                finalArr,
                servicesToAllocate,
                customer: results.customerInfo, // Customer information
                applications: results.applicationsByBranch, // Client applications organized by branch
                totalApplications: results.applicationsByBranch.reduce(
                  (sum, branch) => sum + branch.applications.length,
                  0
                ),
                companyInfo,
                token: newToken,
              });
            }
          );
        });
      });
    }
  );
};
