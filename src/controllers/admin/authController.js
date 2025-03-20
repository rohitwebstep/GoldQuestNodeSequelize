const crypto = require("crypto");
const Admin = require("../../models/admin/adminModel");
const Common = require("../../models/admin/commonModel");
const AppModel = require("../../models/appModel");
const { twoFactorAuth } = require("../../mailer/admin/auth/twoFactorAuth");
const { forgetPassword } = require("../../mailer/admin/auth/forgetPassword");

// Utility function to generate a random token
const generateToken = () => crypto.randomBytes(32).toString("hex");

const getCurrentTime = () => new Date();
const generateOTP = () => Math.floor(100000 + Math.random() * 900000);

// Utility function to get token expiry time (15 minutes from the current time)
const getTokenExpiry = () => {
  const expiryDurationInMinutes = 3; // Duration for token expiry in minutes
  return new Date(getCurrentTime().getTime() + expiryDurationInMinutes * 60000);
};

const getOTPExpiry = () => {
  const expiryDurationInMinutes = 10; // Duration for token expiry in minutes
  return new Date(getCurrentTime().getTime() + expiryDurationInMinutes * 60000);
};

// Admin login handler
exports.login = (req, res) => {
  console.log("Login function triggered");
  const { username, password } = req.body;
  console.log("Received login request:", { username, password: password ? "****" : "EMPTY" });

  const missingFields = [];

  // Validate required fields
  if (!username || username === "") missingFields.push("Username");
  if (!password || password === "") missingFields.push("Password");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  console.log(`Step - 2`);

  Admin.findByEmailOrMobile(username, (err, result) => {
    if (err) {
      return res.status(500).json({ status: false, message: err.message });
    }
console.log(`Step - 1`);
    if (result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Admin not found with the provided email or mobile number.",
      });
    }

    const admin = result[0];
    console.log("Admin record found:", admin.id);

    // Validate password
    Admin.validatePassword(username, password, (err, isValid) => {
      if (err) {
        Common.adminLoginLog(admin.id, "login", "0", err.message, () => { });
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!isValid) {
        Common.adminLoginLog(admin.id, "login", "0", "Incorrect password", () => { });
        return res.status(401).json({ status: false, message: "Incorrect password" });
      }

      // Check admin account status
      if (admin.status === 0) {
        Common.adminLoginLog(admin.id, "login", "0", "Account not verified", () => { });
        return res.status(400).json({
          status: false,
          message: "Admin account is not verified.",
        });
      }

      if (admin.status === 2) {
        Common.adminLoginLog(admin.id, "login", "0", "Account suspended", () => { });
        return res.status(400).json({
          status: false,
          message: "Admin account is suspended.",
        });
      }

      const currentTime = getCurrentTime();
      const tokenExpiry = new Date(admin.token_expiry);
      /*
      if (admin.login_token && tokenExpiry > currentTime) {

        // Parse the tokenExpiry and currentTime to Date objects
        const expiryDate = new Date(tokenExpiry);
        const currentDate = new Date(currentTime);

        // Calculate the time difference in milliseconds
        const timeDifference = expiryDate - currentDate;

        // Calculate hours, minutes, and seconds
        const hours = Math.floor(timeDifference / (1000 * 60 * 60));
        const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

        // Build the timeRemainingMessage based on available time units
        let timeRemainingMessage = '';

        if (hours > 0) {
          timeRemainingMessage += `${hours} hour(s) `;
        }
        if (minutes > 0) {
          timeRemainingMessage += `${minutes} minute(s) `;
        }
        timeRemainingMessage += `${seconds} second(s)`;

        Common.adminLoginLog(admin.id, "login", "0", "Another admin logged in", () => { });

        return res.status(400).json({
          status: false,
          message: `Another admin is currently logged in. You can log in after ${timeRemainingMessage} if no activity is done by the current user.`,
        });
      }
      */

      if (admin.two_factor_enabled && admin.two_factor_enabled == 1) {
        const isMobile = /^\d{10}$/.test(username);
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);

        const otp = generateOTP();
        const otpExpiry = getOTPExpiry();

        if (isEmail) {

          // Update the token in the database
          Admin.updateToken(admin.id, null, null, (err) => {
            if (err) {
              Common.adminLoginLog(
                admin.id,
                "login",
                "0",
                "Error updating token: " + err,
                () => { }
              );
              return res.status(500).json({
                status: false,
                message: `Error updating token: ${err}`,
              });
            }
            Admin.updateOTP(admin.id, otp, otpExpiry, (err, result) => {
              if (err) {
                return res.status(500).json({
                  status: false,
                  message: "Failed to update OTP. Please try again later.",
                });
              }

              const toArr = [{ name: admin.name, email: username }];
              twoFactorAuth("admin auth", "two-factor-auth", otp, admin.name, toArr, [])
                .then(() => {
                  return res.status(200).json({
                    status: true,
                    message: "OTP sent successfully.",
                  });
                })
                .catch((emailError) => {
                  return res.status(200).json({
                    status: true,
                    message: "OTP generated successfully, but email failed.",
                  });
                });
            });
          });
        } else if (isMobile) {
          return res.status(500).json({
            status: false,
            message: "Failed to send OTP on mobile. Please try again later.",
          });
        } else {
          return res.status(500).json({
            status: false,
            message: "unexpected method used for login",
          });
        }
      } else {
        console.log("Generating login token for:", admin.id);
        // Generate new token and expiry time
        const token = generateToken();
        const newTokenExpiry = getTokenExpiry();

        // Update the token in the database
        Admin.updateToken(admin.id, token, newTokenExpiry, (err) => {
          if (err) {
            Common.adminLoginLog(
              admin.id,
              "login",
              "0",
              "Error updating token: " + err,
              () => { }
            );
            return res.status(500).json({
              status: false,
              message: `Error updating token: ${err}`,
            });
          }
          Common.adminLoginLog(admin.id, "login", "1", null, () => { });
          const { otp, two_factor_enabled, otp_expiry, login_token, token_expiry, ...adminDataWithoutToken } = admin;
          res.json({
            status: true,
            message: "Login successful",
            adminData: adminDataWithoutToken,
            token,
          });
        });
      }
    });
  });
};

