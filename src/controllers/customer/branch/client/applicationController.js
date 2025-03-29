const ClientApplication = require("../../../../models/customer/branch/clientApplicationModel");
const BranchCommon = require("../../../../models/customer/branch/commonModel");
const Branch = require("../../../../models/customer/branch/branchModel");
const Service = require("../../../../models/admin/serviceModel");
const Customer = require("../../../../models/customer/customerModel");
const AppModel = require("../../../../models/appModel");
const Admin = require("../../../../models/admin/adminModel");
const Candidate = require("../../../../models/customer/branch/candidateApplicationModel");

const {
  createMail,
} = require("../../../../mailer/customer/branch/client/createMail");

const {
  createMailForSpoc,
} = require("../../../../mailer/customer/branch/client/createMailForSpoc");

const {
  bulkCreateMail,
} = require("../../../../mailer/customer/branch/client/bulkCreateMail");

const fs = require("fs");
const path = require("path");
const {
  upload,
  saveImage,
  saveImages,
} = require("../../../../utils/cloudImageSave");
const candidateApplication = require("../../../../models/customer/branch/candidateApplicationModel");

exports.convertToClient = (req, res) => {
  const {
    branch_id,
    sub_user_id,
    _token,
    customer_id,
    candidate_application_id,
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    _token,
    customer_id,
    candidate_application_id,
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

  const action = "client_application";
  // Check branch authorization
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    // Validate branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (err, result) => {
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

        // Fetch the current candidateApplication
        Candidate.getCandidateApplicationById(
          candidate_application_id,
          (err, currentCandidateApplication) => {
            if (err) {
              console.error(
                "Database error during candidateApplication retrieval:",
                err
              );
              return res.status(500).json({
                status: false,
                message: "Failed to retrieve Candidate. Please try again.",
                token: newToken,
              });
            }

            if (!currentCandidateApplication) {
              return res.status(404).json({
                status: false,
                message: "Candidate Aplication not found.",
                token: newToken,
              });
            }

            if ((parseInt(currentCandidateApplication.customer_id) !== parseInt(customer_id)) || parseInt(currentCandidateApplication.branch_id) !== parseInt(branch_id)) {
              return res.status(403).json({
                status: false,
                message: "Unauthorized access: You do not have permission to view this application.",
              });
            }

            // Check if employee ID is unique
            Candidate.getAttachmentsOfCandidateApplicationByID(
              candidate_application_id, branch_id,
              (err, attachmentResult) => {
                if (err) {
                  console.error(
                    "Database error during candidateApplication retrieval:",
                    err
                  );
                  return res.status(500).json({
                    status: false,
                    message: "Failed to retrieve Candidate. Please try again.",
                    token: newToken,
                  });
                }

                const extractUrls = (data) => {

                  if (!data || typeof data !== "object") {
                    return "";
                  }

                  let urls = [];

                  // Function to recursively extract URLs
                  const findUrls = (obj, level = 0) => {

                    if (Array.isArray(obj)) {
                      obj.forEach((item, index) => {
                        findUrls(item, level + 1);
                      });
                    } else if (typeof obj === "object" && obj !== null) {
                      Object.values(obj).forEach((value, index) => {
                        findUrls(value, level + 1);
                      });
                    } else if (typeof obj === "string" && obj.trim() !== "") {
                      const splitUrls = obj.split(/\s*,\s*/);
                      urls.push(...splitUrls);
                    }
                  };

                  // Start recursive extraction
                  findUrls(data);

                  return urls.length ? urls.join(", ") : "";
                };

                const finalUrls = extractUrls(attachmentResult?.service_data ?? {});

                // Create client application
                ClientApplication.create(
                  {
                    name: currentCandidateApplication.name,
                    employee_id: currentCandidateApplication.employee_id || null,
                    spoc: null,
                    batch_number: null,
                    sub_client: null,
                    location: null,
                    branch_id,
                    services: currentCandidateApplication.services,
                    packages: currentCandidateApplication.package,
                    customer_id,
                    purpose_of_application: currentCandidateApplication.purpose_of_application,
                    nationality: currentCandidateApplication.nationality,
                    attach_documents: finalUrls || null,
                  },
                  (err, result) => {
                    if (err) {
                      console.error(
                        "Database error during client application creation:",
                        err
                      );
                      BranchCommon.branchActivityLog(
                        branch_id,
                        "Client Application",
                        "Create",
                        "0",
                        null,
                        err,
                        () => { }
                      );
                      return res.status(500).json({
                        status: false,
                        message:
                          "Failed to create client application. Please try again.",
                        token: newToken,
                        err,
                      });
                    }

                    BranchCommon.branchActivityLog(
                      branch_id,
                      "Client Application",
                      "Create",
                      "1",
                      `{id: ${result.results.insertId}}`,
                      null,
                      () => { }
                    );

                    let newAttachedDocsString = finalUrls || '';

                    Branch.getClientUniqueIDByBranchId(
                      branch_id,
                      (err, clientCode) => {
                        if (err) {
                          console.error("Error checking unique ID:", err);
                          return res.status(500).json({
                            status: false,
                            message: err.message,
                            token: newToken,
                          });
                        }

                        // Check if the unique ID exists
                        if (!clientCode) {
                          return res.status(400).json({
                            status: false,
                            message: `Customer Unique ID not Found`,
                            token: newToken,
                          });
                        }

                        Branch.getClientNameByBranchId(
                          branch_id,
                          (err, clientName) => {
                            if (err) {
                              console.error("Error checking client name:", err);
                              return res.status(500).json({
                                status: false,
                                message: err.message,
                                token: newToken,
                              });
                            }

                            // Check if the client name exists
                            if (!clientName) {
                              return res.status(400).json({
                                status: false,
                                message: "Customer Unique ID not found",
                                token: newToken,
                              });
                            }

                            const serviceIds =
                              typeof currentCandidateApplication.services === "string" && currentCandidateApplication.services.trim() !== ""
                                ? currentCandidateApplication.services.split(",").map((id) => id.trim())
                                : currentCandidateApplication.services;

                            const serviceNames = [];

                            // Function to fetch service names
                            const fetchServiceNames = (index = 0) => {
                              if (index >= serviceIds.length) {
                                AppModel.appInfo(
                                  "frontend",
                                  async (err, appInfo) => {
                                    if (err) {
                                      console.error("Database error:", err);
                                      return res.status(500).json({
                                        status: false,
                                        message:
                                          "An error occurred while retrieving application information. Please try again.",
                                      });
                                    }

                                    if (!appInfo) {
                                      console.error(
                                        "Database error during app info retrieval:",
                                        err
                                      );
                                      return reject(
                                        new Error(
                                          "Information of the application not found."
                                        )
                                      );
                                    }

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
                                            message:
                                              "Failed to retrieve email addresses.",
                                            token: newToken,
                                          });
                                        }

                                        const { branch, customer } = emailData;
                                        Admin.list((err, adminResult) => {
                                          if (err) {
                                            console.error("Database error:", err);
                                            return res.status(500).json({
                                              status: false,
                                              message:
                                                "Error retrieving admin details.",
                                              token: newToken,
                                            });
                                          }

                                          // Extract admin emails into adminList
                                          const adminList = adminResult.map(
                                            (admin) => ({
                                              name: admin.name,
                                              email: admin.email,
                                            })
                                          );
                                          const toArr = [
                                            { name: branch.name, email: branch.email },
                                          ];
                                          const ccArr1 = customer.emails
                                            .split(",")
                                            .map((email) => ({
                                              name: customer.name,
                                              email: email.trim(),
                                            }));

                                          const ccArr = [
                                            ...ccArr1,
                                            ...adminList.map((admin) => ({
                                              name: admin.name,
                                              email: admin.email,
                                            })),
                                          ];
                                          const appHost =
                                            appInfo.host || "www.example.com";
                                          const appName =
                                            appInfo.name || "Example Company";
                                          // Once all services have been processed, send email notification
                                          createMail(
                                            "client application",
                                            "create",
                                            currentCandidateApplication.name,
                                            result.new_application_id,
                                            clientName,
                                            clientCode,
                                            serviceNames,
                                            newAttachedDocsString,
                                            appHost,
                                            toArr,
                                            ccArr
                                          )
                                            .then(() => {
                                              candidateApplication.updateConvertClientStatus(
                                                candidate_application_id,
                                                (err, result) => {
                                                  if (err) {
                                                    console.error("Error updating submit status:", err);
                                                    return res.status(500).json({
                                                      status: false,
                                                      message:
                                                        "Client application created successfully and email sent but status not updated.",
                                                    });
                                                  }
                                                  return res.status(201).json({
                                                    status: true,
                                                    message:
                                                      "Client application created successfully and email sent.",
                                                    token: newToken,
                                                  });
                                                }
                                              );
                                            })
                                            .catch((emailError) => {
                                              console.error(
                                                "Error sending email:",
                                                emailError
                                              );
                                              return res.status(201).json({
                                                status: true,
                                                message:
                                                  "Client application created successfully, but failed to send email.",
                                                client: result,
                                                token: newToken,
                                              });
                                            });
                                        });
                                      }
                                    );
                                  }
                                );
                                return;
                              }

                              const id = serviceIds[index];

                              Service.getServiceById(id, (err, currentService) => {
                                if (err) {
                                  console.error(
                                    "Error fetching service data:",
                                    err
                                  );
                                  return res.status(500).json({
                                    status: false,
                                    message: err.message,
                                    token: newToken,
                                  });
                                }

                                // Skip invalid services and continue to the next index
                                if (!currentService || !currentService.title) {
                                  return fetchServiceNames(index + 1);
                                }

                                // Add the current service name to the array
                                serviceNames.push(currentService.title);

                                // Recursively fetch the next service
                                fetchServiceNames(index + 1);
                              });
                            };

                            // Start fetching service names
                            fetchServiceNames();
                          }
                        );
                      }
                    );
                  }
                );
              });
          });
      }
    );
  });
};

