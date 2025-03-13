const Candidate = require("../../../../models/customer/branch/candidateApplicationModel");
const CandidateMasterTrackerModel = require("../../../../models/admin/candidateMasterTrackerModel");
const BranchCommon = require("../../../../models/customer/branch/commonModel");
const Service = require("../../../../models/admin/serviceModel");
const Customer = require("../../../../models/customer/customerModel");
const AppModel = require("../../../../models/appModel");
const Admin = require("../../../../models/admin/adminModel");
const Branch = require("../../../../models/customer/branch/branchModel");
const {
  createMailForCandidate,
} = require("../../../../mailer/customer/branch/candidate/createMailForCandidate");

const {
  createMailForAcknowledgement,
} = require("../../../../mailer/customer/branch/candidate/createMailForAcknowledgement");

const {
  createTenantMail,
} = require("../../../../mailer/customer/branch/candidate/createTenantMail");

const {
  bulkCreateMail,
} = require("../../../../mailer/customer/branch/candidate/bulkCreateMail");

const {
  davMail,
} = require("../../../../mailer/customer/branch/candidate/davMail");

const CEF = require("../../../../models/customer/branch/cefModel");

exports.create = (req, res) => {
  const {
    branch_id,
    sub_user_id,
    _token,
    customer_id,
    name,
    employee_id,
    mobile_number,
    email,
    services,
    package,
    purpose_of_application,
    nationality
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    _token,
    customer_id,
    name,
    mobile_number,
    email,
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

  /*
  Candidate.isEmailUsedBefore(email, branch_id, (err, emailUsed) => {
    if (err) {
      return res.status(500).json({
        status: false,
        message: "Internal Server Error: Unable to check email.",
        error: err,
      });
    }

    if (emailUsed) {
      return res.status(409).json({
        status: false,
        message: "Conflict: The email address has already been used.",
      });
    }
    */
  const action = "candidate_application";
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

        Candidate.checkUniqueEmpId(branch_id, employee_id, (err, exists) => {
          if (err) {
            console.error("Error checking unique ID:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          if (exists) {
            return res.status(400).json({
              status: false,
              message: `Candidate Employee ID '${employee_id}' already exists.`,
              token: newToken,
            });
          }

          Customer.getCustomerById(
            parseInt(customer_id),
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
              const customerName = currentCustomer.name;
              Candidate.create(
                {
                  branch_id,
                  name,
                  employee_id,
                  mobile_number,
                  email,
                  services: services || null,
                  package: package || null,
                  purpose_of_application,
                  nationality,
                  customer_id,
                },
                (err, result) => {
                  if (err) {
                    console.error(
                      "Database error during candidate application creation:",
                      err
                    );
                    BranchCommon.branchActivityLog(
                      branch_id,
                      "Candidate Application",
                      "Create",
                      "0",
                      null,
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
                    "Candidate Application",
                    "Create",
                    "1",
                    `{id: ${result.insertId}}`,
                    null,
                    () => { }
                  );

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

                      Admin.filterAdmins({ status: "active", role: "admin" }, (err, adminResult) => {
                        if (err) {
                          console.error("Database error:", err);
                          return res.status(500).json({
                            status: false,
                            message: "Error retrieving admin details.",
                            token: newToken,
                          });
                        }

                        const adminMailArr = adminResult.map(admin => ({
                          name: admin.name,
                          email: admin.email
                        }));

                        const { branch, customer } = emailData;

                        // Prepare recipient and CC lists

                        const toArr = [{ name, email }];

                        const emailList = JSON.parse(customer.emails);
                        const ccArr1 = emailList.map((email) => ({
                          name: customer.name,
                          email,
                        }));

                        const mergedEmails = [
                          { name: branch.name, email: branch.email },
                          ...ccArr1,
                          ...adminResult.map((admin) => ({
                            name: admin.name,
                            email: admin.email,
                          })),
                        ];

                        const uniqueEmails = [
                          ...new Map(
                            mergedEmails.map((item) => [item.email, item])
                          ).values(),
                        ];

                        const ccArr2 = uniqueEmails;
                        const ccArr = [
                          ...new Map(
                            [...ccArr1, ...ccArr2].map((item) => [
                              item.email,
                              item,
                            ])
                          ).values(),
                        ];

                        const serviceIds = services
                          ? services
                            .split(",")
                            .map((id) => parseInt(id.trim(), 10))
                            .filter(Number.isInteger)
                          : [];

                        const serviceNames = [];

                        // Function to fetch service names recursively
                        const fetchServiceNames = (index = 0) => {
                          if (index >= serviceIds.length) {
                            // Once all service names are fetched, get app info
                            AppModel.appInfo("frontend", (err, appInfo) => {
                              if (err) {
                                console.error("Database error:", err);
                                return res.status(500).json({
                                  status: false,
                                  message: err.message,
                                  token: newToken,
                                });
                              }

                              if (appInfo) {
                                const appHost =
                                  appInfo.host || "www.example.com";
                                const base64_app_id = btoa(result.insertId);
                                const base64_branch_id = btoa(branch_id);
                                const base64_customer_id = btoa(customer_id);
                                const base64_link_with_ids = `YXBwX2lk=${base64_app_id}&YnJhbmNoX2lk=${base64_branch_id}&Y3VzdG9tZXJfaWQ==${base64_customer_id}`;

                                const dav_href = `${appHost}/digital-form?${base64_link_with_ids}`;
                                const bgv_href = `${appHost}/background-form?${base64_link_with_ids}`;

                                // Fetch and process digital address service
                                Service.digitlAddressService(
                                  (err, serviceEntry) => {
                                    if (err) {
                                      console.error("Database error:", err);
                                      return res.status(500).json({
                                        status: false,
                                        message: err.message,
                                        token: newToken,
                                      });
                                    }

                                    if (serviceEntry) {
                                      const digitalAddressID = parseInt(
                                        serviceEntry.id,
                                        10
                                      );
                                      if (
                                        serviceIds.includes(digitalAddressID)
                                      ) {
                                        davMail(
                                          "candidate application",
                                          "dav",
                                          name,
                                          customer.name,
                                          dav_href,
                                          [{ name: name, email: email.trim() }]
                                        )
                                          .then(() => {
                                            console.log(
                                              "Digital address verification mail sent."
                                            );
                                          })
                                          .catch((emailError) => {
                                            console.error(
                                              "Error sending digital address email:",
                                              emailError
                                            );
                                          });
                                      }
                                    }
                                  }
                                );

                                if (purpose_of_application?.toLowerCase() === "tenant") {
                                  // Send application creation email
                                  createTenantMail(
                                    "candidate application",
                                    "create-tenant",
                                    name,
                                    customerName,
                                    result.insertId,
                                    bgv_href,
                                    serviceNames,
                                    toArr || [],
                                    ccArr || []
                                  )
                                    .then(() => {
                                      return res.status(201).json({
                                        status: true,
                                        message:
                                          "Candidate application created successfully and email sent.",
                                        data: {
                                          candidate: result,
                                          package,
                                        },
                                        token: newToken,
                                        toArr: toArr || [],
                                        ccArr: ccArr || [],
                                      });
                                    })
                                    .catch((emailError) => {
                                      console.error(
                                        "Error sending application creation email:",
                                        emailError
                                      );
                                      return res.status(201).json({
                                        status: true,
                                        message:
                                          "Candidate application created successfully, but email failed to send.",
                                        candidate: result,
                                        token: newToken,
                                      });
                                    });
                                } else {

                                  // Send application creation email
                                  createMailForCandidate(
                                    "candidate application",
                                    "create for candidate",
                                    name,
                                    customerName,
                                    result.insertId,
                                    bgv_href,
                                    serviceNames,
                                    toArr || [],
                                    []
                                  )
                                    .then(() => {
                                      createMailForAcknowledgement(
                                        "candidate application",
                                        "create for acknowledgement",
                                        name,
                                        customerName,
                                        result.insertId,
                                        bgv_href,
                                        serviceNames,
                                        ccArr || [],
                                        []
                                      )
                                        .then(() => {
                                          return res.status(201).json({
                                            status: true,
                                            message:
                                              "Candidate application created successfully and email sent.",
                                            data: {
                                              candidate: result,
                                              package,
                                            },
                                            token: newToken,
                                          });
                                        })
                                        .catch((emailError) => {
                                          console.error(
                                            "Error sending application creation email:",
                                            emailError
                                          );
                                          return res.status(201).json({
                                            status: true,
                                            message:
                                              "Candidate application created successfully, but email failed to send.",
                                            candidate: result,
                                            token: newToken,
                                          });
                                        });
                                    })
                                    .catch((emailError) => {
                                      console.error(
                                        "Error sending application creation email:",
                                        emailError
                                      );
                                      return res.status(201).json({
                                        status: true,
                                        message:
                                          "Candidate application created successfully, but email failed to send.",
                                        candidate: result,
                                        token: newToken,
                                      });
                                    });
                                }
                              }
                            });
                            return;
                          }

                          const id = serviceIds[index];

                          // Fetch service required documents for each service ID
                          Service.getServiceRequiredDocumentsByServiceId(
                            id,
                            (err, currentService) => {
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

                              if (!currentService || !currentService.title) {
                                // Skip invalid services and continue to the next service
                                return fetchServiceNames(index + 1);
                              }

                              // Add the service name and description to the array
                              serviceNames.push(
                                `${currentService.title}: ${currentService.email_description}`
                              );

                              // Recursively fetch the next service
                              fetchServiceNames(index + 1);
                            }
                          );
                        };

                        // Start fetching service names
                        fetchServiceNames();
                      });
                    }
                  );
                }
              );
            }
          );
        });
      }
    );
  });
  // });
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

  const action = "candidate_application";
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
        const emptyValues = [];
        const updatedApplications = applications.filter((app) => {
          // Check if all specified fields are empty
          const allFieldsEmpty =
            !app.applicant_full_name?.trim() &&
            !app.mobile_number?.trim() &&
            !app.email_id?.trim() &&
            !app.employee_id?.trim();

          // If all fields are empty, exclude this application
          if (allFieldsEmpty) {
            return false;
          }

          // Check if any of the required fields are missing and track missing fields
          const missingFields = [];
          if (!("applicant_full_name" in app))
            missingFields.push("Applicant Full Name");
          if (!("mobile_number" in app)) missingFields.push("Mobile Number");
          if (!("email_id" in app)) missingFields.push("Email ID");
          if (!("employee_id" in app)) missingFields.push("Employee ID");

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
          if (!app.mobile_number?.trim()) emptyFields.push("Mobile Number");
          if (!app.email_id?.trim()) emptyFields.push("Email ID");
          if (!app.employee_id?.trim()) emptyFields.push("Employee ID");

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
            token: newToken,
          });
        }

        // Check for duplicate employee IDs
        const employeeIds = updatedApplications.map((app) => app.employee_id);
        const emailIds = updatedApplications.map((app) => app.email_id);

        const employeeIdChecks = employeeIds.map((employee_id) => {
          return new Promise((resolve, reject) => {
            Candidate.checkUniqueEmpId(employee_id, (err, exists) => {
              if (err) {
                reject(err);
              } else if (exists) {
                reject({ type: "employee_id", value: employee_id });
              } else {
                resolve(employee_id); // Pass the unique employee ID to resolve
              }
            });
          });
        });

        const emailIdChecks = emailIds.map((email_id) => {
          return new Promise((resolve, reject) => {
            Candidate.isEmailUsedBefore(email_id, branch_id, (err, exists) => {
              if (err) {
                reject(err);
              } else if (exists) {
                reject({ type: "email_id", value: email_id });
              } else {
                resolve(email_id);
              }
            });
          });
        });

        // Handle employee ID and email ID uniqueness checks
        // Promise.allSettled([...employeeIdChecks, ...emailIdChecks])
        Promise.allSettled([employeeIdChecks])
          .then((results) => {
            const rejectedResults = results.filter(
              (result) => result.status === "rejected"
            );

            const alreadyUsedEmployeeIds = rejectedResults
              .filter((result) => result.reason.type === "employee_id")
              .map((result) => result.reason.value);

            /*
            const alreadyUsedEmailIds = rejectedResults
              .filter((result) => result.reason.type === "email_id")
              .map((result) => result.reason.value);

              (
              alreadyUsedEmployeeIds.length > 0 ||
              alreadyUsedEmailIds.length > 0
            )
*/
            if (alreadyUsedEmployeeIds.length > 0) {
              return res.status(400).json({
                status: false,
                message: `Employee IDs - "${alreadyUsedEmployeeIds.join(
                  ", "
                )}" already used.`,
                token: newToken,
              });
            }

            // Proceed with creating candidate applications if all IDs are unique
            const applicationPromises = updatedApplications.map((app) => {
              return new Promise((resolve, reject) => {
                Candidate.create(
                  {
                    name: app.applicant_full_name,
                    employee_id: app.employee_id,
                    mobile_number: app.mobile_number,
                    email: app.email_id,
                    branch_id,
                    services,
                    packages: package,
                    customer_id,
                  },
                  (err, result) => {
                    if (err) {
                      reject(
                        new Error(
                          "Failed to create candidate application. Please try again."
                        )
                      );
                    } else {
                      // Log the activity
                      BranchCommon.branchActivityLog(
                        branch_id,
                        "Candidate Application",
                        "Create",
                        "1",
                        `{id: ${result.insertId}}`,
                        null,
                        () => { }
                      );
                      app.insertId = result.insertId;
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
                console.error(
                  "Error during candidate application creation:",
                  error
                );
                return res.status(400).json({
                  status: false,
                  message:
                    error.message ||
                    "Failed to create one or more candidate applications.",
                  token: newToken,
                });
              });
          })
          .catch((error) => {
            console.error("Error during uniqueness checks:", error);
            return res.status(400).json({
              status: false,
              message:
                error.message || "Error occurred during uniqueness checks.",
              token: newToken,
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
  // Fetch unique client ID based on branch ID
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

    // Fetch client name based on branch ID
    Branch.getClientNameByBranchId(branch_id, (err, clientName) => {
      if (err) {
        console.error("Error checking candidate name:", err);
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
      Admin.filterAdmins({ status: "active", role: "admin" }, (err, adminResult) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "Error retrieving admin details.",
            token: newToken,
          });
        }

        const adminMailArr = adminResult.map(admin => ({
          name: admin.name,
          email: admin.email
        }));

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

            // Prepare recipient and CC lists

            const toArr = [{ name: branch.name, email: branch.email }];

            const emailList = JSON.parse(customer.emails);
            const ccArr1 = emailList.map((email) => ({
              name: customer.name,
              email,
            }));

            const mergedEmails = [
              { name: branch.name, email: branch.email },
              ...ccArr1,
              ...adminResult.map((admin) => ({
                name: admin.name,
                email: admin.email,
              })),
            ];

            const uniqueEmails = [
              ...new Map(
                mergedEmails.map((item) => [item.email, item])
              ).values(),
            ];

            const ccArr2 = uniqueEmails;
            const ccArr = [
              ...new Map(
                [...ccArr1, ...ccArr2].map((item) => [
                  item.email,
                  item,
                ])
              ).values(),
            ];

            const serviceIds =
              typeof services === "string" && services.trim() !== ""
                ? services.split(",").map((id) => id.trim())
                : [];

            const serviceNames = [];

            // Recursively fetch service names
            const fetchServiceNames = (index = 0) => {
              if (index >= serviceIds.length) {
                sendBulkCreateMail(); // Proceed to sending bulk email once all services are processed
                return;
              }

              const id = serviceIds[index];

              Service.getServiceRequiredDocumentsByServiceId(
                id,
                (err, currentService) => {
                  if (err) {
                    console.error("Error fetching service data:", err);
                    return res.status(500).json({
                      status: false,
                      message: err.message,
                      token: newToken,
                    });
                  }

                  if (!currentService || !currentService.title) {
                    // Skip invalid services and continue to the next service
                    return fetchServiceNames(index + 1);
                  }

                  // Add the service name and description to the serviceNames array
                  serviceNames.push(
                    `${currentService.title}: ${currentService.email_description}`
                  );
                  fetchServiceNames(index + 1); // Recursively fetch next service
                }
              );
            };

            // Send email after fetching all services
            const sendBulkCreateMail = () => {
              bulkCreateMail(
                "candidate application",
                "bulk-create",
                updatedApplications,
                branch.name,
                customer.name,
                serviceNames,
                "",
                toArr,
                []
              )
                .then(() => {
                  AppModel.appInfo("frontend", (err, appInfo) => {
                    if (err) {
                      console.error("Database error:", err);
                      return res.status(500).json({
                        status: false,
                        message: err.message,
                        token: newToken,
                      });
                    }

                    if (appInfo) {
                      const appHost = appInfo.host || "www.example.com";

                      // Initialize counters for tracking email success/failure
                      let processedApplications = 0;
                      let failedApplications = 0;
                      let responseSent = false; // Flag to track if the response is already sent

                      updatedApplications.forEach((app) => {
                        const base64_app_id = btoa(app.insertId);
                        const base64_branch_id = btoa(branch_id);
                        const base64_customer_id = btoa(customer_id);
                        const base64_link_with_ids = `YXBwX2lk=${base64_app_id}&YnJhbmNoX2lk=${base64_branch_id}&Y3VzdG9tZXJfaWQ=${base64_customer_id}`;

                        const dav_href = `${appHost}/digital-form?${base64_link_with_ids}`;
                        const bgv_href = `${appHost}/background-form?${base64_link_with_ids}`;

                        const createMailToArr = [
                          { name: app.applicant_full_name, email: app.email_id },
                        ];
                        let createMailCCArr = [];

                        // Fetch and process digital address service for DAV mail
                        Service.digitlAddressService((err, serviceEntry) => {
                          if (err) {
                            console.error("Database error:", err);
                            return res.status(500).json({
                              status: false,
                              message: err.message,
                              token: newToken,
                            });
                          }

                          if (serviceEntry) {
                            const digitalAddressID = parseInt(
                              serviceEntry.id,
                              10
                            );
                            if (serviceIds.includes(digitalAddressID)) {
                              davMail(
                                "candidate application",
                                "dav",
                                app.applicant_full_name,
                                customer.name,
                                dav_href,
                                [
                                  {
                                    name: app.applicant_full_name,
                                    email: app.email_id.trim(),
                                  },
                                ]
                              )
                                .then(() => {
                                  console.log(
                                    "Digital address verification mail sent."
                                  );
                                })
                                .catch((emailError) => {
                                  console.error(
                                    "Error sending digital address email:",
                                    emailError
                                  );
                                  failedApplications++;
                                });
                            }
                          }

                          // Send application creation email
                          createMailForCandidate(
                            "candidate application",
                            "create for candidate",
                            app.applicant_full_name,
                            customer.name,
                            app.insertId,
                            bgv_href,
                            serviceNames,
                            toArr,
                            []
                          )
                            .then(() => {
                              return createMailForAcknowledgement(
                                "candidate application",
                                "create for acknowledgement",
                                app.applicant_full_name,
                                customer.name,
                                app.insertId,
                                bgv_href,
                                serviceNames,
                                ccArr || [],
                                []
                              );
                            })
                            .then(() => {
                              processedApplications++;
                            })
                            .catch((emailError) => {
                              console.error(
                                "Error sending application creation email:",
                                emailError
                              );
                              failedApplications++;
                            })
                            .finally(() => {
                              processedApplications++;

                              // After processing each application, check if all are processed
                              if (
                                processedApplications + failedApplications ===
                                updatedApplications.length &&
                                !responseSent
                              ) {
                                responseSent = true; // Ensure the response is only sent once

                                if (failedApplications > 0) {
                                  return res.status(201).json({
                                    status: false,
                                    message:
                                      "Some emails failed to send. Candidate applications created successfully.",
                                    token: newToken,
                                  });
                                } else {
                                  return res.status(201).json({
                                    status: true,
                                    message:
                                      "Candidate applications created successfully and emails sent.",
                                    token: newToken,
                                  });
                                }
                              }
                            });
                        });
                      });
                    }
                  });
                })
                .catch((emailError) => {
                  console.error("Error sending email (controller):", emailError);
                  return res.status(500).json({
                    status: false,
                    message: "Failed to send email.",
                    token: newToken,
                  });
                });
            };

            fetchServiceNames(); // Start fetching services
          }
        );
      });
    });
  });
}
// Controller to list all candidateApplications
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

  const action = "candidate_application";
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify branch token
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

        // Fetch all required data
        let filter_status;
        let modelStatus;
        const dataPromises = [
          new Promise((resolve) =>
            CandidateMasterTrackerModel.applicationListByBranch(
              filter_status,
              branch_id,
              modelStatus,
              (err, result) => {
                if (err) return resolve([]);
                resolve(result);
              }
            )
          ),
          new Promise((resolve) =>
            Customer.basicInfoByID(customer_id, (err, result) => {
              if (err) return resolve([]);
              resolve(result);
            })
          ),
        ];

        Promise.all(dataPromises).then(
          ([candidateApplications, customerInfo]) => {
            res.json({
              status: true,
              message: "Candidate applications fetched successfully.",
              data: {
                candidateApplications,
                customerInfo,
              },
              totalResults: {
                candidateApplications: candidateApplications.length,
              },
              token: newToken,
            });
          }
        );
      }
    );
  });
};

