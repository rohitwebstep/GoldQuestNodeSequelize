const crypto = require("crypto");
const ClientMasterTrackerModel = require("../../models/admin/clientMasterTrackerModel");
const Customer = require("../../models/customer/customerModel");
const ClientApplication = require("../../models/customer/branch/clientApplicationModel");
const Branch = require("../../models/customer/branch/branchModel");
const AdminCommon = require("../../models/admin/commonModel");
const Admin = require("../../models/admin/adminModel");
const App = require("../../models/appModel");
const BranchCommon = require("../../models/customer/branch/commonModel");
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
const { generatePDF } = require("../../utils/finalReportPdf");
const { cdfDataPDF } = require("../../utils/cdfDataPDF");
const { upload, saveImage, saveImages, deleteFolder } = require("../../utils/cloudImageSave");

// Controller to list all customers
exports.list = (req, res) => {
  const { admin_id, _token, filter_status } = req.query;

  // Check for missing fields
  const missingFields = [];
  if (!admin_id) missingFields.push("Admin ID");
  if (!_token) missingFields.push("Token");

  // Return error if there are missing fields
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      // Fetch all required data
      const dataPromises = [
        new Promise((resolve) =>
          ClientMasterTrackerModel.list(filter_status, (err, result) => {
            if (err) return resolve([]);
            resolve(result);
          })
        ),
        new Promise((resolve) =>
          ClientMasterTrackerModel.filterOptions((err, result) => {
            if (err) return resolve([]);
            resolve(result);
          })
        ),
      ];

      Promise.all(dataPromises).then(([customers, filterOptions]) => {
        res.json({
          status: true,
          message: "Customers fetched successfully",
          data: {
            customers,
            filterOptions,
          },
          totalResults: {
            customers: customers.length,
            filterOptions: filterOptions.length,
          },
          token: newToken,
        });
      });
    });
  });
};

exports.delete = (req, res) => {
  const { client_application_id, customer_id, admin_id, _token } = req.query;

  // Check for missing fields
  const missingFields = [];
  if (!client_application_id) missingFields.push("Client Application ID");
  if (!customer_id) missingFields.push("Customer ID");
  if (!admin_id) missingFields.push("Admin ID");
  if (!_token) missingFields.push("Token");

  // Return error if there are missing fields
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      Customer.getCustomerById(
        customer_id,
        (err, currentCustomer) => {
          if (err) {
            console.error(
              "Database error during customer retrieval:",
              err
            );
            return reject(
              new Error(
                "Failed to retrieve Customer. Please try again."
              )
            );
          }

          if (!currentCustomer) {
            return reject(
              new Error(
                "Customer not found."
              )
            );
          }

          // Fetch the current clientApplication
          ClientApplication.getClientApplicationById(
            client_application_id,
            (err, currentClientApplication) => {
              if (err) {
                console.error(
                  "Database error during clientApplication retrieval:",
                  err
                );
                return res.status(500).json({
                  status: false,
                  message:
                    "Failed to retrieve ClientApplication. Please try again.",
                  token: newToken,
                });
              }

              if (!currentClientApplication) {
                return res.status(404).json({
                  status: false,
                  message: "Client Aplication not found.",
                  token: newToken,
                });
              }

              // if (parseInt(currentClientApplication.customer_id, 10) == parseInt(customer_id, 10)) {
              //   return res.status(404).json({
              //     status: false,
              //     message: "Client application related to different customer.",
              //     token: newToken,
              //   });
              // }

              // Delete the clientApplication
              ClientApplication.delete(client_application_id, async (err, result) => {
                if (err) {
                  console.error(
                    "Database error during clientApplication deletion:",
                    err
                  );
                  return res.status(500).json({
                    status: false,
                    message:
                      "Failed to delete ClientApplication. Please try again.",
                    token: newToken,
                  });
                }

                const clientUniqueId = currentCustomer.client_unique_id;
                try {
                  // Attempt to delete the folder associated with the customer
                  const folderDeletionResponse = await deleteFolder(`/uploads/customers/${clientUniqueId}/client-applications/${currentClientApplication.application_id}`);

                  // Respond with success if customer and folder are deleted successfully
                  return res.status(200).json({
                    status: true,
                    message: "Client Application deleted successfully.",
                    token: newToken,
                  });
                } catch (error) {
                  // Handle error during folder deletion and log it
                  console.error("Error during folder deletion:", error.message);

                  // Respond with success for customer deletion, but include folder deletion error
                  return res.status(200).json({
                    status: true,
                    message: "Client Application deleted successfully.",
                    error: error.message,
                    token: newToken,
                  });
                }
              });
            }
          );
        });
    });

  });
};

exports.test = async (req, res) => {
  try {
    const client_application_id = 3;
    const client_unique_id = "GQ-INDV";
    const application_id = "GQ-INDV-1";
    const branch_id = 3;
    const customer_id = 2;
    const name = "Rohit Sisodia";

    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Generate the PDF
    const pdfTargetDirectory = `uploads/customers/${client_unique_id}/client-applications/${application_id}/final-reports/`;

    const pdfFileName = `${name}_${formattedDate}.pdf`
      .replace(/\s+/g, "-")
      .toLowerCase();
    const pdfPath = await cdfDataPDF(
      client_application_id,
      branch_id,
      customer_id,
      pdfFileName,
      pdfTargetDirectory
    );
    // If successful, return the result
    res.json({
      status: true,
      message: "PDF generated successfully",
      pdfPath,
    });
  } catch (error) {
    console.error("Error:", error.message);

    // Return error response
    res.status(500).json({
      status: false,
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

exports.listByCustomerId = (req, res) => {
  const { customer_id, filter_status, admin_id, _token } = req.query;

  let missingFields = [];
  if (!customer_id || customer_id === "") missingFields.push("Customer ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientMasterTrackerModel.listByCustomerID(
        customer_id,
        filter_status,
        (err, result) => {
          if (err) {
            console.error("Database error:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          res.json({
            status: true,
            message: "Branches tracker fetched successfully",
            customers: result,
            totalResults: result.length,
            token: newToken,
          });
        }
      );
    });
  });
};

