const tatDelay = require("../../models/admin/tatDelayModel");
const Common = require("../../models/admin/commonModel");
const Admin = require("../../models/admin/adminModel");
const {
  tatDelayMail,
} = require("../../mailer/admin/tatDelayMail");

// Controller to list all tatDelays
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

  const action = "tat_delay_notification";
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

      tatDelay.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Delay TATs fetched successfully",
          tatDelays: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.sendAutoNotification = (req, res) => {
  tatDelay.list((err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ status: false, message: err.message, token: newToken });
    }

    if (result && result.applicationHierarchy.length === 0) {
      return res.status(200).json({
        status: true,
        message: "No applications out of TAT.",
      });
    }
    console.log(`result - `, result);
    const applicationHierarchy = result.applicationHierarchy;
    Admin.filterAdmins({ status: "active", role: "admin" }, (err, adminResult) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: "Error retrieving admin details.",
          token: newToken,
        });
      }

      const adminEmails = adminResult.map((admin) => ({
        name: admin.name,
        email: admin.email,
      }));


      tatDelayMail(
        "tat-delay-notification",
        "email",
        applicationHierarchy,
        adminEmails,
        []
      )
        .then(() => {
          console.log(
            "TAT Delay notification email sent successfully."
          );
        })
        .catch((emailError) => {
          console.error("Error sending email:", emailError);
          return res.status(200).json({
            status: true,
            message: `Failed to send mail.`,
          });
        });
    });
  });
};