exports.cefApplicationByID = (req, res) => {
  const { application_id, branch_id, sub_user_id, _token } = req.query;

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

  const action = "candidate_application";
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

        CandidateMasterTrackerModel.applicationByID(
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

            const service_ids = Array.isArray(application.services)
              ? application.services
              : application.services.split(",").map((item) => item.trim());

            CandidateMasterTrackerModel.cefApplicationByID(
              application_id,
              branch_id,
              (err, CEFApplicationData) => {
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

                        CEF.formJsonWithData(
                          service_ids,
                          application_id,
                          (err, serviceData) => {
                            if (err) {
                              console.error("Database error:", err);
                              return res.status(500).json({
                                status: false,
                                message:
                                  "An error occurred while fetching service form json.",
                                token: newToken,
                              });
                            }
                            return res.json({
                              status: true,
                              message: "Application fetched successfully 2",
                              application,
                              CEFData: CEFApplicationData,
                              branchInfo: currentBranch,
                              customerInfo: currentCustomer,
                              serviceData,
                              admins: adminList,
                              token: newToken,
                            });
                          }
                        );
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

exports.davApplicationByID = (req, res) => {
  const { application_id, branch_id, sub_user_id, _token } = req.query;

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

  const action = "candidate_application";
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

        CandidateMasterTrackerModel.applicationByID(
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

            CandidateMasterTrackerModel.davApplicationByID(
              application_id,
              branch_id,
              (err, DAVApplicationData) => {
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

                        return res.json({
                          status: true,
                          message: "Application fetched successfully 2",
                          application,
                          DEFData: DAVApplicationData,
                          branchInfo: currentBranch,
                          customerInfo: currentCustomer,
                          admins: adminList,
                          token: newToken,
                        });
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

exports.gapCheck = (req, res) => {
  const { application_id, branch_id, sub_user_id, _token } = req.query;

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

  const action = "candidate_application";
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

        CandidateMasterTrackerModel.applicationByID(
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

            const searchWords = ['gap', 'check'];
            Service.serviceByTitle(searchWords, (err, gapService) => {
              if (err) {
                console.error("Database error:", err);
                return res
                  .status(500)
                  .json({ status: false, message: err.message, token: newToken });
              }

              if (!gapService) {
                return res.status(404).json({
                  status: false,
                  message: "GAP Check service not found for this application",
                  token: newToken,
                });
              }

              const all_service_ids = Array.isArray(application.services)
                ? application.services
                : application.services.split(",").map((item) => item.trim());


              const service_ids = [gapService.id];
              console.log(`service_ids: ${service_ids}`);
              CandidateMasterTrackerModel.cefApplicationByID(
                application_id,
                branch_id,
                (err, CEFApplicationData) => {
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

                          CEF.formJsonWithData(
                            service_ids,
                            application_id,
                            (err, serviceData) => {
                              if (err) {
                                console.error("Database error:", err);
                                return res.status(500).json({
                                  status: false,
                                  message:
                                    "An error occurred while fetching service form json.",
                                  token: newToken,
                                });
                              }
                              return res.json({
                                status: true,
                                message: "Application fetched successfully 2",
                                application,
                                CEFData: CEFApplicationData,
                                branchInfo: currentBranch,
                                customerInfo: currentCustomer,
                                serviceData,
                                admins: adminList,
                                token: newToken,
                              });
                            }
                          );
                        }
                      );
                    });
                  });
                }
              );
            });
          }
        );
      });
  });
};

