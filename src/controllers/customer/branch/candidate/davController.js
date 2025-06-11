const Candidate = require("../../../../models/customer/branch/candidateApplicationModel");
const Customer = require("../../../../models/customer/customerModel");
const Branch = require("../../../../models/customer/branch/branchModel");
const BranchCommon = require("../../../../models/customer/branch/commonModel");
const DAV = require("../../../../models/customer/branch/davModel");
const App = require("../../../../models/appModel");
const polyline = require('@mapbox/polyline');
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const {
  davSubmitMail,
} = require("../../../../mailer/customer/branch/candidate/davSubmitMail");
const { candidateDAVFromPDF } = require("../../../../utils/candidateDAVFromPDF");
const Service = require("../../../../models/admin/serviceModel");

const fs = require("fs");
const path = require("path");
const {
  upload,
  saveImage,
  saveImages,
} = require("../../../../utils/cloudImageSave");

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

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
            Object.keys(currentDAVApplication).length > 0 && currentDAVApplication.is_submitted
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
          message: "Application does not exist 1.",
        });
      }
    }
  );
};

exports.submit = (req, res) => {
  const { branch_id, customer_id, application_id, personal_information } = req.body;

  // 1. Validate required fields
  const requiredFields = { branch_id, customer_id, application_id, personal_information };
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // 2. Check application existence
  Candidate.isApplicationExist(application_id, branch_id, customer_id, (err, exists) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ status: false, message: err.message });
    }

    if (!exists) {
      return res.status(404).json({ status: false, message: "Application does not exist." });
    }

    // 3. Retrieve branch
    Branch.getBranchById(branch_id, (err, currentBranch) => {
      if (err) {
        console.error("Error retrieving branch:", err);
        return res.status(500).json({ status: false, message: "Failed to retrieve branch." });
      }

      if (!currentBranch || parseInt(currentBranch.customer_id) !== parseInt(customer_id)) {
        return res.status(404).json({ status: false, message: "Branch not found or customer mismatch." });
      }

      // 4. Retrieve customer
      Customer.getCustomerById(customer_id, (err, currentCustomer) => {
        if (err) {
          console.error("Error retrieving customer:", err);
          return res.status(500).json({ status: false, message: "Failed to retrieve customer." });
        }

        if (!currentCustomer) {
          return res.status(404).json({ status: false, message: "Customer not found." });
        }

        // 5. Check existing DAV application
        DAV.getDAVApplicationById(application_id, async (err, currentDAVApplication) => {
          if (err) {
            console.error("Error retrieving DAV application:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve DAV Application. Please try again.",
            });
          }

          if (currentDAVApplication && currentDAVApplication.is_submitted) {
            return res.status(400).json({
              status: false,
              message: "An application has already been submitted.",
            });
          }

          // Utility: download image
          const downloadImage = async (url) => {
            const extension = path.extname(url.split("?")[0]) || ".jpg";
            const filename = `${Date.now()}_${uuidv4()}${extension}`;
            const filepath = path.join("uploads", filename);

            const response = await axios({
              method: "GET",
              url,
              responseType: "stream",
            });

            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
              writer.on("finish", () => {
                resolve({
                  filename: filename,
                  originalname: path.basename(url),
                  mimetype: response.headers["content-type"] || "image/jpeg",
                  path: filepath,
                });
              });
              writer.on("error", reject);
            });
          };

          // Utility: circle points
          const generateCirclePoints = (lat, lng, radius, numPoints = 32) => {
            const earthRadius = 6378137;
            const d = radius / earthRadius;
            const centerLat = (lat * Math.PI) / 180;
            const centerLng = (lng * Math.PI) / 180;
            const points = [];

            for (let i = 0; i <= numPoints; i++) {
              const angle = (2 * Math.PI * i) / numPoints;
              const latRad = Math.asin(
                Math.sin(centerLat) * Math.cos(d) + Math.cos(centerLat) * Math.sin(d) * Math.cos(angle)
              );
              const lngRad =
                centerLng +
                Math.atan2(
                  Math.sin(angle) * Math.sin(d) * Math.cos(centerLat),
                  Math.cos(d) - Math.sin(centerLat) * Math.sin(latRad)
                );

              points.push([(latRad * 180) / Math.PI, (lngRad * 180) / Math.PI]);
            }

            return polyline.encode(points);
          };

          // Utility: distance
          const haversineDistance = (lat1, lng1, lat2, lng2) => {
            const toRad = deg => (deg * Math.PI) / 180;
            const R = 6371000;
            const dLat = toRad(lat2 - lat1);
            const dLng = toRad(lng2 - lng1);
            const a =
              Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
            return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          };

          // 6. Map logic
          const distance = haversineDistance(
            personal_information.latitude,
            personal_information.longitude,
            personal_information.address_latitude,
            personal_information.address_longitude
          );
          const radius = distance * 0.2;

          const encodedPathA = generateCirclePoints(personal_information.latitude, personal_information.longitude, radius);
          const encodedPathB = generateCirclePoints(personal_information.address_latitude, personal_information.address_longitude, radius);

          const staticMapPictureUrl =
            `https://maps.googleapis.com/maps/api/staticmap?size=600x400` +
            `&path=fillcolor:0xFFB40080|color:0xFFB400|weight:1|enc:${encodedPathA}` +
            `&path=fillcolor:0x0000FF80|color:0x0000FFFF|weight:1|enc:${encodedPathB}` +
            `&key=${GOOGLE_API_KEY}`.replace(/\s+/g, "");

          let savedStaticMapImage = null;

          if (staticMapPictureUrl) {
            try {
              const targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/map-image`;
              await fs.promises.mkdir(targetDir, { recursive: true });

              const downloaded = await downloadImage(staticMapPictureUrl);
              const savedPath = await saveImage(downloaded, targetDir);

              savedStaticMapImage = {
                filename: downloaded.filename,
                path: savedPath,
              };

              console.log(`savedStaticMapImage - `, savedStaticMapImage);
            } catch (imageError) {
              console.error("Error downloading/saving map image:", imageError);
              return res.status(500).json({
                status: false,
                message: "Error downloading or saving static map image.",
              });
            }
          }

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

            // 7. Store map image
            personal_information.static_map_picture = `${imageHost}/${savedStaticMapImage.path}`;

            // 8. Create DAV record
            DAV.create(personal_information, application_id, branch_id, customer_id, (err, result) => {
              if (err) {
                console.error("Error creating DAV application:", err);
                return res.status(500).json({
                  status: false,
                  message: "An error occurred while submitting the application.",
                });
              }

              return res.status(200).json({
                status: true,
                message: "DAV Application submitted successfully.",
              });
            });
          });
        });
      });
    });
  });
};

// Helper function to send notification emails
const sendNotificationEmails = (candidateAppId, customer_id, branch_id, res) => {
  Candidate.isApplicationExist(
    candidateAppId,
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

      console.log(`currentCandidateApplication - `, currentCandidateApplication);

      if (!currentCandidateApplication) {
        return res.status(404).json({
          status: false,
          message: "Application does not exist 3.",
        });
      }

      DAV.getDAVApplicationById(candidateAppId, (err, currentDAVApplication) => {
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

        BranchCommon.getBranchandCustomerEmailsForNotification(
          branch_id,
          async (err, emailData) => {
            if (err) {
              console.error("Error fetching emails:", err);
              return res.status(500).json({
                status: false,
                message: "Failed to retrieve email addresses.",
              });
            }

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

              const { branch, customer } = emailData;
              const toArr = [{ name: branch.name, email: branch.email }];
              const ccArr = JSON.parse(customer.emails).map((email) => ({
                name: customer.name,
                email: email.trim(),
              }));

              const pdfTargetDirectory = `uploads/customers/${customer.client_unique_id}/candidate-applications/CD-${customer.client_unique_id}-${candidateAppId}/address-form-reports`;

              const pdfFileName = `candidate-dav-form.pdf`;

              const pdfFile = await candidateDAVFromPDF(
                candidateAppId,
                branch_id,
                customer_id,
                pdfFileName,
                pdfTargetDirectory
              );

              let newAttachments = [];
              let attachments = [];

              if (pdfFile) newAttachments.push(`${imageHost}/${pdfFile}`);

              if (newAttachments.length > 0) {
                attachments += (attachments ? "," : "") + newAttachments.join(",");
              }

              // Send application creation email
              davSubmitMail(
                'candidate application',
                'dav-submit',
                currentCandidateApplication.name,
                customer.name,
                attachments,
                toArr,
                ccArr
              )
                .then(() => {
                  return res.status(200).json({
                    status: true,
                    message:
                      "DAV Application submitted successfully and notifications sent.",
                  });
                })
                .catch((emailError) => {
                  return res.status(200).json({
                    status: true,
                    message:
                      "DAV Application submitted successfully and notifications not sent.",
                  });
                });
            });
          }
        );
      });


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
              message: "Application does not exist 4.",
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

              /*
              if (
                !currentDAVApplication &&
                Object.keys(currentDAVApplication).length === 0
              ) {
                return res.status(400).json({
                  status: false,
                  message: "An application has not submmited.",
                });
              }
                */

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
                        case "id_proof":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/identity-proofs`;
                          db_column = `id_proof`;
                          break;
                        case "house_name_main_door":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/house-name-main-door`;
                          db_column = `house_name_main_door`;
                          break;
                        case "building_photo":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/building-photo`;
                          db_column = `building_photo`;
                          break;
                        case "street_photo":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/street-photo`;
                          db_column = `street_photo`;
                          break;
                        case "nearest_landmark":
                          targetDir = `uploads/customers/${currentCustomer.client_unique_id}/candidate-applications/CD-${currentCustomer.client_unique_id}-${application_id}/dav/documents/nearest-landmark`;
                          db_column = `nearest_landmark`;
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
                              sendNotificationEmails(
                                application_id,
                                customer_id,
                                branch_id,
                                res
                              );
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