exports.applicationListByBranch = (req, res) => {
  const { filter_status, branch_id, admin_id, _token, status } = req.query;

  let missingFields = [];
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  )
    missingFields.push("Branch ID");
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  )
    missingFields.push("Admin ID");
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  )
    missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      if (
        !status ||
        status === "" ||
        status === undefined ||
        status === "undefined"
      ) {
        let status = null;
      }

      Branch.getBranchById(branch_id, (err, currentBranch) => {
        if (err) {
          console.error("Database error during branch retrieval:", err);
          return res.status(500).json({
            status: false,
            message: "Failed to retrieve Branch. Please try again.",
            token: newToken,
          });
        }

        if (!currentBranch) {
          return res.status(404).json({
            status: false,
            message: "Branch not found.",
          });
        }

        Customer.infoByID(
          parseInt(currentBranch.customer_id),
          (err, currentCustomer) => {
            if (err) {
              console.error("Database error during customer retrieval:", err);
              return res.status(500).json({
                status: false,
                message: "Failed to retrieve Customer. Please try again.",
                token: newToken,
              });
            }

            if (!currentCustomer) {
              return res.status(404).json({
                status: false,
                message: "Customer not found.",
                token: newToken,
              });
            }
            const dataPromises = [
              new Promise((resolve) =>
                ClientMasterTrackerModel.applicationListByBranch(
                  filter_status,
                  branch_id,
                  status,
                  (err, result) => {
                    if (err) return resolve([]);
                    resolve(result);
                  }
                )
              ),
              new Promise((resolve) =>
                ClientMasterTrackerModel.filterOptionsForBranch(
                  branch_id,
                  (err, result) => {
                    if (err) return resolve([]);
                    resolve(result);
                  }
                )
              ),
            ];

            Promise.all(dataPromises).then(([customers, filterOptions]) => {
              res.json({
                status: true,
                message: "Client applications fetched successfully",
                data: {
                  customers,
                  filterOptions,
                  branchName: currentBranch.name,
                  customerName: currentCustomer.name,
                  customerEmails: currentCustomer.emails,
                  tatDays: currentCustomer.tat_days,
                },
                totalResults: {
                  customers: customers.length,
                  filterOptions: filterOptions.length,
                },
                token: newToken,
              });
            });
          });
      });

    });
  });
};

exports.applicationByID = (req, res) => {
  const { application_id, branch_id, admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !application_id ||
    application_id === "" ||
    application_id === undefined ||
    application_id === "undefined"
  )
    missingFields.push("Application ID");
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  )
    missingFields.push("Branch ID");
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  )
    missingFields.push("Admin ID");
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  )
    missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientMasterTrackerModel.applicationByID(
        application_id,
        branch_id,
        (err, application) => {
          if (err) {
            console.error("Database error:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          if (!application) {
            return res.status(404).json({
              status: false,
              message: "Application not found",
              token: newToken,
            });
          }

          ClientMasterTrackerModel.getCMTApplicationById(
            application_id,
            (err, CMTApplicationData) => {
              if (err) {
                console.error("Database error:", err);
                return res.status(500).json({
                  status: false,
                  message: err.message,
                  token: newToken,
                });
              }

              Branch.getBranchById(branch_id, (err, currentBranch) => {
                if (err) {
                  console.error("Database error during branch retrieval:", err);
                  return res.status(500).json({
                    status: false,
                    message: "Failed to retrieve Branch. Please try again.",
                    token: newToken,
                  });
                }

                if (!currentBranch) {
                  return res.status(404).json({
                    status: false,
                    message: "Branch not found.",
                    token: newToken,
                  });
                }

                Admin.list((err, adminList) => {
                  if (err) {
                    console.error("Database error:", err);
                    return res.status(500).json({
                      status: false,
                      message: err.message,
                      token: newToken,
                    });
                  }
                  Customer.getCustomerById(
                    parseInt(currentBranch.customer_id),
                    (err, currentCustomer) => {
                      if (err) {
                        console.error(
                          "Database error during customer retrieval:",
                          err
                        );
                        return res.status(500).json({
                          status: false,
                          message:
                            "Failed to retrieve Customer. Please try again.",
                          token: newToken,
                        });
                      }

                      if (!currentCustomer) {
                        return res.status(404).json({
                          status: false,
                          message: "Customer not found.",
                          token: newToken,
                        });
                      }

                      if (!CMTApplicationData) {
                        return res.json({
                          status: true,
                          message: "Application fetched successfully 1",
                          application,
                          branchInfo: currentBranch,
                          customerInfo: currentCustomer,
                          admins: adminList,
                          token: newToken,
                        });
                      } else {
                        return res.json({
                          status: true,
                          message: "Application fetched successfully 2",
                          application,
                          CMTData: CMTApplicationData,
                          branchInfo: currentBranch,
                          customerInfo: currentCustomer,
                          admins: adminList,
                          token: newToken,
                        });
                      }
                    }
                  );
                });
              });
            }
          );
        }
      );
    });
  });
};

exports.annexureData = (req, res) => {
  const { application_id, db_table, admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !application_id ||
    application_id === "" ||
    application_id === undefined ||
    application_id === "undefined"
  )
    missingFields.push("Application ID");
  if (
    !db_table ||
    db_table === "" ||
    db_table === undefined ||
    db_table === "undefined"
  )
    missingFields.push("DB Table");
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  )
    missingFields.push("Admin ID");
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  )
    missingFields.push("Token");

  const modifiedDbTable = db_table.replace(/-/g, "_");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientMasterTrackerModel.annexureData(
        application_id,
        modifiedDbTable,
        (err, annexureData) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({
              status: false,
              message: "An error occurred while fetching annexure data.",
              error: err,
              token: newToken,
            });
          }

          if (!annexureData) {
            return res.status(404).json({
              status: false,
              message: "Annexure Data not found.",
              token: newToken,
            });
          }

          res.status(200).json({
            status: true,
            message: "Application fetched successfully 4.",
            annexureData,
            token: newToken,
          });
        }
      );
    });
  });
};

exports.filterOptions = (req, res) => {
  const { admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  )
    missingFields.push("Admin ID");
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  )
    missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientMasterTrackerModel.filterOptions((err, filterOptions) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "An error occurred while fetching Filter options data.",
            error: err,
            token: newToken,
          });
        }

        if (!filterOptions) {
          return res.status(404).json({
            status: false,
            message: "Filter options Data not found.",
            token: newToken,
          });
        }

        res.status(200).json({
          status: true,
          message: "Filter options fetched successfully.",
          filterOptions,
          token: newToken,
        });
      });
    });
  });
};