exports.update = (req, res) => {
  const {
    branch_id,
    sub_user_id,
    candidate_application_id,
    _token,
    name,
    employee_id,
    mobile_number,
    email,
    services,
    package,
    purpose_of_application,
    nationality,
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    candidate_application_id,
    _token,
    name,
    mobile_number,
    email,
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

  const action = "candidate_application";
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

            const changes = {};
            if (currentCandidateApplication.name !== name) {
              changes.name = {
                old: currentCandidateApplication.name,
                new: name,
              };
            }
            if (currentCandidateApplication.email !== email) {
              changes.email = {
                old: currentCandidateApplication.email,
                new: email,
              };
            }
            if (currentCandidateApplication.employee_id !== employee_id) {
              changes.employee_id = {
                old: currentCandidateApplication.employee_id,
                new: employee_id,
              };
            }
            if (currentCandidateApplication.mobile_number !== mobile_number) {
              changes.mobile_number = {
                old: currentCandidateApplication.mobile_number,
                new: mobile_number,
              };
            }
            if (
              services !== "" &&
              currentCandidateApplication.services !== services
            ) {
              changes.services = {
                old: currentCandidateApplication.services,
                new: services,
              };
            }
            if (
              package !== "" &&
              currentCandidateApplication.package !== package
            ) {
              changes.package = {
                old: currentCandidateApplication.package,
                new: package,
              };
            }

            Candidate.checkUniqueEmpIdByCandidateApplicationID(
              branch_id,
              employee_id ? employee_id : null,
              candidate_application_id,
              (err, exists) => {
                if (err) {
                  console.error("Error checking unique ID:", err);
                  return res.status(500).json({
                    status: false,
                    message: err.message,
                    token: newToken,
                  });
                }

                if (
                  exists &&
                  exists.candidate_application_id !== candidate_application_id
                ) {
                  return res.status(400).json({
                    status: false,
                    message: `Candidate Employee ID '${employee_id}' already exists.`,
                    token: newToken,
                  });
                }

                Candidate.update(
                  {
                    name,
                    employee_id: employee_id ? employee_id : null,
                    mobile_number,
                    email,
                    services: services || null,
                    package: package || null,
                    purpose_of_application: purpose_of_application || null,
                    nationality: nationality || null,
                  },
                  candidate_application_id,
                  (err, result) => {
                    if (err) {
                      console.error(
                        "Database error during candidate application update:",
                        err
                      );
                      BranchCommon.branchActivityLog(
                        branch_id,
                        "Candidate Application",
                        "Update",
                        "0",
                        JSON.stringify({
                          candidate_application_id,
                          ...changes,
                        }),
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
                      "Candidate Application",
                      "Update",
                      "1",
                      JSON.stringify({ candidate_application_id, ...changes }),
                      null,
                      () => { }
                    );

                    res.status(200).json({
                      status: true,
                      message: "Candidate application updated successfully.",
                      package: result,
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

exports.delete = (req, res) => {
  const { id, branch_id, sub_user_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!id) missingFields.push("Candidate Application ID");
  if (!branch_id) missingFields.push("Branch ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "candidate_application";
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

        // Fetch the current candidateApplication
        Candidate.getCandidateApplicationById(
          id,
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

            // Delete the candidateApplication
            Candidate.delete(id, (err, result) => {
              if (err) {
                console.error(
                  "Database error during candidateApplication deletion:",
                  err
                );
                BranchCommon.branchActivityLog(
                  branch_id,
                  "Candidate Application",
                  "Delete",
                  "0",
                  JSON.stringify({ id }),
                  err,
                  () => { }
                );
                return res.status(500).json({
                  status: false,
                  message: "Failed to delete Candidate. Please try again.",
                  token: newToken,
                });
              }

              BranchCommon.branchActivityLog(
                branch_id,
                "Candidate Application",
                "Delete",
                "1",
                JSON.stringify({ id }),
                null,
                () => { }
              );

              res.status(200).json({
                status: true,
                message: "Candidate Application deleted successfully.",
                result,
                token: newToken,
              });
            });
          }
        );
      }
    );
  });
};