exports.verifyTwoFactor = (req, res) => {
  const { username, otp } = req.body;

  const missingFields = [];

  // Validate required fields
  if (!username || username.trim() === "") missingFields.push("Username");
  if (!otp || otp.trim() === "") missingFields.push("OTP");

  const otpAsNumber = Number(otp); // Attempt to convert OTP to a number

  if (isNaN(otpAsNumber)) {
    return res.status(400).json({
      status: false,
      message: "OTP must be a valid number.",
    });
  }

  const otpInt = parseInt(otpAsNumber, 10);

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Find admin by email or mobile
  Admin.findByEmailOrMobile(username, (err, result) => {
    if (err) {
      console.error("Error finding admin:", err);
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No admin found with the provided email or mobile number.",
      });
    }

    const admin = result[0];

    // Validate account status
    if (admin.status === 0) {
      Common.adminLoginLog(admin.id, "login", "0", "Account not verified", () => { });
      return res.status(400).json({
        status: false,
        message: "Admin account is not verified.",
      });
    }

    if (admin.status === 2) {
      Common.adminLoginLog(admin.id, "login", "0", "Account suspended", () => { });
      return res.status(400).json({
        status: false,
        message: "Admin account is suspended.",
      });
    }

    // Validate token and two-factor authentication settings
    const currentTime = getCurrentTime();
    const tokenExpiry = new Date(admin.token_expiry);

    /*
    if (admin.login_token && tokenExpiry > currentTime) {

      // Parse the tokenExpiry and currentTime to Date objects
      const expiryDate = new Date(tokenExpiry);
      const currentDate = new Date(currentTime);

      // Calculate the time difference in milliseconds
      const timeDifference = expiryDate - currentDate;

      // Calculate hours, minutes, and seconds
      const hours = Math.floor(timeDifference / (1000 * 60 * 60));
      const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

      // Build the timeRemainingMessage based on available time units
      let timeRemainingMessage = '';

      if (hours > 0) {
        timeRemainingMessage += `${hours} hour(s) `;
      }
      if (minutes > 0) {
        timeRemainingMessage += `${minutes} minute(s) `;
      }
      timeRemainingMessage += `${seconds} second(s)`;

      Common.branchLoginLog(
        branch.id,
        "login",
        "0",
        "Another branch is logged in",
        () => { }
      );

      return res.status(400).json({
        status: false,
        message: `Another admin is currently logged in. You can log in after ${timeRemainingMessage} if no activity is done by the current user.`,
      });
    }
    */

    if (admin.two_factor_enabled !== 1) {
      return res.status(400).json({
        status: false,
        message: "Two-factor authentication is disabled for this admin.",
      });
    }

    // Validate OTP
    const otpExpiry = new Date(admin.otp_expiry);

    if (admin.otp !== otpInt) {
      Common.adminLoginLog(admin.id, "login", "0", "Invalid OTP", () => { });
      return res.status(401).json({
        status: false,
        message: "The provided OTP is incorrect.",
      });
    }

    if (otpExpiry <= currentTime) {
      Common.adminLoginLog(admin.id, "login", "0", "OTP expired", () => { });
      return res.status(401).json({
        status: false,
        message: "The OTP has expired. Please request a new one.",
      });
    }

    // Update token and return success response
    const token = generateToken();
    const newTokenExpiry = getTokenExpiry();

    Admin.updateOTP(admin.id, null, null, (err, result) => {
      if (err) {
        return res.status(500).json({
          status: false,
          message: "Failed to update OTP. Please try again later.",
        });
      }
      Admin.updateToken(admin.id, token, newTokenExpiry, (err) => {
        if (err) {
          console.error("Error updating token:", err);
          Common.adminLoginLog(admin.id, "login", "0", "Error updating token", () => { });
          return res.status(500).json({
            status: false,
            message: "An error occurred while updating the session token. Please try again.",
          });
        }

        Common.adminLoginLog(admin.id, "login", "1", "Login successful", () => { });
        const { otp, two_factor_enabled, otp_expiry, login_token, token_expiry, ...adminDataWithoutSensitiveInfo } = admin;

        return res.json({
          status: true,
          message: "Login successful.",
          adminData: adminDataWithoutSensitiveInfo,
          token,
        });
      });
    });
  });
};

