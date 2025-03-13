const Candidate = require("../../../../models/customer/branch/candidateApplicationModel");
const Customer = require("../../../../models/customer/customerModel");
const Branch = require("../../../../models/customer/branch/branchModel");
const BranchCommon = require("../../../../models/customer/branch/commonModel");
const DAV = require("../../../../models/customer/branch/davModel");
const App = require("../../../../models/appModel");

const Service = require("../../../../models/admin/serviceModel");

const fs = require("fs");
const path = require("path");
const {
  upload,
  saveImage,
  saveImages,
} = require("../../../../utils/cloudImageSave");

exports.isApplicationExist = (req, res) => {
  const { app_id, branch_id, customer_id } = req.query;

  let missingFields = [];
  if (
    !app_id ||
    app_id === "" ||
    app_id === undefined ||
    app_id === "undefined"
  ) {
    missingFields.push("Application ID");
  }

  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Branch ID");
  }

  if (
    !customer_id ||
    customer_id === "" ||
    customer_id === undefined ||
    customer_id === "undefined"
  ) {
    missingFields.push("Customer ID");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  Candidate.isApplicationExist(
    app_id,
    branch_id,
    customer_id,
    (err, currentCandidateApplication) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: err.message,
        });
      }

      if (currentCandidateApplication) {
        DAV.getDAVApplicationById(app_id, (err, currentDAVApplication) => {
          if (err) {
            console.error(
              "Database error during DAV application retrieval:",
              err
            );
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve DAV Application. Please try again.",
            });
          }

          if (
            currentDAVApplication &&
            Object.keys(currentDAVApplication).length > 0
          ) {
            return res.status(400).json({
              status: false,
              message: "An application has already been submitted.",
            });
          }

          return res.status(200).json({
            status: true,
            data: currentCandidateApplication,
            message: "Application exists.",
          });
        });
      } else {
        return res.status(404).json({
          status: false,
          message: "Application does not exist.",
        });
      }
    }
  );
};

exports.submit = (req, res) => {
  const { branch_id, customer_id, application_id, personal_information } =
    req.body;

  // Define required fields and check for missing values
  const requiredFields = {
    branch_id,
    customer_id,
    application_id,
    personal_information,
  };
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Check if the application exists
  Candidate.isApplicationExist(
    application_id,
    branch_id,
    customer_id,
    (err, exists) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: err.message,
        });
      }

      if (!exists) {
        return res.status(404).json({
          status: false,
          message: "Application does not exist.",
        });
      }

      // Retrieve branch details
      Branch.getBranchById(branch_id, (err, currentBranch) => {
        if (err) {
          console.error("Database error during branch retrieval:", err);
          return res.status(500).json({
            status: false,
            message: "Failed to retrieve Branch. Please try again.",
          });
        }

        if (
          !currentBranch ||
          parseInt(currentBranch.customer_id) !== parseInt(customer_id)
        ) {
          return res.status(404).json({
            status: false,
            message: "Branch not found or customer mismatch.",
          });
        }

        // Retrieve customer details
        Customer.getCustomerById(customer_id, (err, currentCustomer) => {
          if (err) {
            console.error("Database error during customer retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Customer. Please try again.",
            });
          }

          if (!currentCustomer) {
            return res.status(404).json({
              status: false,
              message: "Customer not found.",
            });
          }

          // Check if DAV application exists
          DAV.getDAVApplicationById(
            application_id,
            (err, currentDAVApplication) => {
              if (err) {
                console.error(
                  "Database error during DAV application retrieval:",
                  err
                );
                return res.status(500).json({
                  status: false,
                  message:
                    "Failed to retrieve DAV Application. Please try again.",
                });
              }

              if (
                currentDAVApplication &&
                Object.keys(currentDAVApplication).length > 0
              ) {
                return res.status(400).json({
                  status: false,
                  message: "An application has already been submitted.",
                });
              }

              // Create new DAV application
              DAV.create(
                personal_information,
                application_id,
                branch_id,
                customer_id,
                (err, cmeResult) => {
                  if (err) {
                    console.error(
                      "Database error during DAV application creation:",
                      err
                    );
                    return res.status(500).json({
                      status: false,
                      message:
                        "An error occurred while submitting the application.",
                    });
                  }

                  return res.status(200).json({
                    status: true,
                    message: "DAV Application submitted successfully.",
                  });
                }
              );
            }
          );
        });
      });
    }
  );
};