exports.filterOptionsForBranch = (req, res) => {
  const { branch_id, admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Branch ID");
  }
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  ) {
    missingFields.push("Admin ID");
  }
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientMasterTrackerModel.filterOptionsForBranch(
        branch_id,
        (err, filterOptions) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({
              status: false,
              message: "An error occurred while fetching Filter options data.",
              error: err,
              token: newToken,
            });
          }

          if (!filterOptions) {
            return res.status(404).json({
              status: false,
              message: "Filter options Data not found.",
              token: newToken,
            });
          }

          res.status(200).json({
            status: true,
            message: "Filter options fetched successfully.",
            filterOptions,
            token: newToken,
          });
        }
      );
    });
  });
};

exports.reportFormJsonByServiceID = (req, res) => {
  const { service_id, admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !service_id ||
    service_id === "" ||
    service_id === undefined ||
    service_id === "undefined"
  )
    missingFields.push("Service ID");
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  )
    missingFields.push("Admin ID");
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  )
    missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientMasterTrackerModel.reportFormJsonByServiceID(
        service_id,
        (err, reportFormJson) => {
          if (err) {
            console.error(newFunction(), err);
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          if (!reportFormJson) {
            return res.status(404).json({
              status: false,
              message: "Report form JSON not found",
              token: newToken,
            });
          }

          res.json({
            status: true,
            message: "Report form JSON fetched successfully",
            reportFormJson,
            token: newToken,
          });

          function newFunction() {
            return "Database error:";
          }
        }
      );
    });
  });
};

