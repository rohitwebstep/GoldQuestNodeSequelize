const Admin = require("../../models/admin/adminModel");
const App = require("../../models/appModel");
const Common = require("../../models/admin/commonModel");
const Service = require("../../models/admin/serviceModel");
const Package = require("../../models/admin/packageModel");
const Permission = require("../../models/admin/permissionModel");

const { createMail } = require("../../mailer/admin/createMail");

const fs = require("fs");
const path = require("path");
const { upload, saveImage, saveImages } = require("../../utils/cloudImageSave");

exports.list = (req, res) => {
  const { admin_id, _token } = req.query;

  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = "internal_login_credentials";
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Admin.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Admins fetched successfully",
          admins: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.addClientListings = (req, res) => {
  const { admin_id, _token } = req.query;

  // Check for missing fields
  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_management";
  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult || !authResult.status) {
      return res.status(403).json({
        status: false,
        err: authResult,
        message: authResult ? authResult.message : "Authorization failed",
      });
    }

    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({
          status: false,
          message: "Token validation failed",
        });
      }

      if (!tokenResult || !tokenResult.status) {
        return res.status(401).json({
          status: false,
          err: tokenResult,
          message: tokenResult ? tokenResult.message : "Invalid token",
        });
      }

      const newToken = tokenResult.newToken;

      // Fetch all required data
      const dataPromises = [
        new Promise((resolve) =>
          Admin.list((err, result) => {
            if (err) return resolve([]);
            resolve(result);
          })
        ),
        new Promise((resolve) =>
          Service.list((err, result) => {
            if (err) return resolve([]);
            resolve(result);
          })
        ),
        new Promise((resolve) =>
          Package.list((err, result) => {
            if (err) return resolve([]);
            resolve(result);
          })
        ),
      ];

      Promise.all(dataPromises).then(([admins, services, packages]) => {
        res.json({
          status: true,
          message: "Lists fetched successfully",
          data: {
            admins,
            services,
            packages,
          },
          totalResults: {
            admins: admins.length,
            services: services.length,
            packages: packages.length,
          },
          token: newToken,
        });
      });
    });
  });
};

exports.createListing = (req, res) => {
  const { admin_id, _token } = req.query;

  // Check for missing fields
  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "internal_login_credentials";

  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult || !authResult.status) {
      return res.status(403).json({
        status: false,
        err: authResult,
        message: authResult ? authResult.message : "Authorization failed",
      });
    }

    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({
          status: false,
          message: "Token validation failed",
        });
      }

      if (!tokenResult || !tokenResult.status) {
        return res.status(401).json({
          status: false,
          err: tokenResult,
          message: tokenResult ? tokenResult.message : "Invalid token",
        });
      }

      const newToken = tokenResult.newToken;

      // Fetch all required data using Promise.all
      const dataPromises = [
        new Promise((resolve) =>
          Permission.rolesList((err, result) => {
            if (err) {
              console.error("Error fetching roles:", err);
              return resolve([]);
            }
            resolve(result);
          })
        ),
        new Promise((resolve) =>
          Service.list((err, result) => {
            if (err) {
              console.error("Error fetching services:", err);
              return resolve([]);
            }
            resolve(result);
          })
        ),
        new Promise((resolve) =>
          Admin.list((err, result) => {
            if (err) {
              console.error("Error fetching admins:", err);
              return resolve([]);
            }
            resolve(result);
          })
        ),
      ];

      Promise.all(dataPromises)
        .then(([roles, services, admins]) => {
          res.json({
            status: true,
            message: "Lists fetched successfully",
            data: {
              roles,
              services,
              admins
            },
            totalResults: {
              roles: roles.length,
              services: services.length,
              admins: admins.length
            },
            token: newToken,
          });
        })
        .catch((error) => {
          console.error("Error fetching data:", error);
          res.status(500).json({
            status: false,
            message: "Error fetching required data",
          });
        });
    });
  });
};