exports.create = (req, res) => {
  const {
    branch_id,
    sub_user_id,
    _token,
    customer_id,
    name,
    employee_id,
    spoc,
    location,
    batch_number,
    sub_client,
    services,
    package,
    send_mail,
    purpose_of_application,
    nationality
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    _token,
    customer_id,
    name,
    nationality
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

  const action = "client_application";
  // Check branch authorization
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    // Validate branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (err, result) => {
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

        // Check if employee ID is unique
        ClientApplication.checkUniqueEmpId(
          branch_id,
          employee_id,
          (err, exists) => {
            if (err) {
              console.error("Error checking unique ID:", err);
              return res
                .status(500)
                .json({ status: false, message: err.message, token: newToken });
            }

            if (exists) {
              return res.status(400).json({
                status: false,
                message: `Client Employee ID '${employee_id}' already exists.`,
                token: newToken,
              });
            }

            // Create client application
            ClientApplication.create(
              {
                name,
                employee_id,
                spoc,
                batch_number,
                sub_client,
                location,
                branch_id,
                services,
                packages: package,
                customer_id,
                purpose_of_application,
                nationality,
              },
              (err, result) => {
                if (err) {
                  console.error(
                    "Database error during client application creation:",
                    err
                  );
                  BranchCommon.branchActivityLog(
                    branch_id,
                    "Client Application",
                    "Create",
                    "0",
                    null,
                    err,
                    () => { }
                  );
                  return res.status(500).json({
                    status: false,
                    message:
                      "Failed to create client application. Please try again.",
                    token: newToken,
                    err,
                  });
                }

                BranchCommon.branchActivityLog(
                  branch_id,
                  "Client Application",
                  "Create",
                  "1",
                  `{id: ${result.results.insertId}}`,
                  null,
                  () => { }
                );

                if (send_mail == 0) {
                  return res.status(201).json({
                    status: true,
                    message: "Client application created successfully.",
                    token: newToken,
                    result,
                  });
                }
                let newAttachedDocsString = "";

                Branch.getClientUniqueIDByBranchId(
                  branch_id,
                  (err, clientCode) => {
                    if (err) {
                      console.error("Error checking unique ID:", err);
                      return res.status(500).json({
                        status: false,
                        message: err.message,
                        token: newToken,
                      });
                    }

                    // Check if the unique ID exists
                    if (!clientCode) {
                      return res.status(400).json({
                        status: false,
                        message: `Customer Unique ID not Found`,
                        token: newToken,
                      });
                    }

                    Branch.getClientNameByBranchId(
                      branch_id,
                      (err, clientName) => {
                        if (err) {
                          console.error("Error checking client name:", err);
                          return res.status(500).json({
                            status: false,
                            message: err.message,
                            token: newToken,
                          });
                        }

                        // Check if the client name exists
                        if (!clientName) {
                          return res.status(400).json({
                            status: false,
                            message: "Customer Unique ID not found",
                            token: newToken,
                          });
                        }

                        const serviceIds =
                          typeof services === "string" && services.trim() !== ""
                            ? services.split(",").map((id) => id.trim())
                            : services;

                        const serviceNames = [];

                        // Function to fetch service names
                        const fetchServiceNames = (index = 0) => {
                          if (index >= serviceIds.length) {
                            AppModel.appInfo(
                              "frontend",
                              async (err, appInfo) => {
                                if (err) {
                                  console.error("Database error:", err);
                                  return res.status(500).json({
                                    status: false,
                                    message:
                                      "An error occurred while retrieving application information. Please try again.",
                                  });
                                }

                                if (!appInfo) {
                                  console.error(
                                    "Database error during app info retrieval:",
                                    err
                                  );
                                  return reject(
                                    new Error(
                                      "Information of the application not found."
                                    )
                                  );
                                }

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
                                        message:
                                          "Failed to retrieve email addresses.",
                                        token: newToken,
                                      });
                                    }

                                    const { branch, customer } = emailData;
                                    Admin.list((err, adminResult) => {
                                      if (err) {
                                        console.error("Database error:", err);
                                        return res.status(500).json({
                                          status: false,
                                          message:
                                            "Error retrieving admin details.",
                                          token: newToken,
                                        });
                                      }

                                      // Extract admin emails into adminList
                                      const adminList = adminResult.map(
                                        (admin) => ({
                                          name: admin.name,
                                          email: admin.email,
                                        })
                                      );
                                      const toArr = [
                                        { name: branch.name, email: branch.email },
                                      ];
                                      const ccArr1 = customer.emails
                                        .split(",")
                                        .map((email) => ({
                                          name: customer.name,
                                          email: email.trim(),
                                        }));

                                      const ccArr = [
                                        ...ccArr1,
                                        ...adminList.map((admin) => ({
                                          name: admin.name,
                                          email: admin.email,
                                        })),
                                      ];
                                      const appHost =
                                        appInfo.host || "www.example.com";
                                      const appName =
                                        appInfo.name || "Example Company";
                                      // Once all services have been processed, send email notification
                                      createMail(
                                        "client application",
                                        "create",
                                        name,
                                        result.new_application_id,
                                        clientName,
                                        clientCode,
                                        serviceNames,
                                        newAttachedDocsString,
                                        appHost,
                                        toArr,
                                        ccArr
                                      )
                                        .then(() => {
                                          return res.status(201).json({
                                            status: true,
                                            message:
                                              "Client application created successfully and email sent.",
                                            token: newToken,
                                          });
                                        })
                                        .catch((emailError) => {
                                          console.error(
                                            "Error sending email:",
                                            emailError
                                          );
                                          return res.status(201).json({
                                            status: true,
                                            message:
                                              "Client application created successfully, but failed to send email.",
                                            client: result,
                                            token: newToken,
                                          });
                                        });
                                    });
                                  }
                                );
                              }
                            );
                            return;
                          }

                          const id = serviceIds[index];

                          Service.getServiceById(id, (err, currentService) => {
                            if (err) {
                              console.error(
                                "Error fetching service data:",
                                err
                              );
                              return res.status(500).json({
                                status: false,
                                message: err.message,
                                token: newToken,
                              });
                            }

                            // Skip invalid services and continue to the next index
                            if (!currentService || !currentService.title) {
                              return fetchServiceNames(index + 1);
                            }

                            // Add the current service name to the array
                            serviceNames.push(currentService.title);

                            // Recursively fetch the next service
                            fetchServiceNames(index + 1);
                          });
                        };

                        // Start fetching service names
                        fetchServiceNames();
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
  });
};

exports.bulkCreate = (req, res) => {
  const {
    sub_user_id,
    branch_id,
    _token,
    customer_id,
    applications,
    services,
    package,
  } = req.body;

  // Define required fields
  const requiredFields = { branch_id, _token, customer_id, applications };

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

  const action = "client_application";
  // Check branch authorization
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }
    // Validate branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (err, result) => {
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

        // Get SPoC ID
        Customer.getFirstSpoc(customer_id, (err, spocId) => {
          if (err) {
            console.error("Error checking SPoC:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message });
          }

          if (!spocId) {
            spocId = null;
            console.warn(
              `No Client SPOC found for customer_id - ${customer_id}`
            );
          }

          const emptyValues = [];
          const updatedApplications = applications.filter((app) => {
            // Check if all specified fields are empty
            const allFieldsEmpty =
              !app.applicant_full_name?.trim() &&
              !app.employee_id?.trim() &&
              !app.location?.trim() &&
              !app.spoc?.trim() &&
              !app.batch_number?.trim() &&
              !app.sub_client?.trim();

            // If all fields are empty, exclude this application
            if (allFieldsEmpty) {
              return false;
            }

            // Check if any of the required fields are missing and track missing fields
            const missingFields = [];
            if (!("applicant_full_name" in app))
              missingFields.push("Applicant Full Name");
            if (!("employee_id" in app)) missingFields.push("Employee ID");
            if (!("location" in app)) missingFields.push("Location");
            if (!("spoc" in app)) missingFields.push("SPOC");
            if (!("batch_number" in app)) missingFields.push("Batch Number");
            if (!("sub_client" in app)) missingFields.push("Sub Client");

            if (missingFields.length > 0) {
              emptyValues.push(
                `${app.applicant_full_name || "Unnamed applicant"
                } (missing fields: ${missingFields.join(", ")})`
              );
              return false; // Exclude applications with missing fields
            }

            // Check if any of the fields are empty and track those applicants
            const emptyFields = [];
            if (!app.applicant_full_name?.trim())
              emptyFields.push("Applicant Full Name");
            if (!app.employee_id?.trim()) emptyFields.push("Employee ID");
            if (!app.location?.trim()) emptyFields.push("Location");
            if (!app.spoc?.trim()) emptyFields.push("SPOC");
            if (!app.batch_number?.trim()) emptyFields.push("Batch Number");
            if (!app.sub_client?.trim()) emptyFields.push("Sub Client");

            if (emptyFields.length > 0) {
              emptyValues.push(
                `${app.applicant_full_name || "Unnamed applicant"
                } (empty fields: ${emptyFields.join(", ")})`
              );
            }

            // Include the application if it has at least one non-empty field
            return true;
          });

          if (emptyValues.length > 0) {
            return res.status(400).json({
              status: false,
              message: `Details are not complete for the following applicants: ${emptyValues.join(
                ", "
              )}`,
            });
          }

          // Check for duplicate employee IDs
          const employeeIds = updatedApplications.map((app) => app.employee_id);

          const employeeIdChecks = employeeIds.map((employee_id) => {
            return new Promise((resolve, reject) => {
              ClientApplication.checkUniqueEmpId(
                branch_id,
                employee_id,
                (err, exists) => {
                  if (err) {
                    reject(err);
                  } else if (exists) {
                    reject(`Employee ID '${employee_id}' already exists.`);
                  } else {
                    resolve(employee_id); // Pass the unique employee ID to the resolve
                  }
                }
              );
            });
          });

          // Handle employee ID uniqueness checks
          Promise.allSettled(employeeIdChecks)
            .then((results) => {
              // Collect the employee IDs that are already used
              const alreadyUsedEmpIds = results
                .filter((result) => result.status === "rejected")
                .map((result) => result.reason);

              if (alreadyUsedEmpIds.length > 0) {
                return res.status(400).json({
                  status: false,
                  message: `Employee IDs already used: ${alreadyUsedEmpIds.join(
                    ", "
                  )}`,
                  token: newToken,
                });
              }

              // Proceed with creating client applications if all IDs are unique
              const applicationPromises = updatedApplications.map((app) => {
                return new Promise((resolve, reject) => {
                  ClientApplication.create(
                    {
                      name: app.applicant_full_name,
                      employee_id: app.employee_id,
                      location: app.location,
                      spoc: app.spoc,
                      batch_number: app.batch_number,
                      sub_client: app.sub_client,
                      branch_id,
                      services,
                      packages: package,
                      customer_id,
                    },
                    (err, result) => {
                      if (err) {
                        reject({
                          status: false,
                          message: err.message,
                          token: newToken,
                        });
                      } else {
                        // Log the activity
                        BranchCommon.branchActivityLog(
                          branch_id,
                          "Client Application",
                          "Create",
                          "1",
                          `{id: ${result.insertId}}`,
                          null,
                          () => { }
                        );

                        // Assign the new application ID to the corresponding app object
                        app.new_application_id = result.new_application_id;

                        // Resolve the promise once the app is successfully created
                        resolve(app);
                      }
                    }
                  );
                });
              });

              Promise.all(applicationPromises)
                .then(() => {
                  // Send notification emails once all applications are created
                  sendNotificationEmails(
                    branch_id,
                    customer_id,
                    services,
                    updatedApplications,
                    newToken,
                    res
                  );
                })
                .catch((error) => {
                  // Handle error if any application creation fails
                  console.error(
                    "Error during client application creation:",
                    error
                  );
                  return res.status(400).json({
                    status: false,
                    message:
                      error.message ||
                      "Failed to create one or more client applications.",
                    token: newToken,
                  });
                });

              sendNotificationEmails(
                branch_id,
                customer_id,
                services,
                updatedApplications,
                newToken,
                res
              );
            })
            .catch((error) => {
              return res.status(400).json({
                status: false,
                message: error,
                token: newToken,
              });
            });
        });
      }
    );
  });
};