exports.generateReport = (req, res) => {
  const {
    admin_id,
    _token,
    branch_id,
    customer_id,
    application_id,
    updated_json,
    annexure,
    send_mail,
  } = req.body;

  // Define required fields
  const requiredFields = {
    admin_id,
    _token,
    branch_id,
    customer_id,
    application_id,
    updated_json,
  };

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Function to flatten JSON and separate annexure
  function flattenJsonWithAnnexure(jsonObj) {
    let result = {};
    let annexureResult = {};

    function recursiveFlatten(obj, isAnnexure = false) {
      for (let key in obj) {
        if (
          typeof obj[key] === "object" &&
          obj[key] !== null &&
          !Array.isArray(obj[key])
        ) {
          if (key === "annexure") {
            isAnnexure = true;
            annexureResult = {};
          }
          recursiveFlatten(obj[key], isAnnexure);
          if (isAnnexure && key !== "annexure") {
            if (typeof obj[key] === "object" && obj[key] !== null) {
              annexureResult[key] = obj[key];
            }
          }
        } else {
          if (!isAnnexure) {
            result[key] = obj[key];
          }
        }
      }
    }

    recursiveFlatten(jsonObj);
    return { mainJson: result, annexureRawJson: annexureResult };
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (AuthResult) => {
    if (!AuthResult.status) {
      return res.status(403).json({
        status: false,
        message: AuthResult.message,
      });
    }

    AdminCommon.isAdminTokenValid(_token, admin_id, (err, TokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!TokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: TokenResult.message });
      }

      const newToken = TokenResult.newToken;
      Branch.getBranchById(branch_id, (err, currentBranch) => {
        if (err) {
          console.error("Database error during branch retrieval:", err);
          return res.status(500).json({
            status: false,
            message: "Failed to retrieve Branch. Please try again.",
            token: newToken,
          });
        }

        if (!currentBranch) {
          return res.status(404).json({
            status: false,
            message: "Branch not found.",
            token: newToken,
          });
        }

        if (parseInt(currentBranch.customer_id) !== parseInt(customer_id)) {
          return res.status(404).json({
            status: false,
            message: "Branch not found with customer match.",
            branch: currentBranch,
            token: newToken,
          });
        }

        Customer.getCustomerById(customer_id, (err, currentCustomer) => {
          if (err) {
            console.error("Database error during customer retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Customer. Please try again.",
              token: newToken,
            });
          }

          if (!currentCustomer) {
            return res.status(404).json({
              status: false,
              message: "Customer not found.",
              token: newToken,
            });
          }

          ClientMasterTrackerModel.getCMTApplicationById(
            application_id,
            (err, currentCMTApplication) => {
              if (err) {
                console.error(
                  "Database error during CMT Application retrieval:",
                  err
                );
                return res.status(500).json({
                  status: false,
                  message:
                    "Failed to retrieve CMT Application. Please try again.",
                  token: newToken,
                });
              }

              // Flatten the updated_json object and separate annexure
              let { mainJson, annexureRawJson } =
                flattenJsonWithAnnexure(updated_json);

              // Declare changes outside the conditional block
              const changes = {};
              let logStatus = "create";
              if (
                currentCMTApplication &&
                Object.keys(currentCMTApplication).length > 0
              ) {
                logStatus = "update";
                const compareAndAddChanges = (key, newValue) => {
                  if (currentCMTApplication[key] !== newValue) {
                    changes[key] = {
                      old: currentCMTApplication[key],
                      new: newValue,
                    };
                  }
                };

                // Compare and log changes
                Object.keys(mainJson).forEach((key) =>
                  compareAndAddChanges(key, mainJson[key])
                );
              }

              ClientMasterTrackerModel.generateReport(
                mainJson,
                application_id,
                branch_id,
                customer_id,
                (err, cmtResult) => {
                  if (err) {
                    console.error(
                      "Database error during CMT application update:",
                      err
                    );

                    const logData =
                      currentCMTApplication &&
                        Object.keys(currentCMTApplication).length > 0
                        ? JSON.stringify({ application_id, ...changes }) // changes is defined here
                        : JSON.stringify(mainJson);

                    AdminCommon.adminActivityLog(
                      admin_id,
                      "admin/client-master-tracker",
                      logStatus,
                      "0",
                      logData,
                      err,
                      () => { }
                    );

                    return res.status(500).json({
                      status: false,
                      message: err.message,
                      token: newToken,
                    });
                  }

                  const logDataSuccess =
                    currentCMTApplication &&
                      Object.keys(currentCMTApplication).length > 0
                      ? JSON.stringify({ application_id, ...changes }) // changes is defined here
                      : JSON.stringify(mainJson);

                  AdminCommon.adminActivityLog(
                    admin_id,
                    "admin/client-master-tracker",
                    logStatus,
                    "1",
                    logDataSuccess,
                    err,
                    () => { }
                  );

                  if (typeof annexure === "object" && annexure !== null) {
                    const annexurePromises = [];

                    for (let key in annexure) {
                      const db_table = key ?? null;
                      const modifiedDbTable = db_table.replace(/-/g, "_");
                      const subJson = annexure[modifiedDbTable] ?? null;

                      const annexurePromise = new Promise((resolve, reject) => {
                        ClientMasterTrackerModel.getCMTAnnexureByApplicationId(
                          application_id,
                          modifiedDbTable,
                          (err, currentCMTAnnexure) => {
                            if (err) {
                              console.error(
                                "Database error during CMT Annexure retrieval:",
                                err
                              );
                              return reject(err); // Reject the promise on error
                            }

                            let annexureLogStatus =
                              currentCMTAnnexure &&
                                Object.keys(currentCMTAnnexure).length > 0
                                ? "update"
                                : "create";

                            if (logStatus == "update") {
                              cmt_id = currentCMTApplication.id;
                            } else if (logStatus == "create") {
                              cmt_id = cmtResult.insertId;
                            }

                            ClientMasterTrackerModel.createOrUpdateAnnexure(
                              cmt_id,
                              application_id,
                              branch_id,
                              customer_id,
                              modifiedDbTable,
                              subJson,
                              (err, annexureResult) => {
                                if (err) {
                                  console.error(
                                    "Database error during CMT annexure create or update:",
                                    err
                                  );

                                  const annexureLogData =
                                    currentCMTAnnexure &&
                                      Object.keys(currentCMTAnnexure).length > 0
                                      ? JSON.stringify({
                                        application_id,
                                        ...changes,
                                      })
                                      : JSON.stringify(mainJson);

                                  AdminCommon.adminActivityLog(
                                    admin_id,
                                    "admin/client-master-tracker",
                                    annexureLogStatus,
                                    "0",
                                    annexureLogData,
                                    err,
                                    () => { }
                                  );

                                  return reject(err); // Reject the promise on error
                                }

                                AdminCommon.adminActivityLog(
                                  admin_id,
                                  "admin/client-master-tracker",
                                  annexureLogStatus,
                                  "1",
                                  logDataSuccess,
                                  err,
                                  () => { }
                                );

                                resolve(); // Resolve the promise when successful
                              }
                            );
                          }
                        );
                      });

                      annexurePromises.push(annexurePromise); // Add the promise to the array
                    }

                    // Wait for all annexure operations to complete
                    Promise.all(annexurePromises)
                      .then(() => {
                        BranchCommon.getBranchandCustomerEmailsForNotification(
                          branch_id,
                          (emailError, emailData) => {
                            if (emailError) {
                              console.error(
                                "Error fetching emails:",
                                emailError
                              );
                              return res.status(500).json({
                                status: false,
                                message: "Failed to retrieve email addresses.",
                                token: newToken,
                              });
                            }

                            const { branch, customer } = emailData;
                            const company_name = customer.name;

                            // Prepare recipient and CC lists
                            const toArr = [
                              { name: branch.name, email: branch.email },
                            ];
                            const ccArr = customer.emails
                              .split(",")
                              .map((email) => ({
                                name: customer.name,
                                email: email.trim(),
                              }));

                            ClientMasterTrackerModel.applicationByID(
                              application_id,
                              branch_id,
                              (err, application) => {
                                if (err) {
                                  console.error("Database error:", err);
                                  return res.status(500).json({
                                    status: false,
                                    message: err.message,
                                    token: newToken,
                                  });
                                }

                                if (!application) {
                                  return res.status(404).json({
                                    status: false,
                                    message: "Application not found",
                                    token: newToken,
                                  });
                                }

                                ClientMasterTrackerModel.getAttachmentsByClientAppID(
                                  application_id,
                                  (err, attachments) => {
                                    if (err) {
                                      console.error("Database error:", err);
                                      return res.status(500).json({
                                        status: false,
                                        message: "Database error occurred",
                                        token: newToken,
                                      });
                                    }

                                    ClientApplication.updateStatus(
                                      mainJson.overall_status,
                                      application_id,
                                      async (err, result) => {
                                        if (err) {
                                          console.error(
                                            "Database error during client application status update:",
                                            err
                                          );
                                          return res.status(500).json({
                                            status: false,
                                            message: err.message,
                                            token: newToken,
                                          });
                                        }

                                        App.appInfo(
                                          "backend",
                                          async (err, appInfo) => {
                                            if (err) {
                                              console.error(
                                                "Database error:",
                                                err
                                              );
                                              return res.status(500).json({
                                                status: false,
                                                err,
                                                message: err.message,
                                                token: newToken,
                                              });
                                            }

                                            let imageHost = "www.example.in";

                                            if (appInfo) {
                                              imageHost =
                                                appInfo.cloud_host ||
                                                "www.example.in";
                                            }
                                            if (
                                              !mainJson.overall_status ||
                                              !mainJson.is_verify
                                            ) {
                                              return res.status(200).json({
                                                status: true,
                                                message: `CMT Application ${currentCMTApplication &&
                                                  Object.keys(
                                                    currentCMTApplication
                                                  ).length > 0
                                                  ? "updated"
                                                  : "created"
                                                  } successfully 1.`,
                                                token: newToken,
                                              });
                                            }
                                            const status =
                                              mainJson.overall_status.toLowerCase();
                                            const verified =
                                              mainJson.is_verify.toLowerCase();

                                            const gender =
                                              mainJson.gender?.toLowerCase();
                                            const marital_status =
                                              mainJson.marital_status?.toLowerCase();

                                            let gender_title = "Mr.";

                                            if (gender === "male") {
                                              gender_title = "Mr.";
                                            } else if (gender === "female") {
                                              gender_title =
                                                marital_status === "married"
                                                  ? "Mrs."
                                                  : "Ms.";
                                            }

                                            if (
                                              status === "completed" ||
                                              status === "complete"
                                            ) {
                                              if (verified === "yes") {
                                                if (send_mail == 0) {
                                                  return res.status(200).json({
                                                    status: true,
                                                    message: `CMT Application ${currentCMTApplication &&
                                                      Object.keys(
                                                        currentCMTApplication
                                                      ).length > 0
                                                      ? "updated"
                                                      : "created"
                                                      } successfully 2`,
                                                    email_status: 1,
                                                    token: newToken,
                                                  });
                                                }

                                                const today = new Date();
                                                const formattedDate = `${today.getFullYear()}-${String(
                                                  today.getMonth() + 1
                                                ).padStart(2, "0")}-${String(
                                                  today.getDate()
                                                ).padStart(2, "0")}`;
                                                const pdfTargetDirectory = `uploads/customers/${currentCustomer.client_unique_id}/client-applications/${application.application_id}/final-reports`;
                                                const pdfFileName =
                                                  `${application.name}_${formattedDate}.pdf`
                                                    .replace(/\s+/g, "-")
                                                    .toLowerCase();
                                                const pdfPath =
                                                  await generatePDF(
                                                    application_id,
                                                    branch_id,
                                                    pdfFileName,
                                                    pdfTargetDirectory
                                                  );
                                                attachments +=
                                                  (attachments ? "," : "") +
                                                  `${imageHost}/${pdfPath}`;
                                                // Send email notification
                                                finalReportMail(
                                                  "cmt",
                                                  "final",
                                                  company_name,
                                                  gender_title,
                                                  application.name,
                                                  application.application_id,
                                                  attachments,
                                                  toArr,
                                                  ccArr
                                                )
                                                  .then(() => {
                                                    return res
                                                      .status(200)
                                                      .json({
                                                        status: true,
                                                        message: `CMT Application ${currentCMTApplication &&
                                                          Object.keys(
                                                            currentCMTApplication
                                                          ).length > 0
                                                          ? "updated"
                                                          : "created"
                                                          } successfully and mail sent.`,
                                                        token: newToken,
                                                      });
                                                  })
                                                  .catch((emailError) => {
                                                    console.error(
                                                      "Error sending email:",
                                                      emailError
                                                    );

                                                    return res
                                                      .status(200)
                                                      .json({
                                                        status: true,
                                                        message: `CMT Application ${currentCMTApplication &&
                                                          Object.keys(
                                                            currentCMTApplication
                                                          ).length > 0
                                                          ? "updated"
                                                          : "created"
                                                          } successfully but failed to send mail.`,
                                                        token: newToken,
                                                      });
                                                  });
                                              } else if (verified === "no") {
                                                if (send_mail == 0) {
                                                  return res.status(200).json({
                                                    status: true,
                                                    message: `CMT Application ${currentCMTApplication &&
                                                      Object.keys(
                                                        currentCMTApplication
                                                      ).length > 0
                                                      ? "updated"
                                                      : "created"
                                                      } successfully 3`,
                                                    email_status: 2,
                                                    token: newToken,
                                                  });
                                                }
                                                qcReportCheckMail(
                                                  "cmt",
                                                  "qc",
                                                  gender_title,
                                                  application.name,
                                                  application.application_id,
                                                  attachments,
                                                  toArr,
                                                  ccArr
                                                )
                                                  .then(() => {
                                                    return res
                                                      .status(200)
                                                      .json({
                                                        status: true,
                                                        message: `CMT Application ${currentCMTApplication &&
                                                          Object.keys(
                                                            currentCMTApplication
                                                          ).length > 0
                                                          ? "updated"
                                                          : "created"
                                                          } successfully and mail sent.`,
                                                        token: newToken,
                                                      });
                                                  })
                                                  .catch((emailError) => {
                                                    console.error(
                                                      "Error sending email:",
                                                      emailError
                                                    );

                                                    return res
                                                      .status(200)
                                                      .json({
                                                        status: true,
                                                        message: `CMT Application ${currentCMTApplication &&
                                                          Object.keys(
                                                            currentCMTApplication
                                                          ).length > 0
                                                          ? "updated"
                                                          : "created"
                                                          } successfully but failed to send mail.`,
                                                        token: newToken,
                                                      });
                                                  });
                                              } else {
                                                return res.status(200).json({
                                                  status: true,
                                                  message: `CMT Application ${currentCMTApplication &&
                                                    Object.keys(
                                                      currentCMTApplication
                                                    ).length > 0
                                                    ? "updated"
                                                    : "created"
                                                    } successfully 4.`,
                                                  token: newToken,
                                                });
                                              }
                                            } else {
                                              const completeStatusArr = [
                                                "completed",
                                                "completed_green",
                                                "completed_red",
                                                "completed_yellow",
                                                "completed_pink",
                                                "completed_orange",
                                              ];

                                              let allMatch = false; // Initialize as false

                                              // Loop through the annexure object
                                              for (let key in annexure) {

                                                const db_table = key ?? null;
                                                const modifiedDbTable = db_table.replace(/-/g, "_");
                                                const subJson = annexure[modifiedDbTable] ?? null;

                                                if (subJson) {
                                                  let subJsonMatches = true; // Assume this subJson meets conditions

                                                  for (let prop in subJson) {

                                                    if (
                                                      prop.includes("verification_status") ||
                                                      prop.includes("color_code") ||
                                                      prop.includes("color_status")
                                                    ) {

                                                      const colorStatusValue =
                                                        typeof subJson[prop] === "string"
                                                          ? subJson[prop].toLowerCase()
                                                          : null;

                                                      if (!completeStatusArr.includes(colorStatusValue)) {
                                                        subJsonMatches = false; // If any fails, mark false
                                                        break;
                                                      }
                                                    }
                                                  }

                                                  if (subJsonMatches) {
                                                    allMatch = true;
                                                  }
                                                }
                                              }

                                              // Log the overall result
                                              if (allMatch) {
                                                if (send_mail == 0) {
                                                  return res.status(200).json({
                                                    status: true,
                                                    message: `CMT Application ${currentCMTApplication &&
                                                      Object.keys(
                                                        currentCMTApplication
                                                      ).length > 0
                                                      ? "updated"
                                                      : "created"
                                                      } successfully 5`,
                                                    email_status: 2,
                                                    token: newToken,
                                                  });
                                                }
                                                readyForReport(
                                                  "cmt",
                                                  "ready",
                                                  application.application_id,
                                                  toArr,
                                                  ccArr
                                                )
                                                  .then(() => {
                                                    return res
                                                      .status(200)
                                                      .json({
                                                        status: true,
                                                        message: `CMT Application ${currentCMTApplication &&
                                                          Object.keys(
                                                            currentCMTApplication
                                                          ).length > 0
                                                          ? "updated"
                                                          : "created"
                                                          } successfully and mail sent.`,
                                                        token: newToken,
                                                      });
                                                  })
                                                  .catch((emailError) => {
                                                    console.error(
                                                      "Error sending email:",
                                                      emailError
                                                    );

                                                    return res
                                                      .status(200)
                                                      .json({
                                                        status: true,
                                                        message: `CMT Application ${currentCMTApplication &&
                                                          Object.keys(
                                                            currentCMTApplication
                                                          ).length > 0
                                                          ? "updated"
                                                          : "created"
                                                          } successfully but failed to send mail.`,
                                                        token: newToken,
                                                      });
                                                  });
                                              } else {
                                                return res.status(200).json({
                                                  status: true,
                                                  message: `CMT Application ${currentCMTApplication &&
                                                    Object.keys(
                                                      currentCMTApplication
                                                    ).length > 0
                                                    ? "updated"
                                                    : "created"
                                                    } successfully 6.`,
                                                  token: newToken,
                                                });
                                              }
                                            }
                                          }
                                        );
                                      }
                                    );
                                  }
                                );
                              }
                            );
                          }
                        );
                      })
                      .catch((error) => {
                        return res.status(500).json({
                          status: false,
                          message: error,
                          token: newToken,
                        });
                      });
                  } else {
                    // If there are no annexures, send the response directly
                    return res.status(200).json({
                      status: true,
                      message: `CMT Application ${currentCMTApplication &&
                        Object.keys(currentCMTApplication).length > 0
                        ? "updated"
                        : "created"
                        } successfully 7.`,
                      token: newToken,
                    });
                  }
                }
              );
            }
          );
        });
      });
    });
  });
};