/*
// Generate new token and expiry time
const token = generateToken();
const newTokenExpiry = getTokenExpiry();

// Update the token in the database
Admin.updateToken(admin.id, token, newTokenExpiry, (err) => {
  if (err) {
    console.error("Step 15: Database error while updating token:", err);
    Common.adminLoginLog(
      admin.id,
      "login",
      "0",
      "Error updating token: " + err,
      () => { }
    );
    return res.status(500).json({
      status: false,
      message: `Error updating token: ${err}`,
    });
  }
  Common.adminLoginLog(admin.id, "login", "1", null, () => { });
  const { login_token, token_expiry, ...adminDataWithoutToken } = admin;

  res.json({
    status: true,
    message: "Login successful",
    adminData: adminDataWithoutToken,
    token,
  });
});
*/

// Admin logout handler
exports.logout = (req, res) => {
  const { admin_id, _token } = req.query;

  // Validate required fields and create a custom message
  let missingFields = [];

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

  // Validate the admin token
  Common.isAdminTokenValid(_token, admin_id, (err, result) => {
    if (err) {
      console.error("Error checking token validity:", err);
      return res.status(500).json(err);
    }

    if (!result.status) {
      return res.status(401).json({ status: false, message: result.message });
    }

    // Update the token in the database to null
    Admin.logout(admin_id, (err) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: `Error logging out: ${err}`,
        });
      }

      res.json({
        status: true,
        message: "Logout successful",
      });
    });
  });
};