// Function to send email notifications
function sendNotificationEmails(
  branch_id,
  customer_id,
  services,
  updatedApplications,
  newToken,
  res
) {
  Branch.getClientUniqueIDByBranchId(branch_id, (err, clientCode) => {
    if (err) {
      console.error("Error checking unique ID:", err);
      return res.status(500).json({
        status: false,
        message: err.message,
        token: newToken,
      });
    }

    if (!clientCode) {
      return res.status(400).json({
        status: false,
        message: "Customer Unique ID not Found",
        token: newToken,
      });
    }

    Branch.getClientNameByBranchId(branch_id, (err, clientName) => {
      if (err) {
        console.error("Error checking client name:", err);
        return res.status(500).json({
          status: false,
          message: err.message,
          token: newToken,
        });
      }

      if (!clientName) {
        return res.status(400).json({
          status: false,
          message: "Customer Unique ID not found",
          token: newToken,
        });
      }

      Admin.list((err, adminResult) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message:
              "Error retrieving admin details.",
            token: newToken,
          });
        }

        // Extract admin emails into adminList
        const adminList = adminResult.map(
          (admin) => ({
            name: admin.name,
            email: admin.email,
          })
        );
        // Fetch emails for notification
        BranchCommon.getBranchandCustomerEmailsForNotification(
          branch_id,
          (emailError, emailData) => {
            if (emailError) {
              console.error("Error fetching emails:", emailError);
              return res.status(500).json({
                status: false,
                message: "Failed to retrieve email addresses.",
                token: newToken,
              });
            }

            const { branch, customer } = emailData;
            const toArr = [{ name: branch.name, email: branch.email }];

            const ccArr1 = customer.emails
              .split(",")
              .map((email) => ({
                name: customer.name,
                email: email.trim(),
              }));

            const ccArr = [
              ...ccArr1,
              ...adminList.map((admin) => ({
                name: admin.name,
                email: admin.email,
              })),
            ];

            const serviceIds =
              typeof services === "string" && services.trim() !== ""
                ? services.split(",").map((id) => id.trim())
                : [];
            const serviceNames = [];

            const fetchServiceNames = (index = 0) => {
              let responseSent = false; // Flag to track if the response has already been sent

              if (index >= serviceIds.length) {
                AppModel.appInfo("frontend", async (err, appInfo) => {
                  if (err) {
                    console.error("Database error:", err);
                    return res.status(500).json({
                      status: false,
                      message:
                        "An error occurred while retrieving application information. Please try again.",
                    });
                  }

                  if (!appInfo) {
                    console.error(
                      "Database error during app info retrieval:",
                      err
                    );
                    return reject(
                      new Error("Information of the application not found.")
                    );
                  }
                  const appHost = appInfo.host || "www.example.com";
                  const appName = appInfo.name || "Example Company";
                  bulkCreateMail(
                    "client application",
                    "bulk-create",
                    updatedApplications,
                    branch.name,
                    customer.name,
                    serviceNames,
                    "",
                    appHost,
                    toArr,
                    ccArr
                  )
                    .then(() => {
                      if (!responseSent) {
                        responseSent = true; // Mark the response as sent
                        return res.status(201).json({
                          status: true,
                          message:
                            "Client application created successfully and email sent.",
                          token: newToken,
                        });
                      }
                    })
                    .catch((emailError) => {
                      if (!responseSent) {
                        console.error(
                          "Error sending email (controller):",
                          emailError
                        );
                        responseSent = true; // Mark the response as sent
                        return res.status(201).json({
                          status: true,
                          message:
                            "Client application created successfully, but failed to send email.",
                          token: newToken,
                        });
                      }
                    });
                  return;
                });
              }

              const id = serviceIds[index];

              Service.getServiceById(id, (err, currentService) => {
                if (err) {
                  console.error("Error fetching service data:", err);
                  if (!responseSent) {
                    responseSent = true; // Mark the response as sent
                    return res.status(500).json({
                      status: false,
                      message: err.message,
                      token: newToken,
                    });
                  }
                }

                if (!currentService || !currentService.title) {
                  return fetchServiceNames(index + 1);
                }

                serviceNames.push(currentService.title);
                fetchServiceNames(index + 1);
              });
            };

            fetchServiceNames();
          }
        );
      });
    });
  });
}