exports.customerBasicInfoWithAdminAuth = (req, res) => {
  const { customer_id, admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !customer_id ||
    customer_id === "" ||
    customer_id === undefined ||
    customer_id === "undefined"
  )
    missingFields.push("Customer ID");
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  )
    missingFields.push("Admin ID");
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  )
    missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.basicInfoByID(customer_id, (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Customer Info fetched successfully",
          customers: result,
          token: newToken,
        });
      });
    });
  });
};

exports.annexureDataByServiceIdofApplication = (req, res) => {
  const { service_id, application_id, admin_id, _token } = req.query;

  let missingFields = [];
  if (
    !service_id ||
    service_id === "" ||
    service_id === undefined ||
    service_id === "undefined"
  ) {
    missingFields.push("Service ID");
  }

  if (
    !application_id ||
    application_id === "" ||
    application_id === undefined ||
    application_id === "undefined"
  ) {
    missingFields.push("Application ID");
  }

  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  ) {
    missingFields.push("Admin ID");
  }
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      ClientMasterTrackerModel.reportFormJsonByServiceID(
        service_id,
        (err, reportFormJson) => {
          if (err) {
            console.error("Error fetching report form JSON:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          if (!reportFormJson) {
            return res.status(404).json({
              status: false,
              message: "Report form JSON not found",
              token: newToken,
            });
          }

          const parsedData = JSON.parse(reportFormJson.json);
          const db_table = parsedData.db_table;
          const heading = parsedData.heading;
          const modifiedDbTable = db_table.replace(/-/g, "_");

          ClientMasterTrackerModel.annexureData(
            application_id,
            modifiedDbTable,
            (err, annexureData) => {
              if (err) {
                console.error("Database error:", err);
                return res.status(500).json({
                  status: false,
                  message: "An error occurred while fetching annexure data.",
                  error: err,
                  token: newToken,
                });
              }

              if (!annexureData) {
                return res.status(404).json({
                  status: false,
                  message: "Annexure Data not found.",
                  token: newToken,
                });
              }

              res.status(200).json({
                status: true,
                message: "Application fetched successfully 5.",
                annexureData,
                heading,
                token: newToken,
              });
            }
          );
        }
      );
    });
  });
};