exports.create = (req, res) => {
  const {
    admin_id,
    _token,
    role,
    name,
    email,
    mobile,
    password,
    employee_id,
    send_mail,
    service_ids,
  } = req.body;

  // Define required fields for creating a new admin
  const requiredFields = {
    admin_id,
    _token,
    role,
    name,
    email,
    mobile,
    password,
    employee_id,
  };

  if (role.trim().toLowerCase() !== "admin") {
    requiredFields.service_ids = service_ids;
  }

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => {
      const value = requiredFields[field];
      // Ensure value is a string before calling .trim() and check for empty strings
      return typeof value === "string" ? value.trim() === "" : !value;
    })
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "internal_login_credentials";

  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        err: authResult,
        message: authResult.message,
      });
    }

    // Validate the admin's token
    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({
          status: false,
          message: err.message,
        });
      }

      if (!tokenResult.status) {
        return res.status(401).json({
          status: false,
          err: tokenResult,
          message: tokenResult.message,
        });
      }

      const newToken = tokenResult.newToken;

      Admin.create(
        {
          name,
          email,
          employee_id,
          mobile,
          role: role.toLowerCase(),
          password,
          service_ids: service_ids || "",
        },
        (err, result) => {
          if (err) {
            console.error("Database error during admin creation:", err);
            Common.adminActivityLog(
              admin_id,
              "Admin",
              "Create",
              "0",
              null,
              err.message,
              () => { }
            );
            return res.status(500).json({
              status: false,
              message: err.message || "Failed to create admin.",
              token: newToken,
            });
          }

          // Log the successful creation of the admin
          Common.adminActivityLog(
            admin_id,
            "Admin",
            "Create",
            "1",
            `{id: ${result.insertId}}`,
            null,
            () => { }
          );

          if (send_mail == 0) {
            return res.status(201).json({
              status: true,
              message: "Admin created successfully.",
              token: newToken,
              result,
            });
          }

          const toArr = [{ name, email }];

          createMail(
            "Admin",
            "create",
            name,
            mobile,
            email,
            role.toUpperCase(),
            "",
            password,
            toArr
          )
            .then(() => {
              return res.status(201).json({
                status: true,
                message: "Admin created successfully and email sent.",
                token: newToken,
              });
            })
            .catch((emailError) => {
              console.error("Error sending email:", emailError);
              return res.status(201).json({
                status: true,
                message:
                  "Admin created successfully, but failed to send email.",
                result,
                token: newToken,
              });
            });
        }
      );
    });
  });
};

exports.update = (req, res) => {
  const {
    admin_id,
    _token,
    id,
    role,
    name,
    email,
    mobile,
    status,
    service_ids,
    employee_id,
  } = req.body;

  // Define required fields for creating a new admin
  const requiredFields = {
    admin_id,
    _token,
    id,
    role,
    name,
    email,
    mobile,
    status,
    employee_id,
  };

  if (role.trim().toLowerCase() !== "admin") {
    requiredFields.service_ids = service_ids;
  }

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => {
      const value = requiredFields[field];
      // Ensure value is a string before calling .trim() and check for empty strings
      return typeof value === "string" ? value.trim() === "" : !value;
    })
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "internal_login_credentials";
  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        err: authResult,
        message: authResult.message, // Return the message from the authorization check
      });
    }

    if (admin_id === id) {
      return res.status(403).json({
        status: false,
        message: "You cannot update your own profile from this section.",
      });
    }

    // Validate the admin's token
    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res
          .status(500)
          .json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res.status(401).json({
          status: false,
          err: tokenResult,
          message: tokenResult.message,
        });
      }

      const newToken = tokenResult.newToken;
      Admin.findById(id, async (err, currentAdmin) => {
        if (err) {
          console.error("Error retrieving Admin:", err);
          return res.status(500).json({
            status: false,
            message: "Database error.",
            token: newToken,
          });
        }

        if (!currentAdmin) {
          return res.status(404).json({
            status: false,
            message: "Admin not found.",
            token: newToken,
          });
        }
        Admin.update(
          {
            id,
            name,
            email,
            employee_id,
            mobile,
            role: role.toLowerCase(),
            status,
            service_ids: service_ids || "",
          },
          (err, result) => {
            if (err) {
              console.error("Database error during admin updation:", err);
              Common.adminActivityLog(
                admin_id,
                "Admin",
                "Update",
                "0",
                null,
                err,
                () => { }
              );
              return res.status(500).json({
                status: false,
                message: "Failed to update Admin. Please try again later.",
                token: newToken,
                error: err,
              });
            }

            // Log the successful creation of the Admin
            Common.adminActivityLog(
              admin_id,
              "Admin",
              "Update",
              "1",
              `{id: ${id}}`,
              null,
              () => { }
            );

            return res.status(201).json({
              status: true,
              message: "Admin updated successfully and email sent.",
              token: newToken,
            });
          }
        );
      });
    });
  });
};

exports.delete = (req, res) => {
  const { id, admin_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!id) missingFields.push("Admin ID for Update");
  if (!admin_id) missingFields.push("Admin ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "internal_login_credentials";
  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        err: authResult,
        message: authResult.message, // Return the message from the authorization check
      });
    }

    if (admin_id === id) {
      return res.status(403).json({
        status: false,
        message: "You cannot delete your own profile from this section.",
      });
    }

    // Validate the admin's token
    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res
          .status(500)
          .json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res.status(401).json({
          status: false,
          err: tokenResult,
          message: tokenResult.message,
        });
      }

      const newToken = tokenResult.newToken;
      Admin.findById(id, async (err, currentAdmin) => {
        if (err) {
          console.error("Error retrieving Admin:", err);
          return res.status(500).json({
            status: false,
            message: "Database error.",
            token: newToken,
          });
        }

        if (!currentAdmin) {
          return res.status(404).json({
            status: false,
            message: "Admin not found.",
            token: newToken,
          });
        }

        Admin.delete(id, (err, result) => {
          if (err) {
            console.error("Database error during Admin deletion:", err);
            Common.adminActivityLog(
              admin_id,
              "Admin",
              "Delete",
              "0",
              JSON.stringify({ id }),
              err,
              () => { }
            );
            return res.status(500).json({
              status: false,
              message: "Failed to delete Admin. Please try again.",
              token: newToken,
            });
          }

          Common.adminActivityLog(
            admin_id,
            "Admin",
            "Delete",
            "1",
            JSON.stringify({ id }),
            null,
            () => { }
          );

          res.status(200).json({
            status: true,
            message: "Admin deleted successfully.",
            token: newToken,
          });
        });
      });
    });
  });
};

