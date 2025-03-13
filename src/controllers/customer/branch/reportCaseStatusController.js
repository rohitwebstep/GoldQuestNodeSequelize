const crypto = require("crypto");
const Branch = require("../../../models/customer/branch/branchModel");
const ClientMasterTrackerModel = require("../../../models/admin/clientMasterTrackerModel");
const BranchCommon = require("../../../models/customer/branch/commonModel");
const AdminCommon = require("../../../models/admin/commonModel");
const Service = require("../../../models/admin/serviceModel");
const reportCaseStatus = require("../../../models/customer/branch/reportCaseStatusModel");

exports.list = (req, res) => {
  const { filter_status, branch_id, _token, sub_user_id, status } = req.query;

  let missingFields = [];
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

  const action = "report_case_status";
  // Step 2: Check if the branch is authorized for the action
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the authorization error message
      });
    }
    
    // Step 3: Verify the branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (tokenErr, tokenResult) => {
        if (tokenErr) {
          console.error("Error checking token validity:", tokenErr);
          return res.status(500).json({
            status: false,
            message: tokenErr,
          });
        }

        if (!tokenResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenResult.message, // Return the token validation message
          });
        }

        const newToken = tokenResult.newToken;

        if (
          !status ||
          status === "" ||
          status === undefined ||
          status === "undefined"
        ) {
          let status = null;
        }

        ClientMasterTrackerModel.applicationListByBranch(
          filter_status,
          branch_id,
          status,
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
      }
    );
  });
};

exports.reportFormJsonByServiceID = (req, res) => {
  const { service_id, branch_id, sub_user_id, _token } = req.query;

  let missingFields = [];
  if (
    !service_id ||
    service_id === "" ||
    service_id === undefined ||
    service_id === "undefined"
  )
    missingFields.push("Service ID");
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
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

  const action = "report_case_status";
  // Step 2: Check if the branch is authorized for the action
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the authorization error message
      });
    }
    
    // Step 3: Verify the branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (tokenErr, tokenResult) => {
        if (tokenErr) {
          console.error("Error checking token validity:", tokenErr);
          return res.status(500).json({
            status: false,
            message: tokenErr,
          });
        }

        if (!tokenResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenResult.message, // Return the token validation message
          });
        }

        const newToken = tokenResult.newToken;

        reportCaseStatus.reportFormJsonByServiceID(
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
      }
    );
  });
};

exports.annexureData = (req, res) => {
  const { application_id, db_table, branch_id, sub_user_id, _token } = req.query;

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
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
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

  const action = "report_case_status";
  // Step 2: Check if the branch is authorized for the action
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the authorization error message
      });
    }
    
    // Step 3: Verify the branch token
    BranchCommon.isBranchTokenValid(
      _token,
      sub_user_id || null,
      branch_id,
      (tokenErr, tokenResult) => {
        if (tokenErr) {
          console.error("Error checking token validity:", tokenErr);
          return res.status(500).json({
            status: false,
            message: tokenErr,
          });
        }

        if (!tokenResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenResult.message, // Return the token validation message
          });
        }

        const newToken = tokenResult.newToken;

        reportCaseStatus.annexureData(
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
      }
    );
  });
};

exports.annexureDataByServiceIds = (req, res) => {
  const { service_ids, application_id, sub_user_id, branch_id, _token } = req.query;
  let missingFields = [];
  if (!service_ids || service_ids === "" || service_ids === "undefined") {
    missingFields.push("Service ID");
  }
  const subUserId = (!sub_user_id || sub_user_id === "" || sub_user_id === "undefined") ? null : sub_user_id;
  if (
    !application_id ||
    application_id === "" ||
    application_id === "undefined"
  ) {
    missingFields.push("Application ID");
  }
  if (!branch_id || branch_id === "" || branch_id === "undefined") {
    missingFields.push("Branch ID");
  }
  if (!_token || _token === "" || _token === "undefined") {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    console.error("Missing required fields:", missingFields);
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "report_case_status";
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message,
      });
    }
    BranchCommon.isBranchTokenValid(
      _token,
      subUserId || null,
      branch_id,
      (tokenErr, tokenResult) => {
        if (tokenErr) {
          console.error("Error checking token validity:", tokenErr);
          return res.status(500).json({
            status: false,
            message: tokenErr.message,
          });
        }

        if (!tokenResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenResult.message,
          });
        }

        const newToken = tokenResult.newToken;
        const serviceIds = service_ids.split(",").map((id) => id.trim());
        const annexureResults = [];
        let pendingRequests = serviceIds.length;

        if (pendingRequests === 0) {
          // No service IDs provided, return immediately.
          return res.status(200).json({
            status: true,
            message: "No service IDs to process.",
            results: annexureResults,
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
                      annexureData: null,
                      serviceStatus: true,
                      reportFormJson,
                      message:
                        "An error occurred while fetching annexure data.",
                      error: err,
                    });
                  } else if (!annexureData) {
                    console.warn(
                      `Annexure data not found for service ID ${id}`
                    );
                    annexureResults.push({
                      service_id: id,
                      annexureStatus: false,
                      annexureData: null,
                      serviceStatus: true,
                      reportFormJson,
                      message: "Annexure Data not found.",
                    });
                  } else {
                    annexureResults.push({
                      service_id: id,
                      annexureStatus: true,
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
            return res.status(200).json({
              status: true,
              message: "Applications fetched successfully.",
              results: annexureResults,
              token: newToken,
            });
          }
        }
      }
    );
  });
};
