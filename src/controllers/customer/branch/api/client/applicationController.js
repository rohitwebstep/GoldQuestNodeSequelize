const ClientApplication = require("../../../../../models/customer/branch/clientApplicationModel");
const CandidateMasterTrackerModel = require("../../../../../models/admin/candidateMasterTrackerModel");
const ClientMasterTrackerModel = require("../../../../../models/admin/clientMasterTrackerModel");
const BranchCommon = require("../../../../../models/customer/branch/commonModel");
const Branch = require("../../../../../models/customer/branch/branchModel");
const Service = require("../../../../../models/admin/serviceModel");
const Customer = require("../../../../../models/customer/customerModel");
const AppModel = require("../../../../../models/appModel");
const Admin = require("../../../../../models/admin/adminModel");
const Candidate = require("../../../../../models/customer/branch/candidateApplicationModel");

const {
  addToStopcheck,
} = require("../../../../../mailer/customer/branch/client/addToStopcheck");

const {
  createMail,
} = require("../../../../../mailer/customer/branch/client/createMail");

const {
  createMailForSpoc,
} = require("../../../../../mailer/customer/branch/client/createMailForSpoc");

const {
  bulkCreateMail,
} = require("../../../../../mailer/customer/branch/client/bulkCreateMail");

const fs = require("fs");
const path = require("path");
const {
  upload,
  saveImage,
  saveImages,
  saveBase64Image,
} = require("../../../../../utils/cloudImageSave");
const candidateApplication = require("../../../../../models/customer/branch/candidateApplicationModel");

exports.create = (req, res) => {
  const {
    access_token,
    name,
    photo,
    attach_documents,
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
    access_token,
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

  Branch.getBranchAndCustomerByAccessToken(access_token, (err, result) => {
    if (err) {
      console.error("Error:", err);
      return res.status(500).json({
        status: false,
        message: "Internal server error. Please try again later.",
        error: err.message,
      });
    }

    if (!result.status) {
      // This means token was invalid or not found
      return res.status(401).json({
        status: false,
        message: result.message || "Invalid or expired access token.",
      });
    }

    const branch = result.data.branch;
    const customer = result.data.customer;

    const branch_id = branch.id;
    const customer_id = customer.id;

    const customerCode = customer.client_unique_id;

    // Check if employee ID is unique
    ClientApplication.checkUniqueEmpId(
      branch_id,
      employee_id,
      (err, exists) => {
        if (err) {
          console.error("Error checking unique ID:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message });
        }

        if (exists) {
          return res.status(400).json({
            status: false,
            message: `Client Employee ID '${employee_id}' already exists.`,
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
          async (err, result) => {
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

            const clientAppId = result.results.insertId;

            const photoTargetDirectory = `uploads/customers/${customerCode}/client-applications/${result.new_application_id}/photo`;
            const attachDocumentsTargetDirectory = `uploads/customers/${customerCode}/client-applications/${result.new_application_id}/document`;

            // Create the target directory for uploads
            await fs.promises.mkdir(photoTargetDirectory, { recursive: true });
            await fs.promises.mkdir(attachDocumentsTargetDirectory, { recursive: true });

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

              let savedAttachDocumentsPaths = [];
              let savedPhotoPath = [];
              // Process single file upload
              if (attach_documents) {
                let attachDocuments = attach_documents;

                // Parse only if it’s a string (e.g., when sent as form-data)
                if (typeof attach_documents === "string") {
                  try {
                    attachDocuments = JSON.parse(attach_documents);
                  } catch (err) {
                    console.error("Invalid JSON for attach_documents:", err);
                    attachDocuments = [];
                  }
                }

                if (Array.isArray(attachDocuments) && attachDocuments.length > 0) {
                  for (const base64Img of attachDocuments) {
                    try {
                      const savedFile = await saveBase64Image(base64Img, attachDocumentsTargetDirectory);
                      savedAttachDocumentsPaths.push(`${imageHost}/${savedFile}`);
                    } catch (err) {
                      console.error("Error saving base64 image:", err);
                    }
                  }
                }
              }

              try {
                const savedPhotoFile = await saveBase64Image(photo, attachDocumentsTargetDirectory);
                savedPhotoPath.push(`${imageHost}/${savedPhotoFile}`);
              } catch (err) {
                console.error("Error saving base64 image:", err);
              }

              ClientApplication.upload(
                clientAppId,
                'photo',
                savedPhotoPath,
                (success, result) => {
                  if (!success) {
                    // If an error occurred, return the error details in the response
                    return res.status(500).json({
                      status: false,
                      message:
                        result || "An error occurred while saving the image.", // Use detailed error message if available
                    });
                  }

                  console.log(`result - `, result);

                  // Handle the case where the upload was successful
                  if (success) {
                    ClientApplication.upload(
                      clientAppId,
                      'attach_documents',
                      savedAttachDocumentsPaths,
                      (success, result) => {
                        if (!success) {
                          // If an error occurred, return the error details in the response
                          return res.status(500).json({
                            status: false,
                            message:
                              result || "An error occurred while saving the image.", // Use detailed error message if available
                          });
                        }

                        console.log(`result - `, result);

                        // Handle the case where the upload was successful
                        if (success) {
                          if (send_mail == 0) {
                            return res.status(201).json({
                              status: true,
                              message: "Client application created successfully .",
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
                                });
                              }

                              // Check if the unique ID exists
                              if (!clientCode) {
                                return res.status(400).json({
                                  status: false,
                                  message: `Customer Unique ID not Found`,
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
                                    });
                                  }

                                  // Check if the client name exists
                                  if (!clientName) {
                                    return res.status(400).json({
                                      status: false,
                                      message: "Customer Unique ID not found",
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
                                                    "Failed to retrieve email addresses."
                                                });
                                              }

                                              const { branch, customer } = emailData;
                                              Admin.filterAdmins({ status: "active", role: "admin" }, (err, adminResult) => {
                                                if (err) {
                                                  console.error("Database error:", err);
                                                  return res.status(500).json({
                                                    status: false,
                                                    message:
                                                      "Error retrieving admin details."
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
                                                        "Client application created successfully and email sent."
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
                                                      client: result
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
                                        console.error("Error fetching service data:", err);
                                        // ❌ Don't stop — just continue to next service
                                        return fetchServiceNames(index + 1);
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
                        } else {
                          return res.status(400).json({
                            status: false,
                            message: "Client application was created successfully, but document upload failed.",
                            result,
                          });
                        }
                      }
                    );
                  } else {
                    return res.status(400).json({
                      status: false,
                      message: "Client application was created successfully, but document upload failed.",
                      result,
                    });
                  }
                }
              );

            });


          }
        );
      }
    );
  });
};