exports.upload = async (req, res) => {
  // Use multer to handle the upload
  upload(req, res, async (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).json({
        status: false,
        message: "Error uploading file.",
      });
    }

    const {
      admin_id: adminId,
      branch_id: branchId,
      _token: token,
      customer_code: customerCode,
      application_id: appId,
      application_code: appCode,
      db_table: dbTable,
      db_column: dbColumn,
      send_mail: sendMail,
      email_status: emailStatus,
    } = req.body;

    // Validate required fields and collect missing ones
    const requiredFields = {
      adminId,
      branchId,
      token,
      customerCode,
      appCode,
      appId,
      dbTable,
      dbColumn,
    };

    const cleanDBColumn = dbColumn.replace("[", "").replace("]", "");
    // Check for missing fields
    const missingFields = Object.keys(requiredFields)
      .filter(
        (field) =>
          !requiredFields[field] ||
          requiredFields[field] === "" ||
          requiredFields[field] == "undefined" ||
          requiredFields[field] == undefined
      )
      .map((field) => field.replace(/_/g, " "));

    if (missingFields.length > 0) {
      return res.status(400).json({
        status: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (sendMail == 1 && !emailStatus) {
      console.warn("Email status required when sending mail");
      return res.status(400).json({
        status: false,
        message: "The field 'emailStatus' is required when sending an email.",
      });
    }

    const action = "client_master_tracker";
    AdminCommon.isAdminAuthorizedForAction(adminId, action, (result) => {
      if (!result.status) {
        return res.status(403).json({
          status: false,
          message: result.message, // Return the message from the authorization function
        });
      }

      // Verify admin token
      AdminCommon.isAdminTokenValid(token, adminId, async (err, result) => {
        if (err) {
          console.error("Error checking token validity:", err);
          return res.status(500).json({ status: false, message: err.message });
        }

        if (!result.status) {
          return res
            .status(401)
            .json({ status: false, message: result.message });
        }

        const newToken = result.newToken;

        App.appInfo("backend", async (err, appInfo) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({
              status: false,
              err,
              message: err.message,
              token: newToken,
            });
          }

          let imageHost = "www.example.in";

          if (appInfo) {
            imageHost = appInfo.cloud_host || "www.example.in";
          }
          const modifiedDbTable = dbTable.replace(/-/g, "_").toLowerCase();
          const cleanDBColumnForQry = cleanDBColumn
            .replace(/-/g, "_")
            .toLowerCase();
          // Define the target directory for uploads
          const targetDirectory = `uploads/customers/${customerCode}/client-applications/${appCode}/annexures/${modifiedDbTable}`;
          // Create the target directory for uploads
          await fs.promises.mkdir(targetDirectory, { recursive: true });

          let savedImagePaths = [];

          // Check for multiple files under the "images" field
          if (req.files.images && req.files.images.length > 0) {
            const uploadedImages = await saveImages(
              req.files.images,
              targetDirectory
            );
            uploadedImages.forEach((imagePath) => {
              savedImagePaths.push(`${imageHost}/${imagePath}`);
            });
          }

          // Process single file upload
          if (req.files.image && req.files.image.length > 0) {
            const uploadedImage = await saveImage(
              req.files.image[0],
              targetDirectory
            );
            savedImagePaths.push(`${imageHost}${uploadedImage}`);
          }

          // Call the model to upload images
          ClientMasterTrackerModel.upload(
            appId,
            modifiedDbTable,
            cleanDBColumnForQry,
            savedImagePaths,
            (success, result) => {
              if (!success) {
                console.error(
                  "Upload failed:",
                  result || "An error occurred while saving the image."
                );
                return res.status(500).json({
                  status: false,
                  message:
                    result || "An error occurred while saving the image.",
                  token: newToken,
                  savedImagePaths,
                });
              }

              // Handle sending email notifications if required
              if (sendMail == 1) {
                BranchCommon.getBranchandCustomerEmailsForNotification(
                  branchId,
                  (emailError, emailData) => {
                    if (emailError) {
                      console.error("Error fetching emails:", emailError);
                      return res.status(500).json({
                        status: false,
                        message: "Failed to retrieve email addresses.",
                        token: newToken,
                        savedImagePaths,
                      });
                    }

                    const { branch, customer } = emailData;
                    const companyName = customer.name;

                    // Prepare recipient and CC lists
                    const toArr = [{ name: branch.name, email: branch.email }];
                    const ccArr = JSON.parse(customer.emails).map((email) => ({
                      name: customer.name,
                      email: email.trim(),
                    }));

                    ClientMasterTrackerModel.applicationByID(
                      appId,
                      branchId,
                      (err, application) => {
                        if (err) {
                          console.error("Database error:", err);
                          return res.status(500).json({
                            status: false,
                            message: err.message,
                            token: newToken,
                            savedImagePaths,
                          });
                        }

                        if (!application) {
                          console.warn("Application not found");
                          return res.status(404).json({
                            status: false,
                            message: "Application not found",
                            token: newToken,
                            savedImagePaths,
                          });
                        }

                        ClientMasterTrackerModel.getAttachmentsByClientAppID(
                          appId,
                          async (err, attachments) => {
                            if (err) {
                              console.error(
                                "Database error while fetching attachments:",
                                err
                              );
                              return res.status(500).json({
                                status: false,
                                message: "Database error occurred",
                                token: newToken,
                                savedImagePaths,
                              });
                            }

                            const gender = application.gender?.toLowerCase();
                            const maritalStatus =
                              application.marital_status?.toLowerCase();

                            let genderTitle = "Mr.";
                            if (gender === "male") {
                              genderTitle = "Mr.";
                            } else if (gender === "female") {
                              genderTitle =
                                maritalStatus === "married" ? "Mrs." : "Ms.";
                            }
                            const today = new Date();
                            const formattedDate = `${today.getFullYear()}-${String(
                              today.getMonth() + 1
                            ).padStart(2, "0")}-${String(
                              today.getDate()
                            ).padStart(2, "0")}`;
                            const pdfTargetDirectory = `uploads/customers/${customerCode}/client-applications/${application.application_id}/final-reports`;
                            const pdfFileName =
                              `${application.name}_${formattedDate}.pdf`
                                .replace(/\s+/g, "-")
                                .toLowerCase();
                            const pdfPath = await generatePDF(
                              appId,
                              branchId,
                              pdfFileName,
                              pdfTargetDirectory
                            );
                            attachments +=
                              (attachments ? "," : "") +
                              `${imageHost}/${pdfPath}`;
                            // Final report email
                            if (emailStatus == 1) {
                              finalReportMail(
                                "cmt",
                                "final",
                                companyName,
                                genderTitle,
                                application.name,
                                application.application_id,
                                attachments,
                                toArr,
                                ccArr
                              )
                                .then(() => {
                                  return res.status(200).json({
                                    status: true,
                                    message: "CMT Final Report mail sent.",
                                    token: newToken,
                                    savedImagePaths,
                                  });
                                })
                                .catch((emailError) => {
                                  console.error(
                                    "Error sending email for final report:",
                                    emailError
                                  );
                                  return res.status(200).json({
                                    status: true,
                                    message: "Failed to send CMT mail.",
                                    token: newToken,
                                    savedImagePaths,
                                  });
                                });
                            }
                            // QC report email
                            else if (emailStatus == 2) {
                              qcReportCheckMail(
                                "cmt",
                                "qc",
                                genderTitle,
                                application.name,
                                application.application_id,
                                attachments,
                                toArr,
                                ccArr
                              )
                                .then(() => {
                                  return res.status(200).json({
                                    status: true,
                                    message:
                                      "CMT Quality Check Report mail sent.",
                                    token: newToken,
                                    savedImagePaths,
                                  });
                                })
                                .catch((emailError) => {
                                  console.error(
                                    "Error sending email for QC report:",
                                    emailError
                                  );
                                  return res.status(200).json({
                                    status: true,
                                    message: "Failed to send CMT mail.",
                                    token: newToken,
                                    savedImagePaths,
                                  });
                                });
                            }
                            // Handling for other statuses
                            else if (emailStatus == 3) {
                              readyForReport(
                                "cmt",
                                "ready",
                                application.application_id,
                                toArr,
                                ccArr
                              )
                                .then(() => {
                                  return res.status(200).json({
                                    status: true,
                                    message: "Ready for Report mail sent.",
                                    token: newToken,
                                    savedImagePaths,
                                  });
                                })
                                .catch((emailError) => {
                                  console.error(
                                    "Error sending email for report:",
                                    emailError
                                  );
                                  return res.status(200).json({
                                    status: true,
                                    message: "Failed to send CMT mail.",
                                    token: newToken,
                                    savedImagePaths,
                                  });
                                });
                            }
                            // Handle unknown email status
                            else {
                              return res.status(200).json({
                                status: true,
                                message: "Images uploaded successfully.",
                                token: newToken,
                                savedImagePaths,
                              });
                            }
                          }
                        );
                      }
                    );
                  }
                );
              } else {
                return res.status(200).json({
                  status: true,
                  message: "Images uploaded successfully.",
                  token: newToken,
                  savedImagePaths,
                });
              }
            }
          );
        });
      });
    });
  });
};

