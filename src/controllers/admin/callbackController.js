const Callback = require("../../models/admin/callbackModel");
const Common = require("../../models/admin/commonModel");

exports.list = (req, res) => {
  const { admin_id, _token } = req.query;

  // Validate required fields
  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `The following required fields are missing: ${missingFields.join(
        ", "
      )}`,
    });
  }

  const action = "callback_request";

  // Check if admin is authorized for the requested action
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Authorization failure message
      });
    }

    // Validate admin token
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {

      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({
          status: false,
          message: result.message, // Invalid token message
        });
      }

      const newToken = result.newToken;

      // Fetch callback requests from branches
      Callback.list((err, result) => {
        if (err) {
          console.error(
            "Database error while fetching callback requests:",
            err
          );
          return res.status(500).json({
            status: false,
            message:
              "An error occurred while retrieving callback requests. Please try again later.",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message:
            "Callback requests fetched successfully. These requests were initiated by branches.",
          callbackRequests: result,
          totalRequests: result.length,
          token: newToken,
        });
      });
    });
  });
};