// Admin login validation handler
exports.validateLogin = (req, res) => {
  const { admin_id, _token } = req.body;
  const missingFields = [];

  // Validate required fields
  if (!admin_id) {
    missingFields.push("Admin Id");
  }

  if (!_token) {
    missingFields.push("Token");
  }

  // If there are missing fields, return an error response
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  Admin.findById(admin_id, (err, admin) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ status: false, message: err.message });
    }

    // If no admin found, return a 404 response
    if (!admin) {
      return res.status(404).json({
        status: false,
        message: "Admin not found with the provided ID",
      });
    }

    // Validate the token
    if (admin.login_token !== _token) {
      return res
        .status(401)
        .json({ status: false, message: "Invalid or expired token" });
    }

    const now = new Date();
    const tokenExpiry = new Date(new Date(admin.token_expiry).getTime() + 15 * 60 * 1000); // Add 15 minutes

    if (tokenExpiry < now) {
      return res.status(440).json({
        status: false,
        message: "Your session has expired. Please log in again to continue."
      });
    }

    // Check admin status
    if (admin.status === 0) {
      Common.adminLoginLog(
        admin.id,
        "login",
        "0",
        "Admin account is not yet verified.",
        () => { }
      );
      return res.status(400).json({
        status: false,
        message:
          "Admin account is not yet verified. Please complete the verification process before proceeding.",
      });
    }

    if (admin.status === 2) {
      Common.adminLoginLog(
        admin.id,
        "login",
        "0",
        "Admin account has been suspended.",
        () => { }
      );
      return res.status(400).json({
        status: false,
        message:
          "Admin account has been suspended. Please contact the help desk for further assistance.",
      });
    }

    // Check if the existing token is still valid
    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res
          .status(500)
          .json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      // Here you can respond with success and the new token if applicable
      return res.status(200).json({
        status: true,
        message: "Login verified successfully",
        token: newToken,
      });
    });
  });
};

exports.updatePassword = (req, res) => {
  const { new_password, admin_id, _token } = req.body;

  // Validate required fields
  const missingFields = [];

  if (
    !new_password ||
    new_password === "" ||
    new_password === undefined ||
    new_password === "undefined"
  ) {
    missingFields.push("New Password");
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

  // If required fields are missing, return error
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Validate admin token
  Common.isAdminTokenValid(_token, admin_id, (err, tokenValidationResult) => {
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

    // Update the password
    Admin.updatePassword(new_password, admin_id, (err, result) => {
      if (err) {
        console.error("Database error during password update:", err);
        Common.adminActivityLog(
          admin_id,
          "Password",
          "Update",
          "0",
          "Admin attempted to update password",
          err,
          () => { }
        );
        return res.status(500).json({
          status: false,
          message: "Failed to update password. Please try again later.",
          token: newToken,
        });
      }

      // Log the successful password update
      Common.adminActivityLog(
        admin_id,
        "Password",
        "Update",
        "1",
        "Admin successfully updated password",
        null,
        () => { }
      );

      return res.status(200).json({
        status: true,
        message: "Password updated successfully.",
        data: result,
        token: newToken,
      });
    });
  });
};

exports.forgotPasswordRequest = (req, res) => {
  const { email } = req.body;

  // Validate the input email
  if (!email || email.trim() === "") {
    return res.status(400).json({
      status: false,
      message: "Email is required.",
    });
  }

  // Check if an admin exists with the provided email
  Admin.findByEmailOrMobileAllInfo(email, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message: "An error occurred while processing your request. Please try again later.",
      });
    }

    if (result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No admin found with the provided email.",
      });
    }

    const admin = result[0];
    const currentDate = new Date().toDateString();
    const passwordResetRequestedAt = admin.password_reset_requested_at
      ? new Date(admin.password_reset_requested_at).toDateString()
      : null;
    const passwordResetRequestCount = admin.password_reset_request_count || 0;
    const canRequestPasswordReset = admin.can_request_password_reset;

    // Check if the admin has exceeded the reset request limit for the day
    if (passwordResetRequestedAt === currentDate) {
      if (canRequestPasswordReset === 0 || passwordResetRequestCount >= 6) {
        // Block further password reset requests
        Admin.updatePasswordResetPermission(0, admin.id, (updateErr) => {
          if (updateErr) {
            console.error("Error updating password reset permission:", updateErr);
            return res.status(500).json({
              status: false,
              message: "Too many reset requests. Your account is temporarily blocked. Please try again tomorrow.",
            });
          }

          Common.adminActivityLog(
            admin.id,
            "Forgot Password",
            "Reset Blocked",
            "0",
            "Blocked due to too many reset requests",
            null,
            () => { }
          );

          return res.status(429).json({
            status: false,
            message: "Too many reset requests. Your account is temporarily blocked. Please try again tomorrow.",
          });
        });
        return;
      }
    }

    // Retrieve application information for generating the reset link
    AppModel.appInfo("frontend", (appErr, appInfo) => {
      if (appErr) {
        console.error("Database error:", appErr);
        return res.status(500).json({
          status: false,
          message: "An error occurred while retrieving application information. Please try again later.",
        });
      }

      if (!appInfo) {
        return res.status(500).json({
          status: false,
          message: "Application information is not available. Please try again later.",
        });
      }

      // Generate reset token and expiry time
      const token = generateToken();
      const tokenExpiry = getTokenExpiry(); // ISO string for expiry time

      // Update the reset password token in the database
      Admin.setResetPasswordToken(admin.id, token, tokenExpiry, (tokenErr) => {
        if (tokenErr) {
          console.error("Error updating reset password token:", tokenErr);
          Common.adminLoginLog(
            admin.id,
            "forgot-password",
            "0",
            `Error updating token: ${tokenErr.message}`,
            () => { }
          );
          return res.status(500).json({
            status: false,
            message: "Failed to generate reset token. Please try again later.",
          });
        }

        // Construct the password reset link
        const resetLink = `${appInfo.host || "https://www.example.com"}/reset-password?email=${admin.email}&token=${token}`;
        const toArr = [{ name: admin.name, email: admin.email }];

        // Send password reset email
        forgetPassword("admin auth", "forget-password", admin.name, resetLink, toArr)
          .then(() => {
            Common.adminLoginLog(admin.id, "forgot-password", "1", null, () => { });
            return res.status(200).json({
              status: true,
              message: `A password reset email has been successfully sent to ${admin.name}.`,
            });
          })
          .catch((emailError) => {
            console.error("Error sending password reset email:", emailError);
            Common.adminLoginLog(
              admin.id,
              "forgot-password",
              "0",
              `Failed to send email: ${emailError.message}`,
              () => { }
            );
            return res.status(500).json({
              status: false,
              message: `Failed to send password reset email to ${admin.name}. Please try again later.`,
            });
          });
      });
    });
  });
};