// Controller to list all clientApplications
exports.list = (req, res) => {
  const { branch_id, sub_user_id, _token, customer_id } = req.query;
  let missingFields = [];
  if (!branch_id) missingFields.push("Branch ID");
  if (!_token) missingFields.push("Token");
  if (!customer_id) missingFields.push("Customer ID");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_application";

  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (err, tokenResult) => {
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

        const dataPromises = [
          new Promise((resolve) =>
            ClientApplication.list(branch_id, (err, result) => {
              if (err) {
                console.error("Error fetching client applications:", err);
                return resolve([]);
              }
              resolve(result);
            })
          ),
          new Promise((resolve) =>
            Customer.basicInfoByID(customer_id, (err, result) => {
              if (err) {
                console.error("Error fetching customer info:", err);
                return resolve([]);
              }
              resolve(result);
            })
          ),
        ];

        Promise.all(dataPromises).then(([clientApplications, customerInfo]) => {
          res.json({
            status: true,
            message: "Client applications fetched successfully.",
            data: {
              clientApplications,
              customerInfo,
            },
            totalResults: {
              clientApplications: clientApplications.length,
            },
            token: newToken,
          });
        });
      }
    );
  });
};

exports.update = (req, res) => {
  const {
    branch_id,
    sub_user_id,
    _token,
    client_application_id,
    name,
    employee_id,
    spoc,
    batch_number,
    sub_client,
    location,
    services,
    package,
    purpose_of_application,
    nationality,
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    _token,
    client_application_id,
    name,
    nationality,
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

  const action = "client_application";
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (err, result) => {
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

            const changes = {};
            if (currentClientApplication.name !== name) {
              changes.name = { old: currentClientApplication.name, new: name };
            }
            if (currentClientApplication.employee_id !== employee_id) {
              changes.employee_id = {
                old: currentClientApplication.employee_id,
                new: employee_id,
              };
            }
            if (currentClientApplication.spoc !== spoc) {
              changes.spoc = {
                old: currentClientApplication.spoc,
                new: spoc,
              };
            }
            if (currentClientApplication.location !== location) {
              changes.location = {
                old: currentClientApplication.location,
                new: location,
              };
            }
            if (
              services !== "" &&
              currentClientApplication.services !== services
            ) {
              changes.services = {
                old: currentClientApplication.services,
                new: services,
              };
            }
            if (
              package !== "" &&
              currentClientApplication.package !== package
            ) {
              changes.package = {
                old: currentClientApplication.package,
                new: package,
              };
            }

            if (
              batch_number !== "" &&
              currentClientApplication.batch_number !== batch_number
            ) {
              changes.batch_number = {
                old: currentClientApplication.batch_number,
                new: batch_number,
              };
            }

            if (
              sub_client !== "" &&
              currentClientApplication.sub_client !== sub_client
            ) {
              changes.sub_client = {
                old: currentClientApplication.sub_client,
                new: sub_client,
              };
            }

            // Check if employee ID is unique
            ClientApplication.checkUniqueEmpIdByClientApplicationID(
              branch_id,
              employee_id,
              client_application_id,
              (err, exists) => {
                if (err) {
                  console.error("Error checking unique ID:", err);
                  return res.status(500).json({
                    status: false,
                    message: err.message,
                    token: newToken,
                  });
                }

                if (exists) {
                  return res.status(400).json({
                    status: false,
                    message: `Client Employee ID '${employee_id}' already exists.`,
                    token: newToken,
                  });
                }

                ClientApplication.update(
                  {
                    name,
                    employee_id,
                    client_spoc: spoc,
                    batch_number,
                    sub_client,
                    location,
                    services,
                    packages: package,
                    purpose_of_application,
                    nationality,
                  },
                  client_application_id,
                  (err, result) => {
                    if (err) {
                      console.error(
                        "Database error during client application update:",
                        err
                      );
                      BranchCommon.branchActivityLog(
                        branch_id,
                        "Client Application",
                        "Update",
                        "0",
                        JSON.stringify({ client_application_id, ...changes }),
                        err,
                        () => { }
                      );
                      return res.status(500).json({
                        status: false,
                        message: err.message,
                        token: newToken,
                      });
                    }

                    BranchCommon.branchActivityLog(
                      branch_id,
                      "Client Application",
                      "Update",
                      "1",
                      JSON.stringify({ client_application_id, ...changes }),
                      null,
                      () => { }
                    );

                    res.status(200).json({
                      status: true,
                      message: "Client application updated successfully.",
                      result,
                      token: newToken,
                    });
                  }
                );
              }
            );
          }
        );
      }
    );
  });
};