exports.annexureDataByServiceIds = (req, res) => {
  const { service_ids, report_download, application_id, admin_id, _token } =
    req.query;

  let missingFields = [];
  if (
    !service_ids ||
    service_ids === "" ||
    service_ids === undefined ||
    service_ids === "undefined"
  ) {
    missingFields.push("Service ID");
  }

  if (
    !application_id ||
    application_id === "" ||
    application_id === undefined ||
    application_id === "undefined"
  ) {
    missingFields.push("Application ID");
  }
  if (
    !admin_id ||
    admin_id === "" ||
    admin_id === undefined ||
    admin_id === "undefined"
  ) {
    missingFields.push("Admin ID");
  }
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_master_tracker";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    Admin.fetchAllowedServiceIds(admin_id, async (err, allowedServiceIdsResult) => {
      if (err) {
        console.error("Error retrieving Admin:", err);
        return res.status(500).json({
          status: false,
          message: "Database error.",
          token: newToken,
        });
      }
      const allowedServiceIds = allowedServiceIdsResult.finalServiceIds;
      const addressServicesPermission = allowedServiceIdsResult.addressServicesPermission;

      // Verify admin token
      AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
        if (err) {
          console.error("Error checking token validity:", err);
          return res.status(500).json({ status: false, message: err.message, addressServicesPermission });
        }

        if (!result.status) {
          return res.status(401).json({ status: false, message: result.message, addressServicesPermission });
        }

        const newToken = result.newToken;

        // Split service_id into an array
        const rawServiceIds = service_ids.split(",").map((id) => id.trim());
        // Check if allowedServiceIds is not null
        let serviceIds;
        if (allowedServiceIds && allowedServiceIds.length > 0) {
          // Filter serviceIds based on allowedServiceIds if it's not null
          serviceIds = rawServiceIds.filter(serviceId =>
            allowedServiceIds.includes(Number(serviceId)) // Convert string to number
          );
        } else {
          // If allowedServiceIds is null, just pass serviceIds as raw
          serviceIds = rawServiceIds;
        }

        const annexureResults = [];
        let pendingRequests = serviceIds.length;

        if (pendingRequests === 0) {
          // No service IDs provided, return immediately.
          return res.status(200).json({
            status: true,
            message: "No service IDs to process.",
            results: annexureResults,
            addressServicesPermission,
            token: newToken,
          });
        }

        serviceIds.forEach((id) => {
          ClientMasterTrackerModel.reportFormJsonByServiceID(
            id,
            (err, reportFormJson) => {
              if (err) {
                console.error(
                  `Error fetching report form JSON for service ID ${id}:`,
                  err
                );
                annexureResults.push({
                  service_id: id,
                  serviceStatus: false,
                  message: err.message,
                });
                finalizeRequest();
                return;
              }

              if (!reportFormJson) {
                console.warn(`Report form JSON not found for service ID ${id}`);
                annexureResults.push({
                  service_id: id,
                  serviceStatus: false,
                  message: "Report form JSON not found",
                });
                finalizeRequest();
                return;
              }

              const excel_sorting = reportFormJson.excel_sorting;
              const parsedData = JSON.parse(reportFormJson.json);
              const db_table = parsedData.db_table.replace(/-/g, "_"); // Modify table name
              const heading = parsedData.heading;

              ClientMasterTrackerModel.annexureData(
                application_id,
                db_table,
                (err, annexureData) => {
                  if (err) {
                    console.error(
                      `Error fetching annexure data for service ID ${id}:`,
                      err
                    );
                    annexureResults.push({
                      service_id: id,
                      annexureStatus: false,
                      excel_sorting,
                      annexureData: null,
                      serviceStatus: true,
                      reportFormJson,
                      message: "An error occurred while fetching annexure data.",
                      error: err,
                    });
                  } else if (!annexureData) {
                    console.warn(`Annexure data not found for service ID ${id}`);
                    annexureResults.push({
                      service_id: id,
                      annexureStatus: false,
                      excel_sorting,
                      annexureData: null,
                      serviceStatus: true,
                      reportFormJson,
                      message: "Annexure Data not found.",
                    });
                  } else {
                    annexureResults.push({
                      service_id: id,
                      annexureStatus: true,
                      excel_sorting,
                      serviceStatus: true,
                      reportFormJson,
                      annexureData,
                      heading,
                    });
                  }
                  finalizeRequest();
                }
              );
            }
          );
        });

        function finalizeRequest() {
          pendingRequests -= 1;
          if (pendingRequests === 0) {
            if (report_download == 1 || report_download == "1") {
              ClientMasterTrackerModel.updateReportDownloadStatus(
                application_id,
                (err) => {
                  if (err) {
                    return res.status(500).json({
                      message: "Error updating report download status",
                      error: err,
                      token: newToken,
                    });
                  }

                  return res.status(200).json({
                    status: true,
                    message: "Applications fetched successfully.",
                    results: annexureResults,
                    addressServicesPermission,
                    token: newToken,
                  });
                }
              );
            } else {
              return res.status(200).json({
                status: true,
                message: "Applications fetched successfully.",
                results: annexureResults,
                addressServicesPermission,
                token: newToken,
              });
            }
          }
        }
      });
    });
  });
};