exports.forgotPassword = (req, res) => {
  const { new_password, email, password_token } = req.body;
  const missingFields = [];

  // Validate required fields
  if (!new_password || new_password.trim() === "") {
    missingFields.push("New Password");
  }
  if (!email || email.trim() === "") {
    missingFields.push("Email");
  }
  if (!password_token || password_token.trim() === "") {
    missingFields.push("Password Token");
  }

  // Return error if there are missing fields
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Fetch admin details using the provided email
  Admin.findByEmailOrMobileAllInfo(email, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ status: false, message: err.message });
    }

    // Return error if no admin found
    if (!result || result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No admin found with the provided email.",
      });
    }

    const admin = result[0];
    const tokenExpiry = new Date(admin.password_token_expiry);
    const currentTime = new Date();

    // Check if the token is still valid
    if (currentTime > tokenExpiry) {
      return res.status(401).json({
        status: false,
        message: "Password reset token has expired. Please request a new one.",
      });
    }

    // Verify if the token matches
    if (admin.reset_password_token !== password_token) {
      return res.status(401).json({
        status: false,
        message: "Invalid password reset token.",
      });
    }

    // Proceed to update the password
    Admin.updatePassword(new_password, admin.id, (err, result) => {
      if (err) {
        console.error("Database error during password update:", err);
        Common.adminActivityLog(
          admin.id,
          "Password",
          "Update",
          "0",
          "Failed password update attempt",
          err,
          () => { }
        );
        return res.status(500).json({
          status: false,
          message: "Failed to update password. Please try again later.",
        });
      }

      // Log successful password update
      Common.adminActivityLog(
        admin.id,
        "Password",
        "Update",
        "1",
        "Admin password updated successfully",
        null,
        () => { }
      );

      return res.status(200).json({
        status: true,
        message: "Password updated successfully.",
      });
    });
  });
};