exports.upload = async (req, res) => {
  try {
    // Handle file upload using Multer
    upload(req, res, async (err) => {
      if (err) {
        return res
          .status(400)
          .json({ status: false, message: "Error uploading file." });
      }

      // Destructure required fields from request body
      const {
        admin_id: adminId,
        _token: token,
        id,
        password,
        send_mail,
      } = req.body;

      // Validate required fields
      const requiredFields = { adminId, token, id, send_mail };
      if (send_mail == 1) requiredFields.password = password;

      const missingFields = Object.keys(requiredFields)
        .filter(
          (field) =>
            !requiredFields[field] ||
            requiredFields[field] === "" ||
            requiredFields[field] === "undefined"
        )
        .map((field) => field.replace(/_/g, " "));

      if (missingFields.length > 0) {
        return res.status(400).json({
          status: false,
          message: `Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      Admin.findById(id, async (err, currentAdmin) => {
        if (err) {
          console.error("Error retrieving Admin:", err);
          return res.status(500).json({
            status: false,
            message: "Database error.",
            token: newToken,
          });
        }

        if (!currentAdmin) {
          return res.status(404).json({
            status: false,
            message: "Admin not found.",
            token: newToken,
          });
        }
        const action = "internal_login_credentials";
        Common.isAdminAuthorizedForAction(
          adminId,
          action,
          async (authResult) => {
            if (!authResult.status) {
              return res.status(403).json({
                status: false,
                err: authResult,
                message: authResult.message,
              });
            }
            if (adminId === id) {
              return res.status(403).json({
                status: false,
                message:
                  "You cannot upload your own profile picture from this section.",
              });
            }

            // Validate token
            Common.isAdminTokenValid(
              token,
              adminId,
              async (err, tokenResult) => {
                if (err) {
                  console.error("Token validation error:", err);
                  return res
                    .status(500)
                    .json({ status: false, message: err.message });
                }

                if (!tokenResult.status) {
                  return res.status(401).json({
                    status: false,
                    err: tokenResult,
                    message: tokenResult.message,
                  });
                }

                const newToken = tokenResult.newToken;
                const targetDirectory = `uploads/admins/${currentAdmin.emp_id}`;

                // Create directory for uploads
                await fs.promises.mkdir(targetDirectory, { recursive: true });

                const savedImagePaths = [];
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
                  // Process multiple or single file uploads
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

                  // Save images and update Admin
                  Admin.upload(id, savedImagePaths, (success, result) => {
                    if (!success) {
                      return res.status(500).json({
                        status: false,
                        message:
                          result || "Error occurred while saving images.",
                        token: newToken,
                        savedImagePaths,
                      });
                    }
                    if (result && result.affectedRows > 0) {
                      if (send_mail == 1) {
                        const newAttachedDocsString = savedImagePaths
                          .map((doc) => `${doc.trim()}`)
                          .join("");

                        const toArr = [
                          {
                            name: currentAdmin.name,
                            email: currentAdmin.email,
                          },
                        ];

                        // Send an email notification
                        createMail(
                          "Admin",
                          "create",
                          currentAdmin.name,
                          currentAdmin.mobile,
                          currentAdmin.email,
                          currentAdmin.role.toUpperCase(),
                          newAttachedDocsString,
                          currentAdmin.designation || "N/A",
                          password,
                          toArr
                        )
                          .then(() => {
                            return res.status(201).json({
                              status: true,
                              message:
                                "Admin created and email sent successfully.",
                              token: newToken,
                            });
                          })
                          .catch((emailError) => {
                            console.error("Error sending email:", emailError);
                            return res.status(201).json({
                              status: true,
                              message:
                                "Admin created successfully, but email sending failed.",
                              token: newToken,
                            });
                          });
                      } else {
                        return res.status(201).json({
                          status: true,
                          message:
                            "Admin profile picture uploaded successfully.",
                          token: newToken,
                          savedImagePaths,
                        });
                      }
                    } else {
                      return res.status(400).json({
                        status: false,
                        message: "No changes were made. Check Admin ID.",
                        token: newToken,
                      });
                    }
                  });
                });
              }
            );
          }
        );
      });
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return res
      .status(500)
      .json({ status: false, message: "Unexpected server error." });
  }
};