// Helper function to send notification emails
const sendNotificationEmails = (branch_id, customer_id, res) => {
  BranchCommon.getBranchandCustomerEmailsForNotification(
    branch_id,
    (err, emailData) => {
      if (err) {
        console.error("Error fetching emails:", err);
        return res.status(500).json({
          status: false,
          message: "Failed to retrieve email addresses.",
        });
      }

      const { branch, customer } = emailData;
      const toArr = [{ name: branch.name, email: branch.email }];
      const ccArr = JSON.parse(customer.emails).map((email) => ({
        name: customer.name,
        email: email.trim(),
      }));

      // Placeholder for sending email logic
      return res.status(200).json({
        status: true,
        message:
          "DAV Application submitted successfully and notifications sent.",
      });
    }
  );
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

    try {
      const {
        branch_id,
        customer_id,
        application_id,
        upload_category,
        send_mail,
      } = req.body;

      // Validate required fields and collect missing ones
      const requiredFields = {
        branch_id,
        customer_id,
        application_id,
        upload_category,
      };

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

      // Check if the application exists
      Candidate.isApplicationExist(
        application_id,
        branch_id,
        customer_id,
        (err, exists) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({
              status: false,
              message: err.message,
            });
          }

          if (!exists) {
            return res.status(404).json({
              status: false,
              message: "Application does not exist.",
            });
          }
          // Check if DAV application exists
          DAV.getDAVApplicationById(
            application_id,
            (err, currentDAVApplication) => {
              if (err) {
                console.error(
                  "Database error during DAV application retrieval:",
                  err
                );
                return res.status(500).json({
                  status: false,
                  message:
                    "Failed to retrieve DAV Application. Please try again.",
                });
              }

              if (
                !currentDAVApplication &&
                Object.keys(currentDAVApplication).length === 0
              ) {
                return res.status(400).json({
                  status: false,
                  message: "An application has not submmited.",
                });
              }

              // Retrieve branch details
              Branch.getBranchById(branch_id, (err, currentBranch) => {
                if (err) {
                  console.error("Database error during branch retrieval:", err);
                  return res.status(500).json({
                    status: false,
                    message: "Failed to retrieve Branch. Please try again.",
                  });
                }

                if (
                  !currentBranch ||
                  parseInt(currentBranch.customer_id) !== parseInt(customer_id)
                ) {
                  return res.status(404).json({
                    status: false,
                    message: "Branch not found or customer mismatch.",
                  });
                }

                // Retrieve customer details
                Customer.getCustomerById(
                  customer_id,
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
                      });
                    }

                    if (!currentCustomer) {
                      return res.status(404).json({
                        status: false,
                        message: "Customer not found.",
                      });
                    }
                    const customer_code = currentCustomer.client_unique_id;
                    // Check if the admin is authorized
                    App.appInfo("backend", async (err, appInfo) => {
                      if (err) {
                        console.error("Database error:", err);
                        return res.status(500).json({
                          status: false,
                          err,
                          message: err.message,
                        });
                      }

                      let imageHost = "www.example.in";

                      if (appInfo) {
                        imageHost = appInfo.cloud_host || "www.example.in";
                      }
                      // Define the target directory for uploads
                      let targetDir;
                      let db_column;
                      switch (upload_category) {
                        case "identity_proof":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/identity-proofs`;
                          db_column = `identity_proof`;
                          break;
                        case "home_photo":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/home-photos`;
                          db_column = `home_photo`;
                          break;
                        case "locality":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/localities`;
                          db_column = `locality`;
                          break;
                        default:
                          return res.status(400).json({
                            status: false,
                            message: "Invalid upload category.",
                          });
                      }

                      try {
                        // Create the target directory for uploads
                        await fs.promises.mkdir(targetDir, { recursive: true });

                        let savedImagePaths = [];

                        if (req.files.images && req.files.images.length > 0) {
                          const uploadedImages = await saveImages(
                            req.files.images,
                            targetDir
                          );
                          uploadedImages.forEach((imagePath) => {
                            savedImagePaths.push(`${imageHost}/${imagePath}`);
                          });
                        }

                        // Process single file upload
                        if (req.files.image && req.files.image.length > 0) {
                          const uploadedImage = await saveImage(
                            req.files.image[0],
                            targetDir
                          );
                          savedImagePaths.push(`${imageHost}/${uploadedImage}`);
                        }

                        DAV.updateImages(
                          currentDAVApplication.id,
                          application_id,
                          savedImagePaths,
                          db_column,
                          (err, result) => {
                            if (err) {
                              console.error(
                                "Database error while creating customer:",
                                err
                              );
                              return res.status(500).json({
                                status: false,
                                message: err.message,
                              });
                            }

                            if (send_mail == 1) {
                              return res.json({
                                status: true,
                                message:
                                  "Customer and branches created and file saved successfully.",
                              });
                            } else {
                              return res.json({
                                status: true,
                                message:
                                  "Customer and branches created and file saved successfully.",
                              });
                            }
                          }
                        );
                      } catch (error) {
                        console.error("Error saving image:", error);
                        return res.status(500).json({
                          status: false,
                          message: "An error occurred while saving the image.",
                        });
                      }
                    });
                  }
                );
              });
            }
          );
        }
      );
    } catch (error) {
      console.error("Error processing upload:", error);
      return res.status(500).json({
        status: false,
        message: "An error occurred during the upload process.",
      });
    }
  });
};