exports.upload = async (req, res) => {
  // Use multer to handle the upload
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        status: false,
        message: "Error uploading file.",
      });
    }

    const {
      branch_id: branchId,
      sub_user_id,
      _token: token,
      customer_code: customerCode,
      client_application_id: clientAppId,
      upload_category: uploadCat,
      send_mail,
      services,
      client_application_name,
      client_application_generated_id,
    } = req.body;

    // Validate required fields and collect missing ones
    const requiredFields = {
      branchId,
      token,
      customerCode,
      clientAppId,
      uploadCat,
    };

    if (send_mail == 1) {
      requiredFields.services = services;
      requiredFields.client_application_name = client_application_name;
      requiredFields.client_application_generated_id =
        client_application_generated_id;
    }

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

    const action = "client_application";
    BranchCommon.isBranchAuthorizedForAction(branchId, action, (result) => {
      if (!result.status) {
        return res.status(403).json({
          status: false,
          message: result.message,
        });
      }

      BranchCommon.isBranchTokenValid(
        token,
        sub_user_id || null,
        branchId,
        async (err, result) => {
          if (err) {
            console.error("Error checking token validity:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message });
          }

          if (!result.status) {
            return res
              .status(401)
              .json({ status: false, message: result.message });
          }

          const newToken = result.newToken;
          ClientApplication.getClientApplicationById(
            clientAppId,
            async (err, currentClientApplication) => {
              if (err) {
                console.error(
                  "Database error during clientApplication retrieval:",
                  err
                );
                return res.status(500).json({
                  status: false,
                  message:
                    "Failed to retrieve ClientApplication. Please try again.",
                  token: newToken
                });
              }

              if (!currentClientApplication) {
                return res.status(404).json({
                  status: false,
                  message: "Client Aplication not found.",
                  token: newToken
                });
              }
              // Define the target directory for uploads
              let targetDirectory;
              let dbColumn;
              switch (uploadCat) {
                case "photo":
                  targetDirectory = `uploads/customers/${customerCode}/client-applications/${currentClientApplication.application_id}/photo`;
                  dbColumn = `photo`;
                  break;
                case "attach_documents":
                  targetDirectory = `uploads/customers/${customerCode}/client-applications/${currentClientApplication.application_id}/document`;
                  dbColumn = `attach_documents`;
                  break;
                default:
                  return res.status(400).json({
                    status: false,
                    message: "Invalid upload category.",
                    token: newToken,
                  });
              }

              // Create the target directory for uploads
              await fs.promises.mkdir(targetDirectory, { recursive: true });
              AppModel.appInfo("backend", async (err, appInfo) => {
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
                  savedImagePaths.push(`${imageHost}/${uploadedImage}`);
                }
                ClientApplication.upload(
                  clientAppId,
                  dbColumn,
                  savedImagePaths,
                  (success, result) => {
                    if (!success) {
                      // If an error occurred, return the error details in the response
                      return res.status(500).json({
                        status: false,
                        message:
                          result || "An error occurred while saving the image.", // Use detailed error message if available
                        token: newToken,
                        savedImagePaths,
                        // details: result.details,
                        // query: result.query,
                        // params: result.params,
                      });
                    }

                    // Handle the case where the upload was successful
                    if (result && result.affectedRows > 0) {
                      // Return success response if there are affected rows
                      if (send_mail == 1) {
                        let newAttachedDocsString = "";
                        if (
                          currentClientApplication.attach_documents &&
                          currentClientApplication.attach_documents.trim() !==
                          ""
                        ) {
                          newAttachedDocsString =
                            currentClientApplication.attach_documents;
                        }

                        BranchCommon.getBranchandCustomerEmailsForNotification(
                          branchId,
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
                                savedImagePaths,
                              });
                            }

                            Admin.list((err, adminResult) => {
                              if (err) {
                                console.error("Database error:", err);
                                return res.status(500).json({
                                  status: false,
                                  message: "Error retrieving admin details.",
                                  token: newToken,
                                });
                              }
                              const { branch, customer } = emailData;

                              // Prepare recipient and CC lists
                              const toArr = [
                                { name: branch.name, email: branch.email },
                              ];
                              const ccArr1 = customer.emails
                                .split(",")
                                .map((email) => ({
                                  name: customer.name,
                                  email: email.trim(),
                                }));

                              const ccArr = [
                                ...ccArr1,
                                ...adminResult.map((admin) => ({
                                  name: admin.name,
                                  email: admin.email,
                                })),
                              ];

                              Branch.getClientUniqueIDByBranchId(
                                branchId,
                                (err, clientCode) => {
                                  if (err) {
                                    console.error(
                                      "Error checking unique ID:",
                                      err
                                    );
                                    return res.status(500).json({
                                      status: false,
                                      message: err.message,
                                      token: newToken,
                                      savedImagePaths,
                                    });
                                  }

                                  // Check if the unique ID exists
                                  if (!clientCode) {
                                    return res.status(400).json({
                                      status: false,
                                      message: `Customer Unique ID not Found`,
                                      token: newToken,
                                      savedImagePaths,
                                    });
                                  }
                                  Branch.getClientNameByBranchId(
                                    branchId,
                                    (err, clientName) => {
                                      if (err) {
                                        console.error(
                                          "Error checking client name:",
                                          err
                                        );
                                        return res.status(500).json({
                                          status: false,
                                          message: err.message,
                                          token: newToken,
                                          savedImagePaths,
                                        });
                                      }

                                      // Check if the client name exists
                                      if (!clientName) {
                                        return res.status(400).json({
                                          status: false,
                                          message:
                                            "Customer Unique ID not found",
                                          token: newToken,
                                          savedImagePaths,
                                        });
                                      }

                                      const serviceIds =
                                        typeof currentClientApplication.services ===
                                          "string" &&
                                          currentClientApplication.services.trim() !==
                                          ""
                                          ? currentClientApplication.services
                                            .split(",")
                                            .map((id) => id.trim())
                                          : currentClientApplication.services;

                                      const serviceNames = [];

                                      // Function to fetch service names
                                      const fetchServiceNames = (index = 0) => {
                                        if (index >= serviceIds.length) {
                                          AppModel.appInfo(
                                            "frontend",
                                            async (err, appInfo) => {
                                              if (err) {
                                                console.error(
                                                  "Database error:",
                                                  err
                                                );
                                                if (!res.headersSent) {
                                                  return res.status(500).json({
                                                    status: false,
                                                    message:
                                                      "An error occurred while retrieving application information. Please try again.",
                                                  });
                                                }
                                                return;
                                              }

                                              if (!appInfo) {
                                                console.error(
                                                  "Database error during app info retrieval:",
                                                  err
                                                );
                                                if (!res.headersSent) {
                                                  return res.status(404).json({
                                                    status: false,
                                                    message:
                                                      "Information of the application not found.",
                                                  });
                                                }
                                                return;
                                              }

                                              const appHost =
                                                appInfo.host ||
                                                "www.example.com";
                                              const appName =
                                                appInfo.name ||
                                                "Example Company";

                                              // Once all services have been processed, send email notification
                                              try {
                                                await createMail(
                                                  "client application",
                                                  "create",
                                                  client_application_name,
                                                  currentClientApplication.application_id,
                                                  clientName,
                                                  clientCode,
                                                  serviceNames,
                                                  newAttachedDocsString,
                                                  appHost,
                                                  toArr,
                                                  ccArr
                                                );

                                                if (!res.headersSent) {
                                                  return res.status(201).json({
                                                    status: true,
                                                    message:
                                                      "Client application created successfully and email sent.",
                                                    token: newToken,
                                                    savedImagePaths,
                                                  });
                                                }
                                              } catch (emailError) {
                                                console.error(
                                                  "Error sending email:",
                                                  emailError
                                                );
                                                if (!res.headersSent) {
                                                  return res.status(201).json({
                                                    status: true,
                                                    message:
                                                      "Client application created successfully, but failed to send email.",
                                                    client: result,
                                                    token: newToken,
                                                    savedImagePaths,
                                                  });
                                                }
                                              }
                                            }
                                          );
                                          return;
                                        }

                                        const id = serviceIds[index];

                                        Service.getServiceById(
                                          id,
                                          (err, currentService) => {
                                            if (err) {
                                              console.error(
                                                "Error fetching service data:",
                                                err
                                              );
                                              if (!res.headersSent) {
                                                return res.status(500).json({
                                                  status: false,
                                                  message: err.message,
                                                  token: newToken,
                                                  savedImagePaths,
                                                });
                                              }
                                              return;
                                            }

                                            // Skip invalid services and continue to the next index
                                            if (
                                              !currentService ||
                                              !currentService.title
                                            ) {
                                              return fetchServiceNames(
                                                index + 1
                                              );
                                            }

                                            // Add the current service name to the array
                                            serviceNames.push(
                                              currentService.title
                                            );

                                            // Recursively fetch the next service
                                            fetchServiceNames(index + 1);
                                          }
                                        );
                                      };

                                      // Start fetching service names
                                      fetchServiceNames();
                                    }
                                  );
                                }
                              );
                            });
                          }
                        );
                      } else {
                        return res.status(201).json({
                          status: true,
                          message: "Client application created successfully.",
                          token: newToken,
                          savedImagePaths,
                        });
                      }
                    } else {
                      // If no rows were affected, indicate that no changes were made
                      return res.status(400).json({
                        status: false,
                        message:
                          "No changes were made. Please check the client application ID.",
                        token: newToken,
                        result,
                        savedImagePaths,
                      });
                    }
                  }
                );
              });
            });
        }
      );
    });
  });
};

exports.delete = (req, res) => {
  const { id, branch_id, sub_user_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!id) missingFields.push("Client Application ID");
  if (!branch_id) missingFields.push("Branch ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_application";
  // Check branch authorization
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Validate branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (err, tokenValidationResult) => {
        if (err) {
          console.error("Token validation error:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
          });
        }

        if (!tokenValidationResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenValidationResult.message,
          });
        }

        const newToken = tokenValidationResult.newToken;

        // Fetch the current clientApplication
        ClientApplication.getClientApplicationById(
          id,
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

            // Delete the clientApplication
            ClientApplication.delete(id, (err, result) => {
              if (err) {
                console.error(
                  "Database error during clientApplication deletion:",
                  err
                );
                BranchCommon.branchActivityLog(
                  branch_id,
                  "Client Application",
                  "Delete",
                  "0",
                  JSON.stringify({ id }),
                  err,
                  () => { }
                );
                return res.status(500).json({
                  status: false,
                  message:
                    "Failed to delete ClientApplication. Please try again.",
                  token: newToken,
                });
              }

              BranchCommon.branchActivityLog(
                branch_id,
                "Client Application",
                "Delete",
                "1",
                JSON.stringify({ id }),
                null,
                () => { }
              );

              res.status(200).json({
                status: true,
                message: "Client Application deleted successfully.",
                token: newToken,
              });
            });
          }
        );
      }
    );
  });
};
